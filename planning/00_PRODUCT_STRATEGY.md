# HomeRounds product strategy and resolved MVP

## 1. Executive conclusion

HomeRounds is a strong hackathon concept because it reframes at-home chronic care from “collect more signals” to **run the smallest useful asynchronous clinical round and complete the next care action**. The differentiator is not the model, the camera measurement, FHIR, or a clinician dashboard in isolation. It is the closed, auditable loop:

> Notice meaningful change → gather one missing fact → verify evidence quality → apply bounded rules → complete one permitted action → hand off with provenance.

For the hackathon, this is a high-potential entry. For production, it remains a hypothesis until the team proves that adaptive rounds increase the proportion of clinician reviews that are actionable without increasing missed safety criteria or patient burden.

## 2. What is actually being built

### Product category

**Adaptive asynchronous clinical assessment and care orchestration for adults enrolled in clinician-supervised chronic-care programmes.**

### Patient promise

“You do not need to interpret every symptom and data point yourself or repeat your whole history. HomeRounds asks only what can change the next action, helps you collect usable evidence, and tells you clearly what happens next.”

### Clinician promise

“You receive a prioritised, source-grounded case with the patient’s words, longitudinal change, capture quality, matched rule, uncertainty, actions already completed, and a clear response workflow.”

### Programme-operator promise

“HomeRounds converts fixed check-ins and weak signals into fewer, more actionable episodes while preserving human oversight, auditability, and configurable clinical pathways.”

### Primary user and buyer

| Role                     | Immediate job                                                            | Failure cost                                                 | Hackathon representation                   |
| ------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------ |
| Patient                  | understand whether a change needs action and complete a low-burden check | anxiety, delay, unnecessary contact, unsafe reassurance      | mobile patient PWA                         |
| Clinical operations user | review the right cases with enough evidence to act quickly               | alert fatigue, missed deterioration, repeated history-taking | clinician queue and evidence card          |
| Programme operator/eMed  | improve continuity, adherence, and capacity between scheduled contacts   | workload, poor programme outcomes, fragmented workflows      | synthetic workflow adapter and audit trail |
| Caregiver                | help with an explicitly consented task                                   | privacy overreach or accidental substitution for care team   | production roadmap only                    |

## 3. Why this fits the event

The event asks for novel AI-powered at-home chronic-condition management and judges user impact, innovation, feasibility, and demo quality. HomeRounds maps cleanly to all four:

| Criterion    | HomeRounds argument                                                                                     | What must be visible live                                      |
| ------------ | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| User impact  | less interpretation burden for the patient and higher-information asynchronous review for the care team | one believable patient story and one completed clinician task  |
| Innovation   | a planner selects the next useful assessment instead of using a fixed form or passive alert             | the live result changes whether a follow-up question is needed |
| Feasibility  | commodity phone, synthetic FHIR, deterministic rules, human oversight, and adapter boundaries           | real quality-gated capture plus real persisted action          |
| Demo quality | voice, physical interaction, visible quality, consequential action, second interface                    | no slide-only component in the critical loop                   |

The official event window is approximately 20 elapsed hours, with build complete at 15:00 on 18 July. This makes a single polished vertical slice the correct strategy.

## 4. Resolved hero story

### Fictional patient

Maya is an adult in a clinician-supervised GLP-1 programme with type 2 diabetes, hypertension, and cardiovascular risk. All records are synthetic and the UI visibly says so.

### Seeded trigger

The ordinary dashboard looks broadly positive, but HomeRounds combines four small changes:

- resting-heart-rate trend above Maya’s personal baseline;
- lower activity over seven days;
- reported fatigue or a missed check-in;
- a synthetic refill-status gap.

The trigger is precomputed and deterministic. It starts a round rather than creating an alert.

### Round flow

1. Maya accepts a “two-minute check” invitation.
2. The application runs a deterministic, structured red-flag gate. Voice may read or capture answers, but the state machine owns the required questions and cannot skip them.
3. Maya reports weakness and intermittent palpitations.
4. The deterministic planner selects the single active optical heart-rate provider because the device is eligible and the result can alter the next question. Both `finger_ppg_hr_v1` and `vitallens_face_rppg_v1` are implemented behind one contract; a release flag selects exactly one patient-visible provider after physical-iPhone comparison. No round silently switches providers.
5. The phone displays provider-appropriate camera guidance, illumination/coverage or face positioning, frame/capture progress, duration, and quality. No number appears until quality passes.
6. The planner follows one of three honest branches:
   - **Valid and materially different from the demo baseline:** skip the extra symptom question and evaluate the pathway.
   - **Valid and not materially different:** ask one structured follow-up about current/persistent palpitations; the scripted fictional patient answer completes the pathway.
   - **Still poor after one retry:** abstain and create a review task for inadequate evidence.
