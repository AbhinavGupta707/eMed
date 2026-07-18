# Checkpoints 9–11 — final blue-sky product pass

Status: owner approved; pre-launch freeze in progress; no worker launched yet  
Prepared: 18 July 2026  
Integration branch: `main`  
Planning base: `19804c6e8fe8e64695495172d2a841b36756724a`  
Product boundary: synthetic hackathon prototype, not clinically validated software

## 1. Objective

Convert the tested Checkpoint 8 release candidate into a coherent, premium, phone-first adaptive home round:

1. start from personal longitudinal context on a laptop or phone;
2. conduct a live ElevenLabs conversation with visible confirmation;
3. use Fireworks to rank only server-eligible evidence modules;
4. send the selected task to a securely paired phone by QR when useful;
5. perform a quality-gated finger pulse, VitalLens face rPPG, local sustained-vowel signal, or medication-label review;
6. live-sync the result to the desktop without raw-media retention;
7. update a structured personal baseline and bounded memory;
8. apply deterministic safety/protocol rules;
9. complete one allowlisted synthetic care action;
10. show an auditable clinician handoff.

The final pass does not turn HomeRounds into a diagnostic agent. Models may converse, extract proposals, and rank eligible evidence. Deterministic code owns red flags, quality acceptance, urgency, protocol decisions, action allowlists, idempotency, and workflow state.

## 2. Current truth before the pass

| Capability                           | Current state                                                 | Final-pass work                                                                     |
| ------------------------------------ | ------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| ElevenLabs live browser conversation | implemented; live agent drift check passes                    | redesign and connect to phone-first journey                                         |
| Fireworks adaptive selection         | implemented; live exact-contract tests pass                   | expand eligible device-aware context, never action authority                        |
| Medication-label multimodal review   | implemented and quality/confirmation bounded                  | make phone-first and visually coherent                                              |
| Local finger PPG                     | implemented and fixture-tested                                | physical iPhone Safari evidence and cross-device delivery                           |
| Local voice signal                   | implemented; raw PCM local; hosted attempts honestly rejected | phone route, repeat-baseline comparison, physical pass/retry evidence               |
| VitalLens adapter/proxy              | typed and fixture-tested                                      | real browser front-camera gateway, consent, free-key configuration, live evaluation |
| Durable rounds/snapshots/tasks       | implemented in Neon/Postgres                                  | companion session, baseline series, structured preference/memory records            |
| Personalisation                      | bounded synthetic history context only                        | repeated-baseline and device/preference-aware presentation                          |
| Long-term memory                     | structured round/snapshot persistence only                    | consented structured memory projection; no raw transcript memory                    |
| Proactive behaviour                  | seeded deterministic trigger only                             | synthetic change-detection engine and persisted trigger explanation                 |
| Phone companion/QR/live sync         | not implemented                                               | short-lived one-time pairing and task/result sync                                   |
| Appointment/refill/care actions      | only programme task and emergency guidance exist              | synthetic allowlisted request flows with confirmation and audit                     |
| Phone call agent                     | deliberately deferred                                         | not part of Checkpoints 9–11                                                        |
| Premium Human Warmth UI              | references selected; code not implemented                     | full responsive redesign and validation                                             |
| Physical iPhone/Windows evidence     | pending                                                       | owner-assisted release gates                                                        |

## 3. Resolved product decisions

- Selected visual direction: **Human Warmth**; see [design specification](../docs/design/HUMAN_WARMTH_SPEC.md).
- Phone-first sensors, laptop alternatives when technically supported.
- One QR pairs the full round; do not scan a new QR for every task.
- Phone calls are deferred until the browser/companion flow is complete.
- VitalLens free tier is the intended live managed face-rPPG provider.
- Finger PPG remains the privacy-first local provider and fallback release path; the app never silently switches provider mid-session.
- Synthetic FHIR-shaped history remains the clinical-record source. No real eMed/EHR, wearable, pharmacy, appointment, or identity integration is claimed.
- Synthetic appointment, refill-review, and care-team-message actions may be completed as audited prototype workflows; the UI must not imply they reached a real service.
- No raw frames, video, PCM, full transcript, hidden reasoning, provider payload, prompt, or key is persisted.

## 4. Checkpoint structure

