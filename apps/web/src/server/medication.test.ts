import type {
  StructuredCompletionRequest,
  StructuredCompletionTransport
} from "@homerounds/inference";
import { describe, expect, it, vi } from "vitest";

import { StructuredMedicationLabelTransport } from "./medication";

const provenance = {
  attemptId: "71f1b1b2-9e60-44d7-bb87-cdf5f96059d4",
  provider: "fireworks" as const,
  task: "medication_label_extraction" as const,
  modelAlias: "kimi-k2p6-vision-none",
  contractVersion: "medication-label.v1" as const,
  attemptedAt: "2026-07-17T09:00:00.000Z",
  durationMs: 120,
  tokenUsage: { input: 80, output: 40 }
};

const completeDraft = {
  observations: {
    product_name: { status: "detected", value: "Synthetic Demo Tablets", confidence: 0.9 },
    active_ingredient: { status: "missing", value: null, confidence: null },
    strength: { status: "uncertain", value: "10 mg", confidence: 0.6 },
    dose_form: { status: "detected", value: "tablet", confidence: 0.8 },
    directions: { status: "missing", value: null, confidence: null },
    expiry: { status: "missing", value: null, confidence: null },
    batch_number: { status: "missing", value: null, confidence: null }
  },
  missingInformation: ["Directions are not visible"]
};

function request() {
  return {
    roundId: "cc80d269-2f79-4328-a129-98cac85219e4",
    stateVersion: 2,
    metadata: {
      requestId: "72f1b1b2-9e60-44d7-bb87-cdf5f96059d4",
      captureMode: "file_upload" as const,
      mediaType: "image/png" as const,
      byteLength: 8,
      width: 320,
      height: 320,
      consentVersion: "synthetic-test-v1",
      consentGrantedAt: "2026-07-17T09:00:00.000Z",
      syntheticDataOnly: true as const,
      rawMediaRef: null
    },
    bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    signal: new AbortController().signal
  };
}

describe("structured medication label transport", () => {
  it("maps seven fixed generation keys into unique authoritative observations", async () => {
    let captured: StructuredCompletionRequest | undefined;
    const completion: StructuredCompletionTransport = {
      complete: vi.fn(async (input) => {
        captured = input;
        return { ok: true as const, content: JSON.stringify(completeDraft), provenance };
      })
    };
    const transport = new StructuredMedicationLabelTransport(
      completion,
      () => "73f1b1b2-9e60-44d7-bb87-cdf5f96059d4"
    );

    await expect(transport.extract(request())).resolves.toMatchObject({
      observations: [
        { field: "product_name", status: "detected" },
        { field: "active_ingredient", status: "missing" },
        { field: "strength", status: "uncertain" },
        { field: "dose_form", status: "detected" },
        { field: "directions", status: "missing" },
        { field: "expiry", status: "missing" },
        { field: "batch_number", status: "missing" }
      ],
      rawMediaRef: null
    });
    expect(JSON.stringify(captured?.responseSchema)).toContain('"product_name"');
    expect(JSON.stringify(captured?.responseSchema)).toContain('"maxItems":7');
    expect(JSON.stringify(captured?.responseSchema)).not.toContain('"oneOf"');
  });

  it("fails closed when the provider omits any fixed field", async () => {
    const incomplete = structuredClone(completeDraft) as Record<string, unknown>;
    const observations = incomplete.observations as Record<string, unknown>;
    delete observations.batch_number;
    const completion: StructuredCompletionTransport = {
      complete: () =>
        Promise.resolve({ ok: true as const, content: JSON.stringify(incomplete), provenance })
    };
    const transport = new StructuredMedicationLabelTransport(
      completion,
      () => "73f1b1b2-9e60-44d7-bb87-cdf5f96059d4"
    );

    await expect(transport.extract(request())).rejects.toMatchObject({
      code: "contract_rejected"
    });
  });
});
