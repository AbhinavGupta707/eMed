# Screenshot and video shot list

## Capture rules

- Capture from the exact candidate submitted; record its SHA in the asset manifest.
- Use synthetic scenarios only. No attendee, volunteer, employee, clinician, or patient data may appear.
- Do not expose access codes, cookies, headers, environment variables, database URLs, provider keys/tokens, terminal history, or browser developer tools.
- Keep the persistent **Synthetic demonstration** and **Not clinically validated** disclosures visible where possible.
- Do not use a screenshot to upgrade fixture/Playwright evidence into hosted, provider-live, physical-device, or clinical evidence.
- If the recorded synthetic capture recovery appears, include its visible label and never crop out the disclaimer.
- Export at native resolution. Avoid compositing UI states that did not coexist.

## Primary screenshots

Seven core images are enough. Capture in this order so the gallery tells a coherent story.

|   # | Shot                            | Exact screen/state                                                                                                                                                | Caption                                                                                                      | Claim it proves                             | Gate                                                                                                         |
| --: | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
|   1 | Product promise                 | `/` with hero, **One short check-in. One evidence chain. One clear next owner.**, and the patient/sensor/workflow authority card                                  | “HomeRounds separates patient, sensor, and workflow authority before the round begins.”                      | Product framing and visible safety boundary | Ready locally                                                                                                |
|   2 | Structured patient confirmation | `/round?scenario=maya-poor-quality` at **Tell us what is happening now**, showing required safety answers and editable check-in text                              | “Required safety answers are structured; voice or typed narrative remains editable and cannot skip them.”    | No-key text parity and confirmation         | Ready locally                                                                                                |
|   3 | Honest quality outcome          | **The camera check needs attention**, **The selected camera check is unavailable**, or **The demo stopped without a measurement**—whichever was actually observed | “A failed or unavailable capture produces no numeric measurement.”                                           | Quality abstention                          | Ready locally; label the exact observed state                                                                |
|   4 | Patient-owned action            | **Programme review requested** with fictional owner, protocol version, demo-only timing, and explicit confirmation                                                | “A fictional, versioned protocol proposes one allowlisted synthetic review task for patient confirmation.”   | Deterministic action boundary               | Ready locally                                                                                                |
|   5 | Clinician evidence chain        | Cockpit with **Uncertainty and review boundary** plus the five evidence-chain stages; include **No numeric measurement accepted**                                 | “The clinician sees source, confirmed report, missing measurement, rule version, task key, and uncertainty.” | Auditable handoff                           | Ready through tested/local app                                                                               |
|   6 | Persisted mutation              | Clinician **Persistence confirmed** notice with an audit reference after completion                                                                               | “The cockpit displays success only after a persistence receipt and audit reference return.”                  | Persisted clinician action                  | Capture from a prepared verified local run; not the final protected-build evidence claim                     |
|   7 | Patient closure                 | Refreshed patient state at **Synthetic review completed** and **Completed in clinician cockpit**                                                                  | “Persisted clinician completion returns to the patient’s saved round.”                                       | Closed loop                                 | Capture from a prepared verified local run; attribute the generic capability to browser/integration evidence |

Recommended crops:

- Desktop/gallery: 16:9 at 1440×810 or higher.
- Patient/mobile: native 390×844 or a clean 9:16 device-frame export without a fake device claim.
- Clinician: 16:9, with queue and selected evidence visible; avoid text so small that provenance is unreadable.

## Secondary screenshots

Use only when the submission permits more than seven images.

| Priority | Shot                                                                   | Caption                                                                                                         | Boundary                                                              |
| -------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 8        | Structured red-flag outcome at **Stop this demo round**                | “A confirmed red-flag answer ends ordinary capture before voice or a model can reinterpret it.”                 | Fictional protocol; not emergency-detection validation                |
| 9        | Voice/text panel with **Your check-in text** and **Confirm this text** | “Text is complete without a key; optional voice proposes editable text.”                                        | Do not add a live ElevenLabs badge unless a live session was observed |
| 10       | Provider preparation screen                                            | “The server selects exactly one registered optical provider; failed evidence cannot silently switch providers.” | Do not imply a capture ran or passed                                  |
| 11       | Audit timeline close-up                                                | “Actor, source, correlation, and event reference remain visible.”                                               | Synthetic audit only                                                  |
| 12       | Three-scenario home grid                                               | “One primary, one resilience, and one hard-stop story share the same deterministic boundary.”                   | Scenario fixtures, not real cases                                     |

## Conditional proof screenshots

Do not capture or publish these until their gate passes.

