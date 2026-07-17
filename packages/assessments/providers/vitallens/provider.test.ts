import { OpticalAssessmentResultSchema } from "@homerounds/contracts/assessment";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  VitalLensCameraError,
  VitalLensProviderConfigurationSchema,
  VitalLensTransportError,
  type VitalLensCameraGateway,
  type VitalLensCameraSession,
  type VitalLensConsentGateway,
  type VitalLensProviderConfiguration,
  type VitalLensProxyRequest,
  type VitalLensProxyTransport
} from ".";
import { VitalLensAssessmentProvider } from "./provider";

const ASSESSMENT_SESSION_ID = "45906cff-34ea-4a86-a0c0-05967adb20c4";
const REQUEST_ID = "13369361-df18-4b88-9b0f-3632b896a57f";
const FACT_ID = "dcfce5d5-b681-4593-81af-806256e9e352";
const SECRET = "vital-secret-must-not-escape";

const configuration = {
  environment: "demo",
  homeRoundsOrigin: "https://demo.homerounds.example",
  proxyPath: "/api/providers/vitallens",
  providerVersion: "vitallens-api-2026-07",
  consentVersion: "synthetic-demo-v1",
  captureDurationMs: 30_000,
  requestTimeoutMs: 2_000,
  maxPayloadBytes: 1_024
} satisfies VitalLensProviderConfiguration;

const passingQuality = {
  status: "pass" as const,
  score: 0.94,
  reasons: [],
  metrics: { provider_confidence: 0.94 }
};

const retryQuality = {
  status: "retry" as const,
  score: 0.32,
  reasons: ["motion" as const],
  metrics: { motion: 0.8 }
};

const completedResponse = {
  status: "completed" as const,
  heartRateBpm: 72,
  observedAt: "2026-07-17T09:00:00.000Z",
  durationMs: 30_000,
  providerVersion: configuration.providerVersion,
  modelVersion: "vitallens-model-4.2",
  quality: passingQuality
};

type HarnessOverrides = {
  configuration?: unknown;
  capability?: unknown;
  consent?: unknown;
  response?: unknown;
  capabilityError?: unknown;
  consentError?: unknown;
  openError?: unknown;
  payloadError?: unknown;
  transportError?: unknown;
  transport?: (request: VitalLensProxyRequest) => Promise<unknown>;
  payloadMetadata?: unknown;
  bytes?: Uint8Array;
};

function makeHarness(overrides: HarnessOverrides = {}) {
  const events: string[] = [];
  const bytes = overrides.bytes ?? new Uint8Array([4, 8, 15, 16, 23, 42]);
  const requests: VitalLensProxyRequest[] = [];
  const stop = vi.fn(async () => {
    events.push("camera.stop");
  });
  const session: VitalLensCameraSession = {
    createInferencePayload: vi.fn(async () => {
      events.push("camera.payload");
      if (overrides.payloadError) throw overrides.payloadError;
      return {
        bytes,
        metadata: overrides.payloadMetadata ?? {
          contentType: "application/octet-stream",
          byteLength: bytes.byteLength,
          durationMs: 30_000,
          frameCount: 900,
          width: 320,
          height: 240,
          audioIncluded: false
        }
      };
    }),
    stop
  };
  const camera: VitalLensCameraGateway = {
    checkCapability: vi.fn(async () => {
      events.push("camera.capability");
      if (overrides.capabilityError) throw overrides.capabilityError;
      return overrides.capability ?? { available: true, frontCamera: true };
    }),
    openFrontCamera: vi.fn(async () => {
      events.push("camera.open");
      if (overrides.openError) throw overrides.openError;
      return session;
    })
  };
  const consent: VitalLensConsentGateway = {
    requestConsent: vi.fn(async () => {
      events.push("consent.request");
      if (overrides.consentError) throw overrides.consentError;
      return (
        overrides.consent ?? {
          granted: true,
          consentVersion: configuration.consentVersion,
          grantedAt: "2026-07-17T08:59:00.000Z"
        }
      );
    })
  };
  const transport: VitalLensProxyTransport = {
    send: vi.fn(async (request) => {
      events.push("transport.send");
      requests.push(request);
      if (overrides.transport) return overrides.transport(request);
      if (overrides.transportError) throw overrides.transportError;
      return overrides.response ?? completedResponse;
    })
  };
  const ids = [REQUEST_ID, FACT_ID];
  const provider = new VitalLensAssessmentProvider({
    configuration: "configuration" in overrides ? overrides.configuration : configuration,
    camera,
    consent,
    transport,
    createId: () => ids.shift() ?? crypto.randomUUID()
  });

  return { provider, camera, consent, transport, session, stop, bytes, requests, events };
}

