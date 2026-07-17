# HomeRounds production roadmap

Status: post-hackathon roadmap; not part of the 20-hour build promise

## 1. North star

The long-term product is a configurable system for adaptive, asynchronous clinical rounds across chronic-care programmes. Each round gathers the minimum additional information needed, applies a versioned clinical protocol, creates an owned action when appropriate, and leaves a complete evidence trail for patients and clinical teams.

The expansion sequence is deliberately evidence-gated. Additional condition packs, sensors, or autonomy are not unlocked by technical readiness alone.

## 2. What “production” would actually require

The hackathon architecture can demonstrate sound boundaries, but a real deployment also needs:

- an explicit intended purpose, target population, jurisdiction, and clinical claims;
- regulatory classification and a documented evidence strategy;
- clinical risk management and a Quality Management System;
- identity, tenancy, consent, authorization, patient matching, and operational ownership;
- validated EHR/eMed integration and source-data provenance;
- security, privacy, data residency, retention, incident response, and supplier assurance;
- clinical evaluation of measurement, protocol, patient comprehension, bias, and workflow outcomes;
- monitored service levels, rollback, model/protocol change control, and post-market surveillance.

“AI with deterministic guardrails” is necessary but not sufficient.

## 3. Release gates

### Gate 0 — hackathon proof

Objective: demonstrate the closed loop using fictional data.

Required evidence:

- one complete patient → measurement → protocol → task → clinician → patient path;
- explicit measurement-quality abstention;
- deterministic safety and action logic;
- idempotent action and audit evidence;
- physical-device feasibility on at least one named phone/browser;
- three consecutive demo runs and a clearly labelled fallback;
- all limitations and synthetic-data status visible.

Go criterion: the engineering claim is reproducible and the team can explain exactly which decisions are code-owned versus model-assisted.

### Gate 1 — internal technical prototype

Objective: make the system operable by an internal product/clinical engineering team without real patient recommendations.

Workstreams:

- real identity provider, role model, tenant isolation, consent/notice scaffolding;
- managed PostgreSQL with backups, point-in-time recovery, encryption, environment isolation, and migration discipline;
- versioned protocol authoring/review/publish/rollback workflow;
- complete model, prompt, protocol, algorithm, data-source, and human-action provenance;
- structured observability, SLOs, alerts, runbooks, incident classification, and recovery drills;
- supplier/data-flow inventory including OpenAI retention, regional processing, BAA/Healthcare Addendum eligibility where relevant, and tracing policy;
- threat model, penetration-test plan, dependency/SBOM management, secret rotation, and disaster recovery;
- device/browser capability telemetry using non-clinical test users;
- initial clinical hazard log and human-factors risk analysis.

Exit evidence:

- tenant isolation and authorization tests;
- clean restore and rollback drills;
- protocol changes require named approval and are reproducible;
- no raw capture media is persisted; any approved provider inference boundary is minimized, consented, documented and verified;
- an internal safety/security review approves entry to shadow mode.

### Gate 2 — clinical shadow mode

Objective: compare HomeRounds recommendations/tasks with current practice while all outputs remain hidden from patients and non-authoritative for clinicians.

Workstreams:

- define one narrow intended population, programme, exclusion criteria, and action taxonomy;
- integrate a real sandbox/test eMed/EHR flow with patient matching, provenance, reconciliation, and outage handling;
- run retrospective cases and then prospective shadow rounds;
- have qualified clinicians independently label expected questions, escalation, abstention, and action;
- measure inter-rater agreement and adjudicate ambiguous cases;
- validate the selected phone optical method across named devices, OS/browser versions, skin tones, ages, conditions, medicines, lighting, motion, provider versions and accessibility needs;
- measure model extraction accuracy separately from protocol correctness;
- test patient-facing language for comprehension and false reassurance even though it is not yet delivered;
- begin formal clinical safety case and regulatory determination.

Decision metrics:

- actionable-round yield versus fixed check-in/control;
- sensitivity/specificity or appropriate tasking against the adjudicated reference for the defined use;
- abstention and capture-failure rate by subgroup/device;
- false reassurance/over-escalation rate;
- clinician review minutes and alert/task volume;
- percentage of events with complete provenance;
- material safety incidents: target zero.

Exit criterion: a named clinical governance body agrees that a narrow clinician-in-loop pilot is justified. Failing performance in any important subgroup blocks release or narrows the intended use.

### Gate 3 — clinician-in-the-loop pilot

Objective: use HomeRounds with a small controlled cohort while qualified clinical staff retain all required decision authority.

Initial operating boundary:

- one programme, one jurisdiction, a restricted set of reviewed protocols/actions;
- every clinical task has a named service owner, hours of operation, SLA, backup owner, and overdue escalation;
- patient messages are templated or clinician-approved according to the safety case;
- no emergency-monitoring promise and clear instructions for urgent symptoms;
- unsupported device/data/model states abstain safely;
- feature/model/protocol versions are pinned and changes use formal review.

