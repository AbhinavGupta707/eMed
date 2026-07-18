import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import type {
  CompanionOperationRecord,
  CompanionPairingRecord,
  CompanionSessionRecord
} from "@homerounds/companion";
import type { ClinicalTask, DomainEvent, Round, VoiceBiomarkerFact } from "@homerounds/contracts";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { describe, expect, it } from "vitest";

import {
  SensitiveAuditPayloadError,
  TaskOptimisticConcurrencyError,
  type CommitActionInput
} from "../models";
import { PostgresCompanionPairingRepository } from "./companion-repository";
import { PostgresHomeRoundsRepository } from "./repository";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;
const databaseIt = databaseUrl ? it : it.skip;

function secureHash(byte: number): string {
  return Buffer.alloc(32, byte).toString("base64url");
}

function companionPairing(): CompanionPairingRecord {
  return {
    pairingId: "b1111111-1111-4111-8111-111111111111",
    tokenHash: secureHash(1),
    roundId: "14df34c4-8204-4810-8113-37b63c963a91",
    ownerPatientId: "synthetic-maya",
    role: "companion",
    roundStateVersion: 0,
    allowedTaskKinds: ["finger_pulse"],
    task: { taskId: "capture.finger_ppg.pulse", kind: "finger_pulse", taskVersion: 1 },
    taskPhase: "ready",
    consentRequirement: { kind: "explicit_local_capture", version: "local-v1" },
    status: "pending",
    pairingVersion: 1,
    issuedAt: "2026-07-17T08:00:01.000Z",
    tokenExpiresAt: "2026-07-17T08:05:01.000Z",
    exchangedAt: null,
    exchangeReplayUntil: null,
    exchangeKeyHash: null,
    deviceBindingHash: null,
    sessionId: null,
    sessionExpiresAt: null,
    lastResult: null,
    desktopAcknowledgedAt: null,
    revokedAt: null,
    replacedByPairingId: null
  };
}

function companionSession(pairing: CompanionPairingRecord): CompanionSessionRecord {
  return {
    sessionId: "b2222222-2222-4222-8222-222222222222",
    sessionTokenHash: secureHash(2),
    pairingId: pairing.pairingId,
    roundId: pairing.roundId,
    role: "companion",
    roundStateVersion: pairing.roundStateVersion,
    allowedTaskKinds: pairing.allowedTaskKinds,
    task: pairing.task,
    taskPhase: "ready",
    consentRequirement: pairing.consentRequirement,
    consentState: { status: "pending" },
    sessionVersion: 1,
    status: "active",
    createdAt: "2026-07-17T08:00:02.000Z",
    expiresAt: "2026-07-17T08:20:02.000Z",
    lastSeenAt: "2026-07-17T08:00:02.000Z",
    lastResult: null,
    revokedAt: null
  };
}

function round(): Round {
  return {
    id: "14df34c4-8204-4810-8113-37b63c963a91",
    patientId: "synthetic-maya",
    state: "action_pending",
    stateVersion: 0,
    purpose: "Fictional programme check-in",
    triggerId: `synthetic-postgres-${randomUUID()}`,
    burdenSecondsRemaining: 60,
    protocolId: "fictional-cardiometabolic-v1",
    createdAt: "2026-07-17T08:00:00.000Z",
    updatedAt: "2026-07-17T08:00:00.000Z",
    closedAt: null
  };
}

function event(eventId: string, type: string, correlationId: string): DomainEvent {
  return {
    eventId,
    type,
    schemaVersion: 1,
    occurredAt: "2026-07-17T08:10:00.000Z",
    actor: { kind: "system", id: "homerounds-deterministic-actions" },
    patientId: "synthetic-maya",
    roundId: "14df34c4-8204-4810-8113-37b63c963a91",
    correlationId,
    source: "system",
    payload: { fixture: true }
  };
}

