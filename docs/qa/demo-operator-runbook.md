# Demo operator and recovery runbook

This runbook is for synthetic hackathon operation only. It is not a care pathway. Never enter real data, bypass the deterministic red-flag or quality gate, invent a measurement, expose a secret/database URL, or describe a recorded fixture as live.

## Roles and stop authority

- **Presenter:** narrates only observed behavior and controls the patient/clinician views.
- **Operator:** owns terminal, database, reset/check, readiness, and rollback.
- **Observer/timekeeper:** records the [three-run sheet](./three-run-rehearsal.md) and calls a stop for any prohibited claim or failed gate.
- **Stop immediately:** unexpected real data, secret/raw media in UI/logs, wrong-patient scope, duplicate task, red flag bypass, failed/uncertain capture shown as a number, readiness not `postgres`, or uncertainty about database target.

## Preflight

From the repository root:

```bash
git rev-parse HEAD
git status --short
git diff --exit-code 8589723e511b65dc849ef36234e7f462966e14a5 -- apps packages scripts tests data infra package.json pnpm-lock.yaml
node --version
pnpm --version
test -n "${DATABASE_URL:-}"
```

Expected: the application evidence base is `8589723e511b65dc849ef36234e7f462966e14a5` or the final packaging commit differs from it only in approved documentation/static-recovery paths; status is clean; Node is `v22.22.2`; pnpm is `10.33.0`; `DATABASE_URL` is already supplied through an approved local/server environment and is never printed.

Use [the PostgreSQL runbook](../operations/postgresql-and-migrations.md) to create a dedicated synthetic database and apply the migration. Confirm the target before any reset. Do not use `down --volumes`, truncate, or ad hoc deletion.

## Start the production-built local no-key profile

Build once:

```bash
pnpm install --frozen-lockfile
pnpm build
```

Start the app with the database value inherited from the operator environment:

```bash
APP_ENV=development \
DEMO_MODE=true \
APP_BASE_URL=http://127.0.0.1:3000 \
FHIR_PROVIDER=fixture \
VOICE_PROVIDER=disabled \
NARRATIVE_MODEL_PROVIDER=disabled \
OPTICAL_ASSESSMENT_PROVIDER=finger_ppg \
VITALLENS_PROXY_ENABLED=false \
STORE_RAW_MEDIA=false \
ENABLE_PROVIDER_TRACING=false \
pnpm --filter @homerounds/web exec next start --hostname 127.0.0.1 --port 3000
```

This loopback development identity profile is the local recovery route. It is not the protected hosted shape and must be labelled “local synthetic recovery.” Do not enable provider keys.

## Seed, reset, readiness, and check

In a second terminal with the same inherited database environment:

```bash
curl --fail --silent --show-error http://127.0.0.1:3000/api/readiness
pnpm demo:seed --base-url http://127.0.0.1:3000
pnpm demo:check --base-url http://127.0.0.1:3000
```

Expected: readiness says `ready`; each of `maya-happy-text`, `maya-poor-quality`, and `maya-red-flag` is ready; every line reports `postgres`; the scoped clinician queue is empty.

Before each run after the first:

```bash
APP_ENV=development DEMO_MODE=true pnpm demo:reset --base-url http://127.0.0.1:3000
pnpm demo:check --base-url http://127.0.0.1:3000
```

If any line reports `in_memory_demo_fallback`, stop. If reset scope/database identity is uncertain, stop rather than retrying destructively.

## Primary story: no-key closed loop

Time box: 3:00, excluding the operator's reset/check.

1. Open `/round?scenario=maya-happy-text`; point out “fictional/synthetic/not clinically validated.”
2. Start the round and use structured text. Say: “Voice is optional; this release path needs no provider key.”
3. Confirm the structured red-flag answers. Say: “Code owns safety, quality, protocol, and actions.”
4. Until the physical gate closes, do **not** promise a live pulse. Use the camera step only as an explicitly unvalidated attempt. If it fails, select the visibly labelled recorded-synthetic recovery only after the control appears.
5. Read the recorded-recovery label aloud. If the one structured follow-up appears, answer and confirm it; never force a branch.
6. Confirm the programme task exactly once, refresh, and show saved state.
7. Open the clinician cockpit for that round; show no hidden raw media, evidence/protocol provenance, owner/service window, and audit references.
8. Save a synthetic note, acknowledge, record contact, and complete. Return to the patient page and show persisted completion.

Pass: one task, no duplicate, deterministic provenance visible, patient completion visible, no console/page error, and every recorded/live distinction spoken accurately.

## Recovery story: poor-quality abstention

