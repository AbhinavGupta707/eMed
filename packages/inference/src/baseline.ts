import {
  AdaptiveSelectionEnvelopeSchema,
  AdaptiveSelectionInputSchema,
  InferenceProviderFailureSchema,
  type AdaptiveSelectionEnvelope,
  type AdaptiveSelectionInput,
  type InferenceProviderFailure
} from "@homerounds/contracts/inference";

export type AdaptiveSelectionProviderAttempt =
  | { readonly ok: true; readonly envelope: AdaptiveSelectionEnvelope }
  | { readonly ok: false; readonly failure: InferenceProviderFailure };

export type AdaptiveSelectionProvider = {
  select(
    input: AdaptiveSelectionInput,
    signal: AbortSignal
  ): Promise<AdaptiveSelectionProviderAttempt>;
};

export class DisabledAdaptiveSelectionProvider implements AdaptiveSelectionProvider {
  async select(): Promise<AdaptiveSelectionProviderAttempt> {
    return {
      ok: false,
      failure: InferenceProviderFailureSchema.parse({
        code: "missing_configuration",
        retryable: false,
        retryAfterMs: null
      })
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
    const input = AdaptiveSelectionInputSchema.parse(inputValue);
    if (signal.aborted) {
      return {
        ok: false,
        failure: InferenceProviderFailureSchema.parse({
          code: "cancelled",
          retryable: false,
          retryAfterMs: null
        })
      };
    }
    const fallback = input.candidates.find(({ id }) => id === input.deterministicFallbackModuleId);
    if (!fallback) {
      return {
        ok: false,
        failure: InferenceProviderFailureSchema.parse({
          code: "contract_rejected",
          retryable: false,
          retryAfterMs: null
        })
      };
    }
    return {
      ok: true,
      envelope: AdaptiveSelectionEnvelopeSchema.parse({
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
      })
    };
  }
}
