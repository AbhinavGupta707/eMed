import { describe, expect, it, vi } from "vitest";

import {
  FingerPpgProvider,
  LocalVoiceBiomarkerProvider,
  OpticalProviderRegistrationError,
  VitalLensAssessmentProvider,
  VitalLensTransportError,
  analyzeDerivedSamples,
  analyzeVoicePcm,
  resolveReleaseOpticalProvider,
  type FingerPpgDependencies,
  type OpticalAssessmentProvider,
  type VitalLensProviderConfiguration,
  type VoiceBiomarkerDependencies
} from "../../../packages/assessments/src/index";
import { syntheticDerivedSignal } from "../../../packages/assessments/providers/finger-ppg/fixtures";
import { referenceVoiceSignal } from "../../../packages/assessments/providers/voice-biomarker/fixtures";
import {
  FetchVitalLensInferenceTransport,
  VitalLensProxyService
} from "../../../apps/web/src/server/providers";

const SESSION_ID = "76000000-0000-4000-8000-000000000001";
const ROUND_ID = "76000000-0000-4000-8000-000000000002";

function fingerDependencies(
  input: {
    secureContext?: boolean;
    mediaDevices?: boolean;
    rearCamera?: boolean;
    permission?: "granted" | "prompt" | "denied" | "unknown";
    torchAvailable?: boolean;
  } = {}
): { dependencies: FingerPpgDependencies; open: ReturnType<typeof vi.fn> } {
  const open = vi.fn(async () => ({
    source: {
      collect: async () => syntheticDerivedSignal(),
      dispose: async () => undefined
    },
    torch: {
      available: input.torchAvailable ?? true,
      setEnabled: async () => undefined
    },
    dispose: async () => undefined
  }));
  return {
    dependencies: {
      capabilities: {
        inspect: async () => ({
          secureContext: input.secureContext ?? true,
          mediaDevices: input.mediaDevices ?? true,
          rearCamera: input.rearCamera ?? true
        })
      },
      permission: { query: async () => input.permission ?? "granted" },
      camera: { open },
      lifecycle: { onInterrupted: () => () => undefined },
      now: () => new Date("2026-07-18T12:00:00.000Z"),
      randomUuid: () => "76000000-0000-4000-8000-000000000003"
    },
    open
  };
}

function voiceDependencies(
  capture: ReturnType<typeof referenceVoiceSignal>
): VoiceBiomarkerDependencies {
  return {
    capabilities: {
      inspect: async () => ({
        secureContext: true,
        mediaDevices: true,
        webAudio: true,
        audioWorklet: true,
        scriptProcessorFallback: true
      })
    },
    permission: { query: async () => "granted" },
    microphone: {
      open: async () => ({
        sampleRateHz: capture.sampleRateHz,
        source: { collect: async () => capture, dispose: async () => undefined },
        dispose: async () => undefined
      })
    },
    lifecycle: { onInterrupted: () => () => undefined },
    now: () => new Date("2026-07-18T12:00:00.000Z"),
    randomUuid: () => "76000000-0000-4000-8000-000000000004"
  };
}

const vitalLensConfiguration = {
  environment: "development",
  homeRoundsOrigin: "http://127.0.0.1:3000",
  proxyPath: "/api/providers/vitallens",
  providerVersion: "vitallens-api-2026-07",
  consentVersion: "homerounds-vital-signs-demo-v1",
  captureDurationMs: 15_000,
  requestTimeoutMs: 1_000,
  maxPayloadBytes: 1_024
} satisfies VitalLensProviderConfiguration;

