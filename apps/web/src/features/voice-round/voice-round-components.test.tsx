/** @jsxRuntime automatic */
/** @jsxImportSource react */
// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { VoiceAgentReportProposalSchema, VoiceSessionContextSchema } from "@homerounds/contracts";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HistoryPurposeCard } from "./history-purpose-card";
import { VoiceAgentProposalReview } from "./voice-agent-proposal-review";

const ROUND_ID = "b8731a19-3b2e-4c44-a1ab-d92b96b7e26a";
const REPORT_ID = "7ed2fa3a-b3fd-47a8-bbf5-4a5389800f80";
const NOW = "2026-07-17T12:00:00.000Z";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("voice round presentation", () => {
  it("shows concise saved context with a correction and limitation boundary", () => {
    const context = VoiceSessionContextSchema.parse({
      syntheticDataOnly: true,
      patientAlias: "Aisha (synthetic)",
      roundPurpose: "Review intermittent palpitations between programme visits.",
      historySummary: "Previous synthetic round recorded a quality-gated pulse observation."
    });

    render(createElement(HistoryPurposeCard, { context }));

    expect(screen.getByRole("region", { name: "What I already know" })).toBeVisible();
    expect(screen.getByText("Short saved summary")).toBeVisible();
    expect(screen.getByText("From your check-in invitation")).toBeVisible();
    expect(screen.getByText("From your short saved profile")).toBeVisible();
    expect(screen.getByText(/not a diagnosis or a complete record/i)).toBeVisible();
  });

  it("shows all proposal fields, unresolved text, and red-flag review without silent defaults", async () => {
    const proposal = VoiceAgentReportProposalSchema.parse({
      contractVersion: "voice-report-proposal.v1",
      weakness: "unknown",
      palpitations: "intermittent",
      redFlags: {
        chestPain: "unsure",
        severeBreathlessness: "no",
        fainted: "yes"
      },
      note: null,
      unresolvedFields: ["weakness", "chest_pain"]
    });
    const onConfirmed = vi.fn(async () => undefined);

    render(
      createElement(VoiceAgentProposalReview, {
        createId: () => REPORT_ID,
        now: () => NOW,
        onConfirmed,
        proposal,
        roundId: ROUND_ID
      })
    );

    expect(screen.getByText("Not submitted")).toBeVisible();
    expect(screen.getAllByText("Not yet clear")).toHaveLength(2);
    expect(screen.getByText(/A “yes” or “unsure” answer stays visible/i)).toBeVisible();
    expect(screen.getAllByText("Required safety answer")).toHaveLength(3);
    expect(screen.getByText(/Review progress: 0 of 6 fields/i)).toBeVisible();
    for (const select of screen.getAllByRole("combobox")) {
      expect(select).toHaveValue("");
    }

    fireEvent.click(screen.getByRole("button", { name: "Confirm reviewed report" }));
    await waitFor(() => expect(screen.getByLabelText("Weakness")).toHaveFocus());
    expect(onConfirmed).not.toHaveBeenCalled();
  });

  it("requires explicit selection for every field and one final patient confirmation", async () => {
    const proposal = VoiceAgentReportProposalSchema.parse({
      contractVersion: "voice-report-proposal.v1",
      weakness: "mild",
      palpitations: "intermittent",
      redFlags: {
        chestPain: "no",
        severeBreathlessness: "no",
        fainted: "no"
      },
      note: "Synthetic note.",
      unresolvedFields: []
    });
    const onConfirmed = vi.fn(async () => undefined);
    render(
      createElement(VoiceAgentProposalReview, {
        createId: () => REPORT_ID,
        now: () => NOW,
        onConfirmed,
        proposal,
        roundId: ROUND_ID
      })
    );

    fireEvent.change(screen.getByLabelText("Weakness"), { target: { value: "mild" } });
    fireEvent.change(screen.getByLabelText("Palpitations"), {
      target: { value: "intermittent" }
    });
    fireEvent.change(screen.getByLabelText("Chest pain now"), { target: { value: "no" } });
    fireEvent.change(screen.getByLabelText("Severe breathlessness now"), {
      target: { value: "no" }
    });
    fireEvent.change(screen.getByLabelText("Fainted"), { target: { value: "no" } });
    fireEvent.change(screen.getByLabelText("Anything else"), { target: { value: "keep" } });

    fireEvent.click(screen.getByRole("button", { name: "Confirm reviewed report" }));
    expect(onConfirmed).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(/Select the final confirmation/i);

    fireEvent.click(
      screen.getByLabelText(/I reviewed every field and confirm these are my answers/i)
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm reviewed report" }));

    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1));
    expect(onConfirmed).toHaveBeenCalledWith(
      expect.objectContaining({
        inputMode: "voice_confirmed",
        note: "Synthetic note.",
        redFlags: { chestPain: "no", severeBreathlessness: "no", fainted: "no" }
      })
    );
    expect(screen.getByRole("status")).toHaveTextContent(/Reviewed report confirmed/i);
  });
});
