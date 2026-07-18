import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { CareActionAuthoritySchema, SyntheticCareActionService } from "@homerounds/actions";
import {
  applyStructuredMemoryMutation,
  createEmptyStructuredMemoryStore,
  setStructuredMemoryConsent
} from "@homerounds/personalization";
import postgres from "postgres";
import { describe, expect, it } from "vitest";

import {
  PostgresCareActionRepository,
  PostgresStructuredMemoryRepository,
  PostgresTriggerProposalRepository
} from "./final-pass-repositories";
import { readSyntheticTriggerSeed } from "./triggers/demo-seed";
import { TriggerServerService } from "./triggers/service";

const databaseUrl = process.env.DATABASE_URL;
const databaseIt = databaseUrl ? it : it.skip;
const NOW = "2026-07-18T12:00:00.000Z";
const ROUND_ID = "a1111111-1111-4111-8111-111111111111";

function idFactory(): () => string {
  let value = 1;
  return () => `a0000000-0000-4000-8000-${String(value++).padStart(12, "0")}`;
}

async function applyMigrations(client: ReturnType<typeof postgres>): Promise<void> {
  for (const name of [
    "0001_homerounds_foundations.sql",
    "0002_voice_biomarker_facts.sql",
    "0003_companion_sessions.sql",
    "0004_companion_record_integrity.sql",
    "0005_baseline_personalization.sql",
    "0006_proactive_memory_care_actions.sql"
  ]) {
    const sql = await readFile(
      new URL(`../../../../infra/db/migrations/${name}`, import.meta.url),
      "utf8"
    );
    await client.unsafe(sql);
  }
}