function vitalLensHarness(
  input: {
    consentGranted?: boolean;
    response?: unknown;
    transportError?: VitalLensTransportError;
    transport?: () => Promise<unknown>;
    capability?:
      | { available: true; frontCamera: true }
      | { available: false; reason: "unsupported_device" | "permission_denied" };
  } = {}
) {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const stop = vi.fn(async () => undefined);
  const requestConsent = vi.fn(async () =>
    input.consentGranted === false
      ? { granted: false as const }
      : {
          granted: true as const,
          consentVersion: vitalLensConfiguration.consentVersion,
          grantedAt: "2026-07-18T11:59:00.000Z"
        }
  );
  const openFrontCamera = vi.fn(async () => ({
    createInferencePayload: async () => ({
      bytes,
      metadata: {
        contentType: "application/octet-stream",
        byteLength: bytes.byteLength,
        durationMs: 15_000,
        frameCount: 225,
        width: 40,
        height: 40,
        audioIncluded: false
      }
    }),
    stop
  }));
  const transport = vi.fn(async () => {
    if (input.transport) return input.transport();
    if (input.transportError) throw input.transportError;
    return (
      input.response ?? {
        status: "completed",
        heartRateBpm: 71,
        observedAt: "2026-07-18T12:00:00.000Z",
        durationMs: 15_000,
        providerVersion: vitalLensConfiguration.providerVersion,
        modelVersion: "vitallens-model-4.2",
        quality: {
          status: "pass",
          score: 0.92,
          reasons: [],
          metrics: { provider_confidence: 0.92, face_detected: 1 }
        }
      }
    );
  });
  const provider = new VitalLensAssessmentProvider({
    configuration: vitalLensConfiguration,
    consent: { requestConsent },
    camera: {
      checkCapability: async () => input.capability ?? { available: true, frontCamera: true },
      openFrontCamera
    },
    transport: { send: transport },
    createId: (() => {
      const ids = ["76000000-0000-4000-8000-000000000005", "76000000-0000-4000-8000-000000000006"];
      return () => ids.shift() ?? "76000000-0000-4000-8000-000000000007";
    })()
  });
  return { provider, bytes, stop, openFrontCamera, requestConsent, transport };
}

