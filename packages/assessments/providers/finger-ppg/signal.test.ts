import { describe, expect, it } from "vitest";

import { syntheticDerivedSignal } from "./fixtures";
import { analyzeDerivedSamples, DEFAULT_SIGNAL_THRESHOLDS } from "./signal";

describe("finger-PPG pure signal analysis", () => {
  it("passes a clean deterministic derived signal with agreeing estimators", () => {
    const analysis = analyzeDerivedSamples(syntheticDerivedSignal({ bpm: 72 }));

    expect(analysis.quality.status).toBe("pass");
    expect(analysis.quality.reasons).toEqual([]);
    expect(analysis.bpm).toBeCloseTo(72, 0);
    expect(analysis.quality.metrics.estimatorDifferenceBpm).toBeLessThanOrEqual(10);
  });

  it("rejects a weak signal", () => {
    const analysis = analyzeDerivedSamples(syntheticDerivedSignal({ amplitude: 0.01 }));

    expect(analysis.bpm).toBeNull();
    expect(analysis.quality.status).toBe("retry");
    expect(analysis.quality.reasons).toContain("weak_signal");
  });

  it("rejects excessive saturation", () => {
    const analysis = analyzeDerivedSamples(syntheticDerivedSignal({ saturation: 0.8 }));

    expect(analysis.bpm).toBeNull();
    expect(analysis.quality.reasons).toContain("saturation");
  });

  it("rejects insufficient finger coverage", () => {
    const analysis = analyzeDerivedSamples(syntheticDerivedSignal({ coverage: 0.2 }));

    expect(analysis.bpm).toBeNull();
    expect(analysis.quality.reasons).toContain("weak_signal");
  });

  it("rejects excessive motion", () => {
    const analysis = analyzeDerivedSamples(syntheticDerivedSignal({ motion: 0.7 }));

    expect(analysis.bpm).toBeNull();
    expect(analysis.quality.reasons).toContain("motion");
  });

  it("rejects irregular cadence and jitter", () => {
    const analysis = analyzeDerivedSamples(
      syntheticDerivedSignal({
        timestampTransform: (timestamp, index) => timestamp + (index % 2 === 0 ? 0 : 20)
      })
    );

    expect(analysis.bpm).toBeNull();
    expect(analysis.quality.reasons).toContain("irregular_cadence");
    expect(analysis.quality.metrics.jitterRatio).toBeGreaterThan(0.2);
  });

  it("detects dropped frames from timestamp gaps", () => {
    const analysis = analyzeDerivedSamples(
      syntheticDerivedSignal({
        timestampTransform: (timestamp, index) => timestamp + Math.floor(index / 20) * 200
      })
    );

    expect(analysis.bpm).toBeNull();
    expect(analysis.quality.reasons).toContain("irregular_cadence");
    expect(analysis.quality.metrics.droppedFrameRatio).toBeGreaterThan(0.12);
  });

  it("rejects insufficient duration", () => {
    const analysis = analyzeDerivedSamples(syntheticDerivedSignal({ durationMs: 4_000 }));

    expect(analysis.bpm).toBeNull();
    expect(analysis.quality.reasons).toContain("insufficient_duration");
  });

  it("emits no estimate for an implausible rate", () => {
    const analysis = analyzeDerivedSamples(syntheticDerivedSignal({ bpm: 235 }));

    expect(analysis.bpm).toBeNull();
    expect(analysis.quality.status).toBe("fail");
    expect(analysis.quality.reasons).toContain("provider_quality_failed");
  });

  it("requires spectral and autocorrelation estimator agreement", () => {
    const analysis = analyzeDerivedSamples(syntheticDerivedSignal({ bpm: 73 }), {
      ...DEFAULT_SIGNAL_THRESHOLDS,
      maximumEstimatorDifferenceBpm: 0
    });

    expect(analysis.bpm).toBeNull();
    expect(analysis.quality.reasons).toContain("estimator_disagreement");
  });

  it("validates every derived sample before processing", () => {
    const invalid = syntheticDerivedSignal().slice(0, 5);
    invalid[2] = { ...invalid[2]!, coverage: 2 };

    expect(() => analyzeDerivedSamples(invalid)).toThrow();
  });

  it("is engineering evidence only and does not claim medical accuracy", () => {
    // Physical iPhone comparison remains a later human gate; fixtures prove software behaviour only.
    expect(syntheticDerivedSignal()).toHaveLength(601);
  });
});
