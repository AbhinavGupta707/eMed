# HomeRounds QA evidence package

This package indexes release evidence for the synthetic HomeRounds hackathon prototype. It does not establish clinical validity, medical-device performance, real-patient readiness, a hosted deployment, a live provider call, or a physical-device run.

## Provenance

| Field                     | Value                                                                         |
| ------------------------- | ----------------------------------------------------------------------------- |
| Application evidence base | `8589723e511b65dc849ef36234e7f462966e14a5`                                    |
| Base commit subject       | `Record checkpoint 4 exit evidence`                                           |
| Base commit authored      | `2026-07-17T05:55:17+01:00`                                                   |
| Checkpoint record         | [Orchestration state](../orchestration/STATE.md)                              |
| Requirements source       | [Requirements and test plan](../../planning/03_REQUIREMENTS_AND_TEST_PLAN.md) |
| Data classification       | `synthetic_demo` only                                                         |
| Evidence cut              | Checkpoint 4 exit evidence recorded 17 July 2026                              |

The QA files and recovery assets are packaging layered on top of that immutable application evidence base. They do not change application code. Evidence marked “observed” comes from the Checkpoint 4 record at the exact base. Evidence marked “pending” has not been observed and is not inferred from code or fixtures.

## Evidence index

- [Automated-results ledger](./automated-results.md) — exact commands, counts, evidence classes, expected/actual results, and limitations.
- [Requirements and scenario traceability](./requirements-traceability.md) — every row from the requirements and E2E scenario tables mapped to evidence or a named open waiver.
- [Desktop, responsive, device, browser, and provider matrix](./environment-matrix.md) — explicit separation of Chromium, Playwright WebKit layout, production-built localhost, physical Safari, hosted, and live-provider evidence.
- [Release checklist and waiver/risk register](./release-checklist-and-waivers.md) — go/no-go controls, owners, closure actions, and the bounded no-key demo decision.
- [Demo operator and recovery runbook](./demo-operator-runbook.md) — seed/reset/check, primary and recovery stories, access/readiness failure, no-key fallback, and rollback cues.
- [Three-run rehearsal sheet](./three-run-rehearsal.md) — deliberately unfilled normal/recovery/normal record with time boxes and pass criteria.
- [Evidence and asset manifest](./evidence-asset-manifest.md) — durable files, asset labels, and prospective capture checklist.
- [Static recovery storyboard](../../public/demo-backup/recovery-storyboard.html) and [operator cue card](../../public/demo-backup/operator-cue-card.txt) — clearly labelled synthetic/recorded recovery only.

## Claim boundary

The exact base supports these narrow claims:

- deterministic package, unit, contract, integration, demo-tooling, build, and browser suites passed at the recorded counts;
- a fresh PostgreSQL 16 database accepted the migration and passed 14/14 persistence tests;
- a production-built, protected localhost profile reported `ready` and `postgres`, seeded/checked the three exact synthetic scenarios, and passed the recorded access, cookie, 390 px, axe, console, and page-error checks;
- the complete text/no-key path, quality abstention, red-flag stop, clinician loop, and labelled recorded-synthetic recovery are implemented and automated;
- the in-app Browser plugin did not initialize, so Playwright fallback evidence remains labelled as Playwright.

The base does **not** support a hosted Vercel/Neon claim, physical iPhone/Safari camera or sensor claim, live ElevenLabs or VitalLens claim, current external dependency-advisory claim, clinical-review claim, Aisha walkthrough claim, or three-consecutive-rehearsal claim. Those are open in the [waiver/risk register](./release-checklist-and-waivers.md).

## No-key release position

The local synthetic demonstration can proceed without external provider credentials by setting voice to `disabled`, narrative model to `disabled`, and optical provider to the no-key `finger_ppg` configuration while retaining the explicitly selected recorded-synthetic recovery and poor-quality/no-measurement path. PostgreSQL readiness and the deterministic safety/action gates still must pass. External gates may be waived only for claims that are not made; they must not be relabelled as passed.
