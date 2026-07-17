# HomeRounds worktree orchestration plan

Status: execution-ready plan  
Planning date: 16 July 2026  
Target: a credible, production-shaped hackathon vertical slice by 15:00 on 18 July 2026

## 1. Operating model

The build is a sequence of checkpoints. A checkpoint is complete only after all of its worker branches are merged into the integration branch, reviewed there, and the checkpoint gates pass. The next checkpoint always starts from that tested integration commit.

This is intentionally not a free-running pool of agents. Parallel work is used only where file ownership is exclusive and the contract at the boundary is already frozen.

The workspace is now an initialized `main` repository linked to `https://github.com/AbhinavGupta707/eMed.git`, but it has no baseline commit yet. Checkpoint 0 therefore still happens in the shared integration workspace before any worktree is created.

### Orchestrator responsibilities

The orchestrator is the only owner of:

- repository-wide dependency and lockfile changes;
- root configuration, CI wiring, environment examples, and `AGENTS.md`;
- shared contracts after a checkpoint has started;
- schema migration ordering after the first persistence lane lands;
- cross-lane integration fixes;
- branch merge order, checkpoint validation, deployment, and final release decisions.

Workers must not install dependencies or opportunistically edit a neighbouring module. A missing dependency or contract change is a handoff request to the orchestrator.

### Codex worktree workflow

After Checkpoint 0 creates a Git repository and baseline commit, the orchestrator should use the Codex app project/worktree flow from the `orchestrate-worktrees` skill:

1. Identify the registered project with `codex_app__list_projects`.
2. Create each worker task with `codex_app__create_thread`, targeting that project with `environment.type = "worktree"`.
3. Record the returned task/thread ID, pending setup ID if any, worktree path, base commit, file allowlist, and expected checks in the checkpoint log.
4. Monitor with the thread-list/read tools; do not continuously interrupt an active worker.
5. Review a worker's diff and checks before merging its branch.
6. Merge branches sequentially in the documented dependency order, testing the integration branch after each merge.
7. Retire the worker task/worktree only after its commit is merged and recorded.

Do not substitute hidden sub-agents or manually improvised `git worktree` directories for this workflow.

### Worker model and reasoning policy

Every managed worktree is created with an explicit `model: "gpt-5.6-sol"`; workers must not silently inherit a different configured default. Use `thinking: "high"` for bounded, straightforward implementation, visual-system, test-execution, documentation, and evidence-assembly lanes. Use `thinking: "xhigh"` (extra-high reasoning) for complex provider, API/orchestration, state-machine, persistence/concurrency, security, or clinical-safety lanes.

| Checkpoint | Lane                              | Model         | Reasoning | Rationale                                                                                   |
| ---------- | --------------------------------- | ------------- | --------- | ------------------------------------------------------------------------------------------- |
| 2          | 2A voice/text                     | `gpt-5.6-sol` | `xhigh`   | provider session lifecycle, client-secret isolation, transcript confirmation, outage safety |
| 2          | 2B API/actions/audit              | `gpt-5.6-sol` | `xhigh`   | transactions, concurrency, idempotency, redaction, provider proxies                         |
| 2          | 2C visual system                  | `gpt-5.6-sol` | `high`    | bounded design-system and accessibility implementation                                      |
| 3          | 3A patient experience             | `gpt-5.6-sol` | `xhigh`   | full state machine, sensors, cancellation, resume, safety recovery                          |
| 3          | 3B clinician cockpit              | `gpt-5.6-sol` | `xhigh`   | evidence integrity, audited mutations, shared persisted workflow                            |
| 4          | 4A patient E2E                    | `gpt-5.6-sol` | `high`    | bounded black-box automation against frozen product behavior                                |
| 4          | 4B clinician E2E                  | `gpt-5.6-sol` | `high`    | bounded black-box automation against frozen product behavior                                |
| 4          | 4C contract/integration expansion | `gpt-5.6-sol` | `xhigh`   | mutation, adversarial, transaction-failure, and deterministic replay coverage               |
| 4          | 4D operations/security            | `gpt-5.6-sol` | `xhigh`   | CI, deployment, threat model, incident and rollback boundaries                              |
| 5          | 5A submission/claim audit         | `gpt-5.6-sol` | `high`    | evidence-bound narrative and claim verification                                             |
| 5          | 5B QA/recovery evidence           | `gpt-5.6-sol` | `high`    | bounded evidence assembly with explicit waivers                                             |

