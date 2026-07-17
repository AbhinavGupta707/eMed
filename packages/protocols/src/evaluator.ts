import {
  CaptureQualitySchema,
  MeasurementFactSchema,
  PatientReportSchema,
  ProtocolResultSchema
} from "@homerounds/contracts";
import { z } from "zod";

import {
  type MeasurementState,
  type ProtocolCondition,
  type ProtocolDefinition,
  ProtocolDefinitionSchema,
  type ProtocolEffect
} from "./schema";

const StrictPatientReportSchema = PatientReportSchema.strict().extend({
  redFlags: PatientReportSchema.shape.redFlags.strict()
});
const StrictMeasurementFactSchema = MeasurementFactSchema.strict().extend({
  quality: MeasurementFactSchema.shape.quality.strict()
});
const StrictCaptureQualitySchema = CaptureQualitySchema.strict();

const MeasurementEvidenceSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("missing") }).strict(),
  z
    .object({
      status: z.literal("unknown"),
      factIds: z.array(z.string().min(1)).max(16)
    })
    .strict(),
  z
    .object({
      status: z.literal("conflicting"),
      factIds: z.array(z.string().min(1)).min(2).max(16)
    })
    .strict(),
  z
    .object({
      status: z.literal("quality_failed"),
      quality: StrictCaptureQualitySchema.refine(({ status }) => status !== "pass", {
        message: "quality_failed evidence cannot have passing quality"
      })
    })
    .strict(),
  z.object({ status: z.literal("present"), fact: StrictMeasurementFactSchema }).strict()
]);

const FollowUpStateSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("not_asked") }).strict(),
  z
    .object({
      status: z.literal("answered"),
      questionId: z.string().min(1).max(80),
      answer: z.enum(["yes", "no", "unsure"])
    })
    .strict(),
  z
    .object({
      status: z.literal("declined"),
      questionId: z.string().min(1).max(80)
    })
    .strict()
]);

export const ProtocolEvaluationInputSchema = z
  .object({
    now: z.iso.datetime(),
    report: StrictPatientReportSchema,
    measurement: MeasurementEvidenceSchema,
    followUp: FollowUpStateSchema,
    followUpQuestionsAsked: z.number().int().min(0).max(1)
  })
  .strict()
  .superRefine((input, context) => {
    if (input.followUp.status !== "not_asked" && input.followUpQuestionsAsked !== 1) {
      context.addIssue({
        code: "custom",
        path: ["followUpQuestionsAsked"],
        message: "an answered or declined follow-up requires one asked question"
      });
    }
  });

export type ProtocolEvaluationInput = z.infer<typeof ProtocolEvaluationInputSchema>;

type DecisionEvidence = {
  readonly ruleId: string;
  readonly sourceIds: readonly string[];
  readonly rationale: string;
};

export type ProtocolEvaluationDecision =
  | {
      readonly kind: "follow_up_required";
      readonly protocolId: string;
      readonly protocolVersion: string;
      readonly matchedRuleIds: readonly string[];
      readonly factIds: readonly string[];
      readonly question: {
        readonly id: string;
        readonly promptKey: string;
        readonly answerType: "yes_no_unsure";
      };
      readonly explanationKey: string;
      readonly evidence: readonly DecisionEvidence[];
    }
  | {
      readonly kind: "result";
      readonly result: z.infer<typeof ProtocolResultSchema>;
      readonly evidence: readonly DecisionEvidence[];
    };

const STAGE_ORDER = ["red_flag", "data_quality", "decision"] as const;

function measurementState(
  input: ProtocolEvaluationInput,
  protocol: ProtocolDefinition
): MeasurementState {
  if (input.measurement.status !== "present") {
    return input.measurement.status;
  }

  const observedAt = new Date(input.measurement.fact.observedAt).getTime();
  const now = new Date(input.now).getTime();
  if (observedAt > now) {
    return "unknown";
  }
  if (now - observedAt > protocol.freshness.pulseMaxAgeSeconds * 1_000) {
    return "stale";
  }
  return "valid";
}

