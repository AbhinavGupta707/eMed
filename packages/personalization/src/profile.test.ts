import { describe, expect, it } from "vitest";

import {
  PersonalizationProfileConflictError,
  appendCompletedTaskHistory,
  createEmptyPersonalizationProfile,
  projectBoundedPersonalization,
  setPersonalizationConsent,
  updateStructuredPreferences
} from "./profile";
import { BoundedPersonalizationProfileSchema } from "./schemas";

const NOW = "2026-07-18T12:00:00.000Z";

function preferenceProvenance(id: string) {
  return {
    schemaVersion: "preference-provenance.v1" as const,
    source: "patient_confirmation" as const,
    confirmationId: id,
    recordedAt: NOW
  };
}

function consentedProfile() {
  const empty = createEmptyPersonalizationProfile({ patientId: "synthetic-maya", now: NOW });
  return setPersonalizationConsent({
    profile: empty,
    consent: {
      status: "granted",
      policyVersion: "structured-preferences-v1",
      decidedAt: NOW
    },
    expectedProfileVersion: 1,
    now: NOW
  });
}

function completedTask(completionId: string, completedAt = NOW) {
  return {
    schemaVersion: "completed-task-history.v1" as const,
    completionId,
    taskId: `task:${completionId}`,
    taskKind: "finger_pulse" as const,
    completedAt,
    deviceUsed: "phone" as const,
    outcome: "derived_fact_recorded" as const,
    provenance: {
      schemaVersion: "task-history-provenance.v1" as const,
      source: "deterministic_workflow" as const,
      roundId: "40000000-0000-4000-8000-000000000001",
      rawMediaStored: false as const,
      transcriptStored: false as const
    }
  };
}

describe("bounded personalisation profile", () => {
  it("starts explicitly unknown and requires consent before preferences", () => {
    const profile = createEmptyPersonalizationProfile({ patientId: "synthetic-maya", now: NOW });
    expect(profile).toMatchObject({
      consent: { status: "not_requested" },
      defaultDevice: { status: "unknown" },
      accessibility: { status: "unknown" },
      completedTasks: []
    });

    expect(() =>
      updateStructuredPreferences({
        profile,
        update: {
          expectedProfileVersion: 1,
          defaultDevice: {
            status: "set",
            value: "phone",
            provenance: preferenceProvenance("60000000-0000-4000-8000-000000000001")
          }
        },
        now: NOW
      })
    ).toThrowError(new PersonalizationProfileConflictError("consent_required"));
  });

  it("stores only patient-confirmed device, accessibility, language, and display choices", () => {
    const profile = consentedProfile();
    const updated = updateStructuredPreferences({
      profile,
      update: {
        expectedProfileVersion: 2,
        defaultDevice: {
          status: "set",
          value: "phone",
          provenance: preferenceProvenance("60000000-0000-4000-8000-000000000001")
        },
        accessibility: {
          status: "set",
          modes: ["larger_text", "reduced_motion"],
          provenance: preferenceProvenance("60000000-0000-4000-8000-000000000002")
        },
        language: {
          status: "set",
          languageTag: "en-GB",
          provenance: preferenceProvenance("60000000-0000-4000-8000-000000000003")
        },
        display: {
          status: "set",
          choices: {
            textSize: "large",
            informationDensity: "comfortable",
            timeFormat: "24_hour"
          },
          provenance: preferenceProvenance("60000000-0000-4000-8000-000000000004")
        }
      },
      now: NOW
    });

    expect(updated).toMatchObject({
      profileVersion: 3,
      defaultDevice: { status: "set", value: "phone" },
      accessibility: { status: "set", modes: ["larger_text", "reduced_motion"] },
      language: { status: "set", languageTag: "en-GB" },
      display: { status: "set", choices: { textSize: "large" } }
    });
  });

  it("keeps completed-task history bounded, ordered, and idempotent", () => {
    const profile = consentedProfile();
    const task = completedTask("70000000-0000-4000-8000-000000000001");
    const updated = appendCompletedTaskHistory({
      profile,
      task,
      expectedProfileVersion: 2,
      now: NOW
    });
    const replay = appendCompletedTaskHistory({
      profile: updated,
      task,
      expectedProfileVersion: 3,
      now: NOW
    });

    expect(updated.completedTasks).toEqual([task]);
    expect(replay).toEqual(updated);
    expect(() =>
      appendCompletedTaskHistory({
        profile: updated,
        task: { ...task, outcome: "unavailable" },
        expectedProfileVersion: 3,
        now: NOW
      })
    ).toThrowError(new PersonalizationProfileConflictError("duplicate_conflict"));
  });

  it("projects only a caller-bounded recent task list with no clinical authority", () => {
    let profile = consentedProfile();
    for (let index = 1; index <= 4; index += 1) {
      profile = appendCompletedTaskHistory({
        profile,
        task: completedTask(
          `70000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
          `2026-07-${String(10 + index).padStart(2, "0")}T12:00:00.000Z`
        ),
        expectedProfileVersion: profile.profileVersion,
        now: NOW
      });
    }
    const projection = projectBoundedPersonalization({
      profile,
      generatedAt: NOW,
      completedTaskLimit: 2
    });

    expect(projection.recentCompletedTasks).toHaveLength(2);
    expect(projection.authority).toEqual({
      scope: "presentation_preferences_only",
      clinicalInterpretation: "none",
      workflowAuthority: false
    });
  });

  it("clears structured memory when consent is declined and rejects unstructured fields", () => {
    const withTask = appendCompletedTaskHistory({
      profile: consentedProfile(),
      task: completedTask("70000000-0000-4000-8000-000000000001"),
      expectedProfileVersion: 2,
      now: NOW
    });
    const cleared = setPersonalizationConsent({
      profile: withTask,
      consent: { status: "declined", policyVersion: "structured-preferences-v1", decidedAt: NOW },
      expectedProfileVersion: 3,
      now: NOW
    });

    expect(cleared).toMatchObject({
      consent: { status: "declined" },
      defaultDevice: { status: "unknown" },
      completedTasks: []
    });
    expect(
      BoundedPersonalizationProfileSchema.safeParse({
        ...cleared,
        transcript: "forbidden"
      }).success
    ).toBe(false);
  });
});
