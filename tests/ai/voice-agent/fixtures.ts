import {
  AdaptiveSelectionEnvelopeSchema,
  AdaptiveSelectionInputSchema,
  InferenceProvenanceSchema,
  VoiceAgentReportProposalSchema,
  VoiceBiomarkerFactSchema,
  type AdaptiveSelectionDecision,
  type AdaptiveSelectionEnvelope,
  type AdaptiveSelectionInput,
  type InferenceProvenance,
  type VoiceAgentReportProposal,
  type VoiceBiomarkerFact
} from "../../../packages/contracts/src/index";

export const VOICE_TEST_NOW = "2026-07-17T20:00:00.000Z";
export const VOICE_TEST_ROUND_ID = "88000000-0000-4000-8000-000000000001";
export const VOICE_TEST_SESSION_ID = "88000000-0000-4000-8000-000000000002";
export const VOICE_TEST_FACT_ID = "88000000-0000-4000-8000-000000000003";
export const VOICE_TEST_PROPOSAL_ID = "88000000-0000-4000-8000-000000000004";
export const VOICE_TEST_ATTEMPT_ID = "88000000-0000-4000-8000-000000000005";

const BASE_VOICE_PROPOSAL = {
  contractVersion: "voice-report-proposal.v1",
  weakness: "unknown",
  palpitations: "intermittent",
  redFlags: {
    chestPain: "no",
    severeBreathlessness: "unsure",
    fainted: "no"
  },
  note: "Synthetic report awaiting explicit patient review.",
  unresolvedFields: ["weakness", "severe_breathlessness"]
} as const;

export function voiceProposalFixture(
  overrides: Partial<VoiceAgentReportProposal> = {}
): VoiceAgentReportProposal {
  return VoiceAgentReportProposalSchema.parse({ ...BASE_VOICE_PROPOSAL, ...overrides });
}

const BASE_VOICE_FACT = {
  factId: VOICE_TEST_FACT_ID,
  roundId: VOICE_TEST_ROUND_ID,
  assessmentSessionId: VOICE_TEST_SESSION_ID,
  provider: "local_voice_features",
  observedAt: VOICE_TEST_NOW,
  durationMs: 7_000,
  algorithmVersion: "local_sustained_vowel_features_v1",
  features: {
    medianFundamentalFrequencyHz: 180,
    pitchVariabilitySemitones: 0.04,
    jitterPercent: 0.03,
    shimmerPercent: 0.2,
    harmonicToNoiseRatioDb: 31,
    phonationDurationMs: 7_000
  },
  quality: {
    status: "pass",
    score: 0.92,
    reasons: [],
    metrics: {
      sampleRateHz: 8_000,
      durationMs: 7_000,
      clippingFraction: 0,
      voicedFraction: 1,
      estimatedSnrDb: 31
    }
  },
  researchOnly: true,
  rawMediaRef: null
} as const;

export function voiceFactFixture(overrides: Partial<VoiceBiomarkerFact> = {}): VoiceBiomarkerFact {
  return VoiceBiomarkerFactSchema.parse({ ...BASE_VOICE_FACT, ...overrides });
}

const BASE_ADAPTIVE_VOICE_INPUT = {
  contractVersion: "adaptive-selection.v1",
  roundId: VOICE_TEST_ROUND_ID,
  stateVersion: 3,
  syntheticDataOnly: true,
  redFlagGate: "clear",
  neededFactKeys: ["pulse_bpm", "voice_biomarker_observation"],
  burdenSecondsRemaining: 90,
  context: [
    {
      referenceId: "patient.report",
      summary: "Confirmed synthetic answers leave a bounded evidence gap.",
      factIds: ["synthetic-confirmed-report"]
    }
  ],
  candidates: [
    {
      id: "capture.finger_ppg.pulse",
      kind: "pulse_capture",
      label: "Quality-gated finger pulse check",
      description: "A deterministic local pulse route.",
      producesFactKeys: ["pulse_bpm"],
      availability: { status: "available" },
      estimatedBurdenSeconds: 30,
      deterministicRank: 0
    },
    {
      id: "voice.local.baseline",
      kind: "voice_biomarker",
      label: "Optional research voice signal",
      description: "A local sustained-vowel research signal with a deterministic quality gate.",
      producesFactKeys: ["voice_biomarker_observation"],
      availability: { status: "available" },
      estimatedBurdenSeconds: 20,
      deterministicRank: 1
    }
  ],
  deterministicFallbackModuleId: "capture.finger_ppg.pulse"
} as const;

export function adaptiveVoiceInputFixture(
  overrides: Partial<AdaptiveSelectionInput> = {}
): AdaptiveSelectionInput {
  return AdaptiveSelectionInputSchema.parse({ ...BASE_ADAPTIVE_VOICE_INPUT, ...overrides });
}

export function fireworksVoiceProvenanceFixture(
  overrides: Partial<InferenceProvenance> = {}
): InferenceProvenance {
  return InferenceProvenanceSchema.parse({
    attemptId: VOICE_TEST_ATTEMPT_ID,
    provider: "fireworks",
    task: "adaptive_module_selection",
    modelAlias: "deepseek-v4-pro-none",
    contractVersion: "adaptive-selection.v1",
    attemptedAt: VOICE_TEST_NOW,
    durationMs: 2,
    tokenUsage: null,
    ...overrides
  });
}

export function adaptiveVoiceEnvelopeFixture(
  input: AdaptiveSelectionInput = adaptiveVoiceInputFixture(),
  decision: AdaptiveSelectionDecision = {
    decision: "select",
    candidateModuleId: "voice.local.baseline",
    evidenceReferenceIds: ["patient.report"],
    rationale: "The optional research voice signal addresses the bounded evidence gap.",
    uncertainty: "medium",
    missingInformation: []
  },
  overrides: Partial<AdaptiveSelectionEnvelope> = {}
): AdaptiveSelectionEnvelope {
  return AdaptiveSelectionEnvelopeSchema.parse({
    roundId: input.roundId,
    stateVersion: input.stateVersion,
    decision,
    provenance: fireworksVoiceProvenanceFixture(),
    ...overrides
  });
}
