# Checkpoint 8 — voice-led adaptive home round and local voice signal

**Status:** shared contracts frozen; Wave A pending launch  
**Updated:** 17 July 2026  
**Scope:** synthetic hackathon prototype only; not clinically validated and not for diagnosis

## 1. Product outcome

Checkpoint 8 makes the existing AI-native round feel like a coherent at-home visit:

1. the patient opens a synthetic longitudinal history and starts a live embedded ElevenLabs conversation;
2. the agent explains the round, asks bounded symptom and red-flag questions, and uses a typed client tool to propose a structured report;
3. the proposal appears on screen for explicit review; no proposed answer becomes a fact until the patient confirms it;
4. the HomeRounds server creates the eligible evidence-module allowlist and Fireworks ranks only those candidates;
5. the UI opens the selected medication-label, finger-pulse, or experimental voice-signal station;
6. deterministic quality, red-flag, protocol, action, concurrency, and idempotency code retains authority;
7. the clinician receives a source-grounded handoff made only from confirmed structured facts, quality results, and provenance.

The product is an adaptive AI home visit between appointments. It collects a patient report conversationally, chooses the next safe evidence-gathering step from an allowlist, quality-gates multimodal observations, and prepares an auditable clinician handoff without claiming a diagnosis.

## 2. Why ElevenLabs does not replace Fireworks

ElevenLabs owns the real-time interaction layer:

- microphone capture, turn detection, speech recognition, spoken response, interruption, and latency;
- the conversational wording of bounded questions;
- typed client-tool invocation;
- dynamic variables containing a short synthetic history summary and round purpose.

HomeRounds and Fireworks own the decision-support layer:

- deterministic code creates the eligible test/action set;
- Fireworks may rank one eligible evidence module or abstain;
- Zod rejects invented IDs, stale versions, malformed output, and cross-module rationales;
- the red-flag gate, quality gate, protocol engine, action allowlist, and idempotency rules remain deterministic;
- text and voice use the same server path, so a voice outage cannot remove the AI-native behavior.

Using ElevenLabs alone for test selection would make the voice channel an untyped second authority, weaken text parity, and make the route harder to replay and audit. Fireworks therefore remains a small, focused dependency rather than a second chatbot.

## 3. RunwayOps reuse decision

The reviewed `AbhinavGupta707/RunwayOps` implementation is an outbound Twilio phone-agent integration. The following patterns transfer:

- a versioned agent instruction set with a narrow objective and explicit safety boundary;
- dynamic variables and bounded runtime context;
- provider conversation IDs and outcome categories, without raw content;
- diagnostics that compare provider payload shapes;
- human confirmation before any consequential action.

The following do not transfer:

- outbound calls, Twilio numbers, phone assignment, and callback-driven call orchestration;
- Mongo persistence of transcripts or summaries;
- loose manual request validation and raw provider errors;
- provider-side action authority.

HomeRounds uses authenticated browser WebRTC and client tools instead. The browser already has the same-origin synthetic demo session; tool handlers can call HomeRounds without giving ElevenLabs a database credential or accepting an unauthenticated webhook.

## 4. Frozen safety and privacy contract

### Voice conversation

- The agent may call only `propose_patient_report` and `request_next_round_step`.
- A report proposal has contract version `voice-report-proposal.v1` and preserves every unknown or unsure field.
- A proposal never mutates the round. The patient must review and confirm the visible fields.
- Required red-flag questions remain persistent visual controls and cannot be skipped by conversation.
- The agent may not diagnose, prescribe, set urgency, promise service contact, or state that a model-selected test is medically necessary.
- The agent receives only a bounded synthetic alias, purpose, and history summary. It receives no real identifiers or unrelated record.
- Raw transcript, raw audio, provider payload, hidden reasoning, and full prompt are not persisted or logged.

### Voice signal

- The measurement station is a separate consented 6–8 second sustained-vowel capture, not passive analysis of the full conversation.
- Feature extraction is local: median fundamental frequency, pitch variability, jitter, shimmer, harmonic-to-noise ratio, phonation duration, and quality metrics.
- Raw PCM is held only in memory, zeroed/released after analysis, never uploaded, and cannot be represented in the persisted fact contract.
- A result exists only when the deterministic quality gate passes. Poor duration, noise, clipping, voiced fraction, or pitch stability returns retry/fail without a feature fact.
- The output is labelled research-only and compared as a personal trend, not against a disease threshold. It cannot set urgency or an action by itself.

## 5. Evidence and scope decisions

Voice features are promising longitudinal signals but are sensitive to microphone, room noise, language, age, hydration, and extraction method. Camera rPPG is similarly sensitive to lighting, motion, and device. Both are therefore quality-gated evidence, not diagnoses.

A reaction-time, memory, or keystroke station is intentionally deferred. It is less directly aligned with the obesity/type-2-diabetes/cardiovascular challenge, creates additional accessibility and confounding risks, and would dilute the medication + pulse + voice demo. It can be reconsidered only for a defined neurological or frailty protocol with an actionable evidence gap.

