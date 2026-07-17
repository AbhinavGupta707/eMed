import {
  VoiceAgentToolOutcomeSchema,
  type VoicePresentationEvent
} from "../../../packages/contracts/src/index";
import {
  ElevenLabsReactVoiceSessionProvider,
  type ElevenLabsConversationHandle,
  type ElevenLabsConversationStartOptions,
  type ElevenLabsConversationStarter,
  type VoiceScheduler
} from "../../../apps/web/src/features/voice/elevenlabs-adapter";
import { describe, expect, it, vi } from "vitest";

import {
  VOICE_TEST_NOW,
  VOICE_TEST_PROPOSAL_ID,
  VOICE_TEST_ROUND_ID,
  voiceProposalFixture
} from "../../ai/voice-agent/fixtures";

type ScheduledTask = Readonly<{
  callback: () => void;
  delayMs: number;
}>;

function createScheduler() {
  let taskId = 0;
  const tasks = new Map<number, ScheduledTask>();
  const scheduler: VoiceScheduler = {
    now: () => Date.parse(VOICE_TEST_NOW),
    setTimeout(callback, delayMs) {
      taskId += 1;
      tasks.set(taskId, { callback, delayMs });
      return taskId;
    },
    clearTimeout(handle) {
      if (typeof handle === "number") tasks.delete(handle);
    }
  };
  return {
    scheduler,
    runDelay(delayMs: number): boolean {
      const entry = [...tasks.entries()].find(([, task]) => task.delayMs === delayMs);
      if (!entry) return false;
      const [id, task] = entry;
      tasks.delete(id);
      task.callback();
      return true;
    },
    pendingDelays: () => [...tasks.values()].map(({ delayMs }) => delayMs).sort((a, b) => a - b)
  };
}

function createConversationHarness() {
  const starts: ElevenLabsConversationStartOptions[] = [];
  const endSessions: Array<ReturnType<typeof vi.fn<() => Promise<void>>>> = [];
  const starter = vi.fn<ElevenLabsConversationStarter>(async (options) => {
    starts.push(options);
    const endSession = vi.fn(async () => undefined);
    endSessions.push(endSession);
    const handle: ElevenLabsConversationHandle = {
      endSession,
      setMicMuted: vi.fn(),
      sendUserMessage: vi.fn(),
      getId: () => `provider-session-${starts.length}`
    };
    return handle;
  });
  return { starter, starts, endSessions };
}

function credential(serverLocation = "global" as const) {
  return {
    provider: "elevenlabs" as const,
    connectionType: "webrtc" as const,
    conversationToken: "synthetic-conversation-token-value",
    expiresAt: "2026-07-17T21:00:00.000Z",
    serverLocation
  };
}

function parseToolOutcome(value: string) {
  return VoiceAgentToolOutcomeSchema.parse(JSON.parse(value));
}

