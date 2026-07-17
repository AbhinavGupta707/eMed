# HomeRounds — Hackathon Execution Brief

**One-line product:** HomeRounds is an adaptive AI home visit for people managing chronic conditions. It knows the patient’s longitudinal record, notices meaningful change, gathers the next useful piece of evidence through the phone, applies a bounded clinical pathway, and creates the safest next care action with the clinical team.

## The product promise

A patient should not have to decide whether a symptom matters, repeat their full history, or wait for an appointment merely to gather basic evidence. HomeRounds begins with the patient’s existing context and conducts a short, purposeful “round.” It may ask a question, inspect a medicine package, run a phone-camera measurement, import a home reading, or request another approved check. It stops as soon as it has enough reliable information to choose the next safe action.

The prototype must demonstrate a complete loop:

> **Notice → ask → measure → verify quality → decide within a protocol → act → hand off.**

It must not claim to diagnose from a phone, autonomously change medicine, or exclude an emergency.

## Hero scenario

**Patient:** synthetic adult receiving GLP-1 treatment, with type 2 diabetes and cardiovascular risk.

**Trigger:** weight is improving, but several weak signals have changed: the patient reported new fatigue, missed part of a check-in, and an optional wearable trend has shifted. An ordinary dashboard still looks broadly acceptable.

**Round:**

1. HomeRounds proactively invites the patient to a short check.
2. A realtime voice agent explains why the check was suggested and asks a bounded red-flag question set.
3. The patient confirms weakness and intermittent palpitations.
4. The assessment planner selects a **finger-camera heart-rate check** because it can change the next action and is available on the current phone.
5. The live capture screen shows finger placement, signal quality, elapsed time and the measured pulse. Poor capture cannot produce a result.
6. Because the result and symptoms cross a deterministic pathway threshold, the system asks one targeted follow-up rather than continuing a generic interview.
7. The safety kernel selects **same-day clinician review** from an explicit action allowlist.
8. The clinician cockpit receives an evidence card containing the trigger, relevant record facts, patient answers, measurement, quality score, trend, pathway version and recommended review window.
9. The patient sees one clear action and what will happen next.

This scenario is demonstrative, not clinical guidance. Use synthetic data and a fictional protocol reviewed for demo safety.

## Three-minute live demo

### 0:00–0:20 — The problem

Show the ordinary longitudinal dashboard. Weight is down and adherence appears good. Say: “The dashboard says treatment is working. But the patient has started to change between appointments.” A subtle event marker shows why HomeRounds initiated a check.

### 0:20–0:55 — Adaptive voice round

Open the patient phone view. The voice agent greets the patient with context rather than a blank chatbot. The patient says they feel weak and occasionally notice their heart racing. The transcript populates structured fields live. The UI displays the round’s purpose and progress.

### 0:55–1:35 — Real phone assessment

HomeRounds selects the finger-camera check. Run the measurement live. Show:

- camera and torch status;
- finger-coverage guidance;
- signal waveform;
- quality meter;
- timer;
- final heart-rate value only after passing quality checks.

The physical interaction is the visual centre of the demo.

### 1:35–2:05 — The adaptive step

A short “Why this check?” panel shows the relevant symptoms and record context. The assessment planner selects one follow-up question because it can change the pathway. Do not expose chain-of-thought; show concise product reasoning and source facts.

### 2:05–2:35 — Consequential action

The deterministic safety kernel returns “same-day clinical review.” A real tool call creates an idempotent task and schedules a follow-up window. The patient receives one plain-language next step.

### 2:35–3:00 — Clinician handoff

Switch to the clinician cockpit. Open the evidence card and show:

- why the round started;
- what changed from baseline;
- source-linked record facts;
- measurement quality and method;
- red-flag answers;
- pathway rule and version;
- actions already completed;
- approve, edit or contact-patient controls.

Close with: **“HomeRounds does not replace the clinical team. It gives them the right evidence before the appointment and makes asynchronous care feel like a real home visit.”**

## Must-have product surfaces

### Patient PWA

- Home/today screen with proactive round invitation.
- Realtime voice or text fallback.
- Structured transcript and consent cues.
- Live assessment capture with quality gating.
- One-action outcome card.
- Simple record/plan timeline.

### Clinician cockpit

- Prioritised queue.
- Evidence card with sources and quality.
- Approve/edit/contact controls.
- Audit trail.

### Core services

- Synthetic FHIR patient adapter.
- Longitudinal snapshot builder.
- Trigger engine using pre-seeded events.
- Assessment registry.
- Round state machine.
- Deterministic safety/protocol engine.
- Idempotent task/action service.
- Audit/event log.

## Architecture for the prototype

```text
Patient browser/PWA                    Clinician browser
        │                                      │
        ├── WebRTC realtime voice              │
        ├── Camera + MediaPipe/capture logic    │
        └──────────────┬───────────────────────┘
                       │
                 Next.js API layer
                       │
        ┌──────────────┼───────────────────────┐
        │              │                       │
  Round manager   Safety kernel          Action service
        │              │                       │
        ├── assessment registry                ├── review task
        ├── planner candidate schema           ├── follow-up
        └── patient snapshot                   └── message
                       │
          Synthetic FHIR + operational store
                       │
                    Audit log
```

## Recommended stack

- **Next.js + TypeScript** for patient and clinician routes.
- **Tailwind/shadcn-style components** or another familiar component library for speed.
- **OpenAI Realtime** for low-latency browser voice.
- **OpenAI Agents SDK for TypeScript** for schemas, tools, sessions, guardrails and traces.
- **Zod** for every model and tool contract.
- **MediaPipe Tasks Vision** for capture guidance and optional landmarks.
- **Custom TypeScript/Web Worker signal processing** for finger-camera PPG.
- **Synthea FHIR R4 fixture** behind a small `FHIRAdapter` interface.
- **SQLite/Drizzle or hosted Postgres** for rounds, tasks and events.
- **Playwright** for the four critical journeys.

