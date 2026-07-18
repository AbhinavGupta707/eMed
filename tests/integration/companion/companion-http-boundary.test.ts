import { describe, expect, it } from "vitest";

import {
  handleAcknowledgeCompanionResult,
  handleCreateCompanionPairing,
  handleExchangeCompanionPairing,
  handleGetCompanionSession,
  handleReissueCompanionPairing,
  handleRevokeCompanionPairing,
  handleSubmitCompanionResult,
  handleUpdateCompanionStatus
} from "../../../apps/web/src/server/companion/handlers";
import {
  APP_ORIGIN,
  companionPost,
  companionResponseSchemas,
  createCompanionHarness,
  ErrorEnvelopeSchema,
  exchangePairing,
  issuePairing,
  movePhoneToProgress,
  readDesktopSnapshot,
  readPhoneSnapshot,
  TEST_NOW,
  TEST_ROUND_ID,
  TEST_TASK
} from "./support";

function unavailableResult(
  operationId: string,
  expectedSessionVersion: number,
  reason: "unsupported_device" | "network_interrupted" = "unsupported_device"
) {
  return {
    operationId,
    expectedSessionVersion,
    taskId: TEST_TASK.taskId,
    taskKind: TEST_TASK.kind,
    clientObservedAt: TEST_NOW,
    rawMediaStored: false as const,
    outcome: "unavailable" as const,
    reason
  };
}

