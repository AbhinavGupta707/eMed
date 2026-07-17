# Release checklist and open waiver/risk register

## Bounded decision

**GO only for a local, synthetic, no-key hackathon demonstration after the operator preflight and a successful normal/recovery/normal rehearsal.** The current evidence package is not yet rehearsal-complete because `W-07` is open. It is **NO-GO** for hosted, physical-sensor, live-provider, real-patient, clinical, medical-device, or production-service claims.

## Release checklist

Evidence checked below was observed on the exact application base. Operator checks remain unchecked until repeated for the presentation candidate/environment.

- [x] Exact application evidence base recorded: `8589723e511b65dc849ef36234e7f462966e14a5`.
- [x] Checkpoint 4 records repository Prettier; 13/13 lint/typecheck/test/build; web 100/100; root 13 unit, 7 contract, 7 integration, 5 demo tests.
- [x] Checkpoint 4 records six root smoke, three patient, three clinician, both accessibility, and both performance suites passing.
- [x] Fresh PostgreSQL 16 migration and 14/14 live persistence tests recorded.
- [x] Production-built protected localhost readiness/access/cookie/390 px/axe/error inspection recorded.
- [x] Three exact synthetic scenarios and exact-scope reset tooling exist.
- [x] No-key text path, poor-quality no-measurement path, red-flag stop, and clinician loop have automated evidence.
- [x] Security/privacy/incident/deploy/rollback boundaries are documented.
- [ ] Candidate worktree/application tree verified against the evidence base and clean before rehearsal.
- [ ] PostgreSQL migration state verified and `/api/readiness` returns `ready` with runtime `postgres`.
- [ ] `demo:reset` followed by `demo:check` passes immediately before each rehearsal/presentation.
- [ ] Normal/recovery/normal rehearsal sheet completed within time boxes (`W-07`).
- [ ] Current dependency advisory has privacy-approved pass or release-owner acceptance of `W-04`.
- [ ] Any hosted claim closes `W-01`; otherwise presentation is explicitly local.
- [ ] Any physical/Safari/sensor claim closes `W-02`; otherwise recovery is explicitly recorded synthetic.
- [ ] Any live voice/VitalLens claim closes `W-03`; otherwise providers remain disabled/unavailable.
- [ ] Any clinical wording/SLA/safety claim closes `W-05`; otherwise all language remains fictional/demo-only.
- [ ] Manual assistive-technology/Safari review closes `W-06` or claims stay limited to automated axe/keyboard/layout.
- [ ] Aisha is removed from the presentation or `W-08` is closed with real scenario/browser evidence.
- [ ] Presenter and backup operator can state every prohibited claim without notes.
- [ ] Rollback target, local recovery process, database owner, and communication owner are named.

## Open waiver and risk register

