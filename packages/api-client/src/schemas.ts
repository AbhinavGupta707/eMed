import {
  CaptureQualitySchema,
  ClinicalTaskSchema,
  DomainEventSchema,
  MeasurementFactSchema,
  PatientReportSchema,
  ProtocolResultSchema,
  RoundSchema,
  RoundStateSchema
} from "@homerounds/contracts";
import { z } from "zod";

export const ApiErrorCodeSchema = z.enum([
  "invalid_request",
  "unauthorized",
  "forbidden",
  "not_found",
  "conflict",
  "stale_state",
  "rate_limited",
  "unavailable",
  "payload_too_large",
  "unsupported_media_type",
  "method_not_allowed",
  "origin_rejected",
  "internal_error"
]);

export const ApiErrorEnvelopeSchema = z
  .object({
    error: z
      .object({
        code: ApiErrorCodeSchema,
        userMessageKey: z.string().min(1).max(120),
        correlationId: z.string().min(1).max(120),
        issues: z.array(z.string().min(1).max(240)).max(20),
        retryAfterSeconds: z.number().int().positive().max(86_400).nullable()
      })
      .strict()
  })
  .strict();

export type ApiErrorEnvelope = z.infer<typeof ApiErrorEnvelopeSchema>;

export const ApiMetaSchema = z
  .object({
    correlationId: z.string().min(1).max(120),
    runtimeProfile: z.enum(["postgres", "in_memory_demo_fallback", "server_provider_boundary"])
  })
  .strict();

export function ApiSuccessEnvelopeSchema<T extends z.ZodType>(dataSchema: T) {
  return z.object({ data: dataSchema, meta: ApiMetaSchema }).strict();
}

export const CreateRoundRequestSchema = z
  .object({
    patientId: z.string().min(1).max(120),
    triggerId: z.string().min(1).max(160),
    purpose: z.string().min(1).max(240),
    protocolId: z.string().min(1).max(120),
    burdenSeconds: z.number().int().positive().max(3_600)
  })
  .strict();

export const CreateRoundDataSchema = z
  .object({ round: RoundSchema.strict(), created: z.boolean() })
  .strict();

export const RoundDataSchema = z.object({ round: RoundSchema.strict() }).strict();

export const TransitionRoundRequestSchema = z
  .object({
    to: RoundStateSchema,
    expectedStateVersion: z.number().int().nonnegative()
  })
  .strict();

const StrictPatientReportSchema = PatientReportSchema.strict().extend({
  redFlags: PatientReportSchema.shape.redFlags.strict()
});

export const SubmitReportRequestSchema = z
  .object({
    report: StrictPatientReportSchema,
    expectedStateVersion: z.number().int().nonnegative()
  })
  .strict();

export const SubmitReportDataSchema = z
  .object({
    round: RoundSchema.strict(),
    next: z.enum(["assessment_selected", "emergency_closed", "abstained_for_review"]),
    selectedModuleId: z.string().min(1).max(120).nullable(),
    protocolResult: ProtocolResultSchema.strict().nullable()
  })
  .strict();

export const StartAssessmentRequestSchema = z
  .object({ expectedStateVersion: z.number().int().nonnegative() })
  .strict();

export const AssessmentSessionDataSchema = z
  .object({
    round: RoundSchema.strict(),
    assessmentSessionId: z.uuid(),
    provider: z.enum(["finger_ppg", "vitallens"]),
    attestation: z.string().min(32).max(2_000),
    expiresAt: z.iso.datetime()
  })
  .strict();

export const SubmitAssessmentRequestSchema = z
  .object({
    expectedStateVersion: z.number().int().nonnegative(),
    measurement: MeasurementFactSchema.strict().extend({
      quality: MeasurementFactSchema.shape.quality.strict()
    }),
    attestation: z.string().min(32).max(2_000)
  })
  .strict();

export const ProtocolDecisionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("follow_up_required"),
      protocolId: z.string().min(1),
      protocolVersion: z.string().min(1),
      matchedRuleIds: z.array(z.string().min(1)),
      factIds: z.array(z.string().min(1)),
      question: z
        .object({
          id: z.string().min(1),
          promptKey: z.string().min(1),
          answerType: z.literal("yes_no_unsure")
        })
        .strict(),
      explanationKey: z.string().min(1)
    })
    .strict(),
  z.object({ kind: z.literal("result"), result: ProtocolResultSchema.strict() }).strict()
]);

export const SubmitAssessmentDataSchema = z
  .object({
    round: RoundSchema.strict(),
    measurement: MeasurementFactSchema.strict(),
    decision: ProtocolDecisionSchema
  })
  .strict();

export const SubmitCaptureQualityRequestSchema = z
  .object({
    expectedStateVersion: z.number().int().nonnegative(),
    assessmentSessionId: z.uuid(),
    provider: z.enum(["finger_ppg", "vitallens"]),
    attestation: z.string().min(32).max(2_000),
    quality: CaptureQualitySchema.strict().refine(({ status }) => status !== "pass", {
      message: "capture quality rejection cannot contain a passing result"
    })
  })
  .strict();

export const SubmitCaptureQualityDataSchema = z.discriminatedUnion("next", [
  z
    .object({
      next: z.literal("retry"),
      round: RoundSchema.strict(),
      protocolResult: z.null()
    })
    .strict(),
  z
    .object({
      next: z.literal("abstained_for_review"),
      round: RoundSchema.strict(),
      protocolResult: ProtocolResultSchema.strict()
    })
    .strict()
]);