1. Reset/check; open `/round?scenario=maya-poor-quality`.
2. Complete structured text and start the supported/injected poor-quality path.
3. Use at most one coached retry. Never turn `retry`, `fail`, `unknown`, or provider success alone into a number.
4. Continue without a measurement/allow deterministic abstention.
5. In the clinician cockpit show “No numeric measurement accepted,” quality reasons, the review task, duplicate suppression, and raw-media absence.
6. Complete the clinician loop and verify the patient projection.

Pass: zero measurement facts/numbers for the failure, one task, quality reason/protocol evidence, completion propagated.

## Safety story: red-flag hard stop

1. Reset/check; open `/round?scenario=maya-red-flag`.
2. Submit the checked-in structured red-flag answers.
3. Confirm the ordinary flow stops before any assessment request or camera control.
4. Read the generic prototype/emergency limitation; do not add clinical advice.
5. Confirm guidance shown and state: “No diagnosis was made and no real clinical service was contacted.”

Pass: no assessment request, no measurement, deterministic stop, generic limitation, no claim of real escalation.

## Access denial and session recovery

For a protected demo deployment, `/access` must issue patient and clinician sessions only after the exact-origin shared-code exchange. A wrong code must receive generic denial; cookies must be `Secure`, `HttpOnly`, and `SameSite=Strict`.

- Wrong code: do not reveal whether the code, role, patient, or destination was wrong.
- Expired/invalid role cookie: return to `/access`; never edit cookies or add a development role header to a hosted environment.
- Repeated denial/rate limit: stop retries and wait for the bounded limiter window; inspect only safe status/correlation metadata.
- Protected environment unavailable: do not weaken access. Switch openly to the rehearsed local PostgreSQL profile and label it local recovery.

Hosted access remains unobserved (`W-01`); the prior protected-local inspection is not a hosted pass.

## Database/readiness failure

Symptoms: readiness is non-200/not `ready`, runtime is not `postgres`, seed/check fails, state differs between patient/clinician, or a cold start loses state.

1. Stop presentation writes and retain only safe timestamp, SHA, runtime profile, correlation IDs, and scenario IDs.
2. Confirm the intended synthetic database and migration state without printing the URL.
3. Restart/reconnect PostgreSQL; rerun readiness, `demo:seed`, and `demo:check`.
4. If hosted, follow [release/rollback](../operations/release-deploy-rollback.md); do not silently use in-memory state.
5. If recovery cannot return `postgres` inside 60 seconds, open `/demo-backup/recovery-storyboard.html` from the running app or use the canonical static [recorded recovery storyboard](../../public/demo-backup/recovery-storyboard.html). Announce it before showing it.

## No-key provider fallback

- ElevenLabs unavailable/missing/quota/permission: end the session and use structured text; do not troubleshoot voice during the demo.
- VitalLens unavailable/missing/low quality: persist no measurement and continue with manual/text evidence; never silently substitute providers in the same round.
- Finger PPG unavailable/permission denied/poor quality: one coached retry if permitted, then explicitly selected recorded-synthetic recovery or poor-quality abstention.
- The static cue card is [public/demo-backup/operator-cue-card.txt](../../public/demo-backup/operator-cue-card.txt). Every screen/asset must remain visibly labelled recorded synthetic recovery.

## Rollback cues

| Cue                                                                                | Action                                                                                                                                                                             |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cosmetic issue; safety/recovery intact                                             | Record it; continue only if claims remain accurate.                                                                                                                                |
| Provider/voice failure                                                             | Disable provider for the next deployment or use text/no-key path; do not change optical provider mid-round.                                                                        |
| Duplicate/corrupt task, wrong scope, audit mutation, red-flag bypass, false number | Stop immediately; preserve safe IDs; stop writes; roll back to the last verified code/database pair.                                                                               |
| Readiness/database/migration failure                                               | Stop writes; restore/switch to a verified branch/database; rerun migration checks and `demo:check`. Code rollback alone may be insufficient.                                       |
| Secret/raw media/unexpected real data                                              | Remove public traffic, disable providers, rotate credentials, preserve minimal safe evidence, and follow the [incident runbook](../operations/incident-recovery-observability.md). |
| Environment unavailable during judged demo                                         | Announce “recorded synthetic recovery, not live,” show the static storyboard/cue card, and make no hosted/device/provider claim.                                                   |

## Shutdown and record

Stop the app normally. Stop the local PostgreSQL service using the operations runbook; do not remove volumes unless the database is explicitly disposable and the exact target is confirmed. Record candidate SHA, operator, scenario/run, timings, readiness/runtime, deviations, waiver IDs invoked, and claim changes without secrets, URLs, patient-like data, transcripts, or raw media.
