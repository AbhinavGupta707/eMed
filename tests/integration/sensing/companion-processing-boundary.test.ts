import { describe, expect, it, vi } from "vitest";

import {
  handleAcknowledgeCompanionResult,
  handleSubmitCompanionResult
} from "../../../apps/web/src/server/companion/handlers";
import {
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
  TEST_TASK
} from "../companion/support";
import { fingerQualityMetrics, registeredAlgorithms } from "../../contract/sensing/fixtures";

function candidate(operationId: string, expectedSessionVersion: number) {
  return {
    operationId,
    expectedSessionVersion,
    taskId: TEST_TASK.taskId,
    taskKind: TEST_TASK.kind,
    clientObservedAt: TEST_NOW,
    rawMediaStored: false as const,
    outcome: "derived_candidate" as const,
    derived: {
      pulseBpm: 72,
      durationMs: 15_000,
      algorithmVersion: registeredAlgorithms.finger,
      quality: {
        status: "unreviewed" as const,
        score: 0.9,
        reasons: [],
        metrics: fingerQualityMetrics
      }
    }
  };
}

describe("companion sensing processing boundary", () => {
  it("retries deterministic processing without a second capture after a committed failure", async () => {
    const harness = createCompanionHarness();
    const process = vi
      .fn()
      .mockRejectedValueOnce(new Error("fixture workflow interruption"))
      .mockResolvedValue(undefined);
    harness.runtime.workflow = { process };
    const issued = await issuePairing(harness);
    const exchange = await exchangePairing(harness, issued.token);
    const progress = await movePhoneToProgress(harness, exchange.cookie!);
    const result = candidate("79000000-0000-4000-8000-000000000001", progress.sessionVersion);

    const interrupted = await handleSubmitCompanionResult(
      companionPost("/api/companion/session/result", result, { cookie: exchange.cookie! }),
      harness.runtime
    );
    expect(interrupted.status).toBe(500);
    expect(ErrorEnvelopeSchema.parse(await interrupted.json()).error).toMatchObject({
      code: "internal_error",
      retryable: true
    });

    const replay = await handleSubmitCompanionResult(
      companionPost("/api/companion/session/result", result, { cookie: exchange.cookie! }),
      harness.runtime
    );
    expect(replay.status).toBe(200);
    const receipt = companionResponseSchemas.receipt.parse(await replay.json()).data.receipt;
    expect(receipt.replayed).toBe(true);
    expect(process).toHaveBeenCalledTimes(2);
    expect(process.mock.calls[0]?.[0].record.resultId).toBe(receipt.resultId);
    expect(process.mock.calls[1]?.[0].record.resultId).toBe(receipt.resultId);
    expect(await harness.repository.getResult(receipt.resultId)).toMatchObject({
      validationStatus: "pending_deterministic_workflow",
      result: { rawMediaStored: false, outcome: "derived_candidate" }
    });
  });

  it.each([
    ["owner field", { ownerPatientId: "synthetic-other-owner" }, 400],
    ["round field", { roundId: "79000000-0000-4000-8000-000000000002" }, 400],
    ["state field", { roundStateVersion: 99 }, 400],
    ["raw frame", { rawFrame: "forbidden-frame" }, 400],
    ["transcript", { transcript: "forbidden-transcript" }, 400],
    ["task", { taskId: "capture.vitallens.pulse" }, 403]
  ])(
    "rejects cross-device %s tampering before workflow processing",
    async (_name, mutation, status) => {
      const harness = createCompanionHarness();
      const process = vi.fn(async () => undefined);
      harness.runtime.workflow = { process };
      const issued = await issuePairing(harness);
      const exchange = await exchangePairing(harness, issued.token);
      const progress = await movePhoneToProgress(harness, exchange.cookie!);
      const result = {
        ...candidate("79000000-0000-4000-8000-000000000003", progress.sessionVersion),
        ...mutation
      };

      const response = await handleSubmitCompanionResult(
        companionPost("/api/companion/session/result", result, { cookie: exchange.cookie! }),
        harness.runtime
      );
      expect(response.status).toBe(status);
      expect(process).not.toHaveBeenCalled();
      expect(
        JSON.stringify(await harness.repository.getPairing(issued.issue.pairingId))
      ).not.toMatch(/forbidden-frame|forbidden-transcript/);
    }
  );

  it("keeps acknowledgement scoped to the issued result after authoritative round advancement", async () => {
    const harness = createCompanionHarness();
    harness.runtime.workflow = {
      process: async () => {
        harness.authority.current = {
          ...harness.authority.current!,
          roundStateVersion: harness.authority.current!.roundStateVersion + 1,
          pairable: false,
          currentTask: null
        };
      }
    };
    const issued = await issuePairing(harness);
    const exchange = await exchangePairing(harness, issued.token);
    const progress = await movePhoneToProgress(harness, exchange.cookie!);
    const submitted = await handleSubmitCompanionResult(
      companionPost(
        "/api/companion/session/result",
        candidate("79000000-0000-4000-8000-000000000004", progress.sessionVersion),
        { cookie: exchange.cookie! }
      ),
      harness.runtime
    );
    expect(submitted.status).toBe(200);
    const receipt = companionResponseSchemas.receipt.parse(await submitted.json()).data.receipt;
    const desktop = await readDesktopSnapshot(harness, issued.issue.pairingId);
    expect(desktop.envelope?.data.snapshot).toMatchObject({
      connection: "result_received",
      lastResult: { resultId: receipt.resultId },
      reissueRequired: true
    });

    const wrong = await handleAcknowledgeCompanionResult(
      companionPost(`/api/companion/pairings/${issued.issue.pairingId}/acknowledge`, {
        operationId: "79000000-0000-4000-8000-000000000005",
        expectedPairingVersion: desktop.envelope!.data.snapshot.pairingVersion,
        resultId: "79000000-0000-4000-8000-000000000099"
      }),
      harness.runtime,
      issued.issue.pairingId
    );
    expect(wrong.status).toBe(403);

    const request = {
      operationId: "79000000-0000-4000-8000-000000000006",
      expectedPairingVersion: desktop.envelope!.data.snapshot.pairingVersion,
      resultId: receipt.resultId
    };
    const acknowledged = await handleAcknowledgeCompanionResult(
      companionPost(`/api/companion/pairings/${issued.issue.pairingId}/acknowledge`, request),
      harness.runtime,
      issued.issue.pairingId
    );
    expect(acknowledged.status).toBe(200);
    expect(
      companionResponseSchemas.desktop.parse(await acknowledged.json()).data.snapshot
    ).toMatchObject({
      connection: "desktop_acknowledged",
      taskPhase: "desktop_acknowledged",
      lastResult: { resultId: receipt.resultId }
    });
    const replay = await handleAcknowledgeCompanionResult(
      companionPost(`/api/companion/pairings/${issued.issue.pairingId}/acknowledge`, request),
      harness.runtime,
      issued.issue.pairingId
    );
    expect(replay.status).toBe(200);
    expect(
      (await readPhoneSnapshot(harness, exchange.cookie!)).envelope?.data.snapshot
    ).toMatchObject({
      taskPhase: "desktop_acknowledged",
      lastResult: { resultId: receipt.resultId }
    });
  });
});
