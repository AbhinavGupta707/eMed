begin;

alter table companion_pairings
  add constraint companion_pairings_record_object
  check (jsonb_typeof(record) = 'object');

alter table companion_sessions
  add constraint companion_sessions_record_object
  check (jsonb_typeof(record) = 'object');

alter table companion_results
  add constraint companion_results_record_object
  check (jsonb_typeof(record) = 'object');

alter table companion_operations
  add constraint companion_operations_record_object
  check (jsonb_typeof(record) = 'object');

commit;
