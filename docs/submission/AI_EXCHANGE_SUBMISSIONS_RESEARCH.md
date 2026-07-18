# AI Exchange submission research

Research captured on 18 July 2026 from the [AI Exchange submission gallery](https://www.aiengine.exchange/sessions/bc738437-ce78-41ed-a01d-975a713dad20/submissions), the submitted GitHub repositories, and the submitted demo links.

This document separates three evidence classes:

- **Submitted** — what the team wrote in the gallery.
- **Repository-backed** — functionality described by, or directly visible in, the submitted source repository.
- **Demo-observed** — functionality visible in the submitted video or live demo. YouTube transcripts were generated with YouTubeToTranscript and lightly normalised for whitespace; obvious transcription errors were retained unless they obscured meaning.

No medical or performance claim below has been independently clinically validated. No repository was cloned or executed locally during this review. Public repositories were inspected in GitHub, and live demos were used read-only without approving, sending, ordering, or deleting anything.

## At-a-glance comparison

| Project           | Core product idea                                                                                     | Repository status                          | Demo evidence                                                      | Most important prototype boundary                                                                         |
| ----------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Chrona            | Temporal knowledge graph for personal health context and causal-pattern exploration                   | Submitted URL returned GitHub 404          | No demo link in the submission                                     | Functionality could not be independently verified                                                         |
| CareLoad          | Turns fragmented care instructions and life constraints into one realistic, source-grounded care plan | Public, detailed Next.js/Prisma repository | YouTube walkthrough and transcript                                 | One synthetic patient, one active plan, simulated care-team response; no real EHR, auth, or clinician app |
| Aura / LifeOS     | Adaptive daily-care dashboard, future-scenario explorer, and clinician attention view                 | Public React/Vite repository               | Submitted Loom unavailable; repository-linked live build inspected | Shipped UI is a hard-coded simulation; no wired health-data or learning backend was observed              |
| CareBuddy         | Voice-first, multimorbidity-aware closed-loop care companion                                          | Public native iOS/Swift repository         | YouTube product-film transcript                                    | Seeded scenarios and fallbacks; HealthKit-compatible abstractions rather than live monitoring             |
| Gutsy / Me Med    | IBD companion with journalling, evidence, red-flag checks, and simulated care workflows               | Public React/FastAPI repository            | Live CloudFront app inspected                                      | External clinical, test, pharmacy, and fulfilment actions are explicit simulations                        |
| Ember / Companion | Quiet home monitoring with deterministic drift detection and a safety-evaluation pack                 | Public Python/FastAPI repository           | YouTube transcript                                                 | Hackathon safety artefact and local three-window demo, not a clinical product                             |
| Morning Rounds    | Deterministically narrows home-monitoring data into a ranked clinician queue                          | Public Next.js repository                  | Live Vercel app inspected                                          | Twenty seeded patients, no EHR/FHIR integration, no implemented learning loop, illustrative time savings  |

## 1. Chrona

**Team:** Team #12 · Chrona  
**Submitted stack:** Codex, Next.js, React, TypeScript, Bun, Tailwind CSS 4, shadcn/ui, OpenAI, AI Elements, Vercel AI SDK/Gateway, Neo4j, Parquet, DuckDB, Cytoscape.js, Docker  
**GitHub:** [github.com/arian88/chrona](https://github.com/arian88/chrona)  
**Demo:** No demo link was present in the submission modal.

### Submitted problem statement

When a health metric changes, the relevant context is usually scattered across different apps: sleep, meals, activity, symptoms, and sensor readings. Most tools chart one stream at a time, forcing people to reconstruct the preceding hours or days themselves. Personal patterns become difficult to verify, easy to misinterpret, and almost impossible to use proactively.

### Submitted description

Chrona transforms fragmented health data into a living temporal knowledge graph, where meals, sleep, activity, biomarkers, symptoms, photos, voice notes, and text become timestamped nodes connected by meaningful relationships. Its causal-reasoning AI compares repeated sequences, competing factors, and counterexamples to identify which events are most plausibly associated with later outcomes, such as a glucose spike or poor sleep. Every insight includes an evidence-strength score and can be traced through the graph, explored across similar historical episodes, and questioned through a contextual AI assistant.

### Repository and demo findings

The submitted GitHub URL returned a 404 page in the authenticated Chrome session. This may mean the repository is private, renamed, deleted, or the URL is incorrect. Because the submission contained no demo link, the claimed temporal graph, causal comparison, evidence scoring, ingestion paths, and contextual assistant could not be independently verified.

## 2. CareLoad

**Team:** Team #14 · CareLoad  
**Submitted stack:** Next.js, React, TypeScript, Tailwind CSS, Prisma, SQLite, Node.js, ElevenLabs, OpenAI, Codex  
**GitHub:** [github.com/Bividib/CareLoad](https://github.com/Bividib/CareLoad)  
**Demo:** [YouTube](https://www.youtube.com/watch?v=Bt0LcxpqTDE)

### Submitted problem statement

People living with chronic conditions are expected to manage a large amount of care outside the clinic: understanding medical documents, remembering medications and monitoring tasks, fitting them around work and family, noticing changes in symptoms, and knowing when to contact their care team. These instructions are often fragmented across letters, medication lists and appointments, while traditional reminder apps treat them as isolated tasks rather than one changing care plan. This burden can lead to confusion, missed tasks and silent disengagement from treatment. The submission cites a US study of 125,474 adults beginning GLP-1 treatment in which 46.5% of participants with type 2 diabetes discontinued within one year. It argues that treatment is not merely forgotten; it can become difficult to understand, demanding to maintain, poorly adapted to everyday life, and isolating.

> The gallery's stored problem-statement text ends mid-sentence after “could benefit from a st”. The ending was not reconstructed.

### Submitted description

CareLoad is an AI-assisted care-planning platform designed to make chronic-condition management easier to understand, organise and sustain. Patients can upload clinical documents, connect health information and describe their daily routines. CareLoad extracts source-grounded care tasks, verifies where each instruction came from and uses a deterministic scheduler to build a realistic plan around work, family and other commitments.

Patients can complete daily voice or text check-ins, answer focused follow-up questions and share significant changes with their care team. When new clinical instructions or life activities are added, CareLoad stress-tests the plan, identifies conflicts and proposes safe timing adjustments without changing medical instructions or activating updates without patient approval.

The platform also includes peer matching, connecting patients with fictional profiles based on similar treatment experiences to reduce isolation and encourage continued engagement with care. OpenAI supports structured document and symptom interpretation, ElevenLabs provides speech-to-text, and the scheduling logic remains transparent, deterministic and source-grounded.

### Repository-backed functionality

The repository is a substantial mobile-first, patient-only Next.js prototype centred on one fictional patient, Eleanor Reed. It contains application, domain, fixture, Prisma, test, and demo-control areas. The documented implementation includes:

- synthetic clinical-document extraction into a source-grounded **Care Work Graph**;
- a **Life Map** of the patient's daily constraints;
- deterministic scheduling and replanning using predefined, verified task templates;
- Prisma/SQLite persistence that survives refreshes;
- daily voice or text signals, structured follow-up questions, and candidate observations;
- one synthetic cardiology update that is stress-tested against the existing plan;
- a proposed care-plan update that remains inactive until patient acceptance;
- delayed, idempotently processed simulated responses;
- fictional peer matching;
- a fixture mode that preserves the same UI and state transitions without an API key;
- optional server-only OpenAI structured extraction/audio transcription. The model reads language and drafts candidate observations but does not schedule care or set clinical constraints.

The prototype is intentionally limited to one patient, one active plan, one synthetic update, patient-facing screens, local persistence, and simulated messaging. The repository explicitly says there is no real authentication, EHR connection, clinician application, emergency workflow, production privacy control, or support for real medical information.

### Demo-observed walkthrough

The video calls the product **Calliope** at the start, but later refers to **CareLoad**. The walkthrough shows clinical-document extraction, routine capture, a generated weekly plan, a daily symptom signal, tailored follow-up questions, a simulated clinician response, a patient-approved plan update, and fictional peer matching.

### Normalised YouTube transcript

> Calliope is a mobile AI-assisted planner for patients with long-term chronic conditions. It accepts clinical documents and personal data to create a variable plan around day-to-day life. First, we can extract medical documents that could be given to us through our clinicians. We can also speak through what our day-to-day life is so that we can improve the overall planning. We press continue and start extracting the data, and it figures out what our care tasks are. If this looks okay, it understands my personal routine. As a result, it bundles everything together into a routine for every single day for you to approve.
>
> We are now in the dashboard for Eleanor, and this is our routine for today on Saturday. We can view the medical plan across the whole week as well. Every day has a slightly different plan.
>
> There is also a feature called the daily signal. We can log how we are feeling every day using speech or text. Here I am talking about my stomach not feeling too well, although I am still eating and drinking. Calliope understands that I have a stomach problem and asks two tailored follow-up questions. Reviewing and approving the answers suggests that the problem should be raised with our clinician, so we send an update. This is automated for us.
>
> We would asynchronously get a reply from our clinician. In this case it is simulated after around ten seconds. It suggests that we do an extra blood-pressure check every evening. This updates the existing care plan. We can preview the dates and times, and if we accept the plan it is integrated into the regular evening routine.
>
> Long-term treatment is not only a scheduling problem but also a human one. CareLoad includes matching, connecting patients with someone who has reported similar experiences and may be slightly further along in treatment. It gives an informal source of support alongside clinical care. In a real system this would be monitored. Revealing our daily match gives us Marcus, who has gone through a similar process, to motivate us to continue with long treatments.

## 3. Aura / LifeOS

**Team:** Team #35 · AuraCare  
**Submitted stack:** React, TypeScript, Vite, HTML/CSS, Node.js, Express.js, Vercel  
**GitHub:** [github.com/MurtuzaQuantumCoder/Lifeos-aura](https://github.com/MurtuzaQuantumCoder/Lifeos-aura)  
**Submitted demo:** [Loom](https://www.loom.com/share/8467b94de92049dab94256f269d492bd)  
**Repository-linked live build:** [Aura Care](https://files-mentioned-by-the-user-role-liard.vercel.app)

### Submitted problem statement

Millions of people living with chronic conditions such as obesity, type 2 diabetes, and cardiovascular disease struggle with fragmented healthcare, low medication adherence (the submission states an industry average of 40–60%), and limited support between clinical visits. Current healthcare systems remain reactive, addressing problems after they occur rather than helping patients proactively manage health every day. Existing health apps often provide generic tracking tools but fail to understand individual lifestyles, behaviours, and evolving health signals, which the submission says contributes to poorer outcomes, preventable complications, and greater burden on patients and providers.

### Submitted description

LifeOS is an AI-powered health operating system designed to transform chronic-disease management from reactive care into proactive daily support. Powered by Aura AI, it acts as a companion throughout a patient's health journey, helping users understand health data, improve medication adherence, receive personalised coaching, interpret biomarkers, and maintain connection with healthcare teams. The submission says LifeOS learns from patient behaviour, adapts recommendations to individual needs, and turns complex health information into simple, actionable guidance.

### Repository-backed functionality

The repository contains a React/Vite single-page application with dashboard, clinician, and shared components. The application entry point hard-codes a seven-day story for a fictional user, Jordan Miller, and hard-codes scenario outputs for routine, exercise, weight loss, short sleep, travel, and adherence. Navigation and scenario changes are implemented with local React state.

The shipped `package.json` contains Vite, React, ReactDOM, Lucide, and Tailwind dependencies and only Vite development/build/preview scripts. Although `server/` directories exist in the repository, no Express dependency or server start script is present in the shipped package, and the main application uses local arrays and fixed values rather than a wired data/AI service. The observed build is therefore an interactive UI simulation, not evidence of live health-data ingestion, behavioural learning, biomarker interpretation, care-team connectivity, or autonomous clinical decision-making.

### Demo-observed functionality

The submitted Loom link displayed “Loom is running a bit slower than usual” and could not be watched. The live build linked from the repository was available and showed:

- a landing page and seven-day adaptive-care story;
- selectable days with fixed sleep, steps, glucose, stress, and context values;
- a “Why this plan?” explanation panel and fixed confidence score;
- a timeline of simulated observations and plan adjustments;
- a **Future Twin** slider comparing fixed current-path values with an “Aura optimized” path for glucose, weight, cardiovascular risk, and kidney function;
- an **Aura Copilot** clinician view with fixed totals (842 patients, 836 managed by Aura, five needing review, one urgent) and three static attention-queue examples.

No video transcript was captured because the submitted demo was Loom rather than YouTube and the Loom page was unavailable during the review.

## 4. CareBuddy

**Team:** Team #16 · Ali NJFZ  
**Submitted stack:** Native iOS, Swift, SwiftUI  
**GitHub:** [github.com/alinjfz/carebuddy](https://github.com/alinjfz/carebuddy)  
**Demo:** [YouTube](https://youtu.be/xR81ILuRoUI)

### Submitted problem statement

People living with multiple chronic conditions must manage blood-pressure readings, glucose measurements, symptoms, medications, and lifestyle tasks at home. Existing apps commonly track one condition, display more data, or give advice once and stop. The patient is left to decide what matters, how conditions interact, and whether the advice worked. Clinical teams cannot continuously monitor every stable patient, creating either alert noise or late discovery of deterioration. The missing layer is one safe next action that reflects the patient's complete context, followed through to an outcome with selective clinician involvement when human judgement is genuinely required.

### Submitted description

CareBuddy is a voice-first, multimorbidity-aware chronic-care companion that closes the care loop. Its seeded prototype follows Sara, a fictional 58-year-old with type 2 diabetes, hypertension, and early chronic kidney disease. Sara speaks naturally; CareBuddy creates structured candidate information and asks her to confirm exactly what it heard before saving anything.

Confirmed observations are combined with measurement quality, symptoms, medication timing, personal targets, kidney context, and recent trends. A deterministic care engine selects one governed next action. AI may explain that action in accessible language but cannot diagnose, prescribe, alter medication, or choose an escalation level. CareBuddy creates a follow-up, closes resolved loops quietly, and prepares a verified evidence brief for clinician review when a problem remains unresolved. A family view receives reassurance without unnecessary clinical detail. The workflow is **Observe → Verify → Interpret → Act → Follow up**.

### Repository-backed functionality

The public repository is a native iOS Xcode project, almost entirely Swift, with SwiftUI patient, family, and clinician experiences. Its documented implementation includes:

- SwiftData models for profiles, observations, care loops, and review events;
- a seeded Sara profile and one-tap stable, check, unresolved, approved, urgent, and offline scenarios;
- voice extraction followed by explicit patient confirmation;
- measurement-quality and multimorbidity context;
- deterministic verification and escalation rules;
- one governed next action and tracked follow-up state;
- concise clinician briefs and clinician approve/edit/send flow;
- a privacy-reduced family reassurance view;
- optional OpenRouter extraction/explanation with schema validation and deterministic cached fallbacks;
- HealthKit-compatible abstractions using fully seeded demo data rather than live monitoring.

The repository was inspected but the iOS app was not built or run in this review.

### Normalised YouTube transcript

> Most health applications stop at advice. They tell someone to repeat a measurement, remember medication, or contact a clinician, then consider the job complete. The patient goes back to life and the clinician sees nothing unless things get worse. For someone managing several conditions, one reading can mean different things depending on symptoms, medication timing, targets, and trends. The missing product is not another dashboard. It is an AI system that stays with the problem until it is resolved.
>
> This is CareBuddy, a voice-first chronic-care companion that closes the care loop. Meet Sara. She is 58 and lives with type 2 diabetes, hypertension, and early chronic kidney disease. One morning she says, “I feel dizzy. My blood pressure was 158/94, and I took my tablets late.” CareBuddy structures her words and shows exactly what it heard. Nothing is saved until she confirms it.
>
> The system checks measurement quality, symptoms, medication timing, personal targets, kidney context, and recent trends. It does not diagnose, change medication, or create multiple warnings. It gives one safe action: sit safely, repeat the measurement correctly, and report whether the dizziness improves. The job is not finished when advice appears. CareBuddy creates a follow-up and waits for the result. If Sara improves, the loop closes quietly.
>
> If the repeat remains elevated and she is still dizzy, CareBuddy recognises that the first action failed. It prepares a concise clinical brief containing only verified evidence: what changed, Sara's cross-condition context, what she tried, and why the issue remains unresolved. Her clinician reviews one meaningful exception instead of another dashboard, then edits or approves the next message. Sara receives a clear instruction and CareBuddy follows the outcome until resolution.
>
> Sara's family receives reassurance that her care team reviewed a change without seeing raw measurements or private notes. A deterministic care engine verifies data, applies personalised thresholds, selects actions, controls escalation, and tracks resolution. The language model structures Sara's voice, asks for missing context, explains the governed action, and drafts the clinical summary. It cannot diagnose, prescribe, change a medication dose, or decide its own escalation level. Stable patients remain supported at home and clinical teams see unresolved cases where human judgement adds value. CareBuddy does not stop at advice; it closes the care loop.

## 5. Gutsy / Me Med

**Team:** Team #31 · Tardigraders  
**Submitted stack:** React, TypeScript, FastAPI, Python, Runware SDK, AWS  
**GitHub:** [github.com/MJ141592/emedhackathon](https://github.com/MJ141592/emedhackathon)  
**Demo:** [Live CloudFront app](https://d1baj8g2iu1bov.cloudfront.net/)

### Submitted problem statement

Inflammatory bowel disease is often diagnosed in the late teens or early twenties, when a lifelong diagnosis can threaten identity, relationships, and life plans. The submission states that around half a million people in the UK live with IBD and argues that disengagement is especially damaging in the early days of a flare, when calprotectin testing and prompt treatment can change the trajectory. Late detection can lead to hospital admission and long-term bowel damage. The team sees an opportunity in a young, disengaged, but technologically forward patient group that may engage through a different channel.

### Submitted description

The gallery calls the project **Gutsy**, while its description calls the product **Me Med**. It is positioned as an AI companion for people with IBD that tracks symptoms to catch flares early. A chat/voice assistant supports conversations about bowel habits, bleeding, and personal life, explains health information, and combines meals, bowel movements, pain, fatigue, resting heart rate, and sleep against a personal baseline.

The submitted vision progresses from monitoring to support, home calprotectin test fulfilment, communication with an IBD service, clinician-owned acute treatment, pharmacy readiness, steroid taper support, and learning a more useful baseline after recovery.

### Repository-backed and demo-observed functionality

The public repository and live app are the most feature-complete submission reviewed. The live demo loaded an encrypted synthetic record for Matthew Johnson and exposed the following working surfaces:

- adult onboarding/profile and personal IBD baseline;
- a correctable journal for bowel movements, meals, pain, fatigue, wellbeing, life events, medicines, wearable signals, and test results;
- a Penny chat with typed input, optional voice notes, correction/deletion, source labels, and deterministic fallback behaviour;
- four explicit demo presentation states: **Steady, Watchful, Flare, Recovery**;
- a deterministic urgent-wording/red-flag path outside the conversational model;
- a **Trends & evidence** ledger built from included records, with correct/exclude controls and no filling of missing values;
- possible-pattern labels separated from recorded facts and general information;
- patient confirmation before a governed Watchful state;
- an editable/exportable clinician summary;
- a simulated, nine-step calprotectin test-order/fulfilment workflow;
- a patient-approved clinician-message draft and response-time context;
- a clinician-owned prescription pathway and a locked 42-day taper review;
- a deterministic safety checklist separate from Penny;
- experiment candidates, wearable controls, privacy/export/deletion controls, and audit history.

The architecture combines a React/TypeScript frontend, live session memory, a FastAPI domain API, encrypted local-development SQLite persistence, deterministic safety/lifecycle rules, audit revisions, and optional Runware adapters. Typed capture, evidence, trends, care workflows, taper support, experiments, persistence, privacy, and export work without a Runware key. Every order, delivery, laboratory, clinician, pharmacy, prescription, wearable, or message step is explicitly simulated; no real external service is contacted.

Because the submitted demo is a live application rather than a video, there is no YouTube transcript. The observations above come from the loaded Watchful home view, Trends & evidence dialog, and Care dialog. No confirmation, order, send, export, correction, exclusion, or delete action was executed during this review.

## 6. Ember / Companion

**Team:** Team #24 · MedBuddy  
**Submitted stack:** Python 3, FastAPI, Uvicorn, asyncio, httpx, PyYAML, vanilla HTML/CSS/JS, Web Speech API fallback, swappable OpenAI-compatible endpoints  
**GitHub:** [github.com/astrolabe-crypto/medical-pa-hackathon](https://github.com/astrolabe-crypto/medical-pa-hackathon)  
**Demo:** [YouTube](https://youtu.be/OMXcPRwQ5cQ)

### Submitted problem statement

Heart failure and other chronic conditions often decompensate over days in the patient's home. The submission's fictional example is Margaret, 74, who lives alone, gains weight over three days, starts sleeping upright, and is unlikely to call because she does not want to be a fuss. The team argues that simply placing an LLM in the home is unsafe because patients may understate symptoms, models may agree with minimisation, a missed escalation is a harm event rather than a low benchmark score, and model non-determinism is a safety concern. The problem is therefore two-sided: catch quiet deterioration and produce safety evidence before the product exists.

### Submitted description

Ember begins with a **Gate 0 evidence pack**: 48 clinically grounded synthetic scenarios across reassure, routine, urgent, ambiguous/defer, sycophancy, and atypical-presentation categories. Scenarios are run through model modes repeatedly and judged against hard gates for under-triage, patient push-back, missed deferral, and urgent-case variance.

The device concept is a push-to-talk kiosk that reuses the evaluated routing code. A deterministic drift engine—not an LLM—detects a configured weight change. It speaks first, tells Margaret that her nurse has been informed, places a scrubbed evidence payload and rule trace in a nurse queue, and returns the nurse's callback confirmation to the home device.

### Repository-backed functionality

The repository is a Python/FastAPI safety-evaluation and local-demo artefact named **Companion**. It contains:

- plain-code red-flag, ambiguity, medication-change, and safety-floor guardrails;
- pre- and post-model enforcement so an LLM may add caution but cannot downgrade the deterministic floor;
- a three-window local demo: resident face, nurse queue, and evidence page;
- optional Anthropic/ElevenLabs support with mock mode when keys are absent;
- local JSONL audit logging for urgent/deferred events;
- a 48-scenario × five-repeat Gate 0 evaluation harness, hard safety gates, readability checks, and reproducible reports;
- a repository claim of 131 passing tests, which was not independently rerun in this browser-only review.

The repository explicitly calls itself a hackathon prototype and safety-evaluation artefact, not a clinical product, diagnosis service, or substitute for emergency care, clinical safety sign-off, or medical-device regulation.

### Normalised YouTube transcript

> Margaret is 74. She has heart failure, she lives alone, and she would very much like to keep it that way. It watches her weight, blood pressure, and sleep, and for 13 days it says nothing at all. Most days nothing is wrong. That's the hard part: a system that cries wolf gets switched off by Tuesday.
>
> Then her weight starts to climb—2.3 kilos in three days, past the threshold the guidelines specify. This is not the model having a hunch. It is arithmetic, and it can be audited. What leaves the house is not a recording of her life. It is one clinical summary, and it goes to a nurse who decides—not the AI, the nurse. When Margaret says it is probably nothing, the system does not simply agree with her. At 9:15 the next morning, her nurse rings. Nobody had to notice in time. Something already had.

## 7. Morning Rounds

**Team:** Team #42 · JustAsh  
**Submitted stack:** Next.js 16, React 19, TypeScript, Tailwind CSS v4, shadcn/ui, Vercel AI SDK, OpenAI, Zod  
**GitHub:** [github.com/aswin-giridhar/morning-rounds](https://github.com/aswin-giridhar/morning-rounds)  
**Demo:** [Live Vercel app](https://morning-rounds-ten.vercel.app/)

### Submitted problem statement

Chronic care runs on appointments, but risk happens between them. A clinician cannot review every patient's home data each morning, so important signals may be missed: silent GLP-1 discontinuation, multiple individually sub-threshold metrics drifting together, or a mismatch between reported medication-taking and physiology. The submission argues that clinician attention—not data—is the scarce resource, and the product should decide who deserves a human today.

### Submitted description

Morning Rounds watches at-home data overnight. When something shifts, it opens a short, warm patient conversation and converts a pool of twenty patients into a ranked queue of six who need a clinician. Each queue item contains the gathered context and a drafted message for approval.

The submitted examples are Marcus's six days of silence after stopping a GLP-1 because of nausea, Aisha's reported adherence alongside rising glucose and newly discovered steroid use, and Elena's simultaneous heart-rate/glucose drift below individual thresholds. The model does not touch measurements; deterministic rules perform detection, the model handles conversation, and every outbound message requires clinician approval. The submission explicitly states that all patient data is synthetic, there is no EHR integration, the queue does not learn from dismissals, and the time-saved figure is illustrative.

### Repository-backed functionality

The repository contains:

- twenty synthetic patients generated from a seeded PRNG;
- deterministic signal detection in `src/lib/detect.ts`;
- an agent API using the Vercel AI SDK and structured Zod output;
- a Next.js clinician queue and patient-detail UI;
- pre-baked conversations and briefings that keep the demo functional without an OpenAI key;
- optional “Regenerate with AI” behaviour when a key is configured;
- human approval for every outbound message;
- explicit limitations: no EHR/FHIR integration, no implemented learning-from-calls loop, and illustrative time-saved estimates.

### Demo-observed functionality

The live app showed a fixed morning queue: **20 monitored overnight → six needing attention**. It displayed urgent/watch cases for response discordance, hypoglycaemia risk, disengagement, rising heart rate, weight regain, and multi-system drift. Each patient card showed deterministic “why” evidence, thirty-day synthetic charts, an earlier agent/patient conversation, a clinician brief, and an editable draft with an **Approve & send** control.

Three detail views were inspected without sending anything:

- **Aisha:** rising seven-day mean glucose despite reported doses; the conversation discovers GP-prescribed steroids and drafts a same-day clinician check-in.
- **Marcus:** six days of silence after stopping semaglutide because of nausea and shame; the conversation reframes the pause and drafts a low-pressure re-entry call.
- **Elena:** heart rate and glucose drift together below their individual thresholds; the conversation elicits nocturnal palpitations and drafts a clinician review rather than diagnosing.

Because the submitted demo is a live application rather than a video, no YouTube transcript exists. The live text above provides the equivalent walkthrough evidence. The **Approve & send**, **Regenerate with AI**, and **not now** controls were not used.

## Cross-submission observations

1. **Deterministic authority is a common design choice.** CareLoad, CareBuddy, Gutsy, Ember, and Morning Rounds all explicitly keep consequential scheduling, safety, escalation, or detection logic outside the language model.
2. **Most prototypes are intentionally synthetic and seeded.** This improves demo reliability but means claims about integrations, personalisation, learning, and continuous monitoring should not be inferred from the demo alone.
3. **CareLoad and Gutsy expose the broadest end-to-end patient workflows.** CareLoad focuses on workload compilation and replanning; Gutsy focuses on IBD evidence, simulated fulfilment, and governed care transitions.
4. **CareBuddy and Morning Rounds are the clearest closed-loop designs.** CareBuddy tracks one action to resolution across patient/family/clinician roles; Morning Rounds optimises the clinician's attention queue and message-approval workflow.
5. **Ember is differentiated by pre-product safety evidence.** Its centre of gravity is the Gate 0 evaluation harness and deterministic safety floor rather than feature breadth.
6. **Aura has the largest gap between submitted intelligence claims and observed implementation.** The live interface is polished and interactive, but its data, predictions, confidence values, patient totals, and care queue are hard-coded in the shipped client.
7. **Chrona could not be verified.** The repository link returned 404 and the submission provided no demo.
