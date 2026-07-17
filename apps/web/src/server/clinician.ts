import {
  ClinicianMutationReceiptSchema,
  ClinicianMutationRequestSchema,
  ClinicianNoteSchema,
  ClinicianTaskDetailDataSchema,
  type ClinicianMutationRequest
} from "@homerounds/api-client";
import {
  CaptureQualityRejectedPayloadSchema,
  ClinicianMutationPayloadSchema,
  PatientReportConfirmedPayloadSchema,
  ProgrammeTaskCreatedPayloadSchema,
  ProgrammeTaskDuplicatePayloadSchema,
  createClinicianMutationEvent,
  createRoundStateChangedEvent
} from "@homerounds/audit";
import {
  PatientReportSchema,
  ProtocolResultSchema,
  type ClinicalTask,
  type DomainEvent,
  type Round
} from "@homerounds/contracts";
import { reduceRoundState } from "@homerounds/domain";
import {
  OptimisticConcurrencyError,
  type RoundStateChangedEvent,
  TaskOptimisticConcurrencyError,
  type HomeRoundsRepository
} from "@homerounds/persistence";

import { deterministicUuid } from "./crypto";

export type ClinicianServiceErrorCode = "task_not_found" | "round_not_found" | "stale" | "conflict";

export class ClinicianServiceError extends Error {
  constructor(
    readonly code: ClinicianServiceErrorCode,
    readonly retryable: boolean
  ) {
    super(`Clinician service rejected the request: ${code}`);
    this.name = "ClinicianServiceError";
  }
}

type Dependencies<TSnapshot, TFact> = {
  repository: HomeRoundsRepository<TSnapshot, TFact>;
  now?: () => string;
};

function latestBy<T>(values: readonly T[], select: (value: T) => string): T | undefined {
  return [...values].sort((left, right) => select(right).localeCompare(select(left)))[0];
}

function monotonicTimestamp(now: string, previous: string): string {
  return new Date(Math.max(Date.parse(now), Date.parse(previous) + 1)).toISOString();
}

function reportFromEvents(roundId: string, events: readonly DomainEvent[]) {
  const entries = events
    .filter(({ type }) => type === "patient_report_confirmed")
    .map((event) => ({
      occurredAt: event.occurredAt,
      payload: PatientReportConfirmedPayloadSchema.safeParse(event.payload)
    }))
    .filter((entry) => entry.payload.success);
  const latest = latestBy(entries, ({ occurredAt }) => occurredAt);
  if (!latest?.payload.success) return null;
  const report = latest.payload.data;
  return PatientReportSchema.strict().parse({
    reportId: report.reportId,
    roundId,
    weakness: report.weakness,
    palpitations: report.palpitations,
    redFlags: report.redFlags,
    inputMode: report.inputMode,
    confirmedAt: report.confirmedAt
  });
}

function protocolResultFromEvents(events: readonly DomainEvent[]) {
  const entries = events
    .filter(
      ({ type }) =>
        type === "programme_task_created" || type === "programme_task_duplicate_suppressed"
    )
    .map((event) => {
      const payload =
        event.type === "programme_task_created"
          ? ProgrammeTaskCreatedPayloadSchema.safeParse(event.payload)
          : ProgrammeTaskDuplicatePayloadSchema.safeParse(event.payload);
      return { occurredAt: event.occurredAt, payload };
    })
    .filter((entry) => entry.payload.success);
  const latest = latestBy(entries, ({ occurredAt }) => occurredAt);
  if (!latest?.payload.success) return null;
  const payload = latest.payload.data;
  return ProtocolResultSchema.strict().parse({
    protocolId: payload.protocolId,
    protocolVersion: payload.protocolVersion,
    matchedRuleIds: payload.matchedRuleIds,
    factIds: payload.factIds,
    outcome: payload.outcome,
    allowedActions: payload.allowedActions,
    missingFactKeys: payload.missingFactKeys,
    explanationKey: payload.explanationKey
  });
}

function latestNote(events: readonly DomainEvent[]) {
  const entries = events
    .filter(({ type }) => type === "clinician_save_note")
    .map((event) => ({ event, payload: ClinicianMutationPayloadSchema.safeParse(event.payload) }))
    .filter((entry) => entry.payload.success && entry.payload.data.noteText !== null);
  const latest = latestBy(entries, ({ event }) => event.occurredAt);
  if (!latest?.payload.success || latest.payload.data.noteText === null) return null;
  return ClinicianNoteSchema.parse({
    text: latest.payload.data.noteText,
    version: latest.payload.data.noteVersion,
    updatedAt: latest.event.occurredAt,
    actorId: latest.event.actor.id,
    auditReference: latest.event.eventId
  });
}

export class ClinicianService<TSnapshot, TFact> {
  readonly #repository: HomeRoundsRepository<TSnapshot, TFact>;
  readonly #now: () => string;

  constructor(dependencies: Dependencies<TSnapshot, TFact>) {
    this.#repository = dependencies.repository;
    this.#now = dependencies.now ?? (() => new Date().toISOString());
  }

