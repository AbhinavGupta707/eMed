import { z } from "zod";

const OpaqueIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9._:-]+$/);

export const PreferenceProvenanceSchema = z
  .object({
    schemaVersion: z.literal("preference-provenance.v1"),
    source: z.literal("patient_confirmation"),
    confirmationId: z.uuid(),
    recordedAt: z.iso.datetime()
  })
  .strict();
export type PreferenceProvenance = z.infer<typeof PreferenceProvenanceSchema>;

export const DefaultDevicePreferenceSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("unknown") }).strict(),
  z
    .object({
      status: z.literal("no_preference"),
      provenance: PreferenceProvenanceSchema
    })
    .strict(),
  z
    .object({
      status: z.literal("set"),
      value: z.enum(["phone", "tablet", "desktop"]),
      provenance: PreferenceProvenanceSchema
    })
    .strict()
]);
export type DefaultDevicePreference = z.infer<typeof DefaultDevicePreferenceSchema>;

export const AccessibilityPreferenceSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("unknown") }).strict(),
  z
    .object({
      status: z.literal("set"),
      modes: z
        .array(
          z.enum([
            "larger_text",
            "high_contrast",
            "reduced_motion",
            "screen_reader_optimised",
            "persistent_captions"
          ])
        )
        .min(1)
        .max(5),
      provenance: PreferenceProvenanceSchema
    })
    .strict()
    .superRefine((preference, context) => {
      if (new Set(preference.modes).size !== preference.modes.length) {
        context.addIssue({
          code: "custom",
          path: ["modes"],
          message: "accessibility modes must be unique"
        });
      }
    })
]);
export type AccessibilityPreference = z.infer<typeof AccessibilityPreferenceSchema>;

export const LanguagePreferenceSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("unknown") }).strict(),
  z
    .object({
      status: z.literal("set"),
      languageTag: z
        .string()
        .trim()
        .min(2)
        .max(35)
        .regex(/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/),
      provenance: PreferenceProvenanceSchema
    })
    .strict()
]);
export type LanguagePreference = z.infer<typeof LanguagePreferenceSchema>;

export const DisplayPreferenceSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("unknown") }).strict(),
  z
    .object({
      status: z.literal("set"),
      choices: z
        .object({
          textSize: z.enum(["standard", "large", "extra_large"]),
          informationDensity: z.enum(["comfortable", "compact"]),
          timeFormat: z.enum(["12_hour", "24_hour"])
        })
        .strict(),
      provenance: PreferenceProvenanceSchema
    })
    .strict()
]);
export type DisplayPreference = z.infer<typeof DisplayPreferenceSchema>;

export const PersonalizationConsentSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("not_requested") }).strict(),
  z
    .object({
      status: z.literal("declined"),
      policyVersion: z.string().trim().min(1).max(80),
      decidedAt: z.iso.datetime()
    })
    .strict(),
  z
    .object({
      status: z.literal("granted"),
      policyVersion: z.string().trim().min(1).max(80),
      decidedAt: z.iso.datetime()
    })
    .strict()
]);
export type PersonalizationConsent = z.infer<typeof PersonalizationConsentSchema>;

export const CompletedTaskHistoryEntrySchema = z
  .object({
    schemaVersion: z.literal("completed-task-history.v1"),
    completionId: z.uuid(),
    taskId: OpaqueIdSchema,
    taskKind: z.enum(["finger_pulse", "face_pulse", "voice_signal", "medication_label"]),
    completedAt: z.iso.datetime(),
    deviceUsed: z.enum(["phone", "tablet", "desktop", "unknown"]),
    outcome: z.enum([
      "derived_fact_recorded",
      "completed_without_measurement",
      "quality_rejected",
      "unavailable",
      "declined"
    ]),
    provenance: z
      .object({
        schemaVersion: z.literal("task-history-provenance.v1"),
        source: z.literal("deterministic_workflow"),
        roundId: z.uuid(),
        rawMediaStored: z.literal(false),
        transcriptStored: z.literal(false)
      })
      .strict()
  })
  .strict();
