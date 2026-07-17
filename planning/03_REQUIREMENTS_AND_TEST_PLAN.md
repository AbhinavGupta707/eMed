# HomeRounds requirements, traceability, and validation plan

Status: execution-ready  
Scope: hackathon vertical slice plus release-quality validation evidence

## 1. Acceptance principle

HomeRounds succeeds only if one persisted round can be followed from a real trigger to a safe patient interaction, a quality-gated measurement, a deterministic protocol result, an idempotent clinician task, and a visible patient confirmation. A polished conversation without that chain is not the product.

The test strategy separates four kinds of evidence:

1. deterministic software correctness;
2. browser/device feasibility;
3. demo reliability;
4. clinical validity, which the hackathon does **not** establish.

## 2. Requirements traceability

Priority meanings: P0 is required for the judged demo; P1 is valuable only after all P0 gates are green; Deferred belongs to the production roadmap.

| ID     | Requirement                                                                                                                                 | Priority | Owner/checkpoint           | Verification                                               |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------- | -------: | -------------------------- | ---------------------------------------------------------- |
| HR-P01 | A fictional chronic-care patient can start/resume an asynchronous round from a real trigger                                                 |       P0 | Domain/API, CP1–3          | state-machine unit test; resume E2E                        |
| HR-P02 | Patient can answer by ElevenLabs voice or accessible text with equivalent user-confirmed structured output                                  |       P0 | Voice/patient, CP2–3       | provider contract; transcript edit/confirm; voice/text E2E |
| HR-P03 | The round requests only the next assessment needed, with at most one follow-up                                                              |       P0 | Planner, CP1               | exhaustive planner decision table                          |
| HR-P04 | Patient sees what happens next in plain, non-diagnostic language                                                                            |       P0 | Actions/patient, CP2–3     | copy assertions; accessibility/manual review               |
| HR-P05 | Patient can recover from permission, quality, network, or model failure without a stranded round                                            |       P0 | Assessment/workflow, CP1–3 | failure-path E2E; refresh/resume                           |
| HR-C01 | Clinician sees a prioritized task with owner, reason, SLA, and synthetic patient context                                                    |       P0 | Actions/clinician, CP2–3   | integration and cockpit E2E                                |
| HR-C02 | Clinician can inspect the evidence chain and rule/protocol version                                                                          |       P0 | Audit/clinician, CP2–3     | event-chain contract; cockpit E2E                          |
| HR-C03 | Clinician can acknowledge/edit/complete the task, with all changes audited                                                                  |       P0 | Actions/clinician, CP2–3   | action/audit integration tests                             |
| HR-C04 | Duplicate/retry requests never create duplicate clinical work                                                                               |       P0 | Actions/persistence, CP1–2 | concurrency/idempotency tests                              |
| HR-A01 | Synthetic FHIR is normalized through a narrow adapter, not coupled to UI                                                                    |       P0 | Clinical records, CP1      | adapter contract tests                                     |
| HR-A02 | The system uses an explicit persisted round state machine                                                                                   |       P0 | Domain, CP1                | valid/invalid transition tests                             |
| HR-A03 | Protocol execution is deterministic, closed, versioned, and source-aware                                                                    |       P0 | Protocol, CP1              | schema + golden decision tests                             |
| HR-A04 | Voice/model output reaches workflow logic only through a schema-validated, patient-confirmed report                                         |       P0 | Voice/API, CP2             | adversarial provider-contract tests                        |
| HR-A05 | Missing credentials or a voice/model outage cannot corrupt or block round state                                                             |       P0 | Voice/workflow, CP2–3      | no-key fault injection and resume E2E                      |
| HR-M01 | Both optical adapters normalize to one contract; the release-selected provider emits pulse only after a passing quality gate                |       P0 | Assessment, CP0–1          | both provider fixture suites; physical-iPhone release gate |
| HR-M02 | A failed/uncertain capture creates no measurement fact                                                                                      |       P0 | Assessment/protocol, CP1–3 | unit, integration, network/storage inspection              |
| HR-M03 | Raw frames are never persisted; local finger PPG sends none, while selected VitalLens sends only its documented downsampled proxied payload |       P0 | Assessment/security, CP1–5 | API surface test; network/storage inspection               |
| HR-M04 | Camera, secure context, permissions and provider-specific optional capabilities are checked explicitly                                      |       P0 | Assessment/patient, CP0–3  | browser capability tests; device matrix                    |
| HR-S01 | Red flags and urgency are determined by code/protocol, never the model                                                                      |       P0 | Protocol, CP1              | decision tests; prompt/tool adversarial tests              |
| HR-S02 | The model cannot diagnose, change medicine, or select an unallowed action                                                                   |       P0 | Agent/actions, CP2         | forbidden-output and allowlist tests                       |
| HR-S03 | Missing, conflicting, stale, or low-quality information causes abstention or review                                                         |       P0 | Records/protocol, CP1      | fixture matrix and E2E                                     |
| HR-S04 | Every state change and action attempt is auditable with actor/source/correlation                                                            |       P0 | Persistence/audit, CP1–2   | event completeness integration test                        |
| HR-S05 | Demo/fixture mode cannot be silently enabled as production                                                                                  |       P0 | Configuration/ops, CP0–4   | startup config tests; deployment review                    |
| HR-U01 | Patient surface is calm, readable, responsive, keyboard/screen-reader usable                                                                |       P0 | UI/patient, CP2–5          | axe, keyboard, viewport, manual review                     |
| HR-U02 | Clinician surface is compact but exposes evidence without dashboard theatre                                                                 |       P0 | UI/clinician, CP2–5        | responsive/manual task-completion test                     |
| HR-U03 | Status is never communicated by colour alone; motion is reducible                                                                           |       P0 | UI, CP2                    | component/a11y tests                                       |
| HR-O01 | Three consecutive reset-to-completion demos succeed in the time limit                                                                       |       P0 | Integration, CP5–6         | timed rehearsal log                                        |
| HR-O02 | Hosted HTTPS primary and local recovery builds are documented                                                                               |       P0 | Ops/integration, CP4–5     | clean-environment runbook test                             |
| HR-O03 | Keys, retention, tracing, logs, and synthetic-data boundaries are documented                                                                |       P0 | Security/ops, CP4          | threat-model/config review                                 |
| HR-F01 | Live eMed/EHR integration                                                                                                                   | Deferred | Production gates           | sandbox conformance/security review                        |
| HR-F02 | Real clinician/patient identity, consent, access control, and tenancy                                                                       | Deferred | Production gates           | security/privacy validation                                |
| HR-F03 | Clinically validated selected optical measurement across devices/populations                                                                | Deferred | Production gates           | prospective study                                          |
| HR-F04 | Additional assessments, condition packs, OnePlan, caregiver experience                                                                      | Deferred | Production gates           | separate evidence gates                                    |

