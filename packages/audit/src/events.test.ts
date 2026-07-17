import { describe, expect, it } from "vitest";

import {
  createPatientReportConfirmedEvent,
  createProgrammeTaskCreatedEvent,
  createVoiceBiomarkerAcceptedEvent
} from "./events";

const base = {
  eventId: "22b45117-613b-49e8-baa9-18f227e380a1",
  occurredAt: "2026-07-17T12:00:00.000Z",
  actor: { kind: "system" as const, id: "action-service" },
  patientId: "synthetic-maya",
  roundId: "137c9d4f-4dfc-4b95-a5ce-657ba00b29b4",
  correlationId: "correlation-1",
  source: "system" as const
};

describe("safe audit event factories", () => {
  it("records only bounded references for action success", () => {
    const event = createProgrammeTaskCreatedEvent({
      ...base,
      idempotencyKey: `action:v1:${"a".repeat(64)}`,
      taskId: "6730d6d2-75e1-5fa0-b72f-02198fdf8e5c",
      protocolResult: {
        protocolId: "cardiometabolic_demo",
        protocolVersion: "1.0.0",
        matchedRuleIds: ["illustrative_normal_pulse"],
        factIds: ["fact-1"],
        outcome: "programme_review_requested",
        allowedActions: ["create_programme_task"],
        missingFactKeys: [],
        explanationKey: "protocol.pulse.illustrative_normal"
      },
      messageTemplateId: "programme_review_requested_v1"
    });

    expect(event.type).toBe("programme_task_created");
    expect(JSON.stringify(event)).not.toMatch(/transcript|audio|frame|secret|note/i);
  });

  it("drops confirmed report free text from the audit payload", () => {
    const event = createPatientReportConfirmedEvent({
      ...base,
      actor: { kind: "patient", id: "synthetic-session" },
      source: "patient_ui",
      reportId: "1d8163f3-22f5-4f99-850b-827ce2a05277",
      weakness: "absent",
      palpitations: "absent",
      redFlags: { chestPain: "no", severeBreathlessness: "no", fainted: "no" },
      inputMode: "voice_confirmed",
      confirmedAt: "2026-07-17T12:00:00.000Z",
      freeTextStored: false
    });

    expect(event.payload).toMatchObject({ freeTextStored: false });
    expect(JSON.stringify(event)).not.toMatch(/transcript|note|audio/i);
  });

  it("records only bounded voice-feature provenance and no audio or transcript", () => {
    const event = createVoiceBiomarkerAcceptedEvent({
      ...base,
      actor: { kind: "patient", id: "synthetic-session" },
      source: "patient_ui",
      factId: "fb99983d-cc81-454e-9c92-f8e99e0891de",
      assessmentSessionId: "45906cff-34ea-4a86-a0c0-05967adb20c4",
      provider: "local_voice_features",
      qualityStatus: "pass",
      researchOnly: true,
      rawMediaStored: false
    });

    expect(event.type).toBe("voice_biomarker_accepted");
    expect(event.payload).toMatchObject({ researchOnly: true, rawMediaStored: false });
    expect(JSON.stringify(event)).not.toMatch(/transcript|rawaudio|audiobytes|prompt/i);
  });
});
