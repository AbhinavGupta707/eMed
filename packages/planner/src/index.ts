import { z } from "zod";

const IdentifierSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z][a-z0-9_.-]*$/);

export const ModuleKindSchema = z.enum(["pulse_capture", "structured_follow_up"]);
export type ModuleKind = z.infer<typeof ModuleKindSchema>;

export const NeededFactKeySchema = z.enum(["pulse_bpm", "follow_up_answer"]);
export type NeededFactKey = z.infer<typeof NeededFactKeySchema>;

export const PlannerCandidateSchema = z
  .object({
    id: IdentifierSchema,
    kind: ModuleKindSchema,
    producesFactKey: NeededFactKeySchema,
    available: z.boolean(),
    estimatedBurdenSeconds: z.number().int().positive().max(600),
    scoring: z
      .object({
        informationGain: z.number().int().min(0).max(100),
        reliability: z.number().int().min(0).max(100),
        burdenCost: z.number().int().min(0).max(100)
      })
      .strict()
  })
  .strict()
  .superRefine((candidate, context) => {
    if (
      (candidate.kind === "pulse_capture" && candidate.producesFactKey !== "pulse_bpm") ||
      (candidate.kind === "structured_follow_up" &&
        candidate.producesFactKey !== "follow_up_answer")
    ) {
      context.addIssue({
        code: "custom",
        path: ["producesFactKey"],
        message: `${candidate.kind} cannot produce ${candidate.producesFactKey}`
      });
    }
  });

export const PlannerInputSchema = z
  .object({
    neededFactKeys: z.array(NeededFactKeySchema).max(2),
    burdenSecondsRemaining: z.number().int().nonnegative().max(3_600),
    followUpQuestionsAsked: z.number().int().min(0).max(1),
    candidates: z.array(PlannerCandidateSchema).max(16)
  })
  .strict()
  .superRefine((input, context) => {
    const ids = input.candidates.map(({ id }) => id);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        path: ["candidates"],
        message: "candidate IDs must be unique"
      });
    }
  });

export type PlannerInput = z.infer<typeof PlannerInputSchema>;
export type PlannerCandidate = z.infer<typeof PlannerCandidateSchema>;

export type IneligibilityReason =
  "not_needed" | "unavailable" | "burden_exceeded" | "follow_up_budget_exhausted";

export type CandidateEvaluation = {
  readonly candidate: PlannerCandidate;
  readonly eligible: boolean;
  readonly reasons: readonly IneligibilityReason[];
  readonly score: number;
};

export type PlannerResult = {
  readonly selected: PlannerCandidate | null;
  readonly evaluations: readonly CandidateEvaluation[];
};

const KIND_TIE_BREAK: Readonly<Record<ModuleKind, number>> = {
  pulse_capture: 0,
  structured_follow_up: 1
};

function score(candidate: PlannerCandidate): number {
  return (
    candidate.scoring.informationGain * 100 +
    candidate.scoring.reliability * 10 -
    candidate.scoring.burdenCost
  );
}

function evaluateCandidate(input: PlannerInput, candidate: PlannerCandidate): CandidateEvaluation {
  const reasons: IneligibilityReason[] = [];
  if (!input.neededFactKeys.includes(candidate.producesFactKey)) reasons.push("not_needed");
  if (!candidate.available) reasons.push("unavailable");
  if (candidate.estimatedBurdenSeconds > input.burdenSecondsRemaining) {
    reasons.push("burden_exceeded");
  }
  if (candidate.kind === "structured_follow_up" && input.followUpQuestionsAsked >= 1) {
    reasons.push("follow_up_budget_exhausted");
  }

  return { candidate, eligible: reasons.length === 0, reasons, score: score(candidate) };
}

export function planNextModule(inputValue: unknown): PlannerResult {
  const input = PlannerInputSchema.parse(inputValue);
  const evaluations = input.candidates.map((candidate) => evaluateCandidate(input, candidate));
  const selected = evaluations
    .filter(({ eligible }) => eligible)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.candidate.estimatedBurdenSeconds - right.candidate.estimatedBurdenSeconds ||
        KIND_TIE_BREAK[left.candidate.kind] - KIND_TIE_BREAK[right.candidate.kind] ||
        left.candidate.id.localeCompare(right.candidate.id)
    )[0]?.candidate;

  return { selected: selected ?? null, evaluations };
}