function conditionMatches(
  condition: ProtocolCondition,
  input: ProtocolEvaluationInput,
  state: MeasurementState
): boolean {
  switch (condition.kind) {
    case "red_flag":
      return input.report.redFlags[condition.field] === condition.value;
    case "report_field":
      return input.report[condition.field] === condition.value;
    case "measurement_state":
      return state === condition.value;
    case "pulse_bpm": {
      if (state !== "valid" || input.measurement.status !== "present") return false;
      const pulse = input.measurement.fact.value;
      switch (condition.operator) {
        case "gte":
          return pulse >= condition.value;
        case "lt":
          return pulse < condition.value;
        case "between_inclusive":
          return pulse >= condition.min && pulse <= condition.max;
      }
    }
    case "follow_up_answer":
      return (
        input.followUp.status === "answered" &&
        input.followUp.questionId === condition.questionId &&
        input.followUp.answer === condition.value
      );
    case "follow_up_budget":
      return condition.value === "available"
        ? input.followUpQuestionsAsked < 1
        : input.followUpQuestionsAsked >= 1;
  }
}

function inputFactIds(input: ProtocolEvaluationInput): string[] {
  const ids = [input.report.reportId];
  if (input.measurement.status === "present") ids.push(input.measurement.fact.factId);
  if (input.measurement.status === "unknown" || input.measurement.status === "conflicting") {
    ids.push(...input.measurement.factIds);
  }
  return [...new Set(ids)].sort((left, right) => left.localeCompare(right));
}

function effectRank(effect: ProtocolEffect): number {
  if (effect.kind === "return" && effect.outcome === "emergency_guidance") return 0;
  if (effect.kind === "return" && effect.outcome === "abstain_for_review") return 1;
  if (effect.kind === "ask_follow_up") return 2;
  return 3;
}

function buildDecision(
  protocol: ProtocolDefinition,
  rule: Pick<ProtocolDefinition["rules"][number], "id" | "effect" | "evidence">,
  input: ProtocolEvaluationInput
): ProtocolEvaluationDecision {
  const evidence = [
    {
      ruleId: rule.id,
      sourceIds: [...rule.evidence.sourceIds],
      rationale: rule.evidence.rationale
    }
  ];
  const factIds = inputFactIds(input);

  if (rule.effect.kind === "ask_follow_up") {
    const followUpEffect = rule.effect;
    const question = protocol.questions.find(({ id }) => id === followUpEffect.questionId);
    if (!question) {
      throw new Error(`Validated protocol is missing question ${followUpEffect.questionId}`);
    }
    return {
      kind: "follow_up_required",
      protocolId: protocol.id,
      protocolVersion: protocol.version,
      matchedRuleIds: [rule.id],
      factIds,
      question,
      explanationKey: followUpEffect.explanationKey,
      evidence
    };
  }

  return {
    kind: "result",
    result: ProtocolResultSchema.parse({
      protocolId: protocol.id,
      protocolVersion: protocol.version,
      matchedRuleIds: [rule.id],
      factIds,
      outcome: rule.effect.outcome,
      allowedActions: rule.effect.allowedActions,
      missingFactKeys: rule.effect.missingFactKeys,
      explanationKey: rule.effect.explanationKey
    }),
    evidence
  };
}

export function evaluateProtocol(
  protocolInput: unknown,
  evaluationInput: unknown
): ProtocolEvaluationDecision {
  const protocol = ProtocolDefinitionSchema.parse(protocolInput);
  const input = ProtocolEvaluationInputSchema.parse(evaluationInput);
  const state = measurementState(input, protocol);

  for (const stage of STAGE_ORDER) {
    const matchingRules = protocol.rules
      .filter((rule) => rule.stage === stage)
      .filter((rule) => rule.all.every((condition) => conditionMatches(condition, input, state)))
      .sort(
        (left, right) =>
          (stage === "red_flag" ? effectRank(left.effect) - effectRank(right.effect) : 0) ||
          right.priority - left.priority ||
          left.id.localeCompare(right.id)
      );
    const selected = matchingRules[0];
    if (selected) return buildDecision(protocol, selected, input);
  }

  return buildDecision(protocol, protocol.fallback, input);
}
