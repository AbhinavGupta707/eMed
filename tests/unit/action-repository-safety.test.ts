import {
  ActionService,
  deriveActionIdempotencyKey,
  type ExecuteActionInput
} from "../../packages/actions/src/index";
import { safeLogEntry } from "../../packages/audit/src/index";
import {
  DomainEventSchema,
  MeasurementFactSchema,
  type DomainEvent,
  type ProtocolResult,
  type Round
} from "../../packages/contracts/src/index";
import {
  DuplicateRecordError,
  InMemoryHomeRoundsRepository,
  ReservedAuditEventError
} from "../../packages/persistence/src/index";
import { describe, expect, it } from "vitest";

const NOW = "2026-07-17T12:00:00.000Z";
const ROUND_ID = "30000000-0000-4000-8000-000000000001";
const FACT_ID = "30000000-0000-4000-8000-000000000002";
const SESSION_ID = "30000000-0000-4000-8000-000000000003";

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

function round(): Round {
  return {
    id: ROUND_ID,
    patientId: "synthetic-maya",
    state: "action_pending",
    stateVersion: 7,
    purpose: "Synthetic adversarial action round",
    triggerId: "homerounds-test:action-concurrency",
    burdenSecondsRemaining: 60,
    protocolId: "cardiometabolic_demo",
    createdAt: NOW,
    updatedAt: NOW,
    closedAt: null
  };
}

function idFactory(): () => string {
  let value = 1;
  return () => `30000000-0000-4000-8000-${String(value++).padStart(12, "0")}`;
}

function request(correlationId: string, expectedStateVersion = 7): ExecuteActionInput {
  return {
    proposal: {
      actionType: "create_programme_task",
      roundId: ROUND_ID,
      patientId: "synthetic-maya",
      protocolResult,
      proposedBy: "deterministic_protocol"
    },
    confirmation: {
      confirmed: true,
      confirmedAt: NOW,
      confirmationKind: "explicit_patient_confirmation"
    },
    authorization: {
      authorized: true,
      actorKind: "patient",
      actorId: "synthetic-session",
      scope: "programme_task:create"
    },
    expectedStateVersion,
    correlationId
  };
}

function standaloneEvent(overrides: Partial<DomainEvent> = {}): DomainEvent {
  return DomainEventSchema.parse({
    eventId: "30000000-0000-4000-8000-000000000090",
    type: "synthetic_evidence_observed",
    schemaVersion: 1,
    occurredAt: NOW,
    actor: { kind: "system", id: "unit-test" },
    patientId: "synthetic-maya",
    roundId: ROUND_ID,
    correlationId: "audit-correlation",
    source: "system",
    payload: { status: "original" },
    ...overrides
  });
}

