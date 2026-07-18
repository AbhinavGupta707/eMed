import { VitalLensPayloadMetadataSchema } from "@homerounds/assessments";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ElevenLabsCredentialService,
  FetchVitalLensInferenceTransport,
  ProviderTransportError,
  VitalLensProxyService,
  type ElevenLabsTokenTransport,
  type VitalLensInferenceTransport,
  type VitalLensProxyServiceInput
} from "./providers";

const NOW = "2026-07-17T12:00:00.000Z";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function vitalLensInput(
  bytes: Uint8Array,
  overrides: Partial<VitalLensProxyServiceInput> = {}
): VitalLensProxyServiceInput {
  return {
    providerVersion: "vitallens-2.0",
    requestId: "22003f23-6f0f-4238-ae97-0fa6f1bbad83",
    consentVersion: "consent-v1",
    consentGrantedAt: NOW,
    metadata: {
      contentType: "application/octet-stream",
      byteLength: bytes.byteLength,
      durationMs: 5_000,
      frameCount: 75,
      width: 40,
      height: 40,
      audioIncluded: false
    },
    bytes,
    ...overrides
  };
}

function passingVitalLensTransport(modelUsed = "vitallens-2.0"): VitalLensInferenceTransport {
  return {
    infer: vi.fn(async () => ({
      vitals: { heart_rate: { value: 72, unit: "bpm" as const, confidence: 0.94 } },
      processing_status: {
        face_detected: true,
        signal_quality: "optimal" as const,
        issues: []
      },
      model_used: modelUsed
    }))
  };
}

