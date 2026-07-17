import { describe, expect, it } from "vitest";

import {
  TranscriptConfirmationSchema,
  createConfirmedPatientReport,
  createTranscriptState,
  reduceTranscript
} from "./transcript";

const ROUND_ID = "cc80d269-2f79-4328-a129-98cac85219e4";
const PROPOSAL_ID = "1596aee5-e0ae-45df-bd5f-96fd89700f7b";
const REPORT_ID = "dcfce5d5-b681-4593-81af-806256e9e352";

describe("transcript proposal and confirmation", () => {
  it("keeps tentative text visible but requires final text before confirmation", () => {
    const tentative = reduceTranscript(createTranscriptState(ROUND_ID, 2), {
      type: "provider_transcript",
      eventId: "transcript-1",
      generation: 2,
      proposalId: PROPOSAL_ID,
      text: "I feel a little",
      isFinal: false
    });
    expect(tentative.state.proposal).toMatchObject({
      text: "I feel a little",
      isFinal: false,
      source: "voice_provider"
    });

    const blocked = reduceTranscript(tentative.state, {
      type: "confirm",
      eventId: "confirm-early",
      confirmedAt: "2026-07-17T09:00:00.000Z"
    });
    expect(blocked).toMatchObject({ accepted: false, rejection: "tentative_proposal" });
  });

  it("supports final, edit and explicit confirm while rejecting duplicates", () => {
    const initial = createTranscriptState(ROUND_ID, 2);
    const final = reduceTranscript(initial, {
      type: "provider_transcript",
      eventId: "transcript-final",
      generation: 2,
      proposalId: PROPOSAL_ID,
      text: "I feel slightly week.",
      isFinal: true
    });
    const duplicate = reduceTranscript(final.state, {
      type: "provider_transcript",
      eventId: "transcript-final",
      generation: 2,
      proposalId: PROPOSAL_ID,
      text: "I feel slightly week.",
      isFinal: true
    });
    expect(duplicate).toMatchObject({ accepted: false, rejection: "duplicate_event" });

    const edited = reduceTranscript(final.state, {
      type: "edit",
      eventId: "transcript-edit",
      text: "I feel slightly weak."
    });
    expect(edited.state.proposal).toMatchObject({
      text: "I feel slightly weak.",
      edited: true,
      revision: 2
    });

    const confirmed = reduceTranscript(edited.state, {
      type: "confirm",
      eventId: "transcript-confirm",
      confirmedAt: "2026-07-17T09:00:00.000Z"
    });
    expect(confirmed.state.confirmation).toEqual({
      proposalId: PROPOSAL_ID,
      roundId: ROUND_ID,
      source: "voice_provider",
      text: "I feel slightly weak.",
      revision: 2,
      confirmedAt: "2026-07-17T09:00:00.000Z"
    });

    const late = reduceTranscript(confirmed.state, {
      type: "provider_transcript",
      eventId: "late-transcript",
      generation: 2,
      proposalId: PROPOSAL_ID,
      text: "This must not replace confirmed text.",
      isFinal: true
    });
    expect(late).toMatchObject({ accepted: false, rejection: "already_confirmed" });
  });

  it("rejects transcript events from an old session generation", () => {
    const result = reduceTranscript(createTranscriptState(ROUND_ID, 3), {
      type: "provider_transcript",
      eventId: "late-transcript",
      generation: 2,
      proposalId: PROPOSAL_ID,
      text: "Old session text",
      isFinal: true
    });
    expect(result).toMatchObject({ accepted: false, rejection: "late_event" });
    expect(result.state.proposal).toBeNull();
  });

  it("supports full typed-text parity without a provider credential", () => {
    const entered = reduceTranscript(createTranscriptState(ROUND_ID, 1), {
      type: "text_entered",
      eventId: "typed-text",
      proposalId: PROPOSAL_ID,
      text: "I feel a little weak today."
    });
    const confirmed = reduceTranscript(entered.state, {
      type: "confirm",
      eventId: "typed-confirm",
      confirmedAt: "2026-07-17T09:00:00.000Z"
    });
    expect(confirmed.state.confirmation?.source).toBe("typed_text");
  });

  it("creates a report only from a confirmed transcript and explicit structured controls", () => {
    const confirmation = TranscriptConfirmationSchema.parse({
      proposalId: PROPOSAL_ID,
      roundId: ROUND_ID,
      source: "voice_provider",
      text: "I feel slightly weak.",
      revision: 2,
      confirmedAt: "2026-07-17T09:00:00.000Z"
    });

    const report = createConfirmedPatientReport({
      reportId: REPORT_ID,
      confirmation,
      fields: {
        weakness: "mild",
        palpitations: "absent",
        redFlags: { chestPain: "no", severeBreathlessness: "no", fainted: "no" },
        note: "Patient-confirmed synthetic check-in note."
      }
    });
    expect(report).toMatchObject({
      inputMode: "voice_confirmed",
      confirmedAt: confirmation.confirmedAt,
      weakness: "mild"
    });
    expect(report).not.toHaveProperty("urgency");
    expect(report).not.toHaveProperty("diagnosis");
    expect(report).not.toHaveProperty("medicationInstruction");
  });

  it("keeps confirmation types closed against authority-bearing fields", () => {
    expect(
      TranscriptConfirmationSchema.safeParse({
        proposalId: PROPOSAL_ID,
        roundId: ROUND_ID,
        source: "voice_provider",
        text: "Synthetic text",
        revision: 1,
        confirmedAt: "2026-07-17T09:00:00.000Z",
        urgency: "emergency"
      }).success
    ).toBe(false);
  });
});
