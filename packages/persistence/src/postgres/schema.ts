import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });

export const rounds = pgTable(
  "rounds",
  {
    id: uuid("id").primaryKey(),
    patientId: text("patient_id").notNull(),
    state: text("state").notNull(),
    stateVersion: integer("state_version").notNull(),
    purpose: text("purpose").notNull(),
    triggerId: text("trigger_id").notNull(),
    burdenSecondsRemaining: integer("burden_seconds_remaining").notNull(),
    protocolId: text("protocol_id").notNull(),
    createdAt: timestamptz("created_at").notNull(),
    updatedAt: timestamptz("updated_at").notNull(),
    closedAt: timestamptz("closed_at")
  },
  (table) => [
    check(
      "rounds_state_valid",
      sql`${table.state} in ('invited', 'red_flag_screen', 'collecting_report', 'assessment_selected', 'capturing', 'capture_retry', 'assessment_complete', 'follow_up_selected', 'protocol_ready', 'protocol_decided', 'action_pending', 'awaiting_clinician', 'outcome_ready', 'closed', 'emergency_closed', 'abstained_for_review', 'patient_declined')`
    ),
    check("rounds_state_version_nonnegative", sql`${table.stateVersion} >= 0`),
    check("rounds_burden_nonnegative", sql`${table.burdenSecondsRemaining} >= 0`),
    check("rounds_time_order", sql`${table.updatedAt} >= ${table.createdAt}`),
    check(
      "rounds_terminal_closed_at",
      sql`((${table.state} in ('closed', 'emergency_closed', 'abstained_for_review', 'patient_declined')) and ${table.closedAt} = ${table.updatedAt}) or ((${table.state} not in ('closed', 'emergency_closed', 'abstained_for_review', 'patient_declined')) and ${table.closedAt} is null)`
    ),
    uniqueIndex("rounds_trigger_id_unique").on(table.triggerId),
    index("rounds_patient_state_updated_idx").on(table.patientId, table.state, table.updatedAt)
  ]
);

export const measurementFacts = pgTable(
  "measurement_facts",
  {
    factId: uuid("fact_id").primaryKey(),
    roundId: uuid("round_id")
      .notNull()
      .references(() => rounds.id, { onDelete: "restrict" }),
    patientId: text("patient_id").notNull(),
    assessmentSessionId: uuid("assessment_session_id").notNull(),
    provider: text("provider").notNull(),
    value: doublePrecision("value").notNull(),
    unit: text("unit").notNull(),
    observedAt: timestamptz("observed_at").notNull(),
    durationMs: integer("duration_ms").notNull(),
    algorithmVersion: text("algorithm_version").notNull(),
    providerModelVersion: text("provider_model_version"),
    quality: jsonb("quality").notNull().$type<unknown>(),
    rawMediaRef: text("raw_media_ref")
  },
  (table) => [
    check(
      "measurement_facts_value_positive_finite",
      sql`${table.value} > 0 and ${table.value} < 'Infinity'::float8`
    ),
    check("measurement_facts_duration_positive", sql`${table.durationMs} > 0`),
    check("measurement_facts_raw_media_absent", sql`${table.rawMediaRef} is null`),
    index("measurement_facts_round_observed_idx").on(table.roundId, table.observedAt),
    index("measurement_facts_patient_observed_idx").on(table.patientId, table.observedAt)
  ]
);

export const voiceBiomarkerFacts = pgTable(
  "voice_biomarker_facts",
  {
    factId: uuid("fact_id").primaryKey(),
    roundId: uuid("round_id")
      .notNull()
      .references(() => rounds.id, { onDelete: "restrict" }),
    patientId: text("patient_id").notNull(),
    assessmentSessionId: uuid("assessment_session_id").notNull(),
    provider: text("provider").notNull(),
    observedAt: timestamptz("observed_at").notNull(),
    durationMs: integer("duration_ms").notNull(),
    algorithmVersion: text("algorithm_version").notNull(),
    features: jsonb("features").notNull().$type<unknown>(),
    quality: jsonb("quality").notNull().$type<unknown>(),
    researchOnly: boolean("research_only").notNull(),
    rawMediaRef: text("raw_media_ref")
  },
  (table) => [
    check("voice_biomarker_facts_provider_local", sql`${table.provider} = 'local_voice_features'`),
    check("voice_biomarker_facts_duration_positive", sql`${table.durationMs} > 0`),
    check("voice_biomarker_facts_quality_pass", sql`${table.quality} ->> 'status' = 'pass'`),
    check("voice_biomarker_facts_research_only", sql`${table.researchOnly} = true`),
    check("voice_biomarker_facts_raw_media_absent", sql`${table.rawMediaRef} is null`),
    index("voice_biomarker_facts_round_observed_idx").on(table.roundId, table.observedAt),
    index("voice_biomarker_facts_patient_observed_idx").on(table.patientId, table.observedAt)
  ]
);