Three sequential checkpoints remain. They create **11 project-scoped worktree sessions** in total, with at most three active workers at once. Every worker uses `gpt-5.6-sol`; `high` is used for bounded visual/black-box lanes and `xhigh` for provider, persistence, concurrency, security, personalisation, or clinical-safety lanes.

| Checkpoint | Outcome                                                                         | Worktrees | Wave shape                                      |
| ---------- | ------------------------------------------------------------------------------- | --------: | ----------------------------------------------- |
| 9          | Human Warmth redesign plus secure laptop/phone companion                        |         3 | 2 build lanes, then 1 verification lane         |
| 10         | Phone-first sensing, live VitalLens, and repeatable personal baselines          |         4 | 3 build lanes, then 1 verification lane         |
| 11         | Proactive synthetic round, structured memory, closed actions, and final release |         4 | 3 build lanes, then 1 release-verification lane |

The next checkpoint starts only after the previous checkpoint is integrated, fully gated, documented, and committed on `main`.

## 5. Pre-launch integration freeze

The orchestrator completes and commits these items before launching Checkpoint 9:

- approve this plan and the Human Warmth specification;
- preserve the three reference images in `docs/design/references`;
- preserve and review all nine generated reference boards for consistency;
- add the companion/session contracts, package registration, migration outline, and API-client stubs centrally;
- define one-time token TTL, hashing, allowed task kinds, round/state-version binding, revocation, and polling semantics;
- ensure all old completed worktrees are clean before retiring them;
- verify `VITALLENS_API_KEY` from ignored local storage without logging it and propagate it to Vercel Preview before the first VitalLens deployment;
- keep `OPTICAL_ASSESSMENT_PROVIDER=finger_ppg` until Checkpoint 10 passes live/physical gates;
- record the exact launch commit in `docs/orchestration/STATE.md`.

## 6. Checkpoint 9 — Human Warmth and secure companion

### User-facing outcome

Maya starts a calm voice-led round on the laptop, receives one adaptive next task, scans a short-lived QR once, opens a phone companion without installing an app, and sees desktop/phone connection states update from persisted server state.

### Wave A — two parallel build lanes

#### Lane 9A — responsive Human Warmth product surface (`high`)

Exclusive ownership:

```text
packages/ui/**
apps/web/src/app/globals.css
apps/web/src/app/styleguide/**
apps/web/src/app/page.tsx
apps/web/src/app/home.module.css
apps/web/src/app/(patient)/**
apps/web/src/features/patient/**
apps/web/src/features/voice-round/**
apps/web/src/features/round-map/**
```

Deliverables:

- implement the selected tokens, typography, spacing, motion, focus, and component states;
- replace the rough multi-card dashboard with progressive, one-task screens;
- preserve visible report confirmation, unknown/unsure states, text parity, safety gates, and provider-unavailable recovery;
- remove patient-facing engineering/demo jargon while retaining one discreet synthetic/not-medical-care disclosure;
- implement home, conversation, review, recommendation, handoff waiting, result, and outcome states;
- responsive behavior from 320 to 1,920 px and 200% zoom.

#### Lane 9B — secure companion session and live-sync substrate (`xhigh`)

Exclusive ownership:

```text
packages/companion/**
apps/web/src/server/companion/**
apps/web/src/app/api/companion/**
apps/web/src/app/(companion)/**
apps/web/src/features/companion/**
```

Deliverables:

- one-time opaque QR token containing no patient data;
- server-side hashed token, short TTL, round/role/state-version/task allowlist binding, single-use exchange, revocation, and idempotent reconnect;
- scoped secure cookie after exchange and token removal from the visible URL/history where supported;
- versioned status/result API with conservative 1–2 second polling suitable for Vercel;
- phone task shell with Ready, contextual permission, guidance, progress, retry, unavailable, complete, and desktop acknowledgement states;
- no raw-media persistence and no broad round access from a companion token;
- explicit expiry/reissue and network/background recovery.

### Integration and Wave B

The orchestrator merges 9B then 9A, wires central contracts, persistence, migrations, API client, env, and shared route seams, and runs narrow gates after each merge.

#### Lane 9C — companion contract/browser verification (`xhigh`)

Exclusive ownership:

```text
tests/contract/companion/**
tests/integration/companion/**
tests/e2e/companion/**
tests/accessibility/companion/**
tests/performance/companion/**
```

