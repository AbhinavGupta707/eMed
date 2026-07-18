begin;

create table companion_pairings (
  pairing_id uuid primary key,
  token_hash text not null unique,
  round_id uuid not null references rounds(id) on delete restrict,
  status text not null check (status in ('pending', 'active', 'revoked', 'completed')),
  pairing_version integer not null check (pairing_version > 0),
  session_id uuid unique,
  issued_at timestamptz not null,
  record jsonb not null,
  constraint companion_pairings_record_identity check (record ->> 'pairingId' = pairing_id::text),
  constraint companion_pairings_record_token check (record ->> 'tokenHash' = token_hash),
  constraint companion_pairings_record_round check (record ->> 'roundId' = round_id::text),
  constraint companion_pairings_record_status check (record ->> 'status' = status),
  constraint companion_pairings_record_version check ((record ->> 'pairingVersion')::integer = pairing_version)
);

create unique index companion_pairings_one_current_round_unique
  on companion_pairings (round_id)
  where status <> 'revoked';
create index companion_pairings_round_issued_idx
  on companion_pairings (round_id, issued_at desc);

create table companion_sessions (
  session_id uuid primary key,
  session_token_hash text not null unique,
  pairing_id uuid not null unique references companion_pairings(pairing_id) on delete restrict,
  round_id uuid not null references rounds(id) on delete restrict,
  status text not null check (status in ('active', 'revoked', 'completed')),
  session_version integer not null check (session_version > 0),
  expires_at timestamptz not null,
  record jsonb not null,
  constraint companion_sessions_record_identity check (record ->> 'sessionId' = session_id::text),
  constraint companion_sessions_record_token check (record ->> 'sessionTokenHash' = session_token_hash),
  constraint companion_sessions_record_pairing check (record ->> 'pairingId' = pairing_id::text),
  constraint companion_sessions_record_round check (record ->> 'roundId' = round_id::text),
  constraint companion_sessions_record_status check (record ->> 'status' = status),
  constraint companion_sessions_record_version check ((record ->> 'sessionVersion')::integer = session_version)
);

create index companion_sessions_round_expires_idx
  on companion_sessions (round_id, expires_at);

alter table companion_pairings
  add constraint companion_pairings_session_fkey
  foreign key (session_id) references companion_sessions(session_id) on delete restrict
  deferrable initially deferred;

create table companion_results (
  result_id uuid primary key,
  pairing_id uuid not null references companion_pairings(pairing_id) on delete restrict,
  session_id uuid not null references companion_sessions(session_id) on delete restrict,
  round_id uuid not null references rounds(id) on delete restrict,
  received_at timestamptz not null,
  validation_status text not null check (validation_status = 'pending_deterministic_workflow'),
  record jsonb not null,
  constraint companion_results_record_identity check (record ->> 'resultId' = result_id::text),
  constraint companion_results_record_pairing check (record ->> 'pairingId' = pairing_id::text),
  constraint companion_results_record_session check (record ->> 'sessionId' = session_id::text),
  constraint companion_results_record_round check (record ->> 'roundId' = round_id::text),
  constraint companion_results_raw_media_absent check (record #>> '{result,rawMediaStored}' = 'false')
);

create index companion_results_round_received_idx
  on companion_results (round_id, received_at);

create table companion_operations (
  session_id uuid not null references companion_sessions(session_id) on delete restrict,
  operation_id uuid not null,
  kind text not null check (kind in ('status', 'result', 'acknowledgement')),
  request_fingerprint text not null,
  committed_session_version integer not null check (committed_session_version > 0),
  result_id uuid references companion_results(result_id) on delete restrict,
  occurred_at timestamptz not null,
  record jsonb not null,
  primary key (session_id, operation_id),
  constraint companion_operations_record_session check (record ->> 'sessionId' = session_id::text),
  constraint companion_operations_record_identity check (record ->> 'operationId' = operation_id::text),
  constraint companion_operations_record_fingerprint check (record ->> 'requestFingerprint' = request_fingerprint)
);

create index companion_operations_result_idx
  on companion_operations (result_id)
  where result_id is not null;

commit;
