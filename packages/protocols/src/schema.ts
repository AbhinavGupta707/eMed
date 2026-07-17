import { z } from "zod";

const IdentifierSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z][a-z0-9_.-]*$/);

const SourceSchema = z
  .object({
    id: IdentifierSchema,
    title: z.string().trim().min(1).max(240),
    provenanceType: z.enum(["illustrative_consensus", "synthetic_demo_assumption"]),
    citation: z.string().trim().min(1).max(500),
    url: z.url().optional(),
    accessedAt: z.iso.date()
  })
  .strict();

const RuleEvidenceSchema = z
  .object({
    sourceIds: z.array(IdentifierSchema).min(1).max(8),
    rationale: z.string().trim().min(1).max(300)
  })
  .strict();

const RedFlagConditionSchema = z
  .object({
    kind: z.literal("red_flag"),
    field: z.enum(["chestPain", "severeBreathlessness", "fainted"]),
    operator: z.literal("equals"),
    value: z.enum(["yes", "no", "unsure"])
  })
  .strict();

const ReportConditionSchema = z
  .object({
    kind: z.literal("report_field"),
    field: z.enum(["weakness", "palpitations"]),
    operator: z.literal("equals"),
    value: z.enum(["absent", "mild", "moderate", "severe", "unknown", "intermittent", "current"])
  })
  .strict()
  .superRefine((condition, context) => {
    const allowed =
      condition.field === "weakness"
        ? ["absent", "mild", "moderate", "severe", "unknown"]
        : ["absent", "intermittent", "current", "unknown"];
    if (!allowed.includes(condition.value)) {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: `${condition.value} is not valid for ${condition.field}`
      });
    }
  });

export const MeasurementStateSchema = z.enum([
  "missing",
  "unknown",
  "conflicting",
  "quality_failed",
  "stale",
  "valid"
]);
export type MeasurementState = z.infer<typeof MeasurementStateSchema>;

const MeasurementStateConditionSchema = z
  .object({
    kind: z.literal("measurement_state"),
    operator: z.literal("equals"),
    value: MeasurementStateSchema
  })
  .strict();

const PulseConditionSchema = z.discriminatedUnion("operator", [
  z
    .object({
      kind: z.literal("pulse_bpm"),
      operator: z.literal("gte"),
      value: z.number().positive().finite(),
      unit: z.literal("bpm")
    })
    .strict(),
  z
    .object({
      kind: z.literal("pulse_bpm"),
      operator: z.literal("lt"),
      value: z.number().positive().finite(),
      unit: z.literal("bpm")
    })
    .strict(),
  z
    .object({
      kind: z.literal("pulse_bpm"),
      operator: z.literal("between_inclusive"),
      min: z.number().positive().finite(),
      max: z.number().positive().finite(),
      unit: z.literal("bpm")
    })
    .strict()
    .refine(({ min, max }) => min <= max, { message: "min must not exceed max" })
]);

const FollowUpAnswerConditionSchema = z
  .object({
    kind: z.literal("follow_up_answer"),
    questionId: IdentifierSchema,
    operator: z.literal("equals"),
    value: z.enum(["yes", "no", "unsure"])
  })
  .strict();

const FollowUpBudgetConditionSchema = z
  .object({
    kind: z.literal("follow_up_budget"),
    operator: z.literal("equals"),
    value: z.enum(["available", "exhausted"])
  })
  .strict();

export const ProtocolConditionSchema = z.discriminatedUnion("kind", [
  RedFlagConditionSchema,
  ReportConditionSchema,
  MeasurementStateConditionSchema,
  PulseConditionSchema,
  FollowUpAnswerConditionSchema,
  FollowUpBudgetConditionSchema
]);
export type ProtocolCondition = z.infer<typeof ProtocolConditionSchema>;

const MissingFactKeySchema = z.enum(["pulse_bpm", "follow_up_answer"]);

const ReturnEffectSchema = z
  .object({
    kind: z.literal("return"),
    outcome: z.enum(["programme_review_requested", "emergency_guidance", "abstain_for_review"]),
    allowedActions: z.array(z.enum(["create_programme_task", "show_emergency_guidance"])).length(1),
    missingFactKeys: z.array(MissingFactKeySchema).max(2),
    explanationKey: IdentifierSchema
  })
  .strict()
  .superRefine((effect, context) => {
    const expectedAction =
      effect.outcome === "emergency_guidance" ? "show_emergency_guidance" : "create_programme_task";

    if (effect.allowedActions[0] !== expectedAction) {
      context.addIssue({
        code: "custom",
        path: ["allowedActions"],
        message: `outcome ${effect.outcome} requires ${expectedAction}`
      });
    }
  });