Required cases: forged/expired/reused token, wrong round/role/task/state version, concurrent poll/result, refresh/resume, phone disconnect, desktop disconnect, QR regeneration, no-key parity, keyboard/touch, reduced motion, serious/critical axe zero, 320–1,920 px layouts, and bounded sync latency.

### Exit gate

- complete keyless repository gate;
- three deterministic cross-device browser runs;
- hosted Vercel/Neon desktop + mobile-sized browser live-sync run;
- no claim of physical iPhone sensor behavior yet.

## 7. Checkpoint 10 — phone-first sensing and personal baselines

### User-facing outcome

The selected evidence task opens on the paired phone. Finger pulse, VitalLens face rPPG, sustained-vowel signal, and medication label each have a consistent guided flow. Only the selected module runs. A quality-passing result returns to the laptop; failed or uncertain capture returns no numeric measurement.

### Wave A — three parallel build lanes

#### Lane 10A — live VitalLens browser gateway (`xhigh`)

Exclusive ownership:

```text
packages/assessments/providers/vitallens/**
apps/web/src/server/providers.ts
apps/web/src/features/patient/provider-factories.ts
```

Deliverables:

- front-camera capability/permission lifecycle and explicit third-party-processing consent;
- bounded crop/downsample/payload creation compatible with the existing proxy contract;
- server-only key, rate limit, timeout, cancellation, quality, and cleanup behavior;
- no key in browser, no retained frame/video, and no measurement on provider uncertainty;
- free-tier request-budget awareness and visible typed unavailability;
- new optical session required for provider change; no silent fallback.

#### Lane 10B — phone sensor stations and device routing (`high`)

Exclusive ownership:

```text
apps/web/src/app/(companion)/**
apps/web/src/features/companion/**
apps/web/src/features/voice-biomarker/**
apps/web/src/features/medication/**
```

Deliverables:

- coherent Human Warmth flows for finger pulse, face rPPG, sustained vowel, and medication label;
- phone default and laptop alternative only when supported;
- one selected station, permission just-in-time, positioning feedback, progress, quality retry, skip/decline, and result acknowledgement;
- accessible text/keyboard alternative and no list of unnecessary tests;
- device/browser/algorithm provenance without invasive fingerprinting.

#### Lane 10C — repeat-baseline and bounded personalisation (`xhigh`)

Exclusive ownership:

```text
packages/baselines/**
packages/personalization/**
apps/web/src/server/baselines/**
data/demo/baselines/**
```

Deliverables:

- versioned derived baseline series for comparable provider/device/algorithm contexts;
- first-sample, insufficient-history, comparable, and changed/unchanged projection states;
- structured preferences for default device, accessibility mode, language/display choices, and completed task history;
- no diagnosis or population threshold inferred from an individual signal;
- no raw transcript/audio/video memory;
- synthetic seeded history sufficient to demonstrate personalisation honestly.

### Integration and Wave B

The orchestrator merges 10C, 10A, then 10B; owns shared contracts, provider registration, migrations, API client, workflow wiring, release flags, and cross-lane fixes.

#### Lane 10D — sensing privacy, device, and quality verification (`xhigh`)

Exclusive ownership:

```text
tests/contract/sensing/**
tests/integration/sensing/**
tests/e2e/sensing/**
tests/accessibility/sensing/**
tests/performance/sensing/**
```

Required cases: permission denial, unsupported browser, insecure context, torch absent, motion/coverage/noise/clipping/short duration, cancellation, page background, provider timeout/quota/auth failure, no frame/PCM persistence, cross-device result tampering, first baseline vs comparable baseline, provider/device-version separation, and no numeric result after failure.

### Exit gate

- full keyless repository gate;
- live VitalLens opt-in evaluation without logging media or key;
- three real provider selections and one typed unavailable path;
- owner-assisted physical iPhone Safari test for QR, front camera, rear camera/torch, microphone, background/resume, and cleanup;
- Windows Chrome/Edge desktop + iPhone live-sync run;
- claims remain technical feasibility/general wellness only, not accuracy or clinical validity.

## 8. Checkpoint 11 — proactive, remembered, closed-loop release

### User-facing outcome

