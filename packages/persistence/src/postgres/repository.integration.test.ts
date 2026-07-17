import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import type { ClinicalTask, DomainEvent, Round } from "@homerounds/contracts";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { describe, expect, it } from "vitest";

import type { CommitActionInput } from "../models";
import { PostgresHomeRoundsRepository } from "./repository";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;
const databaseIt = databaseUrl ? it : it.skip;

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

        const repository = new PostgresHomeRoundsRepository<unknown, unknown>(
          drizzle(client, { schema })
        );
        await repository.createRound(round());
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
        await expect(
          client.unsafe(
            "update audit_events set type = 'forbidden_mutation' where event_id = '56e97030-ea84-43e6-9969-9d36a61392dd'"
          )
        ).rejects.toThrow("audit_events are append-only");
      } finally {
        await client.unsafe("set search_path to public");
        await client.unsafe(`drop schema if exists ${quotedSchema} cascade`);
        await client.end({ timeout: 5 });
      }
    }
  );
});