## 3. Deterministic unit tests

### State machine

- every permitted transition from `CREATED` through `CLOSED`;
- invalid transitions fail without appending a success event;
- cancel, retry, model timeout, quality retry, and clinician completion paths;
- refresh/resume reconstructs state from persisted records, not local UI assumptions;
- concurrent writes use optimistic versioning or a transaction and cannot skip states.

### Trigger and planner

- due programme check-in creates one round;
- duplicate trigger is idempotent;
- red-flag report bypasses measurement and creates the predefined escalation action;
- valid recent measurement can skip live capture if the protocol permits;
- missing pulse requests PPG;
- valid normal pulse plus qualifying report asks exactly one structured follow-up;
- materially abnormal fictional threshold produces the deterministic review outcome;
- no second follow-up is possible;
- incomplete/contradictory facts lead to abstention or review, never inference.

### Protocol engine

- schema rejects unknown operators, arbitrary expressions, invalid units, missing versions, and unreferenced actions;
- exact boundary values, unit normalization, missing values, stale observations, and quality flags;
- rule ordering and precedence are deterministic;
- every decision returns matched rule, protocol version, input fact IDs, explanation key, and evidence metadata;
- model prose is never accepted as a protocol input without a typed fact source;
- mutation tests or equivalent negative fixtures demonstrate that critical thresholds are actually asserted.

### Actions and audit

- same idempotency key under sequential retry, concurrent retry, and process retry creates one task;
- failed attempt is auditable and safely retryable;
- task owner, priority, reason, SLA, source rule, and round ID are required;
- patient copy is selected from an allowlisted template;
- model text cannot invoke an executor directly;
- clinician edit/complete writes before/after and actor events.

## 4. Signal and measurement tests

The optical signal package is tested as engineering feasibility, not as a medical-device accuracy claim.

### Local finger-PPG signal matrix

Generate or store deterministic fixture streams for:

| Case                                                     | Expected result                                                      |
| -------------------------------------------------------- | -------------------------------------------------------------------- |
| clean sinusoidal green-channel signal at supported rates | plausible estimate and passing quality                               |
| insufficient duration                                    | failure: insufficient samples                                        |
| irregular frame cadence                                  | failure or downsampled result only within validated tolerance        |
| low amplitude                                            | failure: weak signal                                                 |
| saturated frames                                         | failure: saturation                                                  |
| large baseline/motion change                             | failure: motion/noise                                                |
| implausible frequency                                    | no measurement fact                                                  |
| dropped frames/tab background                            | capture cancels or fails explicitly                                  |
| cancellation/navigation                                  | media tracks stopped; worker disposed                                |
| optional torch unavailable                               | capture can continue with guidance or fail safely; no exception loop |

