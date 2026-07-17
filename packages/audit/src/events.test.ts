import { describe, expect, it } from "vitest";

import { createPatientReportConfirmedEvent, createProgrammeTaskCreatedEvent } from "./events";

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
});