The orchestrator records the selected model and reasoning effort alongside every worker task ID in the state ledger. A change to this allocation is a documented orchestration decision, not an implicit fallback.

## 2. Ownership rules

### Permanent integration-owned paths

These paths are never assigned to a parallel worker:

```text
/package.json
/pnpm-lock.yaml
/pnpm-workspace.yaml
/turbo.json
/tsconfig*.json
/eslint.config.*
/next.config.*
/.env.example
/AGENTS.md
/README.md
/.codex/**
/packages/contracts/**       after the checkpoint contract freeze
/infra/db/migrations/**      after Checkpoint 1
```

The root `next.config.*` rule applies if the web app is rooted at the repository root. With the proposed monorepo, `apps/web/next.config.*` is also integration-owned because it affects every web lane.

### Merge-conflict prevention

- One path has one owner in a checkpoint, including barrel files and test fixtures.
- Workers receive an explicit allowlist and a do-not-touch list.
- No worker runs package-manager install commands or edits the lockfile.
- No two lanes create migrations. The persistence lane owns migrations during Checkpoint 1; all later changes are serialized through integration.
- The design-system lane alone owns global CSS and shared UI primitives.
- Route owners may edit only their own route groups and feature directories.
- Shared contract changes stop the affected checkpoint. The orchestrator updates the contract on integration, commits it, and respawns/rebases impacted lanes from the new base.
- Generated files are either committed by one named owner or regenerated centrally; they are not independently produced in multiple branches.

### Worker completion contract

Every worker handoff must contain:

1. branch/task ID and base commit;
2. files changed;
3. behaviour implemented and deliberately excluded;
4. commands run and exact results;
5. dependencies or contract changes requested but not made;
6. risks, assumptions, and manual checks still required;
7. one clean commit containing only in-scope changes.

## 3. Timeline and checkpoints

Times are elapsed focused build hours, not wall-clock promises. At the event, the orchestrator should rebase these blocks onto the actual 20-hour build window and reserve at least the final five hours for integration, device QA, rehearsal, and submission.

The worktree count is fixed per checkpoint from the dependency graph below, not globally. This project has one active orchestrator and Codex worktree tasks rather than a four-person human team. At most three workers should run concurrently so the orchestrator retains capacity for review and integration. A checkpoint with four total worktrees runs them in a `3 + 1` wave, starting the fourth only when one of the first three has handed off.

| Checkpoint                    | Elapsed hours | Outcome                                                               | Worktrees created | Peak concurrent |
| ----------------------------- | ------------: | --------------------------------------------------------------------- | ----------------: | --------------: |
| 0. Registration and baseline  |         0–1.5 | first commit, scaffold, frozen contracts, provider-neutral boundaries |                 0 |               0 |
| 1. Deterministic foundations  |       1.5–5.5 | data/domain, protocol/planner, local PPG and VitalLens adapters       |                 4 |     3 (`3 + 1`) |
| 2. Services and design system |         5.5–9 | API/actions/audit, provider-neutral voice, UI kit                     |                 3 |               3 |
| 3. End-to-end product slice   |          9–13 | patient round and clinician cockpit; integration owns demo wiring     |                 2 |               2 |
| 4. Hardening                  |         13–16 | automated suites, accessibility, deployment, security/ops             |                 4 |     3 (`3 + 1`) |
| 5. Release validation         |       16–18.5 | QA evidence, submission assets, physical-device/browser proof         |                 2 |               2 |
| 6. Freeze and submission      |       18.5–20 | three clean runs, backup, video, submission                           |                 0 |               0 |

