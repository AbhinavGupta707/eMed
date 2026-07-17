import type { VoicePresentationEvent } from "@homerounds/contracts/voice";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ElevenLabsReactVoiceSessionProvider,
  VoiceCredentialError,
  resolveElevenLabsConnectionLocation,
  startElevenLabsReactConversation,
  type ElevenLabsConversationHandle,
  type ElevenLabsConversationStartOptions,
  type VoiceScheduler
} from "./elevenlabs-adapter";

const sdkStartSession = vi.hoisted(() => vi.fn());
vi.mock("@elevenlabs/react", () => ({
  Conversation: { startSession: sdkStartSession }
}));

const ROUND_ID = "cc80d269-2f79-4328-a129-98cac85219e4";
const TOKEN = "short-lived-demo-conversation-token";
const PROPOSAL_ID = "1596aee5-e0ae-45df-bd5f-96fd89700f7b";

const credential = {
  provider: "elevenlabs" as const,
  connectionType: "webrtc" as const,
  conversationToken: TOKEN,
  expiresAt: "2026-07-17T10:00:00.000Z",
  serverLocation: "global" as const
};

const sessionContext = {
  syntheticDataOnly: true as const,
  patientAlias: "Maya",
  roundPurpose: "Synthetic medication-change check-in",
  historySummary: "One prior synthetic round; no real patient record is included."
};

const reportProposal = {
  contractVersion: "voice-report-proposal.v1" as const,
  weakness: "moderate" as const,
  palpitations: "intermittent" as const,
  redFlags: {
    chestPain: "no" as const,
    severeBreathlessness: "unsure" as const,
    fainted: "no" as const
  },
  note: "I have felt weak since this morning.",
  unresolvedFields: ["severe_breathlessness" as const]
};

function parseToolResult(result: string): unknown {
  return JSON.parse(result) as unknown;
}

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
  sdkStartSession.mockReset();
});

