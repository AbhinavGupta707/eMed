import { z } from "zod";

export const CompanionTaskKindSchema = z.enum([
  "finger_pulse",
  "face_pulse",
  "voice_signal",
  "medication_label"
]);

export type CompanionTaskKind = z.infer<typeof CompanionTaskKindSchema>;

export const CompanionOpaqueIdSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9._:-]+$/);

export const CompanionPairingTokenSchema = z.string().regex(/^cpt1_[A-Za-z0-9_-]{43}$/);

export const CompanionSessionTokenSchema = z.string().regex(/^cst1_[A-Za-z0-9_-]{43}$/);

export const CompanionSecureHashSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export const CompanionConsentRequirementSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }).strict(),
  z
    .object({
      kind: z.literal("explicit_local_capture"),
      version: z.string().min(1).max(120)
    })
    .strict(),
  z
    .object({
      kind: z.literal("explicit_third_party_processing"),
      version: z.string().min(1).max(120)
    })
    .strict()
]);

export type CompanionConsentRequirement = z.infer<typeof CompanionConsentRequirementSchema>;

export const CompanionTaskBindingSchema = z
  .object({
    taskId: CompanionOpaqueIdSchema,
    kind: CompanionTaskKindSchema,
    taskVersion: z.number().int().positive()
  })
  .strict();

export type CompanionTaskBinding = z.infer<typeof CompanionTaskBindingSchema>;

export const CompanionTaskPhaseSchema = z.enum([
  "ready",
  "permission",
  "guidance",
  "in_progress",
  "retry",
  "unavailable",
  "completed",
  "desktop_acknowledged"
]);

export type CompanionTaskPhase = z.infer<typeof CompanionTaskPhaseSchema>;

export const CompanionConsentStateSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("not_required") }).strict(),
  z.object({ status: z.literal("pending") }).strict(),
  z
    .object({
      status: z.literal("granted"),
      version: z.string().min(1).max(120),
      grantedAt: z.iso.datetime()
    })
    .strict()
]);

export type CompanionConsentState = z.infer<typeof CompanionConsentStateSchema>;

export const CompanionStatusUpdateRequestSchema = z
  .object({
    operationId: z.uuid(),
    expectedSessionVersion: z.number().int().positive(),
    taskId: CompanionOpaqueIdSchema,
    taskKind: CompanionTaskKindSchema,
    phase: z.enum(["permission", "guidance", "in_progress", "retry", "unavailable"]),
    consent: z
      .object({
        decision: z.literal("granted"),
        version: z.string().min(1).max(120),
        grantedAt: z.iso.datetime()
      })
      .strict()
      .optional()
  })
  .strict();

export type CompanionStatusUpdateRequest = z.infer<typeof CompanionStatusUpdateRequestSchema>;

const QualityProposalSchema = z
  .object({
    status: z.literal("unreviewed"),
    score: z.number().min(0).max(1),
    reasons: z.array(z.string().min(1).max(80)).max(8),
    metrics: z.record(z.string().min(1).max(80), z.number().finite()).optional()
  })
  .strict();

const ResultRequestBaseSchema = z
  .object({
    operationId: z.uuid(),
    expectedSessionVersion: z.number().int().positive(),
    taskId: CompanionOpaqueIdSchema,
    clientObservedAt: z.iso.datetime(),
    rawMediaStored: z.literal(false)
  })
  .strict();

const FingerPulseResultSchema = ResultRequestBaseSchema.extend({
  taskKind: z.literal("finger_pulse"),
  outcome: z.literal("derived_candidate"),
  derived: z
    .object({
      pulseBpm: z.number().min(20).max(260),
      durationMs: z.number().int().min(5_000).max(120_000),
      algorithmVersion: z.string().min(1).max(120),
      quality: QualityProposalSchema
    })
    .strict()
}).strict();

const FacePulseResultSchema = ResultRequestBaseSchema.extend({
  taskKind: z.literal("face_pulse"),
  outcome: z.literal("derived_candidate"),
  derived: z
    .object({
      pulseBpm: z.number().min(20).max(260),
      durationMs: z.number().int().min(5_000).max(120_000),
      providerVersion: z.string().min(1).max(120),
      consentGrantedAt: z.iso.datetime(),
      quality: QualityProposalSchema
    })
    .strict()
}).strict();

const VoiceSignalResultSchema = ResultRequestBaseSchema.extend({
  taskKind: z.literal("voice_signal"),
  outcome: z.literal("derived_candidate"),
  derived: z
    .object({
      durationMs: z.number().int().min(5_000).max(30_000),
      algorithmVersion: z.string().min(1).max(120),
      researchOnly: z.literal(true),
      features: z
        .object({
          medianFundamentalFrequencyHz: z.number().positive().max(2_000),
          pitchVariabilitySemitones: z.number().nonnegative().max(100),
          jitterPercent: z.number().nonnegative().max(100),
          shimmerPercent: z.number().nonnegative().max(100),
          harmonicToNoiseRatioDb: z.number().min(-100).max(100),
          phonationDurationMs: z.number().int().positive().max(30_000).optional()
        })
        .strict(),
      quality: QualityProposalSchema
    })
    .strict()
}).strict();

