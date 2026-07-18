import { z } from "zod";

export const TriggerOpaqueIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9._:-]+$/);

export const TriggerFactKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z][a-z0-9_]*$/);
export type TriggerFactKey = z.infer<typeof TriggerFactKeySchema>;

const VersionLabelSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z0-9._-]+$/);

export const KnownStructuredFactDataSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("number"),
      value: z.number().finite(),
      unit: VersionLabelSchema
    })
    .strict(),
  z
    .object({
      kind: z.literal("category"),
      code: z
        .string()
        .trim()
        .min(1)
        .max(80)
        .regex(/^[a-z][a-z0-9_-]*$/)
    })
    .strict(),
  z.object({ kind: z.literal("boolean"), value: z.boolean() }).strict(),
  z
    .object({
      kind: z.literal("short_text"),
      value: z.string().trim().min(1).max(160)
    })
    .strict()
]);
export type KnownStructuredFactData = z.infer<typeof KnownStructuredFactDataSchema>;

export const StructuredLongitudinalFactValueSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("known"), data: KnownStructuredFactDataSchema }).strict(),
  z
    .object({
      status: z.literal("unknown"),
      reason: z.enum(["not_reported", "uncertain", "not_observed", "quality_not_accepted"])
    })
    .strict(),
  z
    .object({
      status: z.literal("missing"),
      reason: z.enum(["not_collected", "deleted", "source_unavailable"])
    })
    .strict()
]);
export type StructuredLongitudinalFactValue = z.infer<typeof StructuredLongitudinalFactValueSchema>;

export const SyntheticLongitudinalFactSchema = z
  .object({
    schemaVersion: z.literal("synthetic-longitudinal-fact.v1"),
    factId: TriggerOpaqueIdSchema,
    patientId: TriggerOpaqueIdSchema,
    dataClassification: z.literal("synthetic_demo"),
    factKey: TriggerFactKeySchema,
    factVersion: z.number().int().positive(),
    observedAt: z.iso.datetime(),
    value: StructuredLongitudinalFactValueSchema,
    source: z
      .object({
        schemaVersion: z.literal("trigger-fact-source.v1"),
        kind: z.enum([
          "synthetic_seed",
          "patient_confirmation",
          "deterministic_workflow",
          "quality_accepted_derived_fact"
        ]),
        sourceId: TriggerOpaqueIdSchema,
        sourceTimestamp: z.iso.datetime(),
        structuredOnly: z.literal(true),
        rawMediaStored: z.literal(false),
        transcriptStored: z.literal(false),
        promptStored: z.literal(false),
        providerPayloadStored: z.literal(false)
      })
      .strict()
  })
  .strict();
export type SyntheticLongitudinalFact = z.infer<typeof SyntheticLongitudinalFactSchema>;

export const TriggerChangeRuleSchema = z.discriminatedUnion("comparison", [
  z
    .object({
      ruleId: TriggerOpaqueIdSchema,
      factKey: TriggerFactKeySchema,
      comparison: z.literal("numeric_absolute_delta"),
      unit: VersionLabelSchema,
      absoluteDeltaThreshold: z.number().positive().finite()
    })
    .strict(),
  z
    .object({
      ruleId: TriggerOpaqueIdSchema,
      factKey: TriggerFactKeySchema,
      comparison: z.literal("exact_value_changed")
    })
    .strict()
]);
export type TriggerChangeRule = z.infer<typeof TriggerChangeRuleSchema>;

