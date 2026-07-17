# HomeRounds

> The smallest reliable at-home assessment for the next safe care action.

HomeRounds is an AI-guided asynchronous home round for the time between appointments. A live voice agent turns a patient conversation into explicitly confirmed structured facts; Fireworks chooses the next useful evidence module from a server-created allowlist; quality-gated camera, medication-label, and optional local voice signals add evidence; and a clinician receives an auditable handoff. Models may propose, but deterministic safety, protocol, quality, and action rules retain authority.

Built for **Reimagine Health with eMed & OpenAI**, 17–18 July 2026.

> **Safety boundary:** synthetic data and a fictional protocol only. HomeRounds is not clinically validated, diagnostic, a medical device, emergency monitoring, or a real care service. It does not change medication.

## Why HomeRounds

At-home chronic-care products often stop at a conversation, a reading, or a dashboard alert. HomeRounds closes the remaining loop:

> Patient confirmation → evidence quality → deterministic protocol → allowlisted action → persisted clinician handoff → patient completion

The system is deliberately built around unequal authority:

- Live ElevenLabs WebRTC guides the patient through bounded symptom and red-flag questions and proposes typed fields for visible review; it cannot silently write facts or choose an action.
- Accessible structured text completes the same flow with no voice-provider key.
- Fireworks ranks only eligible medication-label, local finger-pulse, and optional voice-signal modules; malformed, stale, unavailable, or failed inference falls back deterministically.
- Local finger PPG and optional VitalLens share one optical contract, but a value exists only after quality passes. VitalLens is implemented but disabled pending explicit consent and credentials.
- A separate consented seven-second “ah” station derives research-only F0, pitch variability, jitter, shimmer, HNR, and duration locally. It is not passive conversation analysis and never uploads or stores audio.
- The state machine, red-flag gate, planner, fictional protocol, and action allowlist—not a model—own the workflow.
- PostgreSQL idempotency, optimistic concurrency, and audit receipts carry the clinician closed loop.

## Demonstration stories

1. **Live AI home round** — Maya explains that she feels weak; ElevenLabs asks bounded follow-ups, Maya reviews the typed proposal, and Fireworks opens the next eligible evidence station.
2. **Multimodal evidence** — review a synthetic medication label, run local finger-camera pulse, or consent to the optional local sustained-vowel signal. A failed quality gate creates no measurement.
3. **Safe exception paths** — a structured red flag stops ordinary capture; provider failure falls back deterministically; a clinician sees provenance and completes one idempotent review task.

## Architecture

| Layer                    | Responsibility                                                         | Repository evidence                                                             |
| ------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Patient and clinician UX | Confirmed check-in, quality recovery, evidence review, task completion | `apps/web/src/features/patient`, `apps/web/src/features/clinician`              |
| Voice and text           | Live ElevenLabs WebRTC, typed proposal review, and no-key text parity  | `packages/voice`, `apps/web/src/features/voice`, `voice-round`                  |
| Adaptive AI              | Fireworks allowlist ranking, abstention, fallback, label extraction    | `packages/inference`, medication and round-map features                         |
| Multimodal assessment    | Local finger PPG, local voice features, optional VitalLens, medication | `packages/assessments/providers`                                                |
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
pnpm test:e2e:ai
pnpm test:a11y
pnpm test:performance
```

The Checkpoint 8 release evidence records all 14 package lint/type/test/build gates, 174 web tests plus one visible live-provider skip, 13 unit, 56 contract, 26 integration, 5 demo-tooling tests, the complete root/patient/clinician/adaptive/voice browser matrix, accessibility and performance suites, and live provider checks. Installed Chrome completed a real ElevenLabs microphone conversation through explicit proposal confirmation and a hosted Fireworks selection against Neon-backed persistence.

These are separate, sometimes overlapping evidence sets—not one summed test count. They do not prove live VitalLens, physical iPhone/Safari behavior, optical accuracy, clinical validity, or a real care workflow.

## Privacy and failure behavior

- No real patient data is permitted.
- Local finger PPG sends no frames from its provider path.
- HomeRounds persists no raw camera frames, face video, raw voice audio, or transcript.
- Failed local voice quality creates no voice fact; passing derived features are research-only and need a personal baseline before trend language is meaningful.
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

The synthetic Checkpoint 8 Preview is available at [homerounds-checkpoint-8.vercel.app](https://homerounds-checkpoint-8.vercel.app) behind its demo access controls. Live VitalLens, physical iPhone/Safari, a passing hosted sustained-vowel feature result, current external dependency-advisory evidence, and qualified clinical review remain pending. There is no diagnosis, medication change, real eMed/EHR integration, real identity/tenancy, regulated deployment, or real-patient use.
