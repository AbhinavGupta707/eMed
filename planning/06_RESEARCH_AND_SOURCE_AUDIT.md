# HomeRounds research and source audit

Status: analysis provenance  
Reviewed: 16 July 2026

## 1. Workspace inventory

The requested zip is not present in the workspace. The source is already extracted at `HomeRounds_Source_Package/`. On 17 July the workspace was initialized on `main` and linked to the empty `AbhinavGupta707/eMed` remote; its first commit is pending Checkpoint 0 review.

| Source                                      |          Size reviewed | Role in analysis                                                                |
| ------------------------------------------- | ---------------------: | ------------------------------------------------------------------------------- |
| `HomeRounds_Hackathon_Execution_Brief.md`   |              302 lines | concise build scope, event strategy, hero PPG flow, sprint and demo emphasis    |
| `HomeRounds_PRD_Technical_Spec.md`          |            2,070 lines | full product, users, modules, planner, safety, data, UI, operations and roadmap |
| `architecture.dot` + `architecture.png`     | source + rendered pair | proposed experience/orchestration/clinical/FHIR architecture                    |
| `demo_flow.dot` + `demo_flow.png`           | source + rendered pair | trigger-to-patient-to-clinician demo sequence                                   |
| `evidence_tiers.dot` + `evidence_tiers.png` | source + rendered pair | hierarchy from measurement quality through clinical evidence/action             |
| `product_loop.dot` + `product_loop.png`     | source + rendered pair | Notice → Ask → Measure → Quality → Protocol → Act → Handoff                     |
| `safety_flow.dot` + `safety_flow.png`       | source + rendered pair | deterministic red flags, quality gating, bounded model and escalation           |

Both markdown documents were read in full. Every `.dot` file was read and every `.png` was inspected at original detail. The PNGs faithfully render their paired DOT logic; there is no additional hidden design content in the images.

## 2. What the supplied package consistently says

The stable product thesis across the materials is:

- HomeRounds is an asynchronous clinical round, not a generic chatbot or monitoring dashboard.
- A round begins because longitudinal context and/or a programme signal justifies a small intervention.
- It asks for the minimum additional evidence that can change a permitted action.
- Measurement quality is itself clinical evidence and must gate downstream use.
- The LLM may converse, structure, explain and summarize, but code owns red flags, urgency, protocols and allowed actions.
- The system must close the loop with a real, owned clinical action and a clear patient next step.
- Source, quality, rule, uncertainty, model/version where used, and human action must remain visible in the evidence chain.
- The long-term destination is a reusable platform of condition-specific round/assessment packs and a longitudinal plan.

Those principles are preserved in every recommendation.

## 3. What the package leaves unresolved

| Unresolved point                                                                              | Where it appears                                    | Resolution in this plan                                                                                                                                                |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| hero assessment alternates between finger PPG and front-camera respiratory rate/medicine scan | execution brief versus later PRD sections/appendix  | implement finger PPG and VitalLens face rPPG behind one contract; release-select one HR provider after an iPhone gate; one structured follow-up; cut the other modules |
| live presenter measurement is expected to drive a particular review outcome                   | demo narrative                                      | live value changes the branch; fictional report + versioned demo protocol determine action; never fake the value                                                       |
| SQLite is proposed alongside hosted/production-shaped persistence                             | technical recommendation and deployment aspirations | PostgreSQL 17 with one repository boundary; in-memory fallback only if visibly labelled                                                                                |
| “agent” sounds autonomous while safety rules deny decision authority                          | architecture/product language                       | one bounded provider-neutral voice layer around an app-owned state machine/protocol                                                                                    |
| MediaPipe is suggested without a task that needs landmark inference                           | dependency list                                     | remove it from PPG MVP                                                                                                                                                 |
| broad platform/OnePlan ambition competes with a short build window                            | blue-sky sections versus sprint                     | build one cardiometabolic closed loop; preserve platform seams only                                                                                                    |
| production-grade language can be mistaken for clinical readiness                              | ambition/quality language                           | production-shaped engineering, explicitly not validated patient software                                                                                               |
| no real eMed API, identity, task schema or operational SLA is supplied                        | integration/operations sections                     | use a narrow fictional adapter and surface these as blocking pilot questions                                                                                           |

