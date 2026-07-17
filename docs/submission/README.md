# HomeRounds submission package

HomeRounds determines the smallest reliable at-home assessment needed to complete the next safe care action.

This package is judge-ready for **Reimagine Health with eMed & OpenAI**, 17–18 July 2026. It describes a synthetic-only, fictional-protocol prototype. HomeRounds is not clinically validated, diagnostic, a medical device, or a real care service. It does not change medication. A failed or uncertain capture creates no measurement.

## Use this package

1. Start with [the copy-ready submission](./SUBMISSION.md).
2. Rehearse [the primary and recovery demo scripts](./DEMO_SCRIPT.md).
3. Use [the architecture narrative](./ARCHITECTURE.md) for technical questions.
4. Review [the judge alignment and strict self-score](./JUDGING.md).
5. Do not publish a material claim until it is allowed by [the claim and limitation audit](./CLAIM_AUDIT.md).
6. Capture only the approved assets in [the screenshot and video plan](./MEDIA_PLAN.md).
7. Adapt [the GitHub and project-gallery story](./GITHUB_STORY.md) for repository surfaces.

## Judge-facing thesis

Most at-home tools collect more data. HomeRounds asks a sharper question: **what is the smallest reliable check that can complete the next safe care action?** It combines a complete no-key text path, optional patient-confirmed voice, quality-gated optical capture, deterministic safety/protocol/action authority, and a persisted clinician closed loop.

The multimodal system has deliberately unequal authority:

| Layer                                                             | Role                                       | Authority boundary                                                                               |
| ----------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Text and optional ElevenLabs voice                                | Helps a person express and edit a check-in | Proposes narrative only; required structured answers need explicit confirmation                  |
| Local finger PPG or optional VitalLens adapter                    | Attempts an optical heart-rate estimate    | Passing quality may create a measurement; failed, uncertain, or unavailable capture creates none |
| State machine, red-flag gate, planner, protocol, action allowlist | Selects and advances the bounded workflow  | Deterministic application code owns safety and action                                            |
| PostgreSQL task and audit services                                | Carries evidence into clinician work       | Idempotency, optimistic concurrency, and persisted receipts govern mutations                     |

Both optical options are implemented behind one provider-neutral contract. Local finger PPG is the no-key default and sends no frames. VitalLens is optional, consent-gated, server-proxied, and unavailable without configuration. Neither has completed live-provider/physical comparative validation; do not claim comparative accuracy or physical results.

## Evidence status at the submission base

| Status                 | What can be said                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Implemented**        | Patient and clinician routes, no-key text path, optional ElevenLabs adapter, both optical adapters, quality abstention, deterministic state/protocol/action flow, PostgreSQL repository, audit timeline, and three synthetic scenarios exist in the repository.                                                                                                                                                                                                                                                                                                       |
| **Tested**             | The exact base records green 13-package gates, 100 web tests, 13 unit tests, 7 contract tests, 7 integration tests, 5 demo-tooling tests, 6 root smoke cases, 3 patient journeys, 3 clinician journeys, accessibility suites, and performance suites. Counts are separate suites and must not be summed as unique tests.                                                                                                                                                                                                                                              |
| **Locally observed**   | A fresh PostgreSQL database passed 14 persistence tests. Separately, the protected local production build proved PostgreSQL readiness, seed/check for all three scenarios, patient and clinician access, wrong-code denial, secure-cookie attributes, 390 px overflow coverage, no serious/critical axe findings, and no console/page errors. Checkpoint 6 then completed installed-Chrome normal/recovery/normal and red-flag user flows against fresh PostgreSQL. The protected-build, Playwright, and installed-Chrome observations remain distinct evidence sets. |
| **Externally pending** | Hosted Vercel/Neon, physical iPhone/Safari camera behavior, live ElevenLabs, live VitalLens, and a current external dependency-advisory result await owner/account/privacy gates.                                                                                                                                                                                                                                                                                                                                                                                     |
| **Future**             | Real identity/tenancy, clinical review and validation, regulated deployment, real eMed/EHR integration, real operational ownership/SLA, and real-patient use.                                                                                                                                                                                                                                                                                                                                                                                                         |

The full wording and evidence for each claim is in [CLAIM_AUDIT.md](./CLAIM_AUDIT.md).

## Source and evidence map

### Official event and company context

