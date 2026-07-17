# Checkpoint 7 — AI-native live inference and external validation

**Status:** launch plan frozen; implementation not started  
**Updated:** 17 July 2026  
**Scope:** synthetic hackathon demo only; no clinical validation or real-patient use

## 1. Outcome

Checkpoint 7 turns HomeRounds from a deterministic workflow with optional AI voice into an AI-native product whose model output can change the evidence-gathering route in previously unseen synthetic scenarios. It does not transfer workflow authority to a model.

The target behavior is:

1. deterministic code creates an allowlisted set of evidence modules from the current round state;
2. Fireworks evaluates the bounded synthetic context and proposes one eligible module with structured reasons and uncertainty;
3. Zod validation, provenance checks, the red-flag gate, quality gate, protocol engine, and action allowlist accept, reject, or abstain;
4. the patient sees why a module was selected and confirms any extracted information before it becomes a fact;
5. provider absence, timeout, malformed output, or disagreement returns to a complete deterministic route without inventing a decision.

This is live inference, not a cached branching demo: the live-provider gate must show different valid proposals for at least two unseen contexts while the same deterministic policy remains authoritative.

## 2. Non-negotiable authority boundary

The model may propose only:

- one `candidateModuleId` already present in the server-created allowlist;
- bounded evidence references used from the supplied context;
- a concise patient-visible rationale;
- explicit uncertainty and missing-information fields;
- structured medication-label observations that remain unconfirmed.

The model may never:

- diagnose, prescribe, set or soften urgency, dismiss a red flag, or execute an action;
- create a new module/action ID, answer a required patient question, or mark a capture valid;
- modify a medication, protocol result, task owner/SLA, or persistence rule;
- receive real identifiers, raw voice audio, camera frames, hidden provider credentials, or unrelated history;
- expose or persist hidden chain-of-thought. Only the compact schema-valid rationale is retained.

If no candidate is safely supported, `abstain` is a first-class successful result.

## 3. Verified pre-flight evidence

### Fireworks

- A server-only `FIREWORKS_API_KEY` is present in the ignored local environment and the key is absent from tracked files and the production browser bundle.
- The live model catalogue returned successfully for the account.
- `accounts/fireworks/models/deepseek-v4-pro` with `reasoning_effort: "none"` returned a schema-valid module selection with `finish_reason: "stop"`.
- `accounts/fireworks/models/kimi-k2p6` with `reasoning_effort: "none"` returned a schema-valid result for a public-image vision request.
- Kimi K2.6 did **not** pass the text structured-output trial: both 128-token and 1,024-token attempts ended for length with invalid JSON. An early shell harness printed a misleading pass line after a parse error because it lacked fail-fast handling; the error was caught immediately and neither attempt is counted as a pass.
- One success is connectivity evidence, not release evidence. Every selected model/task pair still requires three consecutive exact-contract trials plus malformed, timeout, rate-limit, and provider-unavailable cases.

### ElevenLabs

- The saved key authenticated against the live ElevenAgents API.
- A dedicated `HomeRounds Voice Intake` agent was created and published with authentication enabled, all client overrides disabled, file attachments disabled, Zero Retention enabled, stored audio disabled by that mode, 120-second maximum conversations, 50 calls/day, one concurrent call, and bursting disabled.
- The key is restricted to ElevenAgents Write because ElevenLabs classifies signed WebRTC token issuance as `convai_write`; all unrelated endpoint scopes remain disabled and the credit cap is 2,500.
- A disposable signed WebRTC token returned successfully. A real browser microphone/audio/transcript/edit-confirm session remains a separate pending live test.
- The account uses the global ElevenLabs service, so configuration must use `ELEVENLABS_SERVER_LOCATION=global`; no EU-isolated-residency claim is allowed.

### Hosting