The counts are intentional: foundations have four bounded contexts because the two optical providers own disjoint implementations and run in a `3 + 1` wave; product wiring benefits from only two route owners; hardening has four independent evidence domains but is capacity-staged; release has two documentation/evidence lanes while the orchestrator performs live validation.

## 4. Checkpoint 0 — registration, scaffold, and contract freeze

Owner: orchestrator/integration only.

### Work

1. Verify the already-linked `origin` is `https://github.com/AbhinavGupta707/eMed.git` and that the empty remote has not acquired unrelated commits.
2. Create the planning/source baseline commit on `main`; do not push secrets, `.DS_Store`, generated output, or real health data.
3. Freeze a provider-neutral optical contract and comparison rubric. Physical iPhone preflight may occur here if the phone and credentials are available; otherwise record it as a Checkpoint 5 release-selection gate. Local PPG remains the no-key default and VitalLens must report `unavailable` cleanly when its key/proxy is absent.
4. Scaffold the pnpm/Turborepo layout from `01_TECHNICAL_ARCHITECTURE.md`.
5. Resolve current stable package versions against the installed Node 22.22.2 toolchain, install once, and commit the exact lockfile. Record Node 24 as a post-event compatibility gate rather than making workers depend on an unavailable runtime.
6. Configure strict TypeScript, ESLint, formatting, Vitest, Playwright, environment parsing, and root check scripts.
7. Create the first version of `packages/contracts` containing the shared IDs, round state, structured report, measurement fact, protocol result, task, and event schemas. Freeze normalized optical and voice-provider contracts before workers start; provider-specific payloads must not leak into them.
8. Create minimal package barrels and compile-only stubs so every future lane has a valid import target.
9. Add synthetic-only data rules, secret-handling rules, file ownership rules, and check commands to `AGENTS.md`.
10. Register/verify the Git-backed project in Codex and create the checkpoint log.

### Frozen boundary

The contract package is frozen at the Checkpoint 0 commit. Workers may raise a change request but may not edit it.

### Exit gate

