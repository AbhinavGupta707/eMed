import {
  ClinicalTaskSchema,
  DomainEventSchema,
  RoundSchema,
  type ClinicalTask,
  type DomainEvent,
  type Round
} from "@homerounds/contracts";
import type { z } from "zod";

import {
  ActionAttemptSchema,
  ClinicalFactRecordSchema,
  ClinicalSnapshotRecordSchema,
  ClinicianMutationCommitInput,
  ClinicianMutationCommitResult,
  CommitActionInputSchema,
  DuplicateRecordError,
  MeasurementFactRecordSchema,
  OptimisticConcurrencyError,
  RecordFailedActionInputSchema,
  RoundStateChangedEventSchema,
  TaskOptimisticConcurrencyError,
  assertStandaloneAuditEvent,
  type ActionAttempt,
  type ClinicalFactRecord,
  type ClinicalSnapshotRecord,
  type CommitActionInput,
  type CommitActionResult,
  type MeasurementFactRecord,
  type RecordFailedActionInput,
  type RoundStateChangedEvent
} from "./models";
import type { HomeRoundsRepository } from "./repositories";

type InMemoryRepositoryOptions = {
  /** Test-only failure injection at the final transaction boundary. */
  beforeActionCommit?: () => void;
};

export class InMemoryHomeRoundsRepository<TSnapshot, TFact> implements HomeRoundsRepository<
  TSnapshot,
  TFact
