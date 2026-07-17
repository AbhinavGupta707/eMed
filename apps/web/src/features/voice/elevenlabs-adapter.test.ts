import type { VoicePresentationEvent } from "@homerounds/contracts/voice";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ElevenLabsReactVoiceSessionProvider,
  VoiceCredentialError,
  type ElevenLabsConversationHandle,
  type ElevenLabsConversationStartOptions,
  type VoiceScheduler
} from "./elevenlabs-adapter";

const ROUND_ID = "cc80d269-2f79-4328-a129-98cac85219e4";
const TOKEN = "short-lived-demo-conversation-token";

const credential = {
  provider: "elevenlabs" as const,
  connectionType: "webrtc" as const,
  conversationToken: TOKEN,
  expiresAt: "2026-07-17T10:00:00.000Z"
};

class FakeScheduler implements VoiceScheduler {
  #now = Date.parse("2026-07-17T09:00:00.000Z");
  #nextId = 1;
  readonly #tasks = new Map<number, { at: number; callback: () => void }>();

  now(): number {
    return this.#now;
  }

  setTimeout(callback: () => void, delayMs: number): unknown {
    const id = this.#nextId++;
    this.#tasks.set(id, { at: this.#now + delayMs, callback });
    return id;
  }

  clearTimeout(handle: unknown): void {
    if (typeof handle === "number") this.#tasks.delete(handle);
  }

