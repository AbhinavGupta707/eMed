import type { MedicationLabelProposal } from "@homerounds/contracts/medication";
import { describe, expect, it, vi } from "vitest";

import { MedicationLabelTransportError } from "./errors";
import {
  DisabledMedicationLabelProvider,
  FakeMedicationLabelProvider,
  TransportMedicationLabelProvider
} from "./provider";
import type { MedicationLabelExtractionTransport } from "./types";

const ROUND_ID = "cc80d269-2f79-4328-a129-98cac85219e4";
const REQUEST_ID = "7fd16467-bfa6-4277-94b5-3673b34a6c4d";
const PROPOSAL_ID = "fb99983d-cc81-454e-9c92-f8e99e0891de";
const ATTEMPT_ID = "2ca00a52-523d-42fb-91e1-f708bfa6f532";
const ATTEMPTED_AT = "2026-07-17T09:00:00.000Z";

function pngBytes(): Uint8Array {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
}

function metadata(byteLength = 12): unknown {
  return {
    requestId: REQUEST_ID,
    captureMode: "file_upload",
    mediaType: "image/png",
    byteLength,
    width: 1_280,
    height: 720,
    consentVersion: "synthetic-demo-v1",
    consentGrantedAt: ATTEMPTED_AT,
    syntheticDataOnly: true,
    rawMediaRef: null
  };
}

function fireworksProposal(overrides: Readonly<Record<string, unknown>> = {}): unknown {
  return {
    contractVersion: "medication-label.v1",
    proposalId: PROPOSAL_ID,
    roundId: ROUND_ID,
    stateVersion: 3,
    observations: [
      { field: "product_name", status: "detected", value: "Demo tablet", confidence: 0.94 },
      { field: "strength", status: "uncertain", value: "5 mg", confidence: 0.51 },
      { field: "expiry", status: "missing", value: null, confidence: null }
    ],
    missingInformation: ["Expiry is not visible"],
    provenance: {
      attemptId: ATTEMPT_ID,
      provider: "fireworks",
      task: "medication_label_extraction",
      modelAlias: "kimi-k2p6-vision",
      contractVersion: "medication-label.v1",
      attemptedAt: ATTEMPTED_AT,
      durationMs: 420,
      tokenUsage: { input: 128, output: 64 }
    },
    rawMediaRef: null,
    ...overrides
  };
}

function extractInput(bytes = pngBytes(), signal = new AbortController().signal) {
  return {
    roundId: ROUND_ID,
    stateVersion: 3,
    metadata: metadata(bytes.byteLength),
    bytes,
    signal
  };
}