Pilot work:

- onboarding, informed notice/consent as required, identity and accessibility support;
- operational training, playbooks, queue monitoring, escalation and downtime procedures;
- ongoing false positive/negative, abandonment, capture quality, clinician burden, and patient-comprehension review;
- incident reporting and independent safety monitoring;
- security testing and privacy impact assessment;
- rollback to current care process without loss of responsibility.

Exit criterion: predeclared safety, clinical, workflow, equity, and reliability thresholds are met; operations can staff the SLA; there is no unresolved serious hazard.

### Gate 4 — controlled regulated deployment

Objective: release within the legally and clinically approved intended purpose.

For a UK path, obtain qualified advice and determine applicability of MHRA medical-device rules, NICE's Evidence Standards Framework, NHS clinical-risk standards, DTAC, UK GDPR/DPIA, and local procurement/deployment obligations. The likely working assumption for planning is a higher-evidence, treatment/diagnosis-influencing digital-health tier, but classification must follow the final intended purpose and claims.

Required capabilities include:

- QMS, design history, requirements/risk/test traceability, supplier controls, change control, CAPA, and post-market surveillance;
- DCB0129 clinical safety documentation for the manufacturer and DCB0160 deployment safety work for each adopting organization where applicable;
- clinical evaluation and human-factors/usability evidence;
- algorithm/signal validation and documented contraindications/device compatibility;
- cybersecurity assurance, vulnerability disclosure, incident notification, continuity and recovery tests;
- production OpenAI/data-processor contracts and approved retention/residency configuration;
- model/prompt/protocol update validation with shadow/canary/rollback;
- trained clinical service, SLA monitoring, audit review, and patient support;
- accessible product evidence across target populations and assistive technologies.

Exit criterion: regulatory, clinical safety, privacy, security, operational, and executive owners sign off the exact release and claims.

### Gate 5 — scaled cardiometabolic product

Objective: expand within the validated cardiometabolic intended purpose.

Possible increments:

- additional reviewed pathways for obesity, type 2 diabetes, blood pressure, treatment adherence, and cardiovascular risk;
- validated external devices and home measurements through explicit adapters;
- clinician worklist optimization and programme-level operational analytics;
- caregiver access only with granular patient consent and role controls;
- multilingual and accessible voice/text experiences validated for comprehension;
- protocol portfolio governance, cohort monitoring, and device/algorithm compatibility registry.

Each increment receives its own hazard, evidence, subgroup, workflow, and rollback assessment. Shared platform code does not make a new clinical claim automatically safe.

### Gate 6 — modular HomeRounds platform

Objective: support condition-specific “assessment packs” and a longitudinal OnePlan without losing control of evidence or ownership.

Architecture evolution:

- signed/versioned pack manifests declaring facts, assessments, quality gates, rules, allowed actions, evidence, jurisdictions, contraindications, and UI copy;
- conformance suite every pack must pass before publication;
- policy engine for programme/tenant/jurisdiction compatibility;
- longitudinal fact graph with source, confidence/quality, time validity, conflicts, and consent boundaries;
- workflow routing with capacity/SLA awareness, never unowned autonomous escalation;
- simulation and shadow evaluation for any adaptive/learning component;
- registry of model, prompt, protocol, signal-algorithm, device/browser, and training/evaluation artifacts.

No online learning may alter patient-facing clinical behaviour directly. Candidate changes are evaluated offline/shadow, reviewed, versioned, and released through the same controlled process.

## 4. Evidence programme

### Technical evidence

- deterministic conformance suites for state, protocol, action, event, and adapter contracts;
- chaos/failure testing for database, model, network, EHR, queue and device failures;
- cross-browser/device signal-quality and lifecycle testing;
- security tests, SBOM, penetration testing, restore/rollback drills;
- load, latency, task-delivery, queue-overdue, and audit-completeness monitoring.

### Clinical evidence

- analytical validation of every derived measurement;
- clinical validation for the exact target use and population;
- prospective comparison against an adjudicated reference/current care;
- false negative/positive and abstention analysis;
- subgroup/device/environment performance and exclusion criteria;
- clinical-workflow and patient-outcome measures appropriate to the claim.

### Human-factors evidence

- patient comprehension of system purpose, uncertainty, next steps and emergency limitations;
- clinician interpretation of evidence/quality, task reason, ownership and override;
- voice/text parity and accessibility;
- use-error analysis under stress, poor connectivity, permission denial and incomplete data;
- alert/task fatigue and handoff failure analysis.

### Business/operational evidence

- actionable-task yield;
- clinician minutes per completed round;
- capture completion and patient abandonment;
- time to owned action and SLA compliance;
- avoided synchronous contacts or better-targeted contacts;
- programme retention/adherence, only after causal design is credible;
- cost per completed round and per appropriate action.

## 5. Production architecture evolution