export const DeterministicTriggerPolicySchema = z
  .object({
    schemaVersion: z.literal("deterministic-trigger-policy.v1"),
    policyVersion: VersionLabelSchema,
    protocolId: TriggerOpaqueIdSchema,
    purposeCode: z.literal("review_combined_personal_change"),
    minimumChangedFacts: z.number().int().min(2).max(8),
    maxCurrentFactAgeSeconds: z.number().int().positive().max(31_536_000),
    unknownHandling: z.literal("do_not_trigger"),
    clinicalInterpretation: z.literal("none"),
    rules: z.array(TriggerChangeRuleSchema).min(2).max(8)
  })
  .strict()
  .superRefine((policy, context) => {
    if (policy.minimumChangedFacts > policy.rules.length) {
      context.addIssue({
        code: "custom",
        path: ["minimumChangedFacts"],
        message: "minimum changed facts cannot exceed the number of rules"
      });
    }
    const ruleIds = new Set<string>();
    const factKeys = new Set<string>();
    for (const [index, rule] of policy.rules.entries()) {
      if (ruleIds.has(rule.ruleId)) {
        context.addIssue({
          code: "custom",
          path: ["rules", index, "ruleId"],
          message: "trigger rule identifiers must be unique"
        });
      }
      if (factKeys.has(rule.factKey)) {
        context.addIssue({
          code: "custom",
          path: ["rules", index, "factKey"],
          message: "a fact key can be evaluated by only one trigger rule"
        });
      }
      ruleIds.add(rule.ruleId);
      factKeys.add(rule.factKey);
    }
  });
export type DeterministicTriggerPolicy = z.infer<typeof DeterministicTriggerPolicySchema>;

export const TriggerEvaluationInvocationSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("scheduled"),
      invocationId: TriggerOpaqueIdSchema,
      scheduleId: TriggerOpaqueIdSchema,
      scheduledFor: z.iso.datetime(),
      boundedEvaluation: z.literal(true)
    })
    .strict(),
  z
    .object({
      kind: z.literal("event"),
      invocationId: TriggerOpaqueIdSchema,
      eventId: TriggerOpaqueIdSchema,
      receivedAt: z.iso.datetime(),
      boundedEvaluation: z.literal(true)
    })
    .strict()
]);
export type TriggerEvaluationInvocation = z.infer<typeof TriggerEvaluationInvocationSchema>;

const EvaluateTriggerInputBaseSchema = z
  .object({
    patientId: TriggerOpaqueIdSchema,
    dataClassification: z.literal("synthetic_demo"),
    invocation: TriggerEvaluationInvocationSchema,
    policy: DeterministicTriggerPolicySchema,
    previousFacts: z.array(SyntheticLongitudinalFactSchema).max(64),
    currentFacts: z.array(SyntheticLongitudinalFactSchema).max(64),
    evaluatedAt: z.iso.datetime()
  })
  .strict();

function requireMatchingSyntheticPatient(
  input: Pick<
    z.infer<typeof EvaluateTriggerInputBaseSchema>,
    "patientId" | "previousFacts" | "currentFacts"
  >,
  context: z.RefinementCtx
): void {
  for (const [collectionName, facts] of [
    ["previousFacts", input.previousFacts],
    ["currentFacts", input.currentFacts]
  ] as const) {
    for (const [index, fact] of facts.entries()) {
      if (fact.patientId !== input.patientId) {
        context.addIssue({
          code: "custom",
          path: [collectionName, index, "patientId"],
          message: "trigger facts must belong to the evaluated synthetic patient"
        });
      }
    }
  }
}

export const EvaluateTriggerRequestSchema = EvaluateTriggerInputBaseSchema.omit({
  evaluatedAt: true
}).superRefine(requireMatchingSyntheticPatient);
export type EvaluateTriggerRequest = z.infer<typeof EvaluateTriggerRequestSchema>;

export const EvaluateTriggerInputSchema = EvaluateTriggerInputBaseSchema.superRefine(
  requireMatchingSyntheticPatient
);
export type EvaluateTriggerInput = z.infer<typeof EvaluateTriggerInputSchema>;

