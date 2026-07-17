# GitHub README and project-gallery story

This file contains copy to adapt into the repository README or a project gallery. It does not authorize editing the root README in this lane. The public repository URL is verified; keep product and video URLs as placeholders until their separate evidence gates pass.

## Copy-ready GitHub README story

````markdown
# HomeRounds

> The smallest reliable at-home assessment for the next safe care action.

HomeRounds is a synthetic hackathon prototype for adaptive asynchronous chronic-care rounds. A patient completes a short, confirmed check-in; the system asks only for evidence that can change a permitted next action; failed or uncertain optical capture creates no measurement; deterministic rules create one bounded action; and a clinician receives an auditable evidence chain through completion.

Built for **Reimagine Health with eMed & OpenAI**, 17–18 July 2026.

**Safety boundary:** synthetic data and a fictional protocol only. HomeRounds is not clinically validated, diagnostic, a medical device, emergency monitoring, or a real care service. It does not change medication.

## Why HomeRounds

At-home chronic-care products often stop at one of three places: a conversation, a reading, or a dashboard alert. The difficult work still remains—deciding whether the evidence is usable, applying the right bounded workflow, and giving the next task a clear owner.

HomeRounds closes that loop:

> Patient confirmation → evidence quality → deterministic protocol → allowlisted action → persisted clinician handoff → patient completion

The key idea is **unequal authority**:

- Live ElevenLabs voice asks bounded questions and proposes typed fields, but nothing becomes a fact until the patient explicitly reviews and confirms it.
- Text completes the entire flow with no voice-provider key.
- Fireworks ranks only a server-created eligible evidence set and falls back deterministically on abstention or failure.
- Local finger PPG, medication-label review, and a separate optional local voice signal create evidence only after their quality/review gates. VitalLens remains an implemented but disabled alternative.
- The state machine, red-flag gate, planner, protocol, and action allowlist—not a model—own the workflow.
- PostgreSQL idempotency, optimistic concurrency, and audit receipts carry the clinician closed loop.

## Three synthetic stories

1. **Live AI home round** — explain a concern, review the ElevenLabs proposal, and let Fireworks open one eligible evidence module.
2. **Multimodal, honest recovery** — review medication, finger pulse, or the optional local voice signal; see no invented fact when quality fails.
3. **Structured red-flag hard stop** — a confirmed answer ends ordinary capture before a model can reinterpret it.

## Architecture

| Layer                    | What it does                                                           | Repository evidence                                                             |
| ------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Patient and clinician UX | Confirmed check-in, quality recovery, evidence review, task completion | `apps/web/src/features/patient`, `apps/web/src/features/clinician`              |
| Voice/text               | Live ElevenLabs WebRTC, typed proposal review, and no-key text parity  | `packages/voice`, `apps/web/src/features/voice`                                 |
| Adaptive AI              | Fireworks allowlist ranking, fallback, and label extraction            | `packages/inference`, medication and round-map features                         |
| Multimodal assessment    | Finger PPG, local voice features, medication, optional VitalLens       | `packages/assessments/providers`                                                |
| Deterministic authority  | Round reducer, planner, fictional protocol, action allowlist           | `packages/domain`, `packages/planner`, `packages/protocols`, `packages/actions` |
| Evidence and persistence | Synthetic FHIR-shaped context, PostgreSQL, audit, idempotency          | `packages/clinical-records`, `packages/persistence`, `packages/audit`           |

## What is proved

At the Checkpoint 8 candidate, the repository records:

- repository Prettier and 14/14 package lint, typecheck, test, and build gates;
- 174 web tests plus one visible live skip, 13 unit, 56 contract, 26 integration, and 5 demo-tooling tests;
- root, patient, clinician, adaptive-AI, and voice-agent browser matrices;
- their accessibility and warmed performance suites;
- live ElevenLabs conversation/proposal and Fireworks selection/extraction checks;
- a protected Vercel/Neon Preview with cold persistence and privacy-safe quality rejection.

These are separate evidence sets. The complete patient-to-clinician mutation loop is covered by Playwright/integration suites; it was not part of the final protected production-build access run. Suite counts overlap and are not a unique summed total.

## Local setup

