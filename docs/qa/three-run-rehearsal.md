# Three-run rehearsal sheet

Status: **NOT RUN on the evidence base.** This sheet is intentionally blank. It must not be cited as evidence until all three rows are completed from one candidate/environment in the order normal, recovery, normal.

## Candidate and environment record

| Field                                    | Entry required before run 1                                              |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| Application evidence base                | `8589723e511b65dc849ef36234e7f462966e14a5`                               |
| Presentation/package commit              | _pending_                                                                |
| Date/time/time zone                      | _pending_                                                                |
| Operator / presenter / observer          | _pending_                                                                |
| Machine OS/browser exact versions        | _pending_                                                                |
| Runtime profile                          | Must be `postgres`; record local or hosted accurately                    |
| Provider profile                         | Expected no-key: voice disabled, narrative disabled, finger PPG selected |
| Physical/provider/hosted waivers invoked | _pending_                                                                |

Do not record database URLs, access codes, cookies, keys, transcripts, raw media, or real names.

## Time boxes and universal pass criteria

- Reset plus `demo:check`: at most 0:30 before each run.
- Normal story: at most 3:00 from opening the scenario to visible patient completion.
- Recovery story: at most 3:30 from opening the scenario to visible completed clinician review.
- Zero stranded state, duplicate task, false numeric measurement, red-flag bypass, serious/critical axe finding, console/page error, or prohibited claim.
- Every fixture/static fallback is announced and visibly labelled “recorded synthetic recovery — not live.”
- Any run that needs an undocumented intervention is a fail even if the final screen looks correct.

## Run log

| Run | Required path                                                                                                                      | Reset/check start–end | Story start–end | Reset ≤0:30 | Story time pass  | Functional pass criteria | Claim/label pass | Result  | Deviation/evidence reference | Observer initials |
| --: | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------- | --------------- | ----------- | ---------------- | ------------------------ | ---------------- | ------- | ---------------------------- | ----------------- |
|   1 | Normal: `maya-happy-text`, no-key, explicit recorded recovery only after failure, one task, clinician complete, patient projection | _pending_             | _pending_       | _pending_   | ≤3:00: _pending_ | _pending_                | _pending_        | NOT RUN | _pending_                    | _pending_         |
|   2 | Recovery: `maya-poor-quality`, one retry, no number, abstain/review, one clinician task, completion projected                      | _pending_             | _pending_       | _pending_   | ≤3:30: _pending_ | _pending_                | _pending_        | NOT RUN | _pending_                    | _pending_         |
|   3 | Normal repeat: same acceptance as run 1 after a fresh reset/check                                                                  | _pending_             | _pending_       | _pending_   | ≤3:00: _pending_ | _pending_                | _pending_        | NOT RUN | _pending_                    | _pending_         |

## Per-run evidence checklist

- [ ] `demo:check` showed all three exact scenarios ready and runtime `postgres`.
- [ ] Synthetic/non-clinical disclosure visible at start and completion.
- [ ] Structured red flags confirmed; code-owned authority stated accurately.
- [ ] Failed/unsupported/uncertain capture created no number.
- [ ] Recorded recovery unavailable before failure and explicitly selected afterward, if used.
- [ ] Exactly one task; duplicate suppression/audit provenance visible.
- [ ] Clinician operation persisted and patient projection updated.
- [ ] Zero console/page errors observed through the chosen inspection method.
- [ ] No real data, secret, URL, cookie, transcript, or raw media retained.
- [ ] Any waiver invoked by ID and no waived capability claimed as passed.

## Completion rule

`W-07` closes only when all three runs pass consecutively. A failed run resets the sequence; diagnose, record the failure, reset/check, and begin again at run 1. The release owner signs below only after reviewing timings, deviations, and claim language.

Release owner decision: _pending_  
Date/time: _pending_  
Accepted waivers: _pending_  
Signature/initials: _pending_
