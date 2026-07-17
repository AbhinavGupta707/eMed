import { describe, expect, it, vi } from "vitest";

import { referenceVoiceSignal } from "./fixtures";
import { LocalVoiceBiomarkerProvider, type VoiceBiomarkerProcessing } from "./provider";
import { analyzeVoicePcm } from "./signal";
import {
  MicrophoneOpenError,
  type CapturedPcm,
  type MicrophoneSession,
  type VoiceBiomarkerDependencies,
  type VoicePageLifecycle
} from "./types";

const roundId = "90ad0300-2e7d-4a9d-b702-9e94b2074a63";
const assessmentSessionId = "4cc3f950-73ee-49db-ab25-b10dc4675337";
const factId = "c06b45bc-5abc-4597-98ae-e97074feaa0e";

interface FakeOptions {
  readonly capture?: () => CapturedPcm;
  readonly collect?: (signal: AbortSignal) => Promise<CapturedPcm>;
  readonly permission?: "granted" | "prompt" | "denied" | "unknown";
  readonly capability?: Partial<{
    secureContext: boolean;
    mediaDevices: boolean;
    webAudio: boolean;
    audioWorklet: boolean;
    scriptProcessorFallback: boolean;
  }>;
  readonly openError?: MicrophoneOpenError;
}

function createFakeDependencies(options: FakeOptions = {}): {
  dependencies: VoiceBiomarkerDependencies;
  open: ReturnType<typeof vi.fn>;
  sourceDispose: ReturnType<typeof vi.fn>;
  sessionDispose: ReturnType<typeof vi.fn>;
  interrupt: () => void;
} {
  let interruption: (() => void) | null = null;
  const lifecycle: VoicePageLifecycle = {
    onInterrupted(listener) {
      interruption = listener;
      return () => {
        interruption = null;
      };
    }
  };
  const sourceDispose = vi.fn(async () => undefined);
  const sessionDispose = vi.fn(async () => {
    await sourceDispose();
  });
  const open = vi.fn(async (): Promise<MicrophoneSession> => {
    if (options.openError !== undefined) throw options.openError;
    return {
      sampleRateHz: 8_000,
      source: {
        collect: ({ signal }) =>
          options.collect?.(signal) ??
          Promise.resolve(options.capture?.() ?? referenceVoiceSignal("clean_stable")),
        dispose: sourceDispose
      },
      dispose: sessionDispose
    };
  });
  return {
    dependencies: {
      capabilities: {
        inspect: async () => ({
          secureContext: options.capability?.secureContext ?? true,
          mediaDevices: options.capability?.mediaDevices ?? true,
          webAudio: options.capability?.webAudio ?? true,
          audioWorklet: options.capability?.audioWorklet ?? true,
          scriptProcessorFallback: options.capability?.scriptProcessorFallback ?? true
        })
      },
      permission: { query: async () => options.permission ?? "granted" },
      microphone: { open },
      lifecycle,
      now: () => new Date("2026-07-17T18:45:00.000Z"),
      randomUuid: () => factId
    },
    open,
    sourceDispose,
    sessionDispose,
    interrupt: () => interruption?.()
  };
}

function captureInput(signal = new AbortController().signal): {
  roundId: string;
  assessmentSessionId: string;
  signal: AbortSignal;
} {
  return { roundId, assessmentSessionId, signal };
}

