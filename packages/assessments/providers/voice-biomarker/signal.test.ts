import { describe, expect, it } from "vitest";

import { referenceVoiceSignal, syntheticSustainedVowel } from "./fixtures";
import { analyzeVoicePcm } from "./signal";

describe("local sustained-vowel signal analysis", () => {
  it("derives toleranced features from the clean stable reference signal", () => {
    const analysis = analyzeVoicePcm(referenceVoiceSignal("clean_stable"));

    expect(analysis.quality.status).toBe("pass");
    expect(analysis.quality.reasons).toEqual([]);
    expect(analysis.quality.metrics.durationMs).toBe(7_000);
    expect(analysis.quality.metrics.clippingFraction).toBe(0);
    expect(analysis.quality.metrics.voicedFraction).toBeGreaterThan(0.98);
    expect(analysis.quality.metrics.estimatedSnrDb).toBeGreaterThan(25);
    expect(analysis.features).not.toBeNull();
    expect(analysis.features?.medianFundamentalFrequencyHz).toBeCloseTo(180, 0);
    expect(analysis.features?.pitchVariabilitySemitones).toBeLessThan(0.1);
    expect(analysis.features?.jitterPercent).toBeLessThan(0.1);
    expect(analysis.features?.shimmerPercent).toBeLessThan(1);
    expect(analysis.features?.harmonicToNoiseRatioDb).toBeGreaterThan(25);
    expect(analysis.features?.phonationDurationMs).toBeGreaterThanOrEqual(6_950);
    expect(analysis.features?.phonationDurationMs).toBeLessThanOrEqual(7_000);
  });

  it("returns retry with no fact features for a short capture", () => {
    const analysis = analyzeVoicePcm(referenceVoiceSignal("short"));

    expect(analysis.quality.status).toBe("retry");
    expect(analysis.quality.reasons).toContain("insufficient_duration");
    expect(analysis.features).toBeNull();
  });

  it("rejects a noisy capture through deterministic SNR and voicing gates", () => {
    const analysis = analyzeVoicePcm(referenceVoiceSignal("noisy"));

    expect(analysis.quality.status).toBe("retry");
    expect(analysis.quality.reasons).toContain("excessive_noise");
    expect(analysis.quality.metrics.estimatedSnrDb ?? 0).toBeLessThan(14);
    expect(analysis.features).toBeNull();
  });

  it("rejects a clipped capture without deriving features", () => {
    const analysis = analyzeVoicePcm(referenceVoiceSignal("clipped"));

    expect(analysis.quality.status).toBe("retry");
    expect(analysis.quality.reasons).toContain("clipping");
    expect(analysis.quality.metrics.clippingFraction).toBeGreaterThan(0.005);
    expect(analysis.features).toBeNull();
  });

  it("rejects unstable pitch even when the signal remains voiced", () => {
    const analysis = analyzeVoicePcm(referenceVoiceSignal("unstable"));

    expect(analysis.quality.status).toBe("retry");
    expect(analysis.quality.reasons).toContain("unstable_pitch");
    expect(analysis.quality.metrics.voicedFraction).toBeGreaterThan(0.9);
    expect(analysis.features).toBeNull();
  });

  it("rejects unvoiced audio without inventing a pitch or SNR", () => {
    const analysis = analyzeVoicePcm(referenceVoiceSignal("unvoiced"));

    expect(analysis.quality.status).toBe("retry");
    expect(analysis.quality.reasons).toContain("insufficient_voiced_audio");
    expect(analysis.quality.metrics.voicedFraction).toBeLessThan(0.72);
    expect(analysis.features).toBeNull();
  });

  it("is bit-for-bit deterministic for the same synthetic reference input", () => {
    const first = analyzeVoicePcm(syntheticSustainedVowel({ seed: 20260717 }));
    const second = analyzeVoicePcm(syntheticSustainedVowel({ seed: 20260717 }));

    expect(second).toEqual(first);
  });

  it("rejects non-finite PCM at the local analysis boundary", () => {
    const capture = syntheticSustainedVowel({ durationMs: 10 });
    capture.samples[2] = Number.NaN;

    expect(() => analyzeVoicePcm(capture)).toThrow();
  });

  it("uses synthetic signals only and makes no medical-accuracy claim", () => {
    expect(referenceVoiceSignal("clean_stable").samples).toHaveLength(56_000);
  });
});
