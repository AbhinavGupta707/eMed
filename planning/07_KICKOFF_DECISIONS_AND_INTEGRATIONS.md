# HomeRounds kickoff decisions and integrations

Status: owner decisions resolved; ready for Checkpoint 0 execution  
Updated: 17 July 2026

## 1. Current repository state

- Local repository initialized on `main`.
- Remote linked as `origin`: `https://github.com/AbhinavGupta707/eMed.git`.
- The remote was reachable and returned no refs when checked, so it was empty at that moment.
- No commit or push has been made yet.
- Existing material consists of the extracted source package and planning documents.
- `.gitignore` now excludes secrets, build/test output, editor state and `.DS_Store`.
- The Codex app recognizes the local `eMed` project with project ID `/Users/abhinavgupta/Desktop/eMed`, so project-scoped worktree threads can be created after the first commit.

Checkpoint 0 creates the first reviewed baseline commit. It should not be pushed until the tracked-file list is inspected.

## 2. Exact adaptive worktree shape

The number of worktrees is determined by independent ownership, not a fixed team size.

| Checkpoint                                |                 Worktrees | Why this count                                                                                                                             |
| ----------------------------------------- | ------------------------: | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 0 — baseline and device/provider decision |                         0 | root scaffold, contracts, dependencies and first commit are shared integration work                                                        |
| 1 — deterministic foundations             | 4 total, max 3 concurrent | data/domain, protocol/planner, local finger PPG and VitalLens own disjoint bounded paths; run `3 + 1`                                      |
| 2 — service layer                         |                         3 | API/actions/audit, provider-neutral voice/text parity and design system have exclusive paths and stable contracts                          |
| 3 — product surfaces                      |                         2 | one patient/workflow owner and one clinician owner; additional lanes would collide in app wiring                                           |
| 4 — hardening                             | 4 total, max 3 concurrent | patient QA, clinician QA, deterministic/contract QA and operations/security are independent; run `3 + 1` to preserve orchestrator capacity |
| 5 — release evidence                      |                         2 | one submission/claim audit and one QA/recovery evidence lane; neither changes application code                                             |
| 6 — freeze                                |                         0 | only the orchestrator can make final release decisions and bug fixes                                                                       |

The exact paths, merge order, checks and worker prompts are in `02_WORKTREE_ORCHESTRATION_PLAN.md`. These counts should change only if the MVP decision changes enough to alter the dependency graph. A blocked worker does not justify spawning a duplicate owner for the same files.

## 3. Account and integration requirements

### Required before the complete live demo

| Capability              | Recommended choice                                               | Why it is needed                                                                      | Can start without it?                                   |
| ----------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Source control          | GitHub `AbhinavGupta707/eMed`                                    | worktree bases, audit history, backup and deployment                                  | already linked; first commit pending                    |
| AI voice                | ElevenLabs ElevenAgents with authenticated WebRTC                | bounded live voice conversation, live transcript and structured-report proposal       | Yes—`disabled` provider and text path are release-grade |
| HTTPS hosting           | Vercel project linked to GitHub                                  | physical iPhone camera/mic require a secure origin; rapid Next.js preview deployments | Yes—localhost desktop work can start                    |
| Hosted SQL              | Neon Postgres 17 via Vercel Marketplace or direct `DATABASE_URL` | persistent patient/clinician state available to the hosted iPhone flow                | Yes—local Docker Postgres first                         |
| Physical device         | iPhone 12, current iOS/Safari, cable                             | real camera, permission, lifecycle and optical-signal proof                           | No for final sensor acceptance                          |
| Clinical wording review | eMed clinician/mentor if available                               | review fictional red flags, task priority/SLA and patient copy                        | Engineering can start with `demo-only` placeholders     |

Postgres 17 is the conservative managed choice because it is mature on Neon. PostgreSQL 18 is supported by Neon but was still described as preview in its compatibility material reviewed for this plan. We do not need extensions.

### Optional only if selected deliberately

| Integration               | When it becomes necessary                               | What it adds                                                                                                          |
| ------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| VitalLens account/API key | when running the live comparison or selecting face rPPG | managed face-video heart-rate estimate and ready-made browser components; implementation/tests do not require the key |
| VitalLens backend proxy   | mandatory with its API                                  | keeps API key server-side and applies auth/rate limits                                                                |
| Sentry/hosted telemetry   | after the closed loop works                             | operational debugging; not demo-critical and must avoid sensitive content                                             |
| Android phone             | if borrowed before release                              | cross-browser sensor evidence; not required to start                                                                  |
| custom domain             | only for presentation polish                            | stable URL; `*.vercel.app` HTTPS is sufficient technically                                                            |