### Browser fixture tests

- injected frame source allows deterministic Playwright coverage without pretending it is live-camera validation;
- prerecorded fixture is labelled and available only in explicit demo/test mode;
- raw frames and time-series buffers never appear in HomeRounds result payloads; the local provider sends none, while a selected VitalLens transport is separately asserted to use only its documented downsampled proxy payload;
- only the derived estimate, units, timestamps, device/browser metadata, quality score/reasons, algorithm version, and provenance can cross the package boundary;
- cleanup is asserted after success, failure, cancel, route change, refresh, and component unmount.

### Physical-device validation

Record device model, OS, browser version, secure origin, light conditions, torch capability, capture duration, estimated pulse, quality result, independent reference method if used, and failure notes. A single comparison may demonstrate plausibility; it must not be presented as clinical validation.

### VitalLens provider tests

- browser key is absent and all provider traffic uses the authenticated/rate-limited HomeRounds proxy;
- explicit synthetic-demo consent precedes camera/provider use;
- provider/model version and processing status are recorded;
- HTTP success with failed/uncertain provider quality creates no measurement fact;
- downsampled payload boundary, timeout, retry, network failure and provider outage are visible and tested;
- no face frame, video or provider response containing raw media is persisted or logged;
- local POS/CHROM/G fallback is not silently substituted for managed inference.
- missing key/agent/proxy produces a typed `unavailable` result and leaves the text/manual-evidence path usable;
- the provider registry exposes exactly one patient-visible provider per release configuration and never silently switches during a round.

## 4A. Voice and text-access tests

- `VOICE_PROVIDER=disabled` supports the complete round, action, audit, and clinician workflow with zero external credentials;
- ElevenLabs API key remains server-only; the browser obtains only a short-lived credential through an authenticated endpoint;
- tentative transcript text is visibly distinguished from final text and neither becomes a fact before patient confirmation;
- keyboard/touch editing and structured answer controls can correct the transcript without restarting the round;
- denied microphone, unsupported media API, token failure, quota, timeout, disconnect, malformed event, and reconnect all land in explicit recoverable states;
- required red-flag questions cannot be skipped by provider output, silence, interruption, or a transcript race;
- text controls have persistent labels, correct focus order, 44×44 px targets where applicable, live-region restraint, and screen-reader names;
- session duration is bounded and ended on completion, cancellation, navigation, page hide, or timeout;
- raw audio is not persisted by HomeRounds and audit events store only provider/config provenance, duration, consent/permission outcome, and safe failure category;
- deterministic transcript fixtures cover Maya, Aisha, prohibited diagnostic/urgency requests, ambiguity, correction, and no-key fallback.

## 5. Contract tests

Use the same Zod-derived schemas at package, API, model-tool, fixture, and E2E boundaries.

- `PatientReport`: only predefined symptom/response categories plus bounded optional transcript/text;
- `MeasurementFact`: units, method, time, quality status/reasons, source, algorithm version;
- `ProtocolResult`: version, rule, fact IDs, outcome, explanation key, allowed action;
- `ClinicalTask`: idempotency key, patient/round, owner, SLA, status, provenance;
- `AuditEvent`: actor type/ID, source, event type, timestamp, correlation, before/after or payload reference;
- FHIR adapter snapshot: no accidental UI dependency or unbounded Bundle leakage;
- API error envelope: stable machine code plus safe user-facing key;
- event envelope: forward-compatible version and deterministic serialization.

Contract fixtures must include valid, minimal, maximal, missing, unknown-field, wrong-unit, stale-version, and malicious-string cases.

## 6. Integration tests

Run with real PostgreSQL repositories and fake external/model transports.

1. FHIR bundle → normalized snapshot with provenance.
2. Scheduled trigger → one persisted round and initial audit event.
3. Structured report → state transition and red-flag evaluation.
4. Assessment plan → selected optical assessment request only when required.
5. Passing signal → measurement fact; failing signal → quality event and no fact.
6. Facts → deterministic protocol result with exact rule/version.
7. Protocol result → exactly one clinician task and patient-safe message.
8. Action retry/concurrency → one task, multiple audited attempts as applicable.
9. Clinician update → audit event and patient status projection.
10. Model timeout/reconnect → no corrupt transition; text path can resume.
11. Database failure mid-action → transaction rollback and safe retry.
12. Reset → only seeded demo tenant/patient data returns to baseline.