Requirements: Node 22.22.2+, pnpm 10.33.0, and a synthetic-only PostgreSQL database for persistence evidence.

```bash
cp .env.example .env.local
pnpm install --frozen-lockfile
pnpm dev
```

The no-key profile uses `VOICE_PROVIDER=disabled` and local finger PPG as the default optical adapter. See `docs/operations/postgresql-and-migrations.md` for the full PostgreSQL profile and exact demo seed/check workflow.

## Verification

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
```

These checks combine fixtures, browser automation, and separately recorded live-provider/hosted evidence. They do not prove live VitalLens, physical iPhone/Safari behavior, optical accuracy, clinical validity, or a real care workflow.

## Privacy and failure behavior

- No real patient data is permitted.
- Local finger PPG sends no frames from its provider path.
- HomeRounds persists no raw camera frames, face video, raw voice audio, or transcript.
- VitalLens is optional, consent-gated, server-proxied, and disabled without configuration; it has a distinct third-party processing boundary.
- Failed, uncertain, missing, or unavailable capture creates no measurement.
- Repeated action requests use stable idempotency keys.
- Unsupported states remain visible; the UI does not simulate persistence success.

## Current limitations

Live VitalLens, physical iPhone/Safari, a passing hosted sustained-vowel feature result, and the current external dependency-advisory refresh remain pending. There is no real eMed/EHR integration, real identity/tenancy, clinical review or validation, real operational owner/SLA, regulated deployment, or real-patient use.

See `docs/submission/CLAIM_AUDIT.md` for exact allowed wording and `docs/submission/DEMO_SCRIPT.md` for the judge path.
````

## Project-gallery card

### Short card

```text
HomeRounds turns a short, patient-confirmed at-home check-in into the smallest reliable assessment, a deterministic next action, and an auditable clinician handoff. Weak optical evidence creates no number—and still completes a safe review workflow.
```

### Gallery description

```markdown
HomeRounds reframes AI-powered chronic-care support around a simple question: **what is the smallest reliable assessment needed to complete the next safe care action?**

A fictional patient completes a live or text check-in, explicitly confirms an ElevenLabs proposal, and lets Fireworks rank one eligible medication, finger-pulse, or optional voice-signal module. Quality gates preserve failure or uncertainty without inventing a measurement. Deterministic code owns red flags, protocol evaluation, and the action allowlist. PostgreSQL then carries one idempotent synthetic clinician task, source-labelled evidence, audited mutations, and patient-visible completion.

The result is not another chatbot answer or passive dashboard. It is a bounded patient-to-clinician workflow that remains complete with no provider key and makes abstention useful.

Synthetic-only, fictional protocol, not clinically validated, not diagnostic, not a medical device, and not a real care service. Physical iPhone, live VitalLens, and clinical evidence remain pending.
```

## Social/share copy

Use only if a short event post is needed:

```text
I built HomeRounds for Reimagine Health with eMed & OpenAI: a synthetic adaptive at-home round where AI helps the conversation, quality decides whether evidence exists, deterministic rules own the action, and an audit trail carries the clinician handoff. Failed capture creates no measurement.
```

## Suggested repository topics

Topics describe the codebase, not live evidence:

```text
healthtech, hackathon, nextjs, typescript, postgresql, zod, playwright, accessibility, deterministic-workflows, synthetic-data
```

Do not add `medical-device`, `diagnosis`, `clinical-ai`, `production-ready`, `emed-integration`, `openai-api`, `iphone-validated`, or provider-live topics.

## Links block

Populate only after verification:

```markdown
- **Live synthetic demo:** [PENDING]
- **Demo video:** [PENDING]
- **Repository:** [https://github.com/AbhinavGupta707/eMed](https://github.com/AbhinavGupta707/eMed)
- **Submission evidence and limitations:** `docs/submission/README.md`
```

## README quality check

- Lead with the product transformation, not setup.
- Keep the safety boundary above the fold.
- Keep implemented/tested/local/pending/future evidence distinct.
- Do not add badges that imply a current external advisory, deployment, clinical review, or provider status.
- Link the exact evidence file for every quantitative test claim.
- Update test counts only from a new integrated checkpoint ledger.