function vitalLensService(transport: VitalLensInferenceTransport): VitalLensProxyService {
  return new VitalLensProxyService(
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
}

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
    const bytes = new Uint8Array(75 * 40 * 40 * 3).fill(7);
    const result = await service.infer({
      providerVersion: "vitallens-2.0",
      requestId: "22003f23-6f0f-4238-ae97-0fa6f1bbad83",
      consentVersion: "consent-v1",
      consentGrantedAt: NOW,
      metadata: {
        contentType: "application/octet-stream",
        byteLength: bytes.byteLength,
        durationMs: 5_000,
        frameCount: 75,
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

  it("adapts RGB24 bytes to the documented upstream request without exposing extra outputs", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(input.toString()).toBe("https://api.rouast.com/vitallens-v3/file");
      expect(new Headers(init?.headers).get("x-api-key")).toBe("server-vital-key");
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body.fps).toBe(15);
      expect(body.process_signals).toBe(true);
      expect(body.model).toBe("vitallens-2.0");
      if (typeof body.video !== "string") throw new Error("Expected a base64 RGB24 payload");
      expect(Buffer.from(body.video, "base64").byteLength).toBe(75 * 40 * 40 * 3);
      return new Response(
        JSON.stringify({
          waveforms: { ppg_waveform: { data: [0.1], confidence: [0.9] } },
          vitals: {
            heart_rate: { value: 72, unit: "bpm", confidence: 0.94 },
            respiratory_rate: { value: 14, unit: "bpm", confidence: 0.8 }
          },
          processing_status: {
            face_detected: true,
            avg_face_confidence: 0.96,
            signal_quality: "optimal",
            issues: []
          },
          model_used: "vitallens-2.0"
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });
    vi.stubGlobal("fetch", fetcher);
    const bytes = new Uint8Array(75 * 40 * 40 * 3).fill(11);

    const result = await new FetchVitalLensInferenceTransport().infer({
      apiKey: "server-vital-key",
      providerVersion: "vitallens-2.0",
      bytes,
      metadata: VitalLensPayloadMetadataSchema.parse(vitalLensInput(bytes).metadata),
      signal: new AbortController().signal
    });

    expect(result).toEqual({
      vitals: { heart_rate: { value: 72, unit: "bpm", confidence: 0.94 } },
      processing_status: { face_detected: true, signal_quality: "optimal", issues: [] },
      model_used: "vitallens-2.0"
    });
    expect(JSON.stringify(result)).not.toMatch(/waveform|respiratory/i);
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
    const bytes = new Uint8Array(75 * 40 * 40 * 3).fill(9);
    await expect(
      service.infer({
        providerVersion: "vitallens-2.0",
        requestId: "22003f23-6f0f-4238-ae97-0fa6f1bbad83",
        consentVersion: "consent-v1",
        consentGrantedAt: NOW,
        metadata: {
          contentType: "application/octet-stream",
          byteLength: bytes.byteLength,
          durationMs: 5_000,
          frameCount: 75,
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
    const bytes = new Uint8Array(75 * 40 * 40 * 3).fill(5);
    const lowQuality = await service.infer({
      providerVersion: "vitallens-2.0",
      requestId: "22003f23-6f0f-4238-ae97-0fa6f1bbad83",
      consentVersion: "consent-v1",
      consentGrantedAt: NOW,
      metadata: {
        contentType: "application/octet-stream",
        byteLength: bytes.byteLength,
        durationMs: 5_000,
        frameCount: 75,
        width: 40,
        height: 40,
        audioIncluded: false
      },
      bytes
    });

    expect(lowQuality).toMatchObject({ status: "retry", quality: { status: "retry" } });
    expect(lowQuality).not.toHaveProperty("heartRateBpm");
  });

  it("rejects stale consent and malformed frame budgets while zeroing bytes", async () => {
    const transport = passingVitalLensTransport();
    const service = vitalLensService(transport);
    const staleBytes = new Uint8Array(75 * 40 * 40 * 3).fill(4);
    const malformedBytes = new Uint8Array(15 * 40 * 40 * 3).fill(6);

    await expect(
      service.infer(
        vitalLensInput(staleBytes, {
          consentGrantedAt: "2026-07-17T11:49:59.000Z"
        })
      )
    ).resolves.toEqual({ status: "failed", code: "processing_failed" });
    await expect(
      service.infer(
        vitalLensInput(malformedBytes, {
          requestId: "6a9a2f4f-e8d8-497b-a40a-fc2a73fa4571",
          metadata: {
            contentType: "application/octet-stream",
            byteLength: malformedBytes.byteLength,
            durationMs: 5_000,
            frameCount: 15,
            width: 40,
            height: 40,
            audioIncluded: false
          }
        })
      )
    ).resolves.toEqual({ status: "failed", code: "processing_failed" });
    expect(transport.infer).not.toHaveBeenCalled();
    expect(staleBytes.every((value) => value === 0)).toBe(true);
    expect(malformedBytes.every((value) => value === 0)).toBe(true);
  });

  it("spends no second provider request for a replayed request id", async () => {
    const transport = passingVitalLensTransport();
    const service = vitalLensService(transport);
    const firstBytes = new Uint8Array(75 * 40 * 40 * 3).fill(3);
    const replayBytes = new Uint8Array(75 * 40 * 40 * 3).fill(8);

    await expect(service.infer(vitalLensInput(firstBytes))).resolves.toMatchObject({
      status: "completed"
    });
    await expect(service.infer(vitalLensInput(replayBytes))).resolves.toEqual({
      status: "failed",
      code: "processing_failed"
    });
    expect(transport.infer).toHaveBeenCalledOnce();
    expect(replayBytes.every((value) => value === 0)).toBe(true);
  });

  it("rejects provider model uncertainty without forwarding a numeric result", async () => {
    const service = vitalLensService(passingVitalLensTransport("unexpected-model"));
    const bytes = new Uint8Array(75 * 40 * 40 * 3).fill(2);

    const result = await service.infer(vitalLensInput(bytes));

    expect(result).toEqual({ status: "failed", code: "processing_failed" });
    expect(result).not.toHaveProperty("heartRateBpm");
    expect(bytes.every((value) => value === 0)).toBe(true);
  });

  it("returns typed quota unavailability and propagates cancellation upstream", async () => {
    const quotaService = vitalLensService({
      infer: vi.fn(async () => {
        throw new ProviderTransportError("quota");
      })
    });
    const quotaBytes = new Uint8Array(75 * 40 * 40 * 3).fill(1);
    await expect(quotaService.infer(vitalLensInput(quotaBytes))).resolves.toEqual({
      status: "unavailable",
      reason: "quota"
    });

    const upstreamAborted = vi.fn();
    const cancellationService = vitalLensService({
      infer: ({ signal }) =>
        new Promise((_, reject) => {
          signal.addEventListener(
            "abort",
            () => {
              upstreamAborted();
              reject(new ProviderTransportError("network"));
            },
            { once: true }
          );
        })
    });
    const controller = new AbortController();
    const cancellationBytes = new Uint8Array(75 * 40 * 40 * 3).fill(5);
    const pending = cancellationService.infer(
      vitalLensInput(cancellationBytes, {
        requestId: "8ed19462-9d58-4a82-a6bd-d29262ed6cb2",
        signal: controller.signal
      })
    );
    controller.abort();

    await expect(pending).resolves.toEqual({
      status: "unavailable",
      reason: "provider_unavailable"
    });
    expect(upstreamAborted).toHaveBeenCalledOnce();
    expect(cancellationBytes.every((value) => value === 0)).toBe(true);
  });
});