## 7. End-to-end scenario suite

| Scenario                                                             | Automated browser | Physical/manual | Required outcome                                                                                                  |
| -------------------------------------------------------------------- | ----------------- | --------------- | ----------------------------------------------------------------------------------------------------------------- |
| Happy path, text, mocked-valid frames                                | Yes               | Yes             | complete round, one task, visible evidence and patient confirmation                                               |
| Happy path, ElevenLabs voice, release-selected live optical provider | Partial           | Yes             | editable/confirmed structured report; passing/explicit quality; deterministic outcome                             |
| Aisha multimodal resilience                                          | Yes               | Manual          | voice transcript corrected by text; manual BP provenance; poor-quality retry/abstention; clinician evidence chain |
| Valid pulse changes planner branch                                   | Yes               | Yes             | skip or one structured follow-up exactly as protocol defines                                                      |
| Poor capture                                                         | Yes               | Yes             | guidance/retry then abstain/review; no measurement fact                                                           |
| Camera denied                                                        | Yes               | Yes             | actionable recovery or labelled fallback; no stranded round                                                       |
| Camera unsupported/insecure origin                                   | Yes               | Yes             | detected before capture; text/recorded recovery as configured                                                     |
| Torch unsupported                                                    | Partial           | Yes             | no crash; capability-aware guidance                                                                               |
| Microphone denied                                                    | Yes               | Yes             | immediate text parity                                                                                             |
| ElevenLabs missing/unavailable/quota exhausted                       | Yes               | Manual          | disabled-provider text path remains resumable; no invalid action                                                  |
| Network loss during report                                           | Yes               | Yes             | clear retry; no duplicate report/action                                                                           |
| Refresh/background/resume                                            | Yes               | Yes             | media cleaned up; state restored                                                                                  |
| Red flag                                                             | Yes               | Manual          | protocol-defined action without model urgency decision                                                            |
| Missing/stale FHIR facts                                             | Yes               | Manual          | explicit missing/abstention/review state                                                                          |
| Duplicate action request                                             | Yes               | Manual          | one clinical task                                                                                                 |
| Clinician edit/complete                                              | Yes               | Yes             | audited change; patient status updated                                                                            |
| Demo reset                                                           | Yes               | Yes             | known baseline; unrelated records unaffected                                                                      |

Automated optical scenarios use an injectable source/provider. Only the physical iPhone validates real camera, permission, capability, optical and provider-network behaviour.

## 8. Browser, device, and Codex-operated QA

### Desktop browser matrix

Use the in-app browser for local/hosted inspection and Chrome control when an existing Chrome profile, extension state, or permission setting matters.

- Chromium current: full patient text path and clinician flow;
- Safari current: layout, text path, error handling;
- responsive widths: 320, 375, 414, 768, 1024, 1280, 1440, 1920;
- zoom: 200%;
- keyboard-only navigation;
- light/dark OS setting: app may remain deliberately light but must preserve contrast;
- reduced motion and high-contrast/forced-colour checks where available.

### Physical devices

- Primary: the available iPhone 12 with its exact iOS and Safari version recorded.
- Secondary: Android/Chrome only if a device can be borrowed before release.
- Test HTTPS origin, first-use permission, deny then re-grant, tab background, screen lock, rotation, low light, hand motion, thermal/battery behaviour, Wi-Fi/hotspot change, and microphone fallback.
- Do not rely on `http://<laptop-ip>`: camera/mic APIs require a secure context. Use hosted HTTPS or a deliberately trusted local HTTPS route.

### Computer Use

Use Computer Use only where a dedicated browser/CLI connector is insufficient: inspect OS permission prompts, device/simulator UI, terminal/server state, or the exact presenter flow. Record what it verified. Do not treat visually clicking a successful UI as a substitute for database, network, or audit assertions.

### Xcode

The hackathon MVP is a web PWA, so Xcode is not part of its acceptance gate. A Simulator cannot validate a rear camera, torch, real optical signal, thermal behaviour, or physical permission flow. If a native shell is added after the hackathon, use the Simulator for navigation/layout and a physical iPhone for sensor acceptance.

## 9. Accessibility and clinical usability