describe("LocalVoiceBiomarkerProvider", () => {
  it("returns only a deterministic research-only fact after passing quality", async () => {
    const pcm = referenceVoiceSignal("clean_stable");
    const fake = createFakeDependencies({ capture: () => pcm });
    const provider = new LocalVoiceBiomarkerProvider(fake.dependencies);

    const result = await provider.capture(captureInput());

    expect(result.status).toBe("completed");
    if (result.status !== "completed") throw new Error("Expected completed result");
    expect(result.fact).toMatchObject({
      factId,
      roundId,
      assessmentSessionId,
      provider: "local_voice_features",
      observedAt: "2026-07-17T18:45:00.000Z",
      durationMs: 7_000,
      algorithmVersion: "local_sustained_vowel_features_v1",
      researchOnly: true,
      rawMediaRef: null
    });
    expect(result.fact.features.medianFundamentalFrequencyHz).toBeCloseTo(180, 0);
    expect(result.fact.quality.status).toBe("pass");
    expect(result.fact).not.toHaveProperty("samples");
    expect(result.fact).not.toHaveProperty("audio");
    expect(JSON.stringify(result)).not.toMatch(/Float32Array|data:audio|blob:|base64/i);
    expect(pcm.samples.every((sample) => sample === 0)).toBe(true);
    expect(fake.sessionDispose).toHaveBeenCalledOnce();
  });

  it("offers one quality retry, then fails the same session with no fact", async () => {
    const buffers: Float32Array[] = [];
    const fake = createFakeDependencies({
      capture: () => {
        const capture = referenceVoiceSignal("short");
        buffers.push(capture.samples);
        return capture;
      }
    });
    const provider = new LocalVoiceBiomarkerProvider(fake.dependencies);

    const first = await provider.capture(captureInput());
    const second = await provider.capture(captureInput());

    expect(first.status).toBe("retry");
    expect(second.status).toBe("failed");
    if (first.status === "retry") {
      expect(first.quality.reasons).toContain("insufficient_duration");
      expect(first).not.toHaveProperty("fact");
    }
    if (second.status === "failed") expect(second.quality.status).toBe("fail");
    expect(buffers).toHaveLength(2);
    expect(buffers.every((buffer) => buffer.every((sample) => sample === 0))).toBe(true);
  });

  it("zeros PCM when cancellation happens immediately after ownership transfers", async () => {
    const controller = new AbortController();
    const pcm = referenceVoiceSignal("clean_stable");
    const fake = createFakeDependencies({
      collect: async () => {
        controller.abort();
        return pcm;
      }
    });
    const provider = new LocalVoiceBiomarkerProvider(fake.dependencies);

    const result = await provider.capture(captureInput(controller.signal));

    expect(result.status).toBe("failed");
    if (result.status === "failed") expect(result.quality.reasons).toEqual(["cancelled"]);
    expect(pcm.samples.every((sample) => sample === 0)).toBe(true);
    expect(fake.sessionDispose).toHaveBeenCalledOnce();
  });

  it("zeros PCM and returns a bounded unavailable result when analysis errors", async () => {
    const pcm = referenceVoiceSignal("clean_stable");
    const fake = createFakeDependencies({ capture: () => pcm });
    const processing: VoiceBiomarkerProcessing = {
      signal: {
        analyze: () => {
          throw new Error("synthetic analysis failure");
        }
      },
      normalizer: {
        complete: () => {
          throw new Error("normalizer should not run");
        }
      }
    };
    const provider = new LocalVoiceBiomarkerProvider(fake.dependencies, {}, processing);

    await expect(provider.capture(captureInput())).resolves.toEqual({
      status: "unavailable",
      provider: "local_voice_features",
      reason: "microphone_unavailable"
    });
    expect(pcm.samples.every((sample) => sample === 0)).toBe(true);
    expect(fake.sessionDispose).toHaveBeenCalledOnce();
  });

  it("does not open a microphone when permission is denied", async () => {
    const fake = createFakeDependencies({ permission: "denied" });
    const provider = new LocalVoiceBiomarkerProvider(fake.dependencies);

    await expect(provider.checkAvailability()).resolves.toEqual({
      available: false,
      reason: "permission_denied"
    });
    await expect(provider.capture(captureInput())).resolves.toEqual({
      status: "unavailable",
      provider: "local_voice_features",
      reason: "permission_denied"
    });
    expect(fake.open).not.toHaveBeenCalled();
  });

  it("returns unsupported without prompting on an insecure or Web-Audio-less browser", async () => {
    const fake = createFakeDependencies({ capability: { secureContext: false, webAudio: false } });
    const provider = new LocalVoiceBiomarkerProvider(fake.dependencies);

    await expect(provider.capture(captureInput())).resolves.toEqual({
      status: "unavailable",
      provider: "local_voice_features",
      reason: "unsupported_device"
    });
    expect(fake.open).not.toHaveBeenCalled();
  });

  it("maps a denied getUserMedia request to the frozen unavailable reason", async () => {
    const fake = createFakeDependencies({
      permission: "prompt",
      openError: new MicrophoneOpenError("permission_denied", "denied")
    });
    const provider = new LocalVoiceBiomarkerProvider(fake.dependencies);

    await expect(provider.capture(captureInput())).resolves.toEqual({
      status: "unavailable",
      provider: "local_voice_features",
      reason: "permission_denied"
    });
  });

  it("cancels lifecycle-interrupted work, disposes once, and releases source-owned PCM", async () => {
    const pcm = referenceVoiceSignal("clean_stable");
    const fake = createFakeDependencies({
      collect: (signal) =>
        new Promise((_, reject) => {
          signal.addEventListener(
            "abort",
            () => {
              pcm.samples.fill(0);
              reject(new DOMException("cancelled", "AbortError"));
            },
            { once: true }
          );
        })
    });
    const provider = new LocalVoiceBiomarkerProvider(fake.dependencies);
    const capture = provider.capture(captureInput());
    await vi.waitFor(() => expect(fake.open).toHaveBeenCalledOnce());

    fake.interrupt();
    const result = await capture;

    expect(result.status).toBe("failed");
    if (result.status === "failed") expect(result.quality.reasons).toEqual(["cancelled"]);
    expect(pcm.samples.every((sample) => sample === 0)).toBe(true);
    expect(fake.sessionDispose).toHaveBeenCalledOnce();
  });

  it("aborts active capture on repeated disposal and rejects later capture safely", async () => {
    const pcm = referenceVoiceSignal("clean_stable");
    const fake = createFakeDependencies({
      collect: (signal) =>
        new Promise((_, reject) => {
          signal.addEventListener(
            "abort",
            () => {
              pcm.samples.fill(0);
              reject(new DOMException("cancelled", "AbortError"));
            },
            { once: true }
          );
        })
    });
    const provider = new LocalVoiceBiomarkerProvider(fake.dependencies);
    const capture = provider.capture(captureInput());
    await vi.waitFor(() => expect(fake.open).toHaveBeenCalledOnce());

    await Promise.all([provider.dispose(), provider.dispose()]);
    await provider.dispose();

    await expect(capture).resolves.toMatchObject({ status: "failed" });
    expect(fake.sessionDispose).toHaveBeenCalledOnce();
    expect(pcm.samples.every((sample) => sample === 0)).toBe(true);
    await expect(provider.capture(captureInput())).resolves.toEqual({
      status: "unavailable",
      provider: "local_voice_features",
      reason: "microphone_unavailable"
    });
  });

  it("rejects a concurrent start without disturbing the active capture", async () => {
    const pcm = referenceVoiceSignal("clean_stable");
    let release: () => void = () => undefined;
    const fake = createFakeDependencies({
      collect: () =>
        new Promise((resolve) => {
          release = () => resolve(pcm);
        })
    });
    const provider = new LocalVoiceBiomarkerProvider(fake.dependencies);
    const first = provider.capture(captureInput());
    await vi.waitFor(() => expect(fake.open).toHaveBeenCalledOnce());

    await expect(provider.capture(captureInput())).resolves.toEqual({
      status: "unavailable",
      provider: "local_voice_features",
      reason: "microphone_unavailable"
    });
    expect(fake.open).toHaveBeenCalledOnce();

    release();
    await expect(first).resolves.toMatchObject({ status: "completed" });
    expect(pcm.samples.every((sample) => sample === 0)).toBe(true);
  });

  it("validates IDs before capture and never invents a fact on invalid input", async () => {
    const fake = createFakeDependencies();
    const provider = new LocalVoiceBiomarkerProvider(fake.dependencies);

    await expect(
      provider.capture({
        roundId: "not-a-round-id",
        assessmentSessionId,
        signal: new AbortController().signal
      })
    ).resolves.toEqual({
      status: "unavailable",
      provider: "local_voice_features",
      reason: "microphone_unavailable"
    });
    expect(fake.open).not.toHaveBeenCalled();
  });

  it("can inject the pure processor without widening the provider result", async () => {
    const pcm = referenceVoiceSignal("clean_stable");
    const fake = createFakeDependencies({ capture: () => pcm });
    const analyze = vi.fn(analyzeVoicePcm);
    const processing: VoiceBiomarkerProcessing = {
      signal: { analyze },
      normalizer: {
        complete: (input) => ({
          status: "completed",
          fact: {
            factId,
            roundId: input.roundId,
            assessmentSessionId: input.assessmentSessionId,
            provider: "local_voice_features",
            observedAt: input.observedAt.toISOString(),
            durationMs: input.analysis.quality.metrics.durationMs,
            algorithmVersion: "local_sustained_vowel_features_v1",
            features: input.analysis.features!,
            quality: { ...input.analysis.quality, status: "pass" },
            researchOnly: true,
            rawMediaRef: null
          }
        })
      }
    };
    const provider = new LocalVoiceBiomarkerProvider(fake.dependencies, {}, processing);

    const result = await provider.capture(captureInput());

    expect(result.status).toBe("completed");
    expect(analyze).toHaveBeenCalledOnce();
    expect(pcm.samples.every((sample) => sample === 0)).toBe(true);
  });
});
