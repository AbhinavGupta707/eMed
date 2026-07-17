import { z } from "zod";

export const SafeInferenceIdentifierSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z][a-z0-9_.-]*$/);

export const EvidenceModuleKindSchema = z.enum([
  "pulse_capture",
  "structured_follow_up",
  "medication_label"
]);
export type EvidenceModuleKind = z.infer<typeof EvidenceModuleKindSchema>;

export const EvidenceFactKeySchema = z.enum([
  "pulse_bpm",
  "follow_up_answer",
  "medication_label_observation"
]);
export type EvidenceFactKey = z.infer<typeof EvidenceFactKeySchema>;

export const EvidenceModuleAvailabilitySchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("available") }).strict(),
  z
    .object({
      status: z.literal("unavailable"),
      reason: z.enum([
        "not_needed",
        "unsupported_device",
        "permission_denied",
        "missing_configuration",
        "provider_unavailable",
        "burden_exceeded"
      ])
    })
    .strict()
]);

export const EvidenceModuleCandidateSchema = z
  .object({
    id: SafeInferenceIdentifierSchema,
    kind: EvidenceModuleKindSchema,
    label: z.string().trim().min(1).max(80),
    description: z.string().trim().min(1).max(240),
    producesFactKeys: z.array(EvidenceFactKeySchema).min(1).max(3),
    availability: EvidenceModuleAvailabilitySchema,
    estimatedBurdenSeconds: z.number().int().positive().max(600),
    deterministicRank: z.number().int().nonnegative().max(100)
  })
  .strict();
export type EvidenceModuleCandidate = z.infer<typeof EvidenceModuleCandidateSchema>;

export const EvidenceContextItemSchema = z
  .object({
    referenceId: SafeInferenceIdentifierSchema,
    summary: z.string().trim().min(1).max(240),
    factIds: z.array(z.string().min(1).max(120)).max(8)
  })
  .strict();
export type EvidenceContextItem = z.infer<typeof EvidenceContextItemSchema>;

export const AdaptiveSelectionInputSchema = z
  .object({
    contractVersion: z.literal("adaptive-selection.v1"),
    roundId: z.uuid(),
    stateVersion: z.number().int().nonnegative(),
    syntheticDataOnly: z.literal(true),
    redFlagGate: z.enum(["clear", "blocked", "uncertain"]),
    neededFactKeys: z.array(EvidenceFactKeySchema).min(1).max(3),
    burdenSecondsRemaining: z.number().int().nonnegative().max(3_600),
    context: z.array(EvidenceContextItemSchema).max(12),
    candidates: z.array(EvidenceModuleCandidateSchema).min(1).max(8),
    deterministicFallbackModuleId: SafeInferenceIdentifierSchema
  })
  .strict()
  .superRefine((input, context) => {
    const candidateIds = input.candidates.map(({ id }) => id);
    if (new Set(candidateIds).size !== candidateIds.length) {
      context.addIssue({
        code: "custom",
        path: ["candidates"],
        message: "candidate IDs must be unique"
      });
    }
    const referenceIds = input.context.map(({ referenceId }) => referenceId);
    if (new Set(referenceIds).size !== referenceIds.length) {
      context.addIssue({
        code: "custom",
        path: ["context"],
        message: "context reference IDs must be unique"
      });
    }
    const fallback = input.candidates.find(({ id }) => id === input.deterministicFallbackModuleId);
    if (!fallback || fallback.availability.status !== "available") {
      context.addIssue({
        code: "custom",
        path: ["deterministicFallbackModuleId"],
        message: "deterministic fallback must name an available candidate"
      });
    }
  });
export type AdaptiveSelectionInput = z.infer<typeof AdaptiveSelectionInputSchema>;

const DecisionSupportFieldsSchema = z.object({
  evidenceReferenceIds: z.array(SafeInferenceIdentifierSchema).max(8),
  rationale: z.string().trim().min(1).max(320),
  uncertainty: z.enum(["low", "medium", "high"]),
  missingInformation: z.array(z.string().trim().min(1).max(120)).max(4)
});

export const AdaptiveSelectionDecisionSchema = z.discriminatedUnion("decision", [
  DecisionSupportFieldsSchema.extend({
    decision: z.literal("select"),
    candidateModuleId: SafeInferenceIdentifierSchema
  }).strict(),
  DecisionSupportFieldsSchema.extend({
    decision: z.literal("abstain"),
    candidateModuleId: z.null()
  }).strict()
]);
export type AdaptiveSelectionDecision = z.infer<typeof AdaptiveSelectionDecisionSchema>;

export const InferenceTaskSchema = z.enum([
  "adaptive_module_selection",
  "medication_label_extraction"
]);
export type InferenceTask = z.infer<typeof InferenceTaskSchema>;

export const InferenceProviderSchema = z.enum(["disabled", "fake", "fireworks"]);
export type InferenceProvider = z.infer<typeof InferenceProviderSchema>;

export const InferenceProviderErrorCodeSchema = z.enum([
  "missing_configuration",
  "authentication_failed",
  "timeout",
  "rate_limited",
  "provider_unavailable",
  "malformed_response",
  "contract_rejected",
  "cancelled"
]);
export type InferenceProviderErrorCode = z.infer<typeof InferenceProviderErrorCodeSchema>;

export const InferenceProviderFailureSchema = z
  .object({
    code: InferenceProviderErrorCodeSchema,
    retryable: z.boolean(),
    retryAfterMs: z.number().int().positive().max(60_000).nullable()
  })
  .strict();
export type InferenceProviderFailure = z.infer<typeof InferenceProviderFailureSchema>;

export const InferenceProvenanceSchema = z
  .object({
    attemptId: z.uuid(),
    provider: InferenceProviderSchema,
    task: InferenceTaskSchema,
    modelAlias: SafeInferenceIdentifierSchema,
    contractVersion: z.enum(["adaptive-selection.v1", "medication-label.v1"]),
    attemptedAt: z.iso.datetime(),
    durationMs: z.number().int().nonnegative().max(120_000),
    tokenUsage: z
      .object({
        input: z.number().int().nonnegative(),
        output: z.number().int().nonnegative()
      })
      .strict()
      .nullable()
  })
  .strict();
export type InferenceProvenance = z.infer<typeof InferenceProvenanceSchema>;

export const AdaptiveSelectionEnvelopeSchema = z
  .object({
    roundId: z.uuid(),
    stateVersion: z.number().int().nonnegative(),
    decision: AdaptiveSelectionDecisionSchema,
    provenance: InferenceProvenanceSchema
  })
  .strict();
export type AdaptiveSelectionEnvelope = z.infer<typeof AdaptiveSelectionEnvelopeSchema>;

export const AdaptiveSelectionFallbackReasonSchema = z.enum([
  "disabled",
  "red_flag_gate_not_clear",
  "provider_failure",
  "invalid_proposal",
  "stale_round",
  "ineligible_candidate"
]);
export type AdaptiveSelectionFallbackReason = z.infer<typeof AdaptiveSelectionFallbackReasonSchema>;

export const AdaptiveSelectionOutcomeSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("accepted"),
      envelope: AdaptiveSelectionEnvelopeSchema
    })
    .strict(),
  z
    .object({
      status: z.literal("fallback"),
      selectedModuleId: SafeInferenceIdentifierSchema,
      reason: AdaptiveSelectionFallbackReasonSchema,
      patientRationale: z.string().trim().min(1).max(320),
      failure: InferenceProviderFailureSchema.nullable()
    })
    .strict()
]);
export type AdaptiveSelectionOutcome = z.infer<typeof AdaptiveSelectionOutcomeSchema>;