### Not required for the MVP

- OpenAI Realtime: ElevenLabs is the primary hosted voice provider for the hackathon because the owner already has credit. OpenAI remains a later adapter, not a duplicate implementation.
- Self-hosted LiveKit + whisper.cpp + Piper: credible future low-variable-cost/local architecture, but it adds a media server, model hosting, turn detection, device-performance and deployment work that is not justified for the overnight build.
- Browser Web Speech API as the primary: useful as a progressive enhancement, but speech recognition has limited cross-browser availability and may still use a remote service; it is not a dependable iPhone demo transport.
- GLM/Z.ai or a second reasoning model: no distinct demo-critical job.
- MediaPipe for local finger PPG: no face/pose landmarks are needed.
- Medplum, SMART on FHIR, an EHR sandbox or live eMed API: use a curated synthetic FHIR adapter because no private interface was supplied.
- Twilio, email or paging: the “clinical action” is a persisted task in the clinician cockpit, not a real contact.
- Auth0/Clerk/Supabase Auth: a protected synthetic demo session is enough; real identity is a production gate.
- Apple Developer Program, TestFlight or an App Store build: the MVP is an HTTPS PWA.
- Xcode for implementation: optional Simulator layout testing only.
- ElevenLabs text-to-speech, PDF generation, Chrome extension tooling, wearable APIs, OCR or barcode APIs.

## 4. How development and testing on the iPhone works

### Recommended path: hosted PWA

1. Link the GitHub repository to a Vercel project.
2. Add server-only environment variables in Vercel: database URL, ElevenLabs key/agent ID, demo access secret and VitalLens key if the face provider is selected.
3. Deploy a preview/production URL over HTTPS.
4. Open that URL in Safari on the iPhone 12.
5. Grant camera/microphone permission through an explicit user tap.
6. Optionally use Safari's **Add to Home Screen → Open as Web App** to make it feel app-like.
7. Connect the iPhone to the Mac with a cable, enable **Settings → Apps → Safari → Advanced → Web Inspector**, then use Safari on the Mac's **Develop** menu to inspect the phone page, network, console and storage.

No native compilation or Apple Developer account is involved.

### Local-device alternative

A local Next.js server can bind to the Mac's network interface, but an iPhone URL such as `http://192.168.x.x:3000` is not a secure context and should not be trusted for camera/microphone behaviour. A locally trusted HTTPS certificate/tunnel can work, but certificate installation and network restrictions consume event time. It is a recovery route only after it has been rehearsed.

### What the Simulator can and cannot prove

Useful:

- layout, routing, error copy and basic Safari compatibility;
- responsive states and keyboard appearance;
- ordinary API flows against synthetic data.

Not valid evidence:

- iPhone rear/front-camera selection;
- torch capability;
- optical PPG/rPPG signal quality;
- physical permission denial/re-grant;
- motion, lighting, thermal and background behaviour.

Therefore the physical iPhone is not an optional nice-to-have for the final sensor claim.

## 5. Sensor decision after the Baseline context

The Baseline project is useful evidence that a weekend browser build can combine longitudinal context and short home assessments. Its strongest transferable ideas are:

- personal baselines rather than generic population thresholds;
- short, guided, quality-aware stations;
- locally processed signals where possible;
- a clinician-readable evidence summary;
- careful separation between “stable/monitor/discuss” and diagnosis.

Its full stack should not be copied into HomeRounds. Three mandatory daily stations would contradict HomeRounds' adaptive “minimum next evidence” thesis, and a Chrome extension is a poor patient/iPhone surface.

### Option A — local rear-camera finger PPG

Flow: the patient covers the iPhone rear camera; optional torch improves illumination; browser code derives a green-channel signal and estimates pulse only after quality passes.

Advantages:

- tactile and highly visible live demonstration;
- raw frames can remain entirely on-device;
- no sensor account, API cost or third-party biometric processor;
- matches the original execution brief's hero.

Risks:

- torch/camera behaviour varies by iOS/Safari version;
- custom signal quality and estimator work;
- finger placement, pressure, motion and warmth affect reliability;
- one phone run proves feasibility, not medical accuracy.

