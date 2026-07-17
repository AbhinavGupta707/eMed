/** @jsxRuntime automatic */
/** @jsxImportSource react */
// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import type { VoicePresentationEvent, VoiceSessionProvider } from "@homerounds/contracts/voice";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DisabledVoiceSessionProvider } from "@homerounds/voice";

import { VoiceInteractionPanel } from "./voice-interaction-panel";

const ROUND_ID = "cc80d269-2f79-4328-a129-98cac85219e4";
const SECOND_ROUND_ID = "14df34c4-8204-4810-8113-37b63c963a91";
const PROPOSAL_ID = "1596aee5-e0ae-45df-bd5f-96fd89700f7b";

class SyntheticVoiceProvider implements VoiceSessionProvider {
  readonly kind = "elevenlabs" as const;
  readonly #listeners = new Set<(event: VoicePresentationEvent) => void>();
  #signal: AbortSignal | undefined;

  capabilities(): Promise<{ available: boolean; voice: boolean; text: boolean }> {
    return Promise.resolve({ available: true, voice: true, text: true });
  }

  start(input: {
    roundId: string;
    phase: string;
    signal: AbortSignal;
  }): Promise<{ sessionId: string }> {
    this.#signal = input.signal;
    this.emit({ type: "connecting" });
    this.emit({ type: "connected", sessionId: "synthetic-voice-session" });
    this.emit({ type: "listening" });
    return Promise.resolve({ sessionId: "synthetic-voice-session" });
  }

  stop(reason: string): Promise<void> {
    this.emit({ type: "ended", reason });
    return Promise.resolve();
  }

  setMuted(muted: boolean): Promise<void> {
    this.emit({ type: "muted", muted });
    return Promise.resolve();
  }

  sendText(text: string): Promise<void> {
    this.emit({ type: "transcript_final", text });
    return Promise.resolve();
  }

  subscribe(listener: (event: VoicePresentationEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  emit(event: VoicePresentationEvent): void {
    for (const listener of this.#listeners) listener(event);
  }

  get aborted(): boolean {
    return this.#signal?.aborted ?? false;
  }
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("voice interaction panel", () => {
  it("keeps the complete editable confirmation flow in disabled/no-key mode", async () => {
    const provider = new DisabledVoiceSessionProvider(
      "missing_configuration",
      () => "disabled-session"
    );
    const onConfirmed = vi.fn();
    render(
      createElement(VoiceInteractionPanel, {
        roundId: ROUND_ID,
        provider,
        onConfirmed,
        createId: () => PROPOSAL_ID,
        now: () => "2026-07-17T09:00:00.000Z"
      })
    );

    expect(screen.getByText("Text always available")).toBeVisible();
    expect(screen.getByLabelText("Your check-in text")).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Start voice" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Your check-in text"), {
      target: { value: "I have felt a little weak today." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm this text" }));

    expect(onConfirmed).toHaveBeenCalledWith({
      proposalId: PROPOSAL_ID,
      roundId: ROUND_ID,
      source: "typed_text",
      text: "I have felt a little weak today.",
      revision: 1,
      confirmedAt: "2026-07-17T09:00:00.000Z"
    });
    expect(screen.getByLabelText("Your check-in text")).toBeDisabled();
    expect(screen.getByText("Confirmed")).toBeVisible();
  });

  it("shows tentative/final provider text, allows edits, and requires explicit confirmation", async () => {
    const provider = new SyntheticVoiceProvider();
    const onConfirmed = vi.fn();
    render(
      createElement(VoiceInteractionPanel, {
        roundId: ROUND_ID,
        provider,
        onConfirmed,
        createId: () => PROPOSAL_ID,
        now: () => "2026-07-17T09:00:00.000Z"
      })
    );

    const startButton = await screen.findByRole("button", { name: "Start voice" });
    fireEvent.click(startButton);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("listening"));

    provider.emit({ type: "transcript_tentative", text: "I feel slightly" });
    await waitFor(() =>
      expect(screen.getByLabelText("Your check-in text")).toHaveValue("I feel slightly")
    );
    expect(screen.getByText("Tentative transcript")).toBeVisible();

    provider.emit({ type: "transcript_final", text: "I feel slightly week." });
    await waitFor(() =>
      expect(screen.getByLabelText("Your check-in text")).toHaveValue("I feel slightly week.")
    );
    fireEvent.change(screen.getByLabelText("Your check-in text"), {
      target: { value: "I feel slightly weak." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm this text" }));

    expect(onConfirmed).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "voice_provider",
        text: "I feel slightly weak.",
        revision: 3
      })
    );
    expect(screen.getByRole("button", { name: "Text confirmed" })).toBeDisabled();
  });

  it("cancels media and rejects late transcript events", async () => {
    const provider = new SyntheticVoiceProvider();
    render(
      createElement(VoiceInteractionPanel, {
        roundId: ROUND_ID,
        provider,
        onConfirmed: vi.fn(),
        createId: () => PROPOSAL_ID
      })
    );
    fireEvent.click(await screen.findByRole("button", { name: "Start voice" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel voice" }));
    await waitFor(() => expect(provider.aborted).toBe(true));
    provider.emit({ type: "transcript_final", text: "Late transcript must be ignored." });

    expect(screen.getByLabelText("Your check-in text")).toHaveValue("");
    expect(screen.getByRole("status")).toHaveTextContent("cancelled");
  });

  it("provides a non-color microphone-denied recovery message", async () => {
    const provider = new SyntheticVoiceProvider();
    render(
      createElement(VoiceInteractionPanel, {
        roundId: ROUND_ID,
        provider,
        onConfirmed: vi.fn(),
        createId: () => PROPOSAL_ID
      })
    );
    fireEvent.click(await screen.findByRole("button", { name: "Start voice" }));
    provider.emit({ type: "error", recoverable: false, code: "permission_denied" });

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Microphone access was denied. Continue with text"
      )
    );
    expect(screen.getByLabelText("Your check-in text")).toBeEnabled();
  });

  it("provides persistent safety text and named keyboard controls", async () => {
    render(
      createElement(VoiceInteractionPanel, {
        roundId: ROUND_ID,
        provider: new SyntheticVoiceProvider(),
        onConfirmed: vi.fn(),
        createId: () => PROPOSAL_ID
      })
    );

    expect(
      screen.getByText(/cannot diagnose, set urgency, answer required safety questions/i)
    ).toBeVisible();
    expect(screen.getByLabelText("Your check-in text")).toHaveAccessibleDescription(
      /review and edit every word/i
    );
    expect(await screen.findByRole("button", { name: "Start voice" })).toHaveAttribute(
      "type",
      "button"
    );
  });

  it("discards ephemeral transcript state when the round changes", () => {
    const provider = new SyntheticVoiceProvider();
    const { rerender } = render(
      createElement(VoiceInteractionPanel, {
        roundId: ROUND_ID,
        provider,
        onConfirmed: vi.fn(),
        createId: () => PROPOSAL_ID
      })
    );
    fireEvent.change(screen.getByLabelText("Your check-in text"), {
      target: { value: "Round-scoped synthetic text." }
    });
    expect(screen.getByLabelText("Your check-in text")).toHaveValue("Round-scoped synthetic text.");

    rerender(
      createElement(VoiceInteractionPanel, {
        roundId: SECOND_ROUND_ID,
        provider,
        onConfirmed: vi.fn(),
        createId: () => PROPOSAL_ID
      })
    );

    expect(screen.getByLabelText("Your check-in text")).toHaveValue("");
  });
});
