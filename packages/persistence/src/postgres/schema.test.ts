import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

async function migrationSql(): Promise<string> {
  return readFile(
    new URL("../../../../infra/db/migrations/0001_homerounds_foundations.sql", import.meta.url),
    "utf8"
  );
}

async function voiceMigrationSql(): Promise<string> {
  return readFile(
    new URL("../../../../infra/db/migrations/0002_voice_biomarker_facts.sql", import.meta.url),
    "utf8"
  );
}

async function companionMigrationSql(): Promise<string> {
  return readFile(
    new URL("../../../../infra/db/migrations/0003_companion_sessions.sql", import.meta.url),
    "utf8"
  );
}

async function companionIntegrityMigrationSql(): Promise<string> {
  return readFile(
    new URL("../../../../infra/db/migrations/0004_companion_record_integrity.sql", import.meta.url),
    "utf8"
  );
}

describe("PostgreSQL migration invariants", () => {
  it("defines all production persistence tables in one transactional migration", async () => {
    const sql = await migrationSql();
    expect(sql.trimStart()).toMatch(/^begin;/i);
    expect(sql.trimEnd()).toMatch(/commit;$/i);
    for (const table of [
      "rounds",
      "measurement_facts",
      "clinical_snapshots",
      "clinical_facts",
      "clinical_tasks",
      "action_executions",
      "action_attempts",
      "audit_events"
    ]) {
      expect(sql).toContain(`create table ${table}`);
    }
  });

  it("makes action execution idempotency unique while retaining multiple attempts", async () => {
    const sql = await migrationSql();
    expect(sql).toMatch(
      /constraint action_executions_idempotency_key_unique unique \(idempotency_key\)/
    );
    expect(sql).toContain(
      "create index action_attempts_idempotency_occurred_idx on action_attempts (idempotency_key, occurred_at)"
    );
    expect(sql).not.toMatch(/action_attempts[\s\S]*unique \(idempotency_key\)/);
    expect(sql).toContain("action_attempts_execution_identity_fkey");
    expect(sql).toContain("action_attempts_error_outcome");
    expect(sql).toContain("action_executions_task_status");
  });

  it("enforces append-only audit and prohibits persisted raw media", async () => {
    const sql = await migrationSql();
    expect(sql).toContain("before update or delete on audit_events");
    expect(sql).toContain("raise exception 'audit_events are append-only'");
    expect(sql).toContain("measurement_facts_raw_media_absent check (raw_media_ref is null)");
    expect(sql).toContain("quality ->> 'status' = 'pass'");
  });

  it("indexes foreign keys and high-frequency queue/history access paths", async () => {
    const sql = await migrationSql();
    for (const indexName of [
      "measurement_facts_round_observed_idx",
      "clinical_facts_snapshot_idx",
      "clinical_tasks_round_idx",
      "action_executions_round_idx",
      "action_executions_task_idx",
      "action_attempts_execution_idx",
      "action_attempts_round_idx",
      "audit_events_round_occurred_idx"
    ]) {
      expect(sql).toContain(indexName);
    }
    expect(sql).toMatch(/clinical_tasks_open_queue_idx[\s\S]*where status <> 'completed'/);
  });

  it("adds research-only derived voice facts without a raw-media column value", async () => {
    const sql = await voiceMigrationSql();
    expect(sql.trimStart()).toMatch(/^begin;/i);
    expect(sql.trimEnd()).toMatch(/commit;$/i);
    expect(sql).toContain("create table voice_biomarker_facts");
    expect(sql).toContain("voice_biomarker_facts_quality_pass");
    expect(sql).toContain("voice_biomarker_facts_research_only");
    expect(sql).toContain("voice_biomarker_facts_raw_media_absent");
    expect(sql).toContain("voice_biomarker_facts_round_observed_idx");
    expect(sql).toContain("voice_biomarker_facts_patient_observed_idx");
  });

  it("adds durable scoped companion state with concurrency and raw-media constraints", async () => {
    const sql = await companionMigrationSql();
    expect(sql.trimStart()).toMatch(/^begin;/i);
    expect(sql.trimEnd()).toMatch(/commit;$/i);
    for (const table of [
      "companion_pairings",
      "companion_sessions",
      "companion_results",
      "companion_operations"
    ]) {
      expect(sql).toContain(`create table ${table}`);
    }
    expect(sql).toContain("companion_pairings_one_current_round_unique");
    expect(sql).toContain("where status <> 'revoked'");
    expect(sql).toContain("session_token_hash text not null unique");
    expect(sql).toContain("primary key (session_id, operation_id)");
    expect(sql).toContain("companion_results_raw_media_absent");
    expect(sql).toContain("pending_deterministic_workflow");
  });

  it("requires every durable companion envelope to remain a JSON object", async () => {
    const sql = await companionIntegrityMigrationSql();
    expect(sql.trimStart()).toMatch(/^begin;/i);
    expect(sql.trimEnd()).toMatch(/commit;$/i);
    for (const table of [
      "companion_pairings",
      "companion_sessions",
      "companion_results",
      "companion_operations"
    ]) {
      expect(sql).toContain(`${table}_record_object`);
    }
    expect(sql.match(/jsonb_typeof\(record\) = 'object'/g)).toHaveLength(4);
  });
});