- Vercel project `abhinavs-projects-f1cef581/homerounds` exists and is locally linked.
- Root Directory is `apps/web`, source files outside the root are included, the framework is Next.js, frozen install/build overrides are set, and Node.js is 22.x.
- The Vercel GitHub App is connected to `AbhinavGupta707/eMed`; the owner UI and a live DOM inspection both show the repository connection, deployment-status events, repository-dispatch events, and commit status enabled.
- Vercel Marketplace resource `neon-beige-ferry` is connected. The observed Neon PostgreSQL version is 17.10, migration `0001_homerounds_foundations.sql` is applied, and all eight expected public tables exist.
- The remote PostgreSQL repository suite passes 14/14 when given its required 30-second external-service timeout. Its first default-timeout run passed 13/14 and failed only at Vitest's five-second limit; that run is not counted as a pass.
- The hosted Preview environment has the Neon runtime variables, safe synthetic-demo profile, unreadable-sensitive Fireworks/ElevenLabs values, and enabled provider switches for all Preview branches. The exact preview `APP_BASE_URL`, a successful preview deployment, and hosted browser evidence remain pending.
- The separate `gh` CLI credential is expired. Vercel's Git connection and read-only Git transport work, but authenticated push/PR creation must be revalidated before handoff.

## 4. Model routing and reasoning policy

HomeRounds uses a deterministic task router. Fireworks traffic routing is not treated as product reasoning, and the model does not choose its own authority or task.

| Task                                                                            | Initial candidate                                       | Model reasoning                            | Output budget                               | Release position                                                        |
| ------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------ | ------------------------------------------- | ----------------------------------------------------------------------- |
| Allowlisted module selection from compact structured context                    | `accounts/fireworks/models/deepseek-v4-pro`             | `none` initially                           | Small, strict JSON schema                   | Provisional default; live schema trial passed once                      |
| Medication package/label image extraction                                       | `accounts/fireworks/models/kimi-k2p6`                   | `none` initially                           | Bounded structured observations             | Provisional vision default; live vision trial passed once               |
| Conflicting multi-source evidence synthesis                                     | DeepSeek V4 Pro and GLM 5.1/5.2 candidates              | `high` only in an isolated evaluation path | Bounded evidence memo, then schema compiler | Disabled until latency, completion, grounding, and contract trials pass |
| Patient-visible rationale compiler                                              | Same validated selector model or deterministic template | `none`                                     | Two short sentences maximum                 | Never required for workflow progress                                    |
| Red flags, protocol evaluation, quality validity, urgency, actions, idempotency | No model                                                | Not applicable                             | Not applicable                              | Deterministic code only                                                 |

Rules:

1. Prefer the lowest reasoning setting that reliably satisfies the exact schema and evidence task. More reasoning is not assumed to be safer.
2. Long reasoning is never used on the synchronous happy path until it passes completion-rate, latency, grounding, and cost budgets.
3. If complex synthesis proves useful, use a two-stage boundary: an isolated reasoner creates a bounded evidence memo, then a low-reasoning compiler emits the strict contract. Hidden reasoning is neither requested for display nor persisted.
4. Kimi K2.6 is not used for text schema selection unless a new exact-version evaluation reverses the current failed result.
5. `gpt-oss-120b` is not the default because its current reasoning behavior cannot be disabled; it remains an evaluation candidate only.
6. Model aliases, task type, contract version, duration bucket, token counts, and outcome category may be stored. Prompts, raw provider payloads, images, transcripts, keys, and chain-of-thought may not.
7. LangChain is not a core dependency. Direct typed HTTP plus Zod is smaller and easier to audit; add an orchestration framework only after a measured need that the local boundary cannot meet.

## 5. Integration-owned pre-freeze

Before any worktree launches, the master orchestrator exclusively:

1. creates and commits the shared inference/medication contracts in `packages/contracts/**`;
2. registers the new package manifests, workspace links, scripts, environment schema, and exact dependencies centrally;
3. adds disabled/fake provider registry entries and fixtures so every worker starts from a green, keyless base;
4. freezes event names, persistence allowlists, provider error taxonomy, task IDs, and the no-key fallback;
5. runs format, lint, strict typecheck, all current tests, and production build;
6. records the exact launch commit in `docs/orchestration/STATE.md`.

No worker may add dependencies, edit the lockfile, duplicate a contract, weaken Zod validation, or place a provider type in a workflow package.

## 6. Adaptive worktree plan

At most three workers run concurrently. Every worker is explicitly launched with model `gpt-5.6-sol`; no inherited or lower model is permitted.

### Wave A — three build lanes

#### Lane 7A — inference foundation (`xhigh`)

Exclusive paths:

```text
packages/inference/src/**
packages/inference/README.md
```

Deliverables:

