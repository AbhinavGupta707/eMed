import {
  ClinicalTaskSchema,
  DomainEventSchema,
  MeasurementFactSchema,
  RoundSchema,
  type ClinicalTask,
  type DomainEvent,
  type Round
} from "@homerounds/contracts";
import { and, asc, desc, eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { z } from "zod";

import {
  ActionAttemptSchema,
  ClinicalFactRecordSchema,
  ClinicalSnapshotRecordSchema,
  CommitActionInputSchema,
  MeasurementFactRecordSchema,
  OptimisticConcurrencyError,
  RecordFailedActionInputSchema,
  RoundStateChangedEventSchema,
  assertStandaloneAuditEvent,
  type ActionAttempt,
  type ClinicalFactRecord,
  type ClinicalSnapshotRecord,
  type CommitActionInput,
  type CommitActionResult,
  type MeasurementFactRecord,
  type RecordFailedActionInput,
  type RoundStateChangedEvent
} from "../models";
import type { HomeRoundsRepository } from "../repositories";
import {
  actionAttempts,
  actionExecutions,
  auditEvents,
  clinicalFacts,
  clinicalSnapshots,
  clinicalTasks,
  measurementFacts,
  rounds
} from "./schema";
import * as schema from "./schema";

type Database = PostgresJsDatabase<typeof schema>;

function roundValues(round: Round): typeof rounds.$inferInsert {
  return {
    id: round.id,
    patientId: round.patientId,
    state: round.state,
    stateVersion: round.stateVersion,
    purpose: round.purpose,
    triggerId: round.triggerId,
    burdenSecondsRemaining: round.burdenSecondsRemaining,
    protocolId: round.protocolId,
    createdAt: round.createdAt,
    updatedAt: round.updatedAt,
    closedAt: round.closedAt
  };
}

function taskValues(task: ClinicalTask): typeof clinicalTasks.$inferInsert {
  return {
    id: task.id,
    roundId: task.roundId,
    patientId: task.patientId,
    idempotencyKey: task.idempotencyKey,
    type: task.type,
    ownerRole: task.ownerRole,
    priority: task.priority,
    reasonKey: task.reasonKey,
    status: task.status,
    serviceWindowLabel: task.serviceWindowLabel,
    protocolId: task.protocolId,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt
  };
}

function auditValues(event: DomainEvent): typeof auditEvents.$inferInsert {
  return {
    eventId: event.eventId,
    type: event.type,
    schemaVersion: event.schemaVersion,
    occurredAt: event.occurredAt,
    actorKind: event.actor.kind,
    actorId: event.actor.id,
    patientId: event.patientId,
    roundId: event.roundId,
    correlationId: event.correlationId,
    source: event.source,
    payload: event.payload
  };
}

function parseRoundRow(row: typeof rounds.$inferSelect): Round {
  return RoundSchema.parse(row);
}

function parseTaskRow(row: typeof clinicalTasks.$inferSelect): ClinicalTask {
  return ClinicalTaskSchema.parse(row);
}

function parseAuditRow(row: typeof auditEvents.$inferSelect): DomainEvent {
  return DomainEventSchema.parse({
    eventId: row.eventId,
    type: row.type,
    schemaVersion: row.schemaVersion,
    occurredAt: row.occurredAt,
    actor: { kind: row.actorKind, id: row.actorId },
    patientId: row.patientId,
    roundId: row.roundId,
    correlationId: row.correlationId,
    source: row.source,
    payload: row.payload
  });
}

export class PostgresHomeRoundsRepository<TSnapshot, TFact> implements HomeRoundsRepository<
  TSnapshot,
  TFact
> {
  constructor(private readonly database: Database) {}

  async createRound(roundInput: Round): Promise<void> {
    const round = RoundSchema.parse(roundInput);
    await this.database.insert(rounds).values(roundValues(round));
  }

  async getRound(roundId: string): Promise<Round | null> {
    const [row] = await this.database.select().from(rounds).where(eq(rounds.id, roundId)).limit(1);
    return row ? parseRoundRow(row) : null;
  }

  async updateRoundWithAudit(
    roundInput: Round,
    expectedStateVersion: number,
    eventInput: RoundStateChangedEvent
  ): Promise<void> {
    const round = RoundSchema.parse(roundInput);
    const event = RoundStateChangedEventSchema.parse(eventInput);
    if (round.stateVersion !== expectedStateVersion + 1) {
      throw new OptimisticConcurrencyError(round.id, expectedStateVersion);
    }
    if (
      event.roundId !== round.id ||
      event.patientId !== round.patientId ||
      event.payload.after !== round.state ||
      event.payload.beforeVersion !== expectedStateVersion ||
      event.payload.afterVersion !== round.stateVersion
    ) {
      throw new Error("Round audit event does not match the requested state change.");
    }
    await this.database.transaction(async (transaction) => {
      const [updated] = await transaction
        .update(rounds)
        .set({
          state: round.state,
          stateVersion: round.stateVersion,
          burdenSecondsRemaining: round.burdenSecondsRemaining,
          updatedAt: round.updatedAt,
          closedAt: round.closedAt
        })
        .where(
          and(
            eq(rounds.id, round.id),
            eq(rounds.stateVersion, expectedStateVersion),
            eq(rounds.state, event.payload.before)
          )
        )
        .returning({ id: rounds.id });
      if (!updated) throw new OptimisticConcurrencyError(round.id, expectedStateVersion);
      await transaction.insert(auditEvents).values(auditValues(event));
    });
  }

  async saveMeasurementFact(recordInput: MeasurementFactRecord): Promise<void> {
    const record = MeasurementFactRecordSchema.parse(recordInput);
    await this.database.insert(measurementFacts).values({
      factId: record.fact.factId,
      roundId: record.roundId,
      patientId: record.patientId,
      assessmentSessionId: record.fact.assessmentSessionId,
      provider: record.fact.provider,
      value: record.fact.value,
      unit: record.fact.unit,
      observedAt: record.fact.observedAt,
      durationMs: record.fact.durationMs,
      algorithmVersion: record.fact.algorithmVersion,
      providerModelVersion: record.fact.providerModelVersion,
      quality: record.fact.quality,
      rawMediaRef: record.fact.rawMediaRef
    });
  }

  async listMeasurementFacts(roundId: string): Promise<MeasurementFactRecord[]> {
    const rows = await this.database
      .select()
      .from(measurementFacts)
      .where(eq(measurementFacts.roundId, roundId))
      .orderBy(asc(measurementFacts.observedAt));
    return rows.map((row) =>
      MeasurementFactRecordSchema.parse({
        roundId: row.roundId,
        patientId: row.patientId,
        fact: MeasurementFactSchema.parse({
          factId: row.factId,
          assessmentSessionId: row.assessmentSessionId,
          provider: row.provider,
          value: row.value,
          unit: row.unit,
          observedAt: row.observedAt,
          durationMs: row.durationMs,
          algorithmVersion: row.algorithmVersion,
          providerModelVersion: row.providerModelVersion,
          quality: row.quality,
          rawMediaRef: row.rawMediaRef
        })
      })
    );
  }

  async saveClinicalSnapshot(
    recordInput: ClinicalSnapshotRecord<TSnapshot>,
    snapshotSchema: z.ZodType<TSnapshot>
  ): Promise<void> {
    const envelope = ClinicalSnapshotRecordSchema.parse(recordInput);
    const document = snapshotSchema.parse(envelope.document);
    await this.database.insert(clinicalSnapshots).values({ ...envelope, document });
  }

  async getLatestClinicalSnapshot(
    patientId: string,
    snapshotSchema: z.ZodType<TSnapshot>
  ): Promise<ClinicalSnapshotRecord<TSnapshot> | null> {
    const [row] = await this.database
      .select()
      .from(clinicalSnapshots)
      .where(eq(clinicalSnapshots.patientId, patientId))
      .orderBy(desc(clinicalSnapshots.snapshotVersion))
      .limit(1);
    if (!row) return null;
    return {
      snapshotId: row.snapshotId,
      patientId: row.patientId,
      snapshotVersion: row.snapshotVersion,
      asOf: row.asOf,
      document: snapshotSchema.parse(row.document)
    };
  }

  async saveClinicalFact(
    recordInput: ClinicalFactRecord<TFact>,
    factSchema: z.ZodType<TFact>
  ): Promise<void> {
    const envelope = ClinicalFactRecordSchema.parse(recordInput);
    await this.database.insert(clinicalFacts).values({
      ...envelope,
      fact: factSchema.parse(envelope.fact)
    });
  }

  async listClinicalFacts(
    snapshotId: string,
    factSchema: z.ZodType<TFact>
  ): Promise<Array<ClinicalFactRecord<TFact>>> {
    const rows = await this.database
      .select()
      .from(clinicalFacts)
      .where(eq(clinicalFacts.snapshotId, snapshotId))
      .orderBy(asc(clinicalFacts.factId));
    return rows.map((row) => {
      const envelope = ClinicalFactRecordSchema.parse(row);
      return { ...envelope, fact: factSchema.parse(envelope.fact) };
    });
  }

  async getTaskByIdempotencyKey(idempotencyKey: string): Promise<ClinicalTask | null> {
    const [row] = await this.database
      .select()
      .from(clinicalTasks)
      .where(eq(clinicalTasks.idempotencyKey, idempotencyKey))
      .limit(1);
    return row ? parseTaskRow(row) : null;
  }

  async listTasksForRound(roundId: string): Promise<ClinicalTask[]> {
    const rows = await this.database
      .select()
      .from(clinicalTasks)
      .where(eq(clinicalTasks.roundId, roundId))
      .orderBy(asc(clinicalTasks.createdAt));
    return rows.map(parseTaskRow);
  }

  async listActionAttempts(idempotencyKey: string): Promise<ActionAttempt[]> {
    const rows = await this.database
      .select()
      .from(actionAttempts)
      .where(eq(actionAttempts.idempotencyKey, idempotencyKey))
      .orderBy(asc(actionAttempts.occurredAt));
    return rows.map((row) => ActionAttemptSchema.parse(row));
  }

  async appendAuditEvent(eventInput: DomainEvent): Promise<void> {
    const event = DomainEventSchema.parse(eventInput);
    assertStandaloneAuditEvent(event);
    await this.database.insert(auditEvents).values(auditValues(event));
  }

  async listAuditEvents(roundId: string): Promise<DomainEvent[]> {
    const rows = await this.database
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.roundId, roundId))
      .orderBy(asc(auditEvents.occurredAt));
    return rows.map(parseAuditRow);
  }

  async commitAction(inputValue: CommitActionInput): Promise<CommitActionResult> {
    const input = CommitActionInputSchema.parse(inputValue);
    return this.database.transaction(async (transaction) => {
      const insertedTasks = await transaction
        .insert(clinicalTasks)
        .values(taskValues(input.task))
        .onConflictDoNothing({ target: clinicalTasks.idempotencyKey })
        .returning();
      const created = insertedTasks.length === 1;
      const taskRow =
        insertedTasks[0] ??
        (
          await transaction
            .select()
            .from(clinicalTasks)
            .where(eq(clinicalTasks.idempotencyKey, input.task.idempotencyKey))
            .limit(1)
        )[0];
      if (!taskRow) throw new Error("Idempotent task lookup failed inside the action transaction.");

      const [executionRow] = await transaction
        .insert(actionExecutions)
        .values({
          id: input.task.id,
          roundId: input.task.roundId,
          taskId: taskRow.id,
          idempotencyKey: input.task.idempotencyKey,
          actionType: input.attempt.actionType,
          status: "succeeded",
          createdAt: input.attempt.occurredAt
        })
        .onConflictDoUpdate({
          target: actionExecutions.idempotencyKey,
          set: { taskId: taskRow.id, status: "succeeded" }
        })
        .returning();
      if (!executionRow) {
        throw new Error("Idempotent action execution lookup failed inside the transaction.");
      }

      const attempt = ActionAttemptSchema.parse({
        ...input.attempt,
        outcome: created ? "created" : "duplicate",
        errorCode: null
      });
      await transaction.insert(actionAttempts).values({
        ...attempt,
        executionId: executionRow.id
      });
      const auditEvent = DomainEventSchema.parse(
        created ? input.createdEvent : input.duplicateEvent
      );
      await transaction.insert(auditEvents).values(auditValues(auditEvent));

      return {
        created,
        task: parseTaskRow(taskRow),
        attempt,
        auditEvent
      };
    });
  }

  async recordFailedAction(inputValue: RecordFailedActionInput): Promise<ActionAttempt> {
    const input = RecordFailedActionInputSchema.parse(inputValue);
    return this.database.transaction(async (transaction) => {
      const insertedExecutions = await transaction
        .insert(actionExecutions)
        .values({
          id: input.attempt.id,
          roundId: input.attempt.roundId,
          taskId: null,
          idempotencyKey: input.attempt.idempotencyKey,
          actionType: input.attempt.actionType,
          status: "failed",
          createdAt: input.attempt.occurredAt
        })
        .onConflictDoNothing({ target: actionExecutions.idempotencyKey })
        .returning();
      const executionRow =
        insertedExecutions[0] ??
        (
          await transaction
            .select()
            .from(actionExecutions)
            .where(eq(actionExecutions.idempotencyKey, input.attempt.idempotencyKey))
            .limit(1)
        )[0];
      if (!executionRow) throw new Error("Failed action execution lookup failed in transaction.");
      const attempt = ActionAttemptSchema.parse({
        ...input.attempt,
        outcome: "failed",
        errorCode: input.errorCode
      });
      await transaction.insert(actionAttempts).values({
        ...attempt,
        executionId: executionRow.id
      });
      await transaction.insert(auditEvents).values(auditValues(input.failureEvent));
      return attempt;
    });
  }
}

export type PostgresRepositoryConnection<TSnapshot, TFact> = {
  repository: PostgresHomeRoundsRepository<TSnapshot, TFact>;
  close: () => Promise<void>;
};

export function connectPostgresRepository<TSnapshot, TFact>(
  databaseUrl: string
): PostgresRepositoryConnection<TSnapshot, TFact> {
  z.string().url().parse(databaseUrl);
  const client = postgres(databaseUrl, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: true
  });
  const database = drizzle(client, { schema });
  return {
    repository: new PostgresHomeRoundsRepository<TSnapshot, TFact>(database),
    close: async () => client.end({ timeout: 5 })
  };
}
