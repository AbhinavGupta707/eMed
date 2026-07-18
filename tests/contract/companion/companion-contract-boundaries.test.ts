import {
  CompanionAcknowledgeRequestSchema,
  CompanionDesktopSnapshotSchema,
  CompanionExchangeRequestSchema,
  CompanionPairingIssueSchema,
  CompanionPhoneSnapshotSchema,
  CompanionStatusUpdateRequestSchema,
  CompanionTaskResultRequestSchema
} from "../../../packages/companion/src/index";
import { describe, expect, it } from "vitest";

const OPERATION_ID = "11111111-1111-4111-8111-111111111111";
const RESULT_ID = "22222222-2222-4222-8222-222222222222";
const PAIRING_ID = "33333333-3333-4333-8333-333333333333";
const ROUND_ID = "44444444-4444-4444-8444-444444444444";
const NOW = "2026-07-18T12:00:00.000Z";
const EXPIRES_AT = "2026-07-18T12:05:00.000Z";
const TASK = {
  taskId: "capture.finger_ppg.pulse",
  kind: "finger_pulse" as const,
  taskVersion: 7
};

function unavailableResult(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    operationId: OPERATION_ID,
    expectedSessionVersion: 4,
    taskId: TASK.taskId,
    taskKind: TASK.kind,
    clientObservedAt: NOW,
    rawMediaStored: false as const,
    outcome: "unavailable" as const,
    reason: "unsupported_device" as const,
    ...overrides
  };
}

function derivedCandidate(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    operationId: OPERATION_ID,
    expectedSessionVersion: 4,
    taskId: TASK.taskId,
    taskKind: TASK.kind,
    clientObservedAt: NOW,
    rawMediaStored: false as const,
    outcome: "derived_candidate" as const,
    derived: {
      pulseBpm: 72,
      durationMs: 30_000,
      algorithmVersion: "synthetic-local-finger-ppg-v1",
      quality: { status: "unreviewed" as const, score: 0.91, reasons: [] }
    },
    ...overrides
  };
}

