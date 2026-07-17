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

- Optional ElevenLabs voice can help a patient express context, but the transcript remains editable and cannot answer required safety questions or choose an action.
- Text completes the entire flow with no voice-provider key.
- Local finger PPG and optional VitalLens share one optical contract, but a value exists only after quality passes.
- The state machine, red-flag gate, planner, protocol, and action allowlist—not a model—own the workflow.
- PostgreSQL idempotency, optimistic concurrency, and audit receipts carry the clinician closed loop.

## Three synthetic stories

1. **Calm text-first round** — complete a patient report with no external voice key.
2. **Poor signal, honest recovery** — see one coached retry, no invented number, and a human-review path.
3. **Structured red-flag hard stop** — a confirmed answer ends ordinary capture before a model can reinterpret it.

## Architecture

| Layer                    | What it does                                                           | Repository evidence                                                             |
| ------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Patient and clinician UX | Confirmed check-in, quality recovery, evidence review, task completion | `apps/web/src/features/patient`, `apps/web/src/features/clinician`              |
| Voice/text               | No-key text provider plus optional ElevenLabs WebRTC adapter           | `packages/voice`, `apps/web/src/features/voice`                                 |
| Optical assessment       | Local finger PPG and optional consented VitalLens adapter              | `packages/assessments/providers`                                                |
| Deterministic authority  | Round reducer, planner, fictional protocol, action allowlist           | `packages/domain`, `packages/planner`, `packages/protocols`, `packages/actions` |
| Evidence and persistence | Synthetic FHIR-shaped context, PostgreSQL, audit, idempotency          | `packages/clinical-records`, `packages/persistence`, `packages/audit`           |

## What is proved

At the submission base, the repository records:

- repository Prettier and 13/13 package lint, typecheck, test, and build gates;
- 100 web tests, 13 unit, 7 contract, 7 integration, and 5 demo-tooling tests;
- 6 root smoke cases, 3 patient journeys, and 3 clinician journeys;
- both accessibility and warmed performance suites;
- 14/14 persistence tests on a fresh PostgreSQL cluster;
- a protected local production-build check proving PostgreSQL readiness, all-three-scenario seed/check, patient/clinician access, wrong-code denial, secure-cookie attributes, 390 px layout, zero serious/critical axe findings, and zero console/page errors.

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

These checks use fixtures and browser automation. They do not prove a hosted deployment, live ElevenLabs/VitalLens, physical iPhone/Safari behavior, optical accuracy, clinical validity, or a real care workflow.

## Privacy and failure behavior

- No real patient data is permitted.
- Local finger PPG sends no frames from its provider path.
- HomeRounds persists no raw camera frames, face video, raw voice audio, or transcript.
- VitalLens is optional, consent-gated, server-proxied, and disabled without configuration; it has a distinct third-party processing boundary.
- Failed, uncertain, missing, or unavailable capture creates no measurement.
- Repeated action requests use stable idempotency keys.
- Unsupported states remain visible; the UI does not simulate persistence success.

## Current limitations

Hosted Vercel/Neon, live ElevenLabs/VitalLens, physical iPhone/Safari, and current external dependency-advisory evidence remain pending owner/account/privacy gates. There is no real eMed/EHR integration, real identity/tenancy, clinical review or validation, real operational owner/SLA, regulated deployment, or real-patient use.

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

A fictional patient completes a short structured check-in by text or optional editable voice. The app selects one optical provider, accepts a derived estimate only after quality passes, and preserves failure or uncertainty without inventing a measurement. Deterministic code owns red flags, protocol evaluation, and the action allowlist. PostgreSQL then carries one idempotent synthetic clinician task, source-labelled evidence, audited mutations, and patient-visible completion.

The result is not another chatbot answer or passive dashboard. It is a bounded patient-to-clinician workflow that remains complete with no provider key and makes abstention useful.

Synthetic-only, fictional protocol, not clinically validated, not diagnostic, not a medical device, and not a real care service. Hosted/provider/physical evidence remains pending.
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