The existing medication-label station is retained as the third high-value modality. It is more clinically legible to judges than a generic game: the patient can show what they are actually taking, review the extraction, and create a confirmed observation for the clinician.

## 6. Target demonstration

### Story A — Maya: weak after a medication change

1. Maya opens HomeRounds and sees a short synthetic history and previous-round trend.
2. She starts the live agent and says she has felt weak since the morning.
3. The agent asks the three red-flag questions plus weakness/palpitations; she answers in conversation.
4. The agent proposes a visible structured report. Maya reviews every answer and confirms it.
5. HomeRounds shows the eligible test set and a live Fireworks rationale selecting medication-label review.
6. Maya scans a synthetic label, corrects one uncertain field, and confirms it.
7. HomeRounds proceeds to the quality-gated local finger pulse. A bad capture produces no number; the retry passes.
8. The clinician sees the confirmed report, reviewed medication observation, accepted pulse, model provenance, protocol result, and one allowlisted review task.

### Story B — Aisha: voice signal plus safe fallback

1. Aisha reports intermittent palpitations with no stated red flag.
2. One safety answer remains unsure, so the proposal visibly preserves uncertainty rather than converting it to “no.”
3. After explicit review, the eligible set includes the experimental voice station; the agent describes it as optional research-only evidence.
4. The first sustained vowel is noisy and returns retry with no biomarker fact. The second passes locally and immediately discards audio.
5. A simulated provider timeout makes Fireworks fall back to the deterministic finger-pulse route.
6. The handoff shows both the voice quality/provenance and the deterministic fallback; it never presents a diagnosis.

## 7. Shared contract freeze

The integration task owns and freezes before workers launch:

- `VoiceAgentReportProposalSchema`, unresolved-field invariants, bounded tool outcomes, and bounded synthetic session context;
- `VoiceServerLocationSchema` so token issuance and browser SDK use the same region;
- `VoiceBiomarkerFactSchema`, local-only provider/result types, quality reasons, research-only marker, and `rawMediaRef: null`;
- `voice_biomarker` as an allowlisted evidence module and `voice_biomarker_observation` as a fact key;
- no new third-party runtime dependency; browser Web Audio primitives and the existing ElevenLabs SDK are sufficient.

Workers must not widen these contracts, add dependencies, or create a second workflow authority.

## 8. Adaptive worktree plan

All isolated tasks must be project-scoped worktrees visible in the Codex sidebar. Every task explicitly uses `gpt-5.6-sol`; complex provider/DSP/safety lanes use `xhigh`, and bounded presentation/verification lanes use `high`. No more than three tasks run concurrently.

### Wave A — three build lanes

#### Lane 8A — live ElevenLabs agent runtime (`xhigh`)

Exclusive ownership:

```text
packages/voice/**
apps/web/src/features/voice/**
```

Deliverables:

- align browser SDK `serverLocation` with the signed-token service to fix the current global/US mismatch;
- pass bounded dynamic variables and typed client tools into the live WebRTC session;
- validate every tool input through the frozen schema and emit safe typed outcomes;
- preserve editable text fallback, explicit confirmation, cancellation, reconnect, and bounded termination;
- expose agent/report proposal state without advancing the round;
- add deterministic SDK fixtures for connect, transcript, tool invocation, malformed input, duplicate call, denial, timeout, and disconnect;
- never log or persist transcript, audio, token, prompt, or provider payload.

#### Lane 8B — local voice-signal provider (`xhigh`)

Exclusive ownership:

```text
packages/assessments/providers/voice-biomarker/**
```

Deliverables:

- browser microphone capability/permission boundary and cancellable sustained-vowel capture;
- pure frame/window analysis with injected clock/IDs for deterministic tests;
- quality gate for duration, clipping, noise, voiced fraction, and pitch stability;
- derived F0, pitch variability, jitter, shimmer, HNR, and phonation-duration features;
- in-memory raw PCM disposal with tests that no raw buffer escapes a result/error;
- fixture-driven reference signals, noise/clipping/short/unstable cases, Safari capability fallback, and cancellation;
- a README that states research-only limitations and platform constraints.

#### Lane 8C — patient history, proposal review, and voice station UI (`high`)

Exclusive ownership:

```text
apps/web/src/features/voice-round/**
apps/web/src/features/voice-biomarker/**
```

Deliverables:

- synthetic history/purpose card with concise source labels;
- visible agent proposal review that never silently selects a red-flag answer;
- required-field/unresolved states, keyboard/touch operation, focus recovery, live regions, and reduced motion;
- consented voice-signal station with timer, quality feedback, retry, decline, and text explanation;
- explicit “research signal—not a diagnosis” copy and no disease threshold;
- component/controller tests using only frozen contracts and injected providers.

### Wave A integration — master-owned seams

Integration owns:

