import { describe, expect, it } from "vitest";

import {
  MeasurementFactSchema,
  VoiceBiomarkerFactSchema,
  type OpticalAssessmentResult
} from "@homerounds/contracts";
import type { CompanionPhoneSnapshot } from "@homerounds/companion";
import {
  createOpticalCandidateResult,
  createVoiceCandidateResult,
  unavailableReasonForOptical
} from "./result-model";

const dependencies = {
  createId: () => "c2a3a2ab-f330-4d15-8342-cdc59220e098",
  now: () => "2026-07-18T12:01:00.000Z"
};

function snapshot(kind: CompanionPhoneSnapshot["task"]["kind"]): CompanionPhoneSnapshot {
  return {
    sessionVersion: 3,
    status: "active",
    expiresAt: "2026-07-18T12:20:00.000Z",
    task: { taskId: `selected.${kind}`, kind, taskVersion: 1 },
    taskPhase: "in_progress",
    consentRequirement: { kind: "explicit_local_capture", version: "local-v1" },
    consentState: {
      status: "granted",
      version: "local-v1",
      grantedAt: "2026-07-18T12:00:00.000Z"
    },
    lastResult: null,
    reissueRequired: false
  };
}

describe("companion derived-result mapping", () => {
  it("maps only a passing local finger measurement into a candidate with raw media absent", () => {
    const result: Extract<OpticalAssessmentResult, { status: "completed" }> = {
      status: "completed",
      measurement: MeasurementFactSchema.parse({
        factId: "d0e241f9-436d-48bc-8811-060edfd6c52b",
        assessmentSessionId: "61261f44-69c6-45f1-a1d2-bdc13c86006e",
        provider: "finger_ppg",
        value: 72.4,
        unit: "bpm",
        observedAt: "2026-07-18T12:00:30.000Z",
        durationMs: 20_000,
        algorithmVersion: "finger_ppg_hr_v1",
        providerModelVersion: null,
        quality: { status: "pass", score: 0.91, reasons: [], metrics: {} },
        rawMediaRef: null
      })
    };

    const mapped = createOpticalCandidateResult(snapshot("finger_pulse"), result, dependencies);

    expect(mapped).toMatchObject({
      taskKind: "finger_pulse",
      outcome: "derived_candidate",
      rawMediaStored: false,
      derived: { pulseBpm: 72.4, algorithmVersion: "finger_ppg_hr_v1" }
    });
  });

  it("does not invent a voice feature when a passing fact contains an unknown value", () => {
    const fact = VoiceBiomarkerFactSchema.parse({
      factId: "73655f4a-e805-4c24-925a-1c930489d377",
      roundId: "2b348846-f16c-4646-abff-a12b8b1b2b16",
      assessmentSessionId: "e9fd3a80-ee46-4f96-b2cf-fd5f181fe4f8",
      provider: "local_voice_features",
      observedAt: "2026-07-18T12:00:30.000Z",
      durationMs: 7_000,
      algorithmVersion: "local_sustained_vowel_features_v1",
      features: {
        medianFundamentalFrequencyHz: null,
        pitchVariabilitySemitones: 1.2,
        jitterPercent: 0.8,
        shimmerPercent: 2.1,
        harmonicToNoiseRatioDb: 18,
        phonationDurationMs: 7_000
      },
      quality: {
        status: "pass",
        score: 0.9,
        reasons: [],
        metrics: {
          sampleRateHz: 48_000,
          durationMs: 7_000,
          clippingFraction: 0,
          voicedFraction: 0.9,
          estimatedSnrDb: 20
        }
      },
      researchOnly: true,
      rawMediaRef: null
    });

    expect(createVoiceCandidateResult(snapshot("voice_signal"), fact, dependencies)).toMatchObject({
      outcome: "quality_rejected",
      reason: "quality_too_low",
      rawMediaStored: false
    });
  });

  it("preserves typed optical unavailable reasons without browser fingerprint detail", () => {
    expect(unavailableReasonForOptical("permission_denied")).toBe("permission_denied");
    expect(unavailableReasonForOptical("network_unavailable")).toBe("network_interrupted");
    expect(unavailableReasonForOptical("missing_configuration")).toBe("provider_unavailable");
  });
});
