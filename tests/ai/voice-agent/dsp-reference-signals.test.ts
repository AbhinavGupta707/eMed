import { analyzeVoicePcm } from "../../../packages/assessments/providers/voice-biomarker/signal";
import { referenceVoiceSignal } from "../../../packages/assessments/providers/voice-biomarker/fixtures";
import { describe, expect, it } from "vitest";

describe("independent deterministic voice-signal verification", () => {
  it("keeps the clean synthetic reference inside documented engineering tolerances", () => {
    const first = analyzeVoicePcm(referenceVoiceSignal("clean_stable"));
    const second = analyzeVoicePcm(referenceVoiceSignal("clean_stable"));

    expect(second).toEqual(first);
    expect(first.quality).toMatchObject({
      status: "pass",
      reasons: [],
      metrics: {
        sampleRateHz: 8_000,
        durationMs: 7_000,
        clippingFraction: 0
      }
    });
    expect(first.quality.score).toBeGreaterThanOrEqual(0.7);
    expect(first.quality.metrics.voicedFraction).toBeGreaterThanOrEqual(0.98);
    expect(first.quality.metrics.estimatedSnrDb).toBeGreaterThanOrEqual(25);
    expect(first.features).not.toBeNull();
    expect(first.features?.medianFundamentalFrequencyHz).toBeGreaterThanOrEqual(179);
    expect(first.features?.medianFundamentalFrequencyHz).toBeLessThanOrEqual(181);
    expect(first.features?.pitchVariabilitySemitones).toBeLessThanOrEqual(0.1);
    expect(first.features?.jitterPercent).toBeLessThanOrEqual(0.1);
    expect(first.features?.shimmerPercent).toBeLessThanOrEqual(1);
    expect(first.features?.harmonicToNoiseRatioDb).toBeGreaterThanOrEqual(25);
    expect(first.features?.phonationDurationMs).toBeGreaterThanOrEqual(6_950);
    expect(first.features?.phonationDurationMs).toBeLessThanOrEqual(7_000);
    expect(JSON.stringify(first)).not.toMatch(
      /"(?:diagnosis|disease|urgency|action|prescription)"\s*:/i
    );
  });

  it.each([
    ["short", "insufficient_duration"],
    ["noisy", "excessive_noise"],
    ["clipped", "clipping"],
    ["unstable", "unstable_pitch"]
  ] as const)(
    "returns deterministic retry-without-features for the %s reference",
    (reference, requiredReason) => {
      const first = analyzeVoicePcm(referenceVoiceSignal(reference));
      const second = analyzeVoicePcm(referenceVoiceSignal(reference));

      expect(second).toEqual(first);
      expect(first.quality.status).toBe("retry");
      expect(first.quality.score).toBeLessThanOrEqual(0.49);
      expect(first.quality.reasons).toContain(requiredReason);
      expect(first.features).toBeNull();
      expect(JSON.stringify(first)).not.toMatch(
        /"(?:diagnosis|disease|urgency|action|prescription)"\s*:/i
      );
    }
  );
});
