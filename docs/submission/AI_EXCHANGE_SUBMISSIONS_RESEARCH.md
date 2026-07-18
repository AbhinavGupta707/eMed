# AI Exchange submission research

Research captured on 18 July 2026 from the [AI Exchange submission gallery](https://www.aiengine.exchange/sessions/bc738437-ce78-41ed-a01d-975a713dad20/submissions), the submitted GitHub repositories, and the submitted demo links.

The gallery was reloaded during the final pass and contained **42 submissions in total**. Sections 13–42 document the 30 entries added after the first two research passes.

This document separates three evidence classes:

- **Submitted** — what the team wrote in the gallery.
- **Repository-backed** — functionality described by, or directly visible in, the submitted source repository.
- **Demo-observed** — functionality visible in the submitted video or live demo. YouTube transcripts were generated with YouTubeToTranscript and lightly normalised for whitespace; obvious transcription errors were retained unless they obscured meaning.

No medical or performance claim below has been independently clinically validated. No repository was cloned or executed locally during this review. Public repositories were inspected in GitHub, and live demos were used read-only without approving, sending, ordering, or deleting anything.

## At-a-glance comparison

| Project           | Core product idea                                                                                     | Repository status                          | Demo evidence                                                      | Most important prototype boundary                                                                           |
| ----------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Chrona            | Temporal knowledge graph for personal health context and causal-pattern exploration                   | Submitted URL returned GitHub 404          | No demo link in the submission                                     | Functionality could not be independently verified                                                           |
| CareLoad          | Turns fragmented care instructions and life constraints into one realistic, source-grounded care plan | Public, detailed Next.js/Prisma repository | YouTube walkthrough and transcript                                 | One synthetic patient, one active plan, simulated care-team response; no real EHR, auth, or clinician app   |
| Aura / LifeOS     | Adaptive daily-care dashboard, future-scenario explorer, and clinician attention view                 | Public React/Vite repository               | Submitted Loom unavailable; repository-linked live build inspected | Shipped UI is a hard-coded simulation; no wired health-data or learning backend was observed                |
| CareBuddy         | Voice-first, multimorbidity-aware closed-loop care companion                                          | Public native iOS/Swift repository         | YouTube product-film transcript                                    | Seeded scenarios and fallbacks; HealthKit-compatible abstractions rather than live monitoring               |
| Gutsy / Me Med    | IBD companion with journalling, evidence, red-flag checks, and simulated care workflows               | Public React/FastAPI repository            | Live CloudFront app inspected                                      | External clinical, test, pharmacy, and fulfilment actions are explicit simulations                          |
| Ember / Companion | Quiet home monitoring with deterministic drift detection and a safety-evaluation pack                 | Public Python/FastAPI repository           | YouTube transcript                                                 | Hackathon safety artefact and local three-window demo, not a clinical product                               |
| Morning Rounds    | Deterministically narrows home-monitoring data into a ranked clinician queue                          | Public Next.js repository                  | Live Vercel app inspected                                          | Twenty seeded patients, no EHR/FHIR integration, no implemented learning loop, illustrative time savings    |
| Alaga             | Family-centred care intelligence built from wearable signals, check-ins, and a shared care circle     | Public Python/FastAPI repository           | No demo link in the submission                                     | Broad local prototype; medication, memory, messaging, and Garmin flows depend on configured integrations    |
| Darwin            | Research-cited wearable-risk predictions paired with a callable AI health guardian                    | Public FastAPI/React repository            | YouTube walkthrough and transcript                                 | Synthetic research prototype and not a medical device; prediction and action claims require validation      |
| Threads           | Multilingual longitudinal patient story and evidence-backed pre-appointment brief                     | Public Next.js repository                  | Loom walkthrough and transcript                                    | Live speech transcription is not implemented in the repository; several integrations are simulated          |
| eHome             | Privacy-preserving passive home sensing with identity-aware drift detection and clinician SBAR        | Public Next.js repository                  | Live Vercel app inspected                                          | Entire experience is synthetic and deterministic; no live sensing, LLM, authentication, or diagnosis        |
| Loop              | Policy-driven diabetes follow-up across Telegram, patient tracker, and a clinician dashboard          | Public React/Supabase dashboard repository | Submitted Google Drive folder was empty                            | Repository contains the read-only dashboard, while the patient bot lives in external OpenClaw configuration |

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

## 8. Alaga

**Team:** Alaga  
**Submitted stack:** Python 3.11, FastAPI, SQLite, Garmin Connect, Claude, ElevenLabs, Twilio WhatsApp, Weather API, HTML/CSS/JavaScript  
**GitHub:** [github.com/lauriecelldu-trading/Alaga](https://github.com/lauriecelldu-trading/Alaga)  
**Demo:** No demo link was present in the submission modal.

### Submitted problem statement

Illness is carried by a household. Chronic illness is managed at home, but healthcare usually watches only the patient while family members carry care without a shared view. A daughter still has to text, “Dad, did you take your medication?” because no system answers her. The submission grounds this problem in the creator's father collapsing from heat stroke and lying alone for hours before anyone knew. It argues that remote monitoring serves hospitals, reminder apps nag patients, and wearables have strong sensors but little emotional intelligence. Families do not need more raw data; they need fewer worries and a better-balanced circle of care.

### Submitted description

Alaga means “to care for someone” in Filipino. The product combines Garmin sleep, heart rate, movement, Body Battery, stress, and heat signals with family check-ins. Its Care Intelligence layer is intended to turn those signals into calm WhatsApp alerts for a family care circle rather than a stream of clinical-looking data.

The submission describes a Daily Story, a Care Drift Score measured against the person's own recent normal, family voice notes in a Memory Bank, daily check-ins spoken in a known voice, heat-risk detection, morning and evening digests, and an on-demand WhatsApp AI carer. Clinical decisions remain with clinicians.

### Repository-backed functionality

The public repository has a FastAPI/SQLite backend and separate landing, dashboard, patient, demo, and support pages. Its backend includes modules for care intelligence, care-load allocation, family-circle alerts, digests, drift, Garmin polling, a signal engine, voice companionship, weather, WhatsApp chat, and memory storage.

The application routes and schedulers implement or scaffold:

- patient readings, a generated care message, and WebSocket event updates;
- three persisted daily medication slots with confirmation;
- memory audio upload into a local static uploads directory and optional playback events;
- journal entries, family tasks, circle members, care-load summaries, and weekly care-load checks;
- morning/evening digests and scheduled check-ins;
- Garmin status, polling, reconnection, and demo scenarios for poor sleep, heat risk, low movement, and wake events;
- a Twilio inbound WhatsApp webhook and a forced Care Intelligence composition route.

The repository has only two commits and no README. Its technical specification is specifically for a React/Vite/Three.js marketing landing page, whereas the inspected backend is a broader Python application. Live Garmin, Twilio, Claude, ElevenLabs, and weather behaviour depends on external configuration and was not executed in this review. Although memory uploads are implemented, the repository stores the uploaded audio locally; that retention behaviour would need an explicit privacy review before any real-world use.

No submitted demo was available, so there is no transcript or demo-observed evidence for Alaga.

## 9. Darwin

**Team:** Darwin  
**Submitted stack:** FastAPI, PostgreSQL, Redis, LightGBM, Modal, OpenAI Realtime and Whisper, DeepSeek, Twilio, Stripe, React, Vite, Tailwind CSS, Framer Motion, Docker  
**GitHub:** [github.com/londrwus/darwin-health-guardian](https://github.com/londrwus/darwin-health-guardian)  
**Demo:** [YouTube](https://youtu.be/ZcdbwPWgvtk)

### Submitted problem statement

Phones and wearables already record heart rate, sleep, breathing, and movement, but early-warning signals often remain unread. Most health applications are passive dashboards rather than systems that notice a change and help the person act on it. The submission says Darwin's rule base was developed from more than 500 research papers.

### Submitted description

Darwin imports Apple Health, Oura, and Whoop data and produces research-cited predictions across sixteen health areas relative to a personal 90-day baseline. The submission claims predictions run in under 100 milliseconds and combines deterministic research rules with LightGBM corroboration.

Darwin also has a phone number. It can make and receive calls, summarise them, produce an SBAR-style record, and expose voice actions such as ordering a test kit, generating a GP letter, creating a calendar invite, or building a weekly plan. Its safety framing says the system never diagnoses, refuses prescription-only-medicine requests, and gives a scripted 999/111 response for emergencies.

### Repository-backed functionality

The public repository is a substantial FastAPI/React research prototype with application, contracts, sample data, demo fixtures, models, training code, tests, documentation, and deployment configuration. Its README describes:

- Apple Health, Oura, Whoop, and seeded-demo import paths;
- sixteen prediction areas evaluated against a 90-day baseline, with a documented target of roughly 60 milliseconds;
- research-linked deterministic rules and a LightGBM layer that may raise risk only when corroborated;
- a Twilio-to-OpenAI-Realtime voice-agent architecture with barge-in, tools, post-call summaries, and SBAR output;
- optional test-kit checkout, GP PDF, calendar, inbox, and weekly-plan actions;
- a deterministic transcript scanner that escalates red-flag language;
- sixteen seeded synthetic people with 300 days of data;
- a model-card route and an explicit statement that this is a prototype, not a medical device.

There is a source discrepancy in the evidence count: the gallery says more than 500 papers, while the repository README says a rule set from more than 150 papers. The repository uses synthetic labels and the prediction quality, latency, integrations, and medical claims were not independently executed or validated in this review.

### Demo-observed walkthrough

The video shows registration with a phone number, simulated Apple Health/Apple Watch import, a dashboard flagging elevated resting heart rate, a three-month usual range, an AI explanation, sleep planning, and a live incoming Darwin call. During the call, the presenter asks Darwin to order vitamin D; the assistant says it has placed the order and a payment link then appears in the application's chat history. The video does not establish fulfilment beyond the demonstrated application state.

### Automated YouTube transcript

> Hi everyone. Today, I going to present you my project Darwin. So, what is the Darwin about? Let me tell me about wearable information. Every one of us carries a phone with us. Quite records our heart rate, sleep, breathing, and walking. It can be either our this iPhone, Apple Watches, Loop, and so on. However, nobody reads almost it. Millions of early warnings die in the data every year. However, Darwin reads it. It's an AI health guardian that transforms existing variable data into research-cited predictions about variable health and cardiac. And here's what it makes it different. Darwin has a phone number. So, it calls you not like an atypical AI chatbot. And it asks, orders doctors, creating doctor letters, plan, and all this by voice. Not a chatbot in app.
>
> Okay, let me introduce the app. So, you have the registration. I'll make it faster. My phone number. And that's it. Right now, I going to import the data from my phone and Apple Watch. And the layer of predictions will predict this. And the layer of prediction it has about 500 research papers analyzed. Uh everything in as it's going to predict. Uh what's the data like data warnings.
>
> So, right now as you can see in the today, today I had resting heart rate averaging so more than usual. See what to do. Next visit. Uh also night time rhythm app. And so and so on. It has a clean staying connect short rhythm and so on. I'll go to timeline. As you can see, resting heart rate it's also was flagged in the timeline. And I can see in the past 3 months usual range. And I ask can ask the AI chatbot, why did you flag my heart rate, right? And it will give you the answer. Let's get sleep sleep plans like a lot of data. It's creating uh a plan for you. Uh As you can see, everything.
>
> And we can call Darwin right now. And let me tell you from my phone number. So, as you can see, I'm on that page, calling. Oh, someone is calling me. As you can see, okay.
>
> “Have a trial with Darwin. This is Darwin, your AI health assistant. Just so you know, this call is recorded to help summarize your care. How can I help today?”
>
> “Hi Darwin, can I order vitamin D? Can you order the this for me?”
>
> “I sent that to your Darwin app. You'll see it. I've placed the order for vitamin D, and you'll find the payment link in your Darwin app. Once you complete the payment, it'll be on—”
>
> “Okay, thank you. But hey, can you tell me the current time?”
>
> “Sure. The current time is—”
>
> Oh, yeah. Bye. So, I also demonstrated how it handles the things about uh interacting with the calls, and also here's my chat history. Also the link. Pay now. Enter by. Also, it would be great if I swipe link. Thank you. Have a nice day.

> This is an automated transcript. Obvious speaker changes were formatted for readability, but imperfect wording was retained rather than silently reconstructed.

## 10. Threads

**Team:** Threads  
**Observed stack:** Next.js, React, TypeScript, Supabase, Gemini, Runware  
**GitHub:** [github.com/builtbydans/ReimagineHack](https://github.com/builtbydans/ReimagineHack)  
**Demo:** [Loom](https://www.loom.com/share/82119fcf832b4334bc4ca2c61506cf15)

### Submitted problem statement

Healthcare is organised around episodic appointments while illness is continuous. Symptoms, medication effects, life impact, and previous encounters become scattered, so patients repeatedly reconstruct their history and clinicians begin consultations without enough context. This is especially difficult when the patient's preferred language is not English.

### Submitted description

Threads is a longitudinal, evidence-backed health story. Patients can provide written or multilingual voice updates, including Urdu; the system is intended to transcribe and translate them while preserving the original evidence. Gemini summarises the Supabase history into a clinician pre-appointment brief. An **Ask Thread** interface answers questions from the stored record with visible sources and is explicitly intended to organise evidence rather than diagnose or recommend treatment.

### Repository-backed functionality

The public Next.js repository is built around a seeded synthetic patient, Amina Khan, age 32, with endometriosis. It includes:

- patient home, timeline, update, appointment-preparation, and sharing/export surfaces;
- written updates and browser `MediaRecorder` capture with local persistence;
- a clinician appointment list, pre-appointment brief, evidence counts, and exact-source views;
- fifteen seeded events from April to July 2026;
- Supabase-aware data access with deterministic and browser-local-storage fallbacks;
- API routes for patient updates, transcription, synthetic encounter import, and appointment briefs;
- Gemini-generated summaries when a key is available, with a deterministic fallback otherwise.

The repository does **not** currently implement the claimed live Runware speech-to-text integration. The Runware code path deliberately returns an unsupported-integration response until a supported transcription contract is confirmed; without it, the demo uses a seeded Urdu/English transcript. Authentication, identity, consent, roles, row-level security, and production governance are also absent. Encounter import and sharing are simulations, translation confidence is illustrative, source audio is not shipped, and the trend charts represent reported values only.

### Demo-observed walkthrough

The 3:23 Loom video, titled **Thread Unifies Patient Health History Continuously**, shows a prerecorded Urdu sample, an original Urdu transcript and English translation, a saved timeline event, a clinician pre-appointment summary, and a sourced follow-up answer. The narration calls the patient both “Ameen” and “Amina” and refers to Supabase as “Superbase.” It also states that Runware transcribes the recording, which is not supported by the inspected implementation.

### Automated Loom transcript

> **0:00** Healthcare sees patients in appointments. Some of these patients don't have English as their first language. These patients still experience illnesses every day between those appointments.
>
> **0:13** Thread is an always-on health context layer that turns those disconnected moments into one continuous evidence-backed health story. The goal is simple.
>
> **0:21** Every appointment should start with context, not reconstruction. We'll start off with entering the patient view. So, Ameen, this is Ameen Khan.
>
> **0:30** She's 32 and has endometriosis. And her preferred language is Urdu. Instead of waiting for her next appointment and trying to remember everything, she can record and update in the language that feels most natural to her.
>
> **0:41** So we'll add a voice update. I have a pre-recorded Urdu speech sample. If I just start recording here. Today, my back is in lot of pain.
>
> **0:51** There's pain even I couldn't go to work. Today, my back... So if we stop the recording there.
>
> **1:02** Runway transcribes, uhm, the actual, uhm, recording.
>
> **1:12** It preserves the original Urdu script and produces an English translation. So Thread then stores both versions in Superbase as part of Amina's longitudinal record.
>
> **1:26** So if we had this as, uhm, today for 2.30, uhm, we'll have a pain rating of 8. So as we process this update, uhm, this then stores her record.
>
> **1:36** Uhm, it basically pushes back to Superbase and connects this to her overall health story, gives up her follow-up just so she understands what she is going to add to her story, and it saves her timeline.
>
> **1:48** And then Amina can then save the timeline and she can see her own health story at a glance, all the moments that she's captured, both written and voiced.
>
> **1:58** So now we'll switch over to clinician view. So, this is a clinician view, so we're going to assume here that the GP logs in and sees today's appointments in Threads, so for all those patients that use Threads, and Amina is the next patient, and Thread has already prepared a pre-appointment summary.
>
> **2:15** So here we can see on the right-hand side that Amina's, uh, there's more contextual information for the doctor themselves, and on the left side we have Gemini now organizing Amina's follow-up.
>
> **2:24** So, it will show what has changed, including worsening pelvic and lower back pain, interrupted sleep, impact on work, and nausea after naproxen, things that are quite important for a doctor to understand on a follow-up.
>
> **2:36** It also highlights what Amina wants to discuss, and what matters most to her. Importantly, Thread is not designed, is not diagnosing or recommending treatment, it is just organizing the evidence.
>
> **2:48** So, we also have a chat box here, um, which we can, um, basically, what it would do is, it then, it, it queries the, the data that we already have, and then the doctor can ask follow-up questions.
>
> **3:02** So, if you click here, when is the pain worse, it's reviewing the, um, the evidence that it has, um, including the original transcript and translation and shows evidence.
>
> **3:12** So, Thread reduces the time patients spend repeating themselves and gives clinicians a clearer picture before the consultation begins. The patient should not have to repeatedly explain their healthcare journey, their AI should.

> This is Loom's automated transcript. Imperfect wording and product-name transcription were retained and assessed against the repository rather than silently corrected.

## 11. eHome

**Team:** eHome  
**Repository stack:** Next.js, React, TypeScript, deterministic analytics  
**GitHub:** [github.com/dthwwydfli/eMed-hackathon](https://github.com/dthwwydfli/eMed-hackathon)  
**Demo:** [Live Vercel app](https://ehome-delta.vercel.app/)

### Submitted problem statement

Early drift in a long-term condition can be missed between appointments. Daily manual logging is burdensome, while small changes in sleep, movement, and routine may go unnoticed until several signals worsen together.

### Submitted description

eHome proposes privacy-preserving passive monitoring with radar and thermal sensors rather than cameras or microphones. A synthetic story follows Jessica from stable through drifting to concerning. Patient and clinic views explain the evidence chain, and an LLM-generated explanation/SBAR is described as being steered by NHS guidance.

### Repository-backed functionality

The repository documents a marketing site and a working read-only prototype with patient and clinician views. Its demo uses fully synthetic, deterministic data and does not use a live LLM or require an API key. The main implementation includes:

- a day scrubber spanning stable days 55–65, amber days 66–70, and red days 71–75;
- a 28-day baseline, trailing seven-day z-score and slope calculations, and deterministic explanations;
- identity tiering, Mahalanobis open-set rejection, guest mode, and confidence-aware attribution;
- deterministic clinician SBAR and a supporting data trail;
- identity “trap days”: David's late kitchen activity is reattributed using a synthetic CGM oracle, guest mode suspends attribution, and a daughter's similar gait is treated as ambiguous and discarded.

The repository is explicit that the data and sensing are simulated, the application is read-only, there is no authentication, and it is not a medical device. The submitted description's LLM language should therefore not be read as live model functionality in the shipped demo.

### Demo-observed functionality

The live `/demo` application loaded with **Demo**, **User**, and **Clinic** tabs, a day scrubber, a non-colour-only traffic-light status, an evidence chain, and a home floor plan. The clinic view showed a severity-sorted list with Arthur Nwosu as drifting and Jessica and Joyce as stable, plus an auto-drafted SBAR and a confidence-bearing data trail. The interface repeatedly states that it is not diagnostic and does not recommend medication.

Changing the slider to day 75 through browser automation changed the slider's active value but left the displayed day and evidence at day 58. This may be a limitation of automated React input handling or a live interaction bug, so the later red-state display was not claimed as observed. Because the submission provides a live application rather than a video, there is no transcript.

## 12. Loop

**Team:** Loop  
**Submitted stack:** OpenClaw, OpenAI Codex, GPT-4o, Whisper, Telegram, Supabase, React, Tailwind CSS, Supabase Realtime  
**GitHub:** [github.com/HohJD/loop](https://github.com/HohJD/loop)  
**Demo:** [Submitted Google Drive folder](https://drive.google.com/drive/folders/1eR7EohUStQDxhR5Qn2f0849Ef7wXnc17?usp=sharing)

### Submitted problem statement

Diabetes is mostly managed at home with infrequent, often manual follow-up. The submission says more than three million people in England currently live with diabetes and projects 4.2 million by 2030. NICE-aligned checks are fragmented, so medication lapses, glucose changes, hypoglycaemia, and foot or retinal screening can be missed.

### Submitted description

Loop turns guideline concepts into configurable monitoring primitives. A clinician policy builder covers medication, glucose, hypoglycaemia, foot and retinal checks, reminders, and motivation. OpenClaw communicates with patients through Telegram text and voice, while a Telegram Mini App called **Loopy** provides tracking. Stable cases close automatically; concerning cases escalate into a clinician dashboard. The same live policy is intended to control the bot, tracker, and dashboard.

### Repository-backed functionality

The public repository contains 32 commits and is now centred on a React clinician dashboard, Supabase migrations, shared logic, and documentation. Its README states:

> Hackathon MVP — React clinician dashboard that reads from Supabase in real-time. Patient-facing conversational layer is handled by OpenClaw; dashboard is read-only for monitoring.

The repository history says the earlier `loop-bot` was removed. The documented architecture is Telegram → OpenClaw → safety rules → OpenAI conversation → structured classification → Supabase → React dashboard. It describes policy records, structured outcomes, realtime escalation monitoring, and an emergency-keyword path that creates an escalation, notifies the clinician, and stops the ordinary conversation.

The code in this repository therefore supports the read-only monitoring side rather than independently containing the submitted patient bot. The Telegram/OpenClaw conversation, Whisper transcription, policy execution, classification, and patient tracker depend on external configuration not present in the submitted source. The frontend also uses a Supabase anonymous key at build time, which is normal for a correctly secured public client but makes row-level-security configuration essential.

### Demo availability

The submitted Google Drive folder was opened in the user's authenticated Chrome session. It displayed the empty-folder state—“Drop files here or use New button”—with no files or video items. Consequently, there was no demo to watch and no transcript to obtain for Loop at the time of review.

## Later gallery additions: submissions 13–42

The following entries were added after the initial twelve-project review. Repository findings come from the public GitHub pages and rendered READMEs; repositories were not cloned or executed. Demo observations are read-only.

| #   | Project              | Repository evidence                                      | Submitted demo evidence                                      |
| --- | -------------------- | -------------------------------------------------------- | ------------------------------------------------------------ |
| 13  | Undertone            | Public static demo plus extensive research/rule material | Six-page Google Drive PDF; no video transcript               |
| 14  | Cadence              | Public TypeScript monorepo with clinic/patient loop      | Live Railway landing and demo entry                          |
| 15  | Cassandra            | Public FastAPI wearable-triage prototype                 | Live Fly.io landing and upload flow                          |
| 16  | Scout & Sage         | Public WhatsApp/Eve/Next.js implementation               | Submitted Drive folder was empty                             |
| 17  | OpenWait             | Public synthetic Next.js/Cloudflare waiting-room MVP     | No demo link submitted                                       |
| 18  | Offramp              | Public React/FastAPI source export                       | Live Vercel landing; separate video mentioned in description |
| 19  | Sukari               | Public Expo/Cloudflare adherence product                 | Live Netlify experience                                      |
| 20  | Mind The Gap         | Submitted GitHub URL unavailable                         | YouTube video; transcript unavailable                        |
| 21  | Ambient Intelligence | Public Next.js browser-state prototype                   | Two-video YouTube playlist and transcripts                   |
| 22  | PenPal               | Public Next.js repo with stock chatbot README            | Live onboarding observed                                     |
| 23  | Proxima              | Public Cloudflare proactive-care agent                   | No demo link submitted                                       |
| 24  | EatLose              | Public iOS product/technical blueprint                   | Drive link opened Gemini project, not a demo                 |
| 25  | Persistence Engine   | Public simulation/model/test repository                  | Live seven-chapter Vercel demo                               |
| 26  | HARE                 | Submitted GitHub URL unavailable                         | Live simulated Wi-Fi-sensing view                            |
| 27  | Alongside            | Submitted GitHub URL unavailable                         | Submitted Drive folder was empty                             |
| 28  | Toba                 | Public simulated frontend prototype                      | No demo link submitted                                       |
| 29  | ATTUNE               | Public repository is empty                               | Drive folder contained only a one-page PDF                   |
| 30  | Amber                | Public native SwiftUI implementation                     | YouTube walkthrough and transcript                           |
| 31  | Steady               | Public Swift patient app plus clinician portal           | Live Railway clinician queue                                 |
| 32  | Renova               | Public model/patient/clinician repository                | Loom walkthrough and transcript                              |
| 33  | Adher.ai             | “GitHub” field points to live Lovable app                | Live app plus Loom walkthrough/transcript                    |
| 34  | PCOScope             | Public Next.js deterministic/AI collaboration prototype  | YouTube walkthrough and transcript                           |
| 35  | Forma                | Public camera/posture prototype                          | Loom walkthrough and transcript                              |
| 36  | Concord health       | Public static synthetic prototype                        | Live GitHub Pages app                                        |
| 37  | Respirate.ai         | Public MFCC/PCA/classifier research code                 | No demo link submitted                                       |
| 38  | Möbius / Preempt     | Public visual-cue/ontology prototype                     | Short YouTube video and partial transcript                   |
| 39  | Solace               | Public generic health-data backbone                      | No demo link submitted                                       |
| 40  | HomeRounds           | Public full-stack governed care-orchestration system     | No demo link in submission                                   |
| 41  | Endo Loop            | Public React/FastAPI pattern journal                     | Live Vercel app                                              |
| 42  | Unflared             | Public Next.js/TypeScript prototype                      | Drive MOV opened; transcript text unavailable                |

## 13. Undertone

**Team:** Team #32 · AImaxxers  
**GitHub:** [mr-mustafa7/Undertone](https://github.com/mr-mustafa7/Undertone)  
**Demo:** [Google Drive PDF](https://drive.google.com/file/d/16OGJIu6ctno54qccdx-C1NacR7-oxdMf/view?usp=sharing)

**Submitted problem and product:** Long-term metabolic-programme patients often disengage between visits, while specialist capacity cannot provide frequent check-ins. Undertone proposes a daily voice conversation that doubles as an acoustic sensor for possible muscle-loss drift, with cited, explainable rules escalating contradictions or threshold crossings to a clinician rather than diagnosing automatically.

**Repository-backed:** The 18-commit repository contains extensive strategy and evidence documents, a Prometheux/Vadalog ontology, and a self-contained `demo/index.html`. The README says the demo uses the browser Web Audio API for energy, zero-crossing and pitch features, with sample-audio fallback. Muscle-integrity rules, consent gates and audit derivations are represented; cardiac, glycaemic and renal signals are explicitly inactive roadmap stubs. The evidence therefore supports a static proof of concept and symbolic rule model, not validated clinical voice biomarkers.

**Demo-observed:** The submitted link is a six-page pitch PDF, not a video. It describes voice/vision capture → feature extraction → Vadalog reasoning → consent → clinician escalation. No transcript exists.

## 14. Cadence

**Team:** Team #58 · Cadence Med  
**GitHub:** [Emekaborisama/Cadence-hack](https://github.com/Emekaborisama/Cadence-hack)  
**Demo:** [Cadence](https://bit.ly/emed-cad)

**Submitted problem and product:** Real-world GLP-1 telehealth often ships medication without the structured plan, named support, recurring counselling and reviewed self-monitoring used in trials. Cadence attaches those support mechanics to an existing prescription through an adaptive plan, persistent coach, proactive contact cadence and exception-based human review.

**Repository-backed:** This is a 23-commit TypeScript monorepo with a Vite/React patient PWA, Node/Express API, shared domain contracts and a separate design prototype. Fixture mode is the default and needs no network or model key. The README documents a real demo loop: live-looking consult transcript, plan assembly, clinician approval, patient plan delivery, nausea check-in and clinic inbox flag. OpenAI is optional and protocol retrieval remains the grounding boundary.

**Demo-observed:** The Bitly preview resolved to a Railway deployment. Its landing page presents separate clinician and patient views and instructs the reviewer to start a consultation, approve the plan, observe it arrive on the patient phone and close the loop with a nausea check-in.

## 15. Cassandra

**Team:** Team #66 · Cassandra  
**GitHub:** [AngelTzankov/cassandra-health](https://github.com/AngelTzankov/cassandra-health)  
**Demo:** [Live Fly.io app](https://cassandra-health.fly.dev/)

**Submitted problem and product:** Heart-failure deterioration can emerge several days before admission through converging changes in heart rate, breathing, activity, weight and oxygen. Cassandra proposes to read Apple Health exports, compare several modest shifts with the patient's baseline and classify cases as stable, review soon or act today.

**Repository-backed:** The two-commit FastAPI repository contains an Apple Health streaming parser, fixture data, deterministic triage, caseload seeding and an LLM narrative layer. The README is explicit that rules own the alert and the model can only write prose from computed values and the already-decided state. The repository was not executed, so the claimed timing and clinical performance remain unvalidated.

**Demo-observed:** The live landing page loaded and offered an Apple Health ZIP upload plus a clinician dashboard. It states that uploads are parsed in memory, raw files are deleted and generated brief links expire after fifteen minutes; those privacy behaviours were not independently tested.

## 16. Scout & Sage

**Team:** Team #46 · Sentinels  
**GitHub:** [botirkhaltaev/steadfast](https://github.com/botirkhaltaev/steadfast)  
**Demo:** [Submitted Drive folder](https://drive.google.com/drive/folders/1jwLZdQ29UO5alHMHLuWuebN-Za0FHy3W)

**Submitted problem and product:** GLP-1 persistence is poor, app retention is low and clinicians are distracted by routine questions. Scout is a WhatsApp patient companion; Sage performs background clinical review and escalates only cases that need a person.

**Repository-backed:** The 21-commit repository contains Vercel Eve agents, Wassist webhook routes, durable patient state, Sage subagent briefs, escalation state and a Next.js clinician inbox that replies into the same WhatsApp thread. The documented design pauses Scout when a human handoff is active. This is materially more than a pitch mock-up, although live WhatsApp behaviour depends on configured external services.

**Demo-observed:** The submitted Drive folder loaded but was empty, so there was no video or transcript.

## 17. OpenWait

**Team:** Team #39 · Myrthic  
**GitHub:** [MasteraSnackin/OpenWait](https://github.com/MasteraSnackin/OpenWait)  
**Demo:** No demo link was submitted.

**Submitted problem and product:** Digital GP waiting rooms often fail to show whether a request was received, who owns it, how long the patient may wait or what they should do next. OpenWait combines an active waiting-room status with optional bounded evidence, human-review requests and a clinician audit view without automated diagnosis.

**Repository-backed:** The one-commit repository is a sizeable Next.js/Cloudflare/D1/Drizzle synthetic MVP with patient and clinician surfaces, tests, build output and documentation. Its seeded eight-week GLP-1 journey can request a small camera movement check, confirmed home-monitor reading or patient context; clinicians approve bounded messages and patients can acknowledge, decline evidence, record barriers or request follow-up. The README explicitly says it stores no real clinical outcome, performs no record write-back and does not infer live queue position.

## 18. Offramp

**Team:** Team #15 · Continuum Labs  
**GitHub:** [1337Xcode/Offramp-demo](https://github.com/1337Xcode/Offramp-demo)  
**Demo:** [Live Vercel app](https://tryofframp.vercel.app/)

**Submitted problem and product:** Post-GLP-1 transition support and auditability are weak even though programmes already collect weights, medication, symptoms and check-ins. Offramp converts voice, SMS or staff-entered patient wording into evidence-linked summaries, deterministic urgent flags and a clinician-ready handover while withholding dose and diagnosis advice.

**Repository-backed:** The one-commit public export contains React/Vite and FastAPI/Pydantic source, tests, PDF generation and optional OpenAI, AssemblyAI and Twilio integrations. It documents organisation scoping, Supabase authentication/storage/RLS and caregiver notifications, but deliberately omits migrations, Supabase configuration and deployment/operations files. A separately provisioned Supabase project is required for authenticated clinical workflows.

**Demo-observed:** The live landing page showed check-in routes, verified-context gates, source-versioned guidance, deterministic urgent phrases and exact-patient-wording separation. The submission description also contains a YouTube URL, but the gallery's submitted Demo field points to the live app; that extra video was not transcribed in this pass.

## 19. Sukari

**Team:** Team #6 · thisyearnofear  
**GitHub:** [thisyearnofear/sukari](https://github.com/thisyearnofear/sukari)  
**Demo:** [Live Netlify app](https://glucosewars.netlify.app/)

**Submitted problem and product:** Metabolic-care tools often show biomarker dashboards or generic coaching but fail to convert a signal into one achievable behaviour. Sukari creates one daily mission, rehearses the choice in a short game, records follow-through, observes the associated response and escalates only care-team exceptions.

**Repository-backed:** The 105-commit Expo/React Native/Web repository contains patient missions, rehearsal/game flows, an operator surface, tests, Cloudflare integration and a repositioning from the earlier GlucoseWars/Web3 product. The README explicitly removes NFT, leaderboard and dosing claims, labels demo patterns, lets patients accept/make easier/swap/decline missions and avoids causal overclaiming when showing an associated glucose response.

**Demo-observed:** The live page loaded with a ten-minute post-dinner-walk mission, framing it as a small experiment rather than treatment. It states “Habits only. Never medication, dosing, or diagnosis.”

## 20. Mind The Gap

**Team:** Team #25 · Mind the Gap  
**GitHub:** [tejosaikiran/MindTheGap](https://github.com/tejosaikiran/MindTheGap)  
**Demo:** [YouTube](https://youtu.be/fLxKD5XsWxc)

**Submitted problem and product:** Calendar plans and wearable estimates of sleep, HRV and stress live in separate silos, so people learn that a schedule exceeded their capacity only after burnout or disengagement. Mind The Gap proposes a somatic timeline, an ontology linking patient context, metrics, therapies and drift, and “what if” schedule simulations with supportive reflection.

**Repository-backed:** The submitted GitHub URL displayed GitHub's generic search/footer page rather than a repository. It may be private, removed or incorrectly linked, so the claimed React/ClickHouse/Prometheux/OpenAI implementation could not be verified.

**Demo-observed:** A 3:13 unlisted YouTube video loaded. YouTubeToTranscript returned its random-block page twice, and YouTube itself exposed no “Show transcript” control. No transcript was obtainable during this pass.

## 21. Ambient Intelligence

**Team:** Team #29 · The Guardians  
**GitHub:** [sidhiqali/Ambient-intelligence](https://github.com/sidhiqali/Ambient-intelligence)  
**Demo:** [YouTube playlist](https://www.youtube.com/watch?v=92P8VftZWQs&list=PLNo2UBFh98UE)

**Submitted problem and product:** Chronic cardiometabolic care is episodic, while device dashboards, video visits and generic chatbots do not combine symptoms, behaviour and clinician workflow. Ambient Intelligence offers configurable daily voice/video/photo/text check-ins, personal-baseline comparison, AI summarisation and a clinician-approved monitoring plan.

**Repository-backed:** The one-commit Next.js repository has patient and clinician views, voice transcription and multimodal-analysis seams, but no authentication or database; state lives in the browser. With no key it uses scripted analysis. The README's golden path produces a summary and one follow-up, then shows the patient in a reasoned clinician queue where a clinician can temporarily change monitoring frequency.

**Demo-observed:** The playlist contains a 57-second introduction and a separate 3:12 application demo. The app video shows patient enrolment, clinician-selected monitoring items/frequency, consent-based modality selection, a text check-in, emergency guidance, optional automated calling and a clinician metrics/summary view.

### Automated YouTube transcripts

> **Introduction:** Introducing Ambient Intelligence powered by AI. Adaptive care at home for people living with obesity, type 2 diabetes, and cardiovascular disease. Today, chronic illness is still managed in crowded waiting rooms and rare appointments. You wait, and most of the story happens in the silence between visits. What if care came home? What if support lived in your phone and watch instead of only in the clinic? Each day, Ambient Intelligence sends a simple 20-second voice check-in. It asks how you're feeling, listens for breathlessness and fatigue, and gently adapts questions over time. It combines all these signals and auto-triages high, medium, or low. Your clinician sees a pre-summarised list of patients who need review and always because it learns from your patterns and from clinician feedback. Care becomes truly adaptive at home. The questions, nudges, and alerts shift as your life and health—
>
> **Application demo:** Introducing Ambient Intelligence. So it's a healthcare monitoring app for chronic patients at home. Let's begin with adding a new patient into the program. The window is defaultly set for 14 days but can be changed to any number of days, and the regular frequency can be weekly. The clinician chooses which things will be measured daily, enrols the patient and activates the plan. On the patient end, the patient can choose voice, audio, video or summaries, and edit those choices based on consent. Check-in can be through voice, text, video, swelling or foot-swelling photos, or a meal. If I want text, I'll enter, “I'm feeling extremely dizzy.” The check-in understands this and works with it. A patient who doesn't feel comfortable can switch to quick check-in. You can enable automated daily calling and choose the frequency. Emergency guidance can navigate to the nearest service or call the clinician. On the doctor's end, daily metrics are checked, summaries are provided and monitoring frequency can be updated for each patient.

> These are automated transcripts. Imperfect wording was lightly normalised only where the intended product term was clear.

## 22. PenPal

**Team:** Team #36 · SeeMed  
**GitHub:** [medicalnp/penpal](https://github.com/medicalnp/penpal)  
**Demo:** [Live Vercel app](https://penpal-eight.vercel.app/)

**Submitted problem and product:** GLP-1 patients may flinch or lift a spring-loaded injection pen too early, wasting a dose and potentially disrupting therapy. PenPal proposes a camera-and-voice injection coach that confirms the pen and dose, guides the hold and writes an injection diary.

**Repository-backed:** The public Next.js repository has application, components, database, tests and deployment files, but its README is still the stock Vercel AI Chatbot template and documents generic chat models rather than PenPal. That mismatch makes it difficult to independently verify the camera coaching, pen recognition, injection timing and diary implementation from the repository landing page alone.

**Demo-observed:** The live app showed a polished multi-step onboarding flow explaining step-by-step injection support and automatic dose/site/side-effect diary entries. The review stopped at **Start with PenPal** to avoid requesting camera or microphone access, so real-time visual coaching was not exercised.

## 23. Proxima

**Team:** Team #20 · Promixa  
**GitHub:** [HahaBill/proxima](https://github.com/HahaBill/proxima)  
**Demo:** No demo link was submitted.

**Submitted problem and product:** People with several conditions must integrate conflicting medication, symptom and behavioural guidance across teams. Proxima presents itself as a proactive cross-condition agent on WhatsApp, iMessage and phone that notices connected risks or silence, contacts the patient and routes a structured summary without diagnosing.

**Repository-backed:** The 22-commit Cloudflare/Hono repository contains source, a live Worker link, patient recap/report pages, long-term memory and ElevenLabs voice configuration. The README uses a synthetic multimorbidity example involving GLP-1, sulfonylurea and blood-pressure medicines and describes cross-channel proactive contact. External messaging, voice and model behaviour depends on Cloudflare/OpenAI/ElevenLabs/SendBlue/Twilio configuration.

## 24. EatLose

**Team:** Team #22 · EatLose  
**GitHub:** [EatLose/EatLose](https://github.com/EatLose/EatLose)  
**Demo:** [Submitted Drive project](https://drive.google.com/drive/project/1NEABDMyOFbQSawgnvQgW_5RKFhmAA8lj?usp=sharing)

**Submitted problem and product:** Manual calorie tracking is slow. EatLose lets a person photograph, type or speak a meal, review an AI estimate and see how much remains in the day's plan.

**Repository-backed:** The two-commit repository contains iOS, Supabase, documentation and scripts. Its README calls itself a product and technical blueprint for a UK iPhone release, with editable ranges/assumptions, user confirmation and Apple Health context. The repository page did not establish that all blueprint features are implemented or running.

**Demo-observed:** The submitted Drive URL opened a Gemini-in-Drive project screen with no playable video or application evidence.

## 25. Persistence Engine

**Team:** Team #63 · RXLab  
**GitHub:** [rxailab/persistence-engine](https://github.com/rxailab/persistence-engine)  
**Demo:** [Live Vercel demo](https://static-flax-theta.vercel.app/)

**Submitted problem and product:** GLP-1 discontinuation is often driven by identifiable barriers such as side effects, cost, stalled progress and logistics, while ordinary risk alerts may arrive late or overwhelm teams. Persistence Engine predicts near-term risk, estimates the likely barrier and ranks the human action most likely to help under a fixed staff-time budget.

**Repository-backed:** The eight-commit Python/data-science repository contains separate simulation, modelling, NLP, application, demo and test areas. It is unusually explicit about evidence boundaries: the generator encodes published discontinuation marginals and a hand-authored response surface, while the model must recover noisy structure; uplift is trained on an in-silico randomised trial and evaluated against a disjoint synthetic counterfactual set. Code-enforced tests cover marginal calibration, generator/fitter separation, missingness and uplift evaluation. Metrics are architectural demonstrations, not clinical performance estimates.

**Demo-observed:** The live seven-chapter narrated demo loaded. It compared naïve and uplift targeting, showed a clinician queue, separate safety lane, evidence and data/training explanations, and repeatedly labelled the dataset synthetic. The headline patient-months-per-100-nurse-minutes figure is explicitly tied to the synthetic hand-authored response surface.

## 26. HARE

**Team:** Team #67 · Hare  
**GitHub:** [rasrescodes/hare](https://github.com/rasrescodes/hare)  
**Demo:** [Live Vercel app](https://frontend-gxp98d5hy-rasrescodes-projects.vercel.app/)

**Submitted problem and product:** People at greatest risk may not charge a wearable, open an app or log symptoms. HARE proposes a low-cost wall-plug Wi-Fi channel-state sensor that learns household movement/breathing patterns, calls the patient when drift appears, alerts family through WhatsApp if unanswered and drafts a GP letter for human approval.

**Repository-backed:** The submitted GitHub URL returned GitHub's generic search/footer page, so the claimed Next.js/Three.js frontend, SSE bridge, watcher, WhatsApp bridge and ESP32 sensing code could not be inspected.

**Demo-observed:** The live app loaded a simulated home rhythm with wake, kitchen, rest and sleep events. It clearly labelled sensing as simulated and presented “No camera / No wearables / WiFi sensing” with Home, Insights, Family and Care tabs. No physical Wi-Fi sensor evidence was observed.

## 27. Alongside

**Team:** Team #55 · Alongside  
**GitHub:** [Sahid-m/alongside](https://github.com/Sahid-m/alongside)  
**Demo:** [Submitted Drive folder](https://drive.google.com/drive/folders/1Z-Q96wk0MrF-tE6QFKmLv_Ihvrez_9bc?usp=share_link)

**Submitted problem and product:** Patient-support programmes have low uptake and high human-contact costs, while people often leave therapy during difficult early weeks. Alongside turns voice check-ins into a Neo4j patient knowledge graph, applies adverse-event/risk rules and gives nurses a one-screen brief, draft response and approval path.

**Repository-backed:** The submitted GitHub URL did not resolve to an inspectable repository in the Chrome session. The claimed Next.js/Neo4j/Zod/D3 implementation could not be verified.

**Demo-observed:** The submitted Drive folder was empty. No video or transcript was available.

## 28. Toba

**Team:** Team #40 · Toba  
**GitHub:** [sijiachendinsky-cmd/toba-demo](https://github.com/sijiachendinsky-cmd/toba-demo)  
**Demo:** No demo link was submitted.

**Submitted problem and product:** Multiple condition-specific recommendations can turn daily life into an overwhelming medical programme. Toba uses a one-minute voice check-in to reduce the day to three achievable actions adjusted for sleep, energy, mobility and routine, with points and a playful digital world.

**Repository-backed:** The four-commit frontend contains prerecorded voice clips, assets, a calling flow, patient/family/clinician views and a Vite application. Its README explicitly says voice playback, health signals, clinical summaries and reward redemption are simulated. There is no backend, persistence or live clinical integration in the submitted repository.

## 29. ATTUNE

**Team:** Team #57 · Alpha  
**GitHub:** [eshagarwal1306-maker/ATTUNE](https://github.com/eshagarwal1306-maker/ATTUNE)  
**Demo:** [Submitted Drive folder](https://drive.google.com/drive/folders/1Gs_9iq0s2gTF2AVMvbyuxd7UAOpekRXv?usp=sharing)

**Submitted problem and product:** ATTUNE presents an automated n-of-1 trial engine that designs and randomises personal experiments, estimates individual effects and confidence intervals, collects voice and camera-derived vital-sign context, flags red words and prepares a human-approved SBAR handoff. The submission follows a synthetic patient with diabetes and hypertension and contrasts her personal post-meal walking effect with a population average.

**Repository-backed:** GitHub displayed **“This repository is empty.”** None of the claimed React, LLM reasoning, ElevenLabs or custom browser rPPG implementation could be inspected.

**Demo-observed:** Despite the folder name “AttuneDemoVideo,” the Drive folder contained only `Attune_OnePager.pdf` (7 KB). No playable demo or transcript was present.

## 30. Amber

**Team:** Team #49 · AmberAI  
**GitHub:** [kpuchkov1-code/OpenAI-HealthHack](https://github.com/kpuchkov1-code/OpenAI-HealthHack)  
**Demo:** [YouTube](https://youtu.be/xrwavbGN-Q0)

**Submitted problem and product:** People on GLP-1 programmes may stop because side effects, wins and adherence changes are lost between short appointments. Amber combines daily voice check-ins, wearables and records into a structured pre-visit review, with user-controlled data-sharing permissions and human routing for out-of-scope concerns.

**Repository-backed:** The two-commit repository contains a native SwiftUI iOS project plus a web version. Its README documents OpenAI Realtime voice with barge-in, Runware chat/vision, photo nutrition, durable facts, HealthKit, optional Oura/Whoop, Recall.ai meeting capture and PDF doctor reports. Services require local secrets; the repository was not built, so their end-to-end operation was not independently verified.

**Demo-observed:** The video shows settings and consent controls, wearable connections, a meeting bot joining a clinician call and returning a transcript, PDF export, record import, a live voice exchange, professional redirection, editable/deletable memories and photo-based food/macronutrient logging.

### Automated YouTube transcript

> This is our app, Amber AI. In settings it is very customisable: the user can see programme information, connect wearables and prevent Amber from accessing private-life information. In Records, a user can share a meeting link and Amber joins the call with the doctor, listens and brings back a transcript so context can be extracted. The user can export a PDF for the doctor and import files such as an eMed lab report.
>
> The user can choose a voice and talk to Amber. In the demonstration, the user says their GLP-1 medication has caused side effects and asks for help; Amber redirects them to a professional. The Memory tab shows what Amber remembers, grouped for review, and the user can delete a memory. The Habits tab tracks weight and nutrition. A food photo is analysed for calories and macros before the user chooses whether to save it.

> The automated transcript contained substantial filler and several product-name errors; this version preserves the demonstrated content while normalising those artefacts.

## 31. Steady

**Team:** Team #54 · AI-Enabled Clinician Supporting Forward Deployed Engineers Solving Healthcare  
**GitHub:** [richwardle/reimagine-health](https://github.com/richwardle/reimagine-health)  
**Demo:** [Live Railway app](https://steady-health.up.railway.app/)

**Submitted problem and product:** GLP-1 patients may gradually log less, reduce resistance exercise or protein intake and disengage before clinicians notice, risking loss of muscle and function. Steady structures messages, biometrics and behaviour against personal baselines and lets a clinician-governed action policy choose a nudge, smaller goal, human review or deliberate silence.

**Repository-backed:** The 16-commit repository has a predominantly Swift patient app, a React/Vite clinician portal and Convex backend. The patient app posts events into the clinic surface, whose README documents seeding and a hidden pitch stage. This supports a two-surface prototype, but the submitted contextual-bandit learning and population-model claims were not established from the root README.

**Demo-observed:** The live clinician view loaded a synthetic 200-person programme: 190 on track and ten needing review. It ranked cases for vomiting, silent weight regain, low protein/check-ins, postmenopausal rapid loss and other patterns, showed event history and stated that nudges may run automatically while clinical actions wait for approval and silence is valid.

## 32. Renova

**Team:** Team #33 · Renova  
**GitHub:** [PDochev/eMed-Hackhaton](https://github.com/PDochev/eMed-Hackhaton)  
**Demo:** [Loom](https://www.loom.com/share/83c173a2938c4794a0955b7828a9145c)

**Submitted problem and product:** Generic chronic-care plans usually ignore occupation even though physical demands, toxins, stress and working patterns change what is realistic and risky. Renova combines medical, wearable, lifestyle, environmental and occupational context into daily guidance, social support, clinician summaries and potential workforce-health products.

**Repository-backed:** The 15-commit repository contains a Python concordance engine named Attune, a React/Express patient dashboard called Elevera and a standalone clinician dashboard. The model exports synthetic output into dashboard JSON so displayed metrics can be driven by engine results rather than only handwritten UI fixtures. The repository contains multiple product names and still depends on synthetic data; production employer analytics, privacy and wearable connections are not demonstrated.

**Demo-observed:** The 5:10 Loom walkthrough shows occupation/location onboarding, wearable connections, an occupational-risk matrix, care-plan adjustments, a social layer, fourteen-day trajectory and clinical view. It also proposes repackaging the product for workforce allocation, using firefighters as the example.

### Automated Loom transcript

> **0:00** Chronic conditions are on the rise and are hard to manage: obesity, cardiovascular disease, diabetes and asthma. Once you have one chronic condition, you are more likely to develop another. People focus on sleep, nutrition and exercise, which are important.
>
> **0:33** However, everyone overlooks occupational health or occupational risk. In-home care is linked to out-of-home care. A firefighter or doctor may be exposed to toxins and be on their feet all day; a computer scientist sits and codes all day, which has different risks.
>
> **1:05** Renova is an AI health companion. You enter medical history, occupation and location, then connect wearable devices to continuously inform Renova about your physical state.
>
> **1:40** The key differentiator is occupational intelligence. The care plan covers exercise, medication, nutrition, hydration and sleep, then adjusts for occupation. If you are on your feet all day you may need rest; if you sit all day you may need exercise. An injury can shift the plan toward rehabilitation.
>
> **2:26** Renova also includes social wellbeing. A user can find people participating in local challenges or previous contacts who can support the journey.
>
> **3:10** This information feeds a clinical view with adherence, conditions, medication, recent risks and occupational links. An occupational-risk matrix and fourteen-day trajectory create AI-generated care adjustments.
>
> **4:13** Beyond subscriptions from clinicians or patients, the platform could be repackaged for workplace health and safety—for example, helping a fire brigade understand risk and allocate people and resources.
>
> **4:48** Renova aims to move chronic care from reactive treatment to proactive, personalised care by understanding the person's condition, life and job.

## 33. Adher.ai

**Team:** Team #44 · Adher.ai  
**Submitted “GitHub”:** [Live Lovable app](https://adherai.lovable.app/)  
**Demo:** [Loom](https://www.loom.com/share/60ad0d6696904352994d2acf521292fd)

**Submitted problem and product:** A bad week of GLP-1 side effects or confusion may become silent discontinuation before the next appointment. Adher.ai collects weekly nausea, energy, appetite, adherence and mood, reasons over the history and produces short self-management suggestions plus a clinician handoff when a pattern needs review.

**Repository-backed:** The gallery's GitHub field points to the deployed Lovable application rather than a source repository, so there is no independently inspectable Git history or source tree. The live app exposes a single-clinician intake form for a care pathway, medication, start date and baseline notes. The submission says Lovable Cloud and server-side edge functions provide the backend and OpenAI is accessed through Lovable's gateway.

**Demo-observed:** The Loom follows synthetic patient John Reeds from a stable first week to worsening symptoms, 50% adherence, depressed mood, vomiting and fatigue. It generates a one-page clinician summary and flags the multi-week decline. No repository was available to verify how the model, thresholds or history logic are implemented.

### Automated Loom transcript

> **0:00** Adher.ai is a copilot for GLP-1 patients, built for the gap between appointments—not because treatment failed, but because a bad week goes unnoticed until someone quietly stops.
>
> **0:22** We start with a fictional patient, John Reeds. His pathway, medication, start date and current-condition notes are entered and the patient is added.
>
> **0:54** In week one everything is fine. A check-in is recorded and AI generates a short report for clinicians: a one-page handoff rather than a ten-page PDF.
>
> **1:27** By week four the condition has worsened. Adherence has dropped to 50%, symptom severity increases, energy falls and mood is recorded as depressed. Vomiting and fatigue are added and the check-in is submitted.
>
> **2:29** The report says things have worsened and need clinician review. The system looks over the full history rather than one entry and flags two weeks of worsening symptoms, falling adherence and language suggesting the patient is considering stopping.
>
> **3:13** It generates a one-paragraph handoff summary in roughly ten seconds, creating a conversation before the patient disappears from the programme. The proposed business model is B2B licensing per practitioner or patient rather than selling directly to patients.

## 34. PCOScope

**Team:** Team #30 · CD Loker  
**GitHub:** [Claudiodong/PCOScope](https://github.com/Claudiodong/PCOScope)  
**Demo:** [YouTube](https://www.youtube.com/watch?v=PQ9FFvjUGBM)

**Submitted problem and product:** People with PCOS have fluctuating sleep, stress, energy and cycle context but often receive disconnected data and generic advice. PCOScope combines a morning check-in and wearable context into transparent evidence, small adjustable actions, in-the-moment suggestions and an end-of-day reflection.

**Repository-backed:** The 27-commit Next.js repository includes app/components/data, documentation, unit and end-to-end tests. Deterministic TypeScript compares daily signals with a personal baseline and calculates the management score, evidence, status and focus; AI is limited to explaining verified context and proposing choices/future scenarios. The README explicitly avoids treating correlation as a medical conclusion.

**Demo-observed:** The video follows synthetic user Emma through sleep/HRV/stress context, longer-than-recent cycle timing, a recovery focus, three editable actions, a contextual decaf suggestion and a summary that does not claim causation.

### Automated YouTube transcript

> PCOScope is an AI-supported daily companion for people living with polycystic ovary syndrome. It helps users connect everyday symptoms, cycle information and wearable data without attempting to diagnose or measure hormone levels. Each morning begins with a short check-in. The system brings together sleep, HRV, resting heart rate and activity from the user's wearable.
>
> Unlike a generic fitness app, PCOScope places menstrual-cycle context alongside daily signals. Emma is on day 43, longer than her recent cycle pattern. The interface communicates the change without predicting ovulation or the exact day of her next period. Emma records stress and fatigue in around thirty seconds and receives a personalised daily brief suggesting that a gentle recovery day may be worth considering.
>
> The management score is not a PCOS severity score; it summarises how today's behaviours and signals relate to Emma's longer-term self-management goals. The recommendation is explainable: four nights of shorter sleep, lower HRV, and higher reported stress and fatigue. PCOScope separates observation from interpretation and does not claim these signals prove a hormone change.
>
> The brief becomes three small actions: begin winding down earlier, choose a gentle walk and reduce caffeine later in the day. Each suggestion can be accepted, adjusted or declined. In a simulated coffee-shop scenario, the app connects Emma's recovery goal to her drink choice, offers a lower-caffeine alternative and still allows her usual order. Finally, the summary shows completed actions and later sleep/HRV movement while stating that the change does not prove causation.

## 35. Forma

**Team:** Team #34 · Forma  
**GitHub:** [KidLeiS/emed_hack](https://github.com/KidLeiS/emed_hack)  
**Demo:** [Loom](https://www.loom.com/share/fd0919eb259b4f2897e4f6ae2888e841)

**Submitted problem and product:** Chronic neck/back pain and prolonged sitting are widespread, but generic “sit less” advice does not reveal personal patterns or whether an intervention helped. Forma uses short laptop-camera samples to estimate posture and sedentary patterns locally, retains derived landmarks/measurements rather than raw media and proposes timed interventions.

**Repository-backed:** The seven-commit Electron/JavaScript repository contains source, tests, architecture, seeded-data reset tooling and posture-timeline/report work. Its README describes the camera as a private trend instrument rather than a posture-policing tool. The submitted stack says Runware analyses reports and “diagnosis,” but that diagnosis wording conflicts with the safer repository framing and was not validated.

**Demo-observed:** The Loom shows a 30-second camera check, a posture score, head/shoulder/trunk values, desk/away/hunch time, AI interpretation and reminders. The narration says the AI analyses “all of our images,” which conflicts with the submission's stronger claim that raw images are never stored or uploaded; implementation and network behaviour were not tested.

### Automated Loom transcript

> **0:00** We built Forma. It is a private laptop-based scanner for people with chronic neck and back pain who spend most of the day at a desk.
>
> **0:16** A thirty-second check-in captures posture throughout the day and provides personalised insights and interventions. It detects shoulder lean, forward trunk position and related signals.
>
> **0:42** After capture, the app shows a posture score, head alignment, shoulder balance, trunk alignment, desk time, time away and hunch time. The laptop is used as the capture point because many people work there all day.
>
> **1:16** AI analyses the captured images and identifies possible patterns associated with discomfort, such as sustained forward-head posture. It then proposes a personalised improvement plan and notifications to stand, walk or adjust posture.

## 36. Concord health

**Team:** Team #56 · Concord health  
**GitHub:** [galimovevgeniy/concord-frailty-sentinel](https://github.com/galimovevgeniy/concord-frailty-sentinel)  
**Demo:** [Live GitHub Pages app](https://galimovevgeniy.github.io/concord-frailty-sentinel/)

**Submitted problem and product:** Disease-specific plans may miss that a medication adjustment for one condition destabilised another, especially when frailty appears through function, appetite, falls or independence rather than a single vital sign. Concord links treatment timing, personal-baseline changes and function into one clinician-ready cross-condition summary.

**Repository-backed:** The one-commit repository is a dependency-free HTML/CSS/JavaScript static prototype with synthetic data. It links a furosemide dose reduction to rising weight, breathlessness and swelling while explicitly avoiding diagnosis or medication advice. Every escalation requires clinician review; emergency wording directs the patient to 999.

**Demo-observed:** The live app loaded a detailed synthetic Margaret Hall story with the medication timeline, three converging clinical signals, falling steps/walking speed/sit-to-stand performance, appetite/personal-care/near-fall events, a structured check-in and a patient-approved summary. It clearly labels voice/photos as browser-only demo inputs that are not clinically analysed or uploaded.

## 37. Respirate.ai

**Team:** Team #37 · username404  
**GitHub:** [davidscode404/respirate-ai](https://github.com/davidscode404/respirate-ai)  
**Demo:** No demo link was submitted.

**Submitted problem and product:** Respirate.ai asks whether eight labelled cough types can be classified from WAV audio using MFCC features, PCA, logistic regression and random forest rather than subjective listening.

**Repository-backed:** The six-commit Python repository contains a from-scratch MFCC pipeline, classifier script and saved confusion-matrix results. There is a material performance discrepancy: the gallery claims **62.7% test accuracy**, while the current README says **37.3% accuracy** and parenthetically reports 596 of 1,599 files misclassified, which would itself imply roughly 62.7% accuracy. The wording/calculation should be corrected before using the number. The unusual cough classes and data provenance also require scrutiny before any health interpretation.

## 38. Möbius / Preempt

**Team:** Team #38 · Use Less  
**GitHub:** [pomoron/preempt](https://github.com/pomoron/preempt)  
**Demo:** [YouTube](https://youtu.be/Im2hE0etOZc)

**Submitted problem and product:** Sparse, subjective health observations are forgotten between appointments. Möbius proposes to preserve short moments, contradictions and optional environmental/sensor context, ask one or two useful follow-ups and turn bounded mitigation cycles into reusable clues rather than diagnoses.

**Repository-backed:** The six-commit repository is named **Preempt** and contains a Python browser server, medical-agent logic, visual-question-answering code, web UI and tests. It supports face/lip/open-mouth, headache/pain-point and palm image pathways, typed or transcribed follow-up, JSON cause–cure ontologies, local Trello-style planning, optional one-way Trello export, EXIF date/location and historical weather. Its README repeatedly calls observations non-diagnostic, but image interpretation and ontology quality remain dependent on the configured model and content.

**Demo-observed:** The 1:09 YouTube video describes a visual-cue app. The available automated transcript contained only: “Yes, I do still feel itchy, especially when I need to use my hands…” Most of the video therefore had no recoverable speech transcript.

## 39. Solace

**Team:** Team #48 · Syntax Labs  
**GitHub:** [Shiam1995/Syntax-Labs](https://github.com/Shiam1995/Syntax-Labs)  
**Demo:** No demo link was submitted.

**Submitted problem and product:** People waiting for chronic-pain specialist care need lightweight support, personal-baseline tracking and a structured summary of pain, function, sleep and confidence.

**Repository-backed:** The public repository does not match that pitch closely. Its README documents a dependency-free Python **Health Data Backbone** that stores food, diet, sleep, medicine and blood-test JSON records and produces simple daily summaries. The tree also contains several HTML dashboards, but the repository landing page does not substantiate the submitted chronic-pain baseline, guidance or longitudinal clinical-summary workflow. This is one of the clearest submission-to-repository mismatches in the gallery.

## 40. HomeRounds

**Team:** Team #53 · HomeRounds  
**GitHub:** [abhinavgupta707/emed](https://github.com/abhinavgupta707/emed)  
**Demo:** No demo link was submitted in the gallery.

**Submitted problem and product:** Chronic-care evidence is fragmented between appointments, leaving patients to decide what matters and clinicians with noisy, uncertain alerts. HomeRounds performs an adaptive voice-led round, chooses the smallest useful evidence module, quality-gates camera/medication/voice/device inputs, attaches provenance and uncertainty, creates one owned clinician task and follows it through resolution.

**Repository-backed:** This is the largest and most mature repository inspected in the gallery: 180 commits spanning web application, domain/persistence/protocol/action/audit packages, synthetic data, database migrations, deployment, tests and extensive safety/QA/submission evidence. The README and code history preserve unequal authority: models converse/extract/rank, while deterministic state machines, red-flag gates, quality checks, protocols, allowlists and idempotent persistence own decisions. It contains both patient and clinician surfaces, durable PostgreSQL workflows, browser/companion paths and explicit no-number-on-failed-capture behaviour. The repository repeatedly limits all evidence to synthetic, non-clinically-validated prototype use and records remaining physical-device and clinical-validation gates.

**Demo availability:** The gallery contains no submitted demo URL. The research therefore treats the public repository as source evidence and does not convert the separately known production site into submitted-demo evidence.

## 41. Endo Loop

**Team:** Team #8 · NHS Hackers  
**GitHub:** [mmvrmg9/engine_ai_hackathon](https://github.com/mmvrmg9/engine_ai_hackathon)  
**Demo:** [Live Vercel app](https://engine-ai-hackathon-frontend.vercel.app/)

**Submitted problem and product:** Endometriosis diagnosis can take years because short appointments and memory do not expose a continuous pattern. Endo Loop combines voice/manual symptom logs, cycle context, sleep and wearables into evidence-backed patterns and a care-team summary without diagnosing.

**Repository-backed:** The 34-commit React/FastAPI repository has backend/frontend areas, Pydantic validation and deterministic pattern/safety rules. Four screens cover Today, Patterns, Share and Journey Stage. Voice and manual input converge on the same reviewed `DailyLog`; the parser handles natural-number phrases, asks up to two missing-context questions and requires confirmation. The README explicitly uses synthetic data and avoids measuring inflammation, diagnosis or medication changes.

**Demo-observed:** The live app loaded a seeded patient story with rising pain outside the usual cycle window, HRV below personal baseline, a non-causal explanation, one follow-up question, detailed symptom logging and printable/shareable evidence. It provides emergency escalation wording but does not claim the observed pattern caused a flare.

## 42. Unflared

**Team:** Team #41 · Unflare  
**GitHub:** [Hari0810/emed](https://github.com/Hari0810/emed)  
**Demo:** [Google Drive MOV](https://drive.google.com/file/d/1t-RbNuCYuAEj9uTu54WYDsfoKpV7jH3J/view?usp=drivesdk)

**Submitted problem and product:** ANCA vasculitis can have dangerous personalised “slow-burn” flares that are difficult to distinguish from steroid effects. Unflared proposes routine voice calls joined with wearables, records and medication history, then gives patient escalation guidance and eventually clinician taper/trigger insights.

**Repository-backed:** The five-commit Next.js/TypeScript repository contains app/source code, voice scaffolding, check-in and WhatsApp testing flows, monitoring signals and a timeline, but no README. The submitted claim of electronic-record integration, personalised flare prediction and medication-side-effect differentiation could not be established from the repository landing page.

**Demo-observed:** The Drive MOV loaded and exposed a Transcript control, but no transcript text appeared. The video could not be converted into a text transcript during this pass.

## Cross-submission observations

1. **Deterministic authority is a common design choice.** CareLoad, CareBuddy, Gutsy, Ember, and Morning Rounds all explicitly keep consequential scheduling, safety, escalation, or detection logic outside the language model.
2. **Most prototypes are intentionally synthetic and seeded.** This improves demo reliability but means claims about integrations, personalisation, learning, and continuous monitoring should not be inferred from the demo alone.
3. **CareLoad and Gutsy expose the broadest end-to-end patient workflows.** CareLoad focuses on workload compilation and replanning; Gutsy focuses on IBD evidence, simulated fulfilment, and governed care transitions.
4. **CareBuddy and Morning Rounds are the clearest closed-loop designs.** CareBuddy tracks one action to resolution across patient/family/clinician roles; Morning Rounds optimises the clinician's attention queue and message-approval workflow.
5. **Ember is differentiated by pre-product safety evidence.** Its centre of gravity is the Gate 0 evaluation harness and deterministic safety floor rather than feature breadth.
6. **Aura has the largest gap between submitted intelligence claims and observed implementation.** The live interface is polished and interactive, but its data, predictions, confidence values, patient totals, and care queue are hard-coded in the shipped client.
7. **Chrona could not be verified.** The repository link returned 404 and the submission provided no demo.
8. **Threads has a material demo-to-code gap in transcription.** Its longitudinal record and deterministic/Gemini fallback are present, but the submitted Runware voice-transcription path deliberately reports that the integration is unsupported.
9. **eHome is unusually explicit about ambiguity and identity attribution.** Its synthetic trap days demonstrate rejection, guest mode, and reattribution instead of converting every sensor event into a patient measurement.
10. **Alaga and Loop depend heavily on functionality outside the independently inspectable demo evidence.** Alaga submitted no demo, and Loop's Drive folder was empty; Loop's patient-facing OpenClaw bot is also outside the submitted repository.
11. **Darwin has the broadest action surface among the new entries.** Its repository and video cover voice calling, research-linked alerts, test-kit checkout, documents, and calendar actions, but the evidence base count differs between the submission and README and the clinical/predictive claims remain unvalidated.
12. **Persistence Engine has the strongest research-discipline story among submissions 13–42.** It separates data generation from fitting, tests synthetic calibration and uplift honestly, and repeatedly refuses to promote simulated response effects into clinical claims.
13. **Cadence, PCOScope, Endo Loop, Steady and HomeRounds have the clearest repository-backed product loops in the later batch.** Each has connected patient/clinician or input/evidence/action surfaces rather than only a landing page.
14. **Several submitted links materially limit verification.** Mind The Gap, HARE and Alongside did not resolve to inspectable repositories; ATTUNE's repository is empty; Adher.ai links to a deployed app instead of source; Scout & Sage and Alongside submitted empty Drive folders.
15. **Some submission-to-source discrepancies are significant.** PenPal's README is still the stock chatbot template, Solace's repository is a generic health-data backbone, and Respirate.ai's stated accuracy conflicts with its current README wording/arithmetic.
16. **The strongest live demos in the later batch are Persistence Engine, Concord, Steady, Endo Loop and Cadence.** They expose concrete states and workflows with visible synthetic/prototype boundaries. HARE also loads but clearly labels its sensing as simulated.
17. **Camera and voice claims require careful evidence separation.** Forma's video says AI analyses images while the submission says raw images are never uploaded; Undertone's acoustic biomarkers are a browser proof of concept with roadmap stubs; PenPal's camera coaching was not exercised; ATTUNE's claimed rPPG code could not be inspected.
18. **The refreshed gallery total is 42.** The research now contains one numbered section for every visible submission.