HomeRounds notices a synthetic change against Maya's personal history, starts a short adaptive round, remembers structured preferences and prior confirmed facts, gathers only needed evidence, and completes one confirmed synthetic appointment/refill/care-team action. The clinician receives a clear evidence chain and owner/status.

### Wave A — three parallel build lanes

#### Lane 11A — synthetic proactive trigger and memory projection (`xhigh`)

Exclusive ownership:

```text
packages/triggers/**
packages/personalization/**
apps/web/src/server/triggers/**
data/demo/triggers/**
```

Deliverables:

- versioned deterministic change detector over synthetic longitudinal facts;
- explainable combined-change trigger and idempotent round creation;
- no continuous background claim: the demo evaluates seeded updates on a bounded schedule/event;
- consented structured memory projection with source, timestamp, version, and correction/deletion path;
- Fireworks receives only bounded summaries and eligible candidates, never hidden raw history.

#### Lane 11B — synthetic care actions and clinician completion (`xhigh`)

Exclusive ownership:

```text
packages/actions/**
apps/web/src/server/actions/**
apps/web/src/app/api/rounds/**/actions/**
apps/web/src/app/(clinician)/**
apps/web/src/features/clinician/**
```

Deliverables:

- extend the deterministic allowlist with synthetic appointment request, refill review request, and care-team message/task;
- explicit patient confirmation, authorization scope, idempotency, concurrency control, audit, status, and failure/retry;
- never claim a real clinic, pharmacy, calendar, or emergency service received the action;
- clinician approve/edit/contact/complete flow and patient-visible persisted status;
- concise evidence card rather than raw transcript or model reasoning.

#### Lane 11C — final patient story and product polish (`high`)

Exclusive ownership:

```text
apps/web/src/app/page.tsx
apps/web/src/app/home.module.css
apps/web/src/app/(patient)/**
apps/web/src/features/patient/**
apps/web/src/features/voice-round/**
apps/web/src/features/round-map/**
```

Deliverables:

- proactive invitation, on-demand start, remembered device preference, adaptive route, live-sync result, and one completed action as one coherent story;
- happy, insufficient-evidence, provider-unavailable, network-loss, red-flag, cancellation, and resume states;
- no “demo/cache/deterministic” engineering labels in ordinary patient UI;
- all critical safety and synthetic boundaries remain accurate and discreet;
- target live pitch path under three minutes with operator recovery.

### Integration and Wave B

The orchestrator merges 11A, 11B, then 11C; owns shared contracts, protocol updates, migrations, API client, env, deployment, and integration fixes.

#### Lane 11D — final adversarial and release evidence (`xhigh`)

Exclusive ownership:

```text
tests/contract/final-pass/**
tests/integration/final-pass/**
tests/e2e/final-pass/**
tests/accessibility/final-pass/**
tests/performance/final-pass/**
docs/qa/final-pass/**
docs/submission/final-pass/**
```

Required cases: trigger idempotency, stale memory, consent/correction/deletion, prompt injection, action tampering, duplicate/concurrent action, provider/AI failure, red-flag authority, raw-media/transcript/secret scans, complete text path, phone-first path, laptop-only path, Windows desktop, iPhone Safari, keyboard/zoom/reduced motion, 30-minute soak, three timed hero rehearsals, and backup/recovery story.

### Exit gate

- complete code, contract, integration, build, browser, accessibility, performance, secret, raw-media, and claim-audit gates;
- live ElevenLabs and Fireworks exact verification;
- live VitalLens evidence or explicit typed-unavailable release classification;
- Vercel Preview deployment with Neon persistence and cold-navigation resume;
- three consecutive Windows-laptop + physical-iPhone hero runs;
- final Devpost/demo media and claim audit match observed evidence exactly.

## 9. External credentials and owner-only gates

### Already verified

- ElevenLabs local credential exists; versioned private agent matches the two-tool contract.
- Fireworks local credential exists; live DeepSeek selection and Kimi vision contract tests pass.
- Neon local credentials exist; the current hosted candidate previously demonstrated durable persistence.
- Vercel project is linked; the current Checkpoint 8 Preview deployment reports `Ready`.

### Still required

