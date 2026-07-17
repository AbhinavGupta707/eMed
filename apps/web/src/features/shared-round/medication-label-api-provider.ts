"use client";

import { HomeRoundsApiError, type HomeRoundsApiClient } from "@homerounds/api-client";
import type {
  MedicationLabelExtractionInput,
  MedicationLabelExtractionOutcome,
  MedicationLabelProvider,
  MedicationLabelProviderAvailability
} from "@homerounds/assessments";
import {
  InferenceProviderFailureSchema,
  MedicationLabelImageMetadataSchema
} from "@homerounds/contracts";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 32_768;
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function failed(
  code: "cancelled" | "contract_rejected" | "provider_unavailable" | "rate_limited"
): Extract<MedicationLabelExtractionOutcome, { status: "failed" }> {
  return {
    status: "failed",
    failure: InferenceProviderFailureSchema.parse({
      code,
      retryable: code === "provider_unavailable" || code === "rate_limited",
      retryAfterMs: null
    })
  };
}

export class ApiMedicationLabelProvider implements MedicationLabelProvider {
  readonly kind = "fireworks" as const;

  constructor(private readonly api: Pick<HomeRoundsApiClient, "submitMedicationLabelImage">) {}

  checkAvailability(signal?: AbortSignal): Promise<MedicationLabelProviderAvailability> {
    return Promise.resolve(
      signal?.aborted
        ? { available: false, failure: failed("cancelled").failure }
        : { available: true }
    );
  }

  async extract(input: MedicationLabelExtractionInput): Promise<MedicationLabelExtractionOutcome> {
    if (input.signal.aborted) return failed("cancelled");
    try {
      const metadata = MedicationLabelImageMetadataSchema.parse(input.metadata);
      const result = await this.api.submitMedicationLabelImage(
        input.roundId,
        {
          expectedStateVersion: input.stateVersion,
          metadata,
          bytesBase64: bytesToBase64(input.bytes)
        },
        input.signal
      );
      return result.outcome;
    } catch (error: unknown) {
      if (input.signal.aborted) return failed("cancelled");
      if (error instanceof HomeRoundsApiError) {
        if (error.envelope.error.code === "rate_limited") return failed("rate_limited");
        if (error.envelope.error.code === "unavailable") return failed("provider_unavailable");
      }
      return failed("contract_rejected");
    } finally {
      input.bytes.fill(0);
    }
  }
}