describe("ElevenLabs client-tool boundary", () => {
  it("exposes only frozen tools, rejects extra input, and suppresses duplicate proposals", async () => {
    const scheduler = createScheduler();
    const harness = createConversationHarness();
    const proposePatientReport = vi.fn(async () => ({
      status: "pending_confirmation" as const,
      proposalId: VOICE_TEST_PROPOSAL_ID,
      message: "Review and confirm the visible proposal."
    }));
    const requestNextRoundStep = vi.fn(async () => ({
      status: "not_ready" as const,
      reason: "report_not_confirmed" as const,
      message: "Confirm the visible proposal first."
    }));
    const provider = new ElevenLabsReactVoiceSessionProvider({
      fetchCredential: async () => credential(),
      startConversation: harness.starter,
      scheduler: scheduler.scheduler,
      createSessionId: () => "local-session-1"
    });

    await provider.start({
      roundId: VOICE_TEST_ROUND_ID,
      phase: "patient_report",
      signal: new AbortController().signal,
      context: {
        syntheticDataOnly: true,
        patientAlias: "Synthetic Maya",
        roundPurpose: "Synthetic voice-led check-in",
        historySummary: "One bounded synthetic history summary."
      },
      clientTools: { proposePatientReport, requestNextRoundStep }
    });

    const options = harness.starts[0];
    if (!options) throw new Error("Expected one provider start.");
    expect(Object.keys(options.clientTools).sort()).toEqual([
      "propose_patient_report",
      "request_next_round_step"
    ]);
    expect(Reflect.get(options.clientTools, "set_urgency")).toBeUndefined();
    expect(options.serverLocation).toBe("global");
    expect(options.dynamicVariables).toEqual({
      synthetic_data_only: true,
      patient_alias: "Synthetic Maya",
      round_purpose: "Synthetic voice-led check-in",
      history_summary: "One bounded synthetic history summary."
    });

    const proposal = voiceProposalFixture();
    const [first, duplicate] = await Promise.all([
      options.clientTools.propose_patient_report(proposal),
      options.clientTools.propose_patient_report(proposal)
    ]);
    expect(parseToolOutcome(first)).toEqual({
      status: "pending_confirmation",
      proposalId: VOICE_TEST_PROPOSAL_ID,
      message: "Review and confirm the visible proposal."
    });
    expect(duplicate).toBe(first);
    expect(proposePatientReport).toHaveBeenCalledTimes(1);

    expect(
      parseToolOutcome(
        await options.clientTools.propose_patient_report({
          ...proposal,
          actionId: "invented.action"
        })
      )
    ).toEqual({
      status: "not_ready",
      reason: "required_answer_missing",
      message:
        "The report proposal was not accepted. Please ask the patient for the missing answer."
    });
    expect(proposePatientReport).toHaveBeenCalledTimes(1);

    expect(
      parseToolOutcome(await options.clientTools.request_next_round_step({ urgency: "emergency" }))
    ).toEqual({
      status: "not_ready",
      reason: "tool_unavailable",
      message: "That tool request was not accepted. Continue without changing the round."
    });
    expect(requestNextRoundStep).not.toHaveBeenCalled();
    expect(parseToolOutcome(await options.clientTools.request_next_round_step({}))).toEqual({
      status: "not_ready",
      reason: "report_not_confirmed",
      message: "Confirm the visible proposal first."
    });
    expect(requestNextRoundStep).toHaveBeenCalledOnce();

    await provider.stop("test_complete");
  });

  it("invalidates stale callbacks and stale tools across a bounded reconnect", async () => {
    const scheduler = createScheduler();
    const harness = createConversationHarness();
    const events: VoicePresentationEvent[] = [];
    const proposePatientReport = vi.fn(async () => ({
      status: "pending_confirmation" as const,
      proposalId: VOICE_TEST_PROPOSAL_ID,
      message: "Review the proposal."
    }));
    const provider = new ElevenLabsReactVoiceSessionProvider({
      fetchCredential: async () => credential(),
      startConversation: harness.starter,
      scheduler: scheduler.scheduler,
      createSessionId: () => "local-session-reconnect",
      reconnectDelayMs: 5,
      maxReconnectAttempts: 2
    });
    provider.subscribe((event) => events.push(event));

    await provider.start({
      roundId: VOICE_TEST_ROUND_ID,
      phase: "patient_report",
      signal: new AbortController().signal,
      clientTools: {
        proposePatientReport,
        requestNextRoundStep: async () => ({
          status: "accepted",
          message: "The confirmed report path is ready."
        })
      }
    });
    const firstConnection = harness.starts[0];
    if (!firstConnection) throw new Error("Expected the first connection.");

    firstConnection.onDisconnect({
      reason: "error",
      message: "synthetic network failure",
      context: { type: "network" }
    });
    await vi.waitFor(() => {
      expect(events).toContainEqual({ type: "reconnecting", attempt: 1 });
    });
    expect(scheduler.pendingDelays()).toEqual([5, 120_000]);

    expect(
      parseToolOutcome(
        await firstConnection.clientTools.propose_patient_report(voiceProposalFixture())
      )
    ).toEqual({
      status: "not_ready",
      reason: "round_state_changed",
      message: "This voice session is no longer current. Do not change the round."
    });
    expect(proposePatientReport).not.toHaveBeenCalled();

    expect(scheduler.runDelay(5)).toBe(true);
    await vi.waitFor(() => expect(harness.starts).toHaveLength(2));
    const secondConnection = harness.starts[1];
    if (!secondConnection) throw new Error("Expected the replacement connection.");

    const eventCountBeforeStaleCallback = events.length;
    firstConnection.onMessage({
      message: "stale callback must be ignored",
      event_id: 70,
      source: "user",
      role: "user"
    });
    expect(events).toHaveLength(eventCountBeforeStaleCallback);

    secondConnection.onMessage({
      message: "one synthetic final message",
      event_id: 71,
      source: "user",
      role: "user"
    });
    secondConnection.onMessage({
      message: "duplicate callback must be suppressed",
      event_id: 71,
      source: "user",
      role: "user"
    });
    expect(events.filter(({ type }) => type === "transcript_final")).toEqual([
      { type: "transcript_final", text: "one synthetic final message" }
    ]);

    expect(
      parseToolOutcome(
        await secondConnection.clientTools.propose_patient_report(voiceProposalFixture())
      )
    ).toMatchObject({ status: "pending_confirmation", proposalId: VOICE_TEST_PROPOSAL_ID });
    expect(proposePatientReport).toHaveBeenCalledOnce();

    await provider.stop("test_complete");
  });

  it("fails closed on a malformed callback without exposing its raw content", async () => {
    const scheduler = createScheduler();
    const harness = createConversationHarness();
    const events: VoicePresentationEvent[] = [];
    const provider = new ElevenLabsReactVoiceSessionProvider({
      fetchCredential: async () => credential(),
      startConversation: harness.starter,
      scheduler: scheduler.scheduler,
      createSessionId: () => "local-session-malformed"
    });
    provider.subscribe((event) => events.push(event));

    await provider.start({
      roundId: VOICE_TEST_ROUND_ID,
      phase: "patient_report",
      signal: new AbortController().signal
    });
    const options = harness.starts[0];
    if (!options) throw new Error("Expected one provider start.");

    options.onMessage({
      message: "RAW_PROVIDER_CALLBACK_CANARY",
      event_id: 99,
      source: "user",
      role: "user",
      provider_payload: "must not escape"
    });

    await vi.waitFor(() => {
      expect(events).toContainEqual({
        type: "error",
        recoverable: false,
        code: "malformed_event"
      });
      expect(harness.endSessions[0]).toHaveBeenCalledOnce();
    });
    expect(JSON.stringify(events)).not.toContain("RAW_PROVIDER_CALLBACK_CANARY");
    expect(JSON.stringify(events)).not.toContain("provider_payload");

    const eventCountAfterFailure = events.length;
    options.onMessage({
      message: "late callback",
      event_id: 100,
      source: "user",
      role: "user"
    });
    expect(events).toHaveLength(eventCountAfterFailure);
  });
});
