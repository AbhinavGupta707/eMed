begin;

create table voice_biomarker_facts (
  fact_id uuid primary key,
  round_id uuid not null references rounds(id) on delete restrict,
  patient_id text not null check (length(patient_id) > 0),
  assessment_session_id uuid not null,
  provider text not null constraint voice_biomarker_facts_provider_local check (provider = 'local_voice_features'),
  observed_at timestamptz not null,
  duration_ms integer not null constraint voice_biomarker_facts_duration_positive check (duration_ms > 0),
  algorithm_version text not null,
  features jsonb not null,
  quality jsonb not null constraint voice_biomarker_facts_quality_pass check (quality ->> 'status' = 'pass'),
  research_only boolean not null constraint voice_biomarker_facts_research_only check (research_only = true),
  raw_media_ref text constraint voice_biomarker_facts_raw_media_absent check (raw_media_ref is null)
);

create index voice_biomarker_facts_round_observed_idx
  on voice_biomarker_facts (round_id, observed_at);
create index voice_biomarker_facts_patient_observed_idx
  on voice_biomarker_facts (patient_id, observed_at);

commit;
