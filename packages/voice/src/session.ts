import {
  VoicePresentationEventSchema,
  type VoicePresentationEvent
} from "@homerounds/contracts/voice";
import { z } from "zod";

export const VoiceSessionPhaseSchema = z.enum(["patient_report", "narration"]);
export type VoiceSessionPhase = z.infer<typeof VoiceSessionPhaseSchema>;

export const VoiceSessionFailureCodeSchema = z.enum([
  "permission_denied",
  "credential_unavailable",
  "quota",
  "network",
  "malformed_provider_event",
  "provider",
  "timeout",
  "reconnect_exhausted"
]);
export type VoiceSessionFailureCode = z.infer<typeof VoiceSessionFailureCodeSchema>;

export const VoiceSessionStatusSchema = z.enum([
  "idle",
  "connecting",
  "permission_required",
  "connected",
  "listening",
  "speaking",
  "muted",
  "reconnecting",
  "unavailable",
  "failed",
  "ended",
  "cancelled"
]);
export type VoiceSessionStatus = z.infer<typeof VoiceSessionStatusSchema>;

const SessionEventBaseSchema = z.object({
  eventId: z.string().trim().min(1).max(120)
});

function hasExactValidatedShape(rawValue: unknown, validatedValue: unknown): boolean {
  if (rawValue === validatedValue) return true;
  if (Array.isArray(rawValue) || Array.isArray(validatedValue)) {
    return (
      Array.isArray(rawValue) &&
      Array.isArray(validatedValue) &&
      rawValue.length === validatedValue.length &&
      rawValue.every((entry, index) => hasExactValidatedShape(entry, validatedValue[index]))
    );
  }
  if (
    typeof rawValue !== "object" ||
    rawValue === null ||
    typeof validatedValue !== "object" ||
    validatedValue === null
  ) {
    return false;
  }
  const rawRecord = rawValue as Record<string, unknown>;
  const validatedRecord = validatedValue as Record<string, unknown>;
  const rawKeys = Object.keys(rawRecord);
  const validatedKeys = Object.keys(validatedRecord);
  return (
    rawKeys.length === validatedKeys.length &&
    rawKeys.every(
      (key) =>
        key in validatedRecord && hasExactValidatedShape(rawRecord[key], validatedRecord[key])
    )
  );
}

export const ClosedVoicePresentationEventSchema: z.ZodType<VoicePresentationEvent> = z
  .unknown()
  .transform((rawValue, context) => {
    const parsed = VoicePresentationEventSchema.safeParse(rawValue);
    if (!parsed.success) {
      context.addIssue({ code: "custom", message: "Invalid voice presentation event" });
      return z.NEVER;
    }
    if (!hasExactValidatedShape(rawValue, parsed.data)) {
      context.addIssue({
        code: "custom",
        message: "Voice presentation events cannot contain unrecognized fields"
      });
      return z.NEVER;
    }
    return parsed.data;
  });

export const VoiceSessionEventSchema = z.discriminatedUnion("type", [
  SessionEventBaseSchema.extend({
    type: z.literal("start"),
    roundId: z.uuid(),
    phase: VoiceSessionPhaseSchema,
    generation: z.number().int().positive()
  }).strict(),
  SessionEventBaseSchema.extend({
    type: z.literal("presentation"),
    generation: z.number().int().positive(),
    event: ClosedVoicePresentationEventSchema
  }).strict(),
  SessionEventBaseSchema.extend({
    type: z.literal("cancel"),
    generation: z.number().int().positive()
  }).strict(),
  SessionEventBaseSchema.extend({
    type: z.literal("timeout"),
    generation: z.number().int().positive()
  }).strict(),
  SessionEventBaseSchema.extend({
    type: z.literal("reconnect_exhausted"),
    generation: z.number().int().positive()
  }).strict()
]);
export type VoiceSessionEvent = z.infer<typeof VoiceSessionEventSchema>;

export const VoiceSessionStateSchema = z
  .object({
    status: VoiceSessionStatusSchema,
    generation: z.number().int().nonnegative(),
    roundId: z.uuid().nullable(),
    phase: VoiceSessionPhaseSchema.nullable(),
    sessionId: z.string().min(1).max(200).nullable(),
    muted: z.boolean(),
    reconnectAttempt: z.number().int().nonnegative(),
    failure: VoiceSessionFailureCodeSchema.nullable(),
    endedReason: z.string().min(1).max(120).nullable(),
    acceptedEventIds: z.array(z.string().min(1).max(120)).max(32)
  })
  .strict();
export type VoiceSessionState = z.infer<typeof VoiceSessionStateSchema>;

export type VoiceSessionTransition = Readonly<{
  state: VoiceSessionState;
  accepted: boolean;
  rejection?: "duplicate_event" | "late_event" | "invalid_transition";
}>;

const terminalStatuses = new Set<VoiceSessionStatus>([
  "unavailable",
  "failed",
  "ended",
  "cancelled"
]);

export function createInitialVoiceSessionState(): VoiceSessionState {
  return VoiceSessionStateSchema.parse({
    status: "idle",
    generation: 0,
    roundId: null,
    phase: null,
    sessionId: null,
    muted: false,
    reconnectAttempt: 0,
    failure: null,
    endedReason: null,
    acceptedEventIds: []
  });
}

