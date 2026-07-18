# Device, hosted, and provider closure gates

## Evidence classification

| Target                                       | Current classification                                                                                                                                                  | What may be claimed                                                                 |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Checkpoint 11D local browser                 | Passed local automated Chromium                                                                                                                                         | Local synthetic workflow and emulated layouts only                                  |
| Windows Chrome emulation                     | Passed Playwright Chromium with Windows user agent                                                                                                                      | Windows-shaped user-agent/layout automation; not installed Windows Chrome           |
| iPhone 12 emulation                          | Passed separate Playwright iPhone 12-sized context                                                                                                                      | Phone-sized separate-context flow; not iPhone hardware or Safari                    |
| Installed Chrome                             | Historical Checkpoint 10 owner-session evidence in `docs/orchestration/STATE.md`                                                                                        | Only the recorded Checkpoint 10 candidate; not this unintegrated 11D commit         |
| Vercel/Neon                                  | Historical Checkpoint 10 Preview pass: deployment `dpl_GBzhzSn14Jzdr45q11ZkGX6Z2wxC`, alias `https://homerounds-checkpoint-10.vercel.app`, application commit `be544d3` | Only that protected synthetic Checkpoint 10 Preview and recorded Postgres scenarios |
| Exact Checkpoint 11 candidate on Vercel/Neon | Not run in 11D                                                                                                                                                          | Nothing hosted for this candidate yet                                               |
| Live VitalLens                               | Historical synthetic no-face non-measurement boundary pass; current browser gate unavailable without key/proxy                                                          | No physical capture or accuracy claim                                               |
| Physical iPhone 12 Safari                    | `pending-physical`                                                                                                                                                      | Nothing physical yet                                                                |
| Physical Windows Chrome/Edge                 | `pending-physical`                                                                                                                                                      | Nothing physical yet                                                                |

## Owner plug-in: physical iPhone 12 Safari

1. Integrate 11D, record the exact final commit SHA, deploy that exact SHA to a protected Preview, and confirm readiness reports `postgres`. Do not reuse the Checkpoint 10 alias as Checkpoint 11 evidence.
2. Use a physical iPhone 12, not Simulator. Record iOS and Safari versions, device model, battery/thermal state, network, test time, exact Preview URL, deployment ID, and candidate SHA. Use only the synthetic Maya profile.
3. On the desktop, create the patient session and display the QR code. Scan with the physical iPhone camera. Confirm the origin before continuing and verify the fragment token disappears after exchange.
4. Prove expiry and replay: let one code expire or revoke it, confirm the old link is refused, reissue, connect once, and confirm the consumed link cannot reconnect.
5. Background Safari for at least 15 seconds, return, reload, close/reopen the tab, and toggle Wi-Fi or airplane mode. Verify explicit reconnect copy and preserved confirmed progress.
6. Finger PPG: grant rear-camera permission only for the check, verify torch behavior, cover camera/flash, perform pass/poor-quality/cancel paths, and confirm that failed or uncertain capture shows no number. Verify camera/torch stop on cancel, background, navigation, and completion.
7. Sustained vowel: grant microphone permission only after separate consent; perform permission denial, silence/quality retry, cancel, and one passing local-feature capture if permitted. Confirm no raw audio or transcript is retained.
8. Medication station: use an identifier-free synthetic label only. Exercise photo and full-text paths, correct one field, mark one unknown, confirm explicitly, then verify the image disappears on reload.
9. VitalLens front-camera testing is opt-in only after the server proxy/key are active on the exact Preview. Record explicit consent, deny/cancel/network/provider-failure paths first, then any approved live capture. Never claim accuracy or retain face video.
10. Complete action confirmation, clinician ownership/contact/completion, and patient-visible status. Record screenshots that contain no access code, URL fragment, cookie, provider key, database URL, or real personal data.

## Owner plug-in: physical Windows Chrome and Edge

1. Use a physical Windows machine. Record Windows build plus installed Chrome and Edge versions. Test both browsers separately against the exact protected Checkpoint 11 Preview/SHA.
2. Open DevTools before the flow. Preserve only a redacted console/network summary; do not export an unredacted HAR or copy authorization headers, cookies, QR fragments, access codes, or provider payloads.
3. At 100% and 200% zoom, exercise keyboard-only navigation, visible focus, persistent labels, 320-equivalent narrow responsive layout, 1920 px layout, reduced-motion OS/browser setting, and non-colour error recovery.
4. Pair the physical iPhone 12 from each browser. Repeat QR expiry/reissue, disconnect/reconnect, desktop reload, phone reload, network loss, unavailable sensing, replay refusal, desktop acknowledgement, and cold navigation.
5. Run the full synthetic hero three consecutive times: invitation, confirmed report, selected station, quality-gated result or honest no-result, baseline/memory display, explicit appointment/refill/care-team action, clinician completion, patient-visible status, and audit provenance.
6. For each run, record start/end time, browser, phone, SHA/deployment, result, recovery used, console errors, and whether any number or external-delivery claim appeared. All three must pass without resetting product authority or editing stored state manually.

## Hosted Vercel/Neon closure

For the exact integrated Checkpoint 11 SHA: deploy protected Preview, apply/verify migrations, require readiness `ready` with runtime `postgres`, seed/check the three synthetic scenarios, run separate patient/clinician sessions, verify cold navigation and cross-session persistence, inspect security headers/cookies/protection, execute the companion two-context journey, and reset the scoped synthetic dataset. Record deployment ID, stable alias, SHA, environment revision, database branch/migration, commands, timings, and rollback target without printing secrets.
