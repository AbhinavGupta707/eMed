# HomeRounds risks, assumptions, decisions, and open questions

Status: decision log for team alignment before implementation

## 1. Decisions made for the plan

These resolve contradictions or underspecification in the source bundle. They should be changed only deliberately because several worktree boundaries and tests depend on them.

| Decision                                                                                                                                | Rationale                                                                                | Cost/trade-off                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Build one cardiometabolic asynchronous round, not a general platform                                                                    | Proves the complete closed loop inside the event window                                  | Breadth and multiple condition packs are deferred                                                |
| Implement two isolated optical HR adapters but release-select one after an iPhone 12 comparison; local finger PPG is the no-key default | Preserves one distinctive hero while allowing empirical provider choice                  | Adds one CP1 lane and comparison burden; VitalLens live privacy boundary remains explicit opt-in |
| Use at most one structured questionnaire as follow-up                                                                                   | Makes the planner's adaptation visible without adding another unreliable sensor          | Less visually ambitious than respiratory rate/movement/med scan                                  |
| Let the live measurement affect the branch, not force a scripted escalation                                                             | A presenter's pulse is uncontrollable; safety outcomes must not be faked                 | The exact live branch can vary, so presenter narration must be flexible                          |
| Use a labelled recorded-valid-capture replay only as fallback                                                                           | Preserves a demo under venue/device failure while remaining honest                       | Replay cannot support a live-sensor claim and must be disclosed                                  |
| Keep raw frames entirely on-device                                                                                                      | Reduces privacy risk and architecture surface                                            | Limits remote debugging and later reprocessing                                                   |
| Use a code-owned state machine and deterministic protocol                                                                               | Safety, testability, and audit matter more than agent autonomy                           | More explicit implementation work and less “agent magic”                                         |
| Use ElevenLabs behind a phase-constrained voice contract with confirmation and complete text parity                                     | Uses existing owner credit while keeping workflow authority in code                      | Hosted voice variability, quota, and data-control configuration still require care               |
| Use PostgreSQL 17 through a repository boundary                                                                                         | Durable local/hosted parity and concurrency are safer than local SQLite on serverless    | Slightly heavier event setup and deployment                                                      |
| Use a curated fictional FHIR R4 bundle                                                                                                  | Shows interoperability and provenance without live-EHR risk                              | Does not prove eMed integration or broad FHIR conformance                                        |
| Use a small JSON protocol DSL                                                                                                           | Closed operators are easy to validate, version, and test                                 | Less expressive than CQL or a full rules platform                                                |
| Use a Next.js PWA, not native apps                                                                                                      | Fastest route to patient + clinician surfaces and hosted HTTPS                           | Physical browser/device support must be validated; no native sensor guarantees                   |
| Treat “production-grade” as production-shaped engineering                                                                               | Contracts, safety, audit, privacy, testing, deployment and observability can be credible | The hackathon output is not clinically validated or deployable healthcare software               |

## 2. Source-bundle ambiguities resolved

### Sensor conflict

The execution brief foregrounds finger PPG. Later PRD sections foreground front-camera respiratory rate and a medicine scan, while an appendix returns to respiratory-rate branching. Implementing all three would multiply device, model, permission, quality, and validation risks. The plan implements local finger PPG and VitalLens face rPPG behind one normalized heart-rate contract, then selects exactly one for the release after physical iPhone testing. Respiratory-rate interpretation, medicine scanning, movement, and HRV remain out of MVP scope.

### Outcome-script conflict

The demo narrative wants a measurement to trigger an urgent/same-day action, but a real presenter's pulse may be normal. The implementation must never manipulate or reinterpret the live value. The protocol therefore supports multiple honest branches:

- valid and already sufficient → no follow-up;
- valid but context requires clarification → exactly one structured question;
- defined fictional combination meets threshold → same-day-review task;
- poor/unknown quality or missing facts → retry, abstain, or review.

Seeded patient answers may be fictional and scripted; the live measurement is not.

### Persistence conflict

The source proposes SQLite but also implies a hosted, production-shaped system. A writable local SQLite file is not a durable serverless database. PostgreSQL is the default. An in-memory or SQLite repository may exist only as a clearly labelled emergency demo fallback, never as proof of durable action execution.

### Agent boundary conflict

The source uses “agent” broadly enough to imply orchestration authority, while the safety rules forbid the model from determining urgency or action. The plan uses the agent for conversation, structured extraction, explanation, and narration; the application state machine, quality gate, protocol, and action allowlist retain authority.

## 3. Critical risks

Scales: likelihood and impact are Low, Medium, or High. “Trigger” is the observable condition that activates the contingency.

