import {
  AdaptiveSelectionService,
  DisabledAdaptiveSelectionProvider,
  StructuredAdaptiveSelectionProvider,
  inferenceFailure,
  type AdaptiveSelectionProvider,
  type StructuredCompletionTransport
} from "../../../packages/inference/src/index";
import { describe, expect, it, vi } from "vitest";

import { adaptiveVoiceInputFixture, fireworksVoiceProvenanceFixture } from "./fixtures";

function currentAuthority(input = adaptiveVoiceInputFixture()) {
  return {
    roundId: input.roundId,
    stateVersion: input.stateVersion,
    syntheticDataOnly: true as const,
    redFlagGate: input.redFlagGate
  };
}

function successfulTransport(content: unknown): StructuredCompletionTransport {
  return {
    async complete() {
      return {
        ok: true,
        content: JSON.stringify(content),
        provenance: fireworksVoiceProvenanceFixture()
      };
    }
  };
}

function service(provider: AdaptiveSelectionProvider) {
  return new AdaptiveSelectionService({
    provider,
    readAuthorityState: async () => currentAuthority()
  });
}

describe("voice-candidate structured inference boundary", () => {
  it.each([
    {
      name: "invented tool-like module",
      decision: {
        decision: "select",
        candidateModuleId: "voice.set_urgency",
        evidenceReferenceIds: ["patient.report"],
        rationale: "Select an invented voice route.",
        uncertainty: "low",
        missingInformation: []
      },
      reason: "ineligible_candidate"
    },
    {
      name: "extra workflow-authority field",
      decision: {
        decision: "select",
        candidateModuleId: "voice.local.baseline",
        evidenceReferenceIds: ["patient.report"],
        rationale: "The optional research voice signal addresses the bounded evidence gap.",
        uncertainty: "low",
        missingInformation: [],
        urgency: "emergency"
      },
      reason: "invalid_proposal"
    }
  ])("rejects $name", async ({ decision, reason }) => {
    const provider = new StructuredAdaptiveSelectionProvider(successfulTransport(decision));

    await expect(
      provider.select(adaptiveVoiceInputFixture(), new AbortController().signal)
    ).resolves.toEqual({
      ok: false,
      failure: {
        code: "contract_rejected",
        retryable: false,
        retryAfterMs: null
      },
      rejectionReason: reason
    });
  });

  it("accepts a Fireworks abstention as a proposal without creating voice or action authority", async () => {
    const provider = new StructuredAdaptiveSelectionProvider(
      successfulTransport({
        decision: "abstain",
        candidateModuleId: null,
        evidenceReferenceIds: ["patient.report"],
        rationale: "Insufficient bounded evidence; deterministic application code should continue.",
        uncertainty: "high",
        missingInformation: ["A stronger synthetic signal"]
      })
    );

    const result = await service(provider).select(
      adaptiveVoiceInputFixture(),
      new AbortController().signal
    );

    expect(result).toMatchObject({
      status: "accepted",
      envelope: {
        decision: { decision: "abstain", candidateModuleId: null },
        provenance: { provider: "fireworks", task: "adaptive_module_selection" }
      }
    });
    expect(result).not.toHaveProperty("selectedModuleId");
    expect(result).not.toHaveProperty("actionId");
    expect(result).not.toHaveProperty("urgency");
  });

  it("makes a Fireworks failure and no-key disablement deterministically route-equivalent", async () => {
    const input = adaptiveVoiceInputFixture();
    const failedProvider: AdaptiveSelectionProvider = {
      async select() {
        return { ok: false, failure: inferenceFailure("timeout", false) };
      }
    };

    const [failure, disabled] = await Promise.all([
      service(failedProvider).select(input, new AbortController().signal),
      service(new DisabledAdaptiveSelectionProvider()).select(input, new AbortController().signal)
    ]);

    expect(failure).toEqual({
      status: "fallback",
      selectedModuleId: "capture.finger_ppg.pulse",
      reason: "provider_failure",
      patientRationale:
        "We’ll continue with Quality-gated finger pulse check, the safe route available for this round.",
      failure: { code: "timeout", retryable: false, retryAfterMs: null }
    });
    expect(disabled).toEqual({
      status: "fallback",
      selectedModuleId: "capture.finger_ppg.pulse",
      reason: "disabled",
      patientRationale: failure.status === "fallback" ? failure.patientRationale : "unreachable",
      failure: { code: "missing_configuration", retryable: false, retryAfterMs: null }
    });
  });

  it("refuses a stale round before a Fireworks-shaped provider can observe the input", async () => {
    const input = adaptiveVoiceInputFixture();
    const select = vi.fn<AdaptiveSelectionProvider["select"]>();
    const staleService = new AdaptiveSelectionService({
      provider: { select },
      readAuthorityState: async () => ({
        ...currentAuthority(input),
        stateVersion: input.stateVersion + 1
      })
    });

    await expect(staleService.select(input, new AbortController().signal)).resolves.toEqual({
      status: "fallback",
      selectedModuleId: "capture.finger_ppg.pulse",
      reason: "stale_round",
      patientRationale:
        "We’ll continue with Quality-gated finger pulse check, the safe route available for this round.",
      failure: null
    });
    expect(select).not.toHaveBeenCalled();
  });
});
