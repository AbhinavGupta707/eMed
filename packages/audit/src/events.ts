import {
  CaptureQualitySchema,
  DomainEventSchema,
  ProtocolResultSchema,
  RoundStateSchema,
  type DomainEvent,
  type ProtocolResult,
  type RoundState
} from "@homerounds/contracts";
import { z } from "zod";

export const AuditActorSchema = z
  .object({
    kind: z.enum(["patient", "clinician", "system", "voice_provider"]),
    id: z.string().min(1).max(120)
  })
  .strict();

export type AuditActor = z.infer<typeof AuditActorSchema>;

const EventBaseInputSchema = z
  .object({
    eventId: z.uuid(),
    occurredAt: z.iso.datetime(),
    actor: AuditActorSchema,
    patientId: z.string().min(1).max(120),
    roundId: z.uuid(),
    correlationId: z.string().min(1).max(120),
    source: z.enum(["patient_ui", "clinician_ui", "system", "voice_provider"])
  })
  .strict();

export type EventBaseInput = z.infer<typeof EventBaseInputSchema>;

const SafeActionPayloadSchema = z
  .object({
    actionType: z.enum(["create_programme_task", "show_emergency_guidance"]),
    idempotencyKey: z.string().min(16).max(200),
    protocolId: z.string().min(1).max(120),
    protocolVersion: z.string().min(1).max(120),
    matchedRuleIds: z.array(z.string().min(1).max(120)).max(64),
    factIds: z.array(z.string().min(1).max(160)).max(64),
    outcome: ProtocolResultSchema.shape.outcome,
    messageTemplateId: z.string().min(1).max(120)
  })
  .strict();

export const ProgrammeTaskCreatedPayloadSchema = SafeActionPayloadSchema.extend({
  actionType: z.literal("create_programme_task"),
  taskId: z.uuid(),
  confirmationRecorded: z.literal(true),
  authorizationScope: z.literal("programme_task:create")
}).strict();

export const ProgrammeTaskDuplicatePayloadSchema = ProgrammeTaskCreatedPayloadSchema.omit({
  confirmationRecorded: true
}).extend({
  existingTaskId: z.uuid()
});

export const ActionAttemptFailedPayloadSchema = z
  .object({
    actionType: z.enum(["create_programme_task", "show_emergency_guidance"]),
    idempotencyKey: z.string().min(16).max(200),
    errorCode: z.string().min(1).max(120),
    retryable: z.boolean()
  })
  .strict();

export const EmergencyGuidancePresentedPayloadSchema = SafeActionPayloadSchema.extend({
  actionType: z.literal("show_emergency_guidance"),
  confirmationRecorded: z.literal(true),
  authorizationScope: z.literal("emergency_guidance:present")
}).strict();

export const PatientReportConfirmedPayloadSchema = z
  .object({
    reportId: z.uuid(),
    weakness: z.enum(["absent", "mild", "moderate", "severe", "unknown"]),
    palpitations: z.enum(["absent", "intermittent", "current", "unknown"]),
    redFlags: z
      .object({
        chestPain: z.enum(["yes", "no", "unsure"]),
        severeBreathlessness: z.enum(["yes", "no", "unsure"]),
        fainted: z.enum(["yes", "no", "unsure"])
      })
      .strict(),
    inputMode: z.enum(["text", "voice_confirmed"]),
    confirmedAt: z.iso.datetime(),
    freeTextStored: z.literal(false)
  })
  .strict();

export const MeasurementAcceptedPayloadSchema = z
  .object({
    factId: z.uuid(),
    assessmentSessionId: z.uuid(),
    provider: z.enum(["finger_ppg", "vitallens"]),
    unit: z.literal("bpm"),
    qualityStatus: z.literal("pass"),
    rawMediaStored: z.literal(false)
  })
  .strict();

export const CaptureQualityRejectedPayloadSchema = z
  .object({
    assessmentSessionId: z.uuid(),
    provider: z.enum(["finger_ppg", "vitallens"]),
    quality: CaptureQualitySchema.strict().refine(({ status }) => status !== "pass", {
      message: "a rejected capture cannot have passing quality"
    }),
    rawMediaStored: z.literal(false)
  })
  .strict();

export const FollowUpAnsweredPayloadSchema = z
  .object({
    questionId: z.string().min(1).max(80),
    answer: z.enum(["yes", "no", "unsure"]),
    answeredAt: z.iso.datetime()
  })
  .strict();

export const RoundStateChangedAuditEventSchema = DomainEventSchema.extend({
  type: z.literal("round_state_changed"),
  payload: z
    .object({
      before: RoundStateSchema,
      after: RoundStateSchema,
      beforeVersion: z.number().int().nonnegative(),
      afterVersion: z.number().int().positive()
    })
    .strict()
});

function event(
  baseInput: EventBaseInput,
  type: string,
  payload: Record<string, unknown>
): DomainEvent {
  const base = EventBaseInputSchema.parse({
    eventId: baseInput.eventId,
    occurredAt: baseInput.occurredAt,
    actor: baseInput.actor,
    patientId: baseInput.patientId,
    roundId: baseInput.roundId,
    correlationId: baseInput.correlationId,
    source: baseInput.source
  });
  return DomainEventSchema.parse({
    ...base,
    type,
    schemaVersion: 1,
    payload
  });
}

type ActionEventInput = EventBaseInput & {
  readonly idempotencyKey: string;
  readonly taskId: string;
  readonly protocolResult: ProtocolResult;
  readonly messageTemplateId: string;
};

