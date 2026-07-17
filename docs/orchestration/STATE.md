# HomeRounds orchestration state

Updated: 17 July 2026 05:18 BST  
Master: current local Codex task `019f6d18-258a-7a41-9ddd-e5d145f2ee5d`  
Goal: active  
Integration branch: `main`
Heartbeat: `homerounds-orchestration-heartbeat`, active every 20 minutes
Sleep guard: macOS `caffeinate -dimsu` session `9002`, active until approximately 13:19 BST on 17 July 2026; Codex must remain open

## Current checkpoint

- Checkpoint: 4 — verification, hardening, operations and security
- Status: Checkpoint 4 Wave A is integrated and conclusively tested; Wave B lane 4D is ready to launch from the exact tested Wave A integration commit
- Tested Checkpoint 0 commit: `b519010`
- Tested Checkpoint 1 integration commit: `2116d4c` on `main`
- Current integration head: `3fd9697`
- Checkpoint 2 worker launch base: `aae76d3a6fce26ee7ef8b8024839556f3c5570ad`
- Tested Checkpoint 2 integration commit: `48ab92e` on `main`
- Checkpoint 3 worker launch base: `48ab92ebad2137390f01ef9976ef8a7d1b248da5`
- Tested Checkpoint 3 integration commit: `5534083` on `main`
- Checkpoint 4 Wave A launch base: `566ab8175e16f184c2617c86792ef80c18873014`
- Tested Checkpoint 4 Wave A integration commit: `3fd9697` on `main`
- Next gate: launch 4D with explicit `gpt-5.6-sol`/`xhigh` from `3fd9697`; integrate and test its operations/security artifacts before Checkpoint 4 exit
- Physical iPhone gate: `pending-physical` (does not block automated implementation)
- Live ElevenLabs gate: `pending-credentials` (text/disabled provider required)
- Live VitalLens gate: `pending-explicit-opt-in-and-credentials` (fixture adapter required)
- Hosted Vercel/Neon gate: `pending-account-login` (local profile required)
- GitHub visibility: verified `PUBLIC`; source/fixtures must remain synthetic and secret-free

## Checkpoint lane ledger