describe("medication label providers", () => {
  it("returns a bounded deterministic fake proposal and zeroes image bytes", async () => {
    const ids = [PROPOSAL_ID, ATTEMPT_ID];
    const provider = new FakeMedicationLabelProvider(
      {
        observations: [
          { field: "product_name", status: "detected", value: "Demo tablet", confidence: 0.9 },
          { field: "strength", status: "uncertain", value: "5 mg", confidence: 0.5 },
          { field: "expiry", status: "missing", value: null, confidence: null }
        ],
        missingInformation: ["Expiry is not visible"]
      },
      { createId: () => ids.shift() ?? crypto.randomUUID(), now: () => ATTEMPTED_AT }
    );
    const bytes = pngBytes();

    await expect(provider.checkAvailability()).resolves.toEqual({ available: true });
    await expect(provider.extract(extractInput(bytes))).resolves.toEqual({
      status: "proposed",
      proposal: expect.objectContaining({
        proposalId: PROPOSAL_ID,
        roundId: ROUND_ID,
        stateVersion: 3,
        rawMediaRef: null,
        provenance: expect.objectContaining({
          attemptId: ATTEMPT_ID,
          provider: "fake",
          task: "medication_label_extraction"
        })
      })
    });
    expect([...bytes]).toEqual(new Array(12).fill(0));
  });

  it("keeps disabled/no-key behavior typed and never returns a proposal", async () => {
    const provider = new DisabledMedicationLabelProvider();
    const bytes = pngBytes();

    await expect(provider.checkAvailability()).resolves.toEqual({
      available: false,
      failure: { code: "missing_configuration", retryable: false, retryAfterMs: null }
    });
    await expect(provider.extract(extractInput(bytes))).resolves.toEqual({
      status: "failed",
      failure: { code: "missing_configuration", retryable: false, retryAfterMs: null }
    });
    expect([...bytes]).toEqual(new Array(12).fill(0));
  });

  it("rejects malformed metadata and mismatched byte signatures before transport", async () => {
    const transport: MedicationLabelExtractionTransport = { extract: vi.fn() };
    const provider = new TransportMedicationLabelProvider(transport);
    const bytes = new Uint8Array(12).fill(7);

    await expect(provider.extract(extractInput(bytes))).resolves.toEqual({
      status: "failed",
      failure: { code: "contract_rejected", retryable: false, retryAfterMs: null }
    });
    expect(transport.extract).not.toHaveBeenCalled();
    expect([...bytes]).toEqual(new Array(12).fill(0));
  });

  it("accepts only a matching strict provider proposal", async () => {
    const transport: MedicationLabelExtractionTransport = {
      extract: vi.fn(async () => fireworksProposal())
    };
    const provider = new TransportMedicationLabelProvider(transport);

    await expect(provider.extract(extractInput())).resolves.toEqual({
      status: "proposed",
      proposal: fireworksProposal()
    });
    expect(transport.extract).toHaveBeenCalledWith(
      expect.objectContaining({
        roundId: ROUND_ID,
        stateVersion: 3,
        metadata: expect.objectContaining({ syntheticDataOnly: true, rawMediaRef: null }),
        bytes: expect.any(Uint8Array),
        signal: expect.any(AbortSignal)
      })
    );
  });

  it.each([
    ["a stale round", { roundId: "14df34c4-8204-4810-8113-37b63c963a91" }],
    ["provider mismatch", { provenance: { ...fireworksProposalProvenance(), provider: "fake" } }],
    ["extra provider payload", { providerPayload: { output: "must not cross" } }]
  ])("rejects %s without forwarding provider output", async (_label, override) => {
    const provider = new TransportMedicationLabelProvider({
      extract: vi.fn(async () => fireworksProposal(override))
    });

    await expect(provider.extract(extractInput())).resolves.toEqual({
      status: "failed",
      failure: { code: "contract_rejected", retryable: false, retryAfterMs: null }
    });
  });

  it("maps safe rate-limit metadata without exposing a provider error", async () => {
    const provider = new TransportMedicationLabelProvider({
      extract: vi.fn(async () => {
        throw new MedicationLabelTransportError("rate_limited", 2_000);
      })
    });

    await expect(provider.extract(extractInput())).resolves.toEqual({
      status: "failed",
      failure: { code: "rate_limited", retryable: true, retryAfterMs: 2_000 }
    });
  });

  it("cancels an in-flight transport, zeroes the buffer, and emits no logs", async () => {
    let resolveTransport: ((value: unknown) => void) | undefined;
    const transport = new Promise<unknown>((resolve) => {
      resolveTransport = resolve;
    });
    const provider = new TransportMedicationLabelProvider({ extract: vi.fn(() => transport) });
    const controller = new AbortController();
    const bytes = pngBytes();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const pending = provider.extract(extractInput(bytes, controller.signal));

    controller.abort();
    await expect(pending).resolves.toEqual({
      status: "failed",
      failure: { code: "cancelled", retryable: false, retryAfterMs: null }
    });
    expect([...bytes]).toEqual(new Array(12).fill(0));
    expect(consoleError).not.toHaveBeenCalled();
    resolveTransport?.(fireworksProposal());
  });

  it("redacts unknown transport failures and never serializes the raw error", async () => {
    const secretProviderPayload = "raw-provider-payload-must-not-escape";
    const provider = new TransportMedicationLabelProvider({
      extract: vi.fn(async () => {
        throw new Error(secretProviderPayload);
      })
    });

    const outcome = await provider.extract(extractInput());

    expect(outcome).toEqual({
      status: "failed",
      failure: { code: "provider_unavailable", retryable: true, retryAfterMs: null }
    });
    expect(JSON.stringify(outcome)).not.toContain(secretProviderPayload);
  });
});

function fireworksProposalProvenance(): MedicationLabelProposal["provenance"] {
  return {
    attemptId: ATTEMPT_ID,
    provider: "fireworks",
    task: "medication_label_extraction",
    modelAlias: "kimi-k2p6-vision",
    contractVersion: "medication-label.v1",
    attemptedAt: ATTEMPTED_AT,
    durationMs: 420,
    tokenUsage: { input: 128, output: 64 }
  };
}