```text
packages/contracts/**
packages/assessments/src/**
packages/persistence/**
packages/audit/**
packages/api-client/**
apps/web/src/env.ts
apps/web/src/server/**
apps/web/src/app/api/**
apps/web/src/features/patient/**
apps/web/src/features/workflows/**
apps/web/src/features/clinician/**
infra/db/**
root manifests, lockfile, cross-lane fixtures, and orchestration records
```

Required integration work:

- register the provider and construct the voice module candidate only when available and within burden;
- persist only the derived passing fact and bounded audit provenance through an additive migration;
- keep voice capture separate from optical assessment attestations;
- connect the proposal-review UI to the existing confirmed-report submission path;
- pass short synthetic history variables into the agent;
- expose the derived fact and research-only limitation in the clinician evidence chain;
- create a versioned ElevenLabs configuration script that is dry-run by default, secret-safe, and idempotent;
- update the existing agent rather than creating an untracked duplicate.

Wave A merge order is 8A, 8B, then 8C. Run each lane’s narrow checks after merge and the complete keyless gate before Wave B.

### Wave B — two independent verification lanes

#### Lane 8D — adversarial voice/tool/DSP contracts (`xhigh`)

Exclusive ownership:

```text
tests/contract/voice-agent/**
tests/integration/voice-agent/**
tests/ai/voice-agent/**
```

Required cases include invented tool names, extra fields, unresolved/value mismatch, red-flag prompt injection, stale round, duplicate calls, provider reconnect, malformed callbacks, token-region mismatch, raw-audio/transcript persistence scans, no-key parity, Fireworks abstention/failure, clipped/noisy/short audio, and deterministic fallback equivalence.

#### Lane 8E — browser, accessibility, and performance (`high`)

Exclusive ownership:

```text
tests/e2e/voice-agent/**
tests/accessibility/voice-agent/**
tests/performance/voice-agent/**
```

Required journeys include full text parity, live-agent fixtures, visible proposal confirmation, optional voice signal, retry/decline, refresh/resume, keyboard-only use, 320–1,920 px layouts, iPhone-sized WebKit, microphone denial, reduced motion, serious/critical axe findings, zero console/page errors, and bounded connect/analysis latency.

Wave B merge order is 8D then 8E.

## 9. External agent configuration

The integration task will version a declarative agent specification and apply it through the official ElevenLabs API only after the client tools exist.

Required configuration:

- authenticated private WebRTC agent using the existing `HomeRounds Voice Intake` agent ID;
- 120-second maximum session and current account concurrency/credit limits;
- short first message that identifies a synthetic HomeRounds check-in and asks permission to continue;
- explicit no-diagnosis/no-prescription/no-urgency instruction;
- tool definitions exactly matching the frozen report proposal and next-step names;
- dynamic variables for synthetic alias, purpose, and bounded history;
- server location set consistently to `global` until a different residency mode is actually provisioned;
- no file attachments and no raw transcript/audio retention claim beyond what the account configuration can prove;
- provider simulation tests for a normal report, unknown answer, red flag, off-topic request, and tool failure.

The repository stores the agent specification, expected non-secret version metadata, and apply/verify scripts. It never stores the key, signed token, raw prompt response, transcript, or audio.

## 10. Release gates

Keyless required gate:

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

Additional Checkpoint 8 gates:

- exact tracked-file/history/browser-bundle secret scan;
- raw transcript/audio/provider-payload persistence scan;
- five deterministic reference-signal DSP cases with documented tolerances;
- three consecutive ElevenLabs agent simulations against the versioned configuration;
- one real installed-browser microphone conversation producing a visible editable proposal;
- one real sustained-vowel capture producing either a quality-gated derived fact or an honest retry, never a fabricated result;
- hosted Vercel/Neon cold-navigation persistence of derived facts and clinician evidence;
- three exact-candidate rehearsals of Story A plus one failure/fallback rehearsal of Story B;
- physical iPhone 12 Safari remains a separate owner/device evidence class and may not be replaced by responsive Playwright.

## 11. Open decisions and honest limitations

- The live agent model can remain the current ElevenLabs-supported model initially. Model changes require simulation evidence; a larger model is not assumed better for a bounded tool workflow.
- Voice features need personal repeated baselines before trend language is meaningful. The first passing capture should say “baseline started,” not “stable” or “changed.”
- Zero-retention and residency claims must match the actual ElevenLabs account and configuration evidence. The code itself cannot create an enterprise retention guarantee.
- Physical iPhone microphone/camera behavior, backgrounding, interruption, Bluetooth routing, thermal behavior, and permission re-grant remain human/device gates.
- A clinician note is a draft compiled from confirmed facts and provenance. It must not include a diagnosis, raw transcript, or hidden reasoning, and remains editable before clinical use.
- No reaction-time/keyboard test enters this checkpoint. Adding one later requires a condition-specific protocol, quality model, accessibility review, and an evidence-backed decision it can change.