```bash
git status --short
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: a clean worktree after the baseline commit; all commands green; no real patient data, secrets, or untracked generated files; provider contracts and the physical comparison rubric recorded; remote linkage verified. If actual iPhone evidence is unavailable, the release gate is explicitly `pending-physical` rather than guessed.

## 5. Checkpoint 1 — deterministic foundations

Create four worktree tasks from the exact Checkpoint 0 integration commit, with at most three active concurrently. Start 1A, 1B, and 1C; start 1D only after one of those tasks hands off. No provider lane may edit the normalized core contract.

### Lane 1A — clinical data, domain, and persistence

Exclusive paths:

```text
packages/domain/**
packages/persistence/**
packages/clinical-records/**
data/fhir/**
infra/db/**
```

Deliverables:

- explicit round-state transition reducer and invalid-transition errors;
- repositories for rounds, facts, tasks, action attempts, and audit events;
- PostgreSQL/Drizzle schema and initial migration;
- transactional event append with actor, source, timestamps, correlation ID, and before/after state;
- unique idempotency key on action execution;
- a narrow clinical-record adapter that returns only the snapshot the round needs;
- one curated, internally consistent, clearly fictional FHIR R4 bundle;
- normalization of conditions, medicines, observations, care plan, time validity, and provenance;
- missing, conflicting, and stale-data fixtures that preserve unknowns;
- repository integration tests against an ephemeral/local PostgreSQL database.

This is one lane because clinical normalization and repository provenance share the same data boundary and transaction model. It must not implement UI, model calls, protocol logic, a live EHR server, or a broad FHIR framework.

### Lane 1B — protocol and planner

Exclusive paths:

```text
packages/protocols/**
packages/planner/**
data/protocols/**
```

Deliverables:

- closed, Zod-validated JSON protocol DSL;
- deterministic red-flag, quality, threshold, follow-up, and allowed-action evaluation;
- at-most-one-follow-up planner;
- versioned fictional cardiometabolic demo protocol;
- evidence/source metadata on every rule;
- exhaustive decision-table tests, including abstention and missing facts.

Must not evaluate arbitrary JavaScript, YAML expressions, or model-generated rules.

### Lane 1C — local finger-PPG provider

Exclusive paths:

```text
packages/assessments/providers/finger-ppg/**
```

Deliverables:

- local rear-camera finger-PPG implementation against the frozen normalized contract;
- browser capability, secure-context, permission, rear-camera, optional-torch, and lifecycle detection;
- injectable frame source for deterministic tests;
- bounded capture lifecycle with explicit cancel/cleanup;
- local signal extraction in a Web Worker;
- quality metrics, heart-rate estimate only when valid, and structured failure reasons;
- synthetic-waveform, prerecorded-fixture, cadence, saturation, motion/noise, and teardown tests;
- guarantee that raw frames are never persisted, emitted by the package result API, or transmitted.

Must not edit assessment core/barrels, implement VitalLens, rhythm diagnosis, HRV/respiratory claims, or file upload. Do not add MediaPipe.

### Lane 1D — VitalLens face-rPPG provider

Exclusive paths:

```text
packages/assessments/providers/vitallens/**
```

Deliverables:

- VitalLens client adapter against the same frozen normalized contract;
- injectable transport and deterministic provider fixtures, including no-key, timeout, quota, processing-failed, poor-quality, and valid responses;
- explicit consent metadata and front-camera lifecycle/cleanup;
- no browser key and no direct production provider URL; the live transport targets a HomeRounds proxy contract implemented by Lane 2B;
- provider/model/version provenance and normalized quality/failure reasons;
- proof that provider-specific responses and raw/downsampled frames never enter persistence or logs;
- an `unavailable` state that preserves text/manual-evidence workflow when credentials or the proxy are absent.

Must not edit assessment core/barrels, implement local PPG, expose respiratory-rate/HRV outputs, claim medical-device validity, or create a root dependency. Any SDK dependency request is integrated centrally after review.

### Merge order and gate

1. Merge 1A and run database/domain/clinical-record tests.
2. Merge 1B and run all protocol and planner decision tables.
3. Merge 1C and run local PPG assessment tests in browser-capable CI.
4. Merge 1D and run VitalLens contract/transport/privacy tests.
5. Orchestrator wires the provider registry and release flag, resolves only boundary-level integration issues, and adds an integration test from snapshot → trigger → planned assessment → protocol result for both fixtures.

Checkpoint exit:

- all Checkpoint 0 commands green;
- migrations apply from an empty database and reproduce the expected schema;
- every protocol decision is deterministic for a fixed input;
- a quality-failed capture produces no measurement fact;
- no raw frame appears in persistence or logs; when local finger PPG is selected, none appears on the network; when VitalLens is selected, only its documented downsampled inference payload crosses the proxied third-party boundary;
- dependency audit and secret scan have no unreviewed high-severity finding.

## 6. Checkpoint 2 — services and design system

Spawn exactly three worktrees from the tested Checkpoint 1 integration commit. Contracts remain frozen.

### Lane 2A — provider-neutral voice and text parity

Exclusive paths:

```text
packages/voice/**
apps/web/src/features/voice/**
```

Deliverables:

- `VoiceSessionProvider` implementations for ElevenLabs and `disabled`, plus deterministic transcript fixtures;
- ElevenLabs React/WebRTC session wrapper and the server-call contract for short-lived authenticated credentials;
- phase-scoped report proposals that can produce only schema-valid structured reports or narration acknowledgements;
- live tentative/final transcript display, explicit user edit/confirmation, microphone state, timeout, reconnect and text fallback;
- no-key, denied-microphone, quota, network, malformed-event and provider-outage paths;
- prohibited-diagnosis/urgency/medication prompt tests;
- feature flag making the workflow fully usable without voice or a model key.

The voice provider never selects urgency, executes actions, answers required questions on the patient's behalf, or writes around the application state machine. OpenAI Realtime and self-hosted LiveKit are explicitly not implemented in this checkpoint.

### Lane 2B — application API, actions, and audit

Exclusive paths:

```text
packages/actions/**
packages/audit/**
apps/web/src/app/api/**
apps/web/src/server/**
packages/api-client/**
```

Deliverables:

- allowlisted task/action executors;
- deterministic idempotency key derivation;
- same-day-review task with owner, priority, reason, status, and SLA;
- atomic attempt/success/failure audit events;
- safe patient message templates derived from protocol outcome;
- duplicate, retry, partial-failure, and concurrency tests;
- demo identity/session boundary;
- endpoints for snapshot, round lifecycle, structured report, assessment fact, action, clinician queue, ElevenLabs short-lived session credentials, and the VitalLens proxy;
- strict schemas, typed error envelopes, correlation IDs, rate limits, redacted logs, and real-repository integration tests;
- orchestration service that invokes deterministic packages in the required order.

API and actions are combined because the endpoint transaction boundary must own idempotent action execution and audit append. Splitting them would create a high-conflict shared contract with little independent value.

### Lane 2C — visual system

Exclusive paths:

```text
packages/ui/**
apps/web/src/app/globals.css
apps/web/src/app/styleguide/**
```

Deliverables:

- calm light medical palette, accessible typography, spacing, focus and motion tokens;
- buttons, fields, cards, status chips, stepper, alert, drawer/dialog, table/list, evidence panel, empty/error/loading states;
- minimum 44×44 targets, visible 3–4px focus, reduced-motion support, and high contrast;
- responsive styleguide at 320, 375, 414, 768, 1024, 1280, 1440, and 1920 px;
- component accessibility tests.

Avoid dark sci-fi styling, decorative AI gradients, marketing-page horizontal scroll, and motion that competes with clinical status.

### Merge order and gate

1. Merge 2B and verify API/action/audit transactions and idempotency.
2. Merge 2A and verify token/client-secret isolation plus text fallback against the API.
3. Merge 2C; UI primitives must not alter existing service contracts.
4. Orchestrator wires any missing root dependencies and runs the first full service integration test.

Checkpoint exit:

- ElevenLabs, VitalLens, database, and optional model-provider keys never enter a client bundle;
- voice/model outage leaves a resumable round with text fallback;
- duplicate action execution creates one task and an auditable duplicate attempt;
- logs contain no raw frames, transcript by default, secret, or unredacted clinical free text;
- lint, typecheck, unit, integration, build, axe component checks, and migration replay are green.

## 7. Checkpoint 3 — end-to-end product slice

Spawn exactly two worktrees from the tested Checkpoint 2 commit. The orchestrator owns cross-surface demo fixtures and integration wiring while these route owners work in parallel.

### Lane 3A — patient experience

Exclusive paths:

```text
apps/web/src/app/(patient)/**
apps/web/src/features/patient/**
apps/web/src/features/workflows/**
apps/web/src/features/shared-round/**
```

Deliverables:

- welcome/consent and synthetic-data disclosure;
- round status, conversational check-in with voice/text parity, selected-measurement preparation/capture/quality retry, one possible structured follow-up, action confirmation, and resumable states;
- explicit permission-denied, unsupported-device, offline, model-outage, and capture-failure paths;
- no definitive diagnosis or unsafe medication instruction;
- UI-facing controllers/hooks for all round states, including resume, cancel, timeout, navigation/media cleanup, typed error mapping, and optimistic rollback.

### Lane 3B — clinician cockpit

Exclusive paths:

```text
apps/web/src/app/(clinician)/**
apps/web/src/features/clinician/**
```

Deliverables:

- priority queue, synthetic patient and programme context;
- concise evidence chain from source → report → measurement/quality → rule/version → task/action;
- event timeline, clinician notes/edit/acknowledge/complete controls;
- visible owner/SLA, abstention/missing-information state, and audit reference;
- responsive compact/comfortable layout without dashboard theatre.

### Integration work during the two lanes

The orchestrator exclusively owns:

```text
data/demo/**
scripts/demo/**
public/demo/**
```

Integration deliverables:

- idempotent seed/reset/check scripts;
- one happy-path fictional patient, one poor-quality case, one red-flag case;
- labelled recorded-valid-capture replay for camera failure only;
- no mechanism that changes a real measured value or silently switches to replay;
- deterministic clock/fixture controls limited to explicit demo mode.

### Merge order and gate

1. While workers run, the orchestrator implements and verifies the demo seed/reset tooling against the frozen APIs.
2. Merge 3A, then run patient/workflow and accessibility checks.
3. Merge 3B, then run clinician and accessibility checks.
4. Orchestrator completes the patient-to-clinician integration, fixes only integration-owned boundaries, and verifies reset/fallback assets.

Checkpoint exit:

- happy path completes in no more than three minutes without manual database intervention;
- a live valid measurement may alter whether the one structured follow-up is asked, but cannot alone force an unsafe scripted outcome;
- low-quality capture does not generate a measurement and leads to retry/abstention/review as defined;
- clinician and patient surfaces reflect one persisted round and one audit chain;
- reset returns the application to a known seed without deleting unrelated data.

## 8. Checkpoint 4 — hardening

Create exactly four worktrees, but run a maximum of three concurrently. Wave A launches 4A, 4B, and 4C from the tested Checkpoint 3 commit. After those lanes are merged and their centrally owned product defects are fixed, Wave B launches 4D from the updated integration commit. Feature work is closed; workers add tests and operations artifacts within exclusive paths. Product-code defects are reported to integration, not patched across lane boundaries.

### Lane 4A — patient E2E

Exclusive paths:

```text
tests/e2e/patient/**
tests/accessibility/patient/**
tests/performance/patient/**
```

Automate text happy path, mocked-valid capture, poor capture, denied permission, unsupported camera, ElevenLabs/no-key text fallback, refresh/resume, safe cancellation, responsive/accessibility assertions, and patient-path performance budgets.

### Lane 4B — clinician E2E

Exclusive paths:

```text
tests/e2e/clinician/**
tests/accessibility/clinician/**
tests/performance/clinician/**
```

Automate queue creation, evidence inspection, idempotent duplicate request, clinician edit/acknowledge/complete, audit timeline, stale/missing data, patient status propagation, responsive/accessibility assertions, and cockpit performance budgets.

### Lane 4C — unit/contract/integration expansion

Exclusive paths:

```text
tests/unit/**
tests/contract/**
tests/integration/**
```

Complete the traceability matrix, protocol mutation/edge cases, API schema compatibility, repository transaction failure, security boundaries, model-tool contract fixtures, and deterministic replay tests.

### Lane 4D — operations, deployment, and security documentation

Exclusive paths:

```text
.github/**
infra/deploy/**
docs/operations/**
docs/security/**
```

Deliverables: CI workflow, hosted HTTPS deployment manifest, local PostgreSQL/runbook, secret/retention/logging notes, threat model, incident/rollback/demo recovery procedures. Root commands and configuration changes remain orchestrator-owned.

### Merge order and gate

Merge 4C first and let the orchestrator address deterministic failures. Merge 4A and 4B separately, addressing product defects after each. Then launch/merge 4D and run the complete release gate. This `3 + 1` sequencing preserves four evidence owners without exceeding the useful concurrency of one orchestrator plus three workers.

Checkpoint exit:

```bash
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:contract
pnpm test:integration
pnpm test:e2e
pnpm test:a11y
pnpm build
pnpm audit --audit-level high
```

Also require: clean migration from empty DB, secret scan, client-bundle key inspection, raw-media network/storage assertion, and zero unreviewed serious/critical axe violations.

## 9. Checkpoint 5 — release validation

Create exactly two worktrees from the hardened Checkpoint 4 integration commit. Neither may edit application code.

### Lane 5A — submission and claim audit

Exclusive path: `docs/submission/**`.

Prepare the event submission, architecture narrative, demo script, judge-fit proof, screenshots list, and a claim/limitation audit. Every claim must map to implemented evidence.

### Lane 5B — QA evidence and recovery assets

Exclusive paths:

```text
docs/qa/**
public/demo-backup/**
```

Assemble automated results, device/browser matrix, release checklist, open waivers, and clearly labelled recovery media. It consumes evidence supplied by the orchestrator; it does not invent a passing physical-device result.

The orchestrator:

1. deploys the exact integration commit to the primary hosted HTTPS environment;
2. applies migrations and seeds fictional data;
3. uses the in-app browser or Chrome control for desktop patient/clinician flows and responsive viewports;
4. uses the available physical iPhone 12 with current Safari as the primary live sensor proof; an Android/Chrome run is optional only if a device becomes available;
5. verifies camera, optional torch, microphone, denial/re-grant, low light, motion, background/resume, network loss, and text fallback;
6. inspects network calls and persisted records: local finger PPG must send no frames, while a selected VitalLens backend must send only its documented downsampled proxied payload and persist none;
7. exercises clinician action, idempotent retry, patient confirmation, and reset;
8. records exact device, OS, browser, network, commit, model alias, protocol version, and result in `docs/qa`;
9. rehearses presenter and operator roles with primary and recovery paths.

Xcode Simulator and Safari responsive mode are useful for layout/navigation smoke tests. They are not evidence for a physical camera, torch, optical signal, real permission lifecycle, or thermal behaviour. The MVP is a PWA; the physical iPhone is mandatory for its sensor claim.

Exit gate:

- hosted deployment and local recovery build both work;
- the primary physical-device path succeeds;
- all scenario rows in `03_REQUIREMENTS_AND_TEST_PLAN.md` have evidence or a named waiver;
- three consecutive clean demonstrations from reset complete inside the time budget;
- recorded fallback is clearly labelled and verified;
- both release-evidence worktrees are merged and their claims agree with the tested release;
- no new high-severity defect remains open.

## 10. Checkpoint 6 — freeze and submission

Owner: orchestrator/integration only. No worktrees and no feature changes.

1. Tag the release candidate and record the commit hash.
2. Run the complete gate once more from a clean install/database.
3. Execute three timed demo runs: normal, recovery, normal.
4. Verify submission links, QR code, credentials, backup video, local build, charger/network plan, and synthetic-data labels.
5. Review claims against actual evidence; remove clinical-accuracy, diagnosis, or production-readiness overclaims.
6. Commit final documentation, ensure `git status --short` is empty, and tag the submitted release.

## 11. Standard worker prompt

Use this template when creating every worktree task:

```text
You own <lane> for HomeRounds at base commit <hash>.

Launch contract (recorded by the orchestrator):
- model: gpt-5.6-sol
- reasoning: <high|xhigh>

Goal:
<bounded outcome>

Exclusive allowlist:
<paths>

Do not edit:
- root config or lockfiles
- packages/contracts
- any path assigned to another lane
- migrations unless this prompt explicitly assigns them

Required behaviour and acceptance:
<bullets>

Required checks:
<commands/tests>

If a dependency or contract is missing, do not work around the boundary. Record a concrete request in the handoff. Make one scoped commit and report files, tests, exclusions, risks, and the commit hash.
```

## 12. Merge review checklist

For every worker branch, the orchestrator must:

- confirm the base commit and diff stay within the allowlist;
- inspect for lockfile/root/shared-contract/migration violations;
- read the implementation, not only the worker summary;
- run the lane-specific checks in the worker tree if results are uncertain;
- merge without squashing unrelated history unless the workflow requires it;
- run affected integration checks on `main` immediately;
- record merge commit, check results, and follow-up defects;
- never merge two branches at once;
- stop the checkpoint if the shared contract is wrong.

## 13. Scope cuts under time pressure

Cut in this order while preserving the core claim:

1. optional reasoning-model summary;
2. voice embellishments beyond a short check-in and narration;
3. clinician note editing polish;
4. secondary iOS validation;
5. hosted recovery niceties;
6. live optical path only if physical-device validation fails, replacing it with explicitly labelled historical/manual evidence and changing the project claim accordingly.

Never cut deterministic safety, measurement quality gating, idempotency, audit evidence, text fallback, synthetic-data disclosure, or the patient-to-clinician closed loop.
