# HomeRounds Human Warmth experience specification

Status: selected and approved design direction; Checkpoint 9 implementation authorized  
Selected: 18 July 2026  
Scope: responsive patient, phone-companion, and clinician surfaces for the synthetic hackathon prototype

## 1. Reference direction

The selected direction is **Human Warmth**: an editorial, calm, high-trust health experience that feels supportive without looking like a hospital dashboard, wellness spa, or generic AI product.

The generated reference boards are design inputs, not pixel-exact product screenshots:

- [Personal home and baseline](./references/human-warmth-home.png)
- [Live voice check-in](./references/human-warmth-voice.png)
- [Phone handoff and pulse task](./references/human-warmth-handoff.png)

The implementation should preserve their hierarchy, warmth, whitespace, restrained terracotta accent, deep forest typography, and single-task pacing. It should not reproduce decorative room photography, laptop/device chrome, fake QR data, generated iconography, or inaccessible low-contrast details.

## 2. Product experience principle

Every screen answers three questions:

1. What is happening now?
2. Why is this the smallest useful next step?
3. What does the patient need to do next?

The interface must never present every sensor merely because it exists. HomeRounds creates an eligible evidence-module set from the confirmed report, history, consent, device availability, remaining burden, and deterministic safety state. Fireworks may rank one eligible module or abstain. Deterministic code validates and commits the route.

## 3. Visual system

### Palette intent

The exact accessible tokens are finalized during implementation and contrast-tested in every state.

| Role       | Starting value | Intent                                   |
| ---------- | -------------- | ---------------------------------------- |
| canvas     | `#F8F3EA`      | warm bone, never pure white              |
| surface    | `#FFFDF8`      | calm raised content surface              |
| forest     | `#173C32`      | headings and primary controls            |
| ink        | `#26312D`      | body copy                                |
| terracotta | `#C55F3D`      | primary interaction and active progress  |
| peach      | `#F1D7C7`      | restrained supporting highlight          |
| sage       | `#9DAE9E`      | neutral baseline context                 |
| border     | `#D8CFC2`      | quiet structure                          |
| critical   | `#A52A2A`      | reserved for deterministic safety states |

Terracotta is an interaction accent, not an urgency code. Status always includes text and an icon; color alone carries no meaning.

### Typography

- Editorial serif heading: `Newsreader` or the closest self-hosted, performance-safe equivalent.
- Accessible sans-serif body/control face: `Inter` or an equivalent system-safe face.
- Minimum body size: 16 px.
- Body line height: 1.5–1.7.
- Measure: normally 45–70 characters; never exceed 75 characters for patient instructions.
- Large headings scale fluidly and must not force horizontal overflow at 320 px.

### Layout and spacing

- Token scale: 4, 8, 12, 16, 24, 32, 48, 64.
- Minimum touch target: 44 by 44 px with at least 8 px separation.
- Adjacent content gap: at least 12 px.
- Card/list gap: at least 16 px.
- Patient screen: one primary task and one primary action.
- Desktop may show one bounded context panel; mobile collapses context behind a labelled disclosure.
- Test widths: 320, 375, 390, 414, 768, 1024, 1280, 1440, and 1920 px; also test 200% zoom.

### Motion

- Micro-interactions: 150–300 ms using transform/opacity only.
- Voice and capture animations remain subtle and never block captions or progress text.
- `prefers-reduced-motion` removes nonessential movement while retaining state changes.
- No parallax, animated background decoration, or infinite ambient motion in the working product.

## 4. Information architecture

### Desktop/laptop

- Home: personal baseline, meaningful change, start/resume action.
- Round: live voice or text interaction, persistent captions, bounded context.
- Review: explicit structured-report review and unresolved fields.
- Recommendation: one selected assessment with patient-visible rationale.
- Phone handoff: one-time QR, connection state, computer alternative.
- Waiting/result: real persisted task state, quality result, and next action.
- Clinician: evidence chain, source/quality/uncertainty, one owned task.

### Phone companion

The phone is the default sensor device but not a separate account or native application. One QR pairs the phone to the current round for a short-lived session. It then shows one task at a time:

1. Ready and purpose.
2. Contextual permission/consent.
3. Positioning guidance.
4. Capture quality and progress.
5. Retry, unavailable, or completed result.
6. Automatic server acknowledgement and desktop update.

The patient may instead continue entirely on the laptop when the selected module supports it. A round never silently changes device or optical provider.

## 5. Nine key reference screens

All nine approved-direction boards are preserved as implementation references:

1. [Home and personal baseline](./references/human-warmth-home.png).
2. [Live ElevenLabs voice check-in](./references/human-warmth-voice.png).
3. [Adaptive phone handoff/pulse task](./references/human-warmth-handoff.png).
4. [Structured report review with unknown/unsure preservation](./references/human-warmth-report-review.png).
5. [Front-camera VitalLens consent, positioning, progress, and unavailable states](./references/human-warmth-face-pulse.png).
6. [Sustained-vowel voice-signal task with consent, timer, quality retry, and research-only explanation](./references/human-warmth-voice-signal.png).
7. [Medication-label capture, uncertain-field correction, and explicit confirmation](./references/human-warmth-medication.png).
8. [Desktop live-sync result, quality/provenance summary, and one patient next action](./references/human-warmth-live-result.png).
9. [Clinician evidence card with trigger, baseline change, confirmed report, measurement quality, protocol, action owner, and audit trail](./references/human-warmth-clinician.png).

Generated text and decorative details are not product claims. Implementation must follow the content, privacy, safety, accessibility, and deterministic-authority contracts in this specification even when a raster board implies otherwise.

## 6. Content contract

- Do not show engineering phrases such as “deterministic cache,” provider fixture names, or test profile names in the patient UI.
- Do not label ordinary controls “demo.”
- Keep one discreet persistent disclosure: `Sample profile · Not medical care`.
- Do not diagnose, prescribe, promise contact, or state that a model-selected assessment is medically necessary.
- Rationale format: what information the selected task can clarify, not what disease the system suspects.
- First repeated-baseline sample says `Baseline started`; it cannot say `stable`, `improved`, or `declined` without enough comparable samples.
- Quality failure says no measurement was accepted and provides an actionable retry or review path.

## 7. Responsive and accessibility contract

- Semantic heading order and landmark structure.
- Persistent labels and captions; placeholder text is not a label.
- Keyboard/touch parity and visible `:focus-visible` treatment.
- Screen-reader announcement only for meaningful state changes.
- Text alternative for voice; laptop alternative where the selected task supports it.
- Non-color status, reduced motion, safe error recovery, and preserved confirmed progress.
- Camera/microphone permissions are requested only after a user action and contextual explanation.
- QR has a readable link/code alternative and expiry/reissue behavior.

## 8. Implementation boundary

The generated raster boards are reference artifacts only. Production UI is implemented as semantic React/CSS/shared components; screenshots are not embedded as interfaces. Decorative botanical details may be recreated sparingly with lightweight CSS or project-owned vectors only when they do not reduce performance, contrast, or clarity.