function withAcceptedEvent(state: VoiceSessionState, eventId: string): VoiceSessionState {
  return {
    ...state,
    acceptedEventIds: [...state.acceptedEventIds.slice(-31), eventId]
  };
}

function reject(
  state: VoiceSessionState,
  rejection: NonNullable<VoiceSessionTransition["rejection"]>
): VoiceSessionTransition {
  return { state, accepted: false, rejection };
}

function failureFromPresentation(event: Extract<VoicePresentationEvent, { type: "error" }>) {
  switch (event.code) {
    case "permission_denied":
      return "permission_denied" as const;
    case "token":
      return "credential_unavailable" as const;
    case "quota":
      return "quota" as const;
    case "network":
      return "network" as const;
    case "malformed_event":
      return "malformed_provider_event" as const;
    case "provider":
      return "provider" as const;
  }
}

function unavailableFailure(
  reason: Extract<VoicePresentationEvent, { type: "unavailable" }>["reason"]
): VoiceSessionFailureCode {
  switch (reason) {
    case "quota":
      return "quota";
    case "network":
      return "network";
    case "disabled":
    case "missing_configuration":
    case "unsupported":
      return "credential_unavailable";
  }
}

function applyPresentation(
  state: VoiceSessionState,
  event: VoicePresentationEvent,
  maxReconnectAttempts: number
): VoiceSessionState {
  switch (event.type) {
    case "connecting":
      return { ...state, status: "connecting" };
    case "connected":
      return {
        ...state,
        status: "connected",
        sessionId: event.sessionId,
        failure: null,
        endedReason: null
      };
    case "permission_required":
      return { ...state, status: "permission_required" };
    case "listening":
    case "transcript_tentative":
    case "transcript_final":
      return { ...state, status: state.muted ? "muted" : "listening" };
    case "narration":
      return { ...state, status: "speaking" };
    case "report_proposed":
      // A provider report remains presentation data. It cannot transition workflow state.
      return state;
    case "muted":
      return { ...state, muted: event.muted, status: event.muted ? "muted" : "listening" };
    case "reconnecting":
      if (event.attempt > maxReconnectAttempts) {
        return {
          ...state,
          status: "failed",
          reconnectAttempt: event.attempt,
          failure: "reconnect_exhausted",
          endedReason: "reconnect_exhausted"
        };
      }
      return {
        ...state,
        status: "reconnecting",
        reconnectAttempt: event.attempt,
        failure: "network"
      };
    case "unavailable":
      return {
        ...state,
        status: "unavailable",
        failure: unavailableFailure(event.reason),
        endedReason: event.reason
      };
    case "error": {
      const failure = failureFromPresentation(event);
      return {
        ...state,
        status: event.recoverable ? "reconnecting" : "failed",
        failure,
        endedReason: event.recoverable ? state.endedReason : failure
      };
    }
    case "ended":
      if (event.reason === "cancelled") {
        return { ...state, status: "cancelled", failure: null, endedReason: event.reason };
      }
      if (event.reason === "timeout") {
        return { ...state, status: "failed", failure: "timeout", endedReason: event.reason };
      }
      if (event.reason === "reconnect_exhausted") {
        return {
          ...state,
          status: "failed",
          failure: "reconnect_exhausted",
          endedReason: event.reason
        };
      }
      return { ...state, status: "ended", failure: null, endedReason: event.reason };
  }
}

/** Pure reducer for UI session state. It rejects duplicate, stale-generation, and post-terminal events. */
export function reduceVoiceSession(
  current: VoiceSessionState,
  rawEvent: VoiceSessionEvent,
  options: Readonly<{ maxReconnectAttempts?: number }> = {}
): VoiceSessionTransition {
  const state = VoiceSessionStateSchema.parse(current);
  const event = VoiceSessionEventSchema.parse(rawEvent);
  const maxReconnectAttempts = z
    .number()
    .int()
    .nonnegative()
    .max(5)
    .parse(options.maxReconnectAttempts ?? 2);

  if (state.acceptedEventIds.includes(event.eventId)) return reject(state, "duplicate_event");

  if (event.type === "start") {
    if (!terminalStatuses.has(state.status) && state.status !== "idle") {
      return reject(state, "invalid_transition");
    }
    if (event.generation <= state.generation) return reject(state, "late_event");
    const started = VoiceSessionStateSchema.parse({
      status: "connecting",
      generation: event.generation,
      roundId: event.roundId,
      phase: event.phase,
      sessionId: null,
      muted: false,
      reconnectAttempt: 0,
      failure: null,
      endedReason: null,
      acceptedEventIds: [event.eventId]
    });
    return { state: started, accepted: true };
  }

  if (event.generation !== state.generation || terminalStatuses.has(state.status)) {
    return reject(state, "late_event");
  }

  let next: VoiceSessionState;
  switch (event.type) {
    case "presentation":
      next = applyPresentation(state, event.event, maxReconnectAttempts);
      break;
    case "cancel":
      next = { ...state, status: "cancelled", failure: null, endedReason: "cancelled" };
      break;
    case "timeout":
      next = { ...state, status: "failed", failure: "timeout", endedReason: "timeout" };
      break;
    case "reconnect_exhausted":
      next = {
        ...state,
        status: "failed",
        failure: "reconnect_exhausted",
        endedReason: "reconnect_exhausted"
      };
      break;
  }

  return {
    state: VoiceSessionStateSchema.parse(withAcceptedEvent(next, event.eventId)),
    accepted: true
  };
}