| Checkpoint | Lane                       | Ownership                                                                                                                                          | Task/thread                            | Base      | Model/reasoning       | Status                                                      | Integrated commit |
| ---------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | --------- | --------------------- | ----------------------------------------------------------- | ----------------- |
| 1          | 1A data/domain/persistence | `packages/domain/**`, `packages/persistence/**`, `packages/clinical-records/**`, `data/fhir/**`, `infra/db/**`                                     | `019f6d6f-b784-7882-af20-ac4d14cce6d4` | `7374d22` | legacy/pre-policy     | integrated; lane and real PostgreSQL gate passed            | `148a3a3`         |
| 1          | 1B protocol/planner        | `packages/protocols/**`, `packages/planner/**`, `data/protocols/**`                                                                                | `019f6d6f-b784-7882-af20-ac6a1e5afcef` | `7374d22` | legacy/pre-policy     | integrated; 39 lane tests plus full integration gate passed | `ad419fe`         |
| 1          | 1C local finger PPG        | `packages/assessments/providers/finger-ppg/**`                                                                                                     | `019f6d6f-b969-7180-9181-200678a737e5` | `7374d22` | legacy/pre-policy     | integrated; 22 lane tests plus full integration gate passed | `7b7c7af`         |
| 1          | 1D VitalLens               | `packages/assessments/providers/vitallens/**`                                                                                                      | `019f6d80-70a5-7733-89d1-44804892cb29` | `ad419fe` | legacy/pre-policy     | integrated; 27 lane tests plus full integration gate passed | `e7873a9`         |
| 2          | 2A voice/text              | `packages/voice/**`, `apps/web/src/features/voice/**`                                                                                              | `019f6d9e-969b-7330-a675-e8ce51f58962` | `aae76d3` | `gpt-5.6-sol`/`xhigh` | integrated; text/no-key and provider failure paths passed   | `1e4428e`         |
| 2          | 2B API/actions/audit       | `packages/actions/**`, `packages/audit/**`, `packages/api-client/**`, `apps/web/src/app/api/**`, `apps/web/src/server/**`                          | `019f6d9e-96a0-7dd3-867e-287eb53ec786` | `aae76d3` | `gpt-5.6-sol`/`xhigh` | integrated; action/API/audit safety suite passed            | `fcab99d`         |
| 2          | 2C visual system           | `packages/ui/**`, `apps/web/src/app/globals.css`, `apps/web/src/app/styleguide/**`                                                                 | `019f6d9e-9789-71a3-bc30-3c7f1fbfa11f` | `aae76d3` | `gpt-5.6-sol`/`high`  | integrated after stagnation recovery; browser gate passed   | `bd9b85a`         |
| 3          | 3A patient experience      | `apps/web/src/app/(patient)/**`, `apps/web/src/features/patient/**`, `apps/web/src/features/workflows/**`, `apps/web/src/features/shared-round/**` | `019f6ddb-9db9-7ce1-b44e-4e25ecee4813` | `48ab92e` | `gpt-5.6-sol`/`xhigh` | integrated; clean allowlisted handoff and browser evidence  | `20b4206`         |
| 3          | 3B clinician cockpit       | `apps/web/src/app/(clinician)/**`, `apps/web/src/features/clinician/**`                                                                            | `019f6ddb-9de0-7033-9aad-8adc2f37b5ba` | `48ab92e` | `gpt-5.6-sol`/`xhigh` | integrated; clean allowlisted handoff and browser evidence  | `57c29c7`         |
| 4          | 4A patient E2E             | `tests/e2e/patient/**`, `tests/accessibility/patient/**`, `tests/performance/patient/**`                                                           | `019f6e2e-9abf-70b1-ad74-b44b026b1239` | `566ab81` | `gpt-5.6-sol`/`high`  | integrated; patient defect fixed centrally; all gates pass  | `1d56b70`         |
| 4          | 4B clinician E2E           | `tests/e2e/clinician/**`, `tests/accessibility/clinician/**`, `tests/performance/clinician/**`                                                     | `019f6e2e-9abf-70b1-ad74-b4261f8909e2` | `566ab81` | `gpt-5.6-sol`/`high`  | integrated; functional, accessibility and performance pass  | `7e23c96`         |
| 4          | 4C contract/integration    | `tests/unit/**`, `tests/contract/**`, `tests/integration/**`                                                                                       | `019f6e2e-9f5d-7011-a580-8caecf40b082` | `566ab81` | `gpt-5.6-sol`/`xhigh` | integrated; audit-payload defect fixed; 27/27 tests pass    | `996ecde`         |
| 4          | 4D operations/security     | `.github/**`, `infra/deploy/**`, `docs/operations/**`, `docs/security/**`                                                                          | pending                                | `3fd9697` | `gpt-5.6-sol`/`xhigh` | ready to launch from tested Wave A base                     | pending           |

## Integration invariants

- At most three worker tasks active.
- Effective from Checkpoint 2, every isolated task is explicitly launched with `gpt-5.6-sol`; `high` is used for bounded lanes and `xhigh` for complex lanes according to the frozen matrix in the orchestration plan.
- Checkpoint 3 ran `3A + 3B` concurrently with exclusive file allowlists; both handed off clean commits and were integrated in order. The orchestrator retained `data/demo/**`, `scripts/demo/**`, `apps/web/public/demo/**`, cross-lane server seams, and integration tests.
- Checkpoint 4 Wave A uses exactly three concurrent worktrees from `566ab81`: 4A and 4B use `high`; the more complex adversarial/transaction lane 4C uses `xhigh`. Wave B 4D uses `xhigh` and launches only after Wave A is integrated and tested.
- Checkpoint 4 Wave A merged in its required order: 4C (`996ecde`), 4A (`1d56b70`), then 4B (`7e23c96`). The orchestrator fixed both reported product defects centrally and exposed reproducible root verification commands in `3fd9697`.
- Workers start from the exact tested checkpoint commit.
- Integration owns root configuration, the lockfile, shared contracts, provider registry/barrels, cross-lane tests, checkpoint commits, pushes, deployments, and release claims.
- No checkpoint advances on a failing gate. Human-only/live gates are marked pending and cannot be silently relabelled as passing fixture evidence.

## Blockers and decisions