export const clinicalSnapshots = pgTable(
  "clinical_snapshots",
  {
    snapshotId: uuid("snapshot_id").primaryKey(),
    patientId: text("patient_id").notNull(),
    snapshotVersion: integer("snapshot_version").notNull(),
    asOf: timestamptz("as_of").notNull(),
    document: jsonb("document").notNull().$type<unknown>()
  },
  (table) => [
    check("clinical_snapshots_version_positive", sql`${table.snapshotVersion} > 0`),
    uniqueIndex("clinical_snapshots_patient_version_unique").on(
      table.patientId,
      table.snapshotVersion
    ),
    index("clinical_snapshots_patient_as_of_idx").on(table.patientId, table.asOf)
  ]
);

export const clinicalFacts = pgTable(
  "clinical_facts",
  {
    snapshotId: uuid("snapshot_id")
      .notNull()
      .references(() => clinicalSnapshots.snapshotId, { onDelete: "restrict" }),
    factId: text("fact_id").notNull(),
    patientId: text("patient_id").notNull(),
    kind: text("kind").notNull(),
    observedAt: timestamptz("observed_at"),
    fact: jsonb("fact").notNull().$type<unknown>(),
    provenance: jsonb("provenance").notNull().$type<Record<string, unknown>>()
  },
  (table) => [
    primaryKey({ columns: [table.snapshotId, table.factId] }),
    index("clinical_facts_snapshot_idx").on(table.snapshotId),
    index("clinical_facts_patient_kind_observed_idx").on(
      table.patientId,
      table.kind,
      table.observedAt
    )
  ]
);

