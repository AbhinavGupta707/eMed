begin;

create table baseline_series (
  patient_id text not null,
  context_key text not null,
  series_id uuid not null unique,
  series_version integer not null check (series_version > 0),
  updated_at timestamptz not null,
  record jsonb not null,
  primary key (patient_id, context_key),
  constraint baseline_series_record_object check (jsonb_typeof(record) = 'object'),
  constraint baseline_series_synthetic_only check (record ->> 'dataClassification' = 'synthetic_demo')
);

create index baseline_series_patient_updated_idx
  on baseline_series (patient_id, updated_at desc);

create table personalization_profiles (
  patient_id text primary key,
  profile_version integer not null check (profile_version > 0),
  updated_at timestamptz not null,
  record jsonb not null,
  constraint personalization_profiles_record_object check (jsonb_typeof(record) = 'object'),
  constraint personalization_profiles_synthetic_only check (
    record ->> 'dataClassification' = 'synthetic_demo'
  )
);

commit;