| Asset                     | Required visible evidence                                                                                                      | Caption if approved                                                                                           | Forbidden caption                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Hosted demo               | Stable HTTPS origin, matching candidate/deployment record, protected access, `postgres` readiness evidence retained separately | “The exact candidate runs in a protected synthetic Vercel/Neon environment.”                                  | “Production ready” or “deployed for patients”                                         |
| Physical local finger PPG | Exact device/iOS/Safari in manifest, live capture screen, observed quality outcome, no-frame network inspection retained       | “A physical [device/browser] engineering-feasibility run returned [pass/fail] under the recorded conditions.” | “Accurate,” “medical-grade,” or “validated on iPhone”                                 |
| Live ElevenLabs           | Visible voice connection and editable confirmation; account/privacy/token checks retained                                      | “The optional ElevenLabs path ran live; the patient still edited and confirmed the text.”                     | “Zero retention,” “HIPAA/GDPR compliant,” or “clinically safe”                        |
| Live VitalLens            | Explicit consent, proxy/provider version, observed quality result; privacy/account gate retained                               | “The optional consented VitalLens adapter returned [pass/fail] through the HomeRounds proxy.”                 | “On-device,” “no frames leave,” “medical device,” or comparison claim                 |
| Optical comparison        | Reviewed, predeclared comparison report—not merely two screenshots                                                             | Use only the exact approved report wording                                                                    | “Same result,” “more accurate,” “better,” or any physical comparison without analysis |

## Primary demo video shot plan: 2:30–2:45

|      Time | Visual                              | Operator action                                         | Narration purpose                                          |
| --------: | ----------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------- |
| 0:00–0:12 | Home hero                           | Slow cursor-free hold, then point to the authority card | Product promise in the first sentence                      |
| 0:12–0:22 | Three scenario cards                | Click **Poor signal, honest recovery**                  | Make resilience the product proof, not a caveat            |
| 0:22–0:48 | Patient structured report           | Select seeded answers, enter text, confirm              | Patient authority and no-key completion                    |
| 0:48–1:08 | Optical prepare/unavailable/failure | Show provider boundary, then actual no-measurement path | The “wow” moment: uncertainty cannot become a number       |
| 1:08–1:30 | Action confirmation and outcome     | Confirm one synthetic task                              | Deterministic protocol + idempotent action                 |
| 1:30–2:08 | Clinician evidence chain            | Scroll slowly through quality, protocol, task, audit    | Evidence is source-labelled and missingness stays visible  |
| 2:08–2:28 | Clinician mutation                  | Complete and pause on persistence receipt               | Close the operational loop                                 |
| 2:28–2:40 | Patient refresh                     | Show completed status                                   | Return ownership to the patient and deliver closing thesis |

Recording guidance:

- Use a steady cursor and one deliberate scroll per section.
- Let visible UI labels carry detail; narration should explain why the state matters.
- Do not accelerate the capture/quality section so much that labels become unreadable.
- Do not show terminal reset or access-code entry in the primary video.
- Keep a clean cut only between logical states; do not imply an action happened if the intermediate state failed.

## Recovery video: 60–90 seconds

Record a separate 75-second version even if the primary succeeds:

1. Home promise—10 seconds.
2. Prepared patient no-measurement outcome—20 seconds.
3. Clinician evidence chain with **No numeric measurement accepted**—25 seconds.
4. Persistence receipt and patient completion—20 seconds.

Label the file and opening slate **Recorded walkthrough of candidate [short SHA]**. It is a backup walkthrough, not a live-demo claim.

## Optional architecture visual

If the submission accepts one non-product image, render the Mermaid diagram from [ARCHITECTURE.md](./ARCHITECTURE.md) using the same typography and a simple four-colour legend:

- blue: patient/provider proposals;
- amber: quality/uncertainty;
- black: deterministic authority;
- green: persisted/audited completion.

Do not use source-package diagrams without checking them against the implemented architecture; the original source bundle includes broader/future components that are not part of the claim.

## Asset naming and manifest

Use deterministic names:

```text
01-home-promise-[shortsha].png
02-patient-confirmation-[shortsha].png
03-no-measurement-[shortsha].png
04-task-confirmation-[shortsha].png
05-clinician-evidence-[shortsha].png
06-persistence-receipt-[shortsha].png
07-patient-complete-[shortsha].png
homerounds-primary-[shortsha].mp4
homerounds-recovery-[shortsha].mp4
```

Keep an uncommitted/operator-side manifest with candidate SHA, capture date/time, route/scenario, runtime profile, viewport, browser, hosted/local status, device/provider status, and any edit/crop. Do not place secrets or real health data in metadata.

## Final media audit

- Every visible state occurred in the exact captured run.
- Every caption matches [CLAIM_AUDIT.md](./CLAIM_AUDIT.md).
- The protected production-build evidence is not presented as the separate full mutation-loop evidence.
- No browser chrome suggests a hosted domain when the run was local.
- No WebKit layout screenshot is labelled physical iPhone/Safari.
- No fixture, replay, fake transport, or mocked provider is labelled live.
- No low-quality capture displays a numeric measurement.
- No medical, accuracy, outcome, endorsement, production, or comparative claim appears in overlay text.
