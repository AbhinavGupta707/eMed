# HomeRounds orchestration state

Updated: 17 July 2026  
Master: current local Codex task `019f6d18-258a-7a41-9ddd-e5d145f2ee5d`  
Goal: active  
Integration branch: `main`
Heartbeat: `homerounds-orchestration-heartbeat`, active every 20 minutes

## Current checkpoint

- Checkpoint: 1 — deterministic foundations
- Status: wave 1 launch pending
- Tested Checkpoint 0 commit: `b519010`
- Integration base: `b519010` on `main`, pushed to `origin/main`
- Next gate: create lanes 1A, 1B, and 1C from the exact Git-backed base; record task IDs before starting 1D
- Physical iPhone gate: `pending-physical` (does not block automated implementation)
- Live ElevenLabs gate: `pending-credentials` (text/disabled provider required)
- Live VitalLens gate: `pending-explicit-opt-in-and-credentials` (fixture adapter required)
- Hosted Vercel/Neon gate: `pending-account-login` (local profile required)
- GitHub visibility: verified `PUBLIC`; source/fixtures must remain synthetic and secret-free

## Checkpoint lane ledger

| Checkpoint | Lane                       | Ownership                                                                                                      | Task/thread | Base        | Status         | Integrated commit |
| ---------- | -------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------- | ----------- | -------------- | ----------------- |
| 1          | 1A data/domain/persistence | `packages/domain/**`, `packages/persistence/**`, `packages/clinical-records/**`, `data/fhir/**`, `infra/db/**` | pending     | `b519010` | pending        | —                 |
| 1          | 1B protocol/planner        | `packages/protocols/**`, `packages/planner/**`, `data/protocols/**`                                            | pending     | `b519010` | pending        | —                 |
| 1          | 1C local finger PPG        | `packages/assessments/providers/finger-ppg/**`                                                                 | pending     | `b519010` | pending        | —                 |
| 1          | 1D VitalLens               | `packages/assessments/providers/vitallens/**`                                                                  | pending     | `b519010` | pending wave 2 | —                 |

## Integration invariants

- At most three worker tasks active.
- Checkpoint 1 runs `1A + 1B + 1C`, then `1D` when one slot returns.
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
