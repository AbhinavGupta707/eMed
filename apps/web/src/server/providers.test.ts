import { describe, expect, it, vi } from "vitest";

import {
  ElevenLabsCredentialService,
  VitalLensProxyService,
  type ElevenLabsTokenTransport,
  type VitalLensInferenceTransport
} from "./providers";

const NOW = "2026-07-17T12:00:00.000Z";

describe("server-only provider boundaries", () => {
  it("returns typed ElevenLabs unavailability without calling a transport", async () => {
    const transport: ElevenLabsTokenTransport = { issue: vi.fn() };
    const disabled = new ElevenLabsCredentialService(
      { provider: "disabled", serverLocation: "global", maxSessionSeconds: 120 },
      transport,
      () => NOW
    );
    const missing = new ElevenLabsCredentialService(
      { provider: "elevenlabs", serverLocation: "global", maxSessionSeconds: 120 },
      transport,
      () => NOW
    );

    await expect(disabled.issue()).resolves.toEqual({ status: "unavailable", reason: "disabled" });
    await expect(missing.issue()).resolves.toEqual({
      status: "unavailable",
      reason: "missing_configuration"
    });
    expect(transport.issue).not.toHaveBeenCalled();
  });

  it("keeps the ElevenLabs API key inside the injected server transport", async () => {
    const transport: ElevenLabsTokenTransport = {
      async issue(input) {
        expect(input.apiKey).toBe("server-key-value");
        expect(input.baseUrl).toBe("https://api.eu.residency.elevenlabs.io");
        return "short-lived-conversation-token";
      }
    };
    const service = new ElevenLabsCredentialService(
      {
        provider: "elevenlabs",
        apiKey: "server-key-value",
        agentId: "agent_synthetic",
        serverLocation: "eu-residency",
        maxSessionSeconds: 120
      },
      transport,
      () => NOW
    );

    const result = await service.issue();
    expect(result).toMatchObject({
      status: "available",
      token: "short-lived-conversation-token",
      agentId: "agent_synthetic"
    });
    expect(JSON.stringify(result)).not.toContain("server-key-value");
  });

  it("normalizes only passing VitalLens heart-rate evidence and zeroes frame bytes", async () => {
    const transport: VitalLensInferenceTransport = {
      async infer(input) {
        expect(input.apiKey).toBe("server-vital-key");
        return {
          vitals: { heart_rate: { value: 72, unit: "bpm", confidence: 0.94 } },
          processing_status: { face_detected: true, signal_quality: "optimal", issues: [] },
          model_used: "vitallens-2.0"
        };
      }
    };
    const service = new VitalLensProxyService(
      {
        enabled: true,
        apiKey: "server-vital-key",
        providerVersion: "vitallens-2.0",
        consentVersion: "consent-v1",
        maxPayloadBytes: 5_000_000
      },
      transport,
      () => NOW
    );
    const bytes = new Uint8Array(16 * 40 * 40 * 3).fill(7);
    const result = await service.infer({
      providerVersion: "vitallens-2.0",
      requestId: "22003f23-6f0f-4238-ae97-0fa6f1bbad83",
      consentVersion: "consent-v1",
      consentGrantedAt: NOW,
      metadata: {
        contentType: "application/octet-stream",
        byteLength: bytes.byteLength,
        durationMs: 1_000,
        frameCount: 16,
        width: 40,
        height: 40,
        audioIncluded: false
      },
      bytes
    });

    expect(result).toMatchObject({
      status: "completed",
      heartRateBpm: 72,
      providerVersion: "vitallens-2.0",
      quality: { status: "pass" }
    });
    expect(bytes.every((value) => value === 0)).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/waveform|respiratory|hrv|frame/i);
  });

  it("returns typed VitalLens unavailability with no key and never calls upstream", async () => {
    const transport: VitalLensInferenceTransport = { infer: vi.fn() };
    const service = new VitalLensProxyService(
      {
        enabled: false,
        providerVersion: "vitallens-2.0",
        consentVersion: "consent-v1",
        maxPayloadBytes: 5_000_000
      },
      transport,
      () => NOW
    );
    const bytes = new Uint8Array(16 * 40 * 40 * 3).fill(9);
    await expect(
      service.infer({
        providerVersion: "vitallens-2.0",
        requestId: "22003f23-6f0f-4238-ae97-0fa6f1bbad83",
        consentVersion: "consent-v1",
        consentGrantedAt: NOW,
        metadata: {
          contentType: "application/octet-stream",
          byteLength: bytes.byteLength,
          durationMs: 1_000,
          frameCount: 16,
          width: 40,
          height: 40,
          audioIncluded: false
        },
        bytes
      })
    ).resolves.toEqual({ status: "unavailable", reason: "provider_unavailable" });
    expect(transport.infer).not.toHaveBeenCalled();
    expect(bytes.every((value) => value === 0)).toBe(true);
  });

  it("rejects malformed or low-quality VitalLens input without creating a measurement", async () => {
    const transport: VitalLensInferenceTransport = {
      infer: vi.fn(async () => ({
        vitals: { heart_rate: { value: 72, unit: "bpm" as const, confidence: 0.2 } },
        processing_status: {
          face_detected: true,
          signal_quality: "low" as const,
          issues: ["low_ppg_quality"]
        },
        model_used: "vitallens-2.0"
      }))
    };
    const service = new VitalLensProxyService(
      {
        enabled: true,
        apiKey: "server-vital-key",
        providerVersion: "vitallens-2.0",
        consentVersion: "consent-v1",
        maxPayloadBytes: 5_000_000
      },
      transport,
      () => NOW
    );
    const bytes = new Uint8Array(16 * 40 * 40 * 3).fill(5);
    const lowQuality = await service.infer({
      providerVersion: "vitallens-2.0",
      requestId: "22003f23-6f0f-4238-ae97-0fa6f1bbad83",
      consentVersion: "consent-v1",
      consentGrantedAt: NOW,
      metadata: {
        contentType: "application/octet-stream",
        byteLength: bytes.byteLength,
        durationMs: 1_000,
        frameCount: 16,
        width: 40,
        height: 40,
        audioIncluded: false
      },
      bytes
    });

    expect(lowQuality).toMatchObject({ status: "retry", quality: { status: "retry" } });
    expect(lowQuality).not.toHaveProperty("heartRateBpm");
  });
});
