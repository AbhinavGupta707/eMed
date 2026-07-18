# Final-pass rehearsal record

## Timed automated rehearsals

These are local automated modular rehearsals, not three consecutive Windows-laptop plus physical-iPhone hero runs.

| Rehearsal  |      Observed reporter time | Result                          | Story segment                                                                                                                                        |
| ---------- | --------------------------: | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hero A     |                      57.4 s | 5/5 pass                        | Proactive entry, keyless text, red-flag stop, phone reconnect/replay/no-number, memory control                                                       |
| Hero B     |                      30.7 s | 3 medication-profile tests pass | Adaptive fake selection, synthetic label review/edit/confirmation, editable voice proposal, explicit skip                                            |
| Hero C     | `1.0m` (reporter precision) | 3/3 pass                        | Clinician ownership, note, acknowledge/contact/complete, stale write recovery, patient-visible completion                                            |
| Resilience |                      49.9 s | 1/1 pass                        | Production-build QR revoke/reissue, expired link, reload/new-page resume, offline recovery, unavailable result, acknowledgement and replay rejection |

These segments demonstrate the complete synthetic story when read together. They do not meet the planned physical-device requirement for three consecutive Windows plus iPhone runs. That requirement remains `pending-physical`.

## Rehearsal operator notes

- Use the text path as the primary fallback. Voice output is only a proposal and must remain editable until every structured field and final confirmation are complete.
- If camera, microphone, provider, or network state is denied/unavailable/cancelled, show the recovery copy and continue without a number. Never substitute a labelled sample without the explicit sample-reading action.
- On a red flag, stop before sensing and say that no emergency service is connected.
- For QR recovery, reissue rather than reusing an expired link. After a phone result, acknowledge it on the desktop before continuing.
- For a provider failure or abstention, point out that the deterministic usual route remains available.
- For the clinician ending, use only the synthetic queue and show the audit reference plus patient-visible `Completed in HomeRounds` state. Do not claim external delivery.