7. A fictional, versioned, deterministic demo pathway selects a same-day review or abstention review. The model cannot set this urgency.
8. An idempotent action creates exactly one clinician task and follow-up window.
9. Maya sees one plain-language next step, who will respond, expected timing, and worsening/emergency guidance.
10. The clinician cockpit shows the trigger, sources, patient report, real measurement, quality evidence, rule/version, missing facts, audit events, and approve/edit/contact controls.

This design does not force the presenter’s live pulse to cross a made-up threshold. The live measurement changes the information path; the synthetic patient report and fictional protocol determine the demo care workflow.

## 5. Three-minute demo script architecture

|      Time | Screen                 | Proof point                                                                   | Failure-safe transition                                                                 |
| --------: | ---------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 0:00–0:20 | longitudinal dashboard | the visible dashboard still looks acceptable; a combined trend starts a round | pre-seeded trigger always available after reset                                         |
| 0:20–0:50 | patient round          | contextual voice, captions, explicit purpose, deterministic red-flag step     | text buttons can complete the same schema                                               |
| 0:50–1:35 | optical capture        | physical phone interaction and quality gating                                 | one retry, then labelled replay of a previously valid real capture or abstention branch |
| 1:35–2:00 | adaptive step          | live value changes whether one follow-up is asked                             | deterministic branch, no free-form planner                                              |
| 2:00–2:30 | outcome                | versioned protocol creates one persisted same-day task                        | idempotency badge and task ID visible                                                   |
| 2:30–3:00 | clinician cockpit      | evidence, uncertainty, source, quality, rule, action, audit                   | queue is already open in a second browser tab                                           |

Target the rehearsed run at 2:35–2:45, not 2:59, to absorb permission and network latency.

## 6. Product boundaries

### The model may

- conduct a bounded voice/text conversation;
- turn patient speech into a strict `PatientReport` schema;
- explain a deterministic module-selection rationale in plain language;
- draft source-grounded clinician and patient summaries from structured facts;
- ask for clarification when the application explicitly permits it.

### The model may not

- diagnose or rule out a condition;
- set urgency;
- decide that no emergency exists;
- change medication or a formal care plan;
- invent a module, score, threshold, rule, fact, or action;
- accept or reinterpret a failed-quality measurement;
- call an unregistered tool or bypass approval.

### Secondary seeded walkthrough: Aisha's multimodal resilience round

Aisha is a second fictional programme member with hypertension and a recent pattern of dizziness. This is a seeded demonstration/evaluation fixture, not a second clinical pathway. It exists to show the product breadth without diluting Maya's three-minute hero:

1. Aisha begins by voice, watches the live transcript, corrects one answer by keyboard, and confirms the structured report.
2. The app reads longitudinal FHIR-shaped observations and a manual home blood-pressure entry, with provenance visible for each fact.
3. The selected optical provider deliberately receives a poor-quality fixture, coaches one retry, and then either records a quality-passing pulse or abstains without inventing a value.
4. A deterministic red-flag answer demonstrates the hard stop: voice narration cannot override the state machine or choose urgency.
5. The no-key toggle disables hosted voice and VitalLens while the complete text, manual-evidence, action, audit, and clinician-review loop still succeeds.
6. The clinician view exposes transcript provenance, typed correction, sensor quality, missing evidence, rule version, task idempotency, and the patient-facing next step.

This walkthrough is suitable for GitHub screenshots, automated E2E scenarios, and judge questions. The live pitch still follows Maya unless a judge asks about degraded operation or modality breadth.

### Explicitly cut from the hackathon

- medication OCR/package scan;
- presenting two optical providers in one patient round, automatic cross-provider fallback, respiratory-rate/HRV claims, movement, gait, wound, or voice-biomarker modules; both optical implementations may exist behind one release-selected adapter for comparison;
- OnePlan reconciliation;
- wearable OAuth;
- live eMed/EHR/SMART/HealthKit/Health Connect integrations;
- live patient identity, caregiver mode, billing, employer analytics;
- raw-video upload or storage;
- multiple conditions or multiple clinical pathways;
- autonomous medication, diagnostic, or care-plan changes.

The cut list is a quality decision. None of these additions tests the riskiest hackathon assumption better than a reliable closed loop.