export const SubmitFollowUpRequestSchema = z
  .object({
    expectedStateVersion: z.number().int().nonnegative(),
    questionId: z.string().min(1).max(80),
    answer: z.enum(["yes", "no", "unsure"]),
    answeredAt: z.iso.datetime()
  })
  .strict();

export const SubmitFollowUpDataSchema = z
  .object({
    round: RoundSchema.strict(),
    protocolResult: ProtocolResultSchema.strict()
  })
  .strict();

export const ExecuteActionRequestSchema = z
  .object({
    expectedStateVersion: z.number().int().nonnegative(),
    protocolResult: ProtocolResultSchema.strict(),
    confirmation: z
      .object({
        confirmed: z.literal(true),
        confirmedAt: z.iso.datetime()
      })
      .strict()
  })
  .strict();

const PatientMessageSchema = z
  .object({
    templateId: z.string().min(1).max(120),
    heading: z.string().min(1).max(120),
    body: z.string().min(1).max(360),
    serviceWindowLabel: z.string().min(1).max(180).nullable(),
    demoOnly: z.literal(true),
    diagnosticClaim: z.literal(false)
  })
  .strict();

export const ExecuteActionDataSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("programme_task"),
      created: z.boolean(),
      task: ClinicalTaskSchema.strict(),
      message: PatientMessageSchema
    })
    .strict(),
  z
    .object({
      kind: z.literal("emergency_guidance"),
      message: PatientMessageSchema
    })
    .strict()
]);

export const QueueDataSchema = z
  .object({
    tasks: z.array(ClinicalTaskSchema.strict()).max(500),
    scope: z.literal("requested_rounds")
  })
  .strict();

export const ClinicianNoteSchema = z
  .object({
    text: z.string().trim().max(2_000),
    version: z.number().int().positive(),
    updatedAt: z.iso.datetime(),
    actorId: z.string().min(1).max(120),
    auditReference: z.uuid()
  })
  .strict();

export const ClinicianTaskDetailDataSchema = z
  .object({
    task: ClinicalTaskSchema.strict(),
    round: RoundSchema.strict(),
    report: StrictPatientReportSchema.nullable(),
    measurement: MeasurementFactSchema.strict().nullable(),
    captureQuality: CaptureQualitySchema.strict().nullable(),
    protocolResult: ProtocolResultSchema.strict().nullable(),
    timeline: z.array(DomainEventSchema.strict()).max(500),
    note: ClinicianNoteSchema.nullable(),
    capabilities: z
      .object({
        note: z.literal(true),
        acknowledge: z.literal(true),
        contact: z.literal(true),
        complete: z.literal(true)
      })
      .strict()
  })
  .strict();

export const ClinicianMutationKindSchema = z.enum([
  "save_note",
  "acknowledge",
  "record_contact",
  "complete"
]);

export const ClinicianMutationRequestSchema = z
  .object({
    kind: ClinicianMutationKindSchema,
    expectedTaskUpdatedAt: z.iso.datetime(),
    operationKey: z.string().min(16).max(200),
    note: z.string().trim().max(2_000).nullable()
  })
  .strict()
  .superRefine((input, context) => {
    if (input.kind === "save_note" && input.note === null) {
      context.addIssue({
        code: "custom",
        path: ["note"],
        message: "save_note requires note content"
      });
    }
    if (input.kind !== "save_note" && input.note !== null) {
      context.addIssue({
        code: "custom",
        path: ["note"],
        message: "only save_note accepts note content"
      });
    }
  });

export const ClinicianMutationReceiptSchema = z
  .object({
    status: z.literal("persisted"),
    kind: ClinicianMutationKindSchema,
    task: ClinicalTaskSchema.strict(),
    event: DomainEventSchema.strict(),
    persistedAt: z.iso.datetime(),
    operationKey: z.string().min(16).max(200),
    duplicateSuppressed: z.boolean(),
    note: ClinicianNoteSchema.nullable()
  })
  .strict();

export const ElevenLabsCredentialDataSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("available"),
      token: z.string().min(1).max(8_000),
      agentId: z.string().min(1).max(200),
      expiresAt: z.iso.datetime(),
      maxSessionSeconds: z.number().int().min(15).max(300)
    })
    .strict(),
  z
    .object({
      status: z.literal("unavailable"),
      reason: z.enum(["disabled", "missing_configuration", "quota", "network", "provider"])
    })
    .strict()
]);

export type CreateRoundRequest = z.infer<typeof CreateRoundRequestSchema>;
export type TransitionRoundRequest = z.infer<typeof TransitionRoundRequestSchema>;
export type SubmitReportRequest = z.infer<typeof SubmitReportRequestSchema>;
export type StartAssessmentRequest = z.infer<typeof StartAssessmentRequestSchema>;
export type SubmitAssessmentRequest = z.infer<typeof SubmitAssessmentRequestSchema>;
export type SubmitCaptureQualityRequest = z.infer<typeof SubmitCaptureQualityRequestSchema>;
export type SubmitFollowUpRequest = z.infer<typeof SubmitFollowUpRequestSchema>;
export type ExecuteActionRequest = z.infer<typeof ExecuteActionRequestSchema>;
export type ClinicianMutationRequest = z.infer<typeof ClinicianMutationRequestSchema>;
