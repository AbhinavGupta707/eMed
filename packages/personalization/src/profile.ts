import { z } from "zod";

import {
  BoundedPersonalizationProfileSchema,
  BoundedPersonalizationProjectionSchema,
  CompletedTaskHistoryEntrySchema,
  PersonalizationConsentSchema,
  PreferenceUpdateSchema,
  type BoundedPersonalizationProfile,
  type BoundedPersonalizationProjection,
  type CompletedTaskHistoryEntry,
  type PersonalizationConsent,
  type PreferenceUpdate
} from "./schemas";

const CreateProfileInputSchema = z
  .object({
    patientId: z.string().trim().min(1).max(120),
    now: z.iso.datetime()
  })
  .strict();

const MutateProfileInputSchema = z
  .object({
    profile: BoundedPersonalizationProfileSchema,
    now: z.iso.datetime()
  })
  .strict();

export class PersonalizationProfileConflictError extends Error {
  readonly code = "personalization_profile_conflict";

  constructor(readonly reason: "stale_version" | "consent_required" | "duplicate_conflict") {
    super(`Bounded personalisation update was rejected: ${reason}.`);
    this.name = "PersonalizationProfileConflictError";
  }
}

export function createEmptyPersonalizationProfile(inputValue: {
  patientId: string;
  now: string;
}): BoundedPersonalizationProfile {
  const input = CreateProfileInputSchema.parse(inputValue);
  return BoundedPersonalizationProfileSchema.parse({
    schemaVersion: "bounded-personalization-profile.v1",
    patientId: input.patientId,
    dataClassification: "synthetic_demo",
    profileVersion: 1,
    consent: { status: "not_requested" },
    defaultDevice: { status: "unknown" },
    accessibility: { status: "unknown" },
    language: { status: "unknown" },
    display: { status: "unknown" },
    completedTasks: [],
    updatedAt: input.now
  });
}

export function setPersonalizationConsent(inputValue: {
  profile: BoundedPersonalizationProfile;
  consent: PersonalizationConsent;
  expectedProfileVersion: number;
  now: string;
}): BoundedPersonalizationProfile {
  const input = MutateProfileInputSchema.extend({
    consent: PersonalizationConsentSchema,
    expectedProfileVersion: z.number().int().positive()
  })
    .strict()
    .parse(inputValue);
  if (input.profile.profileVersion !== input.expectedProfileVersion) {
    throw new PersonalizationProfileConflictError("stale_version");
  }
  const consentGranted = input.consent.status === "granted";
  return BoundedPersonalizationProfileSchema.parse({
    ...input.profile,
    profileVersion: input.profile.profileVersion + 1,
    consent: input.consent,
    defaultDevice: consentGranted ? input.profile.defaultDevice : { status: "unknown" },
    accessibility: consentGranted ? input.profile.accessibility : { status: "unknown" },
    language: consentGranted ? input.profile.language : { status: "unknown" },
    display: consentGranted ? input.profile.display : { status: "unknown" },
    completedTasks: consentGranted ? input.profile.completedTasks : [],
    updatedAt: input.now
  });
}

export function updateStructuredPreferences(inputValue: {
  profile: BoundedPersonalizationProfile;
  update: PreferenceUpdate;
  now: string;
}): BoundedPersonalizationProfile {
  const input = MutateProfileInputSchema.extend({ update: PreferenceUpdateSchema })
    .strict()
    .parse(inputValue);
  if (input.profile.profileVersion !== input.update.expectedProfileVersion) {
    throw new PersonalizationProfileConflictError("stale_version");
  }
  if (input.profile.consent.status !== "granted") {
    throw new PersonalizationProfileConflictError("consent_required");
  }
  return BoundedPersonalizationProfileSchema.parse({
    ...input.profile,
    profileVersion: input.profile.profileVersion + 1,
    ...(input.update.defaultDevice ? { defaultDevice: input.update.defaultDevice } : {}),
    ...(input.update.accessibility ? { accessibility: input.update.accessibility } : {}),
    ...(input.update.language ? { language: input.update.language } : {}),
    ...(input.update.display ? { display: input.update.display } : {}),
    updatedAt: input.now
  });
}

export function appendCompletedTaskHistory(inputValue: {
  profile: BoundedPersonalizationProfile;
  task: CompletedTaskHistoryEntry;
  expectedProfileVersion: number;
  now: string;
}): BoundedPersonalizationProfile {
  const input = MutateProfileInputSchema.extend({
    task: CompletedTaskHistoryEntrySchema,
    expectedProfileVersion: z.number().int().positive()
  })
    .strict()
    .parse(inputValue);
  if (input.profile.profileVersion !== input.expectedProfileVersion) {
    throw new PersonalizationProfileConflictError("stale_version");
  }
  if (input.profile.consent.status !== "granted") {
    throw new PersonalizationProfileConflictError("consent_required");
  }
  const existing = input.profile.completedTasks.find(
    (task) => task.completionId === input.task.completionId
  );
  if (existing) {
    if (JSON.stringify(existing) !== JSON.stringify(input.task)) {
      throw new PersonalizationProfileConflictError("duplicate_conflict");
    }
    return input.profile;
  }
  const completedTasks = [input.task, ...input.profile.completedTasks]
    .sort((left, right) => Date.parse(right.completedAt) - Date.parse(left.completedAt))
    .slice(0, 50);
  return BoundedPersonalizationProfileSchema.parse({
    ...input.profile,
    profileVersion: input.profile.profileVersion + 1,
    completedTasks,
    updatedAt: input.now
  });
}

export function projectBoundedPersonalization(inputValue: {
  profile: BoundedPersonalizationProfile;
  generatedAt: string;
  completedTaskLimit?: number;
}): BoundedPersonalizationProjection {
  const input = MutateProfileInputSchema.extend({
    generatedAt: z.iso.datetime(),
    completedTaskLimit: z.number().int().min(0).max(12).default(8)
  })
    .omit({ now: true })
    .strict()
    .parse(inputValue);
  return BoundedPersonalizationProjectionSchema.parse({
    schemaVersion: "bounded-personalization-projection.v1",
    patientId: input.profile.patientId,
    profileVersion: input.profile.profileVersion,
    generatedAt: input.generatedAt,
    consentStatus: input.profile.consent.status,
    defaultDevice: input.profile.defaultDevice,
    accessibility: input.profile.accessibility,
    language: input.profile.language,
    display: input.profile.display,
    recentCompletedTasks: input.profile.completedTasks.slice(0, input.completedTaskLimit),
    authority: {
      scope: "presentation_preferences_only",
      clinicalInterpretation: "none",
      workflowAuthority: false
    }
  });
}