- None blocking local implementation.
- In-app Browser initialization failed in the current runtime before page control; the CP0 user-perspective fallback ran in Playwright Chromium and iPhone-sized WebKit with axe. Retry the in-app Browser at later UI checkpoints and do not mislabel this as physical Safari evidence.
- Release provider is not selected. Local PPG is the no-key default; both adapters are implemented and compared later.
- ElevenLabs is the hosted voice primary. OpenAI Realtime, LiveKit, browser Web Speech, voice biomarkers, respiratory rate, HRV, OCR, wearables, and live EHR integrations remain out of the hackathon path.
- Neutral action wording: `programme review requested`; any same-day window is visibly `demo-only` until clinical review.
- A live `pnpm audit` rerun was denied by the runtime because it would send this private repository's dependency graph and private workspace package names to npm. No workaround was attempted. The previously successful Checkpoint 2 audit remains the latest external advisory result; Checkpoint 4 must add a privacy-approved CI/Dependabot or explicitly user-approved audit route before release evidence is claimed current.

## Checkpoint 0 evidence

- Pinned Node 22.22.2, pnpm 10.33.0, Next.js 16.2.10, React 19.2.7, TypeScript 5.9.3, and exact lockfile.
- Formatting, ESLint, strict TypeScript, 8 unit/contract tests, and production build pass sequentially.
- Playwright Chromium and iPhone-sized WebKit E2E both pass the baseline disclosure and serious/critical axe gate.
- `pnpm audit --audit-level moderate` reports no known vulnerabilities after pinning PostCSS 8.5.10 for CVE-2026-41305.
- Secret-pattern, ignored-path, large-file, and Git whitespace audits pass; `.env.example` contains only local/example values.

## Checkpoint 1 evidence

- All four lanes were independently reviewed and integrated, followed by cross-lane provider-neutral snapshot-to-plan-to-protocol tests for both finger PPG and VitalLens fixtures.
- The assessment package passes 57 tests; the protocol/planner, domain, clinical-record, and persistence suites also pass their deterministic fixtures and failure paths.
- A disposable PostgreSQL 16 database accepted the migration and passed all 13 live repository tests; timestamp values are normalized centrally at the repository boundary.
- Full formatting, lint, strict TypeScript, unit/integration tests, production build, Chromium and iPhone-sized WebKit Playwright, serious/critical axe, dependency audit, secret scan, raw-media persistence scan, and frame-network scan gates passed.
- Live credentials, physical iPhone evidence, and hosted deployment remain explicitly pending and were not represented as fixture evidence.

## Checkpoint 2 shared-base evidence

- Integration pre-registered the five exclusive worker packages, internal workspace links, and exact `@elevenlabs/react` `1.10.1`; workers must not mutate manifests or the lockfile.
- Frozen install, formatting, lint, strict TypeScript, all existing tests, production build, desktop Chromium and iPhone-sized WebKit E2E with accessibility checks, dependency audit, and Git whitespace checks pass before worker launch.

## Checkpoint 2 integration evidence

- Lane commits `dd9b002` (API/actions/audit), `d93f71c` (voice/text), and `07cdefb` (visual system) were reviewed and integrated in dependency order; lane ownership remained exclusive. The stalled 2C turn was interrupted through Codex handoff, its dirty worktree state was preserved on its lane branch, and the orchestrator completed only the bounded accessibility recovery before merge.
- The server exposes strict snapshot, round, report, assessment, action, queue, ElevenLabs-session, and VitalLens-proxy routes with demo identity, correlation, origin, rate-limit, validation, redaction, and typed no-key behavior. Provider output can propose only; deterministic application code owns protocol and action authority.
- Voice/text parity includes a provider-neutral state machine, ephemeral editable transcript confirmation, cancellation/reconnect/timeouts, a disabled/text provider, and a server credential fetcher that maps only a short-lived WebRTC token into the client contract. No provider API key or agent configuration enters the client bundle.
- The visual system includes responsive shells, fields, buttons, cards, banners, status/quality/progress/evidence/task states, explicit recovery states, and keyboard-operable dialog/drawer primitives. The rendered style guide has one main landmark and unique navigation labels.
- Repository-wide formatting, 13-package lint, strict TypeScript, all unit/integration suites, and the production build pass. The web package passes 44 tests; voice passes 20; UI passes 11; the assessment package remains at 57 tests.
- Six Playwright tests pass across desktop Chromium and the iPhone-12/mobile project. The style guide passes zero-violation axe checks (including an open modal), transcript confirmation, Escape close, explicit drawer close, baseline disclosures, and horizontal-overflow checks at 320, 375, 414, 768, 1024, 1280, 1440, and 1920 px.
- A disposable PostgreSQL 16 cluster accepted `0001_homerounds_foundations.sql` from empty state and passed all 13 live repository tests. `pnpm audit --audit-level moderate` reports no known vulnerabilities.
- Client-bundle secret-name inspection, source credential scan, Git whitespace/ignored/large-file review, raw-media persistence scan, transcript-storage scan, and logging scan pass. Live provider calls, hosted Neon/Vercel, and physical iPhone evidence remain pending human/credential gates and were not represented as automated evidence.