const FollowUpEffectSchema = z
  .object({
    kind: z.literal("ask_follow_up"),
    questionId: IdentifierSchema,
    explanationKey: IdentifierSchema
  })
  .strict();

export const ProtocolEffectSchema = z.discriminatedUnion("kind", [
  ReturnEffectSchema,
  FollowUpEffectSchema
]);
export type ProtocolEffect = z.infer<typeof ProtocolEffectSchema>;

const ProtocolRuleSchema = z
  .object({
    id: IdentifierSchema,
    stage: z.enum(["red_flag", "data_quality", "decision"]),
    priority: z.number().int().min(0).max(1_000),
    all: z.array(ProtocolConditionSchema).min(1).max(8),
    effect: ProtocolEffectSchema,
    evidence: RuleEvidenceSchema
  })
  .strict()
  .superRefine((rule, context) => {
    if (rule.stage === "red_flag") {
      if (rule.all.length !== 1 || !rule.all.every((condition) => condition.kind === "red_flag")) {
        context.addIssue({
          code: "custom",
          path: ["all"],
          message: "red_flag rules require exactly one red_flag condition"
        });
      }
      if (
        rule.effect.kind !== "return" ||
        !["emergency_guidance", "abstain_for_review"].includes(rule.effect.outcome)
      ) {
        context.addIssue({
          code: "custom",
          path: ["effect"],
          message: "red_flag rules must return emergency guidance or abstain for review"
        });
      }
      if (
        rule.effect.kind === "return" &&
        rule.effect.outcome === "emergency_guidance" &&
        !rule.all.every((condition) => condition.kind === "red_flag" && condition.value === "yes")
      ) {
        context.addIssue({
          code: "custom",
          path: ["all"],
          message: "emergency red-flag rules require confirmed yes conditions"
        });
      }
      const redFlagCondition = rule.all[0];
      if (
        redFlagCondition?.kind === "red_flag" &&
        redFlagCondition.value === "yes" &&
        (rule.effect.kind !== "return" || rule.effect.outcome !== "emergency_guidance")
      ) {
        context.addIssue({
          code: "custom",
          path: ["effect"],
          message: "confirmed red flags must return emergency guidance"
        });
      }
      if (
        redFlagCondition?.kind === "red_flag" &&
        redFlagCondition.value === "unsure" &&
        (rule.effect.kind !== "return" || rule.effect.outcome !== "abstain_for_review")
      ) {
        context.addIssue({
          code: "custom",
          path: ["effect"],
          message: "uncertain red flags must abstain for review"
        });
      }
    }

    if (rule.stage === "data_quality") {
      if (
        rule.all.length !== 1 ||
        !rule.all.every((condition) => condition.kind === "measurement_state")
      ) {
        context.addIssue({
          code: "custom",
          path: ["all"],
          message: "data_quality rules require exactly one measurement_state condition"
        });
      }
      if (rule.effect.kind !== "return" || rule.effect.outcome !== "abstain_for_review") {
        context.addIssue({
          code: "custom",
          path: ["effect"],
          message: "data_quality rules must abstain for review"
        });
      }
    }

    if (
      rule.stage === "decision" &&
      rule.effect.kind === "return" &&
      rule.effect.outcome === "emergency_guidance"
    ) {
      context.addIssue({
        code: "custom",
        path: ["effect"],
        message: "emergency guidance is restricted to the red_flag stage"
      });
    }
    if (rule.stage === "decision" && rule.all.some((condition) => condition.kind === "red_flag")) {
      context.addIssue({
        code: "custom",
        path: ["all"],
        message: "decision rules cannot reinterpret red flags"
      });
    }
    if (
      rule.effect.kind === "ask_follow_up" &&
      !rule.all.some(
        (condition) => condition.kind === "follow_up_budget" && condition.value === "available"
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["all"],
        message: "follow-up rules require an available follow-up budget condition"
      });
    }
  });

const FallbackRuleSchema = z
  .object({
    id: IdentifierSchema,
    effect: ReturnEffectSchema,
    evidence: RuleEvidenceSchema
  })
  .strict()
  .superRefine((rule, context) => {
    if (rule.effect.outcome !== "abstain_for_review") {
      context.addIssue({
        code: "custom",
        path: ["effect"],
        message: "fallback must abstain for review"
      });
    }
  });

const QuestionSchema = z
  .object({
    id: IdentifierSchema,
    promptKey: IdentifierSchema,
    answerType: z.literal("yes_no_unsure")
  })
  .strict();

