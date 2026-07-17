import {
  VoiceBiomarkerFeaturesSchema,
  VoiceBiomarkerQualitySchema,
  type VoiceBiomarkerFeatures,
  type VoiceBiomarkerQuality
} from "@homerounds/contracts";
import { z } from "zod";

import { CapturedPcmSchema, type CapturedPcm } from "./types";

export const VOICE_BIOMARKER_ALGORITHM_VERSION = "local_sustained_vowel_features_v1";

export const VoiceSignalQualityThresholdsSchema = z
  .object({
    minimumDurationMs: z.number().int().positive(),
    maximumClippingFraction: z.number().positive().max(1),
    minimumEstimatedSnrDb: z.number().finite(),
    minimumVoicedFraction: z.number().positive().max(1),
    maximumPitchVariabilitySemitones: z.number().positive().finite(),
    minimumFundamentalFrequencyHz: z.number().positive().finite(),
    maximumFundamentalFrequencyHz: z.number().positive().finite(),
    minimumFrameRms: z.number().positive().max(1),
    minimumPeriodicity: z.number().positive().max(1),
    analysisSampleRateHz: z.number().int().min(8_000).max(16_000),
    frameDurationMs: z.number().int().min(20).max(80),
    frameHopMs: z.number().int().min(5).max(40)
  })
  .strict()
  .superRefine((thresholds, context) => {
    if (thresholds.minimumFundamentalFrequencyHz >= thresholds.maximumFundamentalFrequencyHz) {
      context.addIssue({
        code: "custom",
        path: ["minimumFundamentalFrequencyHz"],
        message: "Minimum fundamental frequency must be below the maximum"
      });
    }
    if (thresholds.frameHopMs > thresholds.frameDurationMs) {
      context.addIssue({
        code: "custom",
        path: ["frameHopMs"],
        message: "Frame hop must not exceed frame duration"
      });
    }
  });

export type VoiceSignalQualityThresholds = z.infer<typeof VoiceSignalQualityThresholdsSchema>;

export const DEFAULT_VOICE_SIGNAL_THRESHOLDS: VoiceSignalQualityThresholds = {
  minimumDurationMs: 5_500,
  maximumClippingFraction: 0.005,
  minimumEstimatedSnrDb: 14,
  minimumVoicedFraction: 0.72,
  maximumPitchVariabilitySemitones: 0.8,
  minimumFundamentalFrequencyHz: 70,
  maximumFundamentalFrequencyHz: 500,
  minimumFrameRms: 0.008,
  minimumPeriodicity: 0.68,
  analysisSampleRateHz: 8_000,
  frameDurationMs: 40,
  frameHopMs: 10
};

export interface VoiceSignalAnalysis {
  readonly features: VoiceBiomarkerFeatures | null;
  readonly quality: VoiceBiomarkerQuality;
}

const VoiceSignalAnalysisSchema = z
  .object({
    features: VoiceBiomarkerFeaturesSchema.nullable(),
    quality: VoiceBiomarkerQualitySchema
  })
  .strict()
  .superRefine((analysis, context) => {
    if (analysis.quality.status === "pass" && analysis.features === null) {
      context.addIssue({
        code: "custom",
        path: ["features"],
        message: "Passing voice quality requires derived features"
      });
    }
    if (analysis.quality.status !== "pass" && analysis.features !== null) {
      context.addIssue({
        code: "custom",
        path: ["features"],
        message: "Non-passing voice quality cannot expose derived features"
      });
    }
  });

interface FrameAnalysis {
  readonly voiced: boolean;
  readonly fundamentalFrequencyHz: number | null;
  readonly rms: number;
  readonly harmonicToNoiseRatioDb: number | null;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
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
  if (values.length === 0) return 0;
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}

