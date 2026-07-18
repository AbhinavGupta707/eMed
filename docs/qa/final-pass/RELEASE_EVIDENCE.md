# Checkpoint 11 final-pass release evidence

## Scope and claim boundary

This 11D evidence was produced from clean base `d8dd86d4d93c8e0103ce29684ab13890b3366628` on 18 July 2026. The worker ran `gpt-5.6-sol`, extra-high reasoning, and the repository-pinned Fast service tier. All data was synthetic.

The current evidence is local automated evidence. The desktop project named `emulated-windows-chrome` is Playwright Chromium with a Windows user agent; it is not an installed Windows browser. The separate `iPhone 12` context is an emulated iPhone-sized browser context; it is not physical Safari. No result below is a clinical-accuracy, physical-device, real-patient, or real-service claim.

## Exact automated results

| Command                                                                                           | Exact result                                                                               | Evidence class                                                                                  |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                  | Pass in 6.2 s; frozen lockfile unchanged; `unrs-resolver` build script warning only        | Local setup                                                                                     |
| `pnpm exec vitest run tests/contract/final-pass tests/integration/final-pass`                     | Final rerun: 4 files passed; 14 tests passed; 1 visible skip; 2.35 s                       | Local contract/integration                                                                      |
| `pnpm exec playwright test --config tests/e2e/final-pass/playwright.config.ts`                    | 5/5 passed; 57.4 s                                                                         | Local production-build Chromium; Windows user-agent emulation plus separate iPhone 12 emulation |
| `pnpm exec playwright test --config tests/e2e/final-pass/live-provider-gate.playwright.config.ts` | 1 visible skip: opt-in, hosted base URL, and server-only provider key unavailable together | Local live-provider gate                                                                        |
| `pnpm exec playwright test --config tests/e2e/final-pass/voice-station.playwright.config.ts`      | 1/1 passed; 26.9 s                                                                         | Local Chromium with synthetic microphone and schema-validated voice route fixture               |
| `pnpm exec playwright test --config tests/e2e/final-pass/sensing-production.playwright.config.ts` | 1/1 passed; 40.6 s                                                                         | Local production-build Chromium plus separate iPhone 12-emulated context                        |
| `pnpm exec playwright test --config tests/accessibility/final-pass/playwright.config.ts`          | 1/1 passed; 27.3 s                                                                         | Local Chromium accessibility                                                                    |
| `pnpm exec playwright test --config tests/performance/final-pass/playwright.config.ts`            | Final rerun 1/1 passed; 19.6 s; test 11.7 s                                                | Local warmed development server                                                                 |
| `pnpm exec playwright test --config tests/e2e/companion/playwright.config.ts`                     | 1/1 passed; 49.9 s                                                                         | Existing production-build companion regression                                                  |
| `pnpm exec playwright test --config tests/e2e/clinician/playwright.config.ts`                     | 3/3 passed; reporter total `1.0m`                                                          | Existing clinician closed-loop regression                                                       |
| `pnpm exec playwright test --config tests/e2e/ai/playwright.config.ts`                            | Deterministic profile: 1 passed, 6 profile skips; 26.3 s                                   | Local fake inference                                                                            |
| `pnpm exec playwright test --config tests/e2e/ai/medication.playwright.config.ts`                 | Medication profile: 3 passed, 4 profile skips; 30.7 s                                      | Local fake inference and identifier-free generated label fixture                                |
| `pnpm exec playwright test --config tests/e2e/ai/abstain.playwright.config.ts`                    | Abstain profile: 1 passed, 6 profile skips; 14.6 s                                         | Local fake inference                                                                            |
| `pnpm exec playwright test --config tests/e2e/ai/failure.playwright.config.ts`                    | Failure profile: 1 passed, 6 profile skips; 10.8 s                                         | Local fake inference                                                                            |
| `pnpm exec playwright test --config tests/e2e/ai/slow.playwright.config.ts`                       | Slow/stale profile: 1 passed, 6 profile skips; 11.8 s                                      | Local fake inference                                                                            |

Profile skips are intentional: each AI configuration runs only the tests for that selected fake profile.

## Adversarial and authority coverage

The owned contract tests cover:

- atomic proactive-trigger duplicate suppression and stale fact refusal;
- explicit memory consent, stale writes, correction, deletion, replay, and withdrawal;
- prompt-shaped history exclusion and no workflow/action authority for memory;
- the exact appointment/refill/care-team action allowlist, role checks, tamper refusal, incomplete confirmation, stale round refusal, and red-flag/unknown hard stops;
- concurrent action submission suppression, one-winner optimistic concurrency, provenance-preserving clinician ownership/contact/completion, and stale mutation refusal;
- AI select/abstain/failure envelopes while deterministic protocol, safety, quality, and action authority remain controlling.

The owned integration story exercises persisted invitation through adaptive routing, a quality-passing synthetic assessment, baseline and structured memory, programme task, explicitly confirmed synthetic appointment request, internal failure/retry, clinician approval/contact/completion, patient-visible completion, audit history, and cold reads. It asserts that the prompt-injection canary, attestation, raw provider payloads, external-delivery claims, and accuracy claims do not persist.

## Browser, accessibility, and reliability coverage

The final browser suites verify proactive invitation, complete text fallback, red-flag hard stop, memory lifecycle, QR expiry/reissue/replay, separate desktop and iPhone-sized contexts, offline reconnect, unavailable sensing with no number, finger-candidate replay/cold resume, sustained-vowel permission denial/decline, and ordinary patient UI without `demo`, `cache`, or `deterministic` engineering labels. The discreet `Synthetic sample profile · Not medical care` boundary remains visible.

Accessibility covers keyboard activation, persistent accessible labels, visible focus, 44 px interactive targets, reduced-motion emulation, 200% zoom, 320/375/390/414/768/1024/1280/1440/1920 px widths, non-colour recovery copy, and zero serious/critical axe findings on the exercised states.

The final performance gate retains the existing warm navigation/load/ready/CLS budgets and sends six simultaneous identical trigger requests. One response creates the round and five replay the same round ID inside the API rate boundary. Final measurements were DOM content loaded `75.10 ms`, load `1060.40 ms`, ready `1376.93 ms`, CLS `0.0308945`, and six-request API batch `79.69 ms`. Twelve simultaneous HTTP requests intentionally encountered five `429` responses; this was classified as the configured rate limit, not used as a passing concurrency result. The 12-way action concurrency and stale-write result is separately green in the contract suite.

## Privacy and secret handling

The static scan checks tracked artifacts and the production browser bundle for any exact configured secret without printing the value. If this isolated worktree has no ignored secret files, that exact-value test skips visibly rather than inventing evidence. Schema/source scans reject persisted raw frame, raw audio, transcript, prompt, hidden-reasoning, and provider-payload fields. Browser traffic assertions reject raw media/audio/transcript/prompt/provider-key payloads, and failed/unavailable sensing creates no number.

No raw camera frame, face video, voice audio, or unconfirmed transcript was written by this lane. No provider key or database URL was printed, copied, or committed.

## Incomplete and non-passing probes

- The first one-minute soak design held one sensing round open. The round correctly timed out into a no-measurement action state, and the test then timed out at 4 minutes waiting for a now-inapplicable acknowledgement button. This is a failed shakedown, not release evidence.
- A revised repeated-fresh-round one-minute shakedown was started, then terminated at the user's immediate physical-device-testing directive. It is incomplete and not evidence.
- The 30-minute soak was not started after that directive. Status: `not-run-time-redirected`.
- The existing patient suite reported 3 passed and 1 failed because a development-server cold reload remained on `Loading your saved round` beyond its explicit 10-second assertion. The current production-build final browser suite passed its cold-resume checks.
- The existing voice and sensing suites contain retired copy assertions. Current owned replacements passed; the out-of-scope files were not edited.
- VitalLens is registered, but the activation guard refuses selection without both the server proxy and server-only key. No key was available to this isolated lane, so no browser VitalLens run or physical capture is claimed. Historical Checkpoint 10 synthetic no-face boundary evidence remains separate.

## Release decision

Software-owned final-pass gates exercised here are green after the final scoped rerun. Physical iPhone 12 Safari, installed Windows Chrome/Edge, exact Checkpoint 11 Vercel/Neon deployment, live-provider execution, and the 30-minute soak remain external or time-redirected closure items. Do not label the candidate fully released until the owner records those gates or explicitly accepts their limitations.
