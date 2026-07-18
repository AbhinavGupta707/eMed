# Copy-ready submission

This is a complete narrative package, not a claim that the event uses a particular submission platform or field set. The official event page did not expose field names or character limits during the audit. Paste sections only into matching fields and obey any organizer instructions received at the event.

## Title

```text
HomeRounds
```

## Tagline

```text
The smallest reliable at-home assessment for the next safe care action.
```

## Elevator pitch

```text
HomeRounds turns a short, patient-confirmed check-in into the smallest reliable assessment, a deterministic next action, and an auditable clinician handoff.
```

## One-paragraph overview

```text
HomeRounds is an AI-guided asynchronous round for people in chronic-care programmes. A live ElevenLabs conversation proposes patient-reviewable structured facts, Fireworks ranks only the next eligible evidence module, and quality-gated medication, finger-camera pulse, and optional local voice signals add evidence. Deterministic code still owns red flags, quality, protocol evaluation, and the action allowlist. The result is one clear synthetic patient next step and a persisted clinician task with evidence, uncertainty, rule version, provenance, and an audit trail.
```

## Project story

```markdown
# HomeRounds

**The smallest reliable at-home assessment for the next safe care action.**

## Inspiration

At-home chronic-care tools often create two burdens at once: patients must decide which change matters, and clinical teams receive scattered answers, readings, and messages that still need reconstruction. A fixed questionnaire asks too much; a passive dashboard can show a trend without completing the work it creates.

I built HomeRounds around a different unit of care: a short, adaptive asynchronous round. It gathers only the next reliable fact that can change a permitted action, then closes the loop with a clear patient state and an auditable clinician handoff.

That directly matches the event challenge: new at-home chronic-condition support, better use of biomarkers, human-feeling long-term support, and connection with clinical teams without requiring every interaction to be a live appointment.

## What it does

A user can open one of three visibly synthetic scenarios:

1. **Live AI home round:** explain a concern to ElevenLabs, review its typed proposal, and let Fireworks open one eligible evidence module.
2. **Multimodal evidence with honest recovery:** review a medication label, run finger-camera pulse, or try the optional local voice signal; failed quality creates no measurement.
3. **Structured red-flag hard stop:** show that a patient-confirmed answer ends ordinary capture before voice or a model can reinterpret it.

The core workflow is:

1. The patient explicitly accepts a synthetic two-minute round.
2. Required red-flag and symptom answers use structured controls.
3. Typed text—or live ElevenLabs voice—produces a visible typed proposal that remains inert until the patient reviews and confirms it.
4. The server constructs the eligible medication, local finger-PPG, and optional local voice-signal set; Fireworks may rank one candidate or abstain.
5. Passing quality may create a derived observation. Failed, uncertain, unavailable, or cancelled capture creates no measurement. VitalLens is an implemented but disabled alternative optical adapter.
6. A deterministic protocol returns a bounded result and an allowlisted action.
7. The patient explicitly confirms creation of one synthetic programme-review task.
8. The clinician cockpit shows trigger provenance, confirmed report, measurement or quality failure, protocol/rule version, task/idempotency state, and audit events.
9. The clinician can save a synthetic note, acknowledge, record a contact attempt, and complete the task through persisted, audited mutations. The patient view then reflects completion.

The output is not a chatbot answer or a risk score. It is a closed evidence-to-action workflow with a named state, source trail, explicit uncertainty, and a next owner.

## The multimodal AI factor

The important design choice is unequal authority.

- **Live AI voice** makes the interaction natural, asks bounded questions, and invokes typed proposal tools whose fields the patient must edit/review and confirm.
- **Text always completes the round** with no provider key, so accessibility and workflow integrity do not depend on a hosted model.
- **Fireworks adapts the route without becoming the authority.** It ranks only server-created eligible modules and has deterministic abstention/failure fallback.
- **Multimodal input is evidence, not authority.** Local finger PPG sends no frames; medication-label vision is reviewable; the optional seven-second voice signal is derived locally and research-only; VitalLens has a separate consented proxy boundary.
- **Deterministic code decides.** The state machine, red-flag gate, planner, versioned protocol, quality gate, and action allowlist own workflow transitions and next actions.
- **PostgreSQL carries the evidence.** Idempotency, optimistic concurrency, audit events, and task receipts preserve the clinician closed loop.

This is more than an AI wrapper because generative output cannot diagnose, set urgency, skip required answers, invent a measurement, change medication, or execute an unregistered action.

## Product architecture

| Layer                            | Implementation                                                                                     | Why it matters                                                    |
| -------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Patient and clinician experience | Next.js, React, TypeScript, shared accessible UI                                                   | One coherent mobile round and desktop review workflow             |
| Voice and text                   | Live ElevenLabs WebRTC, typed proposal review, and no-key text parity                              | Natural input without surrendering authority or no-key completion |
| Adaptive AI                      | Fireworks allowlist ranking, abstention/fallback, medication-label extraction                      | Novel-scenario choice within a deterministic safety envelope      |
| Multimodal assessment            | Local finger PPG, local voice features, medication review, and optional VitalLens                  | Passing evidence, explicit failure, or typed unavailability       |
| Deterministic core               | Round reducer, planner, red-flag gate, versioned JSON protocol, action allowlist                   | Testable safety and workflow decisions                            |
| Clinical context                 | Curated synthetic FHIR-shaped bundle and provenance adapter                                        | Reviewable context without real patient data or a live EHR claim  |
| Persistence and audit            | PostgreSQL, Drizzle, transactions, idempotency, optimistic concurrency, append-only audit controls | A clinician action is saved and traceable, not merely displayed   |

## How I built it

**Frontend:** Next.js 16, React 19, TypeScript, responsive CSS, and a shared accessible component package.

**Contracts and validation:** Zod at file, provider, API, protocol, event, and persistence boundaries.

**Voice:** a live ElevenLabs React/WebRTC agent with short-lived server-issued credentials, bounded synthetic history, exact typed client tools, explicit structured proposal review, lifecycle recovery, and complete no-key text parity.

**Adaptive AI:** Fireworks DeepSeek ranks a server-created evidence allowlist and Kimi extracts fixed medication-label fields for patient review. Neither model owns urgency, protocol, or actions.

**Optical assessment:** a browser-local rear-camera finger-PPG provider plus a server-proxied VitalLens adapter. The release config selects exactly one; the server never silently swaps providers during a round.

**Workflow:** a deterministic round reducer, explicit burden budget, provider registry, one-follow-up planner, red-flag-first protocol evaluator, and allowlisted action service.

**Data and operations:** synthetic FHIR-shaped fixtures; PostgreSQL repositories; a forward-only migration; exact-scope seed/reset tooling; readiness, protected-demo, deployment, rollback, incident, and privacy runbooks.

**Testing:** the Checkpoint 8 candidate records green 14-package lint/type/test/build gates, 174 web tests plus one visible live skip, 13 unit, 56 contract, 26 integration, 5 demo-tooling tests, the root/patient/clinician/adaptive/voice browser matrix, accessibility and performance suites, live ElevenLabs and Fireworks checks, and hosted Neon persistence evidence. These are separate suite counts, not a summed total.

## Challenges

**Keeping AI useful without making it the authority.** Voice and narrative are valuable for a human interaction, but unsafe as hidden workflow control. I separated presentation and proposal from confirmed structured facts, deterministic decisions, and persisted actions.

**Making capture failure a product outcome.** Optical demos often reward always showing a number. HomeRounds treats weak, uncertain, unsupported, cancelled, or failed capture as evidence about evidence: it creates no measurement and can route the round to human review.

**Closing the loop instead of drawing a dashboard.** The difficult part was not another card. It was making patient state, action idempotency, clinician mutations, audit provenance, and patient completion agree under retries and stale writes.

**Keeping the prototype honest.** The repository separates implemented, tested, locally observed, hosted, externally pending, and future evidence. Live ElevenLabs, Fireworks, and Vercel/Neon are observed; physical iPhone/Safari, live VitalLens, clinical validation, and the current external dependency-advisory refresh are not claimed as complete.

## Accomplishments

- A complete no-key text path reaches a persisted clinician workflow.
- A failed or uncertain capture produces no numeric measurement.
- A structured red flag stops ordinary capture before model interpretation.
- Repeated action attempts do not create duplicate work.
- Clinician note, acknowledgement, contact-attempt, and completion mutations return persisted audit references.
- The patient view reflects clinician completion from saved task state.
- The protected local production build proved PostgreSQL readiness, seed/check for all three scenarios, patient and clinician access, wrong-code denial, secure-cookie attributes, 390 px responsive coverage, no serious/critical axe findings, and no console/page errors. Separate Playwright/integration suites prove the complete patient-to-clinician mutation loop.

## What I learned

The most useful form of AI in a sensitive workflow is not maximum autonomy. It is a clearly bounded collaborator around a deterministic system: the AI helps the person communicate; quality controls decide whether evidence exists; rules decide what is permitted; and persistence proves who owns the next step.

I also learned that abstention can be a compelling product moment. “No reliable number” is not a failed demo when the system can preserve uncertainty, prevent false evidence, and still complete an owned workflow.

## What is next

The next step is external validation, not feature breadth: run the physical iPhone/Safari matrix, review optional VitalLens privacy/account settings, compare the two optical implementations without making a clinical-accuracy claim, establish repeated personal voice baselines, and have a qualified reviewer approve all fictional protocol wording.

Any real pilot would additionally require real identity and tenancy, an explicit intended purpose and population, clinical governance, device/population validation, security and privacy review, a named operational owner/SLA, and a shadow evaluation against current workflow. Real eMed/EHR integration, multiple condition packs, and regulated deployment are future work.

## Safety, privacy, and limitations

HomeRounds is synthetic-only and uses a fictional protocol. It is not clinically validated, not diagnostic, not a medical device, not emergency monitoring, and not a real care service. It does not change medication. It stores no raw camera frames or raw voice audio; confirmed narrative is not persisted in this slice. Local finger PPG sends no frames. Optional VitalLens changes the data boundary and remains disabled without explicit configuration and consent.

The protected synthetic Vercel/Neon Preview and live ElevenLabs/Fireworks paths have observed evidence. Physical iPhone/Safari, live VitalLens, a passing hosted voice-feature capture, and a current external dependency advisory remain pending owner/account/privacy gates.
```