export const TriggerFactEvaluationSchema = z
  .object({
    ruleId: TriggerOpaqueIdSchema,
    factKey: TriggerFactKeySchema,
    status: z.enum(["changed", "unchanged", "insufficient_data", "stale_version"]),
    reason: z.enum([
      "numeric_threshold_met",
      "numeric_threshold_not_met",
      "exact_value_changed",
      "exact_value_unchanged",
      "missing_previous_fact",
      "missing_current_fact",
      "previous_value_unknown_or_missing",
      "current_value_unknown_or_missing",
      "fact_kind_mismatch",
      "unit_mismatch",
      "current_fact_too_old",
      "current_version_not_newer"
    ]),
    previousFact: z
      .object({ factId: TriggerOpaqueIdSchema, factVersion: z.number().int().positive() })
      .strict()
      .nullable(),
    currentFact: z
      .object({ factId: TriggerOpaqueIdSchema, factVersion: z.number().int().positive() })
      .strict()
      .nullable(),
    comparison: z.discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("numeric_delta"),
          absoluteDelta: z.number().nonnegative().finite(),
          threshold: z.number().positive().finite(),
          unit: VersionLabelSchema
        })
        .strict(),
      z.object({ kind: z.literal("exact_equality"), equal: z.boolean() }).strict(),
      z.object({ kind: z.literal("not_available") }).strict()
    ])
  })
  .strict();
export type TriggerFactEvaluation = z.infer<typeof TriggerFactEvaluationSchema>;

const TriggerAuthoritySchema = z
  .object({
    proposalOnly: z.literal(true),
    clinicalInterpretation: z.literal("none"),
    workflowAuthority: z.literal(false),
    requiresAuthoritativeRedFlagGate: z.literal(true),
    requiresAuthoritativeProtocolEvaluation: z.literal(true),
    requiresAuthoritativeRoundCreation: z.literal(true)
  })
  .strict();

export const ProactiveRoundCreationProposalSchema = z
  .object({
    schemaVersion: z.literal("proactive-round-creation-proposal.v1"),
    proposalId: TriggerOpaqueIdSchema,
    triggerId: TriggerOpaqueIdSchema,
    idempotencyKey: TriggerOpaqueIdSchema,
    patientId: TriggerOpaqueIdSchema,
    dataClassification: z.literal("synthetic_demo"),
    status: z.literal("proposed"),
    policyVersion: VersionLabelSchema,
    protocolId: TriggerOpaqueIdSchema,
    purposeCode: z.literal("review_combined_personal_change"),
    proposedAt: z.iso.datetime(),
    sourceInvocation: TriggerEvaluationInvocationSchema,
    changedFacts: z
      .array(
        z
          .object({
            factKey: TriggerFactKeySchema,
            previousFactId: TriggerOpaqueIdSchema,
            previousFactVersion: z.number().int().positive(),
            currentFactId: TriggerOpaqueIdSchema,
            currentFactVersion: z.number().int().positive(),
            explanationCode: z.enum(["numeric_threshold_met", "exact_value_changed"])
          })
          .strict()
      )
      .min(2)
      .max(8),
    authority: TriggerAuthoritySchema
  })
  .strict();
export type ProactiveRoundCreationProposal = z.infer<typeof ProactiveRoundCreationProposalSchema>;

export const ProactiveRoundCreationProposedEventSchema = z
  .object({
    schemaVersion: z.literal("proactive-round-creation-proposed-event.v1"),
    eventId: TriggerOpaqueIdSchema,
    eventType: z.literal("proactive_round_creation_proposed"),
    eventVersion: z.literal(1),
    idempotencyKey: TriggerOpaqueIdSchema,
    occurredAt: z.iso.datetime(),
    patientId: TriggerOpaqueIdSchema,
    triggerId: TriggerOpaqueIdSchema,
    proposalId: TriggerOpaqueIdSchema,
    invocationKind: z.enum(["scheduled", "event"]),
    roundCreated: z.literal(false),
    workflowAuthority: z.literal(false)
  })
  .strict();
export type ProactiveRoundCreationProposedEvent = z.infer<
  typeof ProactiveRoundCreationProposedEventSchema
>;

const TriggerEvaluationCommonShape = {
  schemaVersion: z.literal("deterministic-trigger-evaluation.v1"),
  patientId: TriggerOpaqueIdSchema,
  dataClassification: z.literal("synthetic_demo"),
  evaluatedAt: z.iso.datetime(),
  invocation: TriggerEvaluationInvocationSchema,
  policyVersion: VersionLabelSchema,
  factEvaluations: z.array(TriggerFactEvaluationSchema).min(2).max(8),
  changedFactCount: z.number().int().nonnegative().max(8),
  authority: z
    .object({
      basis: z.literal("versioned_structured_synthetic_facts_only"),
      clinicalInterpretation: z.literal("none"),
      workflowAuthority: z.literal(false)
    })
    .strict()
} as const;

