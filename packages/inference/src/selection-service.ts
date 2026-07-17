import {
  AdaptiveSelectionEnvelopeSchema,
  AdaptiveSelectionInputSchema,
  AdaptiveSelectionOutcomeSchema,
  type AdaptiveSelectionFallbackReason,
  type AdaptiveSelectionInput,
  type AdaptiveSelectionOutcome,
  type InferenceProviderFailure
} from "@homerounds/contracts/inference";
import { z } from "zod";

import {
  validateAdaptiveSelectionDecision,
  type AdaptiveSelectionProvider,
  type AdaptiveSelectionProviderAttempt
} from "./adaptive-selection";
import { inferenceFailure } from "./failures";

export const AdaptiveSelectionAuthorityStateSchema = z
  .object({
    roundId: AdaptiveSelectionInputSchema.shape.roundId,
    stateVersion: AdaptiveSelectionInputSchema.shape.stateVersion,
    syntheticDataOnly: AdaptiveSelectionInputSchema.shape.syntheticDataOnly,
    redFlagGate: AdaptiveSelectionInputSchema.shape.redFlagGate
  })
  .strict();

export type AdaptiveSelectionAuthorityState = z.infer<typeof AdaptiveSelectionAuthorityStateSchema>;

export type AdaptiveSelectionAuthorityReader = (
  roundId: string,
  signal: AbortSignal
) => Promise<AdaptiveSelectionAuthorityState | null>;

function fallbackRationale(input: AdaptiveSelectionInput): string {
  const fallback = input.candidates.find(({ id }) => id === input.deterministicFallbackModuleId);
  return `We’ll continue with ${fallback?.label ?? "the deterministic evidence route"}, the safe route available for this round.`;
}

export function createAdaptiveSelectionFallback(
  input: AdaptiveSelectionInput,
  reason: AdaptiveSelectionFallbackReason,
  failure: InferenceProviderFailure | null
): AdaptiveSelectionOutcome {
  return AdaptiveSelectionOutcomeSchema.parse({
    status: "fallback",
    selectedModuleId: input.deterministicFallbackModuleId,
    reason,
    patientRationale: fallbackRationale(input),
    failure
  });
}

function authorityRefusalReason(
  state: AdaptiveSelectionAuthorityState | null,
  input: AdaptiveSelectionInput
): Extract<AdaptiveSelectionFallbackReason, "red_flag_gate_not_clear" | "stale_round"> | null {
  if (state?.redFlagGate !== undefined && state.redFlagGate !== "clear") {
    return "red_flag_gate_not_clear";
  }
  if (
    !state ||
    state.roundId !== input.roundId ||
    state.stateVersion !== input.stateVersion ||
    state.syntheticDataOnly !== true
  ) {
    return "stale_round";
  }
  return null;
}

export class AdaptiveSelectionService {
  public constructor(
    private readonly dependencies: {
      readonly provider: AdaptiveSelectionProvider;
      readonly readAuthorityState: AdaptiveSelectionAuthorityReader;
    }
  ) {}

  async select(
    inputValue: AdaptiveSelectionInput,
    signal: AbortSignal
  ): Promise<AdaptiveSelectionOutcome> {
    const input = AdaptiveSelectionInputSchema.parse(inputValue);
    if (input.redFlagGate !== "clear") {
      return createAdaptiveSelectionFallback(input, "red_flag_gate_not_clear", null);
    }
    if (signal.aborted) {
      return createAdaptiveSelectionFallback(
        input,
        "provider_failure",
        inferenceFailure("cancelled", false)
      );
    }

    const before = await this.readAuthorityState(input, signal);
    if (signal.aborted) {
      return createAdaptiveSelectionFallback(
        input,
        "provider_failure",
        inferenceFailure("cancelled", false)
      );
    }
    if (before) {
      return createAdaptiveSelectionFallback(input, before, null);
    }

    let attempt: AdaptiveSelectionProviderAttempt;
    try {
      attempt = await this.dependencies.provider.select(input, signal);
    } catch {
      attempt = { ok: false as const, failure: inferenceFailure("provider_unavailable", false) };
    }

    const after = await this.readAuthorityState(input, signal);
    if (signal.aborted) {
      return createAdaptiveSelectionFallback(
        input,
        "provider_failure",
        inferenceFailure("cancelled", false)
      );
    }
    if (after) {
      return createAdaptiveSelectionFallback(input, after, null);
    }
    if (!attempt.ok) {
      const reason =
        attempt.rejectionReason ??
        (attempt.failure.code === "missing_configuration" ? "disabled" : "provider_failure");
      return createAdaptiveSelectionFallback(input, reason, attempt.failure);
    }

    const envelope = AdaptiveSelectionEnvelopeSchema.safeParse(attempt.envelope);
    if (!envelope.success) {
      return createAdaptiveSelectionFallback(
        input,
        "invalid_proposal",
        inferenceFailure("contract_rejected", false)
      );
    }
    if (
      envelope.data.roundId !== input.roundId ||
      envelope.data.stateVersion !== input.stateVersion
    ) {
      return createAdaptiveSelectionFallback(input, "stale_round", null);
    }

    const acceptedDecision = validateAdaptiveSelectionDecision(envelope.data.decision, input);
    if (!acceptedDecision.ok) {
      return createAdaptiveSelectionFallback(
        input,
        acceptedDecision.reason,
        inferenceFailure("contract_rejected", false)
      );
    }

    return AdaptiveSelectionOutcomeSchema.parse({ status: "accepted", envelope: envelope.data });
  }

  private async readAuthorityState(
    input: AdaptiveSelectionInput,
    signal: AbortSignal
  ): Promise<Extract<
    AdaptiveSelectionFallbackReason,
    "red_flag_gate_not_clear" | "stale_round"
  > | null> {
    let stateValue: AdaptiveSelectionAuthorityState | null;
    try {
      stateValue = await this.dependencies.readAuthorityState(input.roundId, signal);
    } catch {
      return "stale_round";
    }
    const state = AdaptiveSelectionAuthorityStateSchema.safeParse(stateValue);
    return authorityRefusalReason(state.success ? state.data : null, input);
  }
}