| Risk                                                                  | Likelihood | Impact            | Early trigger                                                                  | Mitigation                                                                                                         | Contingency                                                                                       |
| --------------------------------------------------------------------- | ---------- | ----------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Both optical options are noisy/unsupported on the iPhone 12           | High       | High              | either option cannot produce three passing release captures                    | fixture-test both in CP1; compare physically in CP5; select one; capability detection and bounded retries          | remove the live-vital claim; use labelled historical/manual evidence and preserve the safety loop |
| VitalLens introduces an unacceptable biometric/data/provider boundary | Medium     | High              | local finger PPG fails and owner cannot accept US API processing/consent/proxy | default to on-device finger PPG; use VitalLens only by explicit decision; synthetic data; proxy and no persistence | choose no-live-optical Option C rather than silently transmitting frames                          |
| Secure-context/camera/mic permissions fail on a phone                 | Medium     | High              | `getUserMedia` unavailable on event URL                                        | hosted HTTPS early; preflight page; test deny/re-grant; primary/secondary device                                   | text path plus labelled replay; local recovery only on a deliberately trusted secure origin       |
| Scope exceeds the effective 20-hour build window                      | High       | High              | no integrated closed loop by hour 10–12                                        | checkpoint gates; one vertical slice; hard cut list; no speculative packs                                          | cut reasoning summary, polish, secondary device, then live sensor claim if necessary              |
| ElevenLabs latency/quota/outage disrupts presentation                 | Medium     | Medium            | token failure, repeated reconnects or >1.5 s median turn delay                 | bounded session; no-key fixtures; text parity; deterministic workflow independent of voice                         | switch openly to text; do not troubleshoot voice live                                             |
| Model produces clinical overreach                                     | Medium     | High              | diagnosis/urgency/medicine language appears in adversarial tests               | phase tools, narrow instructions, server schemas, deterministic copy and action                                    | disable model-authored patient prose; use allowlisted templates/text flow                         |
| A live normal pulse does not produce the desired branch               | High       | Medium            | presenter measurement is normal                                                | design both branches as meaningful; fictional structured answer controls the full context                          | narrate adaptability; use a pre-seeded deterministic scenario after the live measurement          |
| Duplicate actions or stale UI create unsafe work                      | Medium     | High              | retries create two queue rows or closed rounds accept writes                   | DB uniqueness, transactions, version checks, idempotency tests                                                     | block UI and show auditable retry; manually remove only in non-demo debugging                     |
| Synthetic FHIR data is inconsistent or unconvincing                   | Medium     | Medium            | medication/condition/timeline contradictions appear                            | curate one narrow bundle; adapter contract; provenance display; clinician review if available                      | simplify the snapshot and disclose exactly what is synthetic                                      |
| Shared contract changes cause worktree conflict                       | Medium     | High              | worker requests incompatible schema edits mid-checkpoint                       | freeze contracts; integration-only changes; exclusive allowlists                                                   | stop checkpoint, update centrally, respawn/rebase affected lanes                                  |
| Lockfile/root edits collide                                           | Medium     | Medium            | worker adds dependency independently                                           | integration owns all installs/config; workers request dependencies                                                 | revert out-of-scope diff before merge and add dependency centrally                                |
| Migrations diverge                                                    | Low        | High              | more than one branch creates a migration                                       | one migration owner in CP1; integration only afterward                                                             | regenerate a single ordered migration on integration before next checkpoint                       |
| Hosted database/platform limits cause failure                         | Medium     | High              | connection/timeouts during rehearsal                                           | pooled connection strategy, health check, seed/reset, local Docker recovery                                        | local laptop demo with trusted/hosted secure client path; backup video                            |
| Provider data controls do not match health-data expectations          | Medium     | High              | organization lacks required agreements, retention or regional configuration    | use fictional data only; disable optional tracing; server-side keys; document ElevenLabs/VitalLens boundaries      | block real data entirely; do not claim production compliance                                      |
| Clinician task has no realistic owner/SLA                             | Medium     | High for business | nobody can state who monitors it and when                                      | encode fictional role/SLA; ask eMed mentors; cockpit displays ownership                                            | position as workflow prototype, not operational pilot                                             |
| Judges see a dashboard/chatbot rather than a care workflow            | Medium     | High              | story spends time on UI chrome or model conversation                           | demo the state/evidence/action loop; name the non-chatbot boundary                                                 | shorten chat, emphasize closed-loop action and audit trail                                        |
| Clinical accuracy/effect claims are challenged                        | High       | High              | questions ask for sensitivity, bias, or medical-grade evidence                 | make narrow feasibility claims; cite evidence; label synthetic data; describe validation roadmap                   | state limitation directly and show quality abstention                                             |
| Browser regression or responsive failure                              | Medium     | Medium            | phone/desktop route breaks at CP5                                              | viewport matrix, Playwright, physical-device tests, styleguide                                                     | use the tested primary viewport/device; show backup capture                                       |
| Team lacks enough people/devices/accounts                             | Unknown    | High              | fewer than expected resources at kickoff                                       | preassign roles and minimum lane schedule                                                                          | serialize lanes and drop P1 work; preserve same ownership map                                     |
| Event rules disallow pre-built code                                   | Unknown    | High              | organizer says code must start at 19:00                                        | keep only research/plans until clarified; create scaffold after start                                              | timestamp/recreate scaffold during allowed period and retain planning provenance                  |

