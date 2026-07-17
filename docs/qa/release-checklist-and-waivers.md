# Release checklist and open waiver/risk register

## Bounded decision

**GO for a local, synthetic, no-key hackathon demonstration after the operator preflight.** The Checkpoint 6 candidate completed the required normal/recovery/normal installed-Chrome rehearsal against fresh PostgreSQL, so `W-07` is closed for that exact local evidence class. It remains **NO-GO** for hosted, physical-sensor, live-provider, real-patient, clinical, medical-device, or production-service claims.

## Release checklist

Checkpoint 4 evidence applies to the immutable application base; checked Checkpoint 6 operator rows apply to the exact rehearsed local candidate/environment. Unchecked rows still require the named owner decision or external evidence.

- [x] Exact application evidence base recorded: `8589723e511b65dc849ef36234e7f462966e14a5`.
- [x] Checkpoint 4 records repository Prettier; 13/13 lint/typecheck/test/build; web 100/100; root 13 unit, 7 contract, 7 integration, 5 demo tests.
- [x] Checkpoint 4 records six root smoke, three patient, three clinician, both accessibility, and both performance suites passing.
- [x] Fresh PostgreSQL 16 migration and 14/14 live persistence tests recorded.
- [x] Production-built protected localhost readiness/access/cookie/390 px/axe/error inspection recorded.
- [x] Three exact synthetic scenarios and exact-scope reset tooling exist.
- [x] No-key text path, poor-quality no-measurement path, red-flag stop, and clinician loop have automated evidence.
- [x] Security/privacy/incident/deploy/rollback boundaries are documented.
- [x] Candidate worktree/application tree verified against the evidence base and clean before rehearsal.
- [x] Fresh PostgreSQL migration passed 14/14 tests and `/api/readiness` returned `ready`; every scenario check reported `postgres`.
- [x] `demo:reset` followed by `demo:check` passed before each of the three rehearsals.
- [x] Normal/recovery/normal installed-Chrome rehearsal completed within time boxes (`W-07` closed for the local candidate).
- [ ] Current dependency advisory has privacy-approved pass or release-owner acceptance of `W-04`.
- [x] No hosted claim is made; the presentation and rehearsal are explicitly local (`W-01` remains open).
- [x] No physical/Safari/sensor claim is made; unsupported capture is accurately labelled (`W-02` remains open).
- [x] No live voice/VitalLens claim is made; providers remain disabled/unavailable (`W-03` remains open).
- [x] All protocol, action, SLA, and safety language remains fictional/demo-only (`W-05` remains open for any real claim).
- [x] Claims remain limited to automated axe/keyboard/layout evidence; no manual assistive-technology/Safari claim is made (`W-06` open).
- [x] Aisha is absent from the submission and primary/recovery presentation; `W-08` remains a future implementation gap.
- [ ] Presenter and backup operator can state every prohibited claim without notes.
- [ ] Rollback target, local recovery process, database owner, and communication owner are named.

## Open waiver and risk register

