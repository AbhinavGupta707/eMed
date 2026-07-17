# HomeRounds

> The smallest reliable at-home assessment for the next safe care action.

HomeRounds is a synthetic hackathon prototype for adaptive asynchronous chronic-care rounds. A patient completes a short, confirmed check-in; the system asks only for evidence that can change a permitted next action; failed or uncertain optical capture creates no measurement; deterministic rules create one bounded action; and a clinician receives an auditable evidence chain through completion.

Built for **Reimagine Health with eMed & OpenAI**, 17–18 July 2026.

> **Safety boundary:** synthetic data and a fictional protocol only. HomeRounds is not clinically validated, diagnostic, a medical device, emergency monitoring, or a real care service. It does not change medication.

## Why HomeRounds

At-home chronic-care products often stop at a conversation, a reading, or a dashboard alert. HomeRounds closes the remaining loop:

> Patient confirmation → evidence quality → deterministic protocol → allowlisted action → persisted clinician handoff → patient completion

The system is deliberately built around unequal authority:

- Optional ElevenLabs voice can help a patient express context, but the draft remains editable and cannot answer required safety questions or choose an action.
- Accessible structured text completes the entire flow with no voice-provider key.
- Local finger PPG and optional VitalLens share one optical contract, but a value exists only after quality passes.
- The state machine, red-flag gate, planner, fictional protocol, and action allowlist—not a model—own the workflow.
- PostgreSQL idempotency, optimistic concurrency, and audit receipts carry the clinician closed loop.

## Three synthetic stories

1. **Calm text-first round** — complete a report without an external voice key.
2. **Poor signal, honest recovery** — preserve failed or unavailable evidence without inventing a number, then complete human review.
3. **Structured red-flag hard stop** — a patient-confirmed answer ends ordinary capture before a model can reinterpret it.

## Architecture

| Layer                    | Responsibility                                                         | Repository evidence                                                             |
| ------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Patient and clinician UX | Confirmed check-in, quality recovery, evidence review, task completion | `apps/web/src/features/patient`, `apps/web/src/features/clinician`              |
| Voice and text           | No-key text provider plus optional ElevenLabs adapter                  | `packages/voice`, `apps/web/src/features/voice`                                 |
| Optical assessment       | Local finger PPG and optional consented VitalLens adapter              | `packages/assessments/providers`                                                |
| Deterministic authority  | Round reducer, planner, versioned protocol, action allowlist           | `packages/domain`, `packages/planner`, `packages/protocols`, `packages/actions` |
| Evidence and persistence | Synthetic FHIR-shaped context, PostgreSQL, audit, idempotency          | `packages/clinical-records`, `packages/persistence`, `packages/audit`           |

## Local setup

Requirements: Node 22.22.2+, pnpm 10.33.0, and a dedicated synthetic-only PostgreSQL database for persistence evidence.

```bash
cp .env.example .env.local
pnpm install --frozen-lockfile
pnpm dev
```

The no-key profile uses `VOICE_PROVIDER=disabled` and local finger PPG as the default optical adapter. See the [PostgreSQL runbook](./docs/operations/postgresql-and-migrations.md) for the persistent demo profile and exact seed/check workflow.

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

The release evidence records 13/13 package gates, 100 web tests, 13 unit, 7 contract, 7 integration, 5 demo-tooling tests, 6 responsive smoke cases, 3 patient journeys, 3 clinician journeys, both accessibility and performance suites, and 14/14 tests on a fresh PostgreSQL cluster. Installed-Chrome normal/recovery/normal rehearsals and a red-flag hard stop also passed against the PostgreSQL-backed local candidate.

These are separate, sometimes overlapping evidence sets—not one summed test count. They do not prove a hosted deployment, live ElevenLabs or VitalLens, physical iPhone/Safari behavior, optical accuracy, clinical validity, or a real care workflow.

## Privacy and failure behavior

- No real patient data is permitted.
- Local finger PPG sends no frames from its provider path.
- HomeRounds persists no raw camera frames, face video, raw voice audio, or transcript.
- VitalLens is optional, consent-gated, server-proxied, and disabled without configuration.
- Failed, uncertain, missing, cancelled, or unavailable capture creates no measurement.
- Repeated action requests use stable idempotency keys.
- Unsupported states remain visible; the UI does not simulate persistence success.

## Evidence and submission

- [Judge-ready submission package](./docs/submission/README.md)
- [Exact claim and limitation audit](./docs/submission/CLAIM_AUDIT.md)
- [Demo script](./docs/submission/DEMO_SCRIPT.md)
- [QA evidence index](./docs/qa/README.md)
- [Requirements traceability](./docs/qa/requirements-traceability.md)
- [Release checklist and waivers](./docs/qa/release-checklist-and-waivers.md)
- [Orchestration state](./docs/orchestration/STATE.md)

Hosted Vercel/Neon, live ElevenLabs/VitalLens, physical iPhone/Safari, current external dependency-advisory evidence, and qualified clinical review remain pending owner/account/privacy gates. There is no real eMed/EHR integration, real identity/tenancy, regulated deployment, or real-patient use.