  advanceBy(delayMs: number): void {
    this.#now += delayMs;
    const due = [...this.#tasks.entries()]
      .filter(([, task]) => task.at <= this.#now)
      .sort((left, right) => left[1].at - right[1].at);
    for (const [id, task] of due) {
      this.#tasks.delete(id);
      task.callback();
    }
  }
}

function makeConversation(id = "provider-session-1") {
  const endSession = vi.fn(async () => undefined);
  const setMicMuted = vi.fn();
  const sendUserMessage = vi.fn();
  const handle: ElevenLabsConversationHandle = {
    endSession,
    setMicMuted,
    sendUserMessage,
    getId: () => id
  };
  return { handle, endSession, setMicMuted, sendUserMessage };
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ElevenLabs React voice adapter", () => {
  it("uses only a short-lived WebRTC token and maps validated presentation events", async () => {
    const scheduler = new FakeScheduler();
    const conversation = makeConversation();
    let callbacks: ElevenLabsConversationStartOptions | undefined;
    const startConversation = vi.fn(async (options: ElevenLabsConversationStartOptions) => {
      callbacks = options;
      options.onConnect({ conversationId: "provider-session-1" });
      return conversation.handle;
    });
    const provider = new ElevenLabsReactVoiceSessionProvider({
      fetchCredential: vi.fn(async () => credential),
      startConversation,
      scheduler,
      createSessionId: () => "local-session"
    });
    const events: VoicePresentationEvent[] = [];
    provider.subscribe((event) => events.push(event));

    await expect(
      provider.start({
        roundId: ROUND_ID,
        phase: "patient_report",
        signal: new AbortController().signal
      })
    ).resolves.toEqual({ sessionId: "provider-session-1" });

    expect(startConversation).toHaveBeenCalledTimes(1);
    expect(Object.keys(startConversation.mock.calls[0]?.[0] ?? {}).sort()).toEqual([
      "connectionType",
      "conversationToken",
      "onConnect",
      "onDisconnect",
      "onError",
      "onMessage",
      "onModeChange",
      "onStatusChange"
    ]);
    expect(startConversation.mock.calls[0]?.[0]).toMatchObject({
      conversationToken: TOKEN,
      connectionType: "webrtc"
    });

    callbacks?.onModeChange({ mode: "listening" });
    callbacks?.onMessage({
      message: "Synthetic patient transcript.",
      event_id: 7,
      source: "user",
      role: "user"
    });
    callbacks?.onMessage({
      message: "Synthetic patient transcript.",
      event_id: 7,
      source: "user",
      role: "user"
    });
    callbacks?.onMessage({
      message: "Please review the text before confirming.",
      event_id: 8,
      source: "ai",
      role: "agent"
    });
    await provider.setMuted(true);
    await provider.sendText("Typed fallback text.");

    expect(events.filter((event) => event.type === "transcript_final")).toEqual([
      { type: "transcript_final", text: "Synthetic patient transcript." }
    ]);
    expect(events).toContainEqual({
      type: "narration",
      text: "Please review the text before confirming."
    });
    expect(conversation.setMicMuted).toHaveBeenCalledWith(true);
    expect(conversation.sendUserMessage).toHaveBeenCalledWith("Typed fallback text.");
    expect(JSON.stringify(events)).not.toContain(TOKEN);
  });

  it.each([
    [new VoiceCredentialError("missing_configuration"), "missing_configuration"],
    [new VoiceCredentialError("quota"), "quota"]
  ] as const)("keeps text fallback available when credentials fail", async (error, reason) => {
    const startConversation = vi.fn();
    const provider = new ElevenLabsReactVoiceSessionProvider({
      fetchCredential: vi.fn(async () => {
        throw error;
      }),
      startConversation,
      scheduler: new FakeScheduler(),
      createSessionId: () => "local-session"
    });
    const events: VoicePresentationEvent[] = [];
    provider.subscribe((event) => events.push(event));

    await provider.start({
      roundId: ROUND_ID,
      phase: "patient_report",
      signal: new AbortController().signal
    });

    expect(events).toContainEqual({ type: "unavailable", reason });
    expect(startConversation).not.toHaveBeenCalled();
    await expect(provider.capabilities()).resolves.toMatchObject({ text: true });
  });

  it("normalizes microphone denial without exposing provider details", async () => {
    const provider = new ElevenLabsReactVoiceSessionProvider({
      fetchCredential: vi.fn(async () => credential),
      startConversation: vi.fn(async () => {
        throw new DOMException("Synthetic permission denial", "NotAllowedError");
      }),
      scheduler: new FakeScheduler(),
      createSessionId: () => "local-session"
    });
    const events: VoicePresentationEvent[] = [];
    provider.subscribe((event) => events.push(event));

    await provider.start({
      roundId: ROUND_ID,
      phase: "patient_report",
      signal: new AbortController().signal
    });

    expect(events).toContainEqual({
      type: "error",
      recoverable: false,
      code: "permission_denied"
    });
    expect(JSON.stringify(events)).not.toContain("Synthetic permission denial");
  });

  it("reconnects after network loss with a fresh credential", async () => {
    const scheduler = new FakeScheduler();
    const conversation = makeConversation("reconnected-session");
    let attempt = 0;
    const startConversation = vi.fn(async (options: ElevenLabsConversationStartOptions) => {
      attempt += 1;
      if (attempt === 1) throw new Error("network unavailable");
      options.onConnect({ conversationId: "reconnected-session" });
      return conversation.handle;
    });
    const fetchCredential = vi.fn(async () => credential);
    const provider = new ElevenLabsReactVoiceSessionProvider({
      fetchCredential,
      startConversation,
      scheduler,
      reconnectDelayMs: 100,
      createSessionId: () => "local-session"
    });
    const events: VoicePresentationEvent[] = [];
    provider.subscribe((event) => events.push(event));

    await provider.start({
      roundId: ROUND_ID,
      phase: "patient_report",
      signal: new AbortController().signal
    });
    expect(events).toContainEqual({ type: "reconnecting", attempt: 1 });
    scheduler.advanceBy(100);
    await flushAsyncWork();

    expect(fetchCredential).toHaveBeenCalledTimes(2);
    expect(startConversation).toHaveBeenCalledTimes(2);
    expect(events).toContainEqual({ type: "connected", sessionId: "reconnected-session" });
  });

  it("ends safely after bounded reconnect exhaustion", async () => {
    const scheduler = new FakeScheduler();
    const provider = new ElevenLabsReactVoiceSessionProvider({
      fetchCredential: vi.fn(async () => credential),
      startConversation: vi.fn(async () => {
        throw new Error("network unavailable");
      }),
      scheduler,
      reconnectDelayMs: 100,
      maxReconnectAttempts: 2,
      createSessionId: () => "local-session"
    });
    const events: VoicePresentationEvent[] = [];
    provider.subscribe((event) => events.push(event));

    await provider.start({
      roundId: ROUND_ID,
      phase: "patient_report",
      signal: new AbortController().signal
    });
    scheduler.advanceBy(100);
    await flushAsyncWork();
    scheduler.advanceBy(200);
    await flushAsyncWork();

    expect(events.filter((event) => event.type === "reconnecting")).toEqual([
      { type: "reconnecting", attempt: 1 },
      { type: "reconnecting", attempt: 2 }
    ]);
    expect(events).toContainEqual({ type: "ended", reason: "reconnect_exhausted" });
  });

  it("rejects malformed provider events and ignores later callbacks", async () => {
    const scheduler = new FakeScheduler();
    const conversation = makeConversation();
    let callbacks: ElevenLabsConversationStartOptions | undefined;
    const provider = new ElevenLabsReactVoiceSessionProvider({
      fetchCredential: vi.fn(async () => credential),
      startConversation: vi.fn(async (options) => {
        callbacks = options;
        return conversation.handle;
      }),
      scheduler,
      createSessionId: () => "local-session"
    });
    const events: VoicePresentationEvent[] = [];
    provider.subscribe((event) => events.push(event));
    await provider.start({
      roundId: ROUND_ID,
      phase: "patient_report",
      signal: new AbortController().signal
    });

    callbacks?.onMessage({ message: "missing closed role fields" });
    await flushAsyncWork();
    callbacks?.onMessage({
      message: "Late text",
      event_id: 9,
      source: "user",
      role: "user"
    });

    expect(events).toContainEqual({
      type: "error",
      recoverable: false,
      code: "malformed_event"
    });
    expect(events).not.toContainEqual({ type: "transcript_final", text: "Late text" });
    expect(conversation.endSession).toHaveBeenCalledTimes(1);
  });

  it("does not let delayed cleanup from an old session end its replacement", async () => {
    const scheduler = new FakeScheduler();
    let releaseOldCleanup: (() => void) | undefined;
    const oldCleanup = new Promise<void>((resolve) => {
      releaseOldCleanup = resolve;
    });
    let oldCallbacks: ElevenLabsConversationStartOptions | undefined;
    const oldConversation: ElevenLabsConversationHandle = {
      endSession: () => oldCleanup,
      setMicMuted: vi.fn(),
      sendUserMessage: vi.fn(),
      getId: () => "old-session"
    };
    const newConversation = makeConversation("new-session");
    let startCount = 0;
    const provider = new ElevenLabsReactVoiceSessionProvider({
      fetchCredential: vi.fn(async () => credential),
      startConversation: vi.fn(async (options) => {
        startCount += 1;
        if (startCount === 1) {
          oldCallbacks = options;
          return oldConversation;
        }
        return newConversation.handle;
      }),
      scheduler,
      createSessionId: () => `local-session-${startCount}`
    });
    const events: VoicePresentationEvent[] = [];
    provider.subscribe((event) => events.push(event));
    await provider.start({
      roundId: ROUND_ID,
      phase: "patient_report",
      signal: new AbortController().signal
    });

    const stopping = provider.stop("completed");
    await provider.start({
      roundId: ROUND_ID,
      phase: "patient_report",
      signal: new AbortController().signal
    });
    oldCallbacks?.onMessage({
      message: "Late text from the old session",
      event_id: 11,
      source: "user",
      role: "user"
    });
    releaseOldCleanup?.();
    await stopping;

    expect(events.filter((event) => event.type === "ended")).toEqual([
      { type: "ended", reason: "completed" }
    ]);
    expect(events.at(-1)).toEqual({ type: "listening" });
    expect(events).not.toContainEqual({
      type: "transcript_final",
      text: "Late text from the old session"
    });
  });

  it("times out, cancels, and rejects late events deterministically", async () => {
    const scheduler = new FakeScheduler();
    const conversation = makeConversation();
    let callbacks: ElevenLabsConversationStartOptions | undefined;
    const provider = new ElevenLabsReactVoiceSessionProvider({
      fetchCredential: vi.fn(async () => credential),
      startConversation: vi.fn(async (options) => {
        callbacks = options;
        return conversation.handle;
      }),
      scheduler,
      sessionMaxMs: 1_000,
      createSessionId: () => "local-session"
    });
    const events: VoicePresentationEvent[] = [];
    provider.subscribe((event) => events.push(event));
    const controller = new AbortController();
    await provider.start({ roundId: ROUND_ID, phase: "patient_report", signal: controller.signal });

    scheduler.advanceBy(1_000);
    await flushAsyncWork();
    callbacks?.onModeChange({ mode: "listening" });
    expect(events).toContainEqual({ type: "ended", reason: "timeout" });
    expect(events.at(-1)).toEqual({ type: "ended", reason: "timeout" });

    const secondConversation = makeConversation("provider-session-2");
    const secondCallbacks: { current?: ElevenLabsConversationStartOptions } = {};
    const secondProvider = new ElevenLabsReactVoiceSessionProvider({
      fetchCredential: vi.fn(async () => credential),
      startConversation: vi.fn(async (options) => {
        secondCallbacks.current = options;
        return secondConversation.handle;
      }),
      scheduler: new FakeScheduler(),
      createSessionId: () => "local-session-2"
    });
    const secondEvents: VoicePresentationEvent[] = [];
    secondProvider.subscribe((event) => secondEvents.push(event));
    const secondController = new AbortController();
    await secondProvider.start({
      roundId: ROUND_ID,
      phase: "patient_report",
      signal: secondController.signal
    });
    secondController.abort();
    await flushAsyncWork();
    secondCallbacks.current?.onMessage({
      message: "Late text",
      event_id: 10,
      source: "user",
      role: "user"
    });
    expect(secondEvents.at(-1)).toEqual({ type: "ended", reason: "cancelled" });
    expect(secondEvents).not.toContainEqual({ type: "transcript_final", text: "Late text" });
  });
});