export const clinicalTasks = pgTable(
  "clinical_tasks",
  {
    id: uuid("id").primaryKey(),
    roundId: uuid("round_id")
      .notNull()
      .references(() => rounds.id, { onDelete: "restrict" }),
    patientId: text("patient_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    type: text("type").notNull(),
    ownerRole: text("owner_role").notNull(),
    priority: text("priority").notNull(),
    reasonKey: text("reason_key").notNull(),
    status: text("status").notNull(),
    serviceWindowLabel: text("service_window_label").notNull(),
    protocolId: text("protocol_id").notNull(),
    createdAt: timestamptz("created_at").notNull(),
    updatedAt: timestamptz("updated_at").notNull()
  },
  (table) => [
    uniqueIndex("clinical_tasks_idempotency_key_unique").on(table.idempotencyKey),
    index("clinical_tasks_round_idx").on(table.roundId),
    index("clinical_tasks_open_queue_idx")
      .on(table.ownerRole, table.priority, table.createdAt)
      .where(sql`${table.status} <> 'completed'`)
  ]
);

export const actionExecutions = pgTable(
  "action_executions",
  {
    id: uuid("id").primaryKey(),
    roundId: uuid("round_id")
      .notNull()
      .references(() => rounds.id, { onDelete: "restrict" }),
    taskId: uuid("task_id").references(() => clinicalTasks.id, { onDelete: "restrict" }),
    idempotencyKey: text("idempotency_key").notNull(),
    actionType: text("action_type").notNull(),
    status: text("status").notNull(),
    createdAt: timestamptz("created_at").notNull()
  },
  (table) => [
    uniqueIndex("action_executions_idempotency_key_unique").on(table.idempotencyKey),
    uniqueIndex("action_executions_attempt_identity_unique").on(
      table.id,
      table.roundId,
      table.idempotencyKey,
      table.actionType
    ),
    check(
      "action_executions_task_status",
      sql`(${table.status} = 'succeeded' and ${table.taskId} is not null) or ${table.status} = 'failed'`
    ),
    index("action_executions_round_idx").on(table.roundId),
    index("action_executions_task_idx").on(table.taskId)
  ]
);

export const actionAttempts = pgTable(
  "action_attempts",
  {
    id: uuid("id").primaryKey(),
    executionId: uuid("execution_id").notNull(),
    roundId: uuid("round_id")
      .notNull()
      .references(() => rounds.id, { onDelete: "restrict" }),
    idempotencyKey: text("idempotency_key").notNull(),
    actionType: text("action_type").notNull(),
    outcome: text("outcome").notNull(),
    errorCode: text("error_code"),
    occurredAt: timestamptz("occurred_at").notNull(),
    correlationId: text("correlation_id").notNull()
  },
  (table) => [
    foreignKey({
      columns: [table.executionId, table.roundId, table.idempotencyKey, table.actionType],
      foreignColumns: [
        actionExecutions.id,
        actionExecutions.roundId,
        actionExecutions.idempotencyKey,
        actionExecutions.actionType
      ],
      name: "action_attempts_execution_identity_fkey"
    }).onDelete("restrict"),
    check(
      "action_attempts_error_outcome",
      sql`(${table.outcome} = 'failed' and ${table.errorCode} is not null) or (${table.outcome} in ('created', 'duplicate') and ${table.errorCode} is null)`
    ),
    index("action_attempts_execution_idx").on(table.executionId),
    index("action_attempts_round_idx").on(table.roundId),
    index("action_attempts_idempotency_occurred_idx").on(table.idempotencyKey, table.occurredAt)
  ]
);

export const auditEvents = pgTable(
  "audit_events",
  {
    eventId: uuid("event_id").primaryKey(),
    type: text("type").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    occurredAt: timestamptz("occurred_at").notNull(),
    actorKind: text("actor_kind").notNull(),
    actorId: text("actor_id").notNull(),
    patientId: text("patient_id").notNull(),
    roundId: uuid("round_id")
      .notNull()
      .references(() => rounds.id, { onDelete: "restrict" }),
    correlationId: text("correlation_id").notNull(),
    source: text("source").notNull(),
    payload: jsonb("payload").notNull().$type<Record<string, unknown>>()
  },
  (table) => [
    check("audit_events_schema_version_one", sql`${table.schemaVersion} = 1`),
    index("audit_events_round_occurred_idx").on(table.roundId, table.occurredAt),
    index("audit_events_correlation_idx").on(table.correlationId)
  ]
);

export const companionPairings = pgTable(
  "companion_pairings",
  {
    pairingId: uuid("pairing_id").primaryKey(),
    tokenHash: text("token_hash").notNull(),
    roundId: uuid("round_id")
      .notNull()
      .references(() => rounds.id, { onDelete: "restrict" }),
    status: text("status").notNull(),
    pairingVersion: integer("pairing_version").notNull(),
    sessionId: uuid("session_id"),
    issuedAt: timestamptz("issued_at").notNull(),
    record: jsonb("record").notNull().$type<unknown>()
  },
  (table) => [
    uniqueIndex("companion_pairings_token_hash_unique").on(table.tokenHash),
    uniqueIndex("companion_pairings_session_id_unique").on(table.sessionId),
    uniqueIndex("companion_pairings_one_current_round_unique")
      .on(table.roundId)
      .where(sql`${table.status} <> 'revoked'`),
    index("companion_pairings_round_issued_idx").on(table.roundId, table.issuedAt)
  ]
);

export const companionSessions = pgTable(
  "companion_sessions",
  {
    sessionId: uuid("session_id").primaryKey(),
    sessionTokenHash: text("session_token_hash").notNull(),
    pairingId: uuid("pairing_id")
      .notNull()
      .references(() => companionPairings.pairingId, { onDelete: "restrict" }),
    roundId: uuid("round_id")
      .notNull()
      .references(() => rounds.id, { onDelete: "restrict" }),
    status: text("status").notNull(),
    sessionVersion: integer("session_version").notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    record: jsonb("record").notNull().$type<unknown>()
  },
  (table) => [
    uniqueIndex("companion_sessions_token_hash_unique").on(table.sessionTokenHash),
    uniqueIndex("companion_sessions_pairing_id_unique").on(table.pairingId),
    index("companion_sessions_round_expires_idx").on(table.roundId, table.expiresAt)
  ]
);

export const companionResults = pgTable(
  "companion_results",
  {
    resultId: uuid("result_id").primaryKey(),
    pairingId: uuid("pairing_id")
      .notNull()
      .references(() => companionPairings.pairingId, { onDelete: "restrict" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => companionSessions.sessionId, { onDelete: "restrict" }),
    roundId: uuid("round_id")
      .notNull()
      .references(() => rounds.id, { onDelete: "restrict" }),
    receivedAt: timestamptz("received_at").notNull(),
    validationStatus: text("validation_status").notNull(),
    record: jsonb("record").notNull().$type<unknown>()
  },
  (table) => [index("companion_results_round_received_idx").on(table.roundId, table.receivedAt)]
);

export const companionOperations = pgTable(
  "companion_operations",
  {
    sessionId: uuid("session_id")
      .notNull()
      .references(() => companionSessions.sessionId, { onDelete: "restrict" }),
    operationId: uuid("operation_id").notNull(),
    kind: text("kind").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    committedSessionVersion: integer("committed_session_version").notNull(),
    resultId: uuid("result_id").references(() => companionResults.resultId, {
      onDelete: "restrict"
    }),
    occurredAt: timestamptz("occurred_at").notNull(),
    record: jsonb("record").notNull().$type<unknown>()
  },
  (table) => [
    primaryKey({ columns: [table.sessionId, table.operationId] }),
    index("companion_operations_result_idx").on(table.resultId)
  ]
);
