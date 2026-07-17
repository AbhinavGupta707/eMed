# Evidence and asset manifest

## Durable evidence files

| Asset                                                                                       | Classification                | What it proves                                                            | What it does not prove                                  |
| ------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------- |
| [QA index](./README.md)                                                                     | Evidence index                | Base provenance, claim boundary, package navigation                       | A test execution by itself                              |
| [Automated results](./automated-results.md)                                                 | Ledger                        | Recorded commands/counts/classes/limitations                              | Fresh rerun or external platform state                  |
| [Traceability](./requirements-traceability.md)                                              | Traceability                  | Every requirement/scenario row has evidence or a named waiver             | Approval of an open waiver                              |
| [Environment matrix](./environment-matrix.md)                                               | Matrix                        | Chromium/WebKit-layout/local/physical/hosted/provider distinctions        | Pending physical/hosted/live gates                      |
| [Release checklist and waivers](./release-checklist-and-waivers.md)                         | Decision control              | Owners, closure actions, bounded no-key position                          | Closure of unchecked gates                              |
| [Operator runbook](./demo-operator-runbook.md)                                              | Procedure                     | Reproducible reset/check/story/recovery/rollback cues                     | A completed rehearsal                                   |
| [Three-run sheet](./three-run-rehearsal.md)                                                 | Completed local evidence      | Exact candidate, environment, time boxes, three passes, and limitations   | Hosted, physical-device, live-provider, or clinical use |
| [Recorded-valid capture fixture](../../apps/web/public/demo/recorded-valid-capture.v1.json) | Synthetic engineering fixture | Explicit recovery-only, raw-media-free policy and deterministic prototype | Live sensor, physical device, or clinical validation    |
| [Scenario bundle](../../data/demo/scenarios.v1.json)                                        | Synthetic fixture contract    | Three exact seeded Maya scenarios and expected baseline                   | Aisha scenario or a completed run                       |
| [Recovery storyboard](../../public/demo-backup/recovery-storyboard.html)                    | Static recorded recovery      | Honest environment-failure backup narrative                               | Live app, sensor, provider, hosting, or physical iPhone |
| [Operator cue card](../../public/demo-backup/operator-cue-card.txt)                         | Static recorded recovery      | Short safe recovery order and prohibited claims                           | Live execution evidence                                 |
| [Served recovery storyboard](../../apps/web/public/demo-backup/recovery-storyboard.html)    | Byte-identical served mirror  | `/demo-backup/recovery-storyboard.html` is available from the Next.js app | A live-app or external evidence claim                   |
| [Served operator cue card](../../apps/web/public/demo-backup/operator-cue-card.txt)         | Byte-identical served mirror  | `/demo-backup/operator-cue-card.txt` is available from the Next.js app    | A completed rehearsal or external evidence              |

Recovery asset SHA-256 values were calculated after scoped Prettier formatting in this lane.

| Recovery asset                                         | SHA-256                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------ |
| `public/demo-backup/recovery-storyboard.html`          | `9dba968996475e6f6ed79fd3fdb2cd7648194eeb25c9025c1c13610c2a7a120c` |
| `public/demo-backup/operator-cue-card.txt`             | `df23f436bdc744b8a3257f0b5fdf96324f71f85fc0ed68d5583f3c67ffeec093` |
| `apps/web/public/demo-backup/recovery-storyboard.html` | `9dba968996475e6f6ed79fd3fdb2cd7648194eeb25c9025c1c13610c2a7a120c` |
| `apps/web/public/demo-backup/operator-cue-card.txt`    | `df23f436bdc744b8a3257f0b5fdf96324f71f85fc0ed68d5583f3c67ffeec093` |

## Screenshot and capture checklist

No screenshot or recording is included in this package because this lane did not produce a local browser capture and the in-app Browser plugin did not initialize. A blank placeholder is not evidence.

Create captures only from the exact candidate after reset/check. Every filename/overlay must include `synthetic`, and any replay/backup must include `recorded-recovery`. Do not capture access codes, cookies, database URLs, provider keys, developer tools containing headers/bodies, transcripts/free text, or raw camera/voice media.

| Capture ID | Required view                             | Evidence class to record                    | Required label/content                                                                        | Status / owner                            |
| ---------- | ----------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------- |
| CAP-01     | Patient start at desktop Chromium         | Local browser or hosted, named accurately   | Fictional/synthetic/not clinically validated disclosure                                       | Pending — QA operator                     |
| CAP-02     | Structured text confirmation              | Local browser or hosted                     | Persistent labels and patient-confirmed structured answers; no transcript retained            | Pending — QA operator                     |
| CAP-03     | Poor-quality/no-number state              | Local browser or physical, named accurately | Quality reason, retry/abstain, no numeric measurement                                         | Pending — QA operator                     |
| CAP-04     | Recorded replay selection                 | Recorded recovery                           | “Recorded synthetic valid capture — demo recovery only”; explicit selection after failure     | Pending — QA operator                     |
| CAP-05     | Red-flag hard stop                        | Local browser or hosted                     | Deterministic stop before camera; generic non-care guidance                                   | Pending — QA operator + clinical reviewer |
| CAP-06     | Clinician evidence chain                  | Local browser or hosted                     | No numeric measurement where applicable, protocol/rule provenance, raw-media absence          | Pending — QA operator                     |
| CAP-07     | Clinician completion + patient projection | Local browser or hosted                     | One completed task, audit reference, patient status updated                                   | Pending — QA operator                     |
| CAP-08     | Readiness/seed/check                      | Terminal text capture, redacted             | Candidate SHA, `ready`, runtime `postgres`, three exact scenarios; no URL/secret              | Pending — operator                        |
| CAP-09     | 390 px responsive + axe result            | Playwright/local browser, named accurately  | Width, zero serious/critical, zero console/page errors                                        | Pending — QA operator                     |
| CAP-10     | Physical iPhone/Safari matrix             | Physical evidence only                      | Exact device/iOS/Safari/secure origin/permissions/torch/quality; never “validated”            | Pending — `W-02` owner                    |
| CAP-11     | Hosted Vercel/Neon                        | Hosted evidence only                        | HTTPS origin, SHA/deployment, readiness `postgres`, protection; redact IDs as policy requires | Pending — `W-01` owner                    |
| CAP-12     | Live provider                             | Live provider evidence only                 | Provider/version/consent/quality/retention boundary; no raw media                             | Pending — `W-03` owner                    |

## Capture acceptance

For every new artifact, record exact application SHA, package/release SHA, date/time/time zone, operator, OS/browser/device, origin class (local or hosted), provider mode, scenario, expected/actual, result, evidence class, limitation, and waiver IDs. Review the artifact at full size for accidental secrets or real data before adding it. Add its repository-relative path and SHA-256 here; do not overwrite an older artifact without preserving provenance.
