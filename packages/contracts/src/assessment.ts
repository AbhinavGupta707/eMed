import { z } from "zod";

export const OpticalProviderKindSchema = z.enum(["finger_ppg", "vitallens"]);
export type OpticalProviderKind = z.infer<typeof OpticalProviderKindSchema>;

export const OpticalUnavailableReasonSchema = z.enum([
  "missing_configuration",
  "unsupported_device",
  "permission_denied",
  "network_unavailable",
  "provider_unavailable"
]);

export type OpticalUnavailableReason = z.infer<typeof OpticalUnavailableReasonSchema>;

export const CaptureQualitySchema = z.object({
  status: z.enum(["pass", "retry", "fail"]),
  score: z.number().min(0).max(1),
  reasons: z.array(
    z.enum([
      "insufficient_duration",
      "weak_signal",
      "saturation",
      "motion",
      "irregular_cadence",
      "estimator_disagreement",
      "provider_quality_failed",
      "permission_denied",
      "unsupported_device",
      "provider_unavailable",
      "cancelled"
    ])
  ),
  metrics: z.record(z.string(), z.number().finite())
});

export type CaptureQuality = z.infer<typeof CaptureQualitySchema>;

export const MeasurementFactSchema = z.object({
  factId: z.uuid(),
  assessmentSessionId: z.uuid(),
  provider: OpticalProviderKindSchema,
  value: z.number().positive().finite(),
  unit: z.literal("bpm"),
  observedAt: z.iso.datetime(),
  durationMs: z.number().int().positive(),
  algorithmVersion: z.string().min(1),
  providerModelVersion: z.string().min(1).nullable(),
  quality: CaptureQualitySchema.extend({ status: z.literal("pass") }),
  rawMediaRef: z.null()
});

export type MeasurementFact = z.infer<typeof MeasurementFactSchema>;

export const OpticalAssessmentResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("completed"),
    measurement: MeasurementFactSchema
  }),
  z.object({
    status: z.literal("retry"),
    quality: CaptureQualitySchema.extend({ status: z.literal("retry") })
  }),
  z.object({
    status: z.literal("failed"),
    quality: CaptureQualitySchema.extend({ status: z.literal("fail") })
  }),
  z.object({
    status: z.literal("unavailable"),
    provider: OpticalProviderKindSchema,
    reason: OpticalUnavailableReasonSchema
  })
]);

export type OpticalAssessmentResult = z.infer<typeof OpticalAssessmentResultSchema>;

export type OpticalAssessmentProvider = {
  readonly kind: OpticalProviderKind;
  checkAvailability(
    signal?: AbortSignal
  ): Promise<
    | { available: true; capabilities: Readonly<Record<string, boolean>> }
    | { available: false; reason: OpticalUnavailableReason }
  >;
  capture(input: {
    assessmentSessionId: string;
    signal: AbortSignal;
  }): Promise<OpticalAssessmentResult>;
  dispose(): Promise<void>;
};
