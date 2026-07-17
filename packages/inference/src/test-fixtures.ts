import {
  AdaptiveSelectionInputSchema,
  type AdaptiveSelectionDecision,
  type AdaptiveSelectionInput
} from "@homerounds/contracts/inference";

const BASE_INPUT = {
  contractVersion: "adaptive-selection.v1",
  roundId: "cc80d269-2f79-4328-a129-98cac85219e4",
  stateVersion: 2,
  syntheticDataOnly: true,
  redFlagGate: "clear",
  neededFactKeys: ["pulse_bpm", "follow_up_answer", "medication_label_observation"],
  burdenSecondsRemaining: 90,
  context: [
    {
      referenceId: "patient.report",
      summary: "The synthetic report has an unanswered symptom timing detail.",
      factIds: ["synthetic-report-1"]
    },
    {
      referenceId: "medication.list",
      summary: "The synthetic medication list has one unconfirmed label entry.",
      factIds: ["synthetic-medication-1"]
    }
  ],
  candidates: [
    {
      id: "pulse.local",
      kind: "pulse_capture",
      label: "Check pulse",
      description: "A short local optical pulse check.",
      producesFactKeys: ["pulse_bpm"],
      availability: { status: "available" },
      estimatedBurdenSeconds: 30,
      deterministicRank: 0
    },
    {
      id: "followup.timing",
      kind: "structured_follow_up",
      label: "Clarify timing",
      description: "Ask one structured question about symptom timing.",
      producesFactKeys: ["follow_up_answer"],
      availability: { status: "available" },
      estimatedBurdenSeconds: 20,
      deterministicRank: 1
    },
    {
      id: "medication.label",
      kind: "medication_label",
      label: "Review a medication label",
      description: "Review a synthetic medication label with explicit confirmation.",
      producesFactKeys: ["medication_label_observation"],
      availability: { status: "available" },
      estimatedBurdenSeconds: 40,
      deterministicRank: 2
    }
  ],
  deterministicFallbackModuleId: "pulse.local"
} as const;

export function adaptiveInputFixture(
  overrides: Partial<AdaptiveSelectionInput> = {}
): AdaptiveSelectionInput {
  return AdaptiveSelectionInputSchema.parse({ ...BASE_INPUT, ...overrides });
}

export function selectionDecisionFixture(
  candidateModuleId: string,
  evidenceReferenceIds: readonly string[] = ["patient.report"]
): AdaptiveSelectionDecision {
  return {
    decision: "select",
    candidateModuleId,
    evidenceReferenceIds: [...evidenceReferenceIds],
    rationale: "This eligible route addresses a remaining synthetic evidence gap.",
    uncertainty: "low",
    missingInformation: []
  };
}

export function abstentionDecisionFixture(): AdaptiveSelectionDecision {
  return {
    decision: "abstain",
    candidateModuleId: null,
    evidenceReferenceIds: ["patient.report"],
    rationale: "The supplied synthetic evidence does not safely support one candidate.",
    uncertainty: "high",
    missingInformation: ["A clearer synthetic symptom sequence"]
  };
}
