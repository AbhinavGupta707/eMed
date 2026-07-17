# HomeRounds voice, text access, and autonomous execution decision

Status: approved execution policy  
Updated: 17 July 2026

## 1. Outcome

HomeRounds uses **ElevenLabs ElevenAgents as its hosted voice implementation**, but voice is not the application authority and is never required to complete a round. A provider-neutral `VoiceSessionProvider` isolates ElevenLabs from the state machine. The `disabled` provider plus accessible structured text is a release-grade mode, not an error-page fallback.

The overnight build remains in the current local Codex task as the master orchestrator. Each substantial checkpoint lane is a fresh Codex-managed worktree task based on the last tested integration commit. Durable files, commits, checkpoint state, and test evidence—not chat memory—are the system of record.

Every isolated lane must be launched explicitly with `model: "gpt-5.6-sol"`. Use `thinking: "high"` for bounded, straightforward work and `thinking: "xhigh"` for complex provider/API, state-machine, persistence/concurrency, security, or clinical-safety work. The checkpoint allocation is frozen in `02_WORKTREE_ORCHESTRATION_PLAN.md`, and the actual selection is recorded beside each task in `docs/orchestration/STATE.md`; an inherited default or lower reasoning effort is not permitted.

## 2. Voice-option analysis

| Option                                          | Cost/profile                                                                       | Strengths                                                                                                                      | Risks for this build                                                                                                         | Decision                                            |
| ----------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| ElevenLabs ElevenAgents                         | free allowance/owner credit, then hosted per-minute usage plus possible model cost | React SDK, WebRTC voice, transcripts, text-only diagnostics, client tools, short-lived authenticated sessions, polished voices | quota/key/account, third-party audio processing, agent configuration outside Git, network latency                            | **Primary hosted adapter**                          |
| OpenAI Realtime                                 | token/audio usage; no API free tier for current realtime models                    | native speech-to-speech, WebRTC, tools, strong multimodal model                                                                | duplicate hosted implementation, higher perceived cost, new key/project                                                      | later adapter only                                  |
| Browser Web Speech                              | no app-side invoice in many browsers                                               | minimal code, system TTS, emerging on-device recognition                                                                       | recognition is not Baseline, behavior/vendor processing differs, weak iPhone portability                                     | optional experiment after release, not a dependency |
| LiveKit + hosted STT/LLM/TTS                    | open-source transport; component usage costs remain                                | portable, production-grade WebRTC and provider choice                                                                          | another server/runtime, deployment/observability, three providers and turn detection                                         | production candidate, not overnight scope           |
| Fully local LiveKit/whisper.cpp/local LLM/Piper | no per-call vendor bill after hardware/hosting                                     | privacy/control/offline potential                                                                                              | model downloads, CPU/GPU/RAM and battery, latency, interruption quality, GPL/voice-model licensing, mobile/browser packaging | research spike after hackathon                      |
| Pre-recorded prompts + text                     | zero runtime provider cost                                                         | deterministic, accessible, highly reliable                                                                                     | not truly conversational                                                                                                     | recorded demo recovery only                         |

The primary engineering investment is the contract and text parity, so switching voice providers later does not rewrite workflow, safety, tests, or UI state.

## 3. Text-access contract

Text is the most reliable and accessible control surface and therefore owns the following behavior:

1. Required safety/red-flag questions use explicit structured controls with persistent labels. Free text may add context but cannot replace a required answer.
2. A live voice transcript is visible. Tentative text is visually/semantically distinct from final text.
3. Provider output proposes `PatientReport` fields. The patient can edit them by keyboard or touch and must confirm before they become facts.
4. The patient may switch voice off at any point without losing confirmed progress.
5. All status, permission, quality, timeout, and recovery states have concise text; color and audio are never the only signal.
6. Keyboard order, focus restoration, screen-reader names, live-region behavior, captions, 200% zoom, reduced motion, and 44×44 px touch targets are acceptance criteria.
7. Patient-facing next steps are deterministic templates. Model-authored prose is optional, labelled, evidence-bound, and never required to create the clinician task.
8. Transcripts are not stored by default. A confirmed bounded report and safe provenance metadata are stored; raw audio is not stored by HomeRounds.

## 4. Voice-provider contract

The frozen provider boundary must expose lifecycle and presentation events without provider-specific workflow objects:

```ts
type VoiceProviderKind = "disabled" | "elevenlabs";

type VoiceSessionProvider = {
  capabilities(): Promise<VoiceCapabilities>;
  start(input: VoiceSessionInput): Promise<VoiceSessionHandle>;
  stop(reason: VoiceStopReason): Promise<void>;
  setMuted(muted: boolean): Promise<void>;
  sendText?(text: string): Promise<void>;
  subscribe(listener: (event: VoicePresentationEvent) => void): () => void;
};
```

The event union includes connecting, connected, permission-required, listening, tentative transcript, final transcript, provider narration, muted, reconnecting, unavailable, recoverable error, terminal error, and ended. It cannot include “set urgency,” “complete required answer,” or “execute action.”