- `VITALLENS_API_KEY` is present in ignored local storage and passed a secret-safe authentication probe. The Vercel CLI currently requires an explicit Preview branch in this non-interactive environment; the orchestrator must complete Preview secret propagation before deploying the live VitalLens route.
- The free key should be rotated after exposure or quota-abuse concern.
- VitalLens stays inactive until Checkpoint 10 implements and verifies the camera gateway.
- Physical iPhone 12 Safari and Windows Chrome/Edge evidence requires the owner to have both devices available at the release gates.
- No real patient, EHR, clinic, pharmacy, telephone, appointment, or wearable credential is required.

### 18 July launch preflight

- The selected Human Warmth direction is approved and all nine generated reference boards are repository-local.
- ElevenLabs agent configuration is live and unchanged with the exact two typed client tools. The restricted key cannot read the subscription endpoint, so wallet balance remains an account-dashboard-only observation rather than a guessed pass.
- Fireworks live text-selection and medication-vision exact-contract tests pass.
- VitalLens authentication is accepted; an empty zero-cost request is correctly rejected as malformed.
- A 15-minute continuation heartbeat is active on the master orchestration task to resume transient capacity pauses and monitor existing workers without duplicates.
- Physical iPhone and Windows checks remain honestly `pending-physical`; unattended browser/device emulation may not relabel them as passing evidence.

## 10. Required release commands

At every checkpoint, run relevant narrow suites after each merge, then this complete keyless gate before starting the next checkpoint:

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
pnpm test:e2e:ai
pnpm test:a11y
pnpm test:performance
git diff --check
```

Live-provider suites are separate, explicitly opted in, secret-safe, and never required for the default code gate.

## 11. Stop rules

- Do not claim a capability merely because a UI mockup or synthetic fixture shows it.
- Do not launch the next checkpoint from a failing or dirty integration base.
- Do not activate VitalLens before explicit consent, server-key isolation, gateway implementation, live evaluation, and physical-device evidence.
- Do not persist raw media or conversational transcripts as memory.
- Do not let ElevenLabs or Fireworks set urgency, accept capture quality, execute actions, or invent an assessment/action.
- Do not represent synthetic appointment/refill/message flows as live external integrations.
- Do not start phone-call/Twilio work in this pass.

## 12. Post-Checkpoint-11 release-closure acceptance

Checkpoint 11 completion does not itself end the autonomous run. After 11D is reviewed and integrated, the orchestrator runs a separate black-box acceptance pass on the exact final `main` commit and its Vercel Preview. No new feature lane is launched by default; any discovered software defect is fixed in the owning layer and the affected plus complete gates are rerun.

Required closure evidence:

- complete formatting, lint, strict type, unit, package, contract, integration, demo-tooling, build, secret, raw-media, and claim gates;
- installed-Chrome patient and clinician journeys with console/network inspection;
- two independent browser contexts acting as laptop and phone, covering QR pairing, token exchange, live sync, reconnect, expiry/reissue, cancellation, stale writes, and result acknowledgement;
- voice and complete text paths, explicit report confirmation, Fireworks selection/abstention/failure, medication review, and deterministic red-flag authority;
- finger pulse, VitalLens, sustained vowel, and medication stations across pass, quality rejection, permission denial, provider unavailable, timeout, cancellation, and retry limits, with no numeric result after failure;
- first-baseline, insufficient-history, comparable-baseline, remembered preference, correction/deletion, proactive synthetic trigger, duplicate suppression, and stale-memory paths;
- confirmed synthetic appointment/refill/care-team actions, clinician ownership/completion, patient-visible status, audit provenance, and no implication of a real external service;
- cold navigation and cross-session Neon persistence on the hosted Preview;
- keyboard-only use, persistent labels/captions, visible focus, non-color status, reduced motion, 200% zoom, serious/critical axe zero, and responsive widths 320, 375, 390, 414, 768, 1024, 1280, 1440, and 1920 px;
- performance budgets, background/resume, network-loss recovery, and a 30-minute soak without duplicate actions, runaway polling, leaked media, or unhandled errors;
- three consecutive timed runs of the complete hero story and the resilience/red-flag story, including operator recovery and backup route.

Live-provider tests remain explicit opt-in and secret-safe. The closure record distinguishes fixture, emulated browser, installed Chrome, hosted Vercel/Neon, live provider, and physical-device evidence. iPhone 12 Safari and Windows Chrome/Edge remain `pending-physical` until the owner supplies those devices; their absence cannot hide or excuse any software-owned failure.