function capture(provider: VitalLensAssessmentProvider, signal = new AbortController().signal) {
  return provider.capture({ assessmentSessionId: ASSESSMENT_SESSION_ID, signal });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("VitalLens provider configuration and availability", () => {
  it("returns typed missing configuration before touching capabilities", async () => {
    const harness = makeHarness({ configuration: undefined });

    await expect(harness.provider.checkAvailability()).resolves.toEqual({
      available: false,
      reason: "missing_configuration"
    });
    await expect(capture(harness.provider)).resolves.toEqual({
      status: "unavailable",
      provider: "vitallens",
      reason: "missing_configuration"
    });
    expect(harness.camera.checkCapability).not.toHaveBeenCalled();
  });

  it("rejects key-bearing configuration rather than exposing a browser key", async () => {
    const harness = makeHarness({ configuration: { ...configuration, apiKey: SECRET } });

    await expect(harness.provider.checkAvailability()).resolves.toEqual({
      available: false,
      reason: "missing_configuration"
    });
    expect(JSON.stringify(harness.provider)).not.toContain(SECRET);
    expect(harness.camera.checkCapability).not.toHaveBeenCalled();
  });

  it("enforces HTTPS except loopback HTTP in development", () => {
    expect(
      VitalLensProviderConfigurationSchema.safeParse({
        ...configuration,
        homeRoundsOrigin: "http://demo.homerounds.example"
      }).success
    ).toBe(false);
    expect(
      VitalLensProviderConfigurationSchema.safeParse({
        ...configuration,
        environment: "development",
        homeRoundsOrigin: "http://localhost:3000"
      }).success
    ).toBe(true);
    expect(
      VitalLensProviderConfigurationSchema.safeParse({
        ...configuration,
        environment: "demo",
        homeRoundsOrigin: "http://localhost:3000"
      }).success
    ).toBe(false);
  });

  it("rejects an absolute or query-bearing proxy path", () => {
    expect(
      VitalLensProviderConfigurationSchema.safeParse({
        ...configuration,
        proxyPath: "https://api.vitallens.example/inference"
      }).success
    ).toBe(false);
    expect(
      VitalLensProviderConfigurationSchema.safeParse({
        ...configuration,
        proxyPath: "/api/providers/vitallens?key=secret"
      }).success
    ).toBe(false);
  });

  it("reports normalized capabilities without prompting for consent", async () => {
    const harness = makeHarness();

    await expect(harness.provider.checkAvailability()).resolves.toEqual({
      available: true,
      capabilities: {
        frontCamera: true,
        explicitConsent: true,
        serverProxy: true,
        rawMediaRetention: false,
        audioCapture: false,
        heartRateOnly: true
      }
    });
    expect(harness.consent.requestConsent).not.toHaveBeenCalled();
    expect(harness.camera.openFrontCamera).not.toHaveBeenCalled();
  });

  it.each([
    ["unsupported_device", "unsupported_device"],
    ["permission_denied", "permission_denied"]
  ] as const)("normalizes %s capability state", async (capabilityReason, expectedReason) => {
    const harness = makeHarness({
      capability: { available: false, reason: capabilityReason }
    });

    await expect(harness.provider.checkAvailability()).resolves.toEqual({
      available: false,
      reason: expectedReason
    });
  });
});

describe("VitalLens capture normalization", () => {
  it("creates only a quality-gated heart-rate fact with provenance", async () => {
    const harness = makeHarness();

    const result = await capture(harness.provider);

    expect(result).toEqual({
      status: "completed",
      measurement: {
        factId: FACT_ID,
        assessmentSessionId: ASSESSMENT_SESSION_ID,
        provider: "vitallens",
        value: 72,
        unit: "bpm",
        observedAt: "2026-07-17T09:00:00.000Z",
        durationMs: 30_000,
        algorithmVersion: "vitallens_face_rppg_v1",
        providerModelVersion: "vitallens-model-4.2",
        quality: passingQuality,
        rawMediaRef: null
      }
    });
    expect(OpticalAssessmentResultSchema.safeParse(result).success).toBe(true);
    expect(harness.events).toEqual([
      "camera.capability",
      "consent.request",
      "camera.open",
      "camera.payload",
      "transport.send",
      "camera.stop"
    ]);
    expect(harness.requests[0]).toMatchObject({
      endpoint: "https://demo.homerounds.example/api/providers/vitallens",
      providerVersion: configuration.providerVersion,
      requestId: REQUEST_ID,
      consent: {
        version: configuration.consentVersion,
        grantedAt: "2026-07-17T08:59:00.000Z"
      },
      payload: {
        metadata: {
          audioIncluded: false,
          byteLength: 6,
          durationMs: 30_000,
          width: 320,
          height: 240
        }
      }
    });
    expect([...harness.bytes]).toEqual([0, 0, 0, 0, 0, 0]);
    expect(JSON.stringify(result)).not.toMatch(/frame|bytes|secret|respiratory|hrv|spo2|pressure/i);
  });

  it("requires consent before opening the camera and maps denial", async () => {
    const harness = makeHarness({ consent: { granted: false } });

    await expect(capture(harness.provider)).resolves.toEqual({
      status: "unavailable",
      provider: "vitallens",
      reason: "permission_denied"
    });
    expect(harness.events).toEqual(["camera.capability", "consent.request"]);
  });

  it("maps front-camera permission denial without opening transport", async () => {
    const harness = makeHarness({ openError: new VitalLensCameraError("permission_denied") });

    await expect(capture(harness.provider)).resolves.toEqual({
      status: "unavailable",
      provider: "vitallens",
      reason: "permission_denied"
    });
    expect(harness.transport.send).not.toHaveBeenCalled();
  });

  it("maps quota and provider-unavailable proxy responses", async () => {
    for (const reason of ["quota", "provider_unavailable"] as const) {
      const harness = makeHarness({ response: { status: "unavailable", reason } });
      await expect(capture(harness.provider)).resolves.toEqual({
        status: "unavailable",
        provider: "vitallens",
        reason: "provider_unavailable"
      });
    }
  });

  it("maps processing failure without fabricating a measurement", async () => {
    const harness = makeHarness({
      response: { status: "failed", code: "processing_failed" }
    });

    await expect(capture(harness.provider)).resolves.toEqual({
      status: "failed",
      quality: {
        status: "fail",
        score: 0,
        reasons: ["provider_unavailable"],
        metrics: { provider_failure: 1 }
      }
    });
  });

  it("allows exactly one quality retry and makes the second terminal", async () => {
    const harness = makeHarness({ response: { status: "retry", quality: retryQuality } });

    await expect(capture(harness.provider)).resolves.toEqual({
      status: "retry",
      quality: retryQuality
    });
    await expect(capture(harness.provider)).resolves.toEqual({
      status: "failed",
      quality: {
        ...retryQuality,
        status: "fail",
        metrics: { motion: 0.8, retry_exhausted: 1 }
      }
    });
    const callsAfterTerminal = vi.mocked(harness.camera.openFrontCamera).mock.calls.length;
    await expect(capture(harness.provider)).resolves.toMatchObject({
      status: "failed",
      quality: { metrics: { terminal_session: 1 } }
    });
    expect(harness.camera.openFrontCamera).toHaveBeenCalledTimes(callsAfterTerminal);
  });

  it("rejects mismatched provider provenance", async () => {
    const harness = makeHarness({
      response: { ...completedResponse, providerVersion: "unexpected-provider-version" }
    });

    await expect(capture(harness.provider)).resolves.toMatchObject({
      status: "failed",
      quality: { metrics: { provider_version_mismatch: 1 } }
    });
  });
});

describe("VitalLens failure, privacy, and lifecycle paths", () => {
  it.each([
    ["quota", "unavailable", "provider_unavailable"],
    ["network_failure", "unavailable", "network_unavailable"],
    ["provider_failure", "failed", "provider_failure"],
    ["timeout", "failed", "timeout"],
    ["cancelled", "failed", "cancelled"]
  ] as const)("normalizes transport %s", async (code, status, marker) => {
    const harness = makeHarness({ transportError: new VitalLensTransportError(code) });

    const result = await capture(harness.provider);

    expect(result.status).toBe(status);
    expect(JSON.stringify(result)).toContain(marker);
    expect(harness.stop).toHaveBeenCalledOnce();
    expect([...harness.bytes]).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("bounds request duration even if transport ignores AbortSignal", async () => {
    vi.useFakeTimers();
    const harness = makeHarness({
      configuration: { ...configuration, requestTimeoutMs: 250 },
      transport: async () => new Promise<never>(() => undefined)
    });

    const resultPromise = capture(harness.provider);
    await vi.advanceTimersByTimeAsync(251);

    await expect(resultPromise).resolves.toMatchObject({
      status: "failed",
      quality: { metrics: { timeout: 1 } }
    });
    expect(harness.stop).toHaveBeenCalledOnce();
    expect([...harness.bytes]).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("rejects malformed or raw-media-bearing provider payloads without leaking them", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const harness = makeHarness({
      response: { ...completedResponse, rawFrames: [SECRET], providerKey: SECRET }
    });

    const result = await capture(harness.provider);

    expect(result).toMatchObject({
      status: "failed",
      quality: { metrics: { malformed_payload: 1 } }
    });
    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleLog).not.toHaveBeenCalled();
    expect([...harness.bytes]).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("does not expose arbitrary thrown messages in results or safe error JSON", async () => {
    const harness = makeHarness({ transportError: new Error(`${SECRET}: raw-frame`) });

    const result = await capture(harness.provider);

    expect(result).toMatchObject({
      status: "failed",
      quality: { metrics: { provider_failure: 1 } }
    });
    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(JSON.stringify(new VitalLensTransportError("provider_failure"))).toBe(
      '{"name":"VitalLensTransportError","code":"provider_failure"}'
    );
  });

  it("rejects oversized or inconsistent payload metadata before transport", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const harness = makeHarness({
      bytes,
      payloadMetadata: {
        contentType: "application/octet-stream",
        byteLength: 500_000,
        durationMs: 30_000,
        frameCount: 900,
        width: 320,
        height: 240,
        audioIncluded: false
      }
    });

    await expect(capture(harness.provider)).resolves.toMatchObject({
      status: "failed",
      quality: { metrics: { invalid_payload_boundary: 1 } }
    });
    expect(harness.transport.send).not.toHaveBeenCalled();
    expect([...bytes]).toEqual([0, 0, 0]);
    expect(harness.stop).toHaveBeenCalledOnce();
  });

  it("stops the camera after payload construction failure", async () => {
    const harness = makeHarness({ payloadError: new Error(SECRET) });

    await expect(capture(harness.provider)).resolves.toMatchObject({
      status: "failed",
      quality: { metrics: { provider_failure: 1 } }
    });
    expect(harness.stop).toHaveBeenCalledOnce();
    expect(harness.transport.send).not.toHaveBeenCalled();
  });

  it("cancels an active request, cleans media, and zeroes its buffer", async () => {
    const controller = new AbortController();
    const harness = makeHarness({
      transport: async () => new Promise<never>(() => undefined)
    });
    const resultPromise = capture(harness.provider, controller.signal);
    await vi.waitFor(() => expect(harness.transport.send).toHaveBeenCalledOnce());

    controller.abort();

    await expect(resultPromise).resolves.toMatchObject({
      status: "failed",
      quality: { reasons: ["cancelled"], metrics: { cancelled: 1 } }
    });
    expect(harness.stop).toHaveBeenCalledOnce();
    expect([...harness.bytes]).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("disposal aborts active capture and makes later capture terminally cancelled", async () => {
    const harness = makeHarness({
      transport: async () => new Promise<never>(() => undefined)
    });
    const resultPromise = capture(harness.provider);
    await vi.waitFor(() => expect(harness.transport.send).toHaveBeenCalledOnce());

    await harness.provider.dispose();

    await expect(resultPromise).resolves.toMatchObject({
      status: "failed",
      quality: { metrics: { disposed: 1 } }
    });
    await expect(capture(harness.provider)).resolves.toMatchObject({
      status: "failed",
      quality: { metrics: { disposed: 1 } }
    });
    expect(harness.stop).toHaveBeenCalledOnce();
    expect([...harness.bytes]).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("rejects overlapping camera captures without disturbing the active one", async () => {
    const controller = new AbortController();
    const harness = makeHarness({
      transport: async () => new Promise<never>(() => undefined)
    });
    const first = capture(harness.provider, controller.signal);
    await vi.waitFor(() => expect(harness.transport.send).toHaveBeenCalledOnce());

    await expect(capture(harness.provider)).resolves.toMatchObject({
      status: "failed",
      quality: { metrics: { capture_in_progress: 1 } }
    });
    controller.abort();
    await first;
    expect(harness.camera.openFrontCamera).toHaveBeenCalledOnce();
  });
});