export type CompletedTaskHistoryEntry = z.infer<typeof CompletedTaskHistoryEntrySchema>;

export const BoundedPersonalizationProfileSchema = z
  .object({
    schemaVersion: z.literal("bounded-personalization-profile.v1"),
    patientId: z.string().trim().min(1).max(120),
    dataClassification: z.literal("synthetic_demo"),
    profileVersion: z.number().int().positive(),
    consent: PersonalizationConsentSchema,
    defaultDevice: DefaultDevicePreferenceSchema,
    accessibility: AccessibilityPreferenceSchema,
    language: LanguagePreferenceSchema,
    display: DisplayPreferenceSchema,
    completedTasks: z.array(CompletedTaskHistoryEntrySchema).max(50),
    updatedAt: z.iso.datetime()
  })
  .strict()
  .superRefine((profile, context) => {
    const hasPersonalization =
      profile.defaultDevice.status !== "unknown" ||
      profile.accessibility.status !== "unknown" ||
      profile.language.status !== "unknown" ||
      profile.display.status !== "unknown" ||
      profile.completedTasks.length > 0;
    if (hasPersonalization && profile.consent.status !== "granted") {
      context.addIssue({
        code: "custom",
        path: ["consent"],
        message: "structured personalisation requires explicit consent"
      });
    }
    const completionIds = new Set<string>();
    let previousCompletedAt = Number.POSITIVE_INFINITY;
    for (const [index, task] of profile.completedTasks.entries()) {
      if (completionIds.has(task.completionId)) {
        context.addIssue({
          code: "custom",
          path: ["completedTasks", index, "completionId"],
          message: "completed task identifiers must be unique"
        });
      }
      completionIds.add(task.completionId);
      const completedAt = Date.parse(task.completedAt);
      if (completedAt > previousCompletedAt) {
        context.addIssue({
          code: "custom",
          path: ["completedTasks", index, "completedAt"],
          message: "completed task history must be newest first"
        });
      }
      previousCompletedAt = completedAt;
    }
  });
export type BoundedPersonalizationProfile = z.infer<typeof BoundedPersonalizationProfileSchema>;

export const PreferenceUpdateSchema = z
  .object({
    expectedProfileVersion: z.number().int().positive(),
    defaultDevice: DefaultDevicePreferenceSchema.optional(),
    accessibility: AccessibilityPreferenceSchema.optional(),
    language: LanguagePreferenceSchema.optional(),
    display: DisplayPreferenceSchema.optional()
  })
  .strict()
  .superRefine((update, context) => {
    if (
      update.defaultDevice === undefined &&
      update.accessibility === undefined &&
      update.language === undefined &&
      update.display === undefined
    ) {
      context.addIssue({ code: "custom", message: "at least one preference must be updated" });
    }
  });
export type PreferenceUpdate = z.infer<typeof PreferenceUpdateSchema>;

export const BoundedPersonalizationProjectionSchema = z
  .object({
    schemaVersion: z.literal("bounded-personalization-projection.v1"),
    patientId: z.string().trim().min(1).max(120),
    profileVersion: z.number().int().positive(),
    generatedAt: z.iso.datetime(),
    consentStatus: z.enum(["not_requested", "declined", "granted"]),
    defaultDevice: DefaultDevicePreferenceSchema,
    accessibility: AccessibilityPreferenceSchema,
    language: LanguagePreferenceSchema,
    display: DisplayPreferenceSchema,
    recentCompletedTasks: z.array(CompletedTaskHistoryEntrySchema).max(12),
    authority: z
      .object({
        scope: z.literal("presentation_preferences_only"),
        clinicalInterpretation: z.literal("none"),
        workflowAuthority: z.literal(false)
      })
      .strict()
  })
  .strict();
export type BoundedPersonalizationProjection = z.infer<
  typeof BoundedPersonalizationProjectionSchema
>;
