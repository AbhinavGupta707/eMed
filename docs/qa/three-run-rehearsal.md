# Three-run rehearsal sheet

Status: **PASSED on the Checkpoint 6 local candidate.** Three consecutive installed-Chrome runs completed against one fresh PostgreSQL-backed environment in the order normal, recovery, normal. This is local synthetic user-flow evidence, not hosted, physical-iPhone, live-provider, or clinical evidence.

## Candidate and environment record

| Field                                    | Entry required before run 1                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------ |
| Application evidence base                | `8589723e511b65dc849ef36234e7f462966e14a5`                                           |
| Presentation/package commit              | `99acb5b` before this evidence-led documentation update                              |
| Date/time/time zone                      | 17 July 2026, 06:20–06:24 BST                                                        |
| Operator / presenter / observer          | Codex master orchestrator; automated DOM/user-flow assertions recorded in task       |
| Machine OS/browser exact versions        | macOS 26.5.1 build 25F80; installed Google Chrome 150.0.7871.125                     |
| Runtime profile                          | Local development identity, fresh PostgreSQL 16 on loopback; every check `postgres`  |
| Provider profile                         | Voice disabled; narrative disabled; finger PPG selected; camera reported unsupported |
| Physical/provider/hosted waivers invoked | `W-01`, `W-02`, `W-03`, `W-04`, `W-05`, `W-06`, `W-08`, `W-09` remain open           |

Do not record database URLs, access codes, cookies, keys, transcripts, raw media, or real names.

## Time boxes and universal pass criteria

- Reset plus `demo:check`: at most 0:30 before each run.
- Normal story: at most 3:00 from opening the scenario to visible patient completion.
- Recovery story: at most 3:30 from opening the scenario to visible completed clinician review.
- Zero stranded state, duplicate task, false numeric measurement, red-flag bypass, serious/critical axe finding, console/page error, or prohibited claim.
- Every fixture/static fallback is announced and visibly labelled “recorded synthetic recovery — not live.”
- Any run that needs an undocumented intervention is a fail even if the final screen looks correct.

## Run log

| Run | Observed path                                                                                                                                   | Reset/check | Story time | Reset ≤0:30 | Story time pass | Functional pass criteria | Claim/label pass | Result | Deviation/evidence reference                                                                                        | Observer |
| --: | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------- | ----------- | --------------- | ------------------------ | ---------------- | ------ | ------------------------------------------------------------------------------------------------------------------- | -------- |
|   1 | Normal: `maya-happy-text`, no-key text, unsupported camera, no number, one task, clinician complete, patient projection                         | 0:05        | 1:20       | PASS        | PASS ≤3:00      | PASS                     | PASS             | PASS   | Installed-Chrome DOM/user actions; unsupported capture exercised the allowed no-measurement branch                  | Codex    |
|   2 | Recovery: `maya-poor-quality`, moderate/uncertain report, unsupported camera, no number, abstain/review, clinician complete, patient projection | 0:05        | 0:39       | PASS        | PASS ≤3:30      | PASS                     | PASS             | PASS   | Recovery used the real unsupported-device branch rather than injected weak signal; no live/physical claim made      | Codex    |
|   3 | Normal repeat: fresh reset/check, same acceptance as run 1                                                                                      | 0:05        | 0:19       | PASS        | PASS ≤3:00      | PASS                     | PASS             | PASS   | Installed-Chrome DOM/user actions against the same candidate/database; completion returned from persisted task data | Codex    |

## Per-run evidence checklist

- [x] `demo:check` showed all three exact scenarios ready and runtime `postgres` before each run.
- [x] Synthetic/non-clinical disclosure was visible at start and completion.
- [x] Structured red flags were confirmed; the UI kept code-owned authority explicit.
- [x] Unsupported capture created no number in every run.
- [x] No recorded recovery was used or presented as live evidence.
- [x] Exactly one task was returned per run; audit provenance was visible.
- [x] Clinician operations persisted and patient projection updated.
- [x] No visible page failure occurred; the immediately preceding same-candidate Playwright suites separately passed with zero recorded page/console failures.
- [x] No real data, secret, access code, cookie, transcript, or raw media was retained.
- [x] Open waivers remain named and no waived capability was claimed as passed.

## Completion rule

`W-07` is closed for the bounded local synthetic demo by the three consecutive passes above. A future candidate, hosted environment, provider-enabled path, or changed application tree must repeat the sequence; this result does not transfer to those evidence classes.

Release owner decision: **Local synthetic demo rehearsal PASS; external gates remain open**  
Date/time: 17 July 2026, 06:24 BST  
Accepted waivers for this evidence class: no external gate was accepted as passed; the demo remains explicitly local/no-key  
Signature/initials: Codex orchestration record
