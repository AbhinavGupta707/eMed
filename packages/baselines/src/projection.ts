import { z } from "zod";

import {
  BaselineNonComparableReasonSchema,
  BaselineProjectionSchema,
  DerivedBaselineSampleSchema,
  PersonalChangePolicySchema,
  canonicalBaselineContextKey,
  isBaselineContextKnown,
  type BaselineNonComparableReason,
  type BaselineProjection,
  type DerivedBaselineSample,
  type PersonalChangePolicy
} from "./schemas";

const ProjectionInputSchema = z
  .object({
    patientId: z.string().trim().min(1).max(120),
    currentSample: DerivedBaselineSampleSchema.nullable(),
    history: z.array(DerivedBaselineSampleSchema).max(365),
    policy: PersonalChangePolicySchema,
    generatedAt: z.iso.datetime()
  })
  .strict();

const AUTHORITY = {
  basis: "structured_derived_personal_history_only",
  clinicalInterpretation: "none",
  workflowAuthority: false
} as const;

function versionKey(version: DerivedBaselineSample["context"]["algorithmVersion"]): string {
  return version.status === "known" ? `known:${version.value}` : version.status;
}

function mismatchReasons(
  current: DerivedBaselineSample,
  prior: DerivedBaselineSample
): BaselineNonComparableReason[] {
  const reasons: BaselineNonComparableReason[] = [];
  if (!isBaselineContextKnown(prior.context)) reasons.push("unknown_context");
  if (current.signal.kind !== prior.signal.kind) reasons.push("signal_mismatch");
  if (current.signal.unit !== prior.signal.unit) reasons.push("unit_mismatch");
  if (current.context.provider !== prior.context.provider) reasons.push("provider_mismatch");
  if (versionKey(current.context.providerVersion) !== versionKey(prior.context.providerVersion)) {
    reasons.push("provider_version_mismatch");
  }
  if (versionKey(current.context.algorithmVersion) !== versionKey(prior.context.algorithmVersion)) {
    reasons.push("algorithm_version_mismatch");
  }
  if (current.context.device.deviceClass !== prior.context.device.deviceClass) {
    reasons.push("device_class_mismatch");
  }
  if (current.context.device.platform !== prior.context.device.platform) {
    reasons.push("platform_mismatch");
  }
  if (current.context.device.captureSurface !== prior.context.device.captureSurface) {
    reasons.push("capture_surface_mismatch");
  }
  return reasons;
}

function rounded(value: number): number {
  return Number(value.toFixed(8));
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const right = sorted[middle];
  if (right === undefined) throw new Error("Cannot calculate a baseline median without values.");
  if (sorted.length % 2 === 1) return right;
  const left = sorted[middle - 1];
  if (left === undefined) throw new Error("Cannot calculate a baseline median without values.");
  return (left + right) / 2;
}

export function projectPersonalBaseline(inputValue: {
  patientId: string;
  currentSample: DerivedBaselineSample | null;
  history: readonly DerivedBaselineSample[];
  policy: PersonalChangePolicy;
  generatedAt: string;
}): BaselineProjection {
  const input = ProjectionInputSchema.parse(inputValue);
  const common = {
    schemaVersion: "baseline-projection.v1" as const,
    generatedAt: input.generatedAt,
    patientId: input.patientId,
    policyVersion: input.policy.policyVersion,
    authority: AUTHORITY
  };
  if (!input.currentSample) {
    return BaselineProjectionSchema.parse({
      ...common,
      status: "unknown",
      currentSampleId: null,
      signal: null,
      reason: "current_sample_unavailable"
    });
  }
  const current = input.currentSample;
  const knownCurrent = {
    ...common,
    currentSampleId: current.sampleId,
    signal: current.signal
  };
  if (current.patientId !== input.patientId) {
    return BaselineProjectionSchema.parse({
      ...knownCurrent,
      status: "unknown",
      reason: "history_patient_mismatch"
    });
  }
  if (!isBaselineContextKnown(current.context)) {
    return BaselineProjectionSchema.parse({
      ...knownCurrent,
      status: "unknown",
      reason: "current_context_unknown"
    });
  }
  if (
    current.signal.kind !== input.policy.signal.kind ||
    current.signal.unit !== input.policy.signal.unit
  ) {
    throw new z.ZodError([
      {
        code: "custom",
        path: ["policy", "signal"],
        message: "comparison policy must match the current signal",
        input: input.policy.signal
      }
    ]);
  }
  if (input.history.some((sample) => sample.patientId !== input.patientId)) {
    return BaselineProjectionSchema.parse({
      ...knownCurrent,
      status: "unknown",
      reason: "history_patient_mismatch"
    });
  }
  if (
    input.history.some(
      (sample) =>
        sample.sampleId === current.sampleId ||
        Date.parse(sample.observedAt) >= Date.parse(current.observedAt)
    )
  ) {
    return BaselineProjectionSchema.parse({
      ...knownCurrent,
      status: "unknown",
      reason: "history_time_invalid"
    });
  }
  if (input.history.length === 0) {
    return BaselineProjectionSchema.parse({
      ...knownCurrent,
      status: "first_sample",
      priorSampleCount: 0,
      comparableSampleCount: 0
    });
  }

  const currentContextKey = canonicalBaselineContextKey(current.signal, current.context);
  const comparable = input.history.filter(
    (sample) => canonicalBaselineContextKey(sample.signal, sample.context) === currentContextKey
  );
  if (comparable.length === 0) {
    const reasons = [
      ...new Set(input.history.flatMap((sample) => mismatchReasons(current, sample)))
    ];
    return BaselineProjectionSchema.parse({
      ...knownCurrent,
      status: "non_comparable",
      priorSampleCount: input.history.length,
      comparableSampleCount: 0,
      reasons:
        reasons.length > 0
          ? z.array(BaselineNonComparableReasonSchema).parse(reasons)
          : (["unknown_context"] as const)
    });
  }
  if (comparable.length < input.policy.minimumComparableSamples) {
    return BaselineProjectionSchema.parse({
      ...knownCurrent,
      status: "insufficient_history",
      priorSampleCount: input.history.length,
      comparableSampleCount: comparable.length,
      requiredComparableSamples: input.policy.minimumComparableSamples
    });
  }

  const baselineMedian = rounded(median(comparable.map((sample) => sample.value)));
  const absoluteDelta = rounded(Math.abs(current.value - baselineMedian));
  const relativeDelta =
    baselineMedian === 0 ? null : rounded(absoluteDelta / Math.abs(baselineMedian));
  const changed =
    absoluteDelta >= input.policy.absoluteDeltaThreshold ||
    (relativeDelta !== null && relativeDelta >= input.policy.relativeDeltaThreshold);
  const comparison = {
    comparableSampleCount: comparable.length,
    baselineMedian,
    currentValue: current.value,
    absoluteDelta,
    relativeDelta,
    absoluteDeltaThreshold: input.policy.absoluteDeltaThreshold,
    relativeDeltaThreshold: input.policy.relativeDeltaThreshold,
    windowStartedAt: comparable[0]?.observedAt,
    windowEndedAt: comparable.at(-1)?.observedAt
  };
  return BaselineProjectionSchema.parse({
    ...knownCurrent,
    status: changed ? "comparable_changed" : "comparable_unchanged",
    comparison
  });
}