- [Official event listing](https://luma.com/aiengine-zado): event name, London dates/schedule, challenge, and judging categories—User impact, Innovation, Feasibility, and Demo quality. The listing says build completion is 15:00 and judging begins at 15:00 on 18 July 2026.
- [Official eMed About page](https://www.emed.com/about): eMed describes itself as a clinician-led, technology-driven digital health company and describes screening, prescribing, medication sourcing, adherence monitoring, lifestyle management, and biomarker testing in one mobile platform.
- No official submission form, field limits, mandatory built-with technology, or separate sponsor integration requirement was verified. The linked agenda page was unavailable during this audit. Treat any later organizer instruction as authoritative and update this package before submission.

### Product and implementation

- [Repository README](../../README.md): product boundary and local baseline.
- [Home page](../../apps/web/src/app/page.tsx): judge launcher, three scenarios, core promise, and visible boundaries.
- [Patient experience](../../apps/web/src/features/patient/patient-round-app.ts): structured safety answers, editable text/voice confirmation, optical consent/quality/recovery, action confirmation, and patient outcome.
- [Clinician cockpit](../../apps/web/src/features/clinician/clinician-cockpit.tsx), [evidence chain](../../apps/web/src/features/clinician/evidence-chain.tsx), and [action panel](../../apps/web/src/features/clinician/action-panel.tsx): queue, provenance, uncertainty, audit, and persisted mutations.
- [Voice provider boundary](../../packages/voice/src/providers.ts) and [ElevenLabs adapter](../../apps/web/src/features/voice/elevenlabs-adapter.ts): no-key text capability and optional hosted voice lifecycle.
- [Local finger PPG](../../packages/assessments/providers/finger-ppg/provider.ts) and [VitalLens adapter](../../packages/assessments/providers/vitallens/provider.ts): provider-neutral quality-gated optical paths.
- [Planner](../../packages/planner/src/index.ts), [protocol evaluator](../../packages/protocols/src/evaluator.ts), [versioned demo protocol](../../data/protocols/cardiometabolic-demo.v1.json), and [round reducer](../../packages/domain/src/round-reducer.ts): deterministic authority.
- [Action service](../../packages/actions/src/service.ts), [audit events](../../packages/audit/src/events.ts), [PostgreSQL repository](../../packages/persistence/src/postgres/repository.ts), and [migration](../../infra/db/migrations/0001_homerounds_foundations.sql): idempotent closed loop and persistence.
- [Three synthetic scenarios](../../data/demo/scenarios.v1.json) and [recorded recovery policy](../../apps/web/public/demo/recorded-valid-capture.v1.json): reproducible judge paths.

### Validation and limitations

- [Checkpoint evidence ledger](../orchestration/STATE.md): exact integrated checks and locally observed evidence at the base.
- [Completed local rehearsal record](../qa/three-run-rehearsal.md): exact installed-Chrome candidate, environment, timings, passes, and limitations.
- [Security boundary](../security/README.md), [privacy/data flow](../security/privacy-data-flow-retention.md), and [security controls](../security/security-controls-and-response.md): implemented controls and release-blocking gaps.
- [Release/deploy/rollback](../operations/release-deploy-rollback.md), [PostgreSQL runbook](../operations/postgresql-and-migrations.md), and [incident/recovery](../operations/incident-recovery-observability.md): deploy-ready procedures versus observed evidence.
- [Product strategy](../../planning/00_PRODUCT_STRATEGY.md), [technical architecture](../../planning/01_TECHNICAL_ARCHITECTURE.md), [requirements/test plan](../../planning/03_REQUIREMENTS_AND_TEST_PLAN.md), and [production roadmap](../../planning/05_PRODUCTION_ROADMAP.md): intended product, resolved scope, validation plan, and future gates.
- [Source execution brief](../../HomeRounds_Source_Package/HomeRounds_Hackathon_Execution_Brief.md) and [source PRD](../../HomeRounds_Source_Package/HomeRounds_PRD_Technical_Spec.md): original product bundle. Where it conflicts with implemented evidence, the code, current safety/operations docs, and checkpoint ledger control the submission claim.

## Package maintenance rule

Before publishing, replace only explicit placeholders, rerun the validations listed in [SUBMISSION.md](./SUBMISSION.md), and reconcile any new QA evidence into [CLAIM_AUDIT.md](./CLAIM_AUDIT.md). Do not silently upgrade `pending` to `observed`, or fixture/browser evidence to hosted, provider-live, physical-device, medical, or clinical evidence.