## Checkpoint 3 demo-tooling evidence

- Integration owns three exact synthetic scenarios: happy text path, poor-quality capture with no measurement, and structured red-flag hard stop. Their trigger namespace is `homerounds-demo:v1:` and all three produce deterministic round IDs.
- The recorded-valid-capture recovery asset is browser-served from `apps/web/public/demo/**`, visibly labelled, contains no raw media or patient data, and declares that demo mode, a prior live-capture failure, and explicit user selection are mandatory. Automatic substitution and modification of a real measurement are forbidden.
- `pnpm test:demo` passes five policy/tooling tests covering scenario validation, production refusal, exact SQL scope, transaction/dependency order, and replay policy.
- A fresh disposable PostgreSQL 16 database accepted the migration. Through a real local HomeRounds server, `demo:seed` and `demo:check` created and verified all three invited/version-0 rounds with an empty scoped clinician queue.
- The happy scenario was advanced to `red_flag_screen`/version 1, then `demo:reset` transactionally removed only the three exact seeded trigger IDs, reseeded them through the public API, and restored the baseline. A second reset produced the same baseline, while an unrelated synthetic control round survived both resets.
- The reset refuses `APP_ENV=production`, requires `DEMO_MODE=true` and `DATABASE_URL`, never truncates, and temporarily disables the append-only audit delete trigger only inside its exact-scope transaction. The full repository format, 13-package lint, strict typecheck, unit/integration suites, and production build remain green after the tooling change.

## Checkpoint 3 integration-seam evidence

- The API now accepts an attestation-bound non-passing capture outcome separately from a passing measurement. A retry moves `capturing` to `capture_retry`; a terminal failure atomically persists a raw-media-free quality event, creates no measurement, and deterministically moves to `abstained_for_review` with the exact protocol result.
- A retry creates a new assessment session from `capture_retry`; the server never substitutes another provider. Protocol-result revalidation reconstructs the latest persisted quality failure so the abstention task remains executable and idempotent.
- The one returned structured follow-up now has a strict patient-only endpoint. Its answer is atomically audited with the first transition, re-evaluated by the versioned protocol, and moves only to `action_pending` or `abstained_for_review`; a model cannot supply or execute it.
- Affected audit, persistence, API-client, and web suites pass; the web suite now has 46 tests, including full poor-quality retry/fail/task and one-follow-up paths. Affected lint and repository-wide strict typecheck pass.
- A clinician-only task-detail and mutation boundary now exposes the persisted evidence chain and supports note, acknowledgement, contact-attempt, and completion operations with strict role checks, optimistic concurrency, deterministic idempotency keys, immutable audit events, and atomic round completion. The in-memory and live PostgreSQL repositories verify duplicate suppression, stale-write refusal, append-only audit behavior, and `awaiting_clinician` to `outcome_ready` completion in one transaction.
- The shared-base repository remains green at 13 package suites after these seams: 46 web tests, 57 assessment tests, 20 voice tests, and all domain, protocol, persistence, audit, action, UI, and API-client tests pass. The live/provider/physical gates remain pending rather than simulated.

## Checkpoint 3 integrated experience evidence