function safeActionPayload(input: ActionEventInput): z.infer<typeof SafeActionPayloadSchema> {
  const protocolResult = ProtocolResultSchema.parse(input.protocolResult);
  return SafeActionPayloadSchema.parse({
    actionType: "create_programme_task",
    idempotencyKey: input.idempotencyKey,
    protocolId: protocolResult.protocolId,
    protocolVersion: protocolResult.protocolVersion,
    matchedRuleIds: [...protocolResult.matchedRuleIds].sort(),
    factIds: [...protocolResult.factIds].sort(),
    outcome: protocolResult.outcome,
    messageTemplateId: input.messageTemplateId
  });
}

export function createProgrammeTaskCreatedEvent(input: ActionEventInput): DomainEvent {
  return event(
    input,
    "programme_task_created",
    ProgrammeTaskCreatedPayloadSchema.parse({
      ...safeActionPayload(input),
      taskId: input.taskId,
      confirmationRecorded: true,
      authorizationScope: "programme_task:create"
    })
  );
}

export function createProgrammeTaskDuplicateEvent(input: ActionEventInput): DomainEvent {
  return event(
    input,
    "programme_task_duplicate_suppressed",
    ProgrammeTaskDuplicatePayloadSchema.parse({
      ...safeActionPayload(input),
      taskId: input.taskId,
      existingTaskId: input.taskId,
      authorizationScope: "programme_task:create"
    })
  );
}

export function createActionFailedEvent(
  input: EventBaseInput & z.infer<typeof ActionAttemptFailedPayloadSchema>
): DomainEvent {
  return event(
    input,
    "action_attempt_failed",
    ActionAttemptFailedPayloadSchema.parse({
      actionType: input.actionType,
      idempotencyKey: input.idempotencyKey,
      errorCode: input.errorCode,
      retryable: input.retryable
    })
  );
}

export function createEmergencyGuidancePresentedEvent(
  input: EventBaseInput & {
    readonly idempotencyKey: string;
    readonly protocolResult: ProtocolResult;
    readonly messageTemplateId: string;
  }
): DomainEvent {
  const protocolResult = ProtocolResultSchema.parse(input.protocolResult);
  return event(
    input,
    "emergency_guidance_presented",
    EmergencyGuidancePresentedPayloadSchema.parse({
      actionType: "show_emergency_guidance",
      idempotencyKey: input.idempotencyKey,
      protocolId: protocolResult.protocolId,
      protocolVersion: protocolResult.protocolVersion,
      matchedRuleIds: [...protocolResult.matchedRuleIds].sort(),
      factIds: [...protocolResult.factIds].sort(),
      outcome: protocolResult.outcome,
      messageTemplateId: input.messageTemplateId,
      confirmationRecorded: true,
      authorizationScope: "emergency_guidance:present"
    })
  );
}

export function createPatientReportConfirmedEvent(
  input: EventBaseInput & z.infer<typeof PatientReportConfirmedPayloadSchema>
): DomainEvent {
  return event(
    input,
    "patient_report_confirmed",
    PatientReportConfirmedPayloadSchema.parse({
      reportId: input.reportId,
      weakness: input.weakness,
      palpitations: input.palpitations,
      redFlags: input.redFlags,
      inputMode: input.inputMode,
      confirmedAt: input.confirmedAt,
      freeTextStored: input.freeTextStored
    })
  );
}

export function createMeasurementAcceptedEvent(
  input: EventBaseInput & z.infer<typeof MeasurementAcceptedPayloadSchema>
): DomainEvent {
  return event(
    input,
    "measurement_accepted",
    MeasurementAcceptedPayloadSchema.parse({
      factId: input.factId,
      assessmentSessionId: input.assessmentSessionId,
      provider: input.provider,
      unit: input.unit,
      qualityStatus: input.qualityStatus,
      rawMediaStored: input.rawMediaStored
    })
  );
}

export function createCaptureQualityRejectedEvent(
  input: EventBaseInput & z.infer<typeof CaptureQualityRejectedPayloadSchema>
): DomainEvent {
  return event(
    input,
    "capture_quality_rejected",
    CaptureQualityRejectedPayloadSchema.parse({
      assessmentSessionId: input.assessmentSessionId,
      provider: input.provider,
      quality: input.quality,
      rawMediaStored: input.rawMediaStored
    })
  );
}

export function createFollowUpAnsweredEvent(
  input: EventBaseInput & z.infer<typeof FollowUpAnsweredPayloadSchema>
): DomainEvent {
  return event(
    input,
    "follow_up_answered",
    FollowUpAnsweredPayloadSchema.parse({
      questionId: input.questionId,
      answer: input.answer,
      answeredAt: input.answeredAt
    })
  );
}

export function createRoundStateChangedEvent(
  input: EventBaseInput & {
    readonly before: RoundState;
    readonly after: RoundState;
    readonly beforeVersion: number;
    readonly afterVersion: number;
  }
): z.infer<typeof RoundStateChangedAuditEventSchema> {
  const before = RoundStateSchema.parse(input.before);
  const after = RoundStateSchema.parse(input.after);
  return RoundStateChangedAuditEventSchema.parse(
    event(input, "round_state_changed", {
      before,
      after,
      beforeVersion: z.number().int().nonnegative().parse(input.beforeVersion),
      afterVersion: z.number().int().positive().parse(input.afterVersion)
    })
  );
}
