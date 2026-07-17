import type { CapturedPcm } from "./types";

export interface SyntheticVoiceSignalOptions {
  readonly sampleRateHz?: number;
  readonly durationMs?: number;
  readonly fundamentalFrequencyHz?: number;
  readonly amplitude?: number;
  readonly noiseAmplitude?: number;
  readonly amplitudeModulationDepth?: number;
  readonly amplitudeModulationHz?: number;
  readonly frequencyModulationSemitones?: number;
  readonly frequencyModulationHz?: number;
  readonly clip?: boolean;
  readonly seed?: number;
}

function deterministicNoise(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return (state / 0xffff_ffff) * 2 - 1;
  };
}

/**
 * Deterministic engineering fixture only. It contains no recording or patient data and cannot
 * establish physiological, clinical, microphone, language, or device accuracy.
 */
export function syntheticSustainedVowel(options: SyntheticVoiceSignalOptions = {}): CapturedPcm {
  const sampleRateHz = options.sampleRateHz ?? 8_000;
  const durationMs = options.durationMs ?? 7_000;
  const baseFrequencyHz = options.fundamentalFrequencyHz ?? 180;
  const amplitude = options.amplitude ?? 0.28;
  const noiseAmplitude = options.noiseAmplitude ?? 0.001;
  const sampleCount = Math.round((sampleRateHz * durationMs) / 1000);
  const samples = new Float32Array(sampleCount);
  const noise = deterministicNoise(options.seed ?? 0x48_52_56_31);
  let phase = 0;

  for (let index = 0; index < sampleCount; index += 1) {
    const timeSeconds = index / sampleRateHz;
    const frequencyOffset =
      (options.frequencyModulationSemitones ?? 0) *
      Math.sin(2 * Math.PI * (options.frequencyModulationHz ?? 1.1) * timeSeconds);
    const instantaneousFrequencyHz = baseFrequencyHz * 2 ** (frequencyOffset / 12);
    phase += (2 * Math.PI * instantaneousFrequencyHz) / sampleRateHz;
    const envelope =
      amplitude *
      (1 +
        (options.amplitudeModulationDepth ?? 0) *
          Math.sin(2 * Math.PI * (options.amplitudeModulationHz ?? 1.7) * timeSeconds));
    const vowel =
      envelope * (Math.sin(phase) + 0.3 * Math.sin(2 * phase) + 0.12 * Math.sin(3 * phase));
    const value = vowel + noiseAmplitude * noise();
    samples[index] = options.clip === true ? Math.max(-1, Math.min(1, value)) : value;
  }
  return { sampleRateHz, samples };
}

export type ReferenceVoiceSignal =
  "clean_stable" | "short" | "noisy" | "clipped" | "unstable" | "unvoiced";

export function referenceVoiceSignal(name: ReferenceVoiceSignal): CapturedPcm {
  switch (name) {
    case "clean_stable":
      return syntheticSustainedVowel();
    case "short":
      return syntheticSustainedVowel({ durationMs: 2_500 });
    case "noisy":
      return syntheticSustainedVowel({ amplitude: 0.2, noiseAmplitude: 0.22, seed: 0x4e_4f_49_53 });
    case "clipped":
      return syntheticSustainedVowel({ amplitude: 1.35, noiseAmplitude: 0, clip: true });
    case "unstable":
      return syntheticSustainedVowel({
        frequencyModulationSemitones: 4,
        frequencyModulationHz: 1.25,
        noiseAmplitude: 0.001
      });
    case "unvoiced":
      return syntheticSustainedVowel({ amplitude: 0, noiseAmplitude: 0.16, seed: 0x55_4e_56_44 });
  }
}
