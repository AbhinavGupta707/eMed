import { expect, it } from "vitest";

import { FetchVitalLensInferenceTransport, VitalLensProxyService } from "./providers";

const apiKey = process.env.VITALLENS_API_KEY;
const liveEnabled = process.env.RUN_LIVE_VITALLENS_TESTS === "true" && Boolean(apiKey);
const liveIt = liveEnabled ? it : it.skip;

liveIt(
  "returns a typed non-measurement result for an identifier-free no-face RGB24 payload",
  async () => {
    const now = new Date().toISOString();
    const frameCount = 75;
    const bytes = new Uint8Array(frameCount * 40 * 40 * 3).fill(17);
    const service = new VitalLensProxyService(
      {
        enabled: true,
        apiKey: apiKey ?? "",
        providerVersion: "vitallens-2.0",
        consentVersion: "homerounds-vital-signs-demo-v1",
        maxPayloadBytes: 5_000_000,
        requestTimeoutMs: 30_000
      },
      new FetchVitalLensInferenceTransport(),
      () => now
    );

    const result = await service.infer({
      providerVersion: "vitallens-2.0",
      requestId: crypto.randomUUID(),
      consentVersion: "homerounds-vital-signs-demo-v1",
      consentGrantedAt: now,
      metadata: {
        contentType: "application/octet-stream",
        byteLength: bytes.byteLength,
        durationMs: 5_000,
        frameCount,
        width: 40,
        height: 40,
        audioIncluded: false
      },
      bytes,
      signal: new AbortController().signal
    });

    expect(["retry", "unavailable", "failed"]).toContain(result.status);
    expect(JSON.stringify(result)).not.toMatch(/heartRateBpm|waveform|respiratory|hrv/i);
    expect(bytes.every((value) => value === 0)).toBe(true);
  },
  45_000
);
