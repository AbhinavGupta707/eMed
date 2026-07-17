import {
  AdaptiveSelectionEnvelopeSchema,
  AdaptiveSelectionInputSchema,
  type AdaptiveSelectionInput
} from "@homerounds/contracts/inference";

import type {
  AdaptiveSelectionProvider,
  AdaptiveSelectionProviderAttempt
} from "./adaptive-selection";
import { inferenceFailure } from "./failures";

export class DisabledAdaptiveSelectionProvider implements AdaptiveSelectionProvider {
  async select(): Promise<AdaptiveSelectionProviderAttempt> {
    return {
      ok: false,
      failure: inferenceFailure("missing_configuration", false)
    };
  }
}

export class FakeAdaptiveSelectionProvider implements AdaptiveSelectionProvider {
  public constructor(
    private readonly dependencies: {
      createId: () => string;
      now: () => string;
    }
  ) {}

  async select(
    inputValue: AdaptiveSelectionInput,
    signal: AbortSignal
  ): Promise<AdaptiveSelectionProviderAttempt> {
    const parsedInput = AdaptiveSelectionInputSchema.safeParse(inputValue);
    if (!parsedInput.success) {
      return {
        ok: false,
        failure: inferenceFailure("contract_rejected", false),
        rejectionReason: "invalid_proposal"
      };
    }
    const input = parsedInput.data;
    if (signal.aborted) {
      return {
        ok: false,
        failure: inferenceFailure("cancelled", false)
      };
    }
    const fallback = input.candidates.find(({ id }) => id === input.deterministicFallbackModuleId);
    if (!fallback) {
      return {
        ok: false,
        failure: inferenceFailure("contract_rejected", false),
        rejectionReason: "ineligible_candidate"
      };
    }
    const envelope = AdaptiveSelectionEnvelopeSchema.safeParse({
      roundId: input.roundId,
      stateVersion: input.stateVersion,
      decision:
        input.redFlagGate === "clear"
          ? {
              decision: "select",
              candidateModuleId: fallback.id,
              evidenceReferenceIds: [],
              rationale: "The safe test provider selected the deterministic evidence route.",
              uncertainty: "low",
              missingInformation: []
            }
          : {
              decision: "abstain",
              candidateModuleId: null,
              evidenceReferenceIds: [],
              rationale:
                "The safe test provider cannot select a route until the safety gate is clear.",
              uncertainty: "high",
              missingInformation: ["Safety gate clearance"]
            },
      provenance: {
        attemptId: this.dependencies.createId(),
        provider: "fake",
        task: "adaptive_module_selection",
        modelAlias: "fake-adaptive-v1",
        contractVersion: "adaptive-selection.v1",
        attemptedAt: this.dependencies.now(),
        durationMs: 0,
        tokenUsage: null
      }
    });
    if (!envelope.success) {
      return {
        ok: false,
        failure: inferenceFailure("contract_rejected", false),
        rejectionReason: "invalid_proposal"
      };
    }
    return {
      ok: true,
      envelope: envelope.data
    };
  }
}