function downsample(
  samples: Float32Array,
  sampleRateHz: number,
  targetSampleRateHz: number
): { samples: Float64Array; sampleRateHz: number } {
  const factor = Math.max(1, Math.floor(sampleRateHz / targetSampleRateHz));
  const outputLength = Math.floor(samples.length / factor);
  const output = new Float64Array(outputLength);
  for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
    const inputStart = outputIndex * factor;
    let sum = 0;
    for (let offset = 0; offset < factor; offset += 1) {
      sum += samples[inputStart + offset] ?? 0;
    }
    output[outputIndex] = sum / factor;
  }
  return { samples: output, sampleRateHz: sampleRateHz / factor };
}

function frameRms(
  samples: Float64Array,
  start: number,
  length: number
): {
  mean: number;
  rms: number;
} {
  let average = 0;
  for (let index = start; index < start + length; index += 1) {
    average += samples[index] ?? 0;
  }
  average /= length;
  let energy = 0;
  for (let index = start; index < start + length; index += 1) {
    const centered = (samples[index] ?? 0) - average;
    energy += centered * centered;
  }
  return { mean: average, rms: Math.sqrt(energy / length) };
}

function normalizedCorrelation(
  samples: Float64Array,
  start: number,
  length: number,
  lag: number,
  average: number
): number {
  let numerator = 0;
  let leftEnergy = 0;
  let rightEnergy = 0;
  const comparedLength = length - lag;
  for (let offset = 0; offset < comparedLength; offset += 1) {
    const left = (samples[start + offset] ?? 0) - average;
    const right = (samples[start + offset + lag] ?? 0) - average;
    numerator += left * right;
    leftEnergy += left * left;
    rightEnergy += right * right;
  }
  return numerator / Math.sqrt(Math.max(leftEnergy * rightEnergy, Number.EPSILON));
}

function analyzeFrame(
  samples: Float64Array,
  start: number,
  frameLength: number,
  sampleRateHz: number,
  thresholds: VoiceSignalQualityThresholds
): FrameAnalysis {
  const amplitude = frameRms(samples, start, frameLength);
  if (amplitude.rms < thresholds.minimumFrameRms) {
    return {
      voiced: false,
      fundamentalFrequencyHz: null,
      rms: amplitude.rms,
      harmonicToNoiseRatioDb: null
    };
  }

  const minimumLag = Math.max(
    2,
    Math.floor(sampleRateHz / thresholds.maximumFundamentalFrequencyHz)
  );
  const maximumLag = Math.min(
    frameLength - 2,
    Math.ceil(sampleRateHz / thresholds.minimumFundamentalFrequencyHz)
  );
  const correlations = new Float64Array(maximumLag + 2);
  let globalBestLag = minimumLag;
  let globalBestCorrelation = Number.NEGATIVE_INFINITY;
  for (let lag = minimumLag; lag <= maximumLag; lag += 1) {
    const correlation = normalizedCorrelation(samples, start, frameLength, lag, amplitude.mean);
    correlations[lag] = correlation;
    if (correlation > globalBestCorrelation) {
      globalBestCorrelation = correlation;
      globalBestLag = lag;
    }
  }

  const acceptablePeak = Math.max(thresholds.minimumPeriodicity, globalBestCorrelation * 0.9);
  let selectedLag = globalBestLag;
  for (let lag = minimumLag + 1; lag < maximumLag; lag += 1) {
    const current = correlations[lag] ?? Number.NEGATIVE_INFINITY;
    if (
      current >= acceptablePeak &&
      current >= (correlations[lag - 1] ?? Number.NEGATIVE_INFINITY) &&
      current >= (correlations[lag + 1] ?? Number.NEGATIVE_INFINITY)
    ) {
      selectedLag = lag;
      break;
    }
  }

  const selectedCorrelation = correlations[selectedLag] ?? globalBestCorrelation;
  if (selectedCorrelation < thresholds.minimumPeriodicity) {
    return {
      voiced: false,
      fundamentalFrequencyHz: null,
      rms: amplitude.rms,
      harmonicToNoiseRatioDb: null
    };
  }

  const left = correlations[selectedLag - 1] ?? selectedCorrelation;
  const right = correlations[selectedLag + 1] ?? selectedCorrelation;
  const denominator = left - 2 * selectedCorrelation + right;
  const interpolation =
    Math.abs(denominator) < Number.EPSILON
      ? 0
      : clamp((0.5 * (left - right)) / denominator, -0.5, 0.5);
  const refinedLag = selectedLag + interpolation;
  const fundamentalFrequencyHz = sampleRateHz / refinedLag;
  const boundedCorrelation = clamp(selectedCorrelation, 0.000_001, 0.999_999);
  const harmonicToNoiseRatioDb = 10 * Math.log10(boundedCorrelation / (1 - boundedCorrelation));

  if (
    fundamentalFrequencyHz < thresholds.minimumFundamentalFrequencyHz ||
    fundamentalFrequencyHz > thresholds.maximumFundamentalFrequencyHz
  ) {
    return {
      voiced: false,
      fundamentalFrequencyHz: null,
      rms: amplitude.rms,
      harmonicToNoiseRatioDb: null
    };
  }
  return {
    voiced: true,
    fundamentalFrequencyHz,
    rms: amplitude.rms,
    harmonicToNoiseRatioDb
  };
}