describe("companion wire contracts", () => {
  it("keeps the QR bearer in a fragment-only opaque link with no round or patient scope", () => {
    const token = `cpt1_${Buffer.alloc(32, 17).toString("base64url")}`;
    const issue = CompanionPairingIssueSchema.parse({
      pairingId: PAIRING_ID,
      pairingVersion: 1,
      pairingLink: `https://synthetic.example/companion#pair=${token}`,
      tokenExpiresAt: EXPIRES_AT,
      task: TASK
    });
    const link = new URL(issue.pairingLink);

    expect(link.search).toBe("");
    expect(link.hash).toBe(`#pair=${token}`);
    expect(issue.pairingLink).not.toContain(ROUND_ID);
    expect(issue.pairingLink).not.toMatch(/patient|role|stateVersion/i);
    expect(
      CompanionExchangeRequestSchema.safeParse({
        token,
        exchangeIdempotencyKey: OPERATION_ID,
        roundId: ROUND_ID,
        role: "patient"
      }).success
    ).toBe(false);
  });

  it.each([
    ["malformed operation ID", { operationId: "operation-not-a-uuid" }],
    ["missing state version", { expectedSessionVersion: undefined }],
    ["zero state version", { expectedSessionVersion: 0 }],
    ["unsupported task kind", { taskKind: "diagnostic_scan" }],
    ["extra round scope", { roundId: ROUND_ID }],
    ["extra role scope", { role: "clinician" }]
  ])("refuses %s on a status operation", (_name, mutation) => {
    const candidate = {
      operationId: OPERATION_ID,
      expectedSessionVersion: 1,
      taskId: TASK.taskId,
      taskKind: TASK.kind,
      phase: "permission",
      ...mutation
    };

    expect(CompanionStatusUpdateRequestSchema.safeParse(candidate).success).toBe(false);
  });

  it.each([
    ["raw frame", { rawFrame: "data:image/jpeg;base64,synthetic" }],
    ["raw camera media", { cameraFrames: ["synthetic-frame"] }],
    ["raw audio", { rawAudio: "synthetic-audio" }],
    ["raw transcript", { transcript: "synthetic spoken words" }],
    ["provider secret", { apiKey: "synthetic-never-a-real-key" }],
    ["hidden model output", { hiddenReasoning: "synthetic hidden text" }],
    ["quality authority", { qualityAccepted: true }],
    ["workflow authority", { urgency: "emergency" }],
    ["care action", { actionId: "contact_service" }],
    ["client-selected result ID", { resultId: RESULT_ID }],
    ["raw media marker changed", { rawMediaStored: true }]
  ])("cannot represent %s in a phone result", (_name, extra) => {
    expect(
      CompanionTaskResultRequestSchema.safeParse({ ...derivedCandidate(), ...extra }).success
    ).toBe(false);
  });

  it("preserves failed and unavailable captures as non-measurements", () => {
    for (const outcome of [
      { outcome: "quality_rejected", reason: "quality_too_low" },
      { outcome: "unavailable", reason: "provider_unavailable" },
      { outcome: "declined", reason: "patient_declined" }
    ] as const) {
      const parsed = CompanionTaskResultRequestSchema.parse(unavailableResult(outcome));
      expect(parsed.outcome).toBe(outcome.outcome);
      expect(parsed).not.toHaveProperty("derived");
      expect(parsed).not.toHaveProperty("pulseBpm");
      expect(parsed.rawMediaStored).toBe(false);
    }

    expect(
      CompanionTaskResultRequestSchema.safeParse({
        ...unavailableResult(),
        pulseBpm: 72,
        quality: { status: "pass" }
      }).success
    ).toBe(false);
  });

  it("labels every numeric phone result as an unreviewed candidate", () => {
    const candidate = CompanionTaskResultRequestSchema.parse(derivedCandidate());

    expect(candidate).toMatchObject({
      outcome: "derived_candidate",
      derived: { quality: { status: "unreviewed" } }
    });
    expect(candidate).not.toHaveProperty("acceptedAsMeasurement");
    expect(candidate).not.toHaveProperty("protocolDecision");
  });

  it("keeps phone and desktop snapshots scoped and bearer-free", () => {
    const phone = CompanionPhoneSnapshotSchema.parse({
      sessionVersion: 4,
      status: "active",
      expiresAt: EXPIRES_AT,
      task: TASK,
      taskPhase: "in_progress",
      consentRequirement: {
        kind: "explicit_local_capture",
        version: "homerounds-local-capture-v1"
      },
      consentState: {
        status: "granted",
        version: "homerounds-local-capture-v1",
        grantedAt: NOW
      },
      lastResult: null,
      reissueRequired: false
    });
    const desktop = CompanionDesktopSnapshotSchema.parse({
      pairingId: PAIRING_ID,
      roundId: ROUND_ID,
      roundStateVersion: 7,
      pairingVersion: 4,
      status: "active",
      connection: "phone_connected",
      tokenExpiresAt: EXPIRES_AT,
      sessionExpiresAt: "2026-07-18T12:20:00.000Z",
      task: TASK,
      taskPhase: "in_progress",
      lastResult: null,
      reissueRequired: false
    });

    expect(phone).not.toHaveProperty("roundId");
    expect(phone).not.toHaveProperty("patientId");
    expect(phone).not.toHaveProperty("allowedTaskKinds");
    expect(JSON.stringify({ phone, desktop })).not.toMatch(
      /cpt1_|cst1_|tokenHash|sessionToken|apiKey|databaseUrl|transcript|rawFrame|rawAudio/i
    );
  });

  it("requires a server-issued result ID for acknowledgement", () => {
    expect(
      CompanionAcknowledgeRequestSchema.safeParse({
        operationId: OPERATION_ID,
        expectedPairingVersion: 5,
        resultId: RESULT_ID
      }).success
    ).toBe(true);
    expect(
      CompanionAcknowledgeRequestSchema.safeParse({
        operationId: OPERATION_ID,
        expectedPairingVersion: 5,
        resultId: "client-picked-result"
      }).success
    ).toBe(false);
  });
});
