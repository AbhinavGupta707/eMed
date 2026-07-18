begin;

create table proactive_trigger_proposals (
  idempotency_key text primary key,
  patient_id text not null,
  trigger_id text not null unique,
  proposal_id text not null unique,
  committed_at timestamptz not null,
  record jsonb not null,
  constraint proactive_trigger_proposals_record_object
    check (jsonb_typeof(record) = 'object'),
  constraint proactive_trigger_proposals_synthetic_only
    check (record #>> '{evaluation,proposal,dataClassification}' = 'synthetic_demo')
);

create index proactive_trigger_proposals_patient_committed_idx
  on proactive_trigger_proposals (patient_id, committed_at desc);

create table structured_memory_stores (
  patient_id text primary key,
  store_version integer not null check (store_version > 0),
  updated_at timestamptz not null,
  record jsonb not null,
  constraint structured_memory_stores_record_object
    check (jsonb_typeof(record) = 'object'),
  constraint structured_memory_stores_synthetic_only
    check (record ->> 'dataClassification' = 'synthetic_demo'),
  constraint structured_memory_stores_no_raw_payloads
    check (
      record::text !~* '"(rawAudio|rawVideo|rawFrame|rawMedia|transcript|providerPayload|modelReasoning)"[[:space:]]*:'
    )
);

create index structured_memory_stores_updated_idx
  on structured_memory_stores (updated_at desc);

create table synthetic_care_action_authorities (
  round_id uuid primary key references rounds(id) on delete cascade,
  patient_id text not null,
  round_version integer not null check (round_version >= 0),
  updated_at timestamptz not null,
  record jsonb not null,
  constraint synthetic_care_action_authorities_record_object
    check (jsonb_typeof(record) = 'object')
);

create table synthetic_care_actions (
  action_id uuid primary key,
  round_id uuid not null references rounds(id) on delete cascade,
  patient_id text not null,
  idempotency_key text not null unique,
  kind text not null check (
    kind in (
      'synthetic_appointment_request',
      'synthetic_refill_review_request',
      'synthetic_care_team_message'
    )
  ),
  status text not null check (
    status in ('pending_review', 'approved', 'contact_attempted', 'completed', 'failed', 'unknown')
  ),
  action_version integer not null check (action_version > 0),
  updated_at timestamptz not null,
  record jsonb not null,
  constraint synthetic_care_actions_record_object check (jsonb_typeof(record) = 'object'),
  constraint synthetic_care_actions_not_delivered
    check (record ->> 'delivery' = 'synthetic_only_not_sent'),
  constraint synthetic_care_actions_no_raw_payloads
    check (
      record::text !~* '"(rawAudio|rawVideo|rawFrame|rawMedia|transcript|providerPayload|modelReasoning)"[[:space:]]*:'
    )
);

create index synthetic_care_actions_round_updated_idx
  on synthetic_care_actions (round_id, updated_at desc);
create index synthetic_care_actions_patient_updated_idx
  on synthetic_care_actions (patient_id, updated_at desc);

create table synthetic_care_action_events (
  event_id uuid primary key,
  action_id uuid not null references synthetic_care_actions(action_id) on delete cascade,
  round_id uuid not null references rounds(id) on delete cascade,
  operation_key text not null,
  occurred_at timestamptz not null,
  record jsonb not null,
  constraint synthetic_care_action_events_record_object check (jsonb_typeof(record) = 'object'),
  constraint synthetic_care_action_events_privacy_flags check (
    record ->> 'rawTranscriptStored' = 'false'
    and record ->> 'modelReasoningStored' = 'false'
    and record ->> 'providerPayloadStored' = 'false'
    and record ->> 'rawMediaStored' = 'false'
  )
);

create index synthetic_care_action_events_action_occurred_idx
  on synthetic_care_action_events (action_id, occurred_at asc);

create table synthetic_care_action_mutations (
  operation_key text primary key,
  action_id uuid not null references synthetic_care_actions(action_id) on delete cascade,
  committed_at timestamptz not null,
  record jsonb not null,
  constraint synthetic_care_action_mutations_record_object check (jsonb_typeof(record) = 'object')
);

create or replace function prevent_final_pass_event_mutation()
returns trigger as $$
begin
  raise exception 'synthetic_care_action_events are append-only';
end;
$$ language plpgsql;

create trigger synthetic_care_action_events_append_only
before update or delete on synthetic_care_action_events
for each row execute function prevent_final_pass_event_mutation();

commit;