## 4. Event context verified

The user-provided Luma link identifies **Reimagine Health with eMed & OpenAI**. The event information and linked official event pages indicate:

- Friday 17 July 2026 at 17:00 through Saturday 18 July at 18:00;
- building starts Friday at approximately 19:00 and completes Saturday at 15:00;
- judging follows, with top-team demos later Saturday afternoon;
- teams may contain up to four people;
- challenge emphasis: next-generation AI for at-home chronic-condition management, including obesity, type 2 diabetes and cardiovascular disease;
- desired themes include longitudinal programmes, human-feeling coaching/monitoring, adherence, heart/women's health, asynchronous clinical work and actionable complex data;
- judging criteria: user impact, innovation, feasibility and demo quality;
- the event explicitly values a live demonstration/walkthrough over a slide-heavy pitch;
- advertised prizes are £5,000 plus $1,000 in OpenAI API credits, £3,000, and £2,000; the inventory page also mentions event credits, but the separate inference-credit provider was not clear from the reviewed material;
- participants retain project intellectual property according to the event FAQ.

Implication: a physical, visible, consequential three-minute loop is strategically stronger than a broad platform mock-up. The plan reserves the final quarter of the build window for integration and demonstration reliability.

Primary event references: [official event page](https://aienginehack.com/emed) and [Luma registration page](https://luma.com/aiengine-zado?tk=n6KFuk).

## 5. OpenAI research findings

Only official OpenAI documentation was used for implementation decisions.

### Realtime browser voice

The [Realtime WebRTC guide](https://developers.openai.com/api/docs/guides/realtime-webrtc) recommends WebRTC for browser/client connections and keeps the standard API key on a server. The server can mint a short-lived client secret. This supports the chosen patient-browser architecture.

The [Voice agents guide](https://developers.openai.com/api/docs/guides/voice-agents) describes the TypeScript `RealtimeAgent` and `RealtimeSession` path as the fast route for interactive browser voice. A chained, more predictable voice pipeline is also possible, but it adds no value to the short demo if business logic is already deterministic.

Earlier decision, now superseded for the hackathon: OpenAI Realtime remains a valid future adapter, but the owner has ElevenLabs credit and asked to avoid Realtime audio cost. The provider-neutral design preserves the same server-minted short-lived credential and text-parity principles without implementing two hosted voice transports.

### Models and guardrails

Current official model guidance was checked rather than relying on historical model names. An optional structured summary can start with the then-current lower-cost reasoning option (`gpt-5.6-terra` in the reviewed guidance), but the plan cuts this call if deterministic templates suffice.

The [guardrails and approvals guide](https://developers.openai.com/api/docs/guides/agents/guardrails-approvals) reinforces that validation must sit at the tool boundary and human approval state must be owned/resumed by the application. This is why the model has no urgency/action tool.

### Data controls

The [OpenAI data-controls documentation](https://developers.openai.com/api/docs/guides/your-data) says default API abuse-monitoring logs may retain customer content for up to 30 days and documents Zero Data Retention/Modified Abuse Monitoring eligibility, endpoint and tracing caveats, regional processing, and healthcare agreement requirements.

Decision: fictional data only for the hackathon, optional provider tracing off, and no claim that a default API project is ready for PHI. If OpenAI is added later, the same organizational configuration and agreement gate applies.

## 5A. ElevenLabs and local-voice research findings

The [ElevenLabs React SDK documentation](https://elevenlabs.io/docs/eleven-agents/libraries/react) supports WebRTC voice sessions, WebSocket text-only sessions, tentative/final transcript events, client tools, mute control, and authenticated sessions using a short-lived conversation token or signed URL. Its [authentication guidance](https://elevenlabs.io/docs/eleven-agents/customization/authentication) says the API key must remain server-side and recommends temporary signed credentials for client applications.

Current [ElevenAgents pricing](https://elevenlabs.io/pricing/agents?price.platform=agents_platform), reviewed 17 July 2026, lists a small free call allowance and per-minute hosted-agent pricing beyond included usage, with LLM costs potentially separate. Pricing can change; the app therefore caps session duration, ends sessions on lifecycle transitions, records usage metadata, and never requires voice for completion.

Free/local alternatives were evaluated:

- The browser [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition) is not Baseline across major browsers, and some implementations send audio to a browser vendor rather than work offline. It is a progressive enhancement, not the iPhone demo's primary dependency.
- [LiveKit Agents](https://docs.livekit.io/agents/) is Apache-2.0, provider-neutral, WebRTC-based, and can use a self-hosted LiveKit server. A genuinely local stack still needs an always-running agent service plus STT, LLM, TTS, turn detection, model downloads, performance tuning, and deployment/observability.
- [whisper.cpp](https://github.com/ggml-org/whisper.cpp) supports local/WASM and iOS transcription, and [Piper](https://github.com/OHF-Voice/piper1-gpl) supports local neural TTS. They are strong post-hackathon adapters, but Piper's current codebase is GPL-3.0 and browser/mobile latency plus voice/model licensing must be assessed before distribution.

Decision: ElevenLabs is the hosted hackathon primary behind `VoiceSessionProvider`; `disabled`/text is the dependable zero-cost primary control surface. Do not build LiveKit, OpenAI Realtime, or browser Web Speech in parallel during Checkpoint 2.

## 6. Browser and sensor research findings

The [W3C Media Capture and Streams specification](https://www.w3.org/TR/mediacapture-streams/) establishes `getUserMedia` as a secure-context, permissioned capability. The [W3C Image Capture specification](https://www.w3.org/TR/image-capture/) makes torch support optional and discoverable through capabilities/constraints.

Implications:

- hosted HTTPS is the primary phone route;
- `http://<laptop-ip>` is not a safe assumption;
- rear camera is a preference, not a guarantee;
- torch is feature-detected and optional;
- camera/mic denial and media-track cleanup are first-class tested states;
- a physical phone is required for the sensor claim; a desktop mock or Xcode Simulator is insufficient.

The reviewed [prospective smartphone PPG study](https://www.nature.com/articles/s43856-022-00102-x) demonstrated heart-rate feasibility in 95 participants using a Pixel 3 under a controlled protocol, but its code was proprietary and its findings do not validate HomeRounds' algorithm. It is evidence to attempt the prototype, not permission to quote its accuracy as ours.

Additional context supplied by the owner led to a review of [VitalLens' JavaScript client](https://docs.rouast.com/js/), [proxy guidance](https://docs.rouast.com/js/proxies/), and [privacy/legal boundary](https://docs.rouast.com/guides/privacy/). It offers a 30-second front-camera workflow and local POS/CHROM/G fallbacks, but managed inference requires a server-side key proxy and transmits cropped/downsampled face frames. Its documentation identifies general-wellness use, US hosting, explicit consent and technical metadata retention. It is implemented as a separately testable adapter alongside local finger PPG, but only one provider is release-selected after physical comparison; a missing key leaves VitalLens unavailable rather than blocking the build.

## 7. Web and persistence research findings

- The [Next.js installation documentation](https://nextjs.org/docs/app/getting-started/installation) identifies Next.js 16 as the current major and Node 20.9 as its minimum at review time.
- The [Node release schedule](https://nodejs.org/en/about/previous-releases) identifies Node 24 as LTS on the planning date.
- [Vercel's SQLite guidance](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel) explains why a local writable SQLite file is not durable persistence on its serverless platform.

Execution decision: the Mac exposes Node 22.22.2, which satisfies Next.js 16's requirement and remains supported. Checkpoint 0 pins that exact executable toolchain, Next.js 16/React 19, and PostgreSQL 17 so every worker can run the same checks. Node 24 remains the preferred production LTS and becomes a post-event compatibility matrix entry rather than an untested local assumption. The lockfile is the dependency source of truth.

## 8. Clinical/regulatory research findings

The prototype potentially influences what information is collected and which care-team action is recommended. A real product therefore cannot be treated as a generic wellness UI simply because a clinician remains in the loop.

- The [MHRA software and AI as a medical device guidance](https://www.gov.uk/government/publications/software-and-artificial-intelligence-ai-as-a-medical-device) makes intended purpose and medical functionality central to qualification/classification.
- NHS information on [DCB0129 and DCB0160](https://www.england.nhs.uk/long-read/national-review-of-clinical-risk-management-standardsdcb0129-and-dcb0160-supporting-information/) describes clinical-risk responsibilities for manufacturers and deploying organizations.
- The [NICE Evidence Standards Framework](https://www.nice.org.uk/corporate/ecd7) links evidence expectations to digital-health function and risk.

Decision: the production roadmap starts with an intended-purpose/regulatory determination, clinical hazard work and shadow evidence. The hackathon cannot establish compliance or clinical validity.

## 9. Market/context research findings

[eMed](https://www.emed.com/us) already operates virtual-care and at-home diagnostic/programme experiences. HomeRounds should therefore be positioned as an extension of longitudinal programme orchestration and asynchronous clinical action, not as a reinvention of telehealth.

[TytoCare](https://www.tytocare.com/) represents an adjacent dedicated-hardware remote-exam direction. HomeRounds' proposed wedge is lower friction and adaptive software on existing devices; it should not claim the breadth or validated exam capability of dedicated hardware.

The strongest business comparison is with current clinical operations: scheduled check-ins, forms, device portals, phone calls, message inboxes and manual chart review. The product thesis succeeds only if it improves actionability or burden against that baseline.

## 10. Recommendation provenance map

| Recommendation                             | Supplied source                   | External verification                                                            | Planning destination        |
| ------------------------------------------ | --------------------------------- | -------------------------------------------------------------------------------- | --------------------------- |
| closed adaptive round, not chatbot         | both briefs + product-loop figure | event challenge                                                                  | product strategy            |
| deterministic safety/action authority      | both briefs + safety figure       | OpenAI guardrail boundaries; clinical risk principles                            | architecture/tests          |
| one live quality-gated optical HR provider | execution brief + evidence figure | W3C capture specs; finger-PPG feasibility study; VitalLens provider/privacy docs | architecture/device gate/QA |
| physical phone + hosted HTTPS              | implied by browser capture        | W3C secure-context requirement                                                   | architecture/release plan   |
| one structured follow-up                   | PRD adaptive planner              | scope and reliability pressure test                                              | product cut line            |
| PostgreSQL, not deployed SQLite            | PRD persistence need              | Vercel durability guidance                                                       | architecture/orchestration  |
| bounded Realtime voice                     | voice/conversation requirement    | official Realtime/voice docs                                                     | architecture/tests          |
| synthetic FHIR adapter                     | PRD/FHIR architecture             | no live eMed API supplied                                                        | architecture/risks          |
| checkpointed exclusive worktrees           | user requirement                  | `orchestrate-worktrees` runbook                                                  | orchestration plan          |
| shadow mode before patient pilot           | clinical/ops ambition             | evidence/regulatory sources                                                      | production roadmap          |

## 11. Confidence and remaining uncertainty

High confidence:

- the product's core loop and judge-facing wedge;
- the need to reduce MVP to one sensor and one optional follow-up;
- deterministic safety and idempotent action boundaries;
- secure-context and physical-device requirements;
- the worktree ownership/merge architecture.

Medium confidence:

- reliability of local finger PPG and conditional VitalLens on the known iPhone 12 but unknown iOS/Safari version;
- event-time hosted/database setup;
- exact fictional protocol wording and task SLA;
- voice latency under venue conditions.

Unknown until the team/organizers answer:

- pre-build code rules;
- available devices, builders, platform accounts and clinical reviewer;
- private eMed/Eka interfaces or required sponsor integrations;
- exact submission/demo constraints beyond the public pages;
- eventual target jurisdiction and intended purpose.

These uncertainties are converted into explicit decision gates, risk triggers, fallbacks and production evidence requirements rather than silently assumed away.
