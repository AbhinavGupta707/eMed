# HomeRounds orchestration state

Updated: 17 July 2026  
Master: current local Codex task `019f6d18-258a-7a41-9ddd-e5d145f2ee5d`  
Goal: active  
Integration branch: `main`
Heartbeat: `homerounds-orchestration-heartbeat`, active every 20 minutes
Sleep guard: macOS `caffeinate -dimsu` session `9002`, active until approximately 13:19 BST on 17 July 2026; Codex must remain open

## Current checkpoint

- Checkpoint: 2 — provider-neutral interaction, actions, API, and visual system
- Status: three isolated lanes active from the tested shared base
- Tested Checkpoint 0 commit: `b519010`
- Tested Checkpoint 1 integration commit: `2116d4c` on `main`
- Current integration head: `aae76d3`
- Checkpoint 2 worker launch base: `aae76d3a6fce26ee7ef8b8024839556f3c5570ad`
- Next gate: monitor without interfering, then review each clean worker commit for scope before sequential integration and full cross-lane promotion tests
- Physical iPhone gate: `pending-physical` (does not block automated implementation)
- Live ElevenLabs gate: `pending-credentials` (text/disabled provider required)
- Live VitalLens gate: `pending-explicit-opt-in-and-credentials` (fixture adapter required)
- Hosted Vercel/Neon gate: `pending-account-login` (local profile required)
- GitHub visibility: verified `PUBLIC`; source/fixtures must remain synthetic and secret-free

## Checkpoint lane ledger

| Checkpoint | Lane                       | Ownership                                                                                                                 | Task/thread                            | Base      | Model/reasoning       | Status                                                      | Integrated commit |
| ---------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | --------- | --------------------- | ----------------------------------------------------------- | ----------------- |
| 1          | 1A data/domain/persistence | `packages/domain/**`, `packages/persistence/**`, `packages/clinical-records/**`, `data/fhir/**`, `infra/db/**`            | `019f6d6f-b784-7882-af20-ac4d14cce6d4` | `7374d22` | legacy/pre-policy     | integrated; lane and real PostgreSQL gate passed            | `148a3a3`         |
| 1          | 1B protocol/planner        | `packages/protocols/**`, `packages/planner/**`, `data/protocols/**`                                                       | `019f6d6f-b784-7882-af20-ac6a1e5afcef` | `7374d22` | legacy/pre-policy     | integrated; 39 lane tests plus full integration gate passed | `ad419fe`         |
| 1          | 1C local finger PPG        | `packages/assessments/providers/finger-ppg/**`                                                                            | `019f6d6f-b969-7180-9181-200678a737e5` | `7374d22` | legacy/pre-policy     | integrated; 22 lane tests plus full integration gate passed | `7b7c7af`         |
| 1          | 1D VitalLens               | `packages/assessments/providers/vitallens/**`                                                                             | `019f6d80-70a5-7733-89d1-44804892cb29` | `ad419fe` | legacy/pre-policy     | integrated; 27 lane tests plus full integration gate passed | `e7873a9`         |
| 2          | 2A voice/text              | `packages/voice/**`, `apps/web/src/features/voice/**`                                                                     | `019f6d9e-969b-7330-a675-e8ce51f58962` | `aae76d3` | `gpt-5.6-sol`/`xhigh` | active                                                      | —                 |
| 2          | 2B API/actions/audit       | `packages/actions/**`, `packages/audit/**`, `packages/api-client/**`, `apps/web/src/app/api/**`, `apps/web/src/server/**` | `019f6d9e-96a0-7dd3-867e-287eb53ec786` | `aae76d3` | `gpt-5.6-sol`/`xhigh` | active                                                      | —                 |
| 2          | 2C visual system           | `packages/ui/**`, `apps/web/src/app/globals.css`, `apps/web/src/app/styleguide/**`                                        | `019f6d9e-9789-71a3-bc30-3c7f1fbfa11f` | `aae76d3` | `gpt-5.6-sol`/`high`  | active                                                      | —                 |

## Integration invariants

- At most three worker tasks active.
- Effective from Checkpoint 2, every isolated task is explicitly launched with `gpt-5.6-sol`; `high` is used for bounded lanes and `xhigh` for complex lanes according to the frozen matrix in the orchestration plan.
- Checkpoint 2 runs `2A + 2B + 2C` concurrently because their file allowlists are exclusive.
- Workers start from the exact tested checkpoint commit.
- Integration owns root configuration, the lockfile, shared contracts, provider registry/barrels, cross-lane tests, checkpoint commits, pushes, deployments, and release claims.
- No checkpoint advances on a failing gate. Human-only/live gates are marked pending and cannot be silently relabelled as passing fixture evidence.

## Blockers and decisions

- None blocking local implementation.
- In-app Browser initialization failed in the current runtime before page control; the CP0 user-perspective fallback ran in Playwright Chromium and iPhone-sized WebKit with axe. Retry the in-app Browser at later UI checkpoints and do not mislabel this as physical Safari evidence.
- Release provider is not selected. Local PPG is the no-key default; both adapters are implemented and compared later.
- ElevenLabs is the hosted voice primary. OpenAI Realtime, LiveKit, browser Web Speech, voice biomarkers, respiratory rate, HRV, OCR, wearables, and live EHR integrations remain out of the hackathon path.
- Neutral action wording: `programme review requested`; any same-day window is visibly `demo-only` until clinical review.

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
