import {
  ClinicalTaskSchema,
  DomainEventSchema,
  MeasurementFactSchema,
  RoundStateSchema,
  type ClinicalTask,
  type DomainEvent
} from "@homerounds/contracts";
import { z } from "zod";

export const MeasurementFactRecordSchema = z.object({
  roundId: z.uuid(),
  patientId: z.string().min(1),
  fact: MeasurementFactSchema
});

export type MeasurementFactRecord = z.infer<typeof MeasurementFactRecordSchema>;

export const ClinicalSnapshotRecordSchema = z.object({
  snapshotId: z.uuid(),
  patientId: z.string().min(1),
  snapshotVersion: z.number().int().positive(),
  asOf: z.iso.datetime(),
  document: z.unknown()
});

export type ClinicalSnapshotRecord<TSnapshot> = Omit<
  z.infer<typeof ClinicalSnapshotRecordSchema>,
  "document"
> & { document: TSnapshot };

export const ClinicalFactRecordSchema = z.object({
  snapshotId: z.uuid(),
  factId: z.string().min(1),
  patientId: z.string().min(1),
  kind: z.enum(["condition", "medication", "observation", "care_plan"]),
  observedAt: z.iso.datetime().nullable(),
  fact: z.unknown(),
  provenance: z.record(z.string(), z.unknown())
});

export type ClinicalFactRecord<TFact> = Omit<z.infer<typeof ClinicalFactRecordSchema>, "fact"> & {
  fact: TFact;
};

export const ActionAttemptSchema = z.object({
  id: z.uuid(),
  roundId: z.uuid(),
  idempotencyKey: z.string().min(16).max(200),
  actionType: z.enum(["create_programme_task", "show_emergency_guidance"]),
  outcome: z.enum(["created", "duplicate", "failed"]),
  errorCode: z.string().min(1).nullable(),
  occurredAt: z.iso.datetime(),
  correlationId: z.string().min(1)
});

export type ActionAttempt = z.infer<typeof ActionAttemptSchema>;

const ActionAttemptRequestSchema = ActionAttemptSchema.omit({
  outcome: true,
  errorCode: true
});

const ProgrammeTaskAttemptRequestSchema = ActionAttemptRequestSchema.extend({
  actionType: z.literal("create_programme_task")
});

export const CommitActionInputSchema = z
  .object({
    task: ClinicalTaskSchema,
    attempt: ProgrammeTaskAttemptRequestSchema,
    createdEvent: DomainEventSchema.extend({ type: z.literal("programme_task_created") }),
    duplicateEvent: DomainEventSchema.extend({
      type: z.literal("programme_task_duplicate_suppressed")
    })
  })
  .superRefine((value, context) => {
    if (value.task.roundId !== value.attempt.roundId) {
      context.addIssue({ code: "custom", path: ["attempt", "roundId"], message: "round mismatch" });
    }
    if (value.task.idempotencyKey !== value.attempt.idempotencyKey) {
      context.addIssue({
        code: "custom",
        path: ["attempt", "idempotencyKey"],
        message: "idempotency key mismatch"
      });
    }
    for (const [eventName, event] of [
      ["createdEvent", value.createdEvent],
      ["duplicateEvent", value.duplicateEvent]
    ] as const) {
      if (event.roundId !== value.task.roundId) {
        context.addIssue({
          code: "custom",
          path: [eventName, "roundId"],
          message: "round mismatch"
        });
      }
      if (event.patientId !== value.task.patientId) {
        context.addIssue({
          code: "custom",
          path: [eventName, "patientId"],
          message: "patient mismatch"
        });
      }
      if (event.correlationId !== value.attempt.correlationId) {
        context.addIssue({
          code: "custom",
          path: [eventName, "correlationId"],
          message: "correlation mismatch"
        });
      }
    }
  });

export type CommitActionInput = {
  task: ClinicalTask;
  attempt: z.infer<typeof ProgrammeTaskAttemptRequestSchema>;
  createdEvent: DomainEvent;
  duplicateEvent: DomainEvent;
};

export type CommitActionResult = {
  created: boolean;
  task: ClinicalTask;
  attempt: ActionAttempt;
  auditEvent: DomainEvent;
};

export const RoundStateChangedEventSchema = DomainEventSchema.extend({
  type: z.literal("round_state_changed"),
  payload: z.object({
    before: RoundStateSchema,
    after: RoundStateSchema,
    beforeVersion: z.number().int().nonnegative(),
    afterVersion: z.number().int().positive()
  })
});

export type RoundStateChangedEvent = z.infer<typeof RoundStateChangedEventSchema>;

export const RecordFailedActionInputSchema = z
  .object({
    attempt: ActionAttemptRequestSchema,
    errorCode: z.string().min(1),
    failureEvent: DomainEventSchema.extend({ type: z.literal("action_attempt_failed") })
  })
  .superRefine((value, context) => {
    if (value.failureEvent.roundId !== value.attempt.roundId) {
      context.addIssue({
        code: "custom",
        path: ["failureEvent", "roundId"],
        message: "round mismatch"
      });
    }
    if (value.failureEvent.correlationId !== value.attempt.correlationId) {
      context.addIssue({
        code: "custom",
        path: ["failureEvent", "correlationId"],
        message: "correlation mismatch"
      });
    }
  });

export type RecordFailedActionInput = {
  attempt: z.infer<typeof ActionAttemptRequestSchema>;
  errorCode: string;
  failureEvent: DomainEvent;
};

export class OptimisticConcurrencyError extends Error {
  readonly code = "optimistic_concurrency";

  constructor(
    readonly roundId: string,
    readonly expectedVersion: number
  ) {
    super(`Round ${roundId} is no longer at state version ${expectedVersion}.`);
    this.name = "OptimisticConcurrencyError";
  }
}

export class DuplicateRecordError extends Error {
  readonly code = "duplicate_record";

  constructor(readonly recordId: string) {
    super(`Record ${recordId} already exists.`);
    this.name = "DuplicateRecordError";
  }
}

const TRANSACTIONAL_AUDIT_EVENT_TYPES = new Set([
  "round_state_changed",
  "programme_task_created",
  "programme_task_duplicate_suppressed",
  "action_attempt_failed"
]);

export class ReservedAuditEventError extends Error {
  readonly code = "reserved_audit_event";

  constructor(readonly eventType: string) {
    super(`Audit event ${eventType} must be written through its transactional repository method.`);
    this.name = "ReservedAuditEventError";
  }
}

export function assertStandaloneAuditEvent(event: DomainEvent): void {
  if (TRANSACTIONAL_AUDIT_EVENT_TYPES.has(event.type)) {
    throw new ReservedAuditEventError(event.type);
  }
}
