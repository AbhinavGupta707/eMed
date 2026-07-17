# Live demo scripts

## Claim mode

The approved script may now demonstrate the protected Vercel/Neon Preview, a live ElevenLabs conversation through explicit structured-proposal confirmation, Fireworks selecting one eligible evidence module, an honest no-measurement quality outcome, and the persisted clinician handoff. It does **not** claim physical iPhone behavior, a passing live optical or hosted voice-feature measurement, live VitalLens, clinical accuracy, or a real clinical service.

The live voice insert is approved only for the exact Checkpoint 8 candidate and stable Preview recorded in `docs/orchestration/STATE.md`. Keep the passing-optical insert conditional on a fresh observed device capture.

## Operator setup

Prepare these tabs in this order:

1. Home page at `/`.
2. Patient scenario at `/round?scenario=maya-poor-quality` (do not advance it).
3. Clinician cockpit opened from the home page, with the scoped round references intact.
4. Optional backup: red-flag scenario at `/round?scenario=maya-red-flag`.

Before the audience arrives:

- Confirm the exact candidate SHA and runtime profile.
- Require `demo:check` to report the three scenarios ready and `postgres` for a PostgreSQL claim.
- Confirm the live ElevenLabs drift check and microphone permission before using voice; keep the complete text path ready as a no-key fallback.
- Keep the selected optical provider fixed for the round; never switch providers mid-round.
- Set browser zoom to 100%, close developer tooling, and verify the clinician tab has a valid separate role session where protected access is enabled.
- Rehearse at the actual viewport. The main script targets about 2:30–2:45 at a natural pace.

## Primary 2–3 minute script

### 0:00–0:20 — The proposition

**Screen:** Home page. Keep the hero, “One short check-in. One evidence chain. One clear next owner,” and the three authority rows visible.

**Say:**

> Most at-home tools collect more data. HomeRounds asks a sharper question: what is the smallest reliable check needed to complete the next safe care action? This is a synthetic, fictional-protocol prototype. The patient confirms the facts, quality decides whether a measurement exists, deterministic code owns the workflow, and the clinician sees the evidence.

**Exact claim:** HomeRounds implements these four boundaries in this repository. Do not say it improves health outcomes or is clinically safe.

### 0:20–0:52 — A bounded patient check-in

**Action:** Click **Poor signal, honest recovery**. Tick the synthetic-demo acknowledgement and click **Start the check**. Use the seeded scenario answers:

- Chest pain: **No**
- Severely short of breath: **No**
- Fainted: **No**
- Weakness: **Moderate**
- Palpitations: **I’m not sure**
- In **Your check-in text**, type: `I feel more weak today and I am not sure about the fluttering feeling.`
- Click **Confirm this text**, then **Confirm and continue**.

**Say:**

> Maya is fictional. Required safety answers are structured; narrative text cannot skip them. Voice is optional, but text completes the same workflow with no provider key. Even a voice transcript remains editable and untrusted until the patient confirms it.

**Operator cue:** If the selected values do not match, stop clicking and narrate only what is visibly selected. Never claim the scenario prefilled an answer it did not.

### 0:52–1:20 — Make uncertainty useful

**Action:** On **Next, prepare a short camera pulse check**, point to the provider and quality statements. Choose **Check this device**. If the local environment exposes a deterministic unsupported/failure state, show it. Otherwise use **Continue without a measurement**; do not fabricate a camera failure.

**Say:**

> The server selects one registered optical provider; the page cannot swap it. Local finger PPG is the no-key default and its provider path sends no frames. The important behavior is the abstention contract: failed, uncertain, unavailable, cancelled, or deliberately skipped capture creates no number.

**Screen proof:** Keep **No camera value was recorded** or **The demo stopped without a measurement** visible.

**Exact claim:** The no-measurement branch is implemented and covered by separate automated browser/integration evidence. Do not call this a failed live sensor unless a capture actually failed in front of the audience.

### 1:20–1:46 — Deterministic action

**Action:** On **Programme review requested**, point to the protocol version, fictional owner, and demo-only timing. Tick **I confirm creation of one synthetic programme-review task** and click **Create synthetic review task**.

**Say:**

> No model chooses urgency or invents a workaround. The versioned fictional protocol preserves the missing measurement, the allowlist permits a programme-review task, and the patient explicitly confirms it. The action service uses a stable idempotency key, so retries do not create duplicate work.

**Exact claim:** One synthetic task is persisted in the demonstrated PostgreSQL profile. Do not call it an appointment, escalation to eMed, or a real response window.

### 1:46–2:25 — Clinician evidence and closed loop

**Action:** Switch to **Clinician cockpit**. Reload the queue if needed and select the open synthetic task. Scroll through:

1. **Uncertainty and review boundary**
2. **Evidence chain**
3. **Measurement and quality** → **No numeric measurement accepted**
4. **Rule and decision**
5. **Task and action**
6. **Event and audit timeline**

**Say:**

> This is where the round becomes operational. The clinician sees the trigger and source, patient-confirmed structured report, explicit absence of a numeric measurement, quality reason, matched rule and version, task key, and returned audit events. Missing evidence stays missing; raw camera frames, face video, raw audio, and transcript are not displayed or persisted as workflow evidence.

**Action:** Click **Acknowledge**, then **Confirm**. Optionally click **Record contact** and confirm if rehearsal time remains. Click **Complete task**, then **Confirm**. Pause on **Persistence confirmed** and the audit reference.

**Say:**

> The UI shows success only after a schema-valid persistence receipt and audit reference return. Stale writes are refused and repeated completion uses a stable operation key.

