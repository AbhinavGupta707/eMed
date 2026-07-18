import { z } from "zod";

const VersionLabelSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z0-9._-]+$/);

export const BaselineProviderSchema = z.enum(["finger_ppg", "vitallens", "local_voice_features"]);
export type BaselineProvider = z.infer<typeof BaselineProviderSchema>;

export const BaselineSignalKindSchema = z.enum([
  "pulse_bpm",
  "voice_median_fundamental_frequency_hz",
  "voice_pitch_variability_semitones",
  "voice_jitter_percent",
  "voice_shimmer_percent",
  "voice_harmonic_to_noise_ratio_db"
]);
export type BaselineSignalKind = z.infer<typeof BaselineSignalKindSchema>;

export const BaselineUnitSchema = z.enum(["bpm", "Hz", "semitones", "percent", "dB"]);
export type BaselineUnit = z.infer<typeof BaselineUnitSchema>;

const expectedUnitBySignal = {
  pulse_bpm: "bpm",
  voice_median_fundamental_frequency_hz: "Hz",
  voice_pitch_variability_semitones: "semitones",
  voice_jitter_percent: "percent",
  voice_shimmer_percent: "percent",
  voice_harmonic_to_noise_ratio_db: "dB"
} as const satisfies Readonly<Record<BaselineSignalKind, BaselineUnit>>;

export const BaselineSignalSchema = z
  .object({
    kind: BaselineSignalKindSchema,
    unit: BaselineUnitSchema
  })
  .strict()
  .superRefine((signal, context) => {
    if (expectedUnitBySignal[signal.kind] !== signal.unit) {
      context.addIssue({
        code: "custom",
        path: ["unit"],
        message: "signal unit does not match the versioned signal definition"
      });
    }
  });
export type BaselineSignal = z.infer<typeof BaselineSignalSchema>;

export const ComponentVersionSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("known"), value: VersionLabelSchema }).strict(),
  z.object({ status: z.literal("not_applicable") }).strict(),
  z.object({ status: z.literal("unknown") }).strict()
]);
export type ComponentVersion = z.infer<typeof ComponentVersionSchema>;

export const DeviceContextSchema = z
  .object({
    schemaVersion: z.literal("device-context.v1"),
    deviceClass: z.enum(["phone", "tablet", "desktop", "unknown"]),
    platform: z.enum(["ios", "android", "macos", "windows", "linux", "other", "unknown"]),
    captureSurface: z.enum(["rear_camera", "front_camera", "microphone", "unknown"])
  })
  .strict();
export type DeviceContext = z.infer<typeof DeviceContextSchema>;

export const BaselineMeasurementContextSchema = z
  .object({
    schemaVersion: z.literal("baseline-measurement-context.v1"),
    provider: BaselineProviderSchema,
    providerVersion: ComponentVersionSchema,
    algorithmVersion: ComponentVersionSchema,
    device: DeviceContextSchema
  })
  .strict()
  .superRefine((measurementContext, context) => {
    if (
      measurementContext.provider === "vitallens" &&
      measurementContext.providerVersion.status === "not_applicable"
    ) {
      context.addIssue({
        code: "custom",
        path: ["providerVersion"],
        message: "VitalLens provider version must be known or explicitly unknown"
      });
    }
  });
export type BaselineMeasurementContext = z.infer<typeof BaselineMeasurementContextSchema>;

function componentVersionKey(version: ComponentVersion): string {
  return version.status === "known" ? `known-${version.value}` : version.status;
}

export function canonicalBaselineContextKey(
  signalInput: BaselineSignal,
  contextInput: BaselineMeasurementContext
): string {
  const signal = BaselineSignalSchema.parse(signalInput);
  const measurementContext = BaselineMeasurementContextSchema.parse(contextInput);
  const device = measurementContext.device;
  return [
    "baseline-context.v1",
    signal.kind,
    signal.unit,
    measurementContext.provider,
    componentVersionKey(measurementContext.providerVersion),
    componentVersionKey(measurementContext.algorithmVersion),
    device.deviceClass,
    device.platform,
    device.captureSurface
  ].join(":");
}