## 4. Product and business pressure test

### Verdict

**Strong hackathon concept; conditional business.** It is well matched to the challenge because it combines a human-feeling patient interaction, an at-home measurement, deterministic safety, and an actionable async clinical handoff. Its commercial value is unproven until workflow ownership, clinical utility, and safe operating economics are validated.

### Core falsifiable assumption

For a defined chronic-care programme, requesting one adaptive extra assessment will increase the proportion of rounds that produce an appropriate, evidence-backed clinician action without increasing clinician burden or missed safety criteria.

The first meaningful pilot is internal clinical-operations shadow mode, not direct-to-consumer release.

### What competes with it

The primary competitor is not another generative-AI app. It is today's combination of scheduled calls, questionnaires, separate device readings, messaging inboxes, protocol checklists, and manual chart review. Adjacent platforms using dedicated hardware can perform richer remote exams; HomeRounds' proposed advantage is a lower-friction, software-first, adaptive workflow using available devices.

### Pressure-test score

| Dimension              | Score / 5 | Reason                                                                                   |
| ---------------------- | --------: | ---------------------------------------------------------------------------------------- |
| pain intensity         |         4 | chronic programmes have adherence, monitoring, and async workload problems               |
| buyer/workflow clarity |         3 | eMed/programme operator is plausible, but the operational owner/SLA is not yet confirmed |
| urgency                |         4 | directly matches the hackathon challenge and current virtual-care direction              |
| differentiation        |         4 | the measurement-quality-protocol-action loop is stronger than a generic coach/chatbot    |
| speed to evidence      |         3 | a demo is fast; clinical and operational proof are not                                   |
| founder/team advantage | 2/unknown | no team background, clinical access, or distribution advantage was provided              |

### Kill criteria for the broader product

Pause or pivot if a shadow/pilot study finds any of the following:

- adaptive rounds do not improve actionable-task yield over a fixed questionnaire;
- clinician review minutes or alert volume increase without a commensurate benefit;
- quality-gated phone PPG fails too often on the target device/population mix;
- the responsible clinical service cannot guarantee ownership/SLA;
- a narrow intended purpose still creates a regulatory or evidence burden the commercial model cannot support;
- users meaningfully misunderstand the system as diagnosis or emergency monitoring despite design changes.

## 5. Questions requiring answers before coding or at kickoff

### Blocking for execution setup

1. **Approve the physical-device sensor decision rule, and may VitalLens be used only if local finger PPG fails?** This freezes the assessment contract.
2. **If VitalLens is considered, do you accept its documented downsampled face-frame transfer to a US API, explicit-consent requirement and wellness-only limitation for this synthetic demo?**
3. **What exact iOS/Safari version runs on the available iPhone 12?** This is now the primary physical test device.
4. **Approve Vercel plus Neon PostgreSQL 17, or identify an existing hosting/database provider?** Choose before CP2 to avoid event-time account setup.

### Blocking for a credible demo

5. **Which event “inference platform” receives the advertised $35 credits, and are there required APIs or sponsors beyond OpenAI/eMed/Eka?** Do not force an irrelevant integration, but confirm scoring expectations.
6. **Is there an eMed sandbox/API, sample workflow, or mentor-approved task schema available?** If not, the adapter remains fictional and this must be stated.
7. **What exact fictional patient story and protocol outcome will the clinical reviewer accept?** A clinician should approve the red flags, thresholds, patient copy, task reason, and SLA before demo freeze.
8. **Who presents, who operates the clinician screen, and what is the exact demo time limit?** The current plan assumes one presenter plus an operator and targets 2:50.
9. **Is a live phone-camera demo expected, or will judges accept an honestly labelled replay if venue conditions fail?** The implementation supports both.

### Product decisions that can default but should be confirmed

