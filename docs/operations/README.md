# HomeRounds operations guide

HomeRounds is a synthetic-data hackathon PWA. These instructions make the implemented demo repeatable; they do not make it a medical device, a production clinical service, or suitable for real patient data.

No hosted deployment, live provider call, or physical iPhone test was performed by Checkpoint 4D. The hosted profile remains a human/account gate.

## Implemented runtime profiles

| Profile                   | Required settings                                                                                         | Persistence and identity                                                                                                                                       | Intended use                                                                                                |
| ------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Loopback development      | `APP_ENV=development`, `DEMO_MODE=true`, providers disabled/finger PPG                                    | PostgreSQL when `DATABASE_URL` is present; otherwise explicit `in_memory_demo_fallback`. Loopback requests may use the demo role header when no secret is set. | Local development and automated browser tests only.                                                         |
| Local PostgreSQL recovery | Development settings plus local `DATABASE_URL`                                                            | Durable local PostgreSQL and implicit loopback demo roles.                                                                                                     | Primary no-key operator recovery path.                                                                      |
| Protected synthetic demo  | `APP_ENV=demo`, exact HTTPS `APP_BASE_URL`, `DATABASE_URL`, `DEMO_ACCESS_SECRET`, `FHIR_PROVIDER=fixture` | Access-code exchange at `/access`, signed `Secure; HttpOnly; SameSite=Strict` demo cookie, and PostgreSQL.                                                     | Browser-operable synthetic hosted shape; still requires platform protection and is not real authentication. |
| Production                | `APP_ENV=production`, `DEMO_MODE=false`                                                                   | Not implemented.                                                                                                                                               | Startup validation rejects the only available fixture FHIR provider. Do not weaken this guard.              |

The Vercel platform may call a deployment “Production”; the application must still use `APP_ENV=demo` for this synthetic prototype. That naming difference must be recorded in the release log.

## Environment matrix

| Variable                      | Current accepted values and behavior                                                                                                                             | Classification            |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `APP_ENV`                     | `development`, `demo`, or `production`; production is not runnable with the fixture provider.                                                                    | Non-secret                |
| `APP_BASE_URL`                | Exact origin used by mutation-origin checks. A production-domain value does not work for a different preview URL.                                                | Non-secret                |
| `DATABASE_URL`                | PostgreSQL URL. Absence selects the in-memory fallback only in development; hosted `demo` startup rejects absence and readiness probes the repository.           | Server-only secret        |
| `PERSISTENCE_PROVIDER`        | `auto` normally; `memory` explicitly isolates development/tests and is rejected outside development; `postgres` requires `DATABASE_URL`.                         | Non-secret server setting |
| `DEMO_MODE`                   | Must be `true` for all current fixture/demo workflows; rejected in production.                                                                                   | Non-secret                |
| `DEMO_ACCESS_SECRET`          | At least 16 characters when set; signs one-hour demo-role cookies and derives the assessment-attestation secret. Rotate to invalidate issued demo sessions.      | Server-only secret        |
| `FHIR_PROVIDER`               | Only `fixture` exists.                                                                                                                                           | Non-secret                |
| `VOICE_PROVIDER`              | `disabled` is the no-key default. `elevenlabs` additionally requires key and agent ID.                                                                           | Non-secret selection      |
| `ELEVENLABS_API_KEY`          | Long-lived key used only by the server token endpoint.                                                                                                           | Server-only secret        |
| `ELEVENLABS_AGENT_ID`         | Provider configuration identifier; keep server-side with the key.                                                                                                | Server-only configuration |
| `ELEVENLABS_SERVER_LOCATION`  | `us`, `global`, `eu-residency`, or `in-residency`. A string alone does not grant residency; the account, key, processing, retention, and agent must be verified. | Server-only configuration |
| `VOICE_SESSION_MAX_SECONDS`   | Integer 15–300; demo default 120.                                                                                                                                | Non-secret                |
| `NARRATIVE_MODEL_PROVIDER`    | Only `disabled` exists.                                                                                                                                          | Non-secret                |
| `OPTICAL_ASSESSMENT_PROVIDER` | `finger_ppg` is the no-key default. `vitallens` requires proxy enablement and key at startup.                                                                    | Non-secret selection      |
| `VITALLENS_API_KEY`           | Used only by the HomeRounds server proxy.                                                                                                                        | Server-only secret        |
| `VITALLENS_PROXY_ENABLED`     | Must be `true` with a key when VitalLens is selected.                                                                                                            | Non-secret                |
| `STORE_RAW_MEDIA`             | Must remain `false`; startup rejects `true` in every profile.                                                                                                    | Non-secret safety control |
| `ENABLE_PROVIDER_TRACING`     | Keep `false`. It is parsed but no tracing integration is implemented.                                                                                            | Non-secret safety control |
| `LOG_LEVEL`                   | Parsed value only; no production logger is attached at this base.                                                                                                | Non-secret                |

Use [the checked-in local example](../../infra/deploy/hosted-demo.env.example) as a key-name checklist. Store values in the platform secret store, scope them per environment, and never download or commit a populated environment file.

## Operator release checklist

- [ ] Release SHA is recorded and the worktree is clean.
- [ ] Frozen install, formatting, lint, strict typecheck, all package/unit/contract/integration/demo tests, build, browser journeys, accessibility, and performance jobs pass for that SHA.
- [ ] The manual dependency-advisory workflow has a recorded privacy approval and a current successful result, or a named release waiver exists.
- [ ] GitHub secret scanning/Gitleaks has no unresolved credential.
- [ ] Migration was applied to an empty rehearsal branch and then to the target through a direct PostgreSQL URL.
- [ ] `demo:check` reports `postgres`, never `in_memory_demo_fallback`.
- [ ] The exact `APP_BASE_URL` matches the HTTPS origin being tested.
- [ ] `/access` exchanges the shared synthetic access code for patient and clinician sessions; wrong-code, origin, cookie, expiry, role, and redirect controls pass.
- [ ] The public deployment has platform deployment protection in addition to the application session boundary.
- [ ] Provider keys are absent for the no-key profile; any enabled provider has explicit consent, retention/residency review, quota, and owner approval.
- [ ] `STORE_RAW_MEDIA=false` and `ENABLE_PROVIDER_TRACING=false` are confirmed in the deployed environment.
- [ ] Patient and clinician paths read the same PostgreSQL state after a cold start.
- [ ] Local finger PPG network inspection or the selected VitalLens proxy boundary has separate observed evidence.
- [ ] Physical iPhone/Safari evidence remains `pending-physical` until actually completed.
- [ ] Rollback target, Neon restore point/branch, operator, and recovery communications are named before promotion.
- [ ] Synthetic-data, fictional-protocol, general-wellness, and non-clinical limitations are visible and consistent with the release claims.

## Related runbooks

- [Local PostgreSQL and migrations](./postgresql-and-migrations.md)
- [Release, hosted deployment, and rollback](./release-deploy-rollback.md)
- [Incidents, demo recovery, observability, and backups](./incident-recovery-observability.md)
