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
import { runtimeInferenceSleep, type InferenceSleep } from "./structured-transport";

export type FakeAdaptiveSelectionProfile =
  "deterministic" | "medication" | "abstain" | "failure" | "slow";

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
      profile?: FakeAdaptiveSelectionProfile;
      slowDelayMs?: number;
      sleep?: InferenceSleep;
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
    const profile = this.dependencies.profile ?? "deterministic";
    const slowDelayMs = this.dependencies.slowDelayMs ?? 1_200;
    const sleep = this.dependencies.sleep ?? runtimeInferenceSleep;
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
    if (input.redFlagGate === "clear" && profile === "failure") {
      return {
        ok: false,
        failure: inferenceFailure("provider_unavailable", true)
      };
    }
    if (input.redFlagGate === "clear" && profile === "slow") {
      try {
        await sleep(slowDelayMs, signal);
      } catch {
        return {
          ok: false,
          failure: inferenceFailure(signal.aborted ? "cancelled" : "provider_unavailable", false)
        };
      }
      if (signal.aborted) {
        return {
          ok: false,
          failure: inferenceFailure("cancelled", false)
        };
      }
    }
    const medicationCandidate = input.candidates.find(
      (candidate) =>
        candidate.kind === "medication_label" &&
        candidate.availability.status === "available" &&
        candidate.estimatedBurdenSeconds <= input.burdenSecondsRemaining &&
        candidate.producesFactKeys.some((factKey) => input.neededFactKeys.includes(factKey))
    );
    if (input.redFlagGate === "clear" && profile === "medication" && !medicationCandidate) {
      return {
        ok: false,
        failure: inferenceFailure("contract_rejected", false),
        rejectionReason: "ineligible_candidate"
      };
    }
    const shouldAbstain = input.redFlagGate !== "clear" || profile === "abstain";
    const selectedCandidate = profile === "medication" ? medicationCandidate : fallback;
    const envelope = AdaptiveSelectionEnvelopeSchema.safeParse({
      roundId: input.roundId,
      stateVersion: input.stateVersion,
      decision: !shouldAbstain
        ? {
            decision: "select",
            candidateModuleId: selectedCandidate?.id,
            evidenceReferenceIds: [],
            rationale:
              profile === "medication"
                ? "The safe test provider selected the eligible synthetic medication review."
                : "The safe test provider selected the deterministic evidence route.",
            uncertainty: "low",
            missingInformation: []
          }
        : {
            decision: "abstain",
            candidateModuleId: null,
            evidenceReferenceIds: [],
            rationale:
              "The safe test provider abstained so the deterministic route remains authoritative.",
            uncertainty: "high",
            missingInformation:
              input.redFlagGate === "clear"
                ? ["A stronger synthetic signal"]
                : ["Safety gate clearance"]
          },
      provenance: {
        attemptId: this.dependencies.createId(),
        provider: "fake",
        task: "adaptive_module_selection",
        modelAlias: `fake-adaptive-${profile}-v1`,
        contractVersion: "adaptive-selection.v1",
        attemptedAt: this.dependencies.now(),
        durationMs: profile === "slow" ? slowDelayMs : 0,
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
