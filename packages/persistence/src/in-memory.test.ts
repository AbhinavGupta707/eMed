import type { ClinicalTask, DomainEvent, MeasurementFact, Round } from "@homerounds/contracts";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { InMemoryHomeRoundsRepository } from "./in-memory";
import {
  OptimisticConcurrencyError,
  SensitiveAuditPayloadError,
  type CommitActionInput
} from "./models";

const roundId = "14df34c4-8204-4810-8113-37b63c963a91";
const taskId = "d714e580-4a3c-4360-af40-8e9520c44db6";
const idempotencyKey = "programme-review:synthetic-maya:round-001";

function makeRound(): Round {
  return {
    id: roundId,
    patientId: "synthetic-maya",
    state: "invited",
    stateVersion: 0,
    purpose: "Fictional programme check-in",
    triggerId: "synthetic-trigger-001",
    burdenSecondsRemaining: 180,
    protocolId: "fictional-cardiometabolic-v1",
    createdAt: "2026-07-17T08:00:00.000Z",
    updatedAt: "2026-07-17T08:00:00.000Z",
    closedAt: null
  };
}

function makeTask(): ClinicalTask {
  return {
    id: taskId,
    roundId,
    patientId: "synthetic-maya",
    idempotencyKey,
    type: "programme_review",
    ownerRole: "programme_clinician",
    priority: "priority",
    reasonKey: "fictional_protocol_review",
    status: "open",
    serviceWindowLabel: "Demo programme review window",
    protocolId: "fictional-cardiometabolic-v1",
    createdAt: "2026-07-17T08:10:00.000Z",
    updatedAt: "2026-07-17T08:10:00.000Z"
  };
}

function makeEvent(eventId: string, type: string, correlationId: string): DomainEvent {
  return {
    eventId,
    type,
    schemaVersion: 1,
    occurredAt: "2026-07-17T08:10:00.000Z",
    actor: { kind: "system", id: "homerounds-deterministic-actions" },
    patientId: "synthetic-maya",
    roundId,
    correlationId,
    source: "system",
    payload: { taskId }
  };
}

function roundStateEvent(): DomainEvent & {
  type: "round_state_changed";
  payload: {
    before: "invited";
    after: "red_flag_screen";
    beforeVersion: 0;
    afterVersion: 1;
  };
} {
  return {
    ...makeEvent(
      "3f028d5d-879b-4d35-8787-dff382682b4f",
      "round_state_changed",
      "synthetic-round-transition"
    ),
    type: "round_state_changed",
    payload: {
      before: "invited",
      after: "red_flag_screen",
      beforeVersion: 0,
      afterVersion: 1
    }
  };
}

function actionInput(sequence: 1 | 2): CommitActionInput {
  const correlationId = `synthetic-correlation-${sequence}`;
  return {
    task: makeTask(),
    attempt: {
      id:
        sequence === 1
          ? "34a664fe-ec3d-4927-a14c-3f82d57f0055"
          : "a2575562-9d2c-4bea-8d8a-2f1dbb7e27c8",
      roundId,
      idempotencyKey,
      actionType: "create_programme_task",
      occurredAt: `2026-07-17T08:10:0${sequence}.000Z`,
      correlationId
    },
    createdEvent: makeEvent(
      sequence === 1
        ? "56e97030-ea84-43e6-9969-9d36a61392dd"
        : "755f1ded-09cf-459b-8a1c-c3462362d007",
      "programme_task_created",
      correlationId
    ),
    duplicateEvent: makeEvent(
      sequence === 1
        ? "b3d680e5-b8db-4a93-a04a-66c0e061c21b"
        : "d28c6947-6aad-4c49-a500-e4b10dd468a2",
      "programme_task_duplicate_suppressed",
      correlationId
    )
  };
}

