import { describe, expect, it } from "vitest";

import {
  VoiceSessionEventSchema,
  createInitialVoiceSessionState,
  reduceVoiceSession,
  type VoiceSessionState
} from "./session";

const ROUND_ID = "cc80d269-2f79-4328-a129-98cac85219e4";

function startSession(): VoiceSessionState {
  const result = reduceVoiceSession(createInitialVoiceSessionState(), {
    type: "start",
    eventId: "event-start",
    roundId: ROUND_ID,
    phase: "patient_report",
    generation: 1
  });
  expect(result.accepted).toBe(true);
  return result.state;
}

function presentation(
  state: VoiceSessionState,
  eventId: string,
  event: import("@homerounds/contracts/voice").VoicePresentationEvent
) {
  return reduceVoiceSession(state, {
    type: "presentation",
    eventId,
    generation: 1,
    event
  });
}

describe("voice session event schema", () => {
  it("is closed and excludes workflow-authority events", () => {
    expect(
      VoiceSessionEventSchema.safeParse({
        type: "start",
        eventId: "event-start",
        roundId: ROUND_ID,
        phase: "patient_report",
        generation: 1,
        urgency: "emergency"
      }).success
    ).toBe(false);
    expect(
      VoiceSessionEventSchema.safeParse({
        type: "set_urgency",
        eventId: "unsafe",
        generation: 1,
        urgency: "emergency"
      }).success
    ).toBe(false);
    expect(
      VoiceSessionEventSchema.safeParse({
        type: "presentation",
        eventId: "unsafe-nested",
        generation: 1,
        event: { type: "listening", urgency: "emergency" }
      }).success
    ).toBe(false);
  });
});

describe("voice session reducer", () => {
  it("models connect, listen, speak, mute, reconnect and end without workflow authority", () => {
    let state = startSession();
    expect(state.status).toBe("connecting");

    state = presentation(state, "event-permission", {
      type: "permission_required",
      permission: "microphone"
    }).state;
    expect(state.status).toBe("permission_required");

    state = presentation(state, "event-connected", {
      type: "connected",
      sessionId: "synthetic-session"
    }).state;
    expect(state.status).toBe("connected");

    state = presentation(state, "event-listening", { type: "listening" }).state;
    expect(state.status).toBe("listening");

    state = presentation(state, "event-narration", {
      type: "narration",
      text: "Please review the text before confirming."
    }).state;
    expect(state.status).toBe("speaking");

    state = presentation(state, "event-muted", { type: "muted", muted: true }).state;
    expect(state.status).toBe("muted");

    state = presentation(state, "event-reconnect", {
      type: "reconnecting",
      attempt: 1
    }).state;
    expect(state).toMatchObject({
      status: "reconnecting",
      reconnectAttempt: 1,
      failure: "network"
    });

    state = presentation(state, "event-reconnected", {
      type: "connected",
      sessionId: "synthetic-session-2"
    }).state;
    const ended = presentation(state, "event-ended", { type: "ended", reason: "completed" });
    expect(ended.state).toMatchObject({ status: "ended", endedReason: "completed" });
  });

  it.each([
    ["permission_denied", "permission_denied"],
    ["token", "credential_unavailable"],
    ["quota", "quota"],
    ["network", "network"],
    ["malformed_event", "malformed_provider_event"],
    ["provider", "provider"]
  ] as const)("normalizes terminal %s errors", (code, expected) => {
    const result = presentation(startSession(), `error-${code}`, {
      type: "error",
      recoverable: false,
      code
    });
    expect(result.state).toMatchObject({ status: "failed", failure: expected });
  });

  it("models timeout, cancel and bounded reconnect exhaustion", () => {
    const timedOut = reduceVoiceSession(startSession(), {
      type: "timeout",
      eventId: "event-timeout",
      generation: 1
    });
    expect(timedOut.state).toMatchObject({ status: "failed", failure: "timeout" });

    const cancelled = reduceVoiceSession(startSession(), {
      type: "cancel",
      eventId: "event-cancel",
      generation: 1
    });
    expect(cancelled.state).toMatchObject({ status: "cancelled", failure: null });

    const exhausted = presentation(startSession(), "event-reconnect-exhausted", {
      type: "reconnecting",
      attempt: 3
    });
    expect(exhausted.state).toMatchObject({
      status: "failed",
      failure: "reconnect_exhausted"
    });
  });

  it("rejects duplicate and late events without mutating state", () => {
    const connected = presentation(startSession(), "event-connected", {
      type: "connected",
      sessionId: "synthetic-session"
    });
    const duplicate = presentation(connected.state, "event-connected", {
      type: "connected",
      sessionId: "synthetic-session"
    });
    expect(duplicate).toMatchObject({ accepted: false, rejection: "duplicate_event" });
    expect(duplicate.state).toEqual(connected.state);

    const ended = presentation(connected.state, "event-ended", {
      type: "ended",
      reason: "completed"
    });
    const late = presentation(ended.state, "event-late", { type: "listening" });
    expect(late).toMatchObject({ accepted: false, rejection: "late_event" });
    expect(late.state).toEqual(ended.state);
  });

  it("does not let a provider report proposal change session authority", () => {
    const state = startSession();
    const result = presentation(state, "event-untrusted-report", {
      type: "report_proposed",
      report: {
        reportId: "dcfce5d5-b681-4593-81af-806256e9e352",
        roundId: ROUND_ID,
        weakness: "severe",
        palpitations: "current",
        redFlags: { chestPain: "yes", severeBreathlessness: "yes", fainted: "yes" },
        inputMode: "voice_confirmed"
      }
    });
    expect(result.accepted).toBe(true);
    expect(result.state.status).toBe("connecting");
  });
});