## Built with

Use this list only if the form asks for technologies. It reflects repository dependencies and implemented adapters, not externally verified live services.

```text
Next.js, React, TypeScript, Zod, PostgreSQL, Drizzle ORM, ElevenLabs Conversational AI, WebRTC, Fireworks AI, Playwright, Vitest, axe-core, pnpm, Turborepo, Vercel, Neon
```

Do not add OpenAI API, a live eMed API, FHIR server, VitalLens live service, iPhone, or Safari as a “built with/live” tag unless new evidence establishes actual use. The event is supported by OpenAI, but this repository does not implement an OpenAI API dependency.

## Challenge alignment answer

```text
HomeRounds reimagines at-home chronic-condition management as a short, adaptive round: gather only the next reliable fact, abstain when evidence is weak, apply bounded rules, and complete an auditable clinician handoff without requiring a constant live appointment.
```

## Reproduction

### Judge path in a prepared environment

1. Open **https://homerounds.vercel.app**.
2. Choose **Poor signal, honest recovery**; the public hackathon build creates the bounded synthetic patient session automatically.
3. Complete the structured answers using text; confirm the editable check-in text.
4. At the optical step, use the observed failure/unsupported route or choose **Continue without a measurement**. Do not use the recorded recovery asset for a live-capture claim.
5. Confirm **Create synthetic review task**.
6. Open **Clinician cockpit**, select the returned task, and inspect **Evidence chain**, **Uncertainty and review boundary**, and **Event and audit timeline**.
7. Acknowledge, record a contact attempt, and complete the task. Return to the patient view and refresh to show **Synthetic review completed**.
8. Run the red-flag scenario if time permits; the ordinary camera flow must stop.

