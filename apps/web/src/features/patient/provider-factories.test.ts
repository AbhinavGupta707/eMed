import {
  FingerPpgProvider,
  LocalVoiceBiomarkerProvider,
  VitalLensAssessmentProvider,
  VitalLensTransportError,
  type VitalLensProxyRequest
} from "@homerounds/assessments";
import { SyntheticVoiceSessionProvider } from "@homerounds/voice";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createHomeRoundsVitalLensProxyTransport,
  createPatientOpticalProvider,
  createPatientVoiceBiomarkerProvider,
  createPatientVoiceProvider
} from "./provider-factories";

function proxyRequest(signal = new AbortController().signal): VitalLensProxyRequest {
  const bytes = new Uint8Array(75 * 40 * 40 * 3).fill(7);
  return {
    endpoint: "https://demo.homerounds.example/api/providers/vitallens/proxy",
    providerVersion: "vitallens-2.0",
    requestId: "22003f23-6f0f-4238-ae97-0fa6f1bbad83",
    consent: {
      version: "homerounds-vital-signs-demo-v1",
      grantedAt: "2026-07-18T08:00:00.000Z"
    },
    payload: {
      bytes,
      metadata: {
        contentType: "application/octet-stream",
        byteLength: bytes.byteLength,
        durationMs: 5_000,
        frameCount: 75,
        width: 40,
        height: 40,
        audioIncluded: false
      }
    },
    signal
  };
}

describe("patient provider factories", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("creates only the explicitly selected optical provider and a fresh provider instance", () => {
    const finger = createPatientOpticalProvider("finger_ppg");
    const firstVitalLens = createPatientOpticalProvider("vitallens");
    const secondVitalLens = createPatientOpticalProvider("vitallens");

    expect(finger).toBeInstanceOf(FingerPpgProvider);
    expect(finger.kind).toBe("finger_ppg");
    expect(firstVitalLens).toBeInstanceOf(VitalLensAssessmentProvider);
    expect(firstVitalLens.kind).toBe("vitallens");
    expect(secondVitalLens).toBeInstanceOf(VitalLensAssessmentProvider);
    expect(secondVitalLens).not.toBe(firstVitalLens);
  });

  it("sends the bounded payload only to the same-origin proxy without a browser key", async () => {
    vi.stubGlobal("window", { location: { origin: "https://demo.homerounds.example" } });
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.credentials).toBe("include");
      expect(init?.cache).toBe("no-store");
      expect(JSON.stringify(init?.headers)).not.toMatch(/api.?key|secret/i);
      return new Response(
        JSON.stringify({
          data: {
            status: "retry",
            quality: {
              status: "retry",
              score: 0.3,
              reasons: ["provider_quality_failed"],
              metrics: { provider_confidence: 0.3 }
            }
          },
          meta: {
            correlationId: "correlation-id",
            runtimeProfile: "server_provider_boundary"
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });
    const request = proxyRequest();

    await expect(createHomeRoundsVitalLensProxyTransport(fetcher).send(request)).resolves.toEqual({
      status: "retry",
      quality: {
        status: "retry",
        score: 0.3,
        reasons: ["provider_quality_failed"],
        metrics: { provider_confidence: 0.3 }
      }
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("maps proxy rate limits and cancellation to message-safe transport errors", async () => {
    vi.stubGlobal("window", { location: { origin: "https://demo.homerounds.example" } });
    const rateLimited = createHomeRoundsVitalLensProxyTransport(
      vi.fn(async () => new Response("{}", { status: 429 }))
    );
    await expect(rateLimited.send(proxyRequest())).rejects.toEqual(
      new VitalLensTransportError("quota")
    );

    const controller = new AbortController();
    const cancelled = createHomeRoundsVitalLensProxyTransport(
      vi.fn(
        async (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(new DOMException("", "AbortError"))
            );
          })
      )
    );
    const pending = cancelled.send(proxyRequest(controller.signal));
    controller.abort();
    await expect(pending).rejects.toEqual(new VitalLensTransportError("cancelled"));
  });

  it("enables the keyless synthetic voice fixture only in development or tests", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("NEXT_PUBLIC_VOICE_TEST_FIXTURE", "synthetic");

    expect(createPatientVoiceProvider()).toBeInstanceOf(SyntheticVoiceSessionProvider);
  });

  it("rejects synthetic or unknown fixture controls in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_VOICE_TEST_FIXTURE", "synthetic");
    expect(() => createPatientVoiceProvider()).toThrow(/forbidden/i);

    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("NEXT_PUBLIC_VOICE_TEST_FIXTURE", "unknown");
    expect(() => createPatientVoiceProvider()).toThrow(/unsupported/i);
  });

  it("creates the local-only voice research provider without a provider key", () => {
    expect(createPatientVoiceBiomarkerProvider()).toBeInstanceOf(LocalVoiceBiomarkerProvider);
  });
});
