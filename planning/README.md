# HomeRounds planning package

**Prepared:** 16 July 2026  
**Status:** Checkpoint 0 scaffold and frozen-contract baseline in validation  
**Scope:** hackathon prototype plus the gated path to a production clinical product

## Read this first

HomeRounds is an **adaptive asynchronous clinical round**, not a symptom checker, chatbot, phone diagnosis, or remote-monitoring dashboard. It begins with a source-grounded longitudinal snapshot, gathers the smallest additional piece of evidence that can change a permitted next action, rejects unusable captures, executes versioned deterministic rules, and closes with one patient instruction plus an auditable clinician handoff.

The source directory contains an already-extracted `HomeRounds_Source_Package`; there is no zip file in the workspace. The workspace is initialized on `main` and linked to the public repository `https://github.com/AbhinavGupta707/eMed.git`. Worktrees begin only after Checkpoint 0 reviews, commits, and pushes the tested integration baseline.

## Planning documents

1. [00_PRODUCT_STRATEGY.md](./00_PRODUCT_STRATEGY.md) — product thesis, users, wedge, judge fit, resolved MVP, pressure test, and cut line.
2. [01_TECHNICAL_ARCHITECTURE.md](./01_TECHNICAL_ARCHITECTURE.md) — architecture decisions, stack, data contracts, PPG design, AI boundaries, privacy, deployment, and production path.
3. [02_WORKTREE_ORCHESTRATION_PLAN.md](./02_WORKTREE_ORCHESTRATION_PLAN.md) — sequential checkpoints, non-overlapping worker lanes, ownership, merge order, exits, and worker prompt contract.
4. [03_REQUIREMENTS_AND_TEST_PLAN.md](./03_REQUIREMENTS_AND_TEST_PLAN.md) — requirement traceability, automated tests, browser/device QA, performance budgets, and demo acceptance.
5. [04_RISKS_ASSUMPTIONS_AND_QUESTIONS.md](./04_RISKS_ASSUMPTIONS_AND_QUESTIONS.md) — contradictions, risk register, open decisions, limitations, and evidence register.
6. [05_PRODUCTION_ROADMAP.md](./05_PRODUCTION_ROADMAP.md) — post-hackathon clinical, regulatory, integration, validation, and scaling gates.
7. [06_RESEARCH_AND_SOURCE_AUDIT.md](./06_RESEARCH_AND_SOURCE_AUDIT.md) — source inventory, event facts, research findings, dependency implications, and provenance of key recommendations.
8. [07_KICKOFF_DECISIONS_AND_INTEGRATIONS.md](./07_KICKOFF_DECISIONS_AND_INTEGRATIONS.md) — resolved kickoff choices, adaptive worktree counts, account/API requirements, iPhone testing, sensor options, protocol explanation, and readiness gate.
9. [08_VOICE_TEXT_AND_AUTONOMOUS_EXECUTION.md](./08_VOICE_TEXT_AND_AUTONOMOUS_EXECUTION.md) — voice-provider comparison, text-access contract, no-key policy, heartbeat, session choice, and autonomous control loop.

## Frozen recommendation

- Build one Next.js/TypeScript application with patient and clinician routes in a pnpm/Turborepo monorepo.
- Implement local rear-camera **finger PPG** and server-proxied VitalLens face rPPG behind one normalized contract; release-select exactly one after physical iPhone comparison. Local PPG is the no-key default.
- Use a deterministic structured question as the only follow-up module. Do not build medication OCR, respiratory rate, movement, OnePlan, wearable OAuth, or live EHR connectivity during the hackathon.
- Keep the round manager, protocol evaluator, quality gate, urgency, and action selection in ordinary deterministic TypeScript.
- Use ElevenLabs ElevenAgents as the hosted voice implementation behind `VoiceSessionProvider`, with visible/editable transcript confirmation and a complete `disabled`/text path. Voice cannot diagnose, set urgency, alter medication, or create unregistered actions.
- Use PostgreSQL with a repository boundary, local container for the primary laptop deployment, and managed PostgreSQL for the hosted HTTPS backup.
- Store derived values and quality evidence only; raw video storage is off. Local finger PPG sends no frames. A selected VitalLens path may transmit only its documented downsampled inference payload through a server proxy and must disclose that boundary.
- Treat every threshold and pathway as `demo-only`, use synthetic/de-identified data only, and never imply that the prototype is clinically validated.
- Run worktree checkpoints sequentially. Within a checkpoint, launch only lanes with exclusive path ownership. The integration task owns root configuration, the lockfile, shared contracts, migrations after the schema checkpoint, and all cross-lane fixes.

## Execution state

The owner has authorised Checkpoints 0–6, Vercel + Neon, ElevenLabs primary voice, both isolated optical adapters, Maya's hero story, and Aisha's resilience walkthrough. Remaining human-only gates—provider sign-in, VitalLens data-boundary opt-in, physical iPhone acceptance, repository visibility, and clinical wording review—are non-blocking for the no-key local build and are tracked explicitly rather than guessed.

## Definition of a successful hackathon build

The product is successful only if the seeded trigger, deterministic red-flag gate, voice/text round, real quality-gated selected measurement, adaptive follow-up, deterministic protocol decision, idempotent clinician task, patient outcome, and source-grounded evidence card work end to end without terminal or database edits. The main path must pass three consecutive times on the actual iPhone 12, with visibly labelled fallbacks for voice and capture failures.