### 2:25–2:43 — Return the result to the patient

**Action:** Switch back to the patient tab and refresh. Pause on **Synthetic review completed** and **Completed in clinician cockpit**.

**Say:**

> The patient now sees completion from persisted task state. AI can help the conversation. Quality decides whether evidence exists. Deterministic rules decide what is permitted. The audit trail carries the handoff. That is HomeRounds: one short check-in, one evidence chain, and one clear next owner.

## Evidence-class inserts

### Live ElevenLabs insert — replace 8–12 seconds in the patient section

Approved for the exact Checkpoint 8 candidate after the recorded live provider, account, permission, and candidate checks. If the session fails during the presentation, switch visibly to text parity; do not simulate the provider.

**Action:** Start voice, speak one short sentence, show the tentative/final text, edit a word, and confirm.

**Say:**

> This is the optional ElevenLabs path running live. The provider proposes text; Maya edits and confirms it. Voice still cannot answer the required safety controls, choose urgency, or execute an action.

Never claim zero provider retention, residency, medical suitability, or production approval without separate observed evidence.

### Passing local finger-PPG insert — replace the no-measurement section

Use only after the named physical device/browser gate passes and the live capture passes during the presentation.

**Say before capture:**

> This is an engineering-feasibility estimate on the named device, not medical-grade or clinically validated. No HomeRounds frame leaves the local finger-PPG provider path, and no number will appear unless quality passes.

If quality passes, say only:

> The configured quality gate passed and the demo accepted this derived estimate with its method, version, and quality provenance.

If quality fails, immediately return to the primary abstention wording. Never compare the number with VitalLens or a physical reference unless a separately designed comparison has been completed and approved for that exact claim.

## Recovery script: 60–90 seconds

Use this if the live environment is slow, permissions are unreliable, or the main demo is interrupted. It uses the already prepared poor-quality round and clinician task. Target 75 seconds.

### 0:00–0:15

**Screen:** Home hero, then immediately open the prepared patient outcome.

**Say:**

> HomeRounds asks for the smallest reliable at-home check that can complete the next safe care action. Patient confirmation, evidence quality, deterministic rules, and a persisted clinician handoff each have separate authority.

### 0:15–0:38

**Screen:** Show **The demo stopped without a measurement** or the saved **Programme review requested** outcome.

**Say:**

> In this synthetic round, the optical path did not produce accepted evidence. HomeRounds did not invent a number and did not silently switch providers. The fictional protocol preserved that uncertainty and created one patient-confirmed programme-review task.

### 0:38–1:05

**Screen:** Clinician cockpit at **Evidence chain**. Point to **No numeric measurement accepted**, protocol version, task key, and audit timeline.

**Say:**

> The clinician receives the confirmed report, explicit no-measurement state, quality provenance, matched rule, stable task key, and audit references—not a chatbot summary pretending to be a decision.

### 1:05–1:20

**Screen:** **Persistence confirmed** or patient **Synthetic review completed**.

**Say:**

> The AI helps the conversation. Quality decides whether evidence exists. Deterministic code owns the action. PostgreSQL carries the closed loop. That is HomeRounds.

## Failure lines

Use the first line that exactly matches what happened:

- **Slow page:** “The saved round is loading. The workflow restores persisted state but does not reuse ephemeral camera or transcript data.”
- **Camera denied/unsupported:** “This device did not permit the selected check. HomeRounds records no camera value and keeps the review path usable.”
- **Capture quality fails:** “The quality gate did not pass, so there is no measurement to interpret.”
- **Voice unavailable:** “Voice is optional. The complete structured text path is the authoritative recovery.”
- **Queue delay:** “The task is persisted; I’ll reload the explicitly scoped queue rather than infer success from the patient screen.”
- **Mutation conflict:** “The stale write was refused. I’ll reload the returned task state; HomeRounds does not overwrite newer work.”
- **Environment unavailable:** “I’ll use the clearly labelled backup walkthrough of this same candidate. It is recording evidence, not a live-system claim.”

## Reset cues

Reset only the three exact synthetic scenarios. Never truncate a database or delete unrelated rows.

Before a full rehearsal:

```bash
export DATABASE_URL='postgresql://homerounds:homerounds@127.0.0.1:5432/homerounds'
pnpm demo:reset --base-url http://127.0.0.1:3000
pnpm demo:check --base-url http://127.0.0.1:3000
```

Expected cue: all three scenario IDs are ready and the runtime profile is `postgres`. If not, do not present persistence as observed.

Between rapid rehearsals:

- Close all voice sessions.
- Stop active camera tracks by leaving the round only after the app reaches a safe terminal state.
- Reset, rerun the check, then reload both patient and clinician tabs.
- Ensure the patient and clinician sessions have the intended separate roles.

## Presenter red lines

Never say:

- “medical-grade,” “accurate,” “clinically validated,” “diagnostic,” or “safe for patients”;
- “real-time clinician response,” “same-day care,” or “eMed receives the task”;
- “deployed on Vercel/Neon” for any URL or commit other than the exact stable Preview recorded in the orchestration state;
- “tested on iPhone/Safari” when the evidence is Playwright layout/WebKit only;
- “live VitalLens”; for ElevenLabs, claim only the exact observed conversation/proposal path and never clinical suitability or retention guarantees;
- “no vulnerabilities” when the current external dependency-advisory gate is pending;
- “no accessibility issues”; the allowed statement is zero serious/critical axe findings in the specified automated runs;
- “both optical methods agree” or any comparative physical/accuracy claim.