describe("action and repository safety", () => {
  it("creates one task under adversarial concurrency and rejects a stale replay", async () => {
    const repository = new InMemoryHomeRoundsRepository<unknown, unknown>();
    await repository.createRound(round());
    const service = new ActionService({ repository, now: () => NOW, createId: idFactory() });

    const results = await Promise.all(
      Array.from({ length: 12 }, (_, index) => service.execute(request(`concurrent-${index}`)))
    );
    const tasks = await repository.listTasksForRound(ROUND_ID);
    expect(tasks).toHaveLength(1);
    expect(
      results.filter((result) => result.kind === "programme_task" && result.created)
    ).toHaveLength(1);
    const key = deriveActionIdempotencyKey({
      roundId: ROUND_ID,
      patientId: "synthetic-maya",
      actionType: "create_programme_task",
      protocolResult
    });
    expect(await repository.listActionAttempts(key)).toHaveLength(12);
    expect(await repository.listAuditEvents(ROUND_ID)).toHaveLength(12);

    await expect(service.execute(request("stale-replay", 6))).rejects.toMatchObject({
      code: "stale_state"
    });
    expect(await repository.listActionAttempts(key)).toHaveLength(12);
  });

  it("rolls back task, attempt, and audit when the final transaction boundary fails", async () => {
    const repository = new InMemoryHomeRoundsRepository<unknown, unknown>({
      beforeActionCommit: () => {
        throw new Error("injected final-boundary failure");
      }
    });
    await repository.createRound(round());
    const service = new ActionService({ repository, now: () => NOW, createId: idFactory() });
    const key = deriveActionIdempotencyKey({
      roundId: ROUND_ID,
      patientId: "synthetic-maya",
      actionType: "create_programme_task",
      protocolResult
    });

    await expect(service.execute(request("rollback"))).rejects.toMatchObject({
      code: "failure_audit_failed",
      retryable: true
    });
    expect(await repository.listTasksForRound(ROUND_ID)).toHaveLength(0);
    expect(await repository.listActionAttempts(key)).toHaveLength(0);
    expect(await repository.listAuditEvents(ROUND_ID)).toHaveLength(0);
  });

  it("keeps audit records append-only and isolated from returned-object mutation", async () => {
    const repository = new InMemoryHomeRoundsRepository<unknown, unknown>();
    const event = standaloneEvent();
    await repository.appendAuditEvent(event);

    const returned = await repository.listAuditEvents(ROUND_ID);
    expect(returned).toHaveLength(1);
    if (!returned[0]) throw new Error("Expected the persisted audit event.");
    returned[0].payload.status = "tampered";
    expect((await repository.listAuditEvents(ROUND_ID))[0]?.payload.status).toBe("original");
    await expect(repository.appendAuditEvent(event)).rejects.toBeInstanceOf(DuplicateRecordError);
    await expect(
      repository.appendAuditEvent(
        standaloneEvent({
          eventId: "30000000-0000-4000-8000-000000000091",
          type: "round_state_changed",
          payload: {
            before: "invited",
            after: "red_flag_screen",
            beforeVersion: 0,
            afterVersion: 1
          }
        })
      )
    ).rejects.toBeInstanceOf(ReservedAuditEventError);
    expect("deleteAuditEvent" in repository).toBe(false);
    expect("updateAuditEvent" in repository).toBe(false);
  });

  it("strips uncontracted frame fields and redacts transcript and secret canaries from logs", async () => {
    const repository = new InMemoryHomeRoundsRepository<unknown, unknown>();
    const fact = MeasurementFactSchema.parse({
      factId: FACT_ID,
      assessmentSessionId: SESSION_ID,
      provider: "finger_ppg",
      value: 72,
      unit: "bpm",
      observedAt: NOW,
      durationMs: 30_000,
      algorithmVersion: "synthetic_fixture_v1",
      providerModelVersion: null,
      quality: { status: "pass", score: 0.95, reasons: [], metrics: {} },
      rawMediaRef: null,
      rawFrames: "RAW_FRAME_CANARY"
    });
    await repository.saveMeasurementFact({
      roundId: ROUND_ID,
      patientId: "synthetic-maya",
      fact
    });
    expect(JSON.stringify(await repository.listMeasurementFacts(ROUND_ID))).not.toContain(
      "RAW_FRAME_CANARY"
    );
    expect(
      MeasurementFactSchema.safeParse({ ...fact, rawMediaRef: "camera://raw-frame" }).success
    ).toBe(false);

    const log = safeLogEntry({
      level: "warn",
      event: "synthetic_privacy_probe",
      correlationId: "privacy-correlation",
      fields: {
        transcript: "TRANSCRIPT_CANARY",
        nested: { apiKey: "SECRET_CANARY", frameBytes: "FRAME_BYTES_CANARY" }
      }
    });
    const serialized = JSON.stringify(log);
    expect(serialized).not.toContain("TRANSCRIPT_CANARY");
    expect(serialized).not.toContain("SECRET_CANARY");
    expect(serialized).not.toContain("FRAME_BYTES_CANARY");
    expect(serialized.match(/\[REDACTED\]/g)).toHaveLength(3);
  });

  it("rejects raw transcript, frame, and secret payloads at the persistence boundary", async () => {
    const repository = new InMemoryHomeRoundsRepository<unknown, unknown>();
    const sensitiveEvents = [
      standaloneEvent({
        eventId: "30000000-0000-4000-8000-000000000101",
        payload: { transcript: "TRANSCRIPT_PERSISTENCE_CANARY" }
      }),
      standaloneEvent({
        eventId: "30000000-0000-4000-8000-000000000102",
        payload: { rawFrame: "RAW_FRAME_PERSISTENCE_CANARY" }
      }),
      standaloneEvent({
        eventId: "30000000-0000-4000-8000-000000000103",
        payload: { apiKey: "SECRET_PERSISTENCE_CANARY" }
      })
    ];

    const persistenceResults = await Promise.allSettled(
      sensitiveEvents.map((event) => repository.appendAuditEvent(event))
    );
    expect(persistenceResults.map(({ status }) => status)).toEqual([
      "rejected",
      "rejected",
      "rejected"
    ]);
    expect(await repository.listAuditEvents(ROUND_ID)).toHaveLength(0);
  });
});
