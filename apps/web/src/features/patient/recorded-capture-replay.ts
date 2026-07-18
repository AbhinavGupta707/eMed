import { CaptureQualitySchema } from "@homerounds/contracts";
import { z } from "zod";

export const RecordedCaptureReplaySchema = z
  .object({
    schemaVersion: z.literal(1),
    fixtureType: z.literal("recorded_valid_capture_replay"),
    dataClassification: z.literal("synthetic_demo"),
    label: z.string().min(1).max(160),
    notClinicallyValidated: z.literal(true),
    containsRawMedia: z.literal(false),
    containsPatientData: z.literal(false),
    automaticFallbackAllowed: z.literal(false),
    usePolicy: z
      .object({
        requiresDemoMode: z.literal(true),
        requiresLiveCaptureFailure: z.literal(true),
        requiresExplicitUserSelection: z.literal(true),
        mustRemainVisiblyLabelled: z.literal(true),
        mustNeverReplaceOrModifyLiveMeasurement: z.literal(true)
      })
      .strict(),
    measurementPrototype: z
      .object({
        provider: z.literal("finger_ppg"),
        value: z.number().finite().positive(),
        unit: z.literal("bpm"),
        durationMs: z.number().int().positive(),
        algorithmVersion: z.string().min(1),
        providerModelVersion: z.string().min(1).nullable(),
        quality: CaptureQualitySchema.strict().refine(({ status }) => status === "pass", {
          message: "recorded recovery measurement must pass its declared quality gate"
        }),
        rawMediaRef: z.null()
      })
      .strict(),
    provenance: z
      .object({
        source: z.literal("deterministic_synthetic_engineering_fixture"),
        recordedAt: z.iso.datetime(),
        physicalDeviceEvidence: z.literal(false),
        medicalDeviceValidation: z.literal(false)
      })
      .strict()
  })
  .strict();

export type RecordedCaptureReplay = z.infer<typeof RecordedCaptureReplaySchema>;
export type RecordedCaptureReplayLoader = () => Promise<RecordedCaptureReplay>;

export function createRecordedCaptureReplayLoader(
  fetcher: typeof fetch = fetch
): RecordedCaptureReplayLoader {
  return async () => {
    const response = await fetcher("/demo/recorded-valid-capture.v1.json", {
      cache: "no-store",
      credentials: "same-origin"
    });
    if (!response.ok) throw new Error("The labelled sample reading could not be loaded.");
    return RecordedCaptureReplaySchema.parse(await response.json());
  };
}
