import type { CaptureQuality } from "@homerounds/contracts/assessment";

import { DerivedOpticalSampleSchema, type DerivedOpticalSample } from "./types";

export const FINGER_PPG_ALGORITHM_VERSION = "finger_ppg_hr_v1";

export interface SignalQualityThresholds {
  readonly minimumDurationMs: number;
  readonly minimumCadenceHz: number;
  readonly maximumCadenceHz: number;
  readonly maximumJitterRatio: number;
  readonly maximumDroppedFrameRatio: number;
  readonly minimumCoverage: number;
  readonly maximumSaturation: number;
  readonly maximumMotion: number;
  readonly minimumSignalStrength: number;
  readonly minimumBpm: number;
  readonly maximumBpm: number;
  readonly maximumEstimatorDifferenceBpm: number;
}

export const DEFAULT_SIGNAL_THRESHOLDS: SignalQualityThresholds = {
  minimumDurationMs: 15_000,
  minimumCadenceHz: 15,
  maximumCadenceHz: 60,
  maximumJitterRatio: 0.2,
  maximumDroppedFrameRatio: 0.12,
  minimumCoverage: 0.7,
  maximumSaturation: 0.18,
  maximumMotion: 0.16,
  minimumSignalStrength: 0.0015,
  minimumBpm: 40,
  maximumBpm: 200,
  maximumEstimatorDifferenceBpm: 10
};

export interface SignalAnalysis {
  readonly bpm: number | null;
  readonly durationMs: number;
  readonly quality: CaptureQuality;
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle] ?? 0;
  const lower = sorted[middle - 1] ?? upper;
  return sorted.length % 2 === 0 ? (lower + upper) / 2 : upper;
}

function standardDeviation(values: readonly number[]): number {
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}

function detrend(values: readonly number[]): number[] {
  if (values.length < 2) return values.map(() => 0);
  const lastIndex = values.length - 1;
  const xMean = lastIndex / 2;
  const yMean = mean(values);
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < values.length; index += 1) {
    numerator += (index - xMean) * ((values[index] ?? yMean) - yMean);
    denominator += (index - xMean) ** 2;
  }
  const slope = denominator === 0 ? 0 : numerator / denominator;
  return values.map((value, index) => value - (yMean + slope * (index - xMean)));
}

function bandPass(values: readonly number[], cadenceHz: number): number[] {
  const baselineWindow = Math.max(3, Math.round(cadenceHz * 1.5));
  const detrended = detrend(values);
  const highPassed = detrended.map((value, index) => {
    const start = Math.max(0, index - baselineWindow);
    const local = detrended.slice(start, index + 1);
    return value - mean(local);
  });
  return highPassed.map((value, index) => {
    const previous = highPassed[index - 1] ?? value;
    const next = highPassed[index + 1] ?? value;
    return (previous + 2 * value + next) / 4;
  });
}

function spectralEstimate(
  values: readonly number[],
  cadenceHz: number,
  minimumBpm: number,
  maximumBpm: number
): number {
  let bestBpm = minimumBpm;
  let bestPower = Number.NEGATIVE_INFINITY;
  for (let bpm = minimumBpm; bpm <= maximumBpm; bpm += 0.5) {
    const frequency = bpm / 60;
    let sine = 0;
    let cosine = 0;
    for (let index = 0; index < values.length; index += 1) {
      const angle = (2 * Math.PI * frequency * index) / cadenceHz;
      const value = values[index] ?? 0;
      sine += value * Math.sin(angle);
      cosine += value * Math.cos(angle);
    }
    const power = sine ** 2 + cosine ** 2;
    if (power > bestPower) {
      bestPower = power;
      bestBpm = bpm;
    }
  }
  return bestBpm;
}

function autocorrelationEstimate(
  values: readonly number[],
  cadenceHz: number,
  minimumBpm: number,
  maximumBpm: number
): number {
  const minimumLag = Math.max(1, Math.floor((cadenceHz * 60) / maximumBpm));
  const maximumLag = Math.min(values.length - 2, Math.ceil((cadenceHz * 60) / minimumBpm));
  let bestLag = minimumLag;
  let bestCorrelation = Number.NEGATIVE_INFINITY;
  for (let lag = minimumLag; lag <= maximumLag; lag += 1) {
    let numerator = 0;
    let leftEnergy = 0;
    let rightEnergy = 0;
    for (let index = lag; index < values.length; index += 1) {
      const left = values[index] ?? 0;
      const right = values[index - lag] ?? 0;
      numerator += left * right;
      leftEnergy += left ** 2;
      rightEnergy += right ** 2;
    }
    const correlation = numerator / Math.sqrt(Math.max(leftEnergy * rightEnergy, Number.EPSILON));
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestLag = lag;
    }
  }
  return (cadenceHz * 60) / bestLag;
}

interface ScoreMetrics {
  readonly jitterRatio: number;
  readonly droppedFrameRatio: number;
  readonly coverage: number;
  readonly saturation: number;
  readonly motion: number;
  readonly signalStrength: number;
  readonly estimatorDifferenceBpm: number;
}

