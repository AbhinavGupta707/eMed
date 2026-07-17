begin;

create table rounds (
  id uuid primary key,
  patient_id text not null check (length(patient_id) > 0),
  state text not null check (
    state in (
      'invited', 'red_flag_screen', 'collecting_report', 'assessment_selected',
      'capturing', 'capture_retry', 'assessment_complete', 'follow_up_selected',
      'protocol_ready', 'protocol_decided', 'action_pending', 'awaiting_clinician',
      'outcome_ready', 'closed', 'emergency_closed', 'abstained_for_review',
      'patient_declined'
    )
  ),
  state_version integer not null constraint rounds_state_version_nonnegative check (state_version >= 0),
  purpose text not null check (length(purpose) between 1 and 240),
  trigger_id text not null,
  burden_seconds_remaining integer not null constraint rounds_burden_nonnegative check (burden_seconds_remaining >= 0),
  protocol_id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  closed_at timestamptz,
  constraint rounds_trigger_id_unique unique (trigger_id),
  constraint rounds_time_order check (updated_at >= created_at),
  constraint rounds_terminal_closed_at check (
    (state in ('closed', 'emergency_closed', 'abstained_for_review', 'patient_declined') and closed_at = updated_at)
    or
    (state not in ('closed', 'emergency_closed', 'abstained_for_review', 'patient_declined') and closed_at is null)
  )
);

create index rounds_patient_state_updated_idx on rounds (patient_id, state, updated_at);

create table measurement_facts (
  fact_id uuid primary key,
  round_id uuid not null references rounds(id) on delete restrict,
  patient_id text not null,
  assessment_session_id uuid not null,
  provider text not null check (provider in ('finger_ppg', 'vitallens')),
  value double precision not null constraint measurement_facts_value_positive_finite check (value > 0 and value < 'Infinity'::float8),
  unit text not null check (unit = 'bpm'),
  observed_at timestamptz not null,
  duration_ms integer not null constraint measurement_facts_duration_positive check (duration_ms > 0),
  algorithm_version text not null,
  provider_model_version text,
  quality jsonb not null check (quality ->> 'status' = 'pass'),
  raw_media_ref text constraint measurement_facts_raw_media_absent check (raw_media_ref is null)
);

create index measurement_facts_round_observed_idx on measurement_facts (round_id, observed_at);
create index measurement_facts_patient_observed_idx on measurement_facts (patient_id, observed_at);

create table clinical_snapshots (
  snapshot_id uuid primary key,
  patient_id text not null,
  snapshot_version integer not null constraint clinical_snapshots_version_positive check (snapshot_version > 0),
  as_of timestamptz not null,
  document jsonb not null,
  constraint clinical_snapshots_patient_version_unique unique (patient_id, snapshot_version)
);

create index clinical_snapshots_patient_as_of_idx on clinical_snapshots (patient_id, as_of desc);

create table clinical_facts (
  snapshot_id uuid not null references clinical_snapshots(snapshot_id) on delete restrict,
  fact_id text not null,
  patient_id text not null,
  kind text not null check (kind in ('condition', 'medication', 'observation', 'care_plan')),
  observed_at timestamptz,
  fact jsonb not null,
  provenance jsonb not null,
  primary key (snapshot_id, fact_id)
);

create index clinical_facts_snapshot_idx on clinical_facts (snapshot_id);
create index clinical_facts_patient_kind_observed_idx on clinical_facts (patient_id, kind, observed_at);

create table clinical_tasks (
  id uuid primary key,
  round_id uuid not null references rounds(id) on delete restrict,
  patient_id text not null,
  idempotency_key text not null check (length(idempotency_key) between 16 and 200),
  type text not null check (type = 'programme_review'),
  owner_role text not null check (owner_role = 'programme_clinician'),
  priority text not null check (priority in ('routine', 'priority', 'urgent_demo_only')),
  reason_key text not null,
  status text not null check (status in ('open', 'acknowledged', 'completed')),
  service_window_label text not null,
  protocol_id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint clinical_tasks_idempotency_key_unique unique (idempotency_key),
  constraint clinical_tasks_time_order check (updated_at >= created_at)
);

create index clinical_tasks_round_idx on clinical_tasks (round_id);
create index clinical_tasks_open_queue_idx
  on clinical_tasks (owner_role, priority, created_at)
  where status <> 'completed';

create table action_executions (
  id uuid primary key,
  round_id uuid not null references rounds(id) on delete restrict,
  task_id uuid references clinical_tasks(id) on delete restrict,
  idempotency_key text not null check (length(idempotency_key) between 16 and 200),
  action_type text not null check (action_type in ('create_programme_task', 'show_emergency_guidance')),
  status text not null check (status in ('failed', 'succeeded')),
  created_at timestamptz not null,
  constraint action_executions_idempotency_key_unique unique (idempotency_key),
  constraint action_executions_attempt_identity_unique unique (id, round_id, idempotency_key, action_type),
  constraint action_executions_task_status check (
    (status = 'succeeded' and task_id is not null)
    or status = 'failed'
  )
);

create index action_executions_round_idx on action_executions (round_id);
create index action_executions_task_idx on action_executions (task_id);

create table action_attempts (
  id uuid primary key,
  execution_id uuid not null,
  round_id uuid not null references rounds(id) on delete restrict,
  idempotency_key text not null check (length(idempotency_key) between 16 and 200),
  action_type text not null check (action_type in ('create_programme_task', 'show_emergency_guidance')),
  outcome text not null check (outcome in ('created', 'duplicate', 'failed')),
  error_code text,
  occurred_at timestamptz not null,
  correlation_id text not null,
  constraint action_attempts_execution_identity_fkey
    foreign key (execution_id, round_id, idempotency_key, action_type)
    references action_executions(id, round_id, idempotency_key, action_type)
    on delete restrict,
  constraint action_attempts_error_outcome check (
    (outcome = 'failed' and error_code is not null)
    or (outcome in ('created', 'duplicate') and error_code is null)
  )
);

create index action_attempts_execution_idx on action_attempts (execution_id);
create index action_attempts_round_idx on action_attempts (round_id);
create index action_attempts_idempotency_occurred_idx on action_attempts (idempotency_key, occurred_at);

create table audit_events (
  event_id uuid primary key,
  type text not null,
  schema_version integer not null constraint audit_events_schema_version_one check (schema_version = 1),
  occurred_at timestamptz not null,
  actor_kind text not null check (actor_kind in ('patient', 'clinician', 'system', 'voice_provider')),
  actor_id text not null,
  patient_id text not null,
  round_id uuid not null references rounds(id) on delete restrict,
  correlation_id text not null,
  source text not null check (source in ('patient_ui', 'clinician_ui', 'system', 'voice_provider')),
  payload jsonb not null
);

create index audit_events_round_occurred_idx on audit_events (round_id, occurred_at);
create index audit_events_correlation_idx on audit_events (correlation_id);

create function reject_audit_event_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_events are append-only' using errcode = '55000';
end;
$$;

create trigger audit_events_reject_update_or_delete
before update or delete on audit_events
for each row execute function reject_audit_event_mutation();

commit;