function consecutiveDifferencePercent(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const differences = values
    .slice(1)
    .map((value, index) => Math.abs(value - (values[index] ?? value)));
  return (mean(differences) / Math.max(mean(values), Number.EPSILON)) * 100;
}

function phonationDurationMs(
  frames: readonly FrameAnalysis[],
  frameLength: number,
  hopLength: number,
  sampleRateHz: number,
  maximumSamples: number
): number {
  let voicedSamples = 0;
  let previousVoiced = false;
  for (const frame of frames) {
    if (frame.voiced) {
      voicedSamples += previousVoiced ? hopLength : frameLength;
    }
    previousVoiced = frame.voiced;
  }
  return Math.round((Math.min(voicedSamples, maximumSamples) * 1000) / sampleRateHz);
}

function qualityScore(input: {
  readonly durationMs: number;
  readonly clippingFraction: number;
  readonly estimatedSnrDb: number | null;
  readonly voicedFraction: number;
  readonly pitchVariabilitySemitones: number | null;
  readonly thresholds: VoiceSignalQualityThresholds;
}): number {
  const duration = clamp(input.durationMs / input.thresholds.minimumDurationMs, 0, 1);
  const clipping = clamp(
    1 - input.clippingFraction / input.thresholds.maximumClippingFraction,
    0,
    1
  );
  const noise =
    input.estimatedSnrDb === null
      ? 0
      : clamp(input.estimatedSnrDb / (input.thresholds.minimumEstimatedSnrDb * 1.5), 0, 1);
  const voiced = clamp(input.voicedFraction / input.thresholds.minimumVoicedFraction, 0, 1);
  const stability =
    input.pitchVariabilitySemitones === null
      ? 0
      : clamp(
          1 - input.pitchVariabilitySemitones / input.thresholds.maximumPitchVariabilitySemitones,
          0,
          1
        );
  return mean([duration, clipping, noise, voiced, stability]);
}