export function isBaselineContextKnown(contextInput: BaselineMeasurementContext): boolean {
  const measurementContext = BaselineMeasurementContextSchema.parse(contextInput);
  return (
    measurementContext.providerVersion.status !== "unknown" &&
    measurementContext.algorithmVersion.status === "known" &&
    measurementContext.device.deviceClass !== "unknown" &&
    measurementContext.device.platform !== "unknown" &&
    measurementContext.device.captureSurface !== "unknown"
  );
}

export const BaselineSampleProvenanceSchema = z
  .object({
    schemaVersion: z.literal("baseline-sample-provenance.v1"),
    sourceKind: z.enum(["optical_measurement", "voice_biomarker_fact", "synthetic_seed"]),
    sourceFactId: z.uuid(),
    roundId: z.uuid(),
    assessmentSessionId: z.uuid(),
    qualityGateVersion: VersionLabelSchema,
    structuredDerivedOnly: z.literal(true),
    rawMediaStored: z.literal(false),
    transcriptStored: z.literal(false)
  })
  .strict();
export type BaselineSampleProvenance = z.infer<typeof BaselineSampleProvenanceSchema>;

export const DerivedBaselineSampleSchema = z
  .object({
    schemaVersion: z.literal("derived-baseline-sample.v1"),
    sampleId: z.uuid(),
    patientId: z.string().trim().min(1).max(120),
    dataClassification: z.literal("synthetic_demo"),
    signal: BaselineSignalSchema,
    value: z.number().finite(),
    observedAt: z.iso.datetime(),
    context: BaselineMeasurementContextSchema,
    quality: z
      .object({
        status: z.literal("pass"),
        score: z.number().min(0).max(1)
      })
      .strict(),
    provenance: BaselineSampleProvenanceSchema
  })
  .strict()
  .superRefine((sample, context) => {
    const opticalProvider = sample.context.provider !== "local_voice_features";
    if ((sample.signal.kind === "pulse_bpm") !== opticalProvider) {
      context.addIssue({
        code: "custom",
        path: ["signal", "kind"],
        message: "optical providers produce pulse only and local voice produces voice features only"
      });
    }
    if (sample.signal.kind === "pulse_bpm" && sample.value <= 0) {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: "pulse values must be positive"
      });
    }
  });
export type DerivedBaselineSample = z.infer<typeof DerivedBaselineSampleSchema>;

export const DerivedBaselineSeriesSchema = z
  .object({
    schemaVersion: z.literal("derived-baseline-series.v1"),
    seriesId: z.uuid(),
    patientId: z.string().trim().min(1).max(120),
    dataClassification: z.literal("synthetic_demo"),
    signal: BaselineSignalSchema,
    context: BaselineMeasurementContextSchema,
    contextKey: z.string().min(1).max(640),
    seriesVersion: z.number().int().positive(),
    samples: z.array(DerivedBaselineSampleSchema).min(1).max(365),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime()
  })
  .strict()
  .superRefine((series, context) => {
    const canonicalKey = canonicalBaselineContextKey(series.signal, series.context);
    if (series.contextKey !== canonicalKey) {
      context.addIssue({
        code: "custom",
        path: ["contextKey"],
        message: "context key must match the versioned comparable context"
      });
    }
    if (series.seriesVersion !== series.samples.length) {
      context.addIssue({
        code: "custom",
        path: ["seriesVersion"],
        message: "append-only series version must equal the number of samples"
      });
    }
    const sampleIds = new Set<string>();
    let previousObservedAt = Number.NEGATIVE_INFINITY;
    for (const [index, sample] of series.samples.entries()) {
      if (sample.patientId !== series.patientId) {
        context.addIssue({
          code: "custom",
          path: ["samples", index, "patientId"],
          message: "sample patient must match its series"
        });
      }
      if (canonicalBaselineContextKey(sample.signal, sample.context) !== canonicalKey) {
        context.addIssue({
          code: "custom",
          path: ["samples", index, "context"],
          message: "sample context must remain comparable with its series"
        });
      }
      if (sampleIds.has(sample.sampleId)) {
        context.addIssue({
          code: "custom",
          path: ["samples", index, "sampleId"],
          message: "sample identifiers must be unique"
        });
      }
      sampleIds.add(sample.sampleId);
      const observedAt = Date.parse(sample.observedAt);
      if (observedAt <= previousObservedAt) {
        context.addIssue({
          code: "custom",
          path: ["samples", index, "observedAt"],
          message: "series samples must be strictly chronological"
        });
      }
      previousObservedAt = observedAt;
    }
  });