- injected Fireworks Chat Completions transport with timeouts, cancellation, retry budget, and redacted typed errors;
- task-aware model registry and deterministic routing policy;
- strict structured-output parsing, allowlist enforcement, abstention, provenance, and fake/disabled transports;
- no provider tracing or raw response persistence;
- fixture-driven tests for malformed JSON, extra fields, invented IDs, missing evidence, timeout, rate limit, cancellation, and fallback.

#### Lane 7B — medication multimodal module (`xhigh`)

Exclusive paths:

```text
packages/assessments/providers/medication-label/**
apps/web/src/features/medication/**
```

Deliverables:

- consent-first image capture/upload UI with explicit synthetic-demo instructions;
- client-side size/type/dimension checks and a derived preview that is cleared after the request;
- structured label observations with missing/uncertain states, never an automatic medication change;
- mandatory review/edit/confirm before a bounded medication fact may be proposed;
- cancellation, denial, unsupported-camera, malformed-image, provider-unavailable, and text-entry parity;
- zero raw image persistence and zero image bytes in audit/log payloads.

#### Lane 7C — adaptive Round Map and patient experience (`high`)

Exclusive paths:

```text
apps/web/src/features/round-map/**
apps/web/src/features/patient/**
```

Deliverables:

- a clear Round Map showing completed, selected, skipped, unavailable, and next evidence modules;
- patient-visible “why this was selected” and uncertainty copy with deterministic-template fallback;
- stable keyboard/touch flow, focus restoration, live-region behavior, reduced motion, and non-color statuses;
- explicit AI-unavailable, AI-abstained, stale-result, and retry states without losing confirmed progress;
- Maya happy-path and Aisha resilience story integration using only frozen contracts.

### Wave A integration gate

Merge order is 7A, 7B, then 7C. After each merge the orchestrator runs that lane's tests and inspects ownership, secrets, persistence, and client bundles. The orchestrator alone implements:

```text
apps/web/src/env.ts
apps/web/src/server/**
apps/web/src/app/api/inference/**
apps/web/src/app/api/providers/fireworks/**
apps/web/src/features/shared-round/**
packages/contracts/**
root manifests and pnpm-lock.yaml
cross-lane integration tests and fixtures
```

The integrated Wave A gate requires the complete keyless deterministic flow, fake-provider adaptive flow, medication confirmation flow, and all pre-existing safety/idempotency tests to pass before Wave B launches.

### Wave B — two independent validation lanes

#### Lane 7D — adversarial AI/contract evaluation (`xhigh`)

Exclusive paths:

```text
tests/ai/**
tests/contract/ai/**
tests/integration/ai/**
```

Required cases include prompt injection inside every untrusted field, invented action/module IDs, red-flag conflict, contradictory evidence, stale round versions, invalid quality, unconfirmed medication extraction, malformed/oversized image metadata, provider timeout/429/5xx, partial JSON, excessive tokens, retry exhaustion, and deterministic fallback equivalence.

#### Lane 7E — adaptive UX, accessibility, and performance (`high`)

Exclusive paths:

```text
tests/e2e/ai/**
tests/accessibility/ai/**
tests/performance/ai/**
```

Required journeys cover unseen-context route changes, AI abstention, medication review/edit/confirm, voice-to-editable-text, full text parity, refresh/resume, keyboard-only operation, iPhone-sized WebKit, 320–1,920 px overflow, reduced motion, axe serious/critical findings, console/page errors, and latency budgets with slow/error provider fixtures.

### Checkpoint 7 integration and release gate

