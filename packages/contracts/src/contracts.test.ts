import { describe, expect, it } from "vitest";

import {
  AdaptiveSelectionDecisionSchema,
  AdaptiveSelectionInputSchema,
  ConfirmedMedicationObservationFactSchema,
  MeasurementFactSchema,
  MedicationLabelImageMetadataSchema,
  MedicationLabelObservationSchema,
  PatientReportSchema,
  VoiceAgentReportProposalSchema,
  VoiceBiomarkerFactSchema,
  VoicePresentationEventSchema
} from ".";

describe("frozen cross-lane contracts", () => {
  it("accepts a confirmed bounded patient report", () => {
    const parsed = PatientReportSchema.parse({
      reportId: "dcfce5d5-b681-4593-81af-806256e9e352",
      roundId: "cc80d269-2f79-4328-a129-98cac85219e4",
      weakness: "moderate",
      palpitations: "intermittent",
      redFlags: { chestPain: "no", severeBreathlessness: "no", fainted: "no" },
      inputMode: "voice_confirmed",
      confirmedAt: "2026-07-17T09:00:00.000Z"
    });

    expect(parsed.inputMode).toBe("voice_confirmed");
  });

  it("rejects a measurement without passing quality", () => {
    const result = MeasurementFactSchema.safeParse({
      factId: "13369361-df18-4b88-9b0f-3632b896a57f",
      assessmentSessionId: "45906cff-34ea-4a86-a0c0-05967adb20c4",
      provider: "finger_ppg",
      value: 72,
      unit: "bpm",
      observedAt: "2026-07-17T09:00:00.000Z",
      durationMs: 20_000,
      algorithmVersion: "finger_ppg_hr_v1",
      providerModelVersion: null,
      quality: { status: "retry", score: 0.45, reasons: ["motion"], metrics: {} },
      rawMediaRef: null
    });

    expect(result.success).toBe(false);
  });

  it("does not define workflow-authority voice events", () => {
    expect(
      VoicePresentationEventSchema.safeParse({ type: "set_urgency", urgency: "emergency" }).success
    ).toBe(false);
  });

  it("keeps a voice-agent report proposal unconfirmed and preserves unresolved fields", () => {
    expect(
      VoiceAgentReportProposalSchema.safeParse({
        contractVersion: "voice-report-proposal.v1",
        weakness: "unknown",
        palpitations: "intermittent",
        redFlags: { chestPain: "no", severeBreathlessness: "unsure", fainted: "no" },
        note: "I have felt weak since this morning.",
        unresolvedFields: ["weakness", "severe_breathlessness"]
      }).success
    ).toBe(true);
    expect(
      VoiceAgentReportProposalSchema.safeParse({
        contractVersion: "voice-report-proposal.v1",
        weakness: "unknown",
        palpitations: "intermittent",
        redFlags: { chestPain: "no", severeBreathlessness: "no", fainted: "no" },
        note: null,
        unresolvedFields: []
      }).success
    ).toBe(false);
  });

  it("makes raw voice media unrepresentable in a research-only derived fact", () => {
    const base = {
      factId: "fb99983d-cc81-454e-9c92-f8e99e0891de",
      roundId: "cc80d269-2f79-4328-a129-98cac85219e4",
      assessmentSessionId: "45906cff-34ea-4a86-a0c0-05967adb20c4",
      provider: "local_voice_features",
      observedAt: "2026-07-17T09:00:00.000Z",
      durationMs: 8_000,
      algorithmVersion: "local-voice-features.v1",
      features: {
        medianFundamentalFrequencyHz: 182,
        pitchVariabilitySemitones: 1.4,
        jitterPercent: 1.1,
        shimmerPercent: 3.2,
        harmonicToNoiseRatioDb: 18.5,
        phonationDurationMs: 8_000
      },
      quality: {
        status: "pass",
        score: 0.91,
        reasons: [],
        metrics: {
          sampleRateHz: 48_000,
          durationMs: 8_000,
          clippingFraction: 0.002,
          voicedFraction: 0.88,
          estimatedSnrDb: 24
        }
      },
      researchOnly: true,
      rawMediaRef: null
    } as const;
    expect(VoiceBiomarkerFactSchema.safeParse(base).success).toBe(true);
    expect(
      VoiceBiomarkerFactSchema.safeParse({ ...base, rawMediaRef: "recording.wav" }).success
    ).toBe(false);
  });

  it("freezes an available deterministic fallback inside the server candidate allowlist", () => {
    expect(
      AdaptiveSelectionInputSchema.safeParse({
        contractVersion: "adaptive-selection.v1",
        roundId: "cc80d269-2f79-4328-a129-98cac85219e4",
        stateVersion: 2,
        syntheticDataOnly: true,
        redFlagGate: "clear",
        neededFactKeys: ["pulse_bpm"],
        burdenSecondsRemaining: 60,
        context: [],
        candidates: [
          {
            id: "pulse.local",
            kind: "pulse_capture",
            label: "Check pulse",
            description: "A short local optical pulse check.",
            producesFactKeys: ["pulse_bpm"],
            availability: { status: "available" },
            estimatedBurdenSeconds: 30,
            deterministicRank: 0
          }
        ],
        deterministicFallbackModuleId: "pulse.local"
      }).success
    ).toBe(true);

    expect(
      AdaptiveSelectionInputSchema.safeParse({
        contractVersion: "adaptive-selection.v1",
        roundId: "cc80d269-2f79-4328-a129-98cac85219e4",
        stateVersion: 2,
        syntheticDataOnly: true,
        redFlagGate: "clear",
        neededFactKeys: ["pulse_bpm"],
        burdenSecondsRemaining: 60,
        context: [],
        candidates: [
          {
            id: "pulse.local",
            kind: "pulse_capture",
            label: "Check pulse",
            description: "A short local optical pulse check.",
            producesFactKeys: ["pulse_bpm"],
            availability: { status: "unavailable", reason: "unsupported_device" },
            estimatedBurdenSeconds: 30,
            deterministicRank: 0
          }
        ],
        deterministicFallbackModuleId: "pulse.local"
      }).success
    ).toBe(false);
  });

  it("accepts only a bounded selection or explicit abstention from the model", () => {
    expect(
      AdaptiveSelectionDecisionSchema.safeParse({
        decision: "select",
        candidateModuleId: "pulse.local",
        evidenceReferenceIds: ["patient.report"],
        rationale: "A pulse check addresses the remaining evidence gap.",
        uncertainty: "low",
        missingInformation: []
      }).success
    ).toBe(true);
    expect(
      AdaptiveSelectionDecisionSchema.safeParse({
        decision: "set_urgency",
        candidateModuleId: "emergency",
        evidenceReferenceIds: [],
        rationale: "Escalate",
        uncertainty: "low",
        missingInformation: []
      }).success
    ).toBe(false);
  });

  it("makes raw medication media unrepresentable and preserves uncertain fields", () => {
    expect(
      MedicationLabelImageMetadataSchema.safeParse({
        requestId: "7fd16467-bfa6-4277-94b5-3673b34a6c4d",
        captureMode: "camera",
        mediaType: "image/jpeg",
        byteLength: 400_000,
        width: 1_280,
        height: 720,
        consentVersion: "medication-label.v1",
        consentGrantedAt: "2026-07-17T09:00:00.000Z",
        syntheticDataOnly: true,
        rawMediaRef: "camera-frame"
      }).success
    ).toBe(false);
    expect(
      MedicationLabelObservationSchema.safeParse({
        field: "strength",
        status: "uncertain",
        value: "5 mg",
        confidence: 0.52
      }).success
    ).toBe(true);
  });

  it("requires explicit medication confirmation and consistent text/image provenance", () => {
    expect(
      ConfirmedMedicationObservationFactSchema.safeParse({
        factId: "fb99983d-cc81-454e-9c92-f8e99e0891de",
        roundId: "cc80d269-2f79-4328-a129-98cac85219e4",
        proposalId: null,
        stateVersion: 3,
        source: "text_entry",
        reviewItems: [
          { field: "product_name", disposition: "corrected", reviewedValue: "Demo medicine" }
        ],
        explicitlyConfirmed: true,
        confirmedAt: "2026-07-17T09:00:00.000Z",
        rawMediaRef: null
      }).success
    ).toBe(true);
    expect(
      ConfirmedMedicationObservationFactSchema.safeParse({
        factId: "fb99983d-cc81-454e-9c92-f8e99e0891de",
        roundId: "cc80d269-2f79-4328-a129-98cac85219e4",
        proposalId: null,
        stateVersion: 3,
        source: "image_review",
        reviewItems: [
          { field: "product_name", disposition: "accepted", reviewedValue: "Demo medicine" }
        ],
        explicitlyConfirmed: true,
        confirmedAt: "2026-07-17T09:00:00.000Z",
        rawMediaRef: null
      }).success
    ).toBe(false);
  });
});