| ID   | Gate / risk                                                | Current evidence                                                                                      | Status and release effect                                                                                                                                                 | Owner                                       | Closure action                                                                                                                                                                                                                                                                 |
| ---- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| W-01 | Hosted Vercel/Neon                                         | Deploy-ready configuration and procedures; no deployment observed                                     | OPEN. Waivable only by making no hosted/persistence-platform claim and using labelled local PostgreSQL. Blocks hosted URL and hosted reliability claims.                  | Repository owner + deployment operator      | Deploy exact candidate with protection; record URL/deployment ID/SHA/environment revision; migrate Neon; require readiness/seed/check `postgres`; verify separate patient/clinician sessions, cold start, headers, cookie, protection, retention, rollback, and timed restore. |
| W-02 | Physical iPhone/Safari/camera/optical                      | Playwright iPhone 12 WebKit layout and injected provider tests only                                   | OPEN. Waivable for a recorded-synthetic/no-live-sensor demo. Blocks physical Safari, camera, torch, optical feasibility, and accuracy claims.                             | Device test owner                           | Record exact device/iOS/Safari/secure origin; run permission, deny/re-grant, camera/torch, lighting/motion, background/lock/rotation, thermal/battery/network, cleanup, three captures, quality, network/storage, and independent reference if used.                           |
| W-03 | Live ElevenLabs/VitalLens and provider account controls    | Contract/fixture/no-key evidence only                                                                 | OPEN. Waivable by keeping providers disabled/unavailable. Blocks live voice, live VitalLens, latency, retention/residency, quota, and provider reliability claims.        | Provider/account owner + privacy reviewer   | Approve account/key scope and data boundary; configure consent/retention/residency/history; run live calls; record version, quality, timeout/outage, payload/network/storage, quota, and deletion/retention evidence.                                                          |
| W-04 | Current external dependency advisory                       | Manual privacy-approved workflow exists; latest successful external result is historical Checkpoint 2 | OPEN. Release owner must accept this explicit supply-chain risk or authorize and pass the current workflow.                                                               | Repository administrator/security owner     | Configure required reviewer on `dependency-advisory-approved`, approve graph disclosure, run candidate `pnpm audit --audit-level high`, record workflow URL/SHA/result, triage findings.                                                                                       |
| W-05 | Qualified clinical wording/protocol/action review          | Deterministic fictional rules and neutral copy; no qualified sign-off                                 | OPEN. Waivable only for clearly fictional, non-clinical hackathon narration. Blocks clinical correctness, care SLA, triage, diagnostic, treatment, or safety-case claims. | Qualified clinical reviewer + product owner | Review red flags, thresholds, protocol version, patient copy, action reason/owner/service window, worsening/emergency wording, intended purpose, and signed claim/limitation list.                                                                                             |
| W-06 | Manual Safari/assistive technology/usability               | Automated Chromium axe/keyboard/touch/responsive plus WebKit layout                                   | OPEN. Automated accessibility claims may be made narrowly; blocks manual screen-reader/Safari/forced-colour/200%-zoom sign-off.                                           | Accessibility QA owner                      | Record Safari/macOS and physical iPhone checks, VoiceOver primary paths, 200% zoom, reduced motion, forced colours/high contrast, focus/order, live-region behavior, and issue disposition.                                                                                    |
| W-07 | Three consecutive timed rehearsals                         | Individual automation and reset/check evidence; rehearsal sheet blank                                 | OPEN and demo-release blocking.                                                                                                                                           | Demo operator + observer                    | Complete [normal/recovery/normal sheet](./three-run-rehearsal.md), including reset checks, timings, pass criteria, deviations, and signatures/initials.                                                                                                                        |
| W-08 | Aisha multimodal resilience scenario absent                | Mentioned in planning; no Aisha fixture/browser journey                                               | OPEN. Remove Aisha from demo/submission claims or implement/test in a future application lane. This QA lane cannot close it.                                              | Product owner + future application owner    | Add an approved synthetic Aisha scenario, provenance, text-corrected voice flow, manual BP evidence contract, poor-quality/clinician loop, tests, and claim review.                                                                                                            |
| W-09 | Reliability soak and browser/manual network-loss rehearsal | Deterministic concurrency/network tests and individual browser paths                                  | OPEN. Does not block a bounded presentation after `W-07`, but blocks soak/reliability/concurrency-at-duration claims.                                                     | QA/reliability owner                        | Run the planned 30-minute reset/run soak, capture error/DB connection/memory/media cleanup/reconnect counts, and rehearse browser network loss.                                                                                                                                |

## No-key gate proof

The no-key demonstration does not depend on `W-01`, `W-02`, or `W-03` closing because:

1. the complete report path uses accessible structured text with `VOICE_PROVIDER=disabled`;
2. deterministic red flags, protocol decisions, actions, audit, and clinician completion are application-owned;
3. a failed/unsupported capture creates no measurement and can proceed to review;
4. the recorded-valid fixture is explicit, synthetic, raw-media-free, recovery-only, and unavailable before a failed capture;
5. the poor-quality scenario demonstrates abstention without any number;
6. local PostgreSQL is the documented recovery persistence profile, and `demo:check` must report `postgres`;
7. the static backup assets state that they are recorded synthetic recovery and make no hosted/provider/device claim.

`W-04` and `W-05` remain disclosure/claim risks even for local use. `W-07` must close before presenting the release package as rehearsed.