- Patient lane `4f3a58f2` and clinician lane `458e5932` were reviewed as clean, exclusive allowlist handoffs and integrated as merge commits `20b4206` then `57c29c7`. Both workers used explicit `gpt-5.6-sol`/`xhigh`; no hidden/default model selection was accepted.
- The integration adds three deterministic launcher stories, no-key text completion, explicit optical permission and quality recovery, exactly one coached retry, no numeric measurement on failed/unsupported capture, explicit labelled recorded-synthetic recovery, and a structured red-flag hard stop.
- The patient and clinician surfaces use real local APIs. The clinician queue/detail view exposes evidence provenance and raw-media absence, while note, acknowledgement, contact, and completion mutations use optimistic concurrency, stable operation keys, persisted receipts, and audit references.
- A patient refresh now receives only its scoped persisted task projection. This prevents a completed poor-quality review task from being misrepresented as still waiting while preserving `abstained_for_review` as the terminal measurement-round state.
- Repository gates pass: Prettier, 13-package ESLint, strict TypeScript, all 13 package suites, 92 web tests, five demo-tooling tests, and the full production build. Six baseline/style-guide Playwright tests pass across Chromium and iPhone-12 WebKit layout, including axe and overflow checks.
- A separate full browser journey passed against both the in-memory profile and a fresh PostgreSQL 16 profile: text report, unsupported/no-measurement capture, deterministic task, clinician note/acknowledge/contact/complete, patient completion refresh, zero serious/critical axe findings, zero console/page errors, and no overflow at 1440px or 320px.
- The PostgreSQL migration applied from empty state and all 13 persistence tests passed with the live repository enabled. The final synthetic poor-quality record contains zero measurements, one completed task, 13 audit events, and zero raw-frame/audio/transcript/key-pattern matches in audit payloads.
- Client-bundle credential-name, source transcript logging, Git whitespace, tracked-ignored-file, and committed-large-file checks pass. Generated Turbo cache archives are ignored and not committed. The in-app Browser remains unavailable because its runtime fails during initialization; Playwright evidence is not labelled as physical Safari/iPhone evidence.

## Checkpoint 4 Wave A evidence

- Three exclusive worktrees launched from exact base `566ab81` with explicit `gpt-5.6-sol`: bounded patient and clinician browser lanes used `high`; the adversarial contract/persistence lane used `xhigh`. Their clean worker commits were `5a424b8`, `cd037cb`, and `dcba064`.
- The adversarial lane exposed a real privacy-boundary defect: standalone audit-event writes accepted recursively nested transcript, raw-frame, and credential-bearing payload keys. Integration added one shared recursive guard for both in-memory and PostgreSQL repositories in `06c5bf4`; all 27 new unit, contract, and integration tests now pass.
- The patient E2E lane exposed a real recovery defect: after a rejected capture consumed its one-time assessment session, the view hid both retry and explicitly selected recorded-synthetic recovery controls. Integration fixed the view invariant in `3a91212`, kept safe refresh recovery when ephemeral quality evidence is absent, and isolated the mutating patient suite from the root smoke matrix.
- Patient verification passes 3/3 functional journeys covering no-key text, explicit failed-capture replay, unsupported/no-measurement cancellation, and red-flag hard stop. Its accessibility suite passes keyboard, touch-size, permission-denial, responsive 320–1920 px, and zero serious/critical axe findings. Its warmed performance budgets pass, including load/render, refresh, and CLS limits.
- Clinician verification passes 3/3 functional journeys covering persisted no-measurement review, evidence provenance, duplicate suppression, note/acknowledge/contact/complete, stale-write refusal, missing/invalid scope, and patient completion propagation. Its responsive/keyboard/axe suite and warmed LCP/CLS/ready/API budgets pass.
- The root six-case Chromium and iPhone-12 layout smoke matrix remains separate and green. Repository-wide Prettier, 13-package lint, strict TypeScript, all 13 package suites, 13 unit tests, 7 contract tests, 7 integration tests, 92 web tests, five demo-tooling tests, and the production build pass.
- A fresh disposable PostgreSQL 16 cluster on isolated port 55437 applied the migration and passed all 14 persistence tests, including atomic idempotency, optimistic concurrency, append-only audit enforcement, and the new sensitive-payload refusal. The server stopped cleanly afterward.
- Secret-pattern and raw-media/key source reviews found no committed credential. Expected fake canaries remain confined to tests, and `.env.example` contains only empty provider placeholders plus a local example database URL. The runtime refused the current live npm advisory upload because it would disclose the private workspace dependency graph; Checkpoint 2 remains the latest successful external advisory result pending a privacy-approved CI/Dependabot route.
- Live providers, hosted Vercel/Neon, physical iPhone sensor behavior, and real Safari permission/thermal evidence remain named human gates. Playwright iPhone layout evidence is not relabelled as physical-device validation.