Keep the hackathon boundaries, then replace their implementations deliberately:

| Hackathon component       | Production evolution                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| demo identity             | enterprise/patient identity, MFA where appropriate, tenant/role/consent policies                  |
| curated FHIR bundle       | validated eMed/EHR adapters, SMART/FHIR or approved APIs, patient matching and reconciliation     |
| one JSON protocol         | governed protocol registry, clinical authoring/review/signing/publish/rollback                    |
| local/managed PostgreSQL  | isolated managed environments, encryption, backup/PITR, replicas as justified, retention policies |
| direct persisted action   | durable queue/outbox, workflow routing, SLA timers, acknowledgement and escalation                |
| one Realtime session      | region/data-control-aware model gateway, policy enforcement, evaluation, fallbacks and monitoring |
| browser optical prototype | validated algorithm/provider/device matrix or regulated external device integration               |
| application audit table   | immutable/append-only governed audit pipeline and retention/export controls                       |
| manual demo reset         | controlled test-data/environment tooling separated from production                                |
| static dashboards         | operational, safety and quality monitoring with alert ownership                                   |

Do not introduce microservices merely for appearance. Split a service only when scaling, deployment, safety ownership, or regulatory change control materially benefits.

## 6. Worktree orchestration after the hackathon

Continue using checkpoint bases and exclusive ownership, but align lanes to durable bounded contexts:

1. identity/consent and tenancy;
2. clinical-record integrations;
3. protocol governance and conformance;
4. assessment/signal validation;
5. workflow/actions and SLA engine;
6. patient experience;
7. clinical operations experience;
8. security/platform/observability;
9. evidence/analytics and post-market monitoring.

Every regulated release checkpoint freezes:

- requirements and intended-purpose version;
- contract and data-schema version;
- protocol/model/algorithm versions;
- hazard log and risk controls;
- test/evaluation dataset versions;
- traceability and release evidence.

Worktree merges remain sequential at each checkpoint. Safety- or contract-affecting changes receive independent review, and the orchestrator never resolves a clinical rule conflict by guessing.

## 7. Recommended first 90 days after the event

### Days 0–14: decide whether to continue

- interview eMed clinical operations, programme owners, clinicians, and patients about current check-in/task workflows;
- map one current workflow, volumes, failure modes, ownership, SLA and costs;
- replay the prototype with 10–15 stakeholders using fictional cases;
- choose one intended use and write explicit non-goals;
- obtain regulatory/clinical-safety and privacy advice;
- decide whether any camera-based optical measurement is essential or whether a validated external device/questionnaire is a better first path.

Decision: stop, pivot, or fund Gate 1. Do not confuse hackathon enthusiasm with validated demand.

### Days 15–45: build Gate 1 foundations

- implement identity/tenancy, environment isolation, protocol governance, audit/observability, security baseline and recovery;
- secure the required platform/data agreements and define the data-flow/retention architecture;
- establish a clinical governance group, hazard log, product risk register and evidence plan;
- build an adapter against the actual sandbox/contract if available;
- define shadow-study protocol, outcomes, subgroups and adjudication.

### Days 46–90: run a bounded shadow evaluation

- freeze the evaluated versions and cases;
- conduct retrospective then limited prospective shadow rounds;
- measure clinical agreement, abstention, device quality, clinician burden and provenance completeness;
- review every disagreement and safety-relevant failure;
- update the economic model using observed workflow data;
- make a documented Gate 2/3 decision.

## 8. Expansion principles

- Earn every new clinical claim with evidence.
- Prefer fewer high-quality facts over more noisy measurements.
- Make uncertainty and abstention visible.
- Give every task an owner, SLA, acknowledgement, and fallback.
- Preserve patient text parity even if voice becomes the preferred experience.
- Treat model, protocol, signal algorithm, device support, and UI copy as independently versioned safety-relevant components.
- Do not use engagement, “AI autonomy,” or sensor novelty as a proxy for patient benefit.
- Keep a safe current-care fallback at every deployment stage.

## 9. Production go/no-go questions

Before any real patient-facing pilot, the accountable owners must answer yes to all of these:

1. Is the intended purpose and population precise enough to test and govern?
2. Is the responsible clinical service named, staffed, trained, and bound to the task SLA?
3. Is every measurement validated for the supported device/population/context or safely excluded?
4. Are false negatives, false positives, abstentions, and subgroup performance within approved bounds?
5. Can every output be traced to data, quality, rule, model/prompt where used, version, and human action?
6. Can model, integration, device, or network failure fall back without abandoning clinical responsibility?
7. Are regulatory, clinical safety, privacy, security, data-processing and deployment obligations approved?
8. Can the release be rolled back and current care restored safely?
9. Are patient and clinician users demonstrably able to understand uncertainty and next steps?
10. Does observed clinical/operational value justify the new risk and workload?

Any “no” blocks the release or narrows its intended purpose.