  async detail(taskId: string) {
    const task = await this.#repository.getTask(taskId);
    if (!task) throw new ClinicianServiceError("task_not_found", false);
    const round = await this.#repository.getRound(task.roundId);
    if (!round) throw new ClinicianServiceError("round_not_found", false);
    const [timeline, measurements] = await Promise.all([
      this.#repository.listAuditEvents(round.id),
      this.#repository.listMeasurementFacts(round.id)
    ]);
    const measurement = latestBy(measurements, ({ fact }) => fact.observedAt)?.fact ?? null;
    const qualityEntries = timeline
      .filter(({ type }) => type === "capture_quality_rejected")
      .map((event) => ({
        event,
        payload: CaptureQualityRejectedPayloadSchema.safeParse(event.payload)
      }))
      .filter((entry) => entry.payload.success);
    const qualityEntry = latestBy(qualityEntries, ({ event }) => event.occurredAt);
    const captureQuality = qualityEntry?.payload.success ? qualityEntry.payload.data.quality : null;
    return ClinicianTaskDetailDataSchema.parse({
      task,
      round,
      report: reportFromEvents(round.id, timeline),
      measurement,
      captureQuality,
      protocolResult: protocolResultFromEvents(timeline),
      timeline,
      note: latestNote(timeline),
      capabilities: { note: true, acknowledge: true, contact: true, complete: true }
    });
  }

  async mutate(
    inputValue: ClinicianMutationRequest & {
      taskId: string;
      actorId: string;
      correlationId: string;
    }
  ) {
    const request = ClinicianMutationRequestSchema.parse({
      kind: inputValue.kind,
      expectedTaskUpdatedAt: inputValue.expectedTaskUpdatedAt,
      operationKey: inputValue.operationKey,
      note: inputValue.note
    });
    const task = await this.#repository.getTask(inputValue.taskId);
    if (!task) throw new ClinicianServiceError("task_not_found", false);
    const round = await this.#repository.getRound(task.roundId);
    if (!round) throw new ClinicianServiceError("round_not_found", false);
    const timeline = await this.#repository.listAuditEvents(round.id);
    const eventId = deterministicUuid("clinician-operation", request.operationKey);
    const existingEvent = timeline.find(({ eventId: candidate }) => candidate === eventId);
    if (existingEvent) {
      const payload = ClinicianMutationPayloadSchema.safeParse(existingEvent.payload);
      if (
        !payload.success ||
        payload.data.kind !== request.kind ||
        payload.data.taskId !== task.id
      ) {
        throw new ClinicianServiceError("conflict", false);
      }
      return ClinicianMutationReceiptSchema.parse({
        status: "persisted",
        kind: request.kind,
        task,
        event: existingEvent,
        persistedAt: existingEvent.occurredAt,
        operationKey: request.operationKey,
        duplicateSuppressed: true,
        note: latestNote(timeline)
      });
    }
    if (task.updatedAt !== request.expectedTaskUpdatedAt) {
      throw new ClinicianServiceError("stale", true);
    }

    let nextStatus: ClinicalTask["status"] = task.status;
    if (request.kind === "acknowledge") {
      if (task.status !== "open") throw new ClinicianServiceError("conflict", false);
      nextStatus = "acknowledged";
    }
    if (request.kind === "complete") {
      if (task.status === "completed") throw new ClinicianServiceError("conflict", false);
      nextStatus = "completed";
    }
    const persistedAt = monotonicTimestamp(this.#now(), task.updatedAt);
    const nextTask = {
      ...task,
      status: nextStatus,
      updatedAt: persistedAt
    } satisfies ClinicalTask;
    const currentNote = latestNote(timeline);
    const noteVersion = request.kind === "save_note" ? (currentNote?.version ?? 0) + 1 : null;
    const event = createClinicianMutationEvent({
      eventId,
      occurredAt: persistedAt,
      actor: { kind: "clinician", id: inputValue.actorId },
      patientId: task.patientId,
      roundId: task.roundId,
      correlationId: inputValue.correlationId,
      source: "clinician_ui",
      kind: request.kind,
      taskId: task.id,
      operationKey: request.operationKey,
      beforeStatus: task.status,
      afterStatus: nextStatus,
      noteText: request.note,
      noteVersion,
      previousNoteVersion: request.kind === "save_note" ? (currentNote?.version ?? 0) : null,
      syntheticDataOnly: true
    });

    let roundUpdate:
      { round: Round; expectedStateVersion: number; event: RoundStateChangedEvent } | undefined;
    if (request.kind === "complete" && round.state === "awaiting_clinician") {
      const reduced = reduceRoundState(round, {
        to: "outcome_ready",
        expectedStateVersion: round.stateVersion,
        occurredAt: persistedAt
      });
      if (!reduced.ok) throw new ClinicianServiceError("conflict", false);
      roundUpdate = {
        round: reduced.round,
        expectedStateVersion: round.stateVersion,
        event: createRoundStateChangedEvent({
          eventId: deterministicUuid("clinician-round-complete", request.operationKey),
          occurredAt: persistedAt,
          actor: { kind: "clinician", id: inputValue.actorId },
          patientId: round.patientId,
          roundId: round.id,
          correlationId: inputValue.correlationId,
          source: "clinician_ui",
          before: round.state,
          after: reduced.round.state,
          beforeVersion: round.stateVersion,
          afterVersion: reduced.round.stateVersion
        })
      };
    }

    try {
      const committed = await this.#repository.commitClinicianMutation({
        task: nextTask,
        expectedTaskUpdatedAt: request.expectedTaskUpdatedAt,
        event,
        ...(roundUpdate
          ? {
              roundUpdate
            }
          : {})
      });
      const nextTimeline = committed.created ? [...timeline, committed.event] : timeline;
      return ClinicianMutationReceiptSchema.parse({
        status: "persisted",
        kind: request.kind,
        task: committed.task,
        event: committed.event,
        persistedAt: committed.event.occurredAt,
        operationKey: request.operationKey,
        duplicateSuppressed: !committed.created,
        note: latestNote(nextTimeline)
      });
    } catch (error: unknown) {
      if (
        error instanceof TaskOptimisticConcurrencyError ||
        error instanceof OptimisticConcurrencyError
      ) {
        throw new ClinicianServiceError("stale", true);
      }
      throw error;
    }
  }
}