export type DerivedBaselineSeries = z.infer<typeof DerivedBaselineSeriesSchema>;

export const PersonalChangePolicySchema = z
  .object({
    schemaVersion: z.literal("personal-change-policy.v1"),
    policyVersion: VersionLabelSchema,
    signal: BaselineSignalSchema,
    comparisonBasis: z.literal("within_person_only"),
    clinicalInterpretation: z.literal("none"),
    minimumComparableSamples: z.number().int().min(2).max(30),
    absoluteDeltaThreshold: z.number().positive().finite(),
    relativeDeltaThreshold: z.number().positive().finite().max(10)
  })
  .strict();
export type PersonalChangePolicy = z.infer<typeof PersonalChangePolicySchema>;

export const BaselineNonComparableReasonSchema = z.enum([
  "signal_mismatch",
  "unit_mismatch",
  "provider_mismatch",
  "provider_version_mismatch",
  "algorithm_version_mismatch",
  "device_class_mismatch",
  "platform_mismatch",
  "capture_surface_mismatch",
  "unknown_context"
]);
export type BaselineNonComparableReason = z.infer<typeof BaselineNonComparableReasonSchema>;

const ProjectionAuthoritySchema = z.object({
  basis: z.literal("structured_derived_personal_history_only"),
  clinicalInterpretation: z.literal("none"),
  workflowAuthority: z.literal(false)
});

const KnownCurrentProjectionBaseSchema = z.object({
  schemaVersion: z.literal("baseline-projection.v1"),
  generatedAt: z.iso.datetime(),
  patientId: z.string().trim().min(1).max(120),
  currentSampleId: z.uuid(),
  signal: BaselineSignalSchema,
  policyVersion: VersionLabelSchema,
  authority: ProjectionAuthoritySchema.strict()
});

const ComparisonSummarySchema = z
  .object({
    comparableSampleCount: z.number().int().positive(),
    baselineMedian: z.number().finite(),
    currentValue: z.number().finite(),
    absoluteDelta: z.number().nonnegative().finite(),
    relativeDelta: z.number().nonnegative().finite().nullable(),
    absoluteDeltaThreshold: z.number().positive().finite(),
    relativeDeltaThreshold: z.number().positive().finite(),
    windowStartedAt: z.iso.datetime(),
    windowEndedAt: z.iso.datetime()
  })
  .strict();

export const BaselineProjectionSchema = z.discriminatedUnion("status", [
  z
    .object({
      schemaVersion: z.literal("baseline-projection.v1"),
      status: z.literal("unknown"),
      generatedAt: z.iso.datetime(),
      patientId: z.string().trim().min(1).max(120),
      currentSampleId: z.uuid().nullable(),
      signal: BaselineSignalSchema.nullable(),
      policyVersion: VersionLabelSchema,
      reason: z.enum([
        "current_sample_unavailable",
        "current_context_unknown",
        "history_time_invalid",
        "history_patient_mismatch"
      ]),
      authority: ProjectionAuthoritySchema.strict()
    })
    .strict(),
  KnownCurrentProjectionBaseSchema.extend({
    status: z.literal("first_sample"),
    priorSampleCount: z.literal(0),
    comparableSampleCount: z.literal(0)
  }).strict(),
  KnownCurrentProjectionBaseSchema.extend({
    status: z.literal("non_comparable"),
    priorSampleCount: z.number().int().positive(),
    comparableSampleCount: z.literal(0),
    reasons: z.array(BaselineNonComparableReasonSchema).min(1).max(9)
  }).strict(),
  KnownCurrentProjectionBaseSchema.extend({
    status: z.literal("insufficient_history"),
    priorSampleCount: z.number().int().positive(),
    comparableSampleCount: z.number().int().positive(),
    requiredComparableSamples: z.number().int().min(2).max(30)
  }).strict(),
  KnownCurrentProjectionBaseSchema.extend({
    status: z.literal("comparable_unchanged"),
    comparison: ComparisonSummarySchema
  }).strict(),
  KnownCurrentProjectionBaseSchema.extend({
    status: z.literal("comparable_changed"),
    comparison: ComparisonSummarySchema
  }).strict()
]);
export type BaselineProjection = z.infer<typeof BaselineProjectionSchema>;