describe("Checkpoint 11 durable repository integration", () => {
  databaseIt(
    "persists idempotent trigger, consented memory, and concurrent-safe care action state",
    async () => {
      if (!databaseUrl) throw new Error("DATABASE_URL unexpectedly absent.");
      const client = postgres(databaseUrl, { max: 1, prepare: true });
      const schemaName = `homerounds_cp11_${randomUUID().replaceAll("-", "")}`;
      const quotedSchema = `"${schemaName}"`;
      try {
        await client.unsafe(`create schema ${quotedSchema}`);
        await client.unsafe(`set search_path to ${quotedSchema}`);
        await applyMigrations(client);
        await client`
          insert into rounds (
            id, patient_id, state, state_version, purpose, trigger_id,
            burden_seconds_remaining, protocol_id, created_at, updated_at, closed_at
          ) values (
            ${ROUND_ID}, 'synthetic-maya', 'awaiting_clinician', 4,
            'Synthetic final-pass repository verification',
            'final-pass-postgres-integration', 0, 'cardiometabolic_demo',
            ${NOW}, ${NOW}, null
          )
        `;

        const triggerRepository = new PostgresTriggerProposalRepository(client);
        const triggerService = new TriggerServerService({
          repository: triggerRepository,
          clock: { now: () => NOW }
        });
        const seed = readSyntheticTriggerSeed();
        const [firstTrigger, duplicateTrigger] = await Promise.all([
          triggerService.evaluateBounded(seed.evaluation),
          triggerService.evaluateBounded(seed.evaluation)
        ]);
        expect([firstTrigger.replayed, duplicateTrigger.replayed].sort()).toEqual([false, true]);

        const memoryRepository = new PostgresStructuredMemoryRepository(client);
        const empty = createEmptyStructuredMemoryStore({ patientId: "synthetic-maya", now: NOW });
        await memoryRepository.saveStore(empty, null);
        const consented = setStructuredMemoryConsent({
          store: empty,
          consent: {
            status: "granted",
            policyVersion: "structured-memory-consent-v1",
            decisionId: "a2222222-2222-4222-8222-222222222222",
            decidedAt: NOW
          },
          expectedStoreVersion: 1,
          mutationId: "a3333333-3333-4333-8333-333333333333",
          now: NOW
        });
        await memoryRepository.saveStore(consented, 1);
        const remembered = applyStructuredMemoryMutation(consented, {
          operation: "set",
          mutationId: "a4444444-4444-4444-8444-444444444444",
          expectedStoreVersion: 2,
          memoryId: "a5555555-5555-4555-8555-555555555555",
          key: "round_device",
          value: { kind: "code", code: "phone" },
          source: {
            schemaVersion: "structured-memory-source.v1",
            kind: "patient_confirmation",
            sourceId: "cp11-confirmed-device",
            confirmationId: "a6666666-6666-4666-8666-666666666666",
            sourceTimestamp: NOW,
            recordedAt: NOW,
            structuredOnly: true,
            transcriptStored: false,
            rawMediaStored: false,
            promptStored: false,
            providerPayloadStored: false
          },
          occurredAt: NOW
        });
        await memoryRepository.saveStore(remembered, 2);
        await expect(memoryRepository.getStore("synthetic-maya")).resolves.toEqual(remembered);

        const careRepository = new PostgresCareActionRepository(client);
        await careRepository.setAuthority(
          CareActionAuthoritySchema.parse({
            roundId: ROUND_ID,
            patientId: "synthetic-maya",
            roundVersion: 4,
            roundState: "awaiting_clinician",
            redFlagGate: "clear",
            eligibleActions: ["synthetic_care_team_message"],
            evidence: {
              summary:
                "The deterministic workflow requested review of confirmed structured evidence.",
              protocolId: "cardiometabolic_demo",
              protocolVersion: "1.0.0",
              protocolOutcome: "programme_review_requested",
              sourceFactIds: [],
              captureQuality: "unknown",
              measurementState: "unknown",
              redFlagGate: "clear",
              generatedAt: NOW,
              rawTranscriptStored: false,
              modelReasoningStored: false,
              rawMediaStored: false
            }
          })
        );
        const careService = new SyntheticCareActionService({
          repository: careRepository,
          now: () => NOW,
          createId: idFactory()
        });
        const input = {
          roundId: ROUND_ID,
          patientId: "synthetic-maya",
          details: {
            kind: "synthetic_care_team_message" as const,
            topic: "symptoms" as const,
            confirmedSummary: "Please review my confirmed structured check-in."
          },
          confirmation: {
            confirmed: true as const,
            confirmedAt: NOW,
            confirmationKind: "explicit_patient_confirmation" as const,
            confirmationVersion: "care-action-confirmation-v1" as const,
            reviewedFields: ["action_kind", "confirmed_summary", "synthetic_boundary", "topic"],
            syntheticBoundaryAccepted: true as const
          },
          authorization: {
            authorized: true as const,
            actorKind: "patient" as const,
            actorId: "synthetic-session",
            patientId: "synthetic-maya",
            scope: "synthetic_care_action:create" as const
          },
          expectedRoundVersion: 4,
          operationKey: `patient-care:${ROUND_ID}:synthetic_care_team_message`,
          correlationId: "cp11-postgres-care-action"
        };
        const [firstAction, duplicateAction] = await Promise.all([
          careService.submit(input),
          careService.submit(input)
        ]);
        expect([firstAction.created, duplicateAction.created].sort()).toEqual([false, true]);
        expect(firstAction.action.id).toBe(duplicateAction.action.id);
        expect(await careRepository.listActionsForRound(ROUND_ID)).toHaveLength(1);
        expect(await careRepository.listAuditEvents(firstAction.action.id)).toHaveLength(2);

        const privacyRows = await client`
          select
            count(*) filter (where record::text ~* '"(rawAudio|rawVideo|rawFrame|transcript)"[[:space:]]*:') as unsafe_count
          from synthetic_care_actions
        `;
        expect(Number(privacyRows[0]?.unsafe_count ?? -1)).toBe(0);
      } finally {
        await client.unsafe(`drop schema if exists ${quotedSchema} cascade`);
        await client.end({ timeout: 5 });
      }
    },
    30_000
  );
});
