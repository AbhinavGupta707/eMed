import type { DerivedOpticalSample } from "./types";

export interface SyntheticSignalOptions {
  readonly bpm?: number;
  readonly durationMs?: number;
  readonly cadenceHz?: number;
  readonly amplitude?: number;
  readonly saturation?: number;
  readonly coverage?: number;
  readonly motion?: number;
  readonly timestampTransform?: (timestampMs: number, index: number) => number;
}

/**
 * Deterministic engineering fixture only. It is not patient data and cannot establish
 * physiological or medical accuracy; physical iPhone comparison remains a later human gate.
 */
export function syntheticDerivedSignal(
  options: SyntheticSignalOptions = {}
): DerivedOpticalSample[] {
  const bpm = options.bpm ?? 72;
  const durationMs = options.durationMs ?? 20_000;
  const cadenceHz = options.cadenceHz ?? 30;
  const amplitude = options.amplitude ?? 4;
  const intervalMs = 1000 / cadenceHz;
  const samples: DerivedOpticalSample[] = [];
  for (let index = 0; index <= Math.floor(durationMs / intervalMs); index += 1) {
    const originalTimestamp = index * intervalMs;
    const timestampMs = options.timestampTransform?.(originalTimestamp, index) ?? originalTimestamp;
    const phase = (2 * Math.PI * bpm * originalTimestamp) / 60_000;
    const pulse = amplitude * Math.sin(phase) + amplitude * 0.08 * Math.sin(phase * 2);
    const meanGreen = 105 + pulse;
    const meanRed = 180 + pulse * 0.35;
    const meanBlue = 70 + pulse * 0.1;
    samples.push({
      timestampMs,
      meanRed,
      meanGreen,
      meanBlue,
      meanIntensity: (meanRed + meanGreen + meanBlue) / 3,
      saturation: options.saturation ?? 0.01,
      coverage: options.coverage ?? 0.96,
      motion: options.motion ?? 0.015
    });
  }
  return samples;
}
