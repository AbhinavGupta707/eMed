# Autonomous orchestration runbook

The durable execution design is specified in `planning/02_WORKTREE_ORCHESTRATION_PLAN.md` and `planning/08_VOICE_TEXT_AND_AUTONOMOUS_EXECUTION.md`. This file is the concise operator loop.

## Resume

1. Read `docs/orchestration/STATE.md`.
2. Run `git status --short` and confirm the recorded integration commit.
3. Inspect active checkpoint task IDs before creating anything.
4. If a worker completed, read its handoff, inspect its diff/commit and verify clean status.

## Worker model policy

- Launch every new worktree with explicit model `gpt-5.6-sol`.
- Use `thinking: "high"` for bounded, straightforward implementation or evidence lanes.
- Use `thinking: "xhigh"` for complex integration, provider, state-machine, concurrency, persistence, security, or clinical-safety lanes.
- Record model and reasoning effort in `STATE.md`; do not rely on an inherited default.
- Current allocation: 2A `xhigh`, 2B `xhigh`, 2C `high`; 3A `xhigh`, 3B `xhigh`; 4A `high`, 4B `high`, 4C `xhigh`, 4D `xhigh`; 5A `high`, 5B `high`.

## Integrate

1. Reject edits outside the lane allowlist, root/lockfile edits, secret/real-data leakage, unsupported claims, missing tests, or dirty worktrees.
2. Integrate in the plan's declared order.
3. Run focused tests after each lane and the full gate after the checkpoint.
4. Fix only integration-owned boundaries in `main`; send lane defects back to the owning task when practical.
5. Update the state ledger and commit the checkpoint before creating the next worktrees.

## No-key behavior

- ElevenLabs unavailable → `VOICE_PROVIDER=disabled`; complete text route.
- VitalLens unavailable → typed provider-unavailable state; local PPG and fixtures.
- Neon unavailable → local PostgreSQL.
- Vercel unavailable → local production build and deploy-ready instructions.
- iPhone unavailable → fixture/browser tests; retain `pending-physical`.

## Recovery

- Do not create a duplicate worker for slow/stalled work.
- Do not resolve a shared-contract conflict by duplicating types or weakening validation.
- Do not remove a failed safety/quality/idempotency/accessibility test to advance.
- After a contract change, commit integration and restart only affected lanes from the new exact base.
- Record external/human-only gates precisely and continue all independent work.

## Completion

Checkpoint 6 completes only after full checks, three clean automated demo runs, provider/no-key recovery proof, responsive/accessibility review, deployment/local runbook, claim audit, clean Git status, and explicit separation of physical/live evidence from fixture/simulator evidence.
