# Incident, demo recovery, observability, and backup

## Response priorities

1. Protect people: this is not a care channel. Show the deterministic emergency/worsening guidance and direct users to appropriate real services; do not improvise clinical advice.
2. Stop new exposure or corrupt writes: disable the affected provider/deployment, preserve only safe metadata, and avoid copying raw requests.
3. Restore the deterministic text/no-key path and PostgreSQL consistency.
4. Rotate credentials and invalidate demo sessions where compromise is possible.
5. Record facts, timestamps, release/database/provider versions, correlation IDs, decisions, and unresolved risks.

| Severity | Example                                                                                          | Immediate owner action                                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Critical | Secret/raw media exposed; unauthorized access; incorrect emergency or clinical action claim      | Remove public traffic, disable providers, rotate credentials, preserve minimal evidence, notify owner/providers, and halt the demo. |
| High     | Duplicate/corrupt task, audit mutation, wrong patient scope, failed migration, shared state loss | Stop writes/deploy, retain database branch, roll back code or restore a verified branch, and rerun safety/idempotency checks.       |
| Medium   | Voice/VitalLens outage, repeated `5xx`, severe performance or accessibility regression           | Select documented no-key/text recovery through a new deployment and open a tracked defect.                                          |
| Low      | Cosmetic issue with safe recovery intact                                                         | Record and continue only if release claims remain accurate.                                                                         |

## First-response playbooks

### Suspected secret disclosure

1. Disable/rotate the affected ElevenLabs, VitalLens, Neon, Vercel, and demo secrets as applicable. Rotating `DEMO_ACCESS_SECRET` invalidates existing signed demo cookies.
2. Stop the deployment or provider path; do not print the value while searching logs/history.
3. Review GitHub secret-scanning alerts, workflow logs/artifacts, Vercel logs, environment access, and Git history.
4. Remove the secret from current content and follow provider/GitHub history-remediation guidance. Rotation is mandatory even if content is later deleted.
5. Rebuild and scan browser assets before restoring traffic.

### Suspected raw media or transcript persistence

1. Disable voice/VitalLens and stop captures. Preserve correlation IDs and object/table names, not the media itself.
2. Inspect PostgreSQL/object storage/log destinations and provider settings with an approved operator.
3. Treat any unexpected copy as an incident even though demo data is synthetic; delete only under an approved evidence/retention decision.
4. Verify local finger PPG sends no frames, VitalLens traffic is only the consented 40×40 proxy payload, `raw_media_ref` remains null, and confirmed audit events contain no transcript/note.

### PostgreSQL unavailable or wrong runtime profile

- In `APP_ENV=demo`, omitted `DATABASE_URL` fails startup. In development it selects `in_memory_demo_fallback`; never relabel that recovery/test profile as hosted persistence.
- If PostgreSQL fails after connection, do not switch silently. Check Neon status/branch/connection limits and the redacted application error rate.
- Restore a verified PostgreSQL branch or local database, redeploy/restart, then run seed/check and a cross-browser patient-to-clinician state check.

### Provider unavailable

- ElevenLabs: end the bounded session and continue with complete text controls. Disable it in the next deployment if failures persist.
- VitalLens: surface typed unavailable/failure, persist no measurement, and retain manual/text evidence. Never turn provider HTTP success or uncertain quality into a measurement.
- Optical provider changes require a new assessment session; never silently switch within a round.

## Demo recovery order

1. Retry one coached capture only when the workflow permits it.
2. Use the explicitly selected, visibly labelled recorded synthetic capture replay only after a real failure; never present it as a live measurement.
3. Use the poor-quality/abstention text scenario, which creates no measurement.
4. Move to the local PostgreSQL recovery profile and rerun `demo:reset` plus `demo:check`.
5. Use a clearly labelled backup recording only if the environment is unavailable.

Do not truncate the database, delete unrelated rows, invent a measurement, bypass a red-flag gate, or relabel fixture/Playwright evidence as physical/live evidence.

## Current observability

The durable evidence source is PostgreSQL audit data: state/action events carry actor/source, correlation, protocol/version, and idempotency context. The database rejects update/delete of audit rows during normal operation and repository methods commit key state/action events atomically.

API rejection logging uses the safe structured-redaction contract in code, but the default runtime logger is a no-op. `LOG_LEVEL` and `ENABLE_PROVIDER_TRACING` are parsed but not wired to an operational sink. Therefore this base does **not** have complete centralized logs, metrics, alerting, tracing, or SIEM evidence.

Until a reviewed sink exists, operators should monitor:

- Vercel deployment/build/function error summaries, without enabling request-body capture;
- Neon availability, connection/pool saturation, storage, and restore-window settings;
- `/api/readiness`, authenticated `demo:check` output, and the `x-homerounds-runtime-profile` response header;
- counts of rejected requests by safe error code/correlation ID where platform logs expose them;
- provider status/quota dashboards only when those providers are enabled.

Never log cookies, authorization, database URLs, keys/tokens, notes, transcripts, audio, image/video/frame bytes, raw request bodies, provider payloads, or patient-like names. Use event type, safe machine code, timestamp, correlation ID, deployment SHA, provider/version, status, duration bucket, and explicit absence flags. Provider tracing stays off.

CI uploads Playwright traces/screenshots only on failure, for three days, and runs without live provider/database/demo secrets. They still contain synthetic UI content and remain access-controlled diagnostic artifacts, not submission evidence or a durable patient record.

## Backup and recovery boundaries

### Local

- The Compose named volume is persistence, not a backup.
- For a deliberate snapshot, stop writes and use `pg_dump` with a direct connection; encrypt and access-control the output even though it is synthetic.
- Rehearse restore into a new database, apply no ad hoc edits, and run persistence tests plus `demo:check`.

### Neon

- Configure the restore window and snapshots explicitly for the selected plan. Current Neon defaults vary by plan and have changed; capture the observed settings in release evidence.
- Create/inspect a point-in-time branch before rewinding the active branch. Verify schema, audit/task counts, and demo invariants.
- `pg_dump` and migrations use a direct connection, not the pooled PgBouncer URL.
- A recovery claim requires a timed restore rehearsal. Provider marketing or an enabled toggle is not evidence.

### Retention gaps

The schema has no automatic TTL or general data-erasure workflow. Synthetic rounds, facts, tasks, and audit events persist until the exact demo reset or database/branch removal. Audit is append-only in normal operation. This is acceptable only for the bounded synthetic hackathon profile; a pilot needs an approved retention schedule, deletion/legal-hold workflow, restore testing, DPIA, processor agreements, and access audit.

## After-action record

Record the release/deployment/database branch, incident start/detection/recovery times, safe correlation IDs, affected synthetic scenarios, providers/config versions, actions taken, credentials rotated, evidence locations/retention, recovery checks, claim changes, owner, and follow-up due dates. Do not paste sensitive payloads into the record.
