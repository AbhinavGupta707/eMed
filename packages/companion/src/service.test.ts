import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { CompanionServiceError } from "./errors";
import { InMemoryCompanionPairingRepository } from "./in-memory-repository";
import type { CompanionCryptoPort, CompanionRoundAuthoritySnapshot } from "./ports";
import { CompanionTaskResultRequestSchema } from "./schemas";
import { CompanionService } from "./service";

const ROUND_ID = "11111111-1111-4111-8111-111111111111";
const PATIENT_ID = "synthetic-person";
const EXCHANGE_ID = "22222222-2222-4222-8222-222222222222";
const STATUS_ID = "33333333-3333-4333-8333-333333333333";
const RESULT_ID = "44444444-4444-4444-8444-444444444444";
const ACK_ID = "55555555-5555-4555-8555-555555555555";

function digest(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

class FakeCrypto implements CompanionCryptoPort {
  tokenCounter = 0;

  issuePairingToken(): string {
    this.tokenCounter += 1;
    return `cpt1_${Buffer.alloc(32, this.tokenCounter).toString("base64url")}`;
  }

  deriveSessionToken(sessionId: string): string {
    return `cst1_${digest(`session:${sessionId}`)}`;
  }

  hashToken(purpose: "pairing" | "session", token: string): string {
    return digest(`${purpose}:${token}`);
  }

  hashValue(purpose: "exchange" | "device", value: string): string {
    return digest(`${purpose}:${value}`);
  }

  fingerprint(value: unknown): string {
    return digest(JSON.stringify(value));
  }
}

function uuidFrom(index: number): string {
  return `aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, "0")}`;
}

function setup() {
  let now = "2026-07-18T12:00:00.000Z";
  let id = 0;
  const crypto = new FakeCrypto();
  const repository = new InMemoryCompanionPairingRepository();
  const authority: { current: CompanionRoundAuthoritySnapshot } = {
    current: {
      roundId: ROUND_ID,
      patientId: PATIENT_ID,
      roundStateVersion: 7,
      pairable: true,
      currentTask: {
        taskId: "capture.finger_ppg.pulse",
        kind: "finger_pulse",
        taskVersion: 1
      },
      allowedTaskKinds: ["finger_pulse", "voice_signal"],
      consentRequirement: {
        kind: "explicit_local_capture",
        version: "local-capture-v1"
      }
    }
  };
  const service = new CompanionService({
    repository,
    authority: {
      async read(roundId) {
        return roundId === ROUND_ID ? authority.current : null;
      }
    },
    clock: { now: () => now },
    ids: { createId: () => uuidFrom(++id) },
    crypto,
    appBaseUrl: "https://demo.example"
  });
  return {
    service,
    repository,
    authority,
    crypto,
    setNow(value: string) {
      now = value;
    }
  };
}

async function issue(setupValue: ReturnType<typeof setup>) {
  return setupValue.service.createPairing({
    roundId: ROUND_ID,
    expectedRoundStateVersion: 7,
    patientId: PATIENT_ID,
    createdBySessionId: "desktop-patient-session"
  });
}

function tokenFrom(link: string): string {
  const url = new URL(link);
  return new URLSearchParams(url.hash.slice(1)).get("pair") ?? "";
}

async function exchange(setupValue: ReturnType<typeof setup>, token: string, key = EXCHANGE_ID) {
  return setupValue.service.exchange({
    token,
    exchangeIdempotencyKey: key,
    deviceBinding: "test browser\u001ftest platform"
  });
}

async function moveToProgress(setupValue: ReturnType<typeof setup>, sessionToken: string) {
  let snapshot = await setupValue.service.updateStatus({
    sessionToken,
    operationId: STATUS_ID,
    expectedSessionVersion: 1,
    taskId: "capture.finger_ppg.pulse",
    taskKind: "finger_pulse",
    phase: "permission"
  });
  snapshot = await setupValue.service.updateStatus({
    sessionToken,
    operationId: "66666666-6666-4666-8666-666666666666",
    expectedSessionVersion: snapshot.sessionVersion,
    taskId: snapshot.task.taskId,
    taskKind: snapshot.task.kind,
    phase: "guidance",
    consent: {
      decision: "granted",
      version: "local-capture-v1",
      grantedAt: "2026-07-18T12:00:01.000Z"
    }
  });
  return setupValue.service.updateStatus({
    sessionToken,
    operationId: "77777777-7777-4777-8777-777777777777",
    expectedSessionVersion: snapshot.sessionVersion,
    taskId: snapshot.task.taskId,
    taskKind: snapshot.task.kind,
    phase: "in_progress"
  });
}

function fingerResult(expectedSessionVersion: number, operationId = RESULT_ID) {
  return {
    operationId,
    expectedSessionVersion,
    taskId: "capture.finger_ppg.pulse",
    taskKind: "finger_pulse" as const,
    clientObservedAt: "2026-07-18T12:00:10.000Z",
    rawMediaStored: false as const,
    outcome: "derived_candidate" as const,
    derived: {
      pulseBpm: 72,
      durationMs: 30_000,
      algorithmVersion: "local-finger-ppg-v1",
      quality: { status: "unreviewed" as const, score: 0.91, reasons: [] }
    }
  };
}

describe("secure companion service", () => {
  it("issues a fragment-only 256-bit token and persists only its keyed hash", async () => {
    const context = setup();
    const pairing = await issue(context);
    const token = tokenFrom(pairing.pairingLink);
    const stored = await context.repository.getPairing(pairing.pairingId);

    expect(token).toMatch(/^cpt1_[A-Za-z0-9_-]{43}$/);
    expect(pairing.pairingLink).not.toContain(ROUND_ID);
    expect(pairing.pairingLink).not.toContain(PATIENT_ID);
    expect(new URL(pairing.pairingLink).search).toBe("");
    expect(stored?.tokenHash).toBe(context.crypto.hashToken("pairing", token));
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(JSON.stringify(stored)).not.toContain("cpt1_");
    await expect(issue(context)).rejects.toMatchObject({ code: "repository_conflict" });
  });

  it("restores only the current pairing for its authenticated patient", async () => {
    const context = setup();
    const pairing = await issue(context);
    await expect(
      context.service.getCurrentDesktopSnapshot({ roundId: ROUND_ID, patientId: PATIENT_ID })
    ).resolves.toMatchObject({
      pairingId: pairing.pairingId,
      connection: "waiting_for_phone"
    });
    await expect(
      context.service.getCurrentDesktopSnapshot({
        roundId: ROUND_ID,
        patientId: "another-person"
      })
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("rejects forged and expired tokens without creating a session", async () => {
    const forgedContext = setup();
    await issue(forgedContext);
    await expect(
      exchange(forgedContext, `cpt1_${Buffer.alloc(32, 99).toString("base64url")}`)
    ).rejects.toMatchObject({ code: "token_invalid" });

    const expiredContext = setup();
    const pairing = await issue(expiredContext);
    expiredContext.setNow("2026-07-18T12:06:00.000Z");
    await expect(exchange(expiredContext, tokenFrom(pairing.pairingLink))).rejects.toMatchObject({
      code: "token_expired"
    });
  });

  it("allows only a bounded same-device exchange replay and refuses token reuse", async () => {
    const context = setup();
    const pairing = await issue(context);
    const token = tokenFrom(pairing.pairingLink);
    const first = await exchange(context, token);
    const replay = await exchange(context, token);
    expect(replay.replayed).toBe(true);
    expect(replay.sessionToken).toBe(first.sessionToken);

    await expect(
      exchange(context, token, "88888888-8888-4888-8888-888888888888")
    ).rejects.toMatchObject({ code: "token_used" });

    context.setNow("2026-07-18T12:00:31.000Z");
    await expect(exchange(context, token)).rejects.toMatchObject({ code: "token_used" });
  });

  it("refuses wrong patient scope and an authority version or task change", async () => {
    const wrongOwner = setup();
    await expect(
      wrongOwner.service.createPairing({
        roundId: ROUND_ID,
        expectedRoundStateVersion: 7,
        patientId: "another-person",
        createdBySessionId: "patient-session"
      })
    ).rejects.toMatchObject({ code: "forbidden" });

    const stale = setup();
    const pairing = await issue(stale);
    stale.authority.current = { ...stale.authority.current, roundStateVersion: 8 };
    await expect(exchange(stale, tokenFrom(pairing.pairingLink))).rejects.toMatchObject({
      code: "authority_changed"
    });

    const changedTask = setup();
    const changedPairing = await issue(changedTask);
    changedTask.authority.current = {
      ...changedTask.authority.current,
      currentTask: { taskId: "voice.local.baseline", kind: "voice_signal", taskVersion: 1 }
    };
    await expect(
      exchange(changedTask, tokenFrom(changedPairing.pairingLink))
    ).rejects.toMatchObject({
      code: "authority_changed"
    });
  });

  it("cannot browse another round or submit an unselected task kind", async () => {
    const context = setup();
    const pairing = await issue(context);
    const session = await exchange(context, tokenFrom(pairing.pairingLink));
    expect(Object.keys(session.snapshot)).not.toContain("roundId");
    expect(JSON.stringify(session.snapshot)).not.toContain(ROUND_ID);

    await expect(
      context.service.updateStatus({
        sessionToken: session.sessionToken,
        operationId: STATUS_ID,
        expectedSessionVersion: 1,
        taskId: "voice.local.baseline",
        taskKind: "voice_signal",
        phase: "permission"
      })
    ).rejects.toMatchObject({ code: "invalid_task" });
  });

  it("rejects stale concurrent writes while preserving one committed transition", async () => {
    const context = setup();
    const pairing = await issue(context);
    const session = await exchange(context, tokenFrom(pairing.pairingLink));
    const base = {
      sessionToken: session.sessionToken,
      expectedSessionVersion: 1,
      taskId: "capture.finger_ppg.pulse",
      taskKind: "finger_pulse" as const,
      phase: "permission" as const
    };
    const outcomes = await Promise.allSettled([
      context.service.updateStatus({ ...base, operationId: STATUS_ID }),
      context.service.updateStatus({
        ...base,
        operationId: "99999999-9999-4999-8999-999999999999"
      })
    ]);

    expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find(({ status }) => status === "rejected");
    expect(rejected).toMatchObject({ reason: { code: "stale_version" } });
    await expect(context.service.getPhoneSnapshot(session.sessionToken)).resolves.toMatchObject({
      sessionVersion: 2,
      taskPhase: "permission"
    });
  });

  it("replays the same operation exactly and rejects an idempotency-key conflict", async () => {
    const context = setup();
    const pairing = await issue(context);
    const session = await exchange(context, tokenFrom(pairing.pairingLink));
    const request = {
      sessionToken: session.sessionToken,
      operationId: STATUS_ID,
      expectedSessionVersion: 1,
      taskId: "capture.finger_ppg.pulse",
      taskKind: "finger_pulse" as const,
      phase: "permission" as const
    };
    const first = await context.service.updateStatus(request);
    const replay = await context.service.updateStatus(request);
    expect(replay).toEqual(first);
    await expect(
      context.service.updateStatus({ ...request, phase: "guidance" })
    ).rejects.toMatchObject({ code: "idempotency_conflict" });
  });

  it("stores only a bounded derived proposal and marks it pending deterministic validation", async () => {
    const context = setup();
    const pairing = await issue(context);
    const session = await exchange(context, tokenFrom(pairing.pairingLink));
    const progress = await moveToProgress(context, session.sessionToken);
    const result = fingerResult(progress.sessionVersion);
    const receipt = await context.service.submitResult({
      sessionToken: session.sessionToken,
      result
    });
    const replay = await context.service.submitResult({
      sessionToken: session.sessionToken,
      result
    });
    const stored = await context.repository.getResult(receipt.resultId);

    expect(receipt).toMatchObject({
      status: "received_for_workflow_validation",
      replayed: false
    });
    expect(replay).toMatchObject({ resultId: receipt.resultId, replayed: true });
    expect(stored).toMatchObject({
      validationStatus: "pending_deterministic_workflow",
      result: { rawMediaStored: false, outcome: "derived_candidate" }
    });
    expect(JSON.stringify(stored)).not.toMatch(
      /rawFrame|rawAudio|video|apiKey|secret|prompt|transcript/i
    );
  });

  it("rejects raw media, secrets, urgency, quality authority, and care-action fields", () => {
    const safe = fingerResult(4);
    for (const forbidden of [
      { roundId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" },
      { rawFrame: "base64" },
      { apiKey: "not-a-real-key" },
      { urgency: "emergency" },
      { qualityAccepted: true },
      { careAction: "contact_service" },
      { transcript: "spoken words" },
      { hiddenReasoning: "private chain" }
    ]) {
      expect(CompanionTaskResultRequestSchema.safeParse({ ...safe, ...forbidden }).success).toBe(
        false
      );
    }
  });

  it("revokes refresh/resume immediately and safely replaces an expired pairing", async () => {
    const context = setup();
    const pairing = await issue(context);
    const oldToken = tokenFrom(pairing.pairingLink);
    const session = await exchange(context, oldToken);
    await expect(context.service.getPhoneSnapshot(session.sessionToken)).resolves.toMatchObject({
      status: "active",
      sessionVersion: 1
    });
    const desktop = await context.service.getDesktopSnapshot({
      pairingId: pairing.pairingId,
      patientId: PATIENT_ID
    });
    await context.service.revokePairing({
      pairingId: pairing.pairingId,
      patientId: PATIENT_ID,
      operationId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      expectedPairingVersion: desktop.pairingVersion
    });
    await expect(context.service.getPhoneSnapshot(session.sessionToken)).rejects.toMatchObject({
      code: "revoked"
    });

    const replacement = await context.service.reissuePairing({
      pairingId: pairing.pairingId,
      patientId: PATIENT_ID,
      operationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      expectedPairingVersion: desktop.pairingVersion + 1
    });
    expect(replacement.pairingId).not.toBe(pairing.pairingId);
    await expect(exchange(context, oldToken)).rejects.toMatchObject({ code: "revoked" });
    await expect(exchange(context, tokenFrom(replacement.pairingLink))).resolves.toMatchObject({
      replayed: false
    });
  });

  it("shows completion before a scoped desktop receipt acknowledgement", async () => {
    const context = setup();
    const pairing = await issue(context);
    const session = await exchange(context, tokenFrom(pairing.pairingLink));
    const progress = await moveToProgress(context, session.sessionToken);
    const receipt = await context.service.submitResult({
      sessionToken: session.sessionToken,
      result: fingerResult(progress.sessionVersion)
    });
    const desktop = await context.service.getDesktopSnapshot({
      pairingId: pairing.pairingId,
      patientId: PATIENT_ID
    });
    expect(desktop).toMatchObject({ connection: "result_received", taskPhase: "completed" });
    context.authority.current = {
      ...context.authority.current,
      roundStateVersion: context.authority.current.roundStateVersion + 1,
      pairable: false,
      currentTask: null
    };
    const acknowledged = await context.service.acknowledgeResult({
      pairingId: pairing.pairingId,
      patientId: PATIENT_ID,
      operationId: ACK_ID,
      expectedPairingVersion: desktop.pairingVersion,
      resultId: receipt.resultId
    });
    expect(acknowledged).toMatchObject({
      connection: "desktop_acknowledged",
      taskPhase: "desktop_acknowledged",
      status: "completed"
    });
    await expect(
      context.service.reissuePairing({
        pairingId: pairing.pairingId,
        patientId: PATIENT_ID,
        operationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        expectedPairingVersion: acknowledged.pairingVersion
      })
    ).rejects.toMatchObject({ code: "invalid_transition" });
    await expect(context.service.getPhoneSnapshot(session.sessionToken)).resolves.toMatchObject({
      taskPhase: "desktop_acknowledged"
    });
  });

  it("classifies domain failures without leaking supplied values", () => {
    const error = new CompanionServiceError("session_unauthorized", false);
    expect(error.message).toBe("Companion request rejected: session_unauthorized");
    expect(error.message).not.toContain(PATIENT_ID);
  });
});