Do not integrate a live EHR, Fitbit, pharmacy or appointment system during the build. Implement stable adapter and tool interfaces with realistic fixtures. The live value comes from the round, camera measurement, adaptive selection, deterministic decision and actual task creation—not from spending the build window on OAuth.

## Safety architecture

The LLM may:

- conduct the conversation;
- convert speech into structured answers;
- explain why a module was selected;
- summarise source material;
- draft the evidence card.

The LLM may not:

- diagnose;
- set urgency;
- change a medicine;
- choose an action outside the allowlist;
- override a red-flag rule;
- present a low-quality measurement as valid.

A versioned deterministic pathway owns red flags, thresholds, urgency and permitted actions. Every meaningful decision stores its protocol version and evidence sources.

## Assessment module contract

Every assessment is a versioned registry entry containing:

- the question it helps answer;
- required device capabilities;
- patient instructions;
- exclusions;
- input and output schema;
- capture-quality metrics;
- pass/fail threshold;
- evidence level;
- permitted pathway uses;
- retention rule;
- claim boundary.

For the demo, implement one real module well: `finger_ppg_hr_v1`. A second module can be a deterministic structured questionnaire. Movement, voice trends, eye movement, wounds and passive face-video signals belong in the blue-sky registry but should not be allowed to drive high-impact actions in the prototype.

## Definition of done

The vertical slice is complete only when all of the following work without manual database edits:

1. Seeded trigger appears for the correct synthetic patient.
2. Patient can start and complete a voice or text round.
3. Structured answers pass schema validation.
4. Finger-camera capture displays a live quality meter.
5. Poor-quality input yields no measurement and a clear retry path.
6. A valid measurement is stored with method, timestamp and quality.
7. The planner selects exactly one permitted follow-up.
8. The deterministic pathway returns an urgency and action.
9. The task is created once even when the request is retried.
10. The clinician evidence card contains source facts, quality, protocol version and completed actions.
11. The patient outcome card contains one understandable instruction.
12. The happy path succeeds three consecutive times in the demo environment.

## Twenty-hour build plan

### Hour 0–1: freeze the story

- Agree the synthetic patient, trigger, permitted measurement and outcome.
- Freeze schemas and state transitions.
- Remove all additional condition modules from the active build.

### Hours 1–4: parallel foundations

- Engineer 1: patient route and realtime voice/text fallback.
- Engineer 2: finger-camera capture and signal-quality UI.
- Engineer 3: FHIR fixture, snapshot, state machine and pathway engine.
- Product/design/clinical lead: clinician cockpit, copy, scenario and demo script.

### Hours 4–7: close the loop

- Connect structured conversation to round state.
- Persist assessment result.
- Execute protocol.
- Create task and evidence card.
- Add complete demo seed/reset.

### Hours 7–11: quality and fallback

- Add capture failure, red-flag and API failure handling.
- Add text fallback and pre-recorded audio fallback.
- Add deterministic replay mode without faking the visible measurement.
- Run the full loop repeatedly.

### Hours 11–15: interface and tests

- Polish the signal visualisation and clinician evidence card.
- Add Playwright happy path, poor-capture, red-flag and duplicate-action tests.
- Remove debugging clutter and unsupported claims.

### Hours 15–18: demo hardening

- Test on venue Wi-Fi and phone hotspot.
- Verify camera permission and browser support.
- Preload synthetic data and authenticate before presenting.
- Record a backup walkthrough.

### Hours 18–20: submission

- Final three-minute rehearsal.
- Package repository, README, architecture and safety boundaries.
- Do not add features.

## Cut order

Cut features in this order if the build slips:

1. Wearable OAuth integration.
2. PDF/document upload.
3. Passive voice biomarker.
4. OnePlan conflict graph.
5. Additional camera assessments.
6. Complex longitudinal trigger modelling.

Never cut:

- the real capture-quality gate;
- the deterministic safety decision;
- the consequential action;
- the clinician evidence card;
- the demo reset/fallback path.

## Suggested repository layout

```text
apps/
  web/
    app/patient/
    app/clinician/
    app/api/
packages/
  domain/              # round state, enums, Zod schemas
  fhir/                # adapter and synthetic fixtures
  assessments/         # registry and finger PPG module
  protocols/           # deterministic pathway definitions
  agents/              # realtime agent, tools, guardrails
  actions/              # review tasks, follow-up, messaging
  ui/                   # shared components
  observability/        # audit events and traces
fixtures/
  patients/
  rounds/
  protocols/
tests/
  unit/
  integration/
  e2e/
```

## Implementation-agent instruction

> Build the HomeRounds vertical slice exactly as specified. Treat the round as a state machine, not a free-form chatbot. Use synthetic FHIR R4 data. The hero path must start from a seeded longitudinal trigger, launch realtime voice with text fallback, run a real finger-camera heart-rate capture with quality gating, select one permitted follow-up from a versioned assessment registry, evaluate a deterministic protocol, create one idempotent clinician-review task and render a source-grounded evidence card. Use Zod for all AI and tool contracts. The model may converse and summarise but cannot set urgency, diagnose or change medicine. Persist protocol version, evidence sources, quality and tool events. Add a one-click demo reset and Playwright tests for happy path, poor capture, red flag and duplicate action. Do not add another condition or assessment until the full loop succeeds three times consecutively.