10. Is “same-day clinical review” the desired action, or should it be a neutral programme-team follow-up?
11. Should a valid normal pulse skip the follow-up or ask a single structured palpitations question? The default protocol can demonstrate either branch.
12. Does the clinician need to edit a drafted message, or is task acknowledge/complete enough for MVP?
13. Is voice strategically important to judging, or should text be the primary path with voice as a brief enhancement?
14. Is a caregiver persona needed for the pitch only? It is excluded from implementation.
15. Which jurisdiction is the eventual product aimed at: UK, US, or both? The hackathon can remain jurisdiction-neutral, but production work cannot.

## 6. Default assumptions if answers are unavailable

- All data is fictional, clearly labelled, and contains no PHI.
- The official build window governs app-code creation; planning can precede it unless organizers say otherwise.
- The team consists of this Codex orchestration session, one Mac and one iPhone 12; worktree counts adapt by checkpoint and peak at three concurrent workers.
- A managed PostgreSQL database and an HTTPS web deployment are available.
- The action is a fictional same-day programme-team review, not emergency dispatch.
- One Realtime conversation and a complete text fallback are enough.
- A clinician or mentor will review the fictional protocol before submission.
- The target deployment claim is a prototype for internal clinical workflow evaluation, not patient release.
- The UK regulatory/clinical-safety path is used as the worked production example because the event is in London; US expansion requires a separate assessment.

## 7. Known limitations that must remain visible

1. The reviewed smartphone PPG research supports feasibility under controlled conditions; its implementation was proprietary and it does not validate this algorithm, device range, or target population.
2. A physical-device run is necessary but still not a clinical performance study.
3. A curated FHIR fixture proves an adapter shape, not interoperability with eMed or arbitrary EHRs.
4. Synthetic scenarios cannot validate clinical outcomes, patient comprehension, bias, adherence, or clinician workload.
5. OpenAI API retention, regional processing, BAA/Healthcare Addendum, and organization-level configuration must be verified before real health data is considered.
6. A hackathon audit log and deterministic protocol are not a Quality Management System or a complete clinical-safety case.
7. The plan knows the implementation team is Codex-orchestrated, but has no evidence about founder clinical/signal-processing experience, eMed internal workflows, or private APIs.
8. Hosted service/provider quotas, event Wi-Fi, device thermal behaviour, and browser camera implementations remain environmental dependencies.
9. The repository is initialized and linked to GitHub but has no baseline commit, so worktree sessions still cannot start until Checkpoint 0 commits the reviewed scaffold/contracts.
10. The requested “zip folder” is not present as a zip in the workspace; the analysis used the already-extracted `HomeRounds_Source_Package` directory.

## 8. Evidence and primary references

The detailed architecture applies these sources conservatively:

- Event: [Reimagine Health with eMed & OpenAI](https://aienginehack.com/emed) and the user's [Luma event page](https://luma.com/aiengine-zado?tk=n6KFuk).
- OpenAI browser transport: [Realtime API with WebRTC](https://developers.openai.com/api/docs/guides/realtime-webrtc) and [Voice agents](https://developers.openai.com/api/docs/guides/voice-agents).
- Model guard boundaries: [Guardrails and approvals](https://developers.openai.com/api/docs/guides/agents/guardrails-approvals).
- Health-data configuration caveats: [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data).
- Browser capture/security: [W3C Media Capture and Streams](https://www.w3.org/TR/mediacapture-streams/) and [W3C Image Capture](https://www.w3.org/TR/image-capture/).
- Smartphone optical pulse feasibility: [Nature Communications Medicine smartphone PPG study](https://www.nature.com/articles/s43856-022-00102-x).
- Web stack baseline: [Next.js installation/current requirements](https://nextjs.org/docs/app/getting-started/installation) and [Node.js releases](https://nodejs.org/en/about/previous-releases).
- Hosted SQLite limitation: [Vercel SQLite guidance](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel).
- UK future path: [MHRA software and AI as a medical device](https://www.gov.uk/government/publications/software-and-artificial-intelligence-ai-as-a-medical-device), [NHS DCB0129/DCB0160 information](https://www.england.nhs.uk/long-read/national-review-of-clinical-risk-management-standardsdcb0129-and-dcb0160-supporting-information/), and [NICE Evidence Standards Framework](https://www.nice.org.uk/corporate/ecd7).
- Adjacent/status-quo context: [eMed](https://www.emed.com/us) and [TytoCare](https://www.tytocare.com/).

These sources do not supply the fictional protocol thresholds. Those require a named clinical reviewer and should be presented as illustrative until reviewed.
