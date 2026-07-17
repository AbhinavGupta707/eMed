import {
  VoiceBiomarkerFactSchema,
  VoiceBiomarkerQualitySchema,
  type VoiceBiomarkerAssessmentResult,
  type VoiceBiomarkerProvider,
  type VoiceBiomarkerQuality
} from "@homerounds/contracts";
import { describe, expect, it, vi } from "vitest";

import { VoiceBiomarkerStationController, type VoiceBiomarkerTimer } from "./controller";

const ROUND_ID = "b8731a19-3b2e-4c44-a1ab-d92b96b7e26a";
const SESSION_ID = "7fc9ed94-7b72-47ca-a83c-8d2b762c2401";
const FACT_ID = "a43a350f-d6aa-4251-b19d-9eabf7e6cb4f";
const NOW = "2026-07-17T12:00:00.000Z";

function quality<TStatus extends "pass" | "retry" | "fail">(
  status: TStatus,
  reasons: Array<
    | "insufficient_duration"
    | "excessive_noise"
    | "clipping"
    | "insufficient_voiced_audio"
    | "unstable_pitch"
    | "cancelled"
  > = []
): VoiceBiomarkerQuality & { status: TStatus } {
  const parsed = VoiceBiomarkerQualitySchema.parse({
    status,
    score: status === "pass" ? 0.91 : 0.31,
    reasons,
    metrics: {
      sampleRateHz: 48_000,
      durationMs: status === "pass" ? 7_000 : 3_000,
      clippingFraction: status === "pass" ? 0.001 : 0.03,
      voicedFraction: status === "pass" ? 0.9 : 0.35,
      estimatedSnrDb: status === "pass" ? 24 : 5
    }
  });
  return { ...parsed, status };
}

function passingFact() {
  return VoiceBiomarkerFactSchema.parse({
    factId: FACT_ID,
    roundId: ROUND_ID,
    assessmentSessionId: SESSION_ID,
    provider: "local_voice_features",
    observedAt: NOW,
    durationMs: 7_000,
    algorithmVersion: "synthetic-voice-features-v1",
    features: {
      medianFundamentalFrequencyHz: 181.2,
      pitchVariabilitySemitones: 0.42,
      jitterPercent: 0.71,
      shimmerPercent: 2.4,
      harmonicToNoiseRatioDb: 21.5,
      phonationDurationMs: 7_000
    },
    quality: quality("pass"),
    researchOnly: true,
    rawMediaRef: null
  });
}

function provider(
  capture: VoiceBiomarkerProvider["capture"],
  availability:
    Awaited<ReturnType<VoiceBiomarkerProvider["checkAvailability"]>> | undefined = undefined
): VoiceBiomarkerProvider {
  return {
    kind: "local_voice_features",
    checkAvailability: vi.fn(
      async () =>
        availability ?? { available: true as const, capabilities: { localAnalysis: true } }
    ),
    capture,
    dispose: vi.fn(async () => undefined)
  };
}

function staticTimer(): VoiceBiomarkerTimer {
  return {
    now: () => 0,
    setInterval: () => 1 as unknown as ReturnType<typeof globalThis.setInterval>,
    clearInterval: vi.fn()
  };
}

describe("voice biomarker station controller", () => {
  it("presents microphone permission denial as unavailable without starting capture", async () => {
    const capture = vi.fn<VoiceBiomarkerProvider["capture"]>();
    const subject = new VoiceBiomarkerStationController({
      provider: provider(capture, {
        available: false,
        reason: "permission_denied"
      }),
      roundId: ROUND_ID,
      assessmentSessionId: SESSION_ID,
      onCompleted: vi.fn(async () => undefined),
      timer: staticTimer()
    });

    await subject.initialize();

    expect(subject.getSnapshot()).toMatchObject({
      phase: "unavailable",
      unavailableReason: "permission_denied",
      fact: null
    });
    expect(subject.getSnapshot().announcement).toMatch(/permission was denied/i);
    expect(capture).not.toHaveBeenCalled();
  });

  it("creates no fact for retry or fail and labels the first passing capture baseline started", async () => {
    const outcomes: VoiceBiomarkerAssessmentResult[] = [
      { status: "retry", quality: quality("retry", ["excessive_noise"]) },
      { status: "failed", quality: quality("fail", ["clipping"]) },
      { status: "completed", fact: passingFact() }
    ];
    const capture = vi.fn(async () => {
      const outcome = outcomes.shift();
      if (!outcome) throw new Error("No synthetic outcome remaining");
      return outcome;
    });
    const onCompleted = vi.fn(async () => undefined);
    const subject = new VoiceBiomarkerStationController({
      provider: provider(capture),
      roundId: ROUND_ID,
      assessmentSessionId: SESSION_ID,
      onCompleted,
      timer: staticTimer()
    });
    await subject.initialize();
    subject.setConsent(true);

    await subject.startCapture();
    expect(subject.getSnapshot()).toMatchObject({ phase: "retry", fact: null });
    expect(onCompleted).not.toHaveBeenCalled();

    await subject.startCapture();
    expect(subject.getSnapshot()).toMatchObject({ phase: "failed", fact: null });
    expect(onCompleted).not.toHaveBeenCalled();

    await subject.startCapture();
    expect(subject.getSnapshot()).toMatchObject({
      phase: "completed",
      fact: expect.objectContaining({ rawMediaRef: null, researchOnly: true })
    });
    expect(onCompleted).toHaveBeenCalledTimes(1);
    expect(subject.getSnapshot().announcement).toMatch(/Baseline started/i);
    expect(subject.getSnapshot().announcement).toMatch(/not a diagnosis/i);
  });

  it("cancels an in-flight capture without accepting its later provider result", async () => {
    let finish: ((outcome: VoiceBiomarkerAssessmentResult) => void) | undefined;
    const capture = vi.fn(
      () =>
        new Promise<VoiceBiomarkerAssessmentResult>((resolve) => {
          finish = resolve;
        })
    );
    const onCompleted = vi.fn(async () => undefined);
    const subject = new VoiceBiomarkerStationController({
      provider: provider(capture),
      roundId: ROUND_ID,
      assessmentSessionId: SESSION_ID,
      onCompleted,
      timer: staticTimer()
    });
    await subject.initialize();
    subject.setConsent(true);

    const pending = subject.startCapture();
    expect(subject.getSnapshot().phase).toBe("capturing");
    subject.cancelCapture();
    finish?.({ status: "completed", fact: passingFact() });
    await pending;

    expect(subject.getSnapshot()).toMatchObject({ phase: "ready", fact: null, elapsedMs: 0 });
    expect(subject.getSnapshot().announcement).toMatch(/No voice result was created/i);
    expect(onCompleted).not.toHaveBeenCalled();
  });

  it("supports explicit decline before capture and suppresses duplicate decline", async () => {
    let release: (() => void) | undefined;
    const decline = new Promise<void>((resolve) => {
      release = resolve;
    });
    const onDeclined = vi.fn(() => decline);
    const subject = new VoiceBiomarkerStationController({
      provider: provider(vi.fn()),
      roundId: ROUND_ID,
      assessmentSessionId: SESSION_ID,
      onCompleted: vi.fn(async () => undefined),
      onDeclined,
      timer: staticTimer()
    });
    await subject.initialize();

    const pending = subject.decline();
    void subject.decline();
    expect(subject.getSnapshot().phase).toBe("declining");
    expect(onDeclined).toHaveBeenCalledTimes(1);
    release?.();
    await pending;

    expect(subject.getSnapshot()).toMatchObject({ phase: "declined", consent: false, fact: null });
  });
});