## 7. Startup pressure test

### Verdict

**Strong hackathon concept; conditional production business.** The pain and differentiation are credible, and eMed is a plausible design partner and distribution surface. The product becomes real only when it demonstrates that adaptive evidence gathering improves actionability and burden against fixed check-ins and existing clinical operations—not when the demo optical measurement looks impressive.

### Scorecard

| Area              | Score | Evidence-based read                                                                                                               |
| ----------------- | ----: | --------------------------------------------------------------------------------------------------------------------------------- |
| Pain intensity    |   4/5 | patients struggle with ambiguity and fragmented instructions; clinical teams face alert and review burden                         |
| Buyer clarity     |   3/5 | programme operators and clinical operations leaders are plausible buyers, but budget owner and procurement path are unproven      |
| Urgency           |   4/5 | chronic-care capacity and adherence are active problems, but adoption competes with operational and regulatory priorities         |
| Differentiation   |   4/5 | the assessment-selection and closed-action loop is distinct from dashboards, symptom checkers, and dedicated-hardware exams       |
| Speed to validate |   3/5 | workflow usefulness can be tested quickly in shadow mode; clinical safety and outcome claims cannot                               |
| Founder advantage |   2/5 | access to eMed/event mentors helps, but the team’s clinical, signal-processing, and enterprise-health experience is not yet known |

### Core assumption

For a defined chronic-care pathway, selecting one additional low-burden assessment based on longitudinal context will produce a higher proportion of actionable clinician reviews, at equal or lower patient and clinician burden, without worsening missed safety criteria.

### Most dangerous flaws

| Risk                                            | Why it can kill the product                                                                                                    | Fastest honest test                                                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Clinical usefulness is inferred from demo logic | a polished flow can still create more review work or false confidence                                                          | retrospective/shadow replay on labelled synthetic or de-identified cases; compare with clinician decisions       |
| Workflow ownership fails                        | a “real task” is unsafe if nobody owns, acknowledges, and escalates it                                                         | test routing, acknowledgement, SLA breach, and fallback with clinical operations users                           |
| Sensor quality is overclaimed                   | the cited validation used proprietary code, a controlled protocol, and specific devices; this implementation is not equivalent | controlled technical comparison across target phones and a reference device; describe as a demo measurement only |

### Real competition

- **Current behaviour:** scheduled check-ins, patient messages, phone calls, manual chart review, and clinicians deciding what extra information to request.
- **Direct/adjacent platforms:** eMed’s existing programme tools, remote-patient-monitoring platforms, symptom checkers, clinical copilots, and TytoCare-style remote physical examination.
- **Real enemy:** status quo workflow and liability. Switching requires proof that HomeRounds reduces work and preserves clear ownership, not only that its interface is better.

### First real validation cohort

The first “customers” should be one internal chronic-care clinical-operations team and its pathway owner, not direct-to-consumer patients. Run 20–50 historical or simulated rounds in shadow mode; require case-by-case clinician labels; then expose evidence cards to 3–5 reviewers without sending patient actions. Success is behavioural: reviewers consistently judge the cases actionable, need fewer follow-up contacts, and do not identify missed safety criteria.

## 8. Success metrics

### Hackathon

- main flow completes under 2:50;
- three consecutive successful runs on the actual phone;
- zero unsupported claims in UI, voice, docs, and demo script;
- poor capture never yields a measurement;
- repeated action requests yield one clinician task;
- red-flag path bypasses the ordinary flow;
- patient sees one next action and clinician sees complete provenance.

### Pilot hypothesis metrics

- actionable-review precision;
- missed pathway criteria and inappropriate reassurance;
- median patient minutes and questions per resolved round;
- clinician review time and number of additional contacts;
- approval/edit/reject rate for drafted handoffs;
- capture pass/retry/fail rate by supported device and relevant subgroup;
- task acknowledgement and time to action;
- patient comprehension and perceived control.

## 9. Blue-sky destination

The long-term product is a shared safety, data, and workflow substrate supporting separately validated “round packs”: GLP-1 side effects, cardiometabolic change, hypertension, heart failure, post-discharge recovery, women’s health, diabetic-foot serial imaging, and respiratory disease. Each pack has its own intended use, evidence, protocol owner, modules, subgroup/device validation, hazards, and change-control record.

The moat is the accumulated registry of validated low-burden modules, pathway-specific selection policies, personal baselines, device/subgroup quality evidence, links between assessment choice and actual care actions, and audited integration into clinical operations. It is not an LLM wrapper.