export const DeterministicTriggerEvaluationSchema = z.discriminatedUnion("status", [
  z
    .object({
      ...TriggerEvaluationCommonShape,
      status: z.literal("triggered"),
      reason: z.literal("combined_personal_change"),
      proposal: ProactiveRoundCreationProposalSchema,
      event: ProactiveRoundCreationProposedEventSchema
    })
    .strict(),
  z
    .object({
      ...TriggerEvaluationCommonShape,
      status: z.literal("not_triggered"),
      reason: z.literal("change_threshold_not_met"),
      proposal: z.null(),
      event: z.null()
    })
    .strict(),
  z
    .object({
      ...TriggerEvaluationCommonShape,
      status: z.literal("insufficient_data"),
      reason: z.literal("unknown_or_missing_fact"),
      proposal: z.null(),
      event: z.null()
    })
    .strict(),
  z
    .object({
      ...TriggerEvaluationCommonShape,
      status: z.literal("stale_input"),
      reason: z.literal("stale_fact_version_or_time"),
      proposal: z.null(),
      event: z.null()
    })
    .strict()
]);
export type DeterministicTriggerEvaluation = z.infer<typeof DeterministicTriggerEvaluationSchema>;

export const ServerEligibleTriggerCandidateSchema = z
  .object({
    schemaVersion: z.literal("server-eligible-trigger-candidate.v1"),
    candidateId: TriggerOpaqueIdSchema,
    kind: TriggerFactKeySchema,
    label: z.string().trim().min(1).max(80),
    description: z.string().trim().min(1).max(160),
    producesFactKeys: z.array(TriggerFactKeySchema).min(1).max(8),
    estimatedBurdenSeconds: z.number().int().positive().max(600),
    eligibility: z
      .object({
        status: z.literal("eligible"),
        attestationId: TriggerOpaqueIdSchema,
        evaluatedAt: z.iso.datetime(),
        redFlagGate: z.literal("clear"),
        protocolAllowed: z.literal(true),
        available: z.literal(true)
      })
      .strict()
  })
  .strict();
export type ServerEligibleTriggerCandidate = z.infer<typeof ServerEligibleTriggerCandidateSchema>;

export const BoundedTriggerInferenceHandoffSchema = z
  .object({
    schemaVersion: z.literal("bounded-trigger-inference-handoff.v1"),
    triggerId: TriggerOpaqueIdSchema,
    patientId: TriggerOpaqueIdSchema,
    dataClassification: z.literal("synthetic_demo"),
    policyVersion: VersionLabelSchema,
    generatedAt: z.iso.datetime(),
    context: z
      .array(
        z
          .object({
            referenceId: TriggerOpaqueIdSchema,
            summaryCode: z.enum(["combined_personal_change", "consented_memory_metadata"]),
            summary: z.string().trim().min(1).max(240),
            factKeys: z.array(TriggerFactKeySchema).max(12)
          })
          .strict()
      )
      .min(1)
      .max(2),
    candidates: z.array(ServerEligibleTriggerCandidateSchema).min(1).max(8),
    exclusions: z
      .object({
        rawFactValues: z.literal(true),
        rawHistory: z.literal(true),
        memoryValues: z.literal(true),
        transcripts: z.literal(true),
        prompts: z.literal(true),
        providerPayloads: z.literal(true),
        hiddenReasoning: z.literal(true)
      })
      .strict(),
    authority: z
      .object({
        candidateSelectionOnly: z.literal(true),
        clinicalInterpretation: z.literal("none"),
        urgencyAuthority: z.literal(false),
        qualityAuthority: z.literal(false),
        actionAuthority: z.literal(false),
        workflowAuthority: z.literal(false)
      })
      .strict()
  })
  .strict();
export type BoundedTriggerInferenceHandoff = z.infer<typeof BoundedTriggerInferenceHandoffSchema>;
