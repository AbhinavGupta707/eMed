import {
  AdaptiveSelectionEnvelopeSchema,
  AdaptiveSelectionInputSchema,
  InferenceProvenanceSchema,
  MedicationLabelImageMetadataSchema,
  MedicationLabelProposalSchema,
  type AdaptiveSelectionDecision,
  type AdaptiveSelectionEnvelope,
  type AdaptiveSelectionInput,
  type InferenceProvenance,
  type MedicationLabelImageMetadata,
  type MedicationLabelProposal
} from "../../packages/contracts/src/index";
import type { StructuredCompletionRequest } from "../../packages/inference/src/index";

export const AI_TEST_NOW = "2026-07-17T12:00:00.000Z";
export const AI_TEST_ROUND_ID = "70000000-0000-4000-8000-000000000001";
export const AI_TEST_PROPOSAL_ID = "70000000-0000-4000-8000-000000000002";
export const AI_TEST_ATTEMPT_ID = "70000000-0000-4000-8000-000000000003";
export const AI_TEST_REQUEST_ID = "70000000-0000-4000-8000-000000000004";
export const AI_TEST_FACT_ID = "70000000-0000-4000-8000-000000000005";

const BASE_ADAPTIVE_INPUT = {
  contractVersion: "adaptive-selection.v1",
  roundId: AI_TEST_ROUND_ID,
  stateVersion: 2,
  syntheticDataOnly: true,
  redFlagGate: "clear",
  neededFactKeys: ["pulse_bpm", "follow_up_answer", "medication_label_observation"],
  burdenSecondsRemaining: 120,
  context: [
    {
      referenceId: "patient.report",
      summary: "The synthetic report has one unresolved timing detail.",
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
      description: "A short quality-gated local optical pulse check.",
      producesFactKeys: ["pulse_bpm"],
      availability: { status: "available" },
      estimatedBurdenSeconds: 30,
      deterministicRank: 0
    },
    {
      id: "followup.timing",
      kind: "structured_follow_up",
      label: "Clarify timing",
      description: "Ask one bounded structured question about symptom timing.",
      producesFactKeys: ["follow_up_answer"],
      availability: { status: "available" },
      estimatedBurdenSeconds: 20,
      deterministicRank: 1
    },
    {
      id: "medication.label",
      kind: "medication_label",
      label: "Review a medication label",
      description: "Review visible synthetic label fields before explicit confirmation.",
      producesFactKeys: ["medication_label_observation"],
      availability: { status: "available" },
      estimatedBurdenSeconds: 60,
      deterministicRank: 2
    }
  ],
  deterministicFallbackModuleId: "pulse.local"
} as const;

export function adaptiveInputFixture(
  overrides: Partial<AdaptiveSelectionInput> = {}
): AdaptiveSelectionInput {
  return AdaptiveSelectionInputSchema.parse({ ...BASE_ADAPTIVE_INPUT, ...overrides });
}

export function selectionDecisionFixture(
  candidateModuleId = "followup.timing",
  overrides: Partial<AdaptiveSelectionDecision> = {}
): AdaptiveSelectionDecision {
  return {
    decision: "select",
    candidateModuleId,
    evidenceReferenceIds: ["patient.report"],
    rationale: "This eligible route addresses a remaining synthetic evidence gap.",
    uncertainty: "low",
    missingInformation: [],
    ...overrides
  } as AdaptiveSelectionDecision;
}

export function inferenceProvenanceFixture(
  overrides: Partial<InferenceProvenance> = {}
): InferenceProvenance {
  return InferenceProvenanceSchema.parse({
    attemptId: AI_TEST_ATTEMPT_ID,
    provider: "fake",
    task: "adaptive_module_selection",
    modelAlias: "fake-adversarial-evaluation-v1",
    contractVersion: "adaptive-selection.v1",
    attemptedAt: AI_TEST_NOW,
    durationMs: 1,
    tokenUsage: null,
    ...overrides
  });
}

export function adaptiveEnvelopeFixture(
  input: AdaptiveSelectionInput = adaptiveInputFixture(),
  decision: AdaptiveSelectionDecision = selectionDecisionFixture(),
  overrides: Partial<AdaptiveSelectionEnvelope> = {}
): AdaptiveSelectionEnvelope {
  return AdaptiveSelectionEnvelopeSchema.parse({
    roundId: input.roundId,
    stateVersion: input.stateVersion,
    decision,
    provenance: inferenceProvenanceFixture(),
    ...overrides
  });
}

export function medicationImageMetadataFixture(
  overrides: Partial<MedicationLabelImageMetadata> = {}
): MedicationLabelImageMetadata {
  const bytes = pngBytesFixture();
  return MedicationLabelImageMetadataSchema.parse({
    requestId: AI_TEST_REQUEST_ID,
    captureMode: "file_upload",
    mediaType: "image/png",
    byteLength: bytes.byteLength,
    width: 640,
    height: 640,
    consentVersion: "synthetic-demo-v1",
    consentGrantedAt: AI_TEST_NOW,
    syntheticDataOnly: true,
    rawMediaRef: null,
    ...overrides
  });
}

export function pngBytesFixture(): Uint8Array {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x53, 0x59, 0x4e, 0x54, 0x48
  ]);
}

export function medicationProposalFixture(
  overrides: Partial<MedicationLabelProposal> = {}
): MedicationLabelProposal {
  return MedicationLabelProposalSchema.parse({
    contractVersion: "medication-label.v1",
    proposalId: AI_TEST_PROPOSAL_ID,
    roundId: AI_TEST_ROUND_ID,
    stateVersion: 2,
    observations: [
      {
        field: "product_name",
        status: "detected",
        value: "Synthetic Demo Tablets",
        confidence: 0.98
      },
      {
        field: "directions",
        status: "missing",
        value: null,
        confidence: null
      }
    ],
    missingInformation: ["Directions are not visible on the synthetic label"],
    provenance: inferenceProvenanceFixture({
      provider: "fireworks",
      task: "medication_label_extraction",
      modelAlias: "kimi-k2p6-vision-none",
      contractVersion: "medication-label.v1"
    }),
    rawMediaRef: null,
    ...overrides
  });
}

export function structuredSelectionRequestFixture(): StructuredCompletionRequest {
  return {
    task: "adaptive_module_selection",
    modality: "text",
    contractVersion: "adaptive-selection.v1",
    messages: [
      { role: "system", content: "Return only a bounded synthetic JSON decision." },
      { role: "user", content: "Use only the supplied server-created synthetic candidates." }
    ],
    responseSchemaName: "adaptive_selection_decision",
    responseSchema: {
      type: "object",
      properties: { decision: { type: "string" } },
      required: ["decision"],
      additionalProperties: false
    }
  };
}

export function fireworksSuccessResponse(content: string): Response {
  return new Response(
    JSON.stringify({
      choices: [{ finish_reason: "stop", message: { content } }],
      usage: { prompt_tokens: 80, completion_tokens: 20 }
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}
