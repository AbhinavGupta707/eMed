# Autonomous orchestration runbook

The durable execution design is specified in `planning/02_WORKTREE_ORCHESTRATION_PLAN.md` and `planning/08_VOICE_TEXT_AND_AUTONOMOUS_EXECUTION.md`. This file is the concise operator loop.

## Resume

1. Read `docs/orchestration/STATE.md`.
2. Run `git status --short` and confirm the recorded integration commit.
3. Inspect active checkpoint task IDs before creating anything.
4. If a worker completed, read its handoff, inspect its diff/commit and verify clean status.

## Hybrid monitoring

- Treat worker completion, failure, blocked handoff, scope drift, merge results, and gate results as immediate review boundaries whenever the app surfaces them.
- Keep the master heartbeat at 10 minutes as a recovery mechanism for interrupted turns, transient model-capacity pauses, and missed events. It is not a one-minute polling loop.
- Normal quiet reasoning, code editing, builds, and tests are not stagnation. Do not message a healthy active worker merely because its Git state has not changed during one observation.
- Suspect stagnation only when the same status and Git evidence remain unchanged across multiple observations, or when the task reports a capacity error, failed command, blocked decision, or mis-scoped work.
- Recover the existing task with the same model, reasoning effort, base, and ownership. Never create a duplicate to make a slow task look active.
- Monitor registration/discovery first, then Git/worktree state, then runtime/permissions. A missing task is not a runtime failure until its project/worktree registration is verified.
- Record the observation and exact recovery in `STATE.md` only when it changes checkpoint state, worker status, integration evidence, or a material risk.

## Worker model policy

- Launch every new worktree with explicit model `gpt-5.6-sol` in Fast mode. Repository-local `.codex/config.toml` pins `service_tier = "fast"` with the stable Fast-mode feature enabled.
- Use `thinking: "high"` for bounded, straightforward implementation or evidence lanes.
- Use `thinking: "xhigh"` for complex integration, provider, state-machine, concurrency, persistence, security, or clinical-safety lanes.
- Record model, reasoning effort, and Fast mode in `STATE.md`; do not rely on an inherited default.
- Allocation: 1A–1D `xhigh` if relaunched (their completed historical runs predate the policy); 2A `xhigh`, 2B `xhigh`, 2C `high`; 3A `xhigh`, 3B `xhigh`; 4A `high`, 4B `high`, 4C `xhigh`, 4D `xhigh`; 5A `high`, 5B `high`.
- Checkpoint 7 allocation: Wave A 7A inference foundation `xhigh`, 7B medication multimodal `xhigh`, 7C adaptive patient experience `high`; after integration, Wave B 7D adversarial AI evaluation `xhigh` and 7E UX/accessibility/performance `high`. See `planning/09_AI_NATIVE_CHECKPOINT_7.md` for exclusive paths and gates.
- Checkpoint 8 allocation: Wave A 8A ElevenLabs runtime `xhigh`, 8B local voice signal `xhigh`, 8C patient voice UI `high`; Wave B 8D adversarial contracts `xhigh`, 8E browser/accessibility/performance `high`.
- Checkpoints 9–11 allocation is frozen in `planning/11_FINAL_BLUE_SKY_PASS.md`: 9A `high`, 9B `xhigh`, 9C `xhigh`; 10A `xhigh`, 10B `high`, 10C `xhigh`, 10D `xhigh`; 11A `xhigh`, 11B `xhigh`, 11C `high`, 11D `xhigh`.

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

The unattended final pass completes only after Checkpoints 9, 10, and 11 are integrated sequentially from tested commits and the separate post-Checkpoint-11 release-closure acceptance in `planning/11_FINAL_BLUE_SKY_PASS.md` passes on the exact final commit and Vercel Preview. Every narrow and full available gate must pass; the Human Warmth, companion, sensing, baseline, memory, trigger, action, clinician, accessibility, privacy, and safety contracts must be reviewed; both timed demo stories must pass three consecutive rehearsals; Vercel/Neon and opted-in provider evidence must be recorded honestly; and physical iPhone/Windows checks remain explicitly `pending-physical` until the owner performs them.

Delete the Checkpoints 9–11 heartbeat only after no unattended implementation, integration, test, deployment, or documentation work remains. Do not call the product fully complete while a software-owned gate is failing or unrun.
