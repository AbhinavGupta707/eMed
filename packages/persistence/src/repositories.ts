import type { ClinicalTask, DomainEvent, Round } from "@homerounds/contracts";
import type { z } from "zod";

import type {
  ActionAttempt,
  ClinicalFactRecord,
  ClinicalSnapshotRecord,
  CommitActionInput,
  CommitActionResult,
  MeasurementFactRecord,
  RecordFailedActionInput,
  RoundStateChangedEvent
} from "./models";

export type RoundRepository = {
  createRound(round: Round): Promise<void>;
  getRound(roundId: string): Promise<Round | null>;
  updateRoundWithAudit(
    round: Round,
    expectedStateVersion: number,
    event: RoundStateChangedEvent,
    additionalEvents?: readonly DomainEvent[]
  ): Promise<void>;
};

export type MeasurementFactRepository = {
  saveMeasurementFact(record: MeasurementFactRecord): Promise<void>;
  listMeasurementFacts(roundId: string): Promise<MeasurementFactRecord[]>;
};

export type ClinicalSnapshotRepository<TSnapshot, TFact> = {
  saveClinicalSnapshot(
    snapshot: ClinicalSnapshotRecord<TSnapshot>,
    snapshotSchema: z.ZodType<TSnapshot>
  ): Promise<void>;
  getLatestClinicalSnapshot(
    patientId: string,
    snapshotSchema: z.ZodType<TSnapshot>
  ): Promise<ClinicalSnapshotRecord<TSnapshot> | null>;
  saveClinicalFact(fact: ClinicalFactRecord<TFact>, factSchema: z.ZodType<TFact>): Promise<void>;
  listClinicalFacts(
    snapshotId: string,
    factSchema: z.ZodType<TFact>
  ): Promise<Array<ClinicalFactRecord<TFact>>>;
};

export type ClinicalTaskRepository = {
  getTaskByIdempotencyKey(idempotencyKey: string): Promise<ClinicalTask | null>;
  listTasksForRound(roundId: string): Promise<ClinicalTask[]>;
};

export type ActionAttemptRepository = {
  listActionAttempts(idempotencyKey: string): Promise<ActionAttempt[]>;
};

export type AuditEventRepository = {
  appendAuditEvent(event: DomainEvent): Promise<void>;
  listAuditEvents(roundId: string): Promise<DomainEvent[]>;
};

export type ActionUnitOfWork = {
  commitAction(input: CommitActionInput): Promise<CommitActionResult>;
  recordFailedAction(input: RecordFailedActionInput): Promise<ActionAttempt>;
};

export type HomeRoundsRepository<TSnapshot, TFact> = RoundRepository &
  MeasurementFactRepository &
  ClinicalSnapshotRepository<TSnapshot, TFact> &
  ClinicalTaskRepository &
  ActionAttemptRepository &
  AuditEventRepository &
  ActionUnitOfWork;
