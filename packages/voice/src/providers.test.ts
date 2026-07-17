import type { VoicePresentationEvent } from "@homerounds/contracts/voice";
import { describe, expect, it } from "vitest";

import {
  DisabledVoiceSessionProvider,
  SyntheticVoiceSessionProvider,
  TextVoiceSessionProvider
} from "./providers";

const ROUND_ID = "cc80d269-2f79-4328-a129-98cac85219e4";

describe("deterministic text provider", () => {
  it("supports connect, text, mute and end without credentials", async () => {
    const provider = new TextVoiceSessionProvider(() => "text-session-1");
    const events: VoicePresentationEvent[] = [];
    provider.subscribe((event) => events.push(event));
    const controller = new AbortController();

    await expect(provider.capabilities()).resolves.toEqual({
      available: true,
      voice: false,
      text: true
    });
    await expect(
      provider.start({ roundId: ROUND_ID, phase: "patient_report", signal: controller.signal })
    ).resolves.toEqual({ sessionId: "text-session-1" });
    await provider.sendText("Synthetic check-in text.");
    await provider.setMuted(true);
    await provider.stop("completed");

    expect(events).toEqual([
      { type: "connecting" },
      { type: "connected", sessionId: "text-session-1" },
      { type: "listening" },
      { type: "transcript_final", text: "Synthetic check-in text." },
      { type: "muted", muted: true },
      { type: "ended", reason: "completed" }
    ]);
  });

  it("cancels on abort exactly once", async () => {
    const provider = new TextVoiceSessionProvider(() => "text-session-2");
    const events: VoicePresentationEvent[] = [];
    provider.subscribe((event) => events.push(event));
    const controller = new AbortController();
    await provider.start({ roundId: ROUND_ID, phase: "patient_report", signal: controller.signal });

    controller.abort();
    await Promise.resolve();
    await provider.stop("cancelled");

    expect(events.filter((event) => event.type === "ended")).toEqual([
      { type: "ended", reason: "cancelled" }
    ]);
  });
});

describe("synthetic browser voice fixture", () => {
  it("emits identifier-free transcript events without external media", async () => {
    const provider = new SyntheticVoiceSessionProvider(() => "synthetic-session-1");
    const events: VoicePresentationEvent[] = [];
    provider.subscribe((event) => events.push(event));

    await expect(provider.capabilities()).resolves.toEqual({
      available: true,
      voice: true,
      text: true
    });
    await provider.start({
      roundId: ROUND_ID,
      phase: "patient_report",
      signal: new AbortController().signal
    });

    expect(events).toContainEqual({
      type: "transcript_final",
      text: "I have felt a little weak this morning."
    });
    expect(JSON.stringify(events)).not.toMatch(/audio|blob|media|patient[_ -]?id/i);
  });
});

describe("disabled provider", () => {
  it("reports no-key unavailability while preserving text input", async () => {
    const provider = new DisabledVoiceSessionProvider(
      "missing_configuration",
      () => "disabled-session"
    );
    const events: VoicePresentationEvent[] = [];
    provider.subscribe((event) => events.push(event));

    await expect(provider.capabilities()).resolves.toEqual({
      available: false,
      voice: false,
      text: true
    });
    await provider.start({
      roundId: ROUND_ID,
      phase: "patient_report",
      signal: new AbortController().signal
    });
    await provider.sendText("The keyboard route remains complete.");

    expect(events).toEqual([
      { type: "unavailable", reason: "missing_configuration" },
      { type: "transcript_final", text: "The keyboard route remains complete." }
    ]);
  });
});
