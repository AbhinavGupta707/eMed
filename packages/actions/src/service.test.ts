import type { ProtocolResult, Round } from "@homerounds/contracts";
import {
  InMemoryHomeRoundsRepository,
  type CommitActionInput,
  type CommitActionResult
} from "@homerounds/persistence";
import { describe, expect, it } from "vitest";

import { deriveActionIdempotencyKey } from "./idempotency";
import { ActionProposalSchema } from "./schemas";
import { ActionService, ActionServiceError } from "./service";

const NOW = "2026-07-17T12:00:00.000Z";
const ROUND_ID = "137c9d4f-4dfc-4b95-a5ce-657ba00b29b4";

const protocolResult: ProtocolResult = {
  protocolId: "cardiometabolic_demo",
  protocolVersion: "1.0.0",
  matchedRuleIds: ["illustrative_normal_pulse"],
  factIds: ["fact-b", "fact-a"],
  outcome: "programme_review_requested",
  allowedActions: ["create_programme_task"],
  missingFactKeys: [],
  explanationKey: "protocol.pulse.illustrative_normal"
};

function round(state: Round["state"] = "action_pending", stateVersion = 8): Round {
  return {
    id: ROUND_ID,
    patientId: "synthetic-maya",
    state,
    stateVersion,
    purpose: "Synthetic programme round",
    triggerId: "trigger-1",
    burdenSecondsRemaining: 90,
    protocolId: "cardiometabolic_demo",
    createdAt: NOW,
    updatedAt: NOW,
    closedAt: state === "abstained_for_review" ? NOW : null
  };
}

function idFactory(): () => string {
  let value = 1;
  return () => `00000000-0000-4000-8000-${String(value++).padStart(12, "0")}`;
}

function request(expectedStateVersion = 8) {
  return {
    proposal: {
      actionType: "create_programme_task" as const,
      roundId: ROUND_ID,
      patientId: "synthetic-maya",
      protocolResult,
      proposedBy: "deterministic_protocol" as const
    },
    confirmation: {
      confirmed: true as const,
      confirmedAt: NOW,
      confirmationKind: "explicit_patient_confirmation" as const
    },
    authorization: {
      authorized: true as const,
      actorKind: "patient" as const,
      actorId: "synthetic-session",
      scope: "programme_task:create" as const
    },
    expectedStateVersion,
    correlationId: "correlation-1"
  };
}

class FailFirstCommitRepository extends InMemoryHomeRoundsRepository<unknown, unknown> {
  private shouldFail = true;

  override async commitAction(input: CommitActionInput): Promise<CommitActionResult> {
    if (this.shouldFail) {
      this.shouldFail = false;
      throw new Error("injected transaction failure");
    }
    return super.commitAction(input);
  }
}

