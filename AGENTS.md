# HomeRounds repository instructions

These instructions apply to every Codex task and managed worktree in this repository.

## Product and safety boundary

- HomeRounds is a synthetic hackathon prototype, not clinically validated software. Do not add real patient data, names, identifiers, credentials, or unreviewed medical claims.
- The deterministic state machine, red-flag gate, protocol evaluator, capture-quality gate, action allowlist, and idempotency rules own workflow authority. Voice/model output may only propose schema-valid fields for explicit patient confirmation.
- Never convert a failed or uncertain optical capture into a measurement. Never persist raw camera frames or raw voice audio.
- Local finger PPG sends no frames. VitalLens may be live only through the server proxy with explicit consent and a server-only key; otherwise it must report `unavailable`.

## Worktree ownership

- Read `docs/orchestration/STATE.md` and your task prompt before editing.
- Edit only the paths explicitly assigned to the task. One path has one owner per checkpoint, including tests, fixtures, barrels, migrations, manifests, and generated files.
- Workers must not edit root manifests/configuration, `pnpm-lock.yaml`, `packages/contracts/**`, or `docs/orchestration/STATE.md` unless their prompt explicitly assigns them to integration work.
- Do not install dependencies in a worker. Record the smallest exact dependency request in the handoff; the orchestrator owns all root installs and lockfile changes.
- If the frozen contract is insufficient, stop and report the smallest proposed contract change. Do not work around it with `any`, duplicate schemas, or provider-specific leakage.
- Keep the worktree clean and commit the completed slice before handoff. Do not merge, rebase, cherry-pick, push, or edit another worker's branch.

## Implementation rules

- Use strict TypeScript and Zod at file, provider, API, protocol, event, and persistence boundaries.
- Preserve unknown/missing states; do not invent defaults that change a clinical or quality decision.
- Prefer pure deterministic functions, injected clocks/IDs/transports, explicit state transitions, exhaustive switches, and fixture-driven tests.
- Keys are server-only. No secret, provider key, database URL, or demo access secret may enter browser bundles, fixtures, logs, screenshots, or commits.
- No required check may need an external key. Live-provider tests are separate and skip with a visible reason when unavailable.
- Accessible text parity is mandatory: persistent labels, keyboard/touch support, visible focus, transcript edit/confirmation, non-color status, reduced motion, and meaningful error recovery.
- Do not add provider tracing, analytics, raw transcript logging, or media retention by default.

## Required handoff

Report:

1. summary and files changed;
2. commands run and exact results;
3. assumptions and remaining risks;
4. dependency or contract requests;
5. final commit SHA and clean `git status --short`.

Run the checks scoped to your slice plus `git diff --check`. The orchestrator runs full checkpoint gates after integration.