### Option B — VitalLens front-camera face rPPG

Flow: a 30-second guided face scan uses the `vitallens` JavaScript client. The managed method crops/downsamples frames and sends low-resolution face-video data through our backend proxy to VitalLens. Its local POS/CHROM/G algorithms are possible but would need separate quality evaluation.

Advantages:

- ready browser components and quality guidance;
- front-camera experience may be easier than covering the rear camera;
- supported outputs include heart rate, respiratory rate and HRV, although HomeRounds should use heart rate only in the MVP;
- official client is MIT-licensed.

Costs and restrictions:

- account/API key and a server proxy are required; the browser must never receive the key;
- managed inference transmits downsampled frames to VitalLens infrastructure rather than keeping all frames on-device;
- VitalLens documentation says its API is general-wellness only, not a medical device or clinical-monitoring service;
- its privacy documentation says US `us-east-2` processing, technical metadata retention, explicit consent and controller/processor obligations;
- network/provider availability becomes part of the live sensor path;
- a 200 response is not a valid result until provider quality/processing status passes;
- HomeRounds still cannot claim the provider's benchmark as clinical validation for this use.

### Option C — no live optical measurement

Use a structured patient report plus a clearly labelled historical/manual synthetic measurement.

Advantages: safest and most reliable.  
Cost: much weaker innovation/demo proof; use only if both live options fail the preflight.

### Decision rule

Checkpoint 1 implements both providers behind one normalized contract, while release configuration exposes only one:

1. Local finger PPG is the no-key default and must pass automated signal/quality/privacy tests.
2. VitalLens is built in an isolated provider path and must be fully testable through injected fixtures. With no key/proxy it reports `unavailable` and cannot block the round.
3. In Checkpoint 5, compare three rehearsed captures per provider on the iPhone 12 using the same ergonomics, completion, quality, repeatability, latency, thermal, network and privacy rubric.
4. Select one release provider. Prefer local finger PPG when it is usable because it avoids a biometric processor and network dependency; select VitalLens only when it materially wins reliability and its consent/data boundary is accepted.
5. If neither passes, remove the live-vital claim and use Option C honestly.

Do not automatically switch providers during a patient round. Provider changes require a new assessment session with explicit provenance and, for VitalLens, explicit consent.

## 6. Why the other Baseline capabilities remain out of scope

### Voice jitter, shimmer and clarity

Praat can compute phonetic and voice-quality features, but jitter/shimmer are sensitive to microphone, environment, sustained-vowel protocol and signal quality. Translating those measurements into chronic-care action needs condition-specific evidence and personal longitudinal data. The supplied HomeRounds PRD already places voice-feature trends in a research/trend tier.

Decision: ElevenLabs voice is used for conversation and structured-report proposals, not as a diagnostic voice biomarker. Do not add `praatfan`/Praat WASM during the hackathon.

### Reaction, memory and typing rhythm

These are technically straightforward and local, but one event-day reading has weak meaning. They become useful only with repeated personal baselines, controlled tasks, and a pathway that knows what action a change should cause.

Decision: keep as future assessment-pack candidates; do not add a fixed three-station battery.

### NHS-style PDF export

A printable evidence report can be valuable for care outside an integrated workflow. In this hackathon, the live clinician cockpit, evidence chain and persisted task prove more. PDF generation is post-MVP unless the submission specifically requires a take-away artifact.

### MediaPipe

MediaPipe is useful for facial or movement ROI tracking. Its face video methods can block the main thread unless moved to a Worker. It adds no value to local finger PPG. If VitalLens' client handles face ROI itself, adding another MediaPipe pipeline would duplicate work.

## 7. What “fictional protocol” means

A protocol is a versioned, deterministic set of demo rules. “Fictional” means it is an illustrative hackathon pathway using a synthetic patient and is not represented as approved medical guidance.

It answers questions like:

- which red-flag answers stop the normal round;
- whether a valid pulse plus the patient report needs one follow-up;
- whether missing/poor-quality evidence creates an abstention/review task;
- which predefined task type and patient message are permitted;
- what evidence IDs and rule version appear in the audit trail.

Example shape—not an approved medical rule:

```json
{
  "id": "demo-cardiometabolic-round",
  "version": "0.1.0-demo",
  "clinicalStatus": "illustrative-not-for-care",
  "rules": [
    {
      "when": "red_flag_present",
      "outcome": "stop_and_show_urgent_guidance"
    },
    {
      "when": "capture_quality_failed_after_retry",
      "outcome": "create_incomplete_evidence_review"
    },
    {
      "when": "valid_pulse_and_persistent_palpitations",
      "outcome": "create_same_day_programme_review"
    }
  ]
}
```

The actual implementation uses typed predicates and facts, not English strings. The example communicates the product boundary.

## 8. What “same-day review action” means

It does **not** mean HomeRounds calls emergency services, diagnoses a condition or changes medication.

For the demo it is a real persisted workflow object:

```text
type: programme_clinical_review
owner: fictional GLP-1 clinical operations team
priority: same-day
dueAt: deterministic demo deadline
reason: matched protocol rule + evidence references
status: open -> acknowledged -> completed
idempotencyKey: round + action type + protocol decision
patientMessage: a reviewed template explaining who will respond and when
```

The patient sees “Your programme team will review this today” plus worsening/emergency guidance. The clinician cockpit sees the queue item, evidence, SLA and audit chain. Retrying the action creates no duplicate task.

If “same-day” sounds clinically over-specific without a reviewer, rename it `programme review requested` and use an illustrative service window. This wording is one of the owner decisions below.

## 9. Dependency policy

Checkpoint 0 resolves and pins exact versions in the lockfile. The intended direct dependencies are intentionally small:

- Next.js 16, React 19, TypeScript;
- pnpm and Turborepo;
- Zod;
- Drizzle ORM/migrations plus a PostgreSQL driver compatible with local Postgres and Neon;
- ElevenLabs React SDK behind a local provider contract;
- Tailwind CSS 4, Radix/shadcn components selectively, Lucide icons;
- Vitest, Playwright and axe;
- a structured logger;
- `vitallens` in its isolated adapter once its browser/server dependency shape is verified; live credentials remain optional.

We will not install every speculative library from the PRD. A worker that needs a new dependency asks the orchestrator; only integration edits root manifests and the lockfile.

## 10. Owner decisions and remaining human-only gates

Resolved:

1. Implement both optical providers behind one contract, compare later, and expose one release-selected provider.
2. Use ElevenLabs as the primary hosted voice integration; complete no-key text parity is mandatory.
3. Keep the Maya GLP-1/cardiometabolic hero and add the Aisha multimodal-resilience walkthrough.
4. Use Vercel plus Neon PostgreSQL 17 for the hosted profile and current iOS/Safari on the iPhone 12.
5. Use the neutral `programme review requested` wording until a clinician approves a more specific SLA; the seeded demo may display an illustrative same-day service window with a `demo-only` label.
6. The orchestrator is authorised to scaffold, commit/push the reviewed baseline, and run Checkpoints 0–6 autonomously with isolated worktrees and gates.

Human-only gates that must not halt implementation:

1. **VitalLens live boundary:** creating the account/key and accepting its documented third-party frame-processing boundary remains explicit opt-in. Until then the adapter is fixture-tested and reports live mode unavailable.
2. **Physical iPhone acceptance:** camera, torch, permissions, repeatability, thermal behaviour and the final provider choice require the real iPhone. Simulator/desktop results cannot be relabelled as device evidence.
3. **External account login:** Vercel, Neon, ElevenLabs and VitalLens sign-in/consent may need the owner. The build must finish locally and expose precise environment/setup instructions if unattended login is unavailable.
4. **Repository visibility/deployment exposure:** GitHub reports `AbhinavGupta707/eMed` as public. The repository therefore contains synthetic data and empty environment examples only. A public hosted demo still requires an application-level demo passcode.
5. **Clinical wording:** a qualified reviewer should approve red flags, pathway copy, action reason and response window before anyone treats the prototype as more than a demo.

## 11. Readiness assessment

The project is ready to execute. The safe start is to freeze provider-neutral contracts, finish a no-key local baseline, commit/push it, and launch the four Checkpoint 1 worktrees in a `3 + 1` wave. Physical/provider selection moves to the Checkpoint 5 release gate, so unavailable accounts cannot block deterministic foundations.

If ElevenLabs, VitalLens, Vercel or Neon access is delayed, local scaffold, deterministic core, synthetic data, tests, text workflow, injected optical fixtures, and deployment documentation continue. External availability changes only live-provider/deployment evidence, never the integrity of the application state machine.