describe("ElevenLabs React voice adapter", () => {
  it("resolves the credential location before calling the lower-level SDK session", async () => {
    const conversation = makeConversation();
    sdkStartSession.mockResolvedValue(conversation.handle);
    const clientTools = {
      propose_patient_report: vi.fn(async () => "proposal-result"),
      request_next_round_step: vi.fn(async () => "next-step-result")
    };

    await startElevenLabsReactConversation({
      conversationToken: TOKEN,
      connectionType: "webrtc",
      serverLocation: "eu-residency",
      clientTools,
      onConnect: vi.fn(),
      onDisconnect: vi.fn(),
      onError: vi.fn(),
      onMessage: vi.fn(),
      onModeChange: vi.fn(),
      onStatusChange: vi.fn()
    });

    expect(sdkStartSession).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationToken: TOKEN,
        connectionType: "webrtc",
        origin: "wss://api.eu.residency.elevenlabs.io",
        livekitUrl: "wss://livekit.rtc.eu.residency.elevenlabs.io",
        clientTools
      })
    );
    expect(sdkStartSession.mock.calls[0]?.[0]).not.toHaveProperty("serverLocation");
  });

  it("uses only a short-lived WebRTC token and maps validated presentation events", async () => {
    const scheduler = new FakeScheduler();
    const conversation = makeConversation();
    const requestMicrophonePermission = vi.fn(async () => undefined);
    let callbacks: ElevenLabsConversationStartOptions | undefined;
    const startConversation = vi.fn(async (options: ElevenLabsConversationStartOptions) => {
      callbacks = options;
      options.onConnect({ conversationId: "provider-session-1" });
      return conversation.handle;
    });
    const provider = new ElevenLabsReactVoiceSessionProvider({
      fetchCredential: vi.fn(async () => credential),
      startConversation,
      requestMicrophonePermission,
      scheduler,
      createSessionId: () => "local-session"
    });
    const events: VoicePresentationEvent[] = [];
    provider.subscribe((event) => events.push(event));
    const proposePatientReport = vi.fn(async () => ({
      status: "pending_confirmation" as const,
      proposalId: PROPOSAL_ID,
      message: "Review the visible proposal before confirming."
    }));
    const requestNextRoundStep = vi.fn(async () => ({
      status: "not_ready" as const,
      reason: "report_not_confirmed" as const,
      message: "The patient has not confirmed the report."
    }));

    await expect(
      provider.start({
        roundId: ROUND_ID,
        phase: "patient_report",
        signal: new AbortController().signal,
        context: sessionContext,
        clientTools: { proposePatientReport, requestNextRoundStep }
      })
    ).resolves.toEqual({ sessionId: "provider-session-1" });

    expect(startConversation).toHaveBeenCalledTimes(1);
    expect(requestMicrophonePermission).toHaveBeenCalledTimes(1);
    expect(Object.keys(startConversation.mock.calls[0]?.[0] ?? {}).sort()).toEqual([
      "clientTools",
      "connectionType",
      "conversationToken",
      "dynamicVariables",
      "onConnect",
      "onDisconnect",
      "onError",
      "onMessage",
      "onModeChange",
      "onStatusChange",
      "serverLocation"
    ]);
    expect(startConversation.mock.calls[0]?.[0]).toMatchObject({
      conversationToken: TOKEN,
      connectionType: "webrtc",
      serverLocation: "global",
      dynamicVariables: {
        synthetic_data_only: true,
        patient_alias: "Maya",
        round_purpose: "Synthetic medication-change check-in",
        history_summary: "One prior synthetic round; no real patient record is included."
      }
    });
    expect(Object.keys(callbacks?.clientTools ?? {}).sort()).toEqual([
      "propose_patient_report",
      "request_next_round_step"
    ]);
    if (!callbacks) throw new Error("Expected injected SDK callbacks");
    expect(
      parseToolResult(await callbacks.clientTools.propose_patient_report(reportProposal))
    ).toEqual({
      status: "pending_confirmation",
      proposalId: PROPOSAL_ID,
      message: "Review the visible proposal before confirming."
    });
    expect(parseToolResult(await callbacks.clientTools.request_next_round_step({}))).toEqual({
      status: "not_ready",
      reason: "report_not_confirmed",
      message: "The patient has not confirmed the report."
    });
    expect(proposePatientReport).toHaveBeenCalledWith(reportProposal);
    expect(requestNextRoundStep).toHaveBeenCalledTimes(1);

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
    ["global", "wss://api.elevenlabs.io", "wss://livekit.rtc.elevenlabs.io"],
    ["us", "wss://api.elevenlabs.io", "wss://livekit.rtc.elevenlabs.io"],
    [
      "eu-residency",
      "wss://api.eu.residency.elevenlabs.io",
      "wss://livekit.rtc.eu.residency.elevenlabs.io"
    ],
    [
      "in-residency",
      "wss://api.in.residency.elevenlabs.io",
      "wss://livekit.rtc.in.residency.elevenlabs.io"
    ]
  ] as const)(
    "uses the signed-token %s location for the SDK session",
    async (serverLocation, origin, livekitUrl) => {
      let startOptions: ElevenLabsConversationStartOptions | undefined;
      const provider = new ElevenLabsReactVoiceSessionProvider({
        fetchCredential: vi.fn(async () => ({ ...credential, serverLocation })),
        startConversation: vi.fn(async (options) => {
          startOptions = options;
          return makeConversation().handle;
        }),
        scheduler: new FakeScheduler(),
        createSessionId: () => "local-session"
      });

      await provider.start({
        roundId: ROUND_ID,
        phase: "patient_report",
        signal: new AbortController().signal
      });

      expect(startOptions?.serverLocation).toBe(serverLocation);
      expect(resolveElevenLabsConnectionLocation(serverLocation)).toEqual({ origin, livekitUrl });
    }
  );

  it("rejects out-of-contract dynamic context before requesting a credential", async () => {
    const fetchCredential = vi.fn(async () => credential);
    const startConversation = vi.fn();
    const provider = new ElevenLabsReactVoiceSessionProvider({
      fetchCredential,
      startConversation,
      scheduler: new FakeScheduler(),
      createSessionId: () => "local-session"
    });

    await expect(
      provider.start({
        roundId: ROUND_ID,
        phase: "patient_report",
        signal: new AbortController().signal,
        context: { ...sessionContext, historySummary: "x".repeat(801) }
      })
    ).rejects.toThrow();
    expect(fetchCredential).not.toHaveBeenCalled();
    expect(startConversation).not.toHaveBeenCalled();
  });

  it("contains malformed, invented, duplicate, and late client-tool calls", async () => {
    let startOptions: ElevenLabsConversationStartOptions | undefined;
    const proposePatientReport = vi.fn(async () => ({
      status: "pending_confirmation" as const,
      proposalId: PROPOSAL_ID,
      message: "Review the visible proposal before confirming."
    }));
    const requestNextRoundStep = vi.fn(async () => ({
      status: "not_ready" as const,
      reason: "report_not_confirmed" as const,
      message: "The patient has not confirmed the report."
    }));
    const provider = new ElevenLabsReactVoiceSessionProvider({
      fetchCredential: vi.fn(async () => credential),
      startConversation: vi.fn(async (options) => {
        startOptions = options;
        return makeConversation().handle;
      }),
      scheduler: new FakeScheduler(),
      createSessionId: () => "local-session"
    });
    await provider.start({
      roundId: ROUND_ID,
      phase: "patient_report",
      signal: new AbortController().signal,
      clientTools: { proposePatientReport, requestNextRoundStep }
    });
    if (!startOptions) throw new Error("Expected injected SDK options");

    const malformed = await startOptions.clientTools.propose_patient_report({
      ...reportProposal,
      inventedAuthority: "set_urgency"
    });
    const invented = await startOptions.clientTools.request_next_round_step({
      action: "advance_round"
    });
    const first = await startOptions.clientTools.propose_patient_report(reportProposal);
    const duplicate = await startOptions.clientTools.propose_patient_report(reportProposal);

    expect(parseToolResult(malformed)).toMatchObject({
      status: "not_ready",
      reason: "required_answer_missing"
    });
    expect(parseToolResult(invented)).toMatchObject({
      status: "not_ready",
      reason: "tool_unavailable"
    });
    expect(duplicate).toBe(first);
    expect(proposePatientReport).toHaveBeenCalledTimes(1);
    expect(requestNextRoundStep).not.toHaveBeenCalled();

    await provider.stop("completed");
    const late = await startOptions.clientTools.propose_patient_report(reportProposal);
    expect(parseToolResult(late)).toMatchObject({
      status: "not_ready",
      reason: "round_state_changed"
    });
    expect(proposePatientReport).toHaveBeenCalledTimes(1);
  });

  it.each([
    [new VoiceCredentialError("missing_configuration"), "missing_configuration"],
    [new VoiceCredentialError("quota"), "quota"]
  ] as const)("keeps text fallback available when credentials fail", async (error, reason) => {
    const startConversation = vi.fn();
    const requestMicrophonePermission = vi.fn(async () => undefined);
    const provider = new ElevenLabsReactVoiceSessionProvider({
      fetchCredential: vi.fn(async () => {
        throw error;
      }),
      startConversation,
      requestMicrophonePermission,
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
    expect(requestMicrophonePermission).not.toHaveBeenCalled();
    expect(startConversation).not.toHaveBeenCalled();
    await expect(provider.capabilities()).resolves.toMatchObject({ text: true });
  });

  it("normalizes microphone denial without exposing provider details", async () => {
    const startConversation = vi.fn();
    const provider = new ElevenLabsReactVoiceSessionProvider({
      fetchCredential: vi.fn(async () => credential),
      startConversation,
      requestMicrophonePermission: vi.fn(async () => {
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
    expect(startConversation).not.toHaveBeenCalled();
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

  it("rejects callbacks and tools from the failed connection during reconnect", async () => {
    const scheduler = new FakeScheduler();
    const starts: ElevenLabsConversationStartOptions[] = [];
    const proposePatientReport = vi.fn(async () => ({
      status: "pending_confirmation" as const,
      proposalId: PROPOSAL_ID,
      message: "Review the visible proposal before confirming."
    }));
    const provider = new ElevenLabsReactVoiceSessionProvider({
      fetchCredential: vi.fn(async () => credential),
      startConversation: vi.fn(async (options) => {
        starts.push(options);
        return makeConversation(`provider-session-${starts.length}`).handle;
      }),
      scheduler,
      reconnectDelayMs: 100,
      createSessionId: () => "local-session"
    });
    const events: VoicePresentationEvent[] = [];
    provider.subscribe((event) => events.push(event));
    await provider.start({
      roundId: ROUND_ID,
      phase: "patient_report",
      signal: new AbortController().signal,
      clientTools: {
        proposePatientReport,
        requestNextRoundStep: vi.fn(async () => ({
          status: "not_ready" as const,
          reason: "report_not_confirmed" as const,
          message: "The patient has not confirmed the report."
        }))
      }
    });
    const failedConnection = starts[0];
    if (!failedConnection) throw new Error("Expected first SDK connection");

    failedConnection.onDisconnect({
      reason: "error",
      message: "bounded synthetic disconnect",
      context: { type: "network" }
    });
    const staleToolResult =
      await failedConnection.clientTools.propose_patient_report(reportProposal);
    failedConnection.onMessage({
      message: "Late transcript from failed connection",
      event_id: 55,
      source: "user",
      role: "user"
    });

    expect(parseToolResult(staleToolResult)).toMatchObject({
      status: "not_ready",
      reason: "round_state_changed"
    });
    expect(proposePatientReport).not.toHaveBeenCalled();
    expect(events).not.toContainEqual({
      type: "transcript_final",
      text: "Late transcript from failed connection"
    });

    scheduler.advanceBy(100);
    await flushAsyncWork();
    expect(starts).toHaveLength(2);
    const reconnected = starts[1];
    if (!reconnected) throw new Error("Expected reconnected SDK session");
    expect(
      parseToolResult(await reconnected.clientTools.propose_patient_report(reportProposal))
    ).toMatchObject({ status: "pending_confirmation", proposalId: PROPOSAL_ID });
    expect(proposePatientReport).toHaveBeenCalledTimes(1);
  });

  it("maps a provider disconnect to one bounded terminal event", async () => {
    let callbacks: ElevenLabsConversationStartOptions | undefined;
    const conversation = makeConversation();
    const provider = new ElevenLabsReactVoiceSessionProvider({
      fetchCredential: vi.fn(async () => credential),
      startConversation: vi.fn(async (options) => {
        callbacks = options;
        return conversation.handle;
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

    callbacks?.onDisconnect({ reason: "agent" });
    await flushAsyncWork();
    callbacks?.onDisconnect({ reason: "agent" });

    expect(events.filter((event) => event.type === "ended")).toEqual([
      { type: "ended", reason: "ended_by_provider" }
    ]);
    expect(conversation.endSession).not.toHaveBeenCalled();
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