### Local reproduction from the repository

Requirements: Node 22.22.2+, pnpm 10.33.0, PostgreSQL 17 target dialect, and a dedicated synthetic-only database.

```bash
corepack enable
corepack prepare pnpm@10.33.0 --activate
pnpm install --frozen-lockfile
docker compose -f infra/deploy/local-postgres.compose.yaml up -d postgres
export DATABASE_URL='postgresql://homerounds:homerounds@127.0.0.1:5432/homerounds'
psql "$DATABASE_URL" --no-psqlrc -v ON_ERROR_STOP=1 \
  -f infra/db/migrations/0001_homerounds_foundations.sql
APP_ENV=development DEMO_MODE=true \
  APP_BASE_URL=http://127.0.0.1:3000 \
  DATABASE_URL="$DATABASE_URL" \
  VOICE_PROVIDER=disabled OPTICAL_ASSESSMENT_PROVIDER=finger_ppg \
  pnpm --filter @homerounds/web dev --hostname 127.0.0.1 --port 3000
```

In a second terminal:

```bash
export DATABASE_URL='postgresql://homerounds:homerounds@127.0.0.1:5432/homerounds'
pnpm demo:seed --base-url http://127.0.0.1:3000
pnpm demo:check --base-url http://127.0.0.1:3000
```

Require `demo:check` to report all three scenarios ready and the runtime profile as `postgres`. Open `http://127.0.0.1:3000` and follow the judge path. These commands do not prove a hosted deployment, live provider, or physical phone.

## Submission links and assets checklist

| Item                        | Status                                                                             | Rule                                                                                            |
| --------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Repository URL              | [https://github.com/AbhinavGupta707/eMed](https://github.com/AbhinavGupta707/eMed) | Public URL verified by the repository owner; verify the visible candidate SHA before publishing |
| Product URL                 | **Pending external gate**                                                          | Add only after exact Vercel/Neon deployment passes the hosted checklist                         |
| Demo video                  | **Pending recording**                                                              | Record from the exact candidate and use the script/shot list in this package                    |
| Screenshots                 | **Pending capture**                                                                | Use only approved shots from `MEDIA_PLAN.md`                                                    |
| Application evidence base   | `8589723e511b65dc849ef36234e7f462966e14a5`                                         | Immutable Checkpoint 4 code/runtime evidence base                                               |
| Rehearsed package candidate | `99acb5b` before Checkpoint 6 evidence-only documentation updates                  | Installed-Chrome/PostgreSQL normal/recovery/normal and red-flag observation                     |
| Physical/provider proof     | **Pending**                                                                        | Do not imply passing evidence through screenshots or tags                                       |

## Final copy check before paste

- Reconcile the candidate SHA and new QA evidence with `CLAIM_AUDIT.md`.
- Insert only verified URLs.
- Follow any organizer-provided field names, limits, asset requirements, or sponsor rules.
- Remove statements that a later regression or waiver invalidates.
- Keep the safety boundary intact even if the target field is short.