The orchestrator merges 7D then 7E, fixes only integration-owned seams, and runs:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:unit
pnpm test:contract
pnpm test:integration
pnpm test:demo
pnpm build
pnpm test:e2e
pnpm test:e2e:patient
pnpm test:e2e:clinician
pnpm test:a11y
pnpm test:performance
git diff --check
```

Additional mandatory gates:

- client bundle and tracked-history secret scan;
- no raw image/audio/transcript/provider-payload persistence;
- exact Fireworks task/model/contract trial three consecutive times, plus failure recovery;
- live ElevenLabs microphone → visible editable transcript → explicit confirmation → bounded termination;
- PostgreSQL migration/repository suite and synthetic seed/check as `postgres`;
- hosted Vercel/Neon HTTPS readiness, separate patient/clinician sessions, cold-start persistence, headers/cookies, and rollback record;
- physical iPhone 12 Safari camera/microphone permission, denial/re-grant, low-light/motion, background/resume, network-loss, thermal, and text fallback observations;
- three consecutive end-to-end demo rehearsals on the exact release candidate.

Hosted, live-provider, and physical-device results remain separate evidence classes. A fixture or simulator cannot satisfy them.

## 7. Live inference acceptance

Fireworks is release-enabled only when all are true:

1. the exact model version and contract pass three consecutive live requests per enabled task;
2. two unseen synthetic contexts produce different eligible module proposals for evidence-backed reasons;
3. an ineligible or invented ID is rejected and cannot alter persisted workflow state;
4. a red-flag conflict is resolved by deterministic code regardless of model output;
5. provider timeout, malformed output, or quota exhaustion completes through the deterministic fallback;
6. no key, raw media, prompt, provider payload, transcript, or hidden reasoning appears in client bundles, logs, audit events, or database rows;
7. latency and credit use fit the demo budget, with explicit UI states during waits;
8. replaying the same accepted proposal is idempotent and stale round versions are rejected.

## 8. External setup sequence

1. **Complete:** connect the Vercel GitHub App to `AbhinavGupta707/eMed`.
2. **Complete:** provision and connect the official Neon Marketplace resource.
3. **Complete for the demo resource:** obtain pooled/direct server-only URLs without printing them, apply the checked-in migration, and verify the observed database version and schema. Region/retention claims remain limited to provider-observed settings.
4. **Complete:** add approved Fireworks/ElevenLabs server variables to all Preview branches through the official Vercel API as unreadable-sensitive values; no secret enters Git, logs, or a literal CLI argument.
5. **Pending after first preview:** set `APP_BASE_URL` to the exact HTTPS preview origin and redeploy.
6. **Pending after all local gates:** deploy and verify a preview before any production alias.
7. **Owner gate:** reconnect authenticated Git CLI access only if direct push or PR creation is required; Vercel Git deployment itself is already connected.
8. **Physical gate:** owner opens the HTTPS preview on the iPhone 12 for the named Safari camera/microphone checks; the web app requires no App Store/TestFlight build.

## 9. Heartbeat and recovery

Activate the task-attached 20-minute orchestration heartbeat only when Checkpoint 7 workers launch. It reads the state ledger, active tasks, Git status, and exact base commit; integrates completed lanes in order; runs gates; and launches only the next declared wave. It never duplicates a slow worker or relaxes a failed gate.

Recovery remains explicit:

- Fireworks missing/failing → deterministic selector and labelled AI-unavailable state;
- ElevenLabs missing/failing → complete text path;
- Neon/Vercel unavailable → local PostgreSQL production build, no hosted claim;
- physical iPhone unavailable → automated responsive/fixture evidence only, `pending-physical` retained;
- model contract insufficient → stop the affected lane and centrally amend/retest the contract; never use `any` or a duplicate schema.

## 10. Launch readiness

Checkpoint 7 may launch after the integration pre-freeze is green and committed. Vercel Git and Neon provisioning are complete, while Preview secrets, deployment, and hosted evidence remain post-integration gates. No additional “pre-flight attachment” is required.

No owner action blocks Wave A. Fireworks and ElevenLabs credentials are sufficient for implementation and safe live-provider tests. Authenticated Git CLI access is needed only if direct push/PR creation fails through the existing Git credential path; VitalLens remains optional and disabled until its separate data-boundary opt-in and key exist.

## 11. Primary provider references

- [Fireworks Chat Completions and reasoning controls](https://docs.fireworks.ai/api-reference/post-chatcompletions)
- [Fireworks structured outputs](https://docs.fireworks.ai/structured-responses/structured-response-formatting)
- [Fireworks recommended models](https://docs.fireworks.ai/guides/recommended-models)
- [Fireworks data handling](https://docs.fireworks.ai/guides/security_compliance/data_handling)
- [Fireworks vision-language requests](https://docs.fireworks.ai/guides/querying-vision-language-models)
- [ElevenLabs WebRTC token endpoint](https://elevenlabs.io/docs/api-reference/conversations/get-webrtc-token)
- [ElevenLabs authenticated agents](https://elevenlabs.io/docs/eleven-agents/customization/authentication)
- [ElevenLabs retention controls](https://elevenlabs.io/docs/eleven-agents/customization/privacy/retention)
- [Vercel monorepo deployment](https://vercel.com/docs/monorepos/turborepo)
- [Neon Vercel integration](https://neon.com/docs/guides/vercel-manual)