describe("audited action service", () => {
  it("keeps the executor allowlist closed to model and unknown proposals", () => {
    expect(
      ActionProposalSchema.safeParse({
        actionType: "send_email",
        roundId: ROUND_ID,
        patientId: "synthetic-maya",
        protocolResult,
        proposedBy: "model"
      }).success
    ).toBe(false);
    expect(
      ActionProposalSchema.safeParse({
        actionType: "create_programme_task",
        roundId: ROUND_ID,
        patientId: "synthetic-maya",
        protocolResult,
        proposedBy: "model"
      }).success
    ).toBe(false);
  });

  it("derives the same key for reordered evidence and a different key for incompatible input", () => {
    const first = deriveActionIdempotencyKey({
      roundId: ROUND_ID,
      patientId: "synthetic-maya",
      actionType: "create_programme_task",
      protocolResult
    });
    const reordered = deriveActionIdempotencyKey({
      roundId: ROUND_ID,
      patientId: "synthetic-maya",
      actionType: "create_programme_task",
      protocolResult: {
        ...protocolResult,
        matchedRuleIds: [...protocolResult.matchedRuleIds].reverse(),
        factIds: [...protocolResult.factIds].reverse()
      }
    });
    const changed = deriveActionIdempotencyKey({
      roundId: ROUND_ID,
      patientId: "synthetic-maya",
      actionType: "create_programme_task",
      protocolResult: { ...protocolResult, explanationKey: "different.reason" }
    });

    expect(reordered).toBe(first);
    expect(changed).not.toBe(first);
  });

  it("creates one task and audits every sequential duplicate attempt", async () => {
    const repository = new InMemoryHomeRoundsRepository<unknown, unknown>();
    await repository.createRound(round());
    const service = new ActionService({ repository, now: () => NOW, createId: idFactory() });

    const first = await service.execute(request());
    const second = await service.execute(request());
    expect(first.kind).toBe("programme_task");
    expect(second.kind).toBe("programme_task");
    if (first.kind !== "programme_task" || second.kind !== "programme_task") return;
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.task.id).toBe(first.task.id);
    expect(second.message.serviceWindowLabel).toMatch(/Demo-only/i);
    expect(await repository.listTasksForRound(ROUND_ID)).toHaveLength(1);
    expect(
      (await repository.listActionAttempts(first.task.idempotencyKey)).map(({ outcome }) => outcome)
    ).toEqual(["created", "duplicate"]);
    expect((await repository.listAuditEvents(ROUND_ID)).map(({ type }) => type)).toEqual([
      "programme_task_created",
      "programme_task_duplicate_suppressed"
    ]);
  });

  it("suppresses concurrent duplicate requests without parallel business state", async () => {
    const repository = new InMemoryHomeRoundsRepository<unknown, unknown>();
    await repository.createRound(round());
    const service = new ActionService({ repository, now: () => NOW, createId: idFactory() });

    const results = await Promise.all([service.execute(request()), service.execute(request())]);
    expect(results.map((result) => result.kind)).toEqual(["programme_task", "programme_task"]);
    expect(await repository.listTasksForRound(ROUND_ID)).toHaveLength(1);
    const task = (await repository.listTasksForRound(ROUND_ID))[0];
    expect(task).toBeDefined();
    expect(await repository.listActionAttempts(task?.idempotencyKey ?? "")).toHaveLength(2);
  });

  it("records an atomic failed attempt and succeeds on safe retry", async () => {
    const repository = new FailFirstCommitRepository();
    await repository.createRound(round());
    const service = new ActionService({ repository, now: () => NOW, createId: idFactory() });

    await expect(service.execute(request())).rejects.toMatchObject({
      code: "repository_commit_failed",
      retryable: true
    });
    expect(await repository.listTasksForRound(ROUND_ID)).toHaveLength(0);
    const key = deriveActionIdempotencyKey({
      roundId: ROUND_ID,
      patientId: "synthetic-maya",
      actionType: "create_programme_task",
      protocolResult
    });
    expect((await repository.listActionAttempts(key)).map(({ outcome }) => outcome)).toEqual([
      "failed"
    ]);
    expect((await repository.listAuditEvents(ROUND_ID)).map(({ type }) => type)).toEqual([
      "action_attempt_failed"
    ]);

    const retry = await service.execute(request());
    expect(retry).toMatchObject({ kind: "programme_task", created: true });
    expect(await repository.listTasksForRound(ROUND_ID)).toHaveLength(1);
    expect((await repository.listActionAttempts(key)).map(({ outcome }) => outcome)).toEqual([
      "failed",
      "created"
    ]);
  });

  it("rolls back all transaction records when both commit and failure-audit boundaries fail", async () => {
    const repository = new InMemoryHomeRoundsRepository<unknown, unknown>({
      beforeActionCommit: () => {
        throw new Error("injected final-boundary failure");
      }
    });
    await repository.createRound(round());
    const service = new ActionService({ repository, now: () => NOW, createId: idFactory() });

    await expect(service.execute(request())).rejects.toMatchObject({
      code: "failure_audit_failed"
    });
    expect(await repository.listTasksForRound(ROUND_ID)).toHaveLength(0);
    expect(await repository.listAuditEvents(ROUND_ID)).toHaveLength(0);
  });

  it("rejects stale state and missing explicit confirmation before repository mutation", async () => {
    const repository = new InMemoryHomeRoundsRepository<unknown, unknown>();
    await repository.createRound(round());
    const service = new ActionService({ repository, now: () => NOW, createId: idFactory() });

    await expect(service.execute(request(7))).rejects.toBeInstanceOf(ActionServiceError);
    await expect(
      service.execute({
        ...request(),
        confirmation: { ...request().confirmation, confirmed: false as true }
      })
    ).rejects.toThrow();
    expect(await repository.listTasksForRound(ROUND_ID)).toHaveLength(0);
  });
});