const MedicationFieldSchema = z
  .object({
    field: z.enum(["product_name", "active_ingredient", "strength", "directions"]),
    status: z.enum(["confirmed", "unknown"]),
    value: z.string().trim().min(1).max(240).nullable()
  })
  .strict()
  .superRefine((field, context) => {
    if ((field.status === "confirmed") !== (field.value !== null)) {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: "confirmed fields require a value and unknown fields must remain null"
      });
    }
  });

const MedicationLabelResultSchema = ResultRequestBaseSchema.extend({
  taskKind: z.literal("medication_label"),
  outcome: z.literal("derived_candidate"),
  derived: z
    .object({
      source: z.enum(["image_review", "text_entry"]),
      explicitlyConfirmed: z.literal(true),
      fields: z.array(MedicationFieldSchema).min(1).max(4)
    })
    .strict()
}).strict();

const NonMeasurementResultSchema = ResultRequestBaseSchema.extend({
  taskKind: CompanionTaskKindSchema,
  outcome: z.enum(["quality_rejected", "unavailable", "declined"]),
  reason: z.enum([
    "quality_too_low",
    "permission_denied",
    "unsupported_device",
    "network_interrupted",
    "patient_declined",
    "provider_unavailable"
  ])
}).strict();

export const CompanionTaskResultRequestSchema = z
  .union([
    FingerPulseResultSchema,
    FacePulseResultSchema,
    VoiceSignalResultSchema,
    MedicationLabelResultSchema,
    NonMeasurementResultSchema
  ])
  .superRefine((result, context) => {
    const bytes = new TextEncoder().encode(JSON.stringify(result)).byteLength;
    if (bytes > 16_384) {
      context.addIssue({
        code: "custom",
        message: "result payload exceeds the derived-data limit"
      });
    }
  });

export type CompanionTaskResultRequest = z.infer<typeof CompanionTaskResultRequestSchema>;

export const CompanionResultSummarySchema = z
  .object({
    resultId: z.uuid(),
    outcome: z.enum(["derived_candidate", "quality_rejected", "unavailable", "declined"]),
    receivedAt: z.iso.datetime()
  })
  .strict();

export type CompanionResultSummary = z.infer<typeof CompanionResultSummarySchema>;

export const CompanionPhoneSnapshotSchema = z
  .object({
    sessionVersion: z.number().int().positive(),
    status: z.enum(["active", "expired", "revoked"]),
    expiresAt: z.iso.datetime(),
    task: CompanionTaskBindingSchema,
    taskPhase: CompanionTaskPhaseSchema,
    consentRequirement: CompanionConsentRequirementSchema,
    consentState: CompanionConsentStateSchema,
    lastResult: CompanionResultSummarySchema.nullable(),
    reissueRequired: z.boolean()
  })
  .strict();

export type CompanionPhoneSnapshot = z.infer<typeof CompanionPhoneSnapshotSchema>;

export const CompanionDesktopSnapshotSchema = z
  .object({
    pairingId: z.uuid(),
    roundId: z.uuid(),
    roundStateVersion: z.number().int().nonnegative(),
    pairingVersion: z.number().int().positive(),
    status: z.enum(["pending", "active", "expired", "revoked", "completed"]),
    connection: z.enum([
      "waiting_for_phone",
      "phone_connected",
      "result_received",
      "desktop_acknowledged",
      "expired",
      "revoked"
    ]),
    tokenExpiresAt: z.iso.datetime(),
    sessionExpiresAt: z.iso.datetime().nullable(),
    task: CompanionTaskBindingSchema,
    taskPhase: CompanionTaskPhaseSchema,
    lastResult: CompanionResultSummarySchema.nullable(),
    reissueRequired: z.boolean()
  })
  .strict();

export type CompanionDesktopSnapshot = z.infer<typeof CompanionDesktopSnapshotSchema>;

export const CompanionExchangeRequestSchema = z
  .object({
    token: CompanionPairingTokenSchema,
    exchangeIdempotencyKey: z.uuid()
  })
  .strict();

export const CompanionCreatePairingRequestSchema = z
  .object({
    roundId: z.uuid(),
    expectedRoundStateVersion: z.number().int().nonnegative()
  })
  .strict();

export const CompanionPairingMutationRequestSchema = z
  .object({
    operationId: z.uuid(),
    expectedPairingVersion: z.number().int().positive()
  })
  .strict();

export const CompanionAcknowledgeRequestSchema = CompanionPairingMutationRequestSchema.extend({
  resultId: z.uuid()
}).strict();

export const CompanionPairingIssueSchema = z
  .object({
    pairingId: z.uuid(),
    pairingVersion: z.number().int().positive(),
    pairingLink: z.url(),
    tokenExpiresAt: z.iso.datetime(),
    task: CompanionTaskBindingSchema
  })
  .strict();

export type CompanionPairingIssue = z.infer<typeof CompanionPairingIssueSchema>;

export const CompanionResultReceiptSchema = z
  .object({
    resultId: z.uuid(),
    sessionVersion: z.number().int().positive(),
    status: z.literal("received_for_workflow_validation"),
    receivedAt: z.iso.datetime(),
    replayed: z.boolean()
  })
  .strict();

export type CompanionResultReceipt = z.infer<typeof CompanionResultReceiptSchema>;