export const ProtocolDefinitionSchema = z
  .object({
    dsl: z.literal("homerounds.protocol"),
    schemaVersion: z.literal(1),
    authoringMode: z.literal("reviewed_static"),
    id: IdentifierSchema,
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    status: z.literal("illustrative_demo_only"),
    neutralActionWording: z.literal("programme review requested"),
    title: z.string().trim().min(1).max(160),
    clinicalOwner: z
      .object({
        role: z.string().trim().min(1).max(120),
        organisation: z.string().trim().min(1).max(160)
      })
      .strict(),
    reviewDate: z.iso.date(),
    sources: z.array(SourceSchema).min(1).max(16),
    burdenBudget: z
      .object({
        maxFollowUpQuestions: z.literal(1)
      })
      .strict(),
    freshness: z
      .object({
        pulseMaxAgeSeconds: z.number().int().positive().max(31_536_000)
      })
      .strict(),
    questions: z.array(QuestionSchema).max(8),
    rules: z.array(ProtocolRuleSchema).min(1).max(64),
    fallback: FallbackRuleSchema
  })
  .strict()
  .superRefine((protocol, context) => {
    const unique = (values: readonly string[]) => new Set(values).size === values.length;
    const sourceIds = protocol.sources.map(({ id }) => id);
    const questionIds = protocol.questions.map(({ id }) => id);
    const ruleIds = [...protocol.rules.map(({ id }) => id), protocol.fallback.id];

    if (!unique(sourceIds)) {
      context.addIssue({ code: "custom", path: ["sources"], message: "source IDs must be unique" });
    }
    if (!unique(questionIds)) {
      context.addIssue({
        code: "custom",
        path: ["questions"],
        message: "question IDs must be unique"
      });
    }
    if (!unique(ruleIds)) {
      context.addIssue({ code: "custom", path: ["rules"], message: "rule IDs must be unique" });
    }

    const knownSources = new Set(sourceIds);
    const knownQuestions = new Set(questionIds);
    const referencedSources = [
      ...protocol.rules.flatMap(({ evidence }) => evidence.sourceIds),
      ...protocol.fallback.evidence.sourceIds
    ];
    for (const sourceId of referencedSources) {
      if (!knownSources.has(sourceId)) {
        context.addIssue({
          code: "custom",
          path: ["sources"],
          message: `unknown rule source ${sourceId}`
        });
      }
    }

    for (const rule of protocol.rules) {
      if (rule.effect.kind === "ask_follow_up" && !knownQuestions.has(rule.effect.questionId)) {
        context.addIssue({
          code: "custom",
          path: ["rules"],
          message: `unknown follow-up question ${rule.effect.questionId}`
        });
      }
      for (const condition of rule.all) {
        if (condition.kind === "follow_up_answer" && !knownQuestions.has(condition.questionId)) {
          context.addIssue({
            code: "custom",
            path: ["rules"],
            message: `unknown follow-up question ${condition.questionId}`
          });
        }
      }
    }

    const requiredRedFlagCoverage = ["chestPain", "severeBreathlessness", "fainted"].flatMap(
      (field) => [`${field}:yes`, `${field}:unsure`]
    );
    const redFlagCoverage = new Set(
      protocol.rules
        .filter(({ stage }) => stage === "red_flag")
        .flatMap(({ all }) =>
          all
            .filter((condition) => condition.kind === "red_flag")
            .map((condition) => `${condition.field}:${condition.value}`)
        )
    );
    for (const required of requiredRedFlagCoverage) {
      if (!redFlagCoverage.has(required)) {
        context.addIssue({
          code: "custom",
          path: ["rules"],
          message: `missing required red-flag coverage for ${required}`
        });
      }
    }

    const requiredDataGates = [
      "missing",
      "unknown",
      "conflicting",
      "quality_failed",
      "stale"
    ] as const;
    const dataGateCoverage = new Set(
      protocol.rules
        .filter(({ stage }) => stage === "data_quality")
        .flatMap(({ all }) =>
          all
            .filter((condition) => condition.kind === "measurement_state")
            .map(({ value }) => value)
        )
    );
    for (const required of requiredDataGates) {
      if (!dataGateCoverage.has(required)) {
        context.addIssue({
          code: "custom",
          path: ["rules"],
          message: `missing required data-quality gate for ${required}`
        });
      }
    }
  });

export type ProtocolDefinition = z.infer<typeof ProtocolDefinitionSchema>;

export function parseProtocolDefinition(input: unknown): ProtocolDefinition {
  return ProtocolDefinitionSchema.parse(input);
}