- automated axe scan: zero unreviewed serious or critical violations;
- complete keyboard traversal with logical focus and no traps;
- visible focus of at least 3–4 px where feasible;
- touch targets at least 44×44 px;
- form fields have persistent labels and contextual errors;
- progress/status has text and semantics, never colour only;
- live regions are reserved for meaningful state changes and do not chatter;
- transcript/text alternative for every voice interaction;
- patient reading level is plain and concise; no unexplained acronyms;
- no diagnosis or misleading certainty in patient copy;
- reduced-motion preference disables nonessential animation;
- screen-reader pass on primary patient path and clinician task path;
- 200% zoom preserves operations without two-dimensional scrolling except data tables where unavoidable.

## 10. Security and privacy validation

### Automated/static

- dependency vulnerability scan with no unreviewed high/critical issues;
- secret scan of repository and built assets;
- inspect browser bundles/source maps for ElevenLabs, VitalLens, database, and any optional model-provider keys;
- API schema fuzzing and malformed/oversized payload limits;
- rate-limit tests for session/token and action endpoints;
- CSRF/origin/cookie configuration tests appropriate to the chosen session model;
- SQL injection covered by parameterized repository APIs;
- log snapshot tests prove redaction of secrets, raw frames, and clinical free text;
- startup refuses unsafe demo/production configuration combinations.

### Manual/network/storage

- browser devtools/network trace proves local finger PPG sends no frames, or proves a selected VitalLens path sends only the documented downsampled payload through our proxy;
- database/object storage inspection contains no raw media;
- short-lived ElevenLabs session credential comes only from an authenticated server endpoint;
- production tracing/retention choices are explicit, not inherited accidentally;
- fictional patient and non-clinical-use disclosure are visible;
- reset credentials and demo operator controls are not exposed in production mode.

### Threat scenarios

- patient calls a model tool with crafted text;
- model attempts an unapproved tool or invalid structured argument;
- replay/duplicate request and concurrent clinician clicks;
- tampered protocol/version or fixture;
- stale browser state submits to a closed round;
- attacker requests many short-lived voice-session credentials;
- malicious FHIR text appears in clinician/patient UI;
- compromised client attempts to submit a measurement with passing quality.

Each is rejected, escaped, rate-limited, version-checked, or made harmless by server-side deterministic validation.

## 11. Performance and reliability budgets

These are hackathon engineering targets, not clinical service-level agreements.

| Measure                                             |                                                                                  Target |
| --------------------------------------------------- | --------------------------------------------------------------------------------------: |
| patient/clinician initial LCP on hosted test device |                                                        ≤2.5 s p75-like rehearsal target |
| CLS                                                 |                                                                                    ≤0.1 |
| normalized snapshot read                            |                                                                                    ≤2 s |
| deterministic protocol evaluation                   |                                                                                 ≤200 ms |
| persisted task visible to clinician                 |                                                                ≤2 s after action commit |
| voice turn response, median in event conditions     |                                     ≤1.5 s aspirational; text fallback always available |
| optical capture                                     | bounded and visibly timed; target 20–30 s, with provider-specific adjustment documented |
| demo happy path                                     |                                                               ≤3 min, target 2 min 50 s |
| reset to ready                                      |                                                                                   ≤30 s |

Run a short concurrency test for repeated triggers/action retries and a 30-minute soak with multiple reset/runs. Monitor errors, database connections, memory, media-track cleanup, and Realtime reconnect count.

## 12. Demo acceptance script

1. Start with the fictional patient and a due programme round.
2. Show that the agent knows the bounded programme context and accepts voice or text.
3. State explicitly that safety and actions are determined by code, not the model.
4. Perform the one selected live optical measurement on the iPhone. Show a compact quality result before exposing an estimate and disclose any third-party processing boundary.
5. Let the measured result determine whether the one structured follow-up is needed; do not promise a particular live pulse.
6. Show the deterministic rule/protocol version and the created same-day-review task.
7. Switch to the clinician cockpit and show evidence, owner/SLA, audit chain, and completion.
8. Return to the patient confirmation.

Recovery order:

1. retry camera once with concise instructions;
2. use a clearly labelled previously valid capture replay;
3. use the text-only poor-quality/abstention scenario;
4. switch to backup video only if the environment itself is unavailable.

The presenter never claims rhythm diagnosis, medical-grade accuracy, clinical deployment readiness, or a live eMed integration.

## 13. Release evidence bundle

Store under `docs/qa/` during execution:

- release commit and deployment URL;
- command/test results;
- requirement matrix with pass/fail/waiver;
- browser/device/OS versions;
- screenshots or short recordings of primary and recovery paths;
- network/storage raw-media verification;
- protocol/model/config versions;
- axe and performance results;
- three-run rehearsal log and timings;
- open issues with severity and owner;
- signed-off claim/limitation list.

No requirement is marked passed solely because the code exists. It needs automated evidence, observed evidence, or an explicit and justified waiver.
