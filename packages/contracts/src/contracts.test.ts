import { describe, expect, it } from "vitest";

import { MeasurementFactSchema, PatientReportSchema, VoicePresentationEventSchema } from ".";

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
});