function input(attempt: 1 | 2): CommitActionInput {
  const correlationId = `postgres-correlation-${attempt}`;
  const task: ClinicalTask = {
    id: "d714e580-4a3c-4360-af40-8e9520c44db6",
    roundId: "14df34c4-8204-4810-8113-37b63c963a91",
    patientId: "synthetic-maya",
    idempotencyKey: "programme-review:synthetic-maya:postgres",
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
  return {
    task,
    attempt: {
      id:
        attempt === 1
          ? "34a664fe-ec3d-4927-a14c-3f82d57f0055"
          : "a2575562-9d2c-4bea-8d8a-2f1dbb7e27c8",
      roundId: task.roundId,
      idempotencyKey: task.idempotencyKey,
      actionType: "create_programme_task",
      occurredAt: `2026-07-17T08:10:0${attempt}.000Z`,
      correlationId
    },
    createdEvent: event(
      attempt === 1
        ? "56e97030-ea84-43e6-9969-9d36a61392dd"
        : "755f1ded-09cf-459b-8a1c-c3462362d007",
      "programme_task_created",
      correlationId
    ),
    duplicateEvent: event(
      attempt === 1
        ? "b3d680e5-b8db-4a93-a04a-66c0e061c21b"
        : "d28c6947-6aad-4c49-a500-e4b10dd468a2",
      "programme_task_duplicate_suppressed",
      correlationId
    )
  };
}

describe("PostgreSQL repository integration", () => {
  databaseIt(
    "applies the migration and verifies atomic idempotency [skipped when DATABASE_URL is absent]",
    async () => {
      if (!databaseUrl) throw new Error("DATABASE_URL unexpectedly absent.");
      const client = postgres(databaseUrl, { max: 1, prepare: true });
      const schemaName = `homerounds_test_${randomUUID().replaceAll("-", "")}`;
      const quotedSchema = `"${schemaName}"`;
      try {
        await client.unsafe(`create schema ${quotedSchema}`);
        await client.unsafe(`set search_path to ${quotedSchema}`);
        const migration = await readFile(
          new URL(
            "../../../../infra/db/migrations/0001_homerounds_foundations.sql",
            import.meta.url
          ),
          "utf8"
        );
        await client.unsafe(migration);
        const voiceMigration = await readFile(
          new URL(
            "../../../../infra/db/migrations/0002_voice_biomarker_facts.sql",
            import.meta.url
          ),
          "utf8"
        );
        await client.unsafe(voiceMigration);
        const companionMigration = await readFile(
          new URL("../../../../infra/db/migrations/0003_companion_sessions.sql", import.meta.url),
          "utf8"
        );
        await client.unsafe(companionMigration);
        const companionIntegrityMigration = await readFile(
          new URL(
            "../../../../infra/db/migrations/0004_companion_record_integrity.sql",
            import.meta.url
          ),
          "utf8"
        );
        await client.unsafe(companionIntegrityMigration);

        const repository = new PostgresHomeRoundsRepository<unknown, unknown>(
          drizzle(client, { schema })
        );
        await repository.createRound(round());

        const companionRepository = new PostgresCompanionPairingRepository(client);
        const pairing = companionPairing();
        const session = companionSession(pairing);
        await companionRepository.createPairing(pairing);
        await expect(
          companionRepository.getCurrentPairingForRound(pairing.roundId)
        ).resolves.toEqual(pairing);
        const exchangeCommit = {
          tokenHash: pairing.tokenHash,
          expectedPairingVersion: pairing.pairingVersion,
          exchangeKeyHash: secureHash(3),
          deviceBindingHash: secureHash(4),
          exchangedAt: "2026-07-17T08:00:02.000Z",
          exchangeReplayUntil: "2026-07-17T08:00:32.000Z",
          session
        };
        const firstExchange = await companionRepository.exchange(exchangeCommit);
        const replayedExchange = await companionRepository.exchange(exchangeCommit);
        expect(firstExchange.replayed).toBe(false);
        expect(replayedExchange.replayed).toBe(true);
        expect(replayedExchange.session).toEqual(session);

        const nextSession: CompanionSessionRecord = {
          ...session,
          taskPhase: "permission",
          sessionVersion: 2,
          lastSeenAt: "2026-07-17T08:00:03.000Z"
        };
        const operation: CompanionOperationRecord = {
          operationId: "b3333333-3333-4333-8333-333333333333",
          sessionId: session.sessionId,
          kind: "status",
          requestFingerprint: secureHash(5),
          committedSessionVersion: 2,
          resultId: null,
          occurredAt: "2026-07-17T08:00:03.000Z"
        };
        const companionMutation = {
          expectedSessionVersion: 1,
          nextSession,
          operation,
          result: null
        };
        const mutationResults = await Promise.all([
          companionRepository.commitSessionMutation(companionMutation),
          companionRepository.commitSessionMutation(companionMutation)
        ]);
        expect(mutationResults.map(({ replayed }) => replayed).sort()).toEqual([false, true]);
        await expect(companionRepository.getSession(session.sessionId)).resolves.toEqual(
          nextSession
        );

        const voiceFact: VoiceBiomarkerFact = {
          factId: "fb99983d-cc81-454e-9c92-f8e99e0891de",
          roundId: "14df34c4-8204-4810-8113-37b63c963a91",
          assessmentSessionId: "45906cff-34ea-4a86-a0c0-05967adb20c4",
          provider: "local_voice_features",
          observedAt: "2026-07-17T08:09:00.000Z",
          durationMs: 8_000,
          algorithmVersion: "local-voice-features.v1",
          features: {
            medianFundamentalFrequencyHz: 182,
            pitchVariabilitySemitones: 1.4,
            jitterPercent: 1.1,
            shimmerPercent: 3.2,
            harmonicToNoiseRatioDb: 18.5,
            phonationDurationMs: 8_000
          },
          quality: {
            status: "pass",
            score: 0.91,
            reasons: [],
            metrics: {
              sampleRateHz: 48_000,
              durationMs: 8_000,
              clippingFraction: 0.002,
              voicedFraction: 0.88,
              estimatedSnrDb: 24
            }
          },
          researchOnly: true,
          rawMediaRef: null
        };
        await repository.saveVoiceBiomarkerFact({
          roundId: voiceFact.roundId,
          patientId: "synthetic-maya",
          fact: voiceFact
        });
        await expect(repository.listVoiceBiomarkerFacts(voiceFact.roundId)).resolves.toEqual([
          { roundId: voiceFact.roundId, patientId: "synthetic-maya", fact: voiceFact }
        ]);
        const results = await Promise.all([
          repository.commitAction(input(1)),
          repository.commitAction(input(2))
        ]);

        expect(results.map((result) => result.created).sort()).toEqual([false, true]);
        await expect(
          repository.listTasksForRound("14df34c4-8204-4810-8113-37b63c963a91")
        ).resolves.toHaveLength(1);
        await expect(
          repository.listActionAttempts("programme-review:synthetic-maya:postgres")
        ).resolves.toHaveLength(2);

        const persistedTask = results.find(({ created }) => created)?.task;
        if (!persistedTask) throw new Error("Expected the first action to create the task.");
        const clinicianEvent = event(
          "f06a55ff-6572-48d0-809f-ddaf53940526",
          "clinician_save_note",
          "postgres-clinician-note"
        );
        clinicianEvent.actor = { kind: "clinician", id: "synthetic-clinician" };
        clinicianEvent.source = "clinician_ui";
        clinicianEvent.payload = {
          kind: "save_note",
          taskId: persistedTask.id,
          operationKey: "clinician:postgres:save-note:0001",
          syntheticDataOnly: true
        };
        const clinicianMutation = {
          task: {
            ...persistedTask,
            updatedAt: "2026-07-17T08:11:00.000Z"
          },
          expectedTaskUpdatedAt: persistedTask.updatedAt,
          event: clinicianEvent
        };
        const firstClinicianMutation = await repository.commitClinicianMutation(clinicianMutation);
        const duplicateClinicianMutation =
          await repository.commitClinicianMutation(clinicianMutation);
        expect(firstClinicianMutation.created).toBe(true);
        expect(duplicateClinicianMutation.created).toBe(false);
        await expect(repository.getTask(persistedTask.id)).resolves.toMatchObject({
          updatedAt: "2026-07-17T08:11:00.000Z"
        });
        await expect(
          repository.commitClinicianMutation({
            ...clinicianMutation,
            event: event(
              "5cab8941-68e4-497f-baa2-5f9ae878ff3d",
              "clinician_record_contact",
              "postgres-clinician-stale"
            )
          })
        ).rejects.toBeInstanceOf(TaskOptimisticConcurrencyError);
        await expect(
          client.unsafe(
            "update audit_events set type = 'forbidden_mutation' where event_id = '56e97030-ea84-43e6-9969-9d36a61392dd'"
          )
        ).rejects.toThrow("audit_events are append-only");

        const sensitiveEvent = event(
          "f6a2d51a-e2ac-40e6-a9c0-b87abdbeb5b7",
          "synthetic_privacy_probe",
          "postgres-sensitive-audit"
        );
        sensitiveEvent.payload = { nested: { transcript: "forbidden" } };
        await expect(repository.appendAuditEvent(sensitiveEvent)).rejects.toBeInstanceOf(
          SensitiveAuditPayloadError
        );
      } finally {
        await client.unsafe("set search_path to public");
        await client.unsafe(`drop schema if exists ${quotedSchema} cascade`);
        await client.end({ timeout: 5 });
      }
    },
    30_000
  );
});