function qualityScore(metrics: ScoreMetrics): number {
  const cadence = Math.max(0, 1 - metrics.jitterRatio * 2 - metrics.droppedFrameRatio * 2);
  const exposure = Math.max(0, Math.min(1, metrics.coverage) * (1 - metrics.saturation));
  const stability = Math.max(0, 1 - metrics.motion * 3);
  const signal = Math.min(1, metrics.signalStrength / 0.01);
  const agreement = Math.max(0, 1 - metrics.estimatorDifferenceBpm / 20);
  return Math.max(0, Math.min(1, mean([cadence, exposure, stability, signal, agreement])));
}

export function analyzeDerivedSamples(
  input: readonly DerivedOpticalSample[],
  thresholds: SignalQualityThresholds = DEFAULT_SIGNAL_THRESHOLDS
): SignalAnalysis {
  const samples = input.map((sample) => DerivedOpticalSampleSchema.parse(sample));
  const ordered = [...samples].sort((left, right) => left.timestampMs - right.timestampMs);
  const durationMs = Math.max(
    0,
    (ordered.at(-1)?.timestampMs ?? 0) - (ordered[0]?.timestampMs ?? 0)
  );
  const intervals = ordered
    .slice(1)
    .map((sample, index) => sample.timestampMs - (ordered[index]?.timestampMs ?? 0));
  const positiveIntervals = intervals.filter((interval) => interval > 0);
  const medianIntervalMs = median(positiveIntervals);
  const cadenceHz = durationMs > 0 ? ((ordered.length - 1) * 1000) / durationMs : 0;
  const jitterRatio =
    medianIntervalMs > 0
      ? median(positiveIntervals.map((interval) => Math.abs(interval - medianIntervalMs))) /
        medianIntervalMs
      : 1;
  const expectedSamples =
    medianIntervalMs > 0 ? Math.floor(durationMs / medianIntervalMs) + 1 : ordered.length;
  const droppedFrameRatio = Math.max(
    0,
    (expectedSamples - ordered.length) / Math.max(expectedSamples, 1)
  );
  const coverage = mean(ordered.map((sample) => sample.coverage));
  const saturation = mean(ordered.map((sample) => sample.saturation));
  const motion = mean(ordered.map((sample) => sample.motion));
  const green = ordered.map((sample) => sample.meanGreen);
  const filtered = bandPass(green, Math.max(cadenceHz, 1));
  const signalStrength = standardDeviation(filtered) / Math.max(mean(green), 1);
  const detectionMinimumBpm = Math.max(20, thresholds.minimumBpm - 20);
  const detectionMaximumBpm = Math.min(260, thresholds.maximumBpm + 60);
  const spectralBpm =
    ordered.length >= 3
      ? spectralEstimate(filtered, Math.max(cadenceHz, 1), detectionMinimumBpm, detectionMaximumBpm)
      : 0;
  const autocorrelationBpm =
    ordered.length >= 3
      ? autocorrelationEstimate(
          filtered,
          Math.max(cadenceHz, 1),
          detectionMinimumBpm,
          detectionMaximumBpm
        )
      : 0;
  const estimatorDifferenceBpm = Math.abs(spectralBpm - autocorrelationBpm);

  const metrics = {
    durationMs,
    sampleCount: ordered.length,
    cadenceHz,
    jitterRatio,
    droppedFrameRatio,
    coverage,
    saturation,
    motion,
    signalStrength,
    spectralBpm,
    autocorrelationBpm,
    estimatorDifferenceBpm
  };

  const reasons: CaptureQuality["reasons"] = [];
  if (durationMs < thresholds.minimumDurationMs) reasons.push("insufficient_duration");
  if (signalStrength < thresholds.minimumSignalStrength) reasons.push("weak_signal");
  if (saturation > thresholds.maximumSaturation) reasons.push("saturation");
  if (coverage < thresholds.minimumCoverage) reasons.push("weak_signal");
  if (motion > thresholds.maximumMotion) reasons.push("motion");
  if (
    cadenceHz < thresholds.minimumCadenceHz ||
    cadenceHz > thresholds.maximumCadenceHz ||
    jitterRatio > thresholds.maximumJitterRatio ||
    droppedFrameRatio > thresholds.maximumDroppedFrameRatio
  )
    reasons.push("irregular_cadence");
  if (estimatorDifferenceBpm > thresholds.maximumEstimatorDifferenceBpm)
    reasons.push("estimator_disagreement");
  const estimatedBpm = (spectralBpm + autocorrelationBpm) / 2;
  const estimatorsPlausible =
    spectralBpm >= thresholds.minimumBpm &&
    spectralBpm <= thresholds.maximumBpm &&
    autocorrelationBpm >= thresholds.minimumBpm &&
    autocorrelationBpm <= thresholds.maximumBpm;
  if (
    !estimatorsPlausible ||
    estimatedBpm < thresholds.minimumBpm ||
    estimatedBpm > thresholds.maximumBpm ||
    !Number.isFinite(estimatedBpm)
  ) {
    reasons.push("provider_quality_failed");
  }

  const uniqueReasons = [...new Set(reasons)];
  const hardFailure = uniqueReasons.includes("provider_quality_failed");
  const status: CaptureQuality["status"] =
    uniqueReasons.length === 0 ? "pass" : hardFailure ? "fail" : "retry";
  const quality: CaptureQuality = {
    status,
    score: status === "pass" ? qualityScore(metrics) : Math.min(0.49, qualityScore(metrics)),
    reasons: uniqueReasons,
    metrics
  };
  return {
    bpm: status === "pass" ? estimatedBpm : null,
    durationMs: Math.round(durationMs),
    quality
  };
}