describe("companion HTTP integration", () => {
  it("synchronizes one concurrent result, supports replay, and requires the exact desktop receipt", async () => {
    const harness = createCompanionHarness();
    const { issue, token } = await issuePairing(harness);
    const exchange = await exchangePairing(harness, token);
    expect(exchange.response.status).toBe(200);
    expect(exchange.cookie).not.toBeNull();
    expect(exchange.response.headers.get("set-cookie")).toMatch(
      /^__Host-homerounds_companion=.+; Path=\/; HttpOnly; Secure; SameSite=Strict;/
    );
    const cookie = exchange.cookie!;

    const firstPoll = await readPhoneSnapshot(harness, cookie);
    expect(firstPoll.response.status).toBe(200);
    const etag = firstPoll.response.headers.get("etag");
    const unchanged = await handleGetCompanionSession(
      new Request(`${APP_ORIGIN}/api/companion/session`, {
        headers: { cookie, "if-none-match": etag! }
      }),
      harness.runtime
    );
    expect(unchanged.status).toBe(304);
    expect(await unchanged.text()).toBe("");

    const progress = await movePhoneToProgress(harness, cookie);
    expect(progress).toMatchObject({ sessionVersion: 4, taskPhase: "in_progress" });

    const firstResult = unavailableResult(
      "66666666-6666-4666-8666-666666666666",
      progress.sessionVersion
    );
    const secondResult = unavailableResult(
      "77777777-7777-4777-8777-777777777777",
      progress.sessionVersion,
      "network_interrupted"
    );
    const [desktopPoll, resultA, resultB] = await Promise.all([
      readDesktopSnapshot(harness, issue.pairingId),
      handleSubmitCompanionResult(
        companionPost("/api/companion/session/result", firstResult, { cookie }),
        harness.runtime
      ),
      handleSubmitCompanionResult(
        companionPost("/api/companion/session/result", secondResult, { cookie }),
        harness.runtime
      )
    ]);
    expect(desktopPoll.response.status).toBe(200);
    expect([resultA.status, resultB.status].toSorted()).toEqual([200, 409]);
    const winner =
      resultA.status === 200
        ? { response: resultA, result: firstResult }
        : { response: resultB, result: secondResult };
    const loser = resultA.status === 409 ? resultA : resultB;
    expect(await loser.json()).toMatchObject({ error: { code: "stale_version" } });

    const receiptEnvelope = companionResponseSchemas.receipt.parse(await winner.response.json());
    expect(receiptEnvelope.data.receipt).toMatchObject({
      status: "received_for_workflow_validation",
      replayed: false
    });
    const replay = await handleSubmitCompanionResult(
      companionPost("/api/companion/session/result", winner.result, { cookie }),
      harness.runtime
    );
    expect(replay.status).toBe(200);
    expect(companionResponseSchemas.receipt.parse(await replay.json()).data.receipt).toMatchObject({
      resultId: receiptEnvelope.data.receipt.resultId,
      replayed: true
    });
    const conflictingReplay = await handleSubmitCompanionResult(
      companionPost(
        "/api/companion/session/result",
        { ...winner.result, reason: "provider_unavailable" },
        { cookie }
      ),
      harness.runtime
    );
    expect(conflictingReplay.status).toBe(409);
    expect(await conflictingReplay.json()).toMatchObject({
      error: { code: "idempotency_conflict" }
    });

    const synchronized = await readDesktopSnapshot(harness, issue.pairingId);
    expect(synchronized.envelope?.data.snapshot).toMatchObject({
      connection: "result_received",
      taskPhase: "completed",
      lastResult: { resultId: receiptEnvelope.data.receipt.resultId, outcome: "unavailable" }
    });
    expect(JSON.stringify(synchronized.envelope)).not.toMatch(
      /pulseBpm|rawFrame|rawAudio|transcript|apiKey|secret|tokenHash|sessionToken|cpt1_|cst1_/i
    );

    const wrongReceipt = await handleAcknowledgeCompanionResult(
      companionPost(`/api/companion/pairings/${issue.pairingId}/acknowledge`, {
        operationId: "88888888-8888-4888-8888-888888888888",
        expectedPairingVersion: synchronized.envelope!.data.snapshot.pairingVersion,
        resultId: "99999999-9999-4999-8999-999999999999"
      }),
      harness.runtime,
      issue.pairingId
    );
    expect(wrongReceipt.status).toBe(403);
    expect(await wrongReceipt.json()).toMatchObject({ error: { code: "invalid_task" } });

    const acknowledgeRequest = {
      operationId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      expectedPairingVersion: synchronized.envelope!.data.snapshot.pairingVersion,
      resultId: receiptEnvelope.data.receipt.resultId
    };
    const acknowledged = await handleAcknowledgeCompanionResult(
      companionPost(`/api/companion/pairings/${issue.pairingId}/acknowledge`, acknowledgeRequest),
      harness.runtime,
      issue.pairingId
    );
    expect(acknowledged.status).toBe(200);
    expect(
      companionResponseSchemas.desktop.parse(await acknowledged.json()).data.snapshot
    ).toMatchObject({
      connection: "desktop_acknowledged",
      status: "completed",
      taskPhase: "desktop_acknowledged"
    });
    const acknowledgementReplay = await handleAcknowledgeCompanionResult(
      companionPost(`/api/companion/pairings/${issue.pairingId}/acknowledge`, acknowledgeRequest),
      harness.runtime,
      issue.pairingId
    );
    expect(acknowledgementReplay.status).toBe(200);
    expect((await readPhoneSnapshot(harness, cookie)).envelope?.data.snapshot.taskPhase).toBe(
      "desktop_acknowledged"
    );
  });

  it("rejects forged, expired, reused, and wrong-device pairing tokens", async () => {
    const forgedHarness = createCompanionHarness();
    await issuePairing(forgedHarness);
    const forged = await handleExchangeCompanionPairing(
      companionPost("/api/companion/exchange", {
        token: `cpt1_${Buffer.alloc(32, 99).toString("base64url")}`,
        exchangeIdempotencyKey: "11111111-2222-4333-8444-555555555555"
      }),
      forgedHarness.runtime
    );
    expect(forged.status).toBe(401);
    expect(ErrorEnvelopeSchema.parse(await forged.json()).error.code).toBe("token_invalid");

    const expiredHarness = createCompanionHarness();
    const expiredIssue = await issuePairing(expiredHarness);
    expiredHarness.setNow("2026-07-18T12:06:00.000Z");
    const expired = await exchangePairing(expiredHarness, expiredIssue.token);
    expect(expired.response.status).toBe(410);
    expect(ErrorEnvelopeSchema.parse(await expired.response.json()).error.code).toBe(
      "token_expired"
    );

    const usedHarness = createCompanionHarness();
    const usedIssue = await issuePairing(usedHarness);
    const initial = await exchangePairing(usedHarness, usedIssue.token, {
      userAgent: "Synthetic Phone A"
    });
    expect(initial.response.status).toBe(200);
    const exactReplay = await exchangePairing(usedHarness, usedIssue.token, {
      userAgent: "Synthetic Phone A"
    });
    expect(exactReplay.envelope?.data.replayed).toBe(true);
    const wrongDevice = await exchangePairing(usedHarness, usedIssue.token, {
      userAgent: "Synthetic Phone B"
    });
    expect(wrongDevice.response.status).toBe(409);
    expect(ErrorEnvelopeSchema.parse(await wrongDevice.response.json()).error.code).toBe(
      "token_used"
    );
    const reused = await exchangePairing(usedHarness, usedIssue.token, {
      exchangeId: "22222222-3333-4444-8555-666666666666",
      userAgent: "Synthetic Phone A"
    });
    expect(reused.response.status).toBe(409);
    expect(ErrorEnvelopeSchema.parse(await reused.response.json()).error.code).toBe("token_used");
  });

  it("enforces patient role, round, task, state-version, and operation scopes", async () => {
    const roleHarness = createCompanionHarness();
    const clinician = await handleCreateCompanionPairing(
      companionPost(
        "/api/companion/pairings",
        { roundId: TEST_ROUND_ID, expectedRoundStateVersion: 4 },
        { role: "clinician" }
      ),
      roleHarness.runtime
    );
    expect(clinician.status).toBe(403);

    const wrongRound = await handleCreateCompanionPairing(
      companionPost("/api/companion/pairings", {
        roundId: "99999999-9999-4999-8999-999999999999",
        expectedRoundStateVersion: 4
      }),
      createCompanionHarness().runtime
    );
    expect(wrongRound.status).toBe(404);
    const wrongCreateVersion = await handleCreateCompanionPairing(
      companionPost("/api/companion/pairings", {
        roundId: TEST_ROUND_ID,
        expectedRoundStateVersion: 3
      }),
      createCompanionHarness().runtime
    );
    expect(wrongCreateVersion.status).toBe(409);

    const harness = createCompanionHarness();
    const { token } = await issuePairing(harness);
    const exchange = await exchangePairing(harness, token);
    const cookie = exchange.cookie!;
    const wrongTask = await handleUpdateCompanionStatus(
      companionPost(
        "/api/companion/session/status",
        {
          operationId: "33333333-3333-4333-8333-333333333333",
          expectedSessionVersion: 1,
          taskId: "voice.local.baseline",
          taskKind: "voice_signal",
          phase: "permission"
        },
        { cookie }
      ),
      harness.runtime
    );
    expect(wrongTask.status).toBe(403);
    const invalidOperation = await handleUpdateCompanionStatus(
      companionPost(
        "/api/companion/session/status",
        {
          operationId: "not-a-uuid",
          expectedSessionVersion: 1,
          taskId: TEST_TASK.taskId,
          taskKind: TEST_TASK.kind,
          phase: "permission"
        },
        { cookie }
      ),
      harness.runtime
    );
    expect(invalidOperation.status).toBe(400);

    const accepted = await handleUpdateCompanionStatus(
      companionPost(
        "/api/companion/session/status",
        {
          operationId: "44444444-4444-4444-8444-444444444444",
          expectedSessionVersion: 1,
          taskId: TEST_TASK.taskId,
          taskKind: TEST_TASK.kind,
          phase: "permission"
        },
        { cookie }
      ),
      harness.runtime
    );
    expect(accepted.status).toBe(200);
    const stale = await handleUpdateCompanionStatus(
      companionPost(
        "/api/companion/session/status",
        {
          operationId: "55555555-5555-4555-8555-555555555555",
          expectedSessionVersion: 1,
          taskId: TEST_TASK.taskId,
          taskKind: TEST_TASK.kind,
          phase: "guidance"
        },
        { cookie }
      ),
      harness.runtime
    );
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ error: { code: "stale_version" } });

    harness.authority.current = { ...harness.authority.current!, roundStateVersion: 5 };
    const changedAuthority = await readPhoneSnapshot(harness, cookie);
    expect(changedAuthority.response.status).toBe(410);
    expect(ErrorEnvelopeSchema.parse(await changedAuthority.response.json()).error.code).toBe(
      "authority_changed"
    );
  });

  it("reissues a QR, revokes the old session, and resumes only the current scoped cookie", async () => {
    const harness = createCompanionHarness();
    const original = await issuePairing(harness);
    const replacementResponse = await handleReissueCompanionPairing(
      companionPost(`/api/companion/pairings/${original.issue.pairingId}/reissue`, {
        operationId: "11111111-aaaa-4bbb-8ccc-222222222222",
        expectedPairingVersion: original.issue.pairingVersion
      }),
      harness.runtime,
      original.issue.pairingId
    );
    expect(replacementResponse.status).toBe(201);
    const replacement = companionResponseSchemas.issue.parse(await replacementResponse.json()).data
      .issue;
    expect(replacement.pairingId).not.toBe(original.issue.pairingId);
    expect(replacement.pairingLink).not.toBe(original.issue.pairingLink);

    const oldToken = await exchangePairing(harness, original.token);
    expect(oldToken.response.status).toBe(410);
    const replacementToken = new URLSearchParams(
      new URL(replacement.pairingLink).hash.slice(1)
    ).get("pair");
    if (!replacementToken) throw new Error("Replacement QR token missing");
    const connected = await exchangePairing(harness, replacementToken);
    expect(connected.response.status).toBe(200);
    const cookie = connected.cookie!;
    const refreshA = await readPhoneSnapshot(harness, cookie);
    const refreshB = await readPhoneSnapshot(harness, cookie);
    expect(refreshA.envelope?.data.snapshot).toEqual(refreshB.envelope?.data.snapshot);

    const desktop = await readDesktopSnapshot(harness, replacement.pairingId);
    const revoked = await handleRevokeCompanionPairing(
      companionPost(`/api/companion/pairings/${replacement.pairingId}/revoke`, {
        operationId: "33333333-aaaa-4bbb-8ccc-444444444444",
        expectedPairingVersion: desktop.envelope!.data.snapshot.pairingVersion
      }),
      harness.runtime,
      replacement.pairingId
    );
    expect(revoked.status).toBe(200);
    expect(
      companionResponseSchemas.desktop.parse(await revoked.json()).data.snapshot
    ).toMatchObject({
      connection: "revoked",
      reissueRequired: true
    });
    const disconnected = await readPhoneSnapshot(harness, cookie);
    expect(disconnected.response.status).toBe(410);
    expect(ErrorEnvelopeSchema.parse(await disconnected.response.json()).error.code).toBe(
      "revoked"
    );
  });

  it("fails keylessly with a typed unavailable response and never echoes rejected payloads", async () => {
    const unavailable = createCompanionHarness(false);
    const response = await handleCreateCompanionPairing(
      companionPost("/api/companion/pairings", {
        roundId: TEST_ROUND_ID,
        expectedRoundStateVersion: 4
      }),
      unavailable.runtime
    );
    expect(response.status).toBe(503);
    expect(ErrorEnvelopeSchema.parse(await response.json()).error).toMatchObject({
      code: "integration_unavailable",
      retryable: true
    });

    const harness = createCompanionHarness();
    const issue = await issuePairing(harness);
    const exchange = await exchangePairing(harness, issue.token);
    const rejected = await handleSubmitCompanionResult(
      companionPost(
        "/api/companion/session/result",
        {
          ...unavailableResult("77777777-aaaa-4bbb-8ccc-888888888888", 1),
          rawFrame: "synthetic-frame-never-persist",
          transcript: "synthetic transcript never persist",
          apiKey: "synthetic-key-never-persist"
        },
        { cookie: exchange.cookie! }
      ),
      harness.runtime
    );
    const rejectedText = await rejected.text();
    expect(rejected.status).toBe(400);
    expect(rejectedText).not.toMatch(/synthetic-frame|synthetic transcript|synthetic-key/i);
    expect(JSON.stringify(await harness.repository.getPairing(issue.issue.pairingId))).not.toMatch(
      /rawFrame|rawAudio|transcript|apiKey|cpt1_|cst1_/i
    );
  });
});
