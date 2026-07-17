import { z } from "zod";

export const VoiceBiomarkerProviderKindSchema = z.literal("local_voice_features");
export type VoiceBiomarkerProviderKind = z.infer<typeof VoiceBiomarkerProviderKindSchema>;

export const VoiceBiomarkerUnavailableReasonSchema = z.enum([
  "unsupported_device",
  "permission_denied",
  "microphone_unavailable"
]);
export type VoiceBiomarkerUnavailableReason = z.infer<typeof VoiceBiomarkerUnavailableReasonSchema>;

export const VoiceBiomarkerQualityReasonSchema = z.enum([
  "insufficient_duration",
  "excessive_noise",
  "clipping",
  "insufficient_voiced_audio",
  "unstable_pitch",
  "cancelled"
]);

export const VoiceBiomarkerQualitySchema = z
  .object({
    status: z.enum(["pass", "retry", "fail"]),
    score: z.number().min(0).max(1),
    reasons: z.array(VoiceBiomarkerQualityReasonSchema).max(6),
    metrics: z
      .object({
        sampleRateHz: z.number().positive().finite(),
        durationMs: z.number().int().nonnegative(),
        clippingFraction: z.number().min(0).max(1),
        voicedFraction: z.number().min(0).max(1),
        estimatedSnrDb: z.number().finite().nullable()
      })
      .strict()
  })
  .strict();
export type VoiceBiomarkerQuality = z.infer<typeof VoiceBiomarkerQualitySchema>;

export const VoiceBiomarkerFeaturesSchema = z
  .object({
    medianFundamentalFrequencyHz: z.number().positive().finite().nullable(),
    pitchVariabilitySemitones: z.number().nonnegative().finite().nullable(),
    jitterPercent: z.number().nonnegative().finite().nullable(),
    shimmerPercent: z.number().nonnegative().finite().nullable(),
    harmonicToNoiseRatioDb: z.number().finite().nullable(),
    phonationDurationMs: z.number().int().positive()
  })
  .strict();
export type VoiceBiomarkerFeatures = z.infer<typeof VoiceBiomarkerFeaturesSchema>;

export const VoiceBiomarkerFactSchema = z
  .object({
    factId: z.uuid(),
    roundId: z.uuid(),
    assessmentSessionId: z.uuid(),
    provider: VoiceBiomarkerProviderKindSchema,
    observedAt: z.iso.datetime(),
    durationMs: z.number().int().positive(),
    algorithmVersion: z.string().trim().min(1).max(80),
    features: VoiceBiomarkerFeaturesSchema,
    quality: VoiceBiomarkerQualitySchema.extend({ status: z.literal("pass") }),
    researchOnly: z.literal(true),
    rawMediaRef: z.null()
  })
  .strict();
export type VoiceBiomarkerFact = z.infer<typeof VoiceBiomarkerFactSchema>;

export const VoiceBiomarkerAssessmentResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("completed"),
      fact: VoiceBiomarkerFactSchema
    })
    .strict(),
  z
    .object({
      status: z.literal("retry"),
      quality: VoiceBiomarkerQualitySchema.extend({ status: z.literal("retry") })
    })
    .strict(),
  z
    .object({
      status: z.literal("failed"),
      quality: VoiceBiomarkerQualitySchema.extend({ status: z.literal("fail") })
    })
    .strict(),
  z
    .object({
      status: z.literal("unavailable"),
      provider: VoiceBiomarkerProviderKindSchema,
      reason: VoiceBiomarkerUnavailableReasonSchema
    })
    .strict()
]);
export type VoiceBiomarkerAssessmentResult = z.infer<typeof VoiceBiomarkerAssessmentResultSchema>;

export type VoiceBiomarkerProvider = Readonly<{
  kind: VoiceBiomarkerProviderKind;
  checkAvailability(
    signal?: AbortSignal
  ): Promise<
    | { available: true; capabilities: Readonly<Record<string, boolean>> }
    | { available: false; reason: VoiceBiomarkerUnavailableReason }
  >;
  capture(input: {
    roundId: string;
    assessmentSessionId: string;
    signal: AbortSignal;
  }): Promise<VoiceBiomarkerAssessmentResult>;
  dispose(): Promise<void>;
}>;