describe("sensing quality and device boundaries", () => {
  it("routes only to the registered selected provider and never silently falls back", () => {
    const finger = { kind: "finger_ppg" } as OpticalAssessmentProvider;
    const face = { kind: "vitallens" } as OpticalAssessmentProvider;
    expect(
      resolveReleaseOpticalProvider({
        selected: "vitallens",
        providers: { finger_ppg: finger, vitallens: face }
      })
    ).toBe(face);
    expect(() =>
      resolveReleaseOpticalProvider({ selected: "vitallens", providers: { finger_ppg: finger } })
    ).toThrowError(new OpticalProviderRegistrationError("vitallens"));
  });

  it.each([
    ["permission denial", { permission: "denied" as const }, "permission_denied"],
    ["insecure context", { secureContext: false }, "unsupported_device"],
    ["unsupported media APIs", { mediaDevices: false }, "unsupported_device"],
    ["absent rear camera", { rearCamera: false }, "unsupported_device"]
  ])(
    "returns typed unavailable for %s without opening the camera",
    async (_name, input, reason) => {
      const harness = fingerDependencies(input);
      const provider = new FingerPpgProvider(harness.dependencies);
      await expect(provider.checkAvailability()).resolves.toEqual({ available: false, reason });
      expect(harness.open).not.toHaveBeenCalled();
    }
  );

  it("keeps torch absence explicit while still quality-gating the local signal", async () => {
    const harness = fingerDependencies({ torchAvailable: false });
    const result = await new FingerPpgProvider(harness.dependencies).capture({
      assessmentSessionId: SESSION_ID,
      signal: new AbortController().signal
    });
    expect(result).toMatchObject({
      status: "completed",
      measurement: {
        provider: "finger_ppg",
        rawMediaRef: null,
        quality: { metrics: { torchAvailable: 0 } }
      }
    });
  });

  it.each([
    ["motion", syntheticDerivedSignal({ motion: 0.7 }), "motion"],
    ["coverage", syntheticDerivedSignal({ coverage: 0.2 }), "weak_signal"],
    ["duration", syntheticDerivedSignal({ durationMs: 4_000 }), "insufficient_duration"],
    [
      "cadence",
      syntheticDerivedSignal({ timestampTransform: (timestamp) => timestamp * 3 }),
      "irregular_cadence"
    ],
    [
      "jitter",
      syntheticDerivedSignal({
        timestampTransform: (timestamp, index) => timestamp + (index % 2 === 0 ? 0 : 20)
      }),
      "irregular_cadence"
    ],
    ["saturation", syntheticDerivedSignal({ saturation: 0.8 }), "saturation"],
    ["signal strength", syntheticDerivedSignal({ amplitude: 0.01 }), "weak_signal"]
  ])("returns no BPM for adversarial finger %s", (_name, samples, reason) => {
    const analysis = analyzeDerivedSamples(samples);
    expect(analysis.bpm).toBeNull();
    expect(analysis.quality.reasons).toContain(reason);
  });

  it("returns no BPM when independent estimators are required to agree exactly", () => {
    const analysis = analyzeDerivedSamples(syntheticDerivedSignal({ bpm: 73 }), {
      minimumDurationMs: 12_000,
      minimumCadenceHz: 20,
      maximumCadenceHz: 60,
      maximumJitterRatio: 0.2,
      maximumDroppedFrameRatio: 0.12,
      minimumCoverage: 0.72,
      maximumSaturation: 0.35,
      maximumMotion: 0.35,
      minimumSignalStrength: 0.002,
      minimumBpm: 35,
      maximumBpm: 220,
      maximumEstimatorDifferenceBpm: 0
    });
    expect(analysis.bpm).toBeNull();
    expect(analysis.quality.reasons).toContain("estimator_disagreement");
  });

  it.each([
    ["noise", "noisy" as const, "excessive_noise"],
    ["clipping", "clipped" as const, "clipping"],
    ["short duration", "short" as const, "insufficient_duration"]
  ])("derives no voice features after %s", (_name, fixture, reason) => {
    const analysis = analyzeVoicePcm(referenceVoiceSignal(fixture));
    expect(analysis.features).toBeNull();
    expect(analysis.quality.reasons).toContain(reason);
  });

  it("disposes PCM immediately after a successful local voice derivation", async () => {
    const pcm = referenceVoiceSignal("clean_stable");
    const provider = new LocalVoiceBiomarkerProvider(voiceDependencies(pcm));
    const result = await provider.capture({
      roundId: ROUND_ID,
      assessmentSessionId: SESSION_ID,
      signal: new AbortController().signal
    });
    expect(result).toMatchObject({
      status: "completed",
      fact: { provider: "local_voice_features", researchOnly: true, rawMediaRef: null }
    });
    expect(pcm.samples.every((sample) => sample === 0)).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/samples|rawAudio|transcript|data:audio/i);
  });

  it("cancels voice capture on page background and starts fresh after resume", async () => {
    const interruptedPcm = referenceVoiceSignal("clean_stable");
    const resumedPcm = referenceVoiceSignal("clean_stable");
    let interrupt: () => void = () => {
      throw new Error("Voice lifecycle listener was not registered.");
    };
    let captureCount = 0;
    const open = vi.fn(async () => ({
      sampleRateHz: 8_000,
      source: {
        collect: ({ signal }: { signal: AbortSignal }) => {
          captureCount += 1;
          if (captureCount > 1) return Promise.resolve(resumedPcm);
          return new Promise<ReturnType<typeof referenceVoiceSignal>>((_, reject) => {
            signal.addEventListener(
              "abort",
              () => {
                interruptedPcm.samples.fill(0);
                reject(new DOMException("page backgrounded", "AbortError"));
              },
              { once: true }
            );
          });
        },
        dispose: async () => undefined
      },
      dispose: async () => undefined
    }));
    const dependencies: VoiceBiomarkerDependencies = {
      ...voiceDependencies(resumedPcm),
      microphone: { open },
      lifecycle: {
        onInterrupted: (listener) => {
          interrupt = listener;
          return () => {
            interrupt = () => undefined;
          };
        }
      }
    };
    const provider = new LocalVoiceBiomarkerProvider(dependencies);
    const backgrounded = provider.capture({
      roundId: ROUND_ID,
      assessmentSessionId: SESSION_ID,
      signal: new AbortController().signal
    });
    await vi.waitFor(() => expect(open).toHaveBeenCalledOnce());
    interrupt();
    await expect(backgrounded).resolves.toMatchObject({
      status: "failed",
      quality: { reasons: ["cancelled"] }
    });
    expect(interruptedPcm.samples.every((sample) => sample === 0)).toBe(true);

    await expect(
      provider.capture({
        roundId: ROUND_ID,
        assessmentSessionId: SESSION_ID,
        signal: new AbortController().signal
      })
    ).resolves.toMatchObject({ status: "completed" });
    expect(resumedPcm.samples.every((sample) => sample === 0)).toBe(true);
    expect(open).toHaveBeenCalledTimes(2);
  });

  it("reports an absent front camera without consent or provider traffic", async () => {
    const harness = vitalLensHarness({
      capability: { available: false, reason: "unsupported_device" }
    });
    await expect(harness.provider.checkAvailability()).resolves.toEqual({
      available: false,
      reason: "unsupported_device"
    });
    await expect(
      harness.provider.capture({
        assessmentSessionId: SESSION_ID,
        signal: new AbortController().signal
      })
    ).resolves.toEqual({
      status: "unavailable",
      provider: "vitallens",
      reason: "unsupported_device"
    });
    expect(harness.requestConsent).not.toHaveBeenCalled();
    expect(harness.openFrontCamera).not.toHaveBeenCalled();
    expect(harness.transport).not.toHaveBeenCalled();
  });

  it("requires explicit VitalLens consent before camera access", async () => {
    const harness = vitalLensHarness({ consentGranted: false });
    await expect(
      harness.provider.capture({
        assessmentSessionId: SESSION_ID,
        signal: new AbortController().signal
      })
    ).resolves.toEqual({
      status: "unavailable",
      provider: "vitallens",
      reason: "permission_denied"
    });
    expect(harness.openFrontCamera).not.toHaveBeenCalled();
    expect(harness.transport).not.toHaveBeenCalled();
  });

  it.each([
    ["quota", new VitalLensTransportError("quota"), "unavailable", "provider_unavailable"],
    [
      "auth/provider failure",
      new VitalLensTransportError("provider_failure"),
      "failed",
      "provider_failure"
    ],
    ["timeout", new VitalLensTransportError("timeout"), "failed", "timeout"]
  ])("cleans the VitalLens camera and payload after %s", async (_name, error, status, marker) => {
    const harness = vitalLensHarness({ transportError: error });
    const result = await harness.provider.capture({
      assessmentSessionId: SESSION_ID,
      signal: new AbortController().signal
    });
    expect(result.status).toBe(status);
    expect(JSON.stringify(result)).toContain(marker);
    expect(harness.stop).toHaveBeenCalledOnce();
    expect(harness.bytes.every((byte) => byte === 0)).toBe(true);
    expect(result).not.toHaveProperty("measurement");
  });

  it("normalizes an upstream VitalLens auth failure and zeroes proxy bytes", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetcher);
    try {
      const bytes = new Uint8Array(75 * 40 * 40 * 3).fill(17);
      const service = new VitalLensProxyService(
        {
          enabled: true,
          apiKey: "fixture-auth-probe-not-a-live-key",
          providerVersion: vitalLensConfiguration.providerVersion,
          consentVersion: vitalLensConfiguration.consentVersion,
          maxPayloadBytes: bytes.byteLength
        },
        new FetchVitalLensInferenceTransport(),
        () => "2026-07-18T12:00:00.000Z"
      );
      const result = await service.infer({
        providerVersion: vitalLensConfiguration.providerVersion,
        requestId: "76000000-0000-4000-8000-000000000008",
        consentVersion: vitalLensConfiguration.consentVersion,
        consentGrantedAt: "2026-07-18T11:59:00.000Z",
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
      expect(result).toEqual({ status: "unavailable", reason: "provider_unavailable" });
      expect(fetcher).toHaveBeenCalledOnce();
      expect(bytes.every((byte) => byte === 0)).toBe(true);
      expect(JSON.stringify(result)).not.toMatch(/fixture-auth-probe|providerPayload|frame/i);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("cancels active VitalLens work without retaining frames or a result", async () => {
    const controller = new AbortController();
    const harness = vitalLensHarness({
      transport: async () => new Promise<never>(() => undefined)
    });
    const pending = harness.provider.capture({
      assessmentSessionId: SESSION_ID,
      signal: controller.signal
    });
    await vi.waitFor(() => expect(harness.transport).toHaveBeenCalledOnce());
    controller.abort();
    await expect(pending).resolves.toMatchObject({
      status: "failed",
      quality: { reasons: ["cancelled"] }
    });
    expect(harness.stop).toHaveBeenCalledOnce();
    expect(harness.bytes.every((byte) => byte === 0)).toBe(true);
  });
});