describe("in-memory repository reference behavior", () => {
  it("enforces optimistic round versioning", async () => {
    const repository = new InMemoryHomeRoundsRepository<unknown, unknown>();
    const initial = makeRound();
    await repository.createRound(initial);
    await repository.updateRoundWithAudit(
      {
        ...initial,
        state: "red_flag_screen",
        stateVersion: 1,
        updatedAt: "2026-07-17T08:01:00.000Z"
      },
      0,
      roundStateEvent()
    );

    await expect(
      repository.updateRoundWithAudit(
        {
          ...initial,
          state: "collecting_report",
          stateVersion: 1,
          updatedAt: "2026-07-17T08:02:00.000Z"
        },
        0,
        roundStateEvent()
      )
    ).rejects.toBeInstanceOf(OptimisticConcurrencyError);
    await expect(repository.getRound(roundId)).resolves.toMatchObject({
      state: "red_flag_screen",
      stateVersion: 1
    });
    await expect(repository.listAuditEvents(roundId)).resolves.toMatchObject([
      { type: "round_state_changed", payload: { before: "invited", after: "red_flag_screen" } }
    ]);
  });

  it("rolls back a round update when the paired audit insert cannot commit", async () => {
    const repository = new InMemoryHomeRoundsRepository<unknown, unknown>();
    const stateEvent = roundStateEvent();
    await repository.createRound(makeRound());
    await repository.appendAuditEvent({ ...stateEvent, type: "synthetic_audit_id_collision" });

    await expect(
      repository.updateRoundWithAudit(
        {
          ...makeRound(),
          state: "red_flag_screen",
          stateVersion: 1,
          updatedAt: "2026-07-17T08:01:00.000Z"
        },
        0,
        stateEvent
      )
    ).rejects.toThrow("already exists");
    await expect(repository.getRound(roundId)).resolves.toMatchObject({
      state: "invited",
      stateVersion: 0
    });
  });

  it("validates and stores normalized snapshots and facts with injected codecs", async () => {
    const snapshotSchema = z.object({
      status: z.literal("synthetic"),
      issues: z.array(z.string())
    });
    const factSchema = z.object({ code: z.string(), value: z.number().nullable() });
    type Snapshot = z.infer<typeof snapshotSchema>;
    type Fact = z.infer<typeof factSchema>;
    const repository = new InMemoryHomeRoundsRepository<Snapshot, Fact>();
    const snapshotId = "27ada55d-39fd-4825-a97d-d9212bfcdaf7";

    await repository.saveClinicalSnapshot(
      {
        snapshotId,
        patientId: "synthetic-maya",
        snapshotVersion: 1,
        asOf: "2026-07-17T08:00:00.000Z",
        document: { status: "synthetic", issues: ["missing-medication"] }
      },
      snapshotSchema
    );
    await repository.saveClinicalFact(
      {
        snapshotId,
        factId: "Observation/pulse-missing",
        patientId: "synthetic-maya",
        kind: "observation",
        observedAt: null,
        fact: { code: "8867-4", value: null },
        provenance: { status: "missing" }
      },
      factSchema
    );

    await expect(
      repository.getLatestClinicalSnapshot("synthetic-maya", snapshotSchema)
    ).resolves.toMatchObject({ snapshotVersion: 1, document: { issues: ["missing-medication"] } });
    await expect(repository.listClinicalFacts(snapshotId, factSchema)).resolves.toMatchObject([
      { fact: { code: "8867-4", value: null }, provenance: { status: "missing" } }
    ]);
    await expect(
      repository.saveClinicalFact(
        {
          snapshotId,
          factId: "Observation/invalid",
          patientId: "synthetic-maya",
          kind: "observation",
          observedAt: null,
          fact: { code: "8867-4", value: "invented-default" } as unknown as Fact,
          provenance: {}
        },
        factSchema
      )
    ).rejects.toThrow();
  });

  it("stores only frozen-contract passing measurement facts and never raw media", async () => {
    const repository = new InMemoryHomeRoundsRepository<unknown, unknown>();
    const fact: MeasurementFact = {
      factId: "c0391381-6164-4f98-a66d-6b9ce8d94b3c",
      assessmentSessionId: "2e8c567a-c890-4aa2-a1ec-e3f0df439899",
      provider: "finger_ppg",
      value: 72,
      unit: "bpm",
      observedAt: "2026-07-17T08:09:00.000Z",
      durationMs: 20_000,
      algorithmVersion: "synthetic-fixture-v1",
      providerModelVersion: null,
      quality: { status: "pass", score: 0.92, reasons: [], metrics: { snr: 8 } },
      rawMediaRef: null
    };
    await repository.saveMeasurementFact({
      roundId,
      patientId: "synthetic-maya",
      fact
    });

    await expect(repository.listMeasurementFacts(roundId)).resolves.toEqual([
      { roundId, patientId: "synthetic-maya", fact }
    ]);
    const invalid = {
      roundId,
      patientId: "synthetic-maya",
      fact: { ...fact, quality: { ...fact.quality, status: "fail" } }
    };
    await expect(
      repository.saveMeasurementFact(
        invalid as unknown as Parameters<typeof repository.saveMeasurementFact>[0]
      )
    ).rejects.toThrow();
  });

  it("creates one task under concurrent duplicate action requests and audits both attempts", async () => {
    const repository = new InMemoryHomeRoundsRepository<unknown, unknown>();
    await repository.createRound(makeRound());

    const results = await Promise.all([
      repository.commitAction(actionInput(1)),
      repository.commitAction(actionInput(2))
    ]);

    expect(results.map((result) => result.created).sort()).toEqual([false, true]);
    await expect(repository.listTasksForRound(roundId)).resolves.toHaveLength(1);
    await expect(repository.listActionAttempts(idempotencyKey)).resolves.toMatchObject([
      { outcome: "created" },
      { outcome: "duplicate" }
    ]);
    await expect(repository.listAuditEvents(roundId)).resolves.toHaveLength(2);
  });

  it("rolls back task, attempt, and audit together when commit fails", async () => {
    const repository = new InMemoryHomeRoundsRepository<unknown, unknown>({
      beforeActionCommit: () => {
        throw new Error("synthetic transaction failure");
      }
    });
    await repository.createRound(makeRound());

    await expect(repository.commitAction(actionInput(1))).rejects.toThrow(
      "synthetic transaction failure"
    );
    await expect(repository.listTasksForRound(roundId)).resolves.toEqual([]);
    await expect(repository.listActionAttempts(idempotencyKey)).resolves.toEqual([]);
    await expect(repository.listAuditEvents(roundId)).resolves.toEqual([]);
  });

  it("records a failed attempt with its audit and permits a safe retry", async () => {
    const repository = new InMemoryHomeRoundsRepository<unknown, unknown>();
    await repository.createRound(makeRound());
    const first = actionInput(1);
    await repository.recordFailedAction({
      attempt: first.attempt,
      errorCode: "synthetic_executor_failure",
      failureEvent: makeEvent(
        "d34dd0c1-345e-40db-9f7e-e74d8925da9e",
        "action_attempt_failed",
        first.attempt.correlationId
      )
    });

    await expect(repository.commitAction(actionInput(2))).resolves.toMatchObject({ created: true });
    await expect(repository.listActionAttempts(idempotencyKey)).resolves.toMatchObject([
      { outcome: "failed", errorCode: "synthetic_executor_failure" },
      { outcome: "created", errorCode: null }
    ]);
    await expect(repository.listTasksForRound(roundId)).resolves.toHaveLength(1);
    await expect(repository.listAuditEvents(roundId)).resolves.toHaveLength(2);
  });

  it("keeps audit events append-only through the repository surface", async () => {
    const repository = new InMemoryHomeRoundsRepository<unknown, unknown>();
    const event = makeEvent(
      "56e97030-ea84-43e6-9969-9d36a61392dd",
      "round_created",
      "synthetic-correlation-audit"
    );
    await repository.appendAuditEvent(event);
    event.payload.taskId = "mutated-outside-repository";

    const persisted = await repository.listAuditEvents(roundId);
    expect(persisted[0]?.payload.taskId).toBe(taskId);
    await expect(repository.appendAuditEvent(persisted[0]!)).rejects.toThrow("already exists");
    await expect(repository.appendAuditEvent(roundStateEvent())).rejects.toThrow(
      "transactional repository method"
    );
  });

  it("rejects sensitive standalone audit payloads while permitting explicit absence flags", async () => {
    const repository = new InMemoryHomeRoundsRepository<unknown, unknown>();
    const safeEvent = makeEvent(
      "56e97030-ea84-43e6-9969-9d36a61392de",
      "capture_quality_rejected",
      "synthetic-correlation-safe-audit"
    );
    safeEvent.payload = { rawMediaStored: false, quality: { score: 0.1 } };
    await expect(repository.appendAuditEvent(safeEvent)).resolves.toBeUndefined();

    const sensitiveEvent = makeEvent(
      "56e97030-ea84-43e6-9969-9d36a61392df",
      "synthetic_privacy_probe",
      "synthetic-correlation-sensitive-audit"
    );
    sensitiveEvent.payload = { nested: [{ rawFrame: "forbidden" }] };
    await expect(repository.appendAuditEvent(sensitiveEvent)).rejects.toBeInstanceOf(
      SensitiveAuditPayloadError
    );
    await expect(repository.listAuditEvents(roundId)).resolves.toHaveLength(1);
  });
});
