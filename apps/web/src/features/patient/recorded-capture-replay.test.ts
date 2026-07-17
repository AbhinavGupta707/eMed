import { describe, expect, it, vi } from "vitest";

import {
  RecordedCaptureReplaySchema,
  createRecordedCaptureReplayLoader
} from "./recorded-capture-replay";

const fixture = {
  schemaVersion: 1,
  fixtureType: "recorded_valid_capture_replay",
  dataClassification: "synthetic_demo",
  label: "Recorded synthetic valid capture — demo recovery only",
  notClinicallyValidated: true,
  containsRawMedia: false,
  containsPatientData: false,
  automaticFallbackAllowed: false,
  usePolicy: {
    requiresDemoMode: true,
    requiresLiveCaptureFailure: true,
    requiresExplicitUserSelection: true,
    mustRemainVisiblyLabelled: true,
    mustNeverReplaceOrModifyLiveMeasurement: true
  },
  measurementPrototype: {
    provider: "finger_ppg",
    value: 78,
    unit: "bpm",
    durationMs: 20_000,
    algorithmVersion: "homerounds-finger-ppg-fixture-v1",
    providerModelVersion: null,
    quality: { status: "pass", score: 0.92, reasons: [], metrics: { fixtureReplay: 1 } },
    rawMediaRef: null
  },
  provenance: {
    source: "deterministic_synthetic_engineering_fixture",
    recordedAt: "2026-07-17T09:00:00.000Z",
    physicalDeviceEvidence: false,
    medicalDeviceValidation: false
  }
};

describe("recorded capture replay policy", () => {
  it("loads only the strict visibly labelled no-media recovery contract", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(fixture));

    await expect(createRecordedCaptureReplayLoader(fetcher)()).resolves.toEqual(fixture);
    expect(fetcher).toHaveBeenCalledWith("/demo/recorded-valid-capture.v1.json", {
      cache: "no-store",
      credentials: "same-origin"
    });
  });

  it("rejects automatic fallback, raw media, patient data, or non-passing evidence", () => {
    for (const unsafe of [
      { ...fixture, automaticFallbackAllowed: true },
      { ...fixture, containsRawMedia: true },
      { ...fixture, containsPatientData: true },
      {
        ...fixture,
        measurementPrototype: {
          ...fixture.measurementPrototype,
          quality: { ...fixture.measurementPrototype.quality, status: "retry" }
        }
      }
    ]) {
      expect(RecordedCaptureReplaySchema.safeParse(unsafe).success).toBe(false);
    }
  });
});