ElevenLabs credentials are issued by an authenticated server endpoint. The standard API key remains server-side. Sessions have a 120-second cap for the demo and are ended on completion, cancellation, navigation, page hide, or timeout.

## 5. No-key execution matrix

| Missing external state | Required behavior                                                                 | Work that continues                                               |
| ---------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| ElevenLabs key/agent   | `VOICE_PROVIDER=disabled`; voice control says unavailable; text route is complete | all state, protocol, UI, API, action, audit and E2E work          |
| VitalLens key/proxy    | adapter returns typed unavailable; local PPG/fixtures remain available            | provider contract, consent UI, fixture tests and all non-live E2E |
| Neon database          | local PostgreSQL profile; testcontainer/ephemeral DB where available              | schema, migrations, persistence and local full-stack QA           |
| Vercel login/project   | local build and deployment manifest/runbook                                       | all code, tests, local browser QA, deploy-ready artifact          |
| Physical iPhone        | mark release gate `pending-physical`; use injected optical sources                | all automated tests and desktop responsive/permission-state QA    |
| Clinical reviewer      | keep `demo-only` protocol and neutral `programme review requested` copy           | implementation and synthetic demo; block real-world claims        |

Workers must never request a secret to run their required checks. Live tests are tagged separately and skip with an explicit reason when credentials are absent.

## 6. Autonomous master control loop

The integration checkout is the only merge authority. For every checkpoint:

1. Read `docs/orchestration/STATE.md` and verify the current integration commit.
2. Confirm previous exit checks are green and the checkout is clean.
3. Create only the predefined worktree tasks from that commit. Record task IDs, base commit, exact ownership, expected checks, and merge order.
4. Keep no more than three worker tasks active. Four-lane checkpoints run in `3 + 1` waves.
5. Do not create a duplicate task for a slow worker or let two tasks own the same path.
6. Review each returned diff for allowlist violations, root/lockfile edits, secrets, real health data, unsupported claims, test evidence, and clean status.
7. Integrate sequentially. After each merge/cherry-pick, rerun the relevant focused tests; after all lanes, run the full checkpoint gate.
8. Use the in-app browser for localhost UI/behavior checks. Use Chrome control only when the test depends on the owner's logged-in Chrome/extension/permission state. Use Computer Use for Xcode Simulator, Safari/iPhone inspection, or another GUI that lacks a purpose-built tool.
9. Never claim physical iPhone, provider-live, accessibility assistive-technology, or deployment evidence when only a fixture/simulator was tested.
10. Commit the integrated checkpoint and update the state ledger before launching the next lanes.

If a worker is blocked, the orchestrator may clarify scope, integrate a safe root dependency, or relaunch from a new contract commit. It does not quietly relax safety, invent credentials, remove failing tests, or advance a failed gate.

## 7. Heartbeat guardrail

A task-attached heartbeat returns to this master task every 20 minutes. Its job is to resume the control loop, not to create a competing orchestrator.

Heartbeat behavior:

1. inspect the goal, `docs/orchestration/STATE.md`, Git status, and active checkpoint tasks;
2. collect completed work, review/integrate in the declared order, and rerun gates;
3. launch the next permitted lane/wave only when its base commit and ownership are unambiguous;
4. if work is still legitimately running, record no duplicate task and return quietly;
5. if a no-key condition occurs, select the documented unavailable adapter and continue;
6. if a human-only gate is reached, mark it pending, continue all independent work, and report the exact later action;
7. stop the heartbeat when Checkpoint 6 is complete or when a genuinely unsafe/authority-expanding decision requires the owner.

The Mac must remain powered, the Codex desktop app must remain running, and **Prevent sleep while running** must be enabled in Codex settings. The heartbeat cannot recover from the app being quit, the machine sleeping, network/account approval prompts, or a disconnected physical phone.

## 8. Session choice

Use the **current task as master orchestrator**:

- it already owns the active goal, repository inspection, research decisions, and future heartbeat;
- Codex compacts long context automatically, while the state ledger and commits provide durable recovery;
- checkpoint workers are fresh isolated tasks, so implementation context stays bounded without discarding orchestration continuity;
- a second master task would create a real race for merges, worktree ownership, and checkpoint state.

Start a new master only if this task becomes technically unusable. In that case, stop the heartbeat first, commit/update the state ledger, and hand off one explicit integration commit and current checkpoint. Never run two masters concurrently.

## 9. Explicit limitations

- “Production-grade” means production-shaped contracts, safety, testing, privacy and operations—not clinical validation or permission to use real patient data.
- ElevenLabs/VitalLens terms, retention, residency, health-data agreements and pricing must be reverified before any pilot.
- The custom finger-PPG algorithm and VitalLens adapter need device/population validation; one phone comparison proves demo feasibility only.
- A 10–12 hour autonomous run can complete substantial implementation, but cannot guarantee third-party login, physical-device consent, Apple/Safari prompts, or a clinician's approval.
- The heartbeat can resume work; it is not a process supervisor and must not hide repeated failures. Each failure remains visible in the state ledger and test evidence.