| ID   | Gate / risk                                                | Current evidence                                                                                                 | Status and release effect                                                                                                                                                 | Owner                                       | Closure action                                                                                                                                                                                                                                                                 |
| ---- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| W-01 | Hosted Vercel/Neon                                         | Deploy-ready configuration and procedures; no deployment observed                                                | OPEN. Waivable only by making no hosted/persistence-platform claim and using labelled local PostgreSQL. Blocks hosted URL and hosted reliability claims.                  | Repository owner + deployment operator      | Deploy exact candidate with protection; record URL/deployment ID/SHA/environment revision; migrate Neon; require readiness/seed/check `postgres`; verify separate patient/clinician sessions, cold start, headers, cookie, protection, retention, rollback, and timed restore. |
| W-02 | Physical iPhone/Safari/camera/optical                      | Playwright iPhone 12 WebKit layout and injected provider tests only                                              | OPEN. Waivable for a recorded-synthetic/no-live-sensor demo. Blocks physical Safari, camera, torch, optical feasibility, and accuracy claims.                             | Device test owner                           | Record exact device/iOS/Safari/secure origin; run permission, deny/re-grant, camera/torch, lighting/motion, background/lock/rotation, thermal/battery/network, cleanup, three captures, quality, network/storage, and independent reference if used.                           |
| W-03 | Live ElevenLabs/VitalLens and provider account controls    | Contract/fixture/no-key evidence only                                                                            | OPEN. Waivable by keeping providers disabled/unavailable. Blocks live voice, live VitalLens, latency, retention/residency, quota, and provider reliability claims.        | Provider/account owner + privacy reviewer   | Approve account/key scope and data boundary; configure consent/retention/residency/history; run live calls; record version, quality, timeout/outage, payload/network/storage, quota, and deletion/retention evidence.                                                          |
| W-04 | Current external dependency advisory                       | Manual privacy-approved workflow exists; latest successful external result is historical Checkpoint 2            | OPEN. Release owner must accept this explicit supply-chain risk or authorize and pass the current workflow.                                                               | Repository administrator/security owner     | Configure required reviewer on `dependency-advisory-approved`, approve graph disclosure, run candidate `pnpm audit --audit-level high`, record workflow URL/SHA/result, triage findings.                                                                                       |
| W-05 | Qualified clinical wording/protocol/action review          | Deterministic fictional rules and neutral copy; no qualified sign-off                                            | OPEN. Waivable only for clearly fictional, non-clinical hackathon narration. Blocks clinical correctness, care SLA, triage, diagnostic, treatment, or safety-case claims. | Qualified clinical reviewer + product owner | Review red flags, thresholds, protocol version, patient copy, action reason/owner/service window, worsening/emergency wording, intended purpose, and signed claim/limitation list.                                                                                             |
| W-06 | Manual Safari/assistive technology/usability               | Automated Chromium axe/keyboard/touch/responsive plus WebKit layout                                              | OPEN. Automated accessibility claims may be made narrowly; blocks manual screen-reader/Safari/forced-colour/200%-zoom sign-off.                                           | Accessibility QA owner                      | Record Safari/macOS and physical iPhone checks, VoiceOver primary paths, 200% zoom, reduced motion, forced colours/high contrast, focus/order, live-region behavior, and issue disposition.                                                                                    |
| W-07 | Three consecutive timed rehearsals                         | Installed Chrome 150 normal/recovery/normal passed in 1:20, 0:39, and 0:19; each reset/check reported `postgres` | CLOSED for candidate `99acb5b` and the bounded local/no-key evidence class. Repeat after application/environment/provider changes.                                        | Demo operator + observer                    | Preserve the completed [normal/recovery/normal sheet](./three-run-rehearsal.md); repeat it for any newer candidate or different evidence class.                                                                                                                                |
| W-08 | Aisha multimodal resilience scenario absent                | Mentioned in planning; no Aisha fixture/browser journey                                                          | OPEN. Remove Aisha from demo/submission claims or implement/test in a future application lane. This QA lane cannot close it.                                              | Product owner + future application owner    | Add an approved synthetic Aisha scenario, provenance, text-corrected voice flow, manual BP evidence contract, poor-quality/clinician loop, tests, and claim review.                                                                                                            |
| W-09 | Reliability soak and browser/manual network-loss rehearsal | Deterministic concurrency/network tests and individual browser paths                                             | OPEN. Does not block a bounded presentation after `W-07`, but blocks soak/reliability/concurrency-at-duration claims.                                                     | QA/reliability owner                        | Run the planned 30-minute reset/run soak, capture error/DB connection/memory/media cleanup/reconnect counts, and rehearse browser network loss.                                                                                                                                |

## No-key gate proof

The no-key demonstration does not depend on `W-01`, `W-02`, or `W-03` closing because:

1. the complete report path uses accessible structured text with `VOICE_PROVIDER=disabled`;
2. deterministic red flags, protocol decisions, actions, audit, and clinician completion are application-owned;
3. a failed/unsupported capture creates no measurement and can proceed to review;
4. the recorded-valid fixture is explicit, synthetic, raw-media-free, recovery-only, and unavailable before a failed capture;
5. the poor-quality scenario demonstrates abstention without any number;
6. local PostgreSQL is the documented recovery persistence profile, and `demo:check` must report `postgres`;
7. the static backup assets state that they are recorded synthetic recovery and make no hosted/provider/device claim.

`W-04` and `W-05` remain disclosure/claim risks even for local use. `W-07` is closed only for the recorded local/no-key candidate; it does not close hosted, provider, physical-device, clinical, or production gates.
