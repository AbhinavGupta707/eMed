# Judge alignment and strict self-score

## Official criteria

The [official event listing](https://luma.com/aiengine-zado) names four criteria without published weights:

- **User impact:** Does this genuinely improve life for a patient managing a chronic condition? Is the need real and the solution meaningfully better than what exists?
- **Innovation:** Is this a novel approach—something that could not have existed two years ago or reframes the problem in a surprising way?
- **Feasibility:** Could this be built and deployed in the real world?
- **Demo quality:** Can the team show it working, even in prototype form? A live demo or convincing walkthrough matters more than slides.

No official numerical scale or weighting was verified. The 25-point scores below are an internal equal-weight judging simulation only; they are not organizer scoring.

## Criteria alignment

| Criterion    | Judge argument                                                                                                                                                                                     | Visible proof                                                                                                                                                                                              | Honest boundary                                                                                                                                 |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| User impact  | Patients should not have to interpret scattered signals, repeat context, or wonder who owns the next step; clinicians should receive a reviewable episode rather than another disconnected reading | Two-minute structured round, one no-measurement review action, evidence chain, persisted clinician completion, patient completion refresh                                                                  | No real-user research, outcome, burden-reduction, or clinical-utility evidence yet                                                              |
| Innovation   | The smallest-reliable-assessment thesis reframes AI health support from conversation/data collection to evidence-gated care orchestration                                                          | Unequal authority across voice/text, optical quality, deterministic protocol/action, and audit; abstention still completes a workflow                                                                      | AI voice is optional and not live-verified; deterministic core—not model novelty—is the main differentiator                                     |
| Feasibility  | Commodity web stack, explicit adapters, Zod boundaries, PostgreSQL transactions, no-key mode, deployment/runbooks, and extensive automated checks make the prototype technically credible          | Exact repository paths, 13-package gates, fresh PostgreSQL tests, protected local production-build access/readiness checks, separate Playwright/integration closed-loop suites, recovery and security docs | Hosted deployment, provider accounts, physical device, real identity/integration, clinical validation, and production operations remain pending |
| Demo quality | The product can show a visible patient → abstention → task → clinician → patient loop in under three minutes, plus red-flag and recovery variants                                                  | Primary script uses actual labels and observable persisted state; recovery script and exact reset exist                                                                                                    | Passing live camera/voice would add spectacle but cannot be claimed at this evidence base                                                       |

## Strict panel simulation

| Criterion    |   Score / 25 | Confidence                                      | Panel reasoning                                                                                                                                                                                                                                                                                     |
| ------------ | -----------: | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User impact  |           18 | Medium                                          | The user and workflow pain are specific, and the closed loop is more useful than a generic coach. The score is capped because there is no patient/clinician research, real workflow comparison, or demonstrated benefit.                                                                            |
| Innovation   |           21 | High                                            | “Abstention that still completes an owned action” and the explicit authority split are memorable and domain-specific. It avoids the familiar AI-chatbot trap. It is not yet a 22–25 because the optional AI/provider experience is not live-proved and parts of the stack are established patterns. |
| Feasibility  |           19 | High for prototype; low for clinical deployment | The repo has unusually strong deterministic, persistence, testing, privacy, and operations evidence for a hackathon. Real-world feasibility is materially reduced by identity, clinical governance, device validation, provider/privacy, integration, hosting, and operational ownership gaps.      |
| Demo quality |           17 | Medium                                          | The no-key closed loop is coherent, reproducible, and safe to show. It lacks current hosted, physical-device, live voice, and final video evidence, so a judge cannot yet verify the most cinematic parts.                                                                                          |
| **Total**    | **75 / 100** | **Medium**                                      | Strong submission with a prize-contender idea, but external demonstration and real-user evidence are not yet prize-contender complete.                                                                                                                                                              |

## Panel critique

### Product judge

**Strongest point:** HomeRounds names a concrete failure in chronic-care operations: not merely missing data, but missing evidence-to-action closure. The patient and clinician both get a visible next state.

**Likely objection:** “Why would this genuinely improve a patient’s life rather than add another check-in?”

**Answer now:** The prototype demonstrates a bounded mechanism—ask only a fact that can change an allowed action, stop at a burden limit, and preserve uncertainty. It does not claim improved outcomes or lower burden.

**Fix needed:** Add 3–5 short interviews or structured mentor reviews with patients/clinical operations using the fictional scenarios. Capture current workflow, most costly handoff gap, comprehension, perceived burden, and whether the evidence card would reduce follow-up reconstruction. Do not convert feedback into outcome claims.

### Innovation judge

**Strongest point:** The memorable move is not phone PPG or voice alone. It is using multimodal AI as a bounded interface around a deterministic episode, with quality abstention treated as useful evidence and persistence closing the loop.

**Likely objection:** “Is this just a rules engine with an optional voice wrapper?”

**Answer now:** The deterministic core is intentional because the domain needs auditability. AI makes the interaction adaptable and human; it proposes editable context at the multimodal boundary. The product innovation is the orchestration and division of authority, not autonomous clinical judgment.

**Fix needed:** If the live ElevenLabs gate passes, show one spoken sentence becoming editable text in 8–12 seconds, then immediately show that structured red flags and actions remain code-owned. If it does not pass, keep the text-first story and never imply live AI.

### Feasibility judge

**Strongest point:** The repository shows real contracts, tests, PostgreSQL behavior, secure demo access, recovery, deployment configuration, and explicit gaps—not a slide architecture.

**Likely objection:** “Could this be deployed safely in real chronic care?”

**Answer now:** Not yet. This is a synthetic, fictional-protocol technical prototype. The production path requires a narrow intended purpose, clinical governance, identity/tenancy, validated optical/device performance, real integration provenance, provider agreements, named operational ownership, shadow evaluation, security/privacy review, and regulatory assessment.

**Fix needed:** Complete the external hosted gate and present the production roadmap as staged evidence, not imminent launch. Record the exact deployed SHA, Vercel/Neon identifiers, database branch/migration, readiness result, access controls, and recovery evidence.

### Demo judge

**Strongest point:** A judge can see one surprising and credible moment: **No numeric measurement accepted**, followed by a real clinician task and completion. Failure becomes a safe, useful workflow outcome.

**Likely objection:** “Where is the impressive live multimodal moment?”

**Answer now:** The no-key text and no-measurement loop is the approved evidence. Both optical adapters and optional voice exist, but live physical/provider claims remain gated.

**Fix needed:** Record the primary no-key demo now. Separately attempt the physical finger-PPG and live voice gates. Add either only if stable and honestly labelled; the demo must remain complete without them.

## Highest-leverage fixes before judging

Ordered by score impact and risk:

1. **Record the exact 75-second recovery and 2:30–2:45 primary video** from the candidate, including persisted clinician completion and patient refresh.
2. **Complete and document the hosted Vercel/Neon gate** or state clearly that judges reproduce locally. A broken/unverified public URL would hurt more than no URL.
3. **Run the physical iPhone/Safari matrix** with exact device/OS/browser and preserve failure as a valid result. Do not force a passing measurement.
4. **Attempt live ElevenLabs only after account/privacy configuration review.** Keep the text path as the main route.
5. **Capture the seven core screenshots** in [MEDIA_PLAN.md](./MEDIA_PLAN.md) from the exact candidate; avoid asset clutter.
6. **Get one qualified wording review** for the fictional red flags, protocol copy, and task/service-window labels. This does not create clinical validation.
7. **Add lightweight user/operations feedback** if event access permits; label it qualitative and synthetic-scenario-based.
8. **Run or explicitly waive the current dependency advisory** through the privacy-approved owner route. Do not say “zero vulnerabilities” based on historical evidence.

## Judge-question answers

### “What does AI actually do?”

Optional ElevenLabs voice helps capture natural spoken context and turns it into an editable proposal. AI does not decide urgency or actions. The text path proves the workflow independently, while the deterministic state machine, quality gate, planner, protocol, and action service constrain the product.

### “Why not use a normal questionnaire?”

A normal questionnaire asks a fixed set of questions and ends with data. HomeRounds maintains a bounded episode, selects only an eligible next assessment, rejects unusable evidence, applies a versioned rule, creates one owned action, and returns clinician completion to the patient.

### “Why phone-camera heart rate?”

It is a low-friction example of evidence that can be attempted at home and must be quality-gated. It is not the product moat or a medical claim. The architecture can also choose no optical measurement. A real programme should use a validated method appropriate to its intended purpose, population, and device environment.

### “Why two optical options?”

They demonstrate a provider-neutral contract and different privacy/availability boundaries: local finger PPG sends no frames; VitalLens is optional, consent-gated, and server-proxied. Exactly one is selected per release/round. There is no live comparative result or accuracy claim.

### “What happens when the model or provider fails?”

Voice falls back to complete structured text. A missing VitalLens configuration is typed unavailable. Optical failure creates no measurement. The workflow can create a review task from explicit uncertainty. The system does not silently swap providers or infer success.

### “Is this ready for real patients?”

No. It is synthetic-only, fictional-protocol, not clinically validated, not diagnostic, not a medical device, and not a real care service. The repository shows production-shaped boundaries and a staged validation path, not production readiness.

### “Does it integrate with eMed?”

No live eMed integration is implemented or claimed. HomeRounds is designed as an adaptive orchestration concept that could sit alongside a clinician-led at-home programme, subject to real APIs, identity, governance, provenance, and operational validation.

## Final go/no-go

The package is ready to submit as a **locally evidenced synthetic prototype**. It is not ready to claim a public hosted product, live provider, physical-device validation, comparative optical performance, clinical utility, or production readiness. If organizers require a public URL or video, those assets remain blocking submission items until completed and verified.
