import { RoundMapExperienceSchema, type RoundMapSelectionState } from "../round-map";

const NOW = "2026-07-17T12:00:00.000Z";
const ROUND_ID = "14df34c4-8204-4810-8113-37b63c963a91";
const MAYA_ATTEMPT_ID = "52aa8e18-8077-431c-b79a-aad4e1440183";
const AISHA_ATTEMPT_ID = "7cc3214a-1b9f-475e-b544-7350d8b28d5e";

const modules = [
  {
    candidate: {
      id: "symptoms.confirmed",
      kind: "structured_follow_up",
      label: "Confirmed symptom check-in",
      description: "Structured synthetic answers confirmed directly by the patient.",
      producesFactKeys: ["follow_up_answer"],
      availability: { status: "available" },
      estimatedBurdenSeconds: 35,
      deterministicRank: 0
    },
    status: "completed",
    statusDetail: "Five structured answers were confirmed and remain saved."
  },
  {
    candidate: {
      id: "pulse.local",
      kind: "pulse_capture",
      label: "Quality-gated finger pulse check",
      description: "A local optical check that creates no measurement unless quality passes.",
      producesFactKeys: ["pulse_bpm"],
      availability: { status: "available" },
      estimatedBurdenSeconds: 30,
      deterministicRank: 1
    },
    status: "selected",
    statusDetail: "Selected from the server-created eligible module list."
  },
  {
    candidate: {
      id: "symptoms.follow-up",
      kind: "structured_follow_up",
      label: "One structured follow-up",
      description: "One patient-confirmed answer if the deterministic protocol requires it.",
      producesFactKeys: ["follow_up_answer"],
      availability: { status: "available" },
      estimatedBurdenSeconds: 15,
      deterministicRank: 2
    },
    status: "next",
    statusDetail: "Available only if the deterministic protocol returns one follow-up."
  },
  {
    candidate: {
      id: "medication.review",
      kind: "medication_label",
      label: "Medication label review",
      description: "A review-and-confirm step for uncertain synthetic label observations.",
      producesFactKeys: ["medication_label_observation"],
      availability: { status: "available" },
      estimatedBurdenSeconds: 60,
      deterministicRank: 3
    },
    status: "skipped",
    statusDetail: "The current deterministic route does not require medication evidence."
  },
  {
    candidate: {
      id: "pulse.remote",
      kind: "pulse_capture",
      label: "Optional remote camera check",
      description: "A separately consented provider route that is disabled in this fixture.",
      producesFactKeys: ["pulse_bpm"],
      availability: { status: "unavailable", reason: "missing_configuration" },
      estimatedBurdenSeconds: 30,
      deterministicRank: 4
    },
    status: "unavailable",
    statusDetail: "Not configured; HomeRounds will not switch providers inside this round."
  }
];

export const MAYA_HAPPY_PATH_ROUND_MAP = RoundMapExperienceSchema.parse({
  currentRoundVersion: 4,
  modules,
  resumedConfirmedProgress: false,
  selection: {
    status: "settled",
    outcome: {
      status: "accepted",
      envelope: {
        roundId: ROUND_ID,
        stateVersion: 4,
        decision: {
          decision: "select",
          candidateModuleId: "pulse.local",
          evidenceReferenceIds: ["patient.report"],
          rationale:
            "Your confirmed symptom check-in leaves a pulse estimate as the next useful evidence step.",
          uncertainty: "low",
          missingInformation: []
        },
        provenance: {
          attemptId: MAYA_ATTEMPT_ID,
          provider: "fake",
          task: "adaptive_module_selection",
          modelAlias: "fixture.selector",
          contractVersion: "adaptive-selection.v1",
          attemptedAt: NOW,
          durationMs: 42,
          tokenUsage: { input: 52, output: 24 }
        }
      }
    }
  },
  syntheticStoryLabel: "Maya · synthetic happy path"
});

function makeAishaExperience(selection: RoundMapSelectionState) {
  return RoundMapExperienceSchema.parse({
    currentRoundVersion: 7,
    modules,
    resumedConfirmedProgress: true,
    selection,
    syntheticStoryLabel: "Aisha · synthetic resilience path"
  });
}

const deterministicFallback = {
  status: "fallback" as const,
  selectedModuleId: "pulse.local",
  patientRationale:
    "The deterministic route kept the quality-gated finger pulse check as the next eligible step."
};

export const AISHA_RESILIENCE_ROUND_MAPS = {
  loading: makeAishaExperience({ status: "loading" }),
  retrying: makeAishaExperience({ status: "retrying" }),
  unavailable: makeAishaExperience({
    status: "settled",
    outcome: {
      ...deterministicFallback,
      reason: "provider_failure",
      failure: { code: "timeout", retryable: true, retryAfterMs: null }
    }
  }),
  abstained: makeAishaExperience({
    status: "settled",
    outcome: {
      status: "accepted",
      envelope: {
        roundId: ROUND_ID,
        stateVersion: 7,
        decision: {
          decision: "abstain",
          candidateModuleId: null,
          evidenceReferenceIds: ["patient.report"],
          rationale:
            "The confirmed synthetic information does not safely distinguish between the eligible modules.",
          uncertainty: "high",
          missingInformation: ["A confirmed answer about symptoms today"]
        },
        provenance: {
          attemptId: AISHA_ATTEMPT_ID,
          provider: "fake",
          task: "adaptive_module_selection",
          modelAlias: "fixture.selector",
          contractVersion: "adaptive-selection.v1",
          attemptedAt: NOW,
          durationMs: 57,
          tokenUsage: { input: 60, output: 31 }
        }
      }
    }
  }),
  rejected: makeAishaExperience({
    status: "settled",
    outcome: {
      ...deterministicFallback,
      reason: "invalid_proposal",
      failure: { code: "contract_rejected", retryable: false, retryAfterMs: null }
    }
  }),
  ineligible: makeAishaExperience({
    status: "settled",
    outcome: {
      ...deterministicFallback,
      reason: "ineligible_candidate",
      failure: null
    }
  }),
  stale: makeAishaExperience({
    status: "settled",
    outcome: {
      ...deterministicFallback,
      reason: "stale_round",
      failure: null
    }
  })
} as const;