export function analyzeVoicePcm(
  input: CapturedPcm,
  thresholds: VoiceSignalQualityThresholds = DEFAULT_VOICE_SIGNAL_THRESHOLDS
): VoiceSignalAnalysis {
  const capture = CapturedPcmSchema.parse(input);
  const validatedThresholds = VoiceSignalQualityThresholdsSchema.parse(thresholds);
  const durationMs = Math.round((capture.samples.length * 1000) / capture.sampleRateHz);
  let clippingCount = 0;
  for (let index = 0; index < capture.samples.length; index += 1) {
    if (Math.abs(capture.samples[index] ?? 0) >= 0.995) clippingCount += 1;
  }
  const clippingFraction = clippingCount / capture.samples.length;
  const reduced = downsample(
    capture.samples,
    capture.sampleRateHz,
    validatedThresholds.analysisSampleRateHz
  );

  try {
    const frameLength = Math.max(
      2,
      Math.round((reduced.sampleRateHz * validatedThresholds.frameDurationMs) / 1000)
    );
    const hopLength = Math.max(
      1,
      Math.round((reduced.sampleRateHz * validatedThresholds.frameHopMs) / 1000)
    );
    const frames: FrameAnalysis[] = [];
    for (let start = 0; start + frameLength <= reduced.samples.length; start += hopLength) {
      frames.push(
        analyzeFrame(reduced.samples, start, frameLength, reduced.sampleRateHz, validatedThresholds)
      );
    }

    const voicedFrames = frames.filter(
      (
        frame
      ): frame is FrameAnalysis & {
        fundamentalFrequencyHz: number;
        harmonicToNoiseRatioDb: number;
      } =>
        frame.voiced &&
        frame.fundamentalFrequencyHz !== null &&
        frame.harmonicToNoiseRatioDb !== null
    );
    const voicedFraction = voicedFrames.length / Math.max(frames.length, 1);
    const frequencies = voicedFrames.map((frame) => frame.fundamentalFrequencyHz);
    const medianFundamentalFrequencyHz = frequencies.length > 0 ? median(frequencies) : null;
    const pitchOffsets =
      medianFundamentalFrequencyHz === null
        ? []
        : frequencies.map((frequency) => 12 * Math.log2(frequency / medianFundamentalFrequencyHz));
    const pitchVariabilitySemitones =
      pitchOffsets.length > 0 ? standardDeviation(pitchOffsets) : null;
    const hnrValues = voicedFrames.map((frame) => frame.harmonicToNoiseRatioDb);
    const estimatedSnrDb = hnrValues.length > 0 ? median(hnrValues) : null;

    const reasons: VoiceBiomarkerQuality["reasons"] = [];
    if (durationMs < validatedThresholds.minimumDurationMs) {
      reasons.push("insufficient_duration");
    }
    if (clippingFraction > validatedThresholds.maximumClippingFraction) {
      reasons.push("clipping");
    }
    if (estimatedSnrDb === null || estimatedSnrDb < validatedThresholds.minimumEstimatedSnrDb) {
      reasons.push("excessive_noise");
    }
    if (voicedFraction < validatedThresholds.minimumVoicedFraction) {
      reasons.push("insufficient_voiced_audio");
    }
    if (
      pitchVariabilitySemitones !== null &&
      pitchVariabilitySemitones > validatedThresholds.maximumPitchVariabilitySemitones
    ) {
      reasons.push("unstable_pitch");
    }

    const score = qualityScore({
      durationMs,
      clippingFraction,
      estimatedSnrDb,
      voicedFraction,
      pitchVariabilitySemitones,
      thresholds: validatedThresholds
    });
    const quality = VoiceBiomarkerQualitySchema.parse({
      status: reasons.length === 0 ? "pass" : "retry",
      score: reasons.length === 0 ? Math.max(0.5, score) : Math.min(0.49, score),
      reasons,
      metrics: {
        sampleRateHz: capture.sampleRateHz,
        durationMs,
        clippingFraction,
        voicedFraction,
        estimatedSnrDb
      }
    });

    if (quality.status !== "pass" || medianFundamentalFrequencyHz === null) {
      return VoiceSignalAnalysisSchema.parse({ features: null, quality });
    }

    const periodsMs = frequencies.map((frequency) => 1000 / frequency);
    const amplitudes = voicedFrames.map((frame) => frame.rms);
    const features = VoiceBiomarkerFeaturesSchema.parse({
      medianFundamentalFrequencyHz,
      pitchVariabilitySemitones,
      jitterPercent: consecutiveDifferencePercent(periodsMs),
      shimmerPercent: consecutiveDifferencePercent(amplitudes),
      harmonicToNoiseRatioDb: estimatedSnrDb,
      phonationDurationMs: phonationDurationMs(
        frames,
        frameLength,
        hopLength,
        reduced.sampleRateHz,
        reduced.samples.length
      )
    });
    return VoiceSignalAnalysisSchema.parse({ features, quality });
  } finally {
    reduced.samples.fill(0);
  }
}