> {
  private rounds = new Map<string, Round>();
  private measurementFacts = new Map<string, MeasurementFactRecord>();
  private snapshots = new Map<string, ClinicalSnapshotRecord<TSnapshot>>();
  private clinicalFacts = new Map<string, ClinicalFactRecord<TFact>>();
  private tasks = new Map<string, ClinicalTask>();
  private taskIdByIdempotencyKey = new Map<string, string>();
  private actionAttempts = new Map<string, ActionAttempt>();
  private auditEvents = new Map<string, DomainEvent>();

  constructor(private readonly options: InMemoryRepositoryOptions = {}) {}

  async createRound(roundInput: Round): Promise<void> {
    const round = RoundSchema.parse(roundInput);
    if (this.rounds.has(round.id)) throw new DuplicateRecordError(round.id);
    this.rounds.set(round.id, structuredClone(round));
  }

  async getRound(roundId: string): Promise<Round | null> {
    const round = this.rounds.get(roundId);
    return round ? structuredClone(round) : null;
  }

  async updateRoundWithAudit(
    roundInput: Round,
    expectedStateVersion: number,
    eventInput: RoundStateChangedEvent,
    additionalEventInputs: readonly DomainEvent[] = []
  ): Promise<void> {
    const round = RoundSchema.parse(roundInput);
    const event = RoundStateChangedEventSchema.parse(eventInput);
    const additionalEvents = additionalEventInputs.map((additionalEvent) => {
      const parsed = DomainEventSchema.parse(additionalEvent);
      assertStandaloneAuditEvent(parsed);
      if (parsed.roundId !== round.id || parsed.patientId !== round.patientId) {
        throw new Error("Additional audit event does not match the persisted round state change.");
      }
      return parsed;
    });
    const current = this.rounds.get(round.id);
    if (!current || current.stateVersion !== expectedStateVersion) {
      throw new OptimisticConcurrencyError(round.id, expectedStateVersion);
    }
    if (round.stateVersion !== expectedStateVersion + 1) {
      throw new OptimisticConcurrencyError(round.id, expectedStateVersion);
    }
    if (
      event.roundId !== round.id ||
      event.patientId !== round.patientId ||
      event.payload.before !== current.state ||
      event.payload.after !== round.state ||
      event.payload.beforeVersion !== current.stateVersion ||
      event.payload.afterVersion !== round.stateVersion
    ) {
      throw new Error("Round audit event does not match the persisted state change.");
    }
    for (const auditEvent of [event, ...additionalEvents]) {
      if (this.auditEvents.has(auditEvent.eventId))
        throw new DuplicateRecordError(auditEvent.eventId);
    }
    this.rounds.set(round.id, structuredClone(round));
    this.auditEvents.set(event.eventId, structuredClone(event));
    for (const additionalEvent of additionalEvents) {
      this.auditEvents.set(additionalEvent.eventId, structuredClone(additionalEvent));
    }
  }

  async saveMeasurementFact(recordInput: MeasurementFactRecord): Promise<void> {
    const record = MeasurementFactRecordSchema.parse(recordInput);
    if (this.measurementFacts.has(record.fact.factId)) {
      throw new DuplicateRecordError(record.fact.factId);
    }
    this.measurementFacts.set(record.fact.factId, structuredClone(record));
  }

  async listMeasurementFacts(roundId: string): Promise<MeasurementFactRecord[]> {
    return [...this.measurementFacts.values()]
      .filter((record) => record.roundId === roundId)
      .sort((left, right) => left.fact.observedAt.localeCompare(right.fact.observedAt))
      .map((record) => structuredClone(record));
  }

  async saveClinicalSnapshot(
    recordInput: ClinicalSnapshotRecord<TSnapshot>,
    snapshotSchema: z.ZodType<TSnapshot>
  ): Promise<void> {
    const envelope = ClinicalSnapshotRecordSchema.parse(recordInput);
    const record = { ...envelope, document: snapshotSchema.parse(envelope.document) };
    if (this.snapshots.has(record.snapshotId)) throw new DuplicateRecordError(record.snapshotId);
    this.snapshots.set(record.snapshotId, structuredClone(record));
  }

  async getLatestClinicalSnapshot(
    patientId: string,
    snapshotSchema: z.ZodType<TSnapshot>
  ): Promise<ClinicalSnapshotRecord<TSnapshot> | null> {
    const record = [...this.snapshots.values()]
      .filter((candidate) => candidate.patientId === patientId)
      .sort((left, right) => right.snapshotVersion - left.snapshotVersion)[0];
    if (!record) return null;
    return { ...structuredClone(record), document: snapshotSchema.parse(record.document) };
  }

  async saveClinicalFact(
    recordInput: ClinicalFactRecord<TFact>,
    factSchema: z.ZodType<TFact>
  ): Promise<void> {
    const envelope = ClinicalFactRecordSchema.parse(recordInput);
    const fact = factSchema.parse(envelope.fact);
    const key = `${envelope.snapshotId}:${envelope.factId}`;
    if (!this.snapshots.has(envelope.snapshotId)) {
      throw new Error(`Clinical snapshot ${envelope.snapshotId} does not exist.`);
    }
    if (this.clinicalFacts.has(key)) throw new DuplicateRecordError(key);
    this.clinicalFacts.set(key, structuredClone({ ...envelope, fact }));
  }

  async listClinicalFacts(
    snapshotId: string,
    factSchema: z.ZodType<TFact>
  ): Promise<Array<ClinicalFactRecord<TFact>>> {
    return [...this.clinicalFacts.values()]
      .filter((record) => record.snapshotId === snapshotId)
      .sort((left, right) => left.factId.localeCompare(right.factId))
      .map((record) => ({ ...structuredClone(record), fact: factSchema.parse(record.fact) }));
  }

  async getTaskByIdempotencyKey(idempotencyKey: string): Promise<ClinicalTask | null> {
    const taskId = this.taskIdByIdempotencyKey.get(idempotencyKey);
    const task = taskId ? this.tasks.get(taskId) : undefined;
    return task ? structuredClone(task) : null;
  }

  async getTask(taskId: string): Promise<ClinicalTask | null> {
    const task = this.tasks.get(taskId);
    return task ? structuredClone(task) : null;
  }

  async listTasksForRound(roundId: string): Promise<ClinicalTask[]> {
    return [...this.tasks.values()]
      .filter((task) => task.roundId === roundId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map((task) => structuredClone(task));
  }

  async listActionAttempts(idempotencyKey: string): Promise<ActionAttempt[]> {
    return [...this.actionAttempts.values()]
      .filter((attempt) => attempt.idempotencyKey === idempotencyKey)
      .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
      .map((attempt) => structuredClone(attempt));
  }

  async appendAuditEvent(eventInput: DomainEvent): Promise<void> {
    const event = DomainEventSchema.parse(eventInput);
    assertStandaloneAuditEvent(event);
    if (this.auditEvents.has(event.eventId)) throw new DuplicateRecordError(event.eventId);
    this.auditEvents.set(event.eventId, structuredClone(event));
  }

  async listAuditEvents(roundId: string): Promise<DomainEvent[]> {
    return [...this.auditEvents.values()]
      .filter((event) => event.roundId === roundId)
      .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
      .map((event) => structuredClone(event));
  }

  async commitAction(inputValue: CommitActionInput): Promise<CommitActionResult> {
    const input = CommitActionInputSchema.parse(inputValue);
    const snapshot = {
      tasks: new Map(this.tasks),
      taskIdByIdempotencyKey: new Map(this.taskIdByIdempotencyKey),
      actionAttempts: new Map(this.actionAttempts),
      auditEvents: new Map(this.auditEvents)
    };

    try {
      if (this.actionAttempts.has(input.attempt.id)) {
        throw new DuplicateRecordError(input.attempt.id);
      }

      const existingTaskId = this.taskIdByIdempotencyKey.get(input.task.idempotencyKey);
      const existingTask = existingTaskId ? this.tasks.get(existingTaskId) : undefined;
      const created = !existingTask;
      const task = existingTask ?? ClinicalTaskSchema.parse(input.task);
      if (created) {
        this.tasks.set(task.id, structuredClone(task));
        this.taskIdByIdempotencyKey.set(task.idempotencyKey, task.id);
      }

      const attempt = ActionAttemptSchema.parse({
        ...input.attempt,
        outcome: created ? "created" : "duplicate",
        errorCode: null
      });
      const auditEvent = DomainEventSchema.parse(
        created ? input.createdEvent : input.duplicateEvent
      );
      if (this.auditEvents.has(auditEvent.eventId)) {
        throw new DuplicateRecordError(auditEvent.eventId);
      }
      this.actionAttempts.set(attempt.id, structuredClone(attempt));
      this.auditEvents.set(auditEvent.eventId, structuredClone(auditEvent));

      this.options.beforeActionCommit?.();
      return {
        created,
        task: structuredClone(task),
        attempt: structuredClone(attempt),
        auditEvent: structuredClone(auditEvent)
      };
    } catch (error) {
      this.tasks = snapshot.tasks;
      this.taskIdByIdempotencyKey = snapshot.taskIdByIdempotencyKey;
      this.actionAttempts = snapshot.actionAttempts;
      this.auditEvents = snapshot.auditEvents;
      throw error;
    }
  }

  async recordFailedAction(inputValue: RecordFailedActionInput): Promise<ActionAttempt> {
    const input = RecordFailedActionInputSchema.parse(inputValue);
    const snapshot = {
      actionAttempts: new Map(this.actionAttempts),
      auditEvents: new Map(this.auditEvents)
    };
    try {
      if (this.actionAttempts.has(input.attempt.id)) {
        throw new DuplicateRecordError(input.attempt.id);
      }
      const attempt = ActionAttemptSchema.parse({
        ...input.attempt,
        outcome: "failed",
        errorCode: input.errorCode
      });
      const event = DomainEventSchema.parse(input.failureEvent);
      if (this.auditEvents.has(event.eventId)) throw new DuplicateRecordError(event.eventId);
      this.actionAttempts.set(attempt.id, structuredClone(attempt));
      this.auditEvents.set(event.eventId, structuredClone(event));
      this.options.beforeActionCommit?.();
      return structuredClone(attempt);
    } catch (error) {
      this.actionAttempts = snapshot.actionAttempts;
      this.auditEvents = snapshot.auditEvents;
      throw error;
    }
  }

  async commitClinicianMutation(
    input: ClinicianMutationCommitInput
  ): Promise<ClinicianMutationCommitResult> {
    const task = ClinicalTaskSchema.parse(input.task);
    const event = DomainEventSchema.parse(input.event);
    assertStandaloneAuditEvent(event);
    if (event.roundId !== task.roundId || event.patientId !== task.patientId) {
      throw new Error("Clinician mutation event does not match the task.");
    }
    const existingEvent = this.auditEvents.get(event.eventId);
    if (existingEvent) {
      const existingTask = this.tasks.get(task.id);
      if (!existingTask) throw new Error("Idempotent clinician mutation task is missing.");
      return {
        created: false,
        task: structuredClone(existingTask),
        event: structuredClone(existingEvent)
      };
    }
    const currentTask = this.tasks.get(task.id);
    if (!currentTask || currentTask.updatedAt !== input.expectedTaskUpdatedAt) {
      throw new TaskOptimisticConcurrencyError(task.id, input.expectedTaskUpdatedAt);
    }

    const roundUpdate = input.roundUpdate;
    if (roundUpdate) {
      const round = RoundSchema.parse(roundUpdate.round);
      const roundEvent = RoundStateChangedEventSchema.parse(roundUpdate.event);
      const currentRound = this.rounds.get(round.id);
      if (
        !currentRound ||
        currentRound.stateVersion !== roundUpdate.expectedStateVersion ||
        round.stateVersion !== roundUpdate.expectedStateVersion + 1 ||
        roundEvent.roundId !== round.id ||
        roundEvent.patientId !== round.patientId
      ) {
        throw new OptimisticConcurrencyError(round.id, roundUpdate.expectedStateVersion);
      }
      if (this.auditEvents.has(roundEvent.eventId)) {
        throw new DuplicateRecordError(roundEvent.eventId);
      }
      this.rounds.set(round.id, structuredClone(round));
      this.auditEvents.set(roundEvent.eventId, structuredClone(roundEvent));
    }

    this.tasks.set(task.id, structuredClone(task));
    this.auditEvents.set(event.eventId, structuredClone(event));
    return { created: true, task: structuredClone(task), event: structuredClone(event) };
  }
}
