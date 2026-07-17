"use client";

import {
  VoiceAgentReportProposalSchema,
  VoiceAgentToolOutcomeSchema,
  VoicePresentationEventSchema,
  VoiceServerLocationSchema,
  VoiceSessionContextSchema,
  type VoiceAgentToolOutcome,
  type VoicePresentationEvent,
  type VoiceServerLocation,
  type VoiceSessionContext,
  type VoiceSessionProvider
} from "@homerounds/contracts/voice";
import { VoiceSessionStartInputSchema } from "@homerounds/voice";
import { z } from "zod";

export const ElevenLabsSessionCredentialSchema = z
  .object({
    provider: z.literal("elevenlabs"),
    connectionType: z.literal("webrtc"),
    conversationToken: z.string().trim().min(16).max(4096),
    expiresAt: z.iso.datetime(),
    serverLocation: VoiceServerLocationSchema
  })
  .strict();
export type ElevenLabsSessionCredential = z.infer<typeof ElevenLabsSessionCredentialSchema>;

const ProviderMessageSchema = z
  .object({
    message: z.string().max(2000),
    event_id: z.number().int().nonnegative().optional(),
    source: z.enum(["user", "ai"]),
    role: z.enum(["user", "agent"])
  })
  .strict()
  .superRefine((value, context) => {
    const matchingRole =
      (value.source === "user" && value.role === "user") ||
      (value.source === "ai" && value.role === "agent");
    if (!matchingRole) {
      context.addIssue({
        code: "custom",
        message: "Provider message source and role must agree"
      });
    }
  });

const ProviderConnectSchema = z.object({ conversationId: z.string().min(1).max(200) }).strict();
const ProviderModeSchema = z.object({ mode: z.enum(["speaking", "listening"]) }).strict();
const ProviderStatusSchema = z
  .object({ status: z.enum(["disconnected", "connecting", "connected", "disconnecting"]) })
  .strict();
const ProviderDisconnectContextSchema = z
  .object({
    type: z.string().trim().min(1).max(120),
    reason: z.string().trim().max(240).optional(),
    code: z.number().int().optional()
  })
  .strict();
const ProviderDisconnectSchema = z.discriminatedUnion("reason", [
  z
    .object({
      reason: z.literal("user")
    })
    .strict(),
  z
    .object({
      reason: z.literal("agent"),
      context: ProviderDisconnectContextSchema.optional(),
      closeCode: z.number().int().optional(),
      closeReason: z.string().trim().max(240).optional()
    })
    .strict(),
  z
    .object({
      reason: z.literal("error"),
      message: z.string().trim().min(1).max(500),
      context: ProviderDisconnectContextSchema,
      closeCode: z.number().int().optional(),
      closeReason: z.string().trim().max(240).optional()
    })
    .strict()
]);

const TextInputSchema = z.string().trim().min(1).max(2000);
const StopReasonSchema = z.string().trim().min(1).max(120);
const NoClientToolInputSchema = z.object({}).strict();

const safeToolOutcomes = {
  invalidReport: VoiceAgentToolOutcomeSchema.parse({
    status: "not_ready",
    reason: "required_answer_missing",
    message: "The report proposal was not accepted. Please ask the patient for the missing answer."
  }),
  invalidToolInput: VoiceAgentToolOutcomeSchema.parse({
    status: "not_ready",
    reason: "tool_unavailable",
    message: "That tool request was not accepted. Continue without changing the round."
  }),
  roundChanged: VoiceAgentToolOutcomeSchema.parse({
    status: "not_ready",
    reason: "round_state_changed",
    message: "This voice session is no longer current. Do not change the round."
  }),
  toolUnavailable: VoiceAgentToolOutcomeSchema.parse({
    status: "not_ready",
    reason: "tool_unavailable",
    message: "The requested tool is unavailable. Continue without changing the round."
  })
} as const satisfies Record<string, VoiceAgentToolOutcome>;

function serializeToolOutcome(outcome: VoiceAgentToolOutcome): string {
  return JSON.stringify(VoiceAgentToolOutcomeSchema.parse(outcome));
}

function toDynamicVariables(context: VoiceSessionContext) {
  const parsed = VoiceSessionContextSchema.parse(context);
  return {
    synthetic_data_only: parsed.syntheticDataOnly,
    patient_alias: parsed.patientAlias,
    round_purpose: parsed.roundPurpose,
    history_summary: parsed.historySummary
  } as const;
}

export type ElevenLabsConnectionLocation = Readonly<{
  origin: string;
  livekitUrl: string;
}>;

const elevenLabsConnectionLocations = {
  us: {
    origin: "wss://api.elevenlabs.io",
    livekitUrl: "wss://livekit.rtc.elevenlabs.io"
  },
  global: {
    origin: "wss://api.elevenlabs.io",
    livekitUrl: "wss://livekit.rtc.elevenlabs.io"
  },
  "eu-residency": {
    origin: "wss://api.eu.residency.elevenlabs.io",
    livekitUrl: "wss://livekit.rtc.eu.residency.elevenlabs.io"
  },
  "in-residency": {
    origin: "wss://api.in.residency.elevenlabs.io",
    livekitUrl: "wss://livekit.rtc.in.residency.elevenlabs.io"
  }
} as const satisfies Record<VoiceServerLocation, ElevenLabsConnectionLocation>;

/** Mirrors the location resolution used by the installed ElevenLabs React/client SDK. */
export function resolveElevenLabsConnectionLocation(
  rawLocation: VoiceServerLocation
): ElevenLabsConnectionLocation {
  const location = VoiceServerLocationSchema.parse(rawLocation);
  return elevenLabsConnectionLocations[location];
}

export type VoiceCredentialFetcher = (
  request: Readonly<{ roundId: string; phase: "patient_report" | "narration"; signal: AbortSignal }>
) => Promise<unknown>;

export type ElevenLabsConversationHandle = Readonly<{
  endSession(): Promise<void>;
  setMicMuted(muted: boolean): void;
  sendUserMessage(text: string): void;
  getId(): string;
}>;

export type ElevenLabsConversationStartOptions = Readonly<{
  conversationToken: string;
  connectionType: "webrtc";
  serverLocation: z.infer<typeof VoiceServerLocationSchema>;
  dynamicVariables?: Readonly<Record<string, string | number | boolean>>;
  clientTools: Readonly<{
    propose_patient_report(parameters: unknown): Promise<string>;
    request_next_round_step(parameters: unknown): Promise<string>;
  }>;
  onConnect(value: unknown): void;
  onDisconnect(value: unknown): void;
  onError(message: unknown, context?: unknown): void;
  onMessage(value: unknown): void;
  onModeChange(value: unknown): void;
  onStatusChange(value: unknown): void;
}>;

export type ElevenLabsConversationStarter = (
  options: ElevenLabsConversationStartOptions
) => Promise<ElevenLabsConversationHandle>;

export type MicrophonePermissionRequester = (signal: AbortSignal) => Promise<void>;

/** Requests consent without retaining or reading audio; the SDK opens its own live track afterwards. */
export async function requestBrowserMicrophonePermission(signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw new DOMException("Session cancelled", "AbortError");
  if (!globalThis.isSecureContext || !globalThis.navigator.mediaDevices?.getUserMedia) {
    throw new DOMException("Microphone is unavailable", "NotSupportedError");
  }
  const stream = await globalThis.navigator.mediaDevices.getUserMedia({ audio: true });
  try {
    if (signal.aborted) throw new DOMException("Session cancelled", "AbortError");
  } finally {
    for (const track of stream.getTracks()) track.stop();
  }
}

export type VoiceScheduler = Readonly<{
  now(): number;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}>;

const browserScheduler: VoiceScheduler = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>)
};

export async function startElevenLabsReactConversation(
  options: ElevenLabsConversationStartOptions
): Promise<ElevenLabsConversationHandle> {
  // Conditional import keeps the hosted provider out of the no-key interaction path.
  const { Conversation } = await import("@elevenlabs/react");
  const connectionLocation = resolveElevenLabsConnectionLocation(options.serverLocation);
  const conversation = await Conversation.startSession({
    conversationToken: options.conversationToken,
    connectionType: options.connectionType,
    ...connectionLocation,
    ...(options.dynamicVariables ? { dynamicVariables: options.dynamicVariables } : {}),
    clientTools: options.clientTools,
    onConnect: options.onConnect,
    onDisconnect: options.onDisconnect,
    onError: options.onError,
    onMessage: options.onMessage,
    onModeChange: options.onModeChange,
    onStatusChange: options.onStatusChange
  });
  return {
    endSession: () => conversation.endSession(),
    setMicMuted: (muted) => conversation.setMicMuted(muted),
    sendUserMessage: (text) => conversation.sendUserMessage(text),
    getId: () => conversation.getId()
  };
}

export const VoiceCredentialErrorCodeSchema = z.enum([
  "missing_configuration",
  "quota",
  "network",
  "provider"
]);
export type VoiceCredentialErrorCode = z.infer<typeof VoiceCredentialErrorCodeSchema>;

export class VoiceCredentialError extends Error {
  readonly code: VoiceCredentialErrorCode;

  constructor(code: VoiceCredentialErrorCode) {
    super("Voice session credential unavailable");
    this.name = "VoiceCredentialError";
    this.code = VoiceCredentialErrorCodeSchema.parse(code);
  }
}

type ProviderFailure = "permission_denied" | "token" | "quota" | "network" | "provider";

function classifyProviderFailure(error: unknown): ProviderFailure {
  if (error instanceof VoiceCredentialError) {
    switch (error.code) {
      case "missing_configuration":
        return "token";
      case "quota":
        return "quota";
      case "network":
        return "network";
      case "provider":
        return "provider";
    }
  }
  if (error instanceof DOMException && error.name === "NotAllowedError") return "permission_denied";
  const safeText =
    error instanceof Error
      ? `${error.name} ${error.message}`.toLowerCase()
      : typeof error === "string"
        ? error.toLowerCase()
        : "";
  if (safeText.includes("permission") || safeText.includes("notallowed")) {
    return "permission_denied";
  }
  if (safeText.includes("quota") || safeText.includes("429")) return "quota";
  if (
    safeText.includes("token") ||
    safeText.includes("credential") ||
    safeText.includes("unauthor") ||
    safeText.includes("401")
  ) {
    return "token";
  }
  if (
    safeText.includes("network") ||
    safeText.includes("webrtc") ||
    safeText.includes("disconnect") ||
    safeText.includes("timeout")
  ) {
    return "network";
  }
  return "provider";
}

type ActiveSession = {
  readonly generation: number;
  readonly localSessionId: string;
  readonly request: z.infer<typeof VoiceSessionStartInputSchema>;
  readonly seenMessageIds: Set<number>;
  readonly proposalToolResults: Map<string, Promise<string>>;
  readonly onAbort: () => void;
  conversation: ElevenLabsConversationHandle | undefined;
  microphonePermissionReady: boolean;
  timeoutHandle?: unknown;
  reconnectHandle?: unknown;
  reconnectAttempt: number;
  connectionAttempt: number;
  terminal: boolean;
  connectedSessionId: string | undefined;
};

type AdapterOptions = Readonly<{
  fetchCredential: VoiceCredentialFetcher;
  startConversation?: ElevenLabsConversationStarter;
  requestMicrophonePermission?: MicrophonePermissionRequester;
  scheduler?: VoiceScheduler;
  createSessionId?: () => string;
  sessionMaxMs?: number;
  reconnectDelayMs?: number;
  maxReconnectAttempts?: number;
}>;

export class ElevenLabsReactVoiceSessionProvider implements VoiceSessionProvider {
  readonly kind = "elevenlabs" as const;
  readonly #fetchCredential: VoiceCredentialFetcher;
  readonly #startConversation: ElevenLabsConversationStarter;
  readonly #requestMicrophonePermission: MicrophonePermissionRequester;
  readonly #scheduler: VoiceScheduler;
  readonly #createSessionId: () => string;
  readonly #sessionMaxMs: number;
  readonly #reconnectDelayMs: number;
  readonly #maxReconnectAttempts: number;
  readonly #listeners = new Set<(event: VoicePresentationEvent) => void>();
  #active: ActiveSession | undefined;
  #generation = 0;

  constructor(options: AdapterOptions) {
    this.#fetchCredential = options.fetchCredential;
    this.#startConversation = options.startConversation ?? startElevenLabsReactConversation;
    this.#requestMicrophonePermission =
      options.requestMicrophonePermission ??
      (options.startConversation ? () => Promise.resolve() : requestBrowserMicrophonePermission);
    this.#scheduler = options.scheduler ?? browserScheduler;
    this.#createSessionId = options.createSessionId ?? (() => globalThis.crypto.randomUUID());
    this.#sessionMaxMs = z
      .number()
      .int()
      .positive()
      .max(300_000)
      .parse(options.sessionMaxMs ?? 120_000);
    this.#reconnectDelayMs = z
      .number()
      .int()
      .positive()
      .max(10_000)
      .parse(options.reconnectDelayMs ?? 500);
    this.#maxReconnectAttempts = z
      .number()
      .int()
      .min(0)
      .max(5)
      .parse(options.maxReconnectAttempts ?? 2);
  }

  capabilities(): Promise<{ available: boolean; voice: boolean; text: boolean }> {
    return Promise.resolve({ available: true, voice: true, text: true });
  }

  async start(input: Parameters<VoiceSessionProvider["start"]>[0]): Promise<{ sessionId: string }> {
    const request = VoiceSessionStartInputSchema.parse(input);
    if (request.signal.aborted) throw new DOMException("Session cancelled", "AbortError");
    if (this.#active) await this.stop("replaced");

    const generation = ++this.#generation;
    const active: ActiveSession = {
      generation,
      localSessionId: this.#createSessionId(),
      request,
      seenMessageIds: new Set(),
      proposalToolResults: new Map(),
      onAbort: () => void this.stop("cancelled"),
      conversation: undefined,
      microphonePermissionReady: false,
      reconnectAttempt: 0,
      connectionAttempt: 0,
      terminal: false,
      connectedSessionId: undefined
    };
    this.#active = active;
    request.signal.addEventListener("abort", active.onAbort, { once: true });
    this.#emitFor(active, { type: "connecting" });
    this.#emitFor(active, { type: "permission_required", permission: "microphone" });
    active.timeoutHandle = this.#scheduler.setTimeout(
      () => void this.#terminate(active, "timeout"),
      this.#sessionMaxMs
    );
    await this.#connect(active);
    return { sessionId: active.connectedSessionId ?? active.localSessionId };
  }

  async stop(reason: string): Promise<void> {
    const active = this.#active;
    if (!active || active.terminal) return;
    await this.#terminate(active, StopReasonSchema.parse(reason));
  }

  setMuted(muted: boolean): Promise<void> {
    const active = this.#active;
    if (!active?.conversation || active.terminal) return Promise.resolve();
    active.conversation.setMicMuted(muted);
    this.#emitFor(active, { type: "muted", muted });
    return Promise.resolve();
  }

  sendText(text: string): Promise<void> {
    const active = this.#active;
    if (!active?.conversation || active.terminal) {
      return Promise.reject(new Error("No active ElevenLabs session"));
    }
    active.conversation.sendUserMessage(TextInputSchema.parse(text));
    return Promise.resolve();
  }

  subscribe(listener: (event: VoicePresentationEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async #connect(active: ActiveSession): Promise<void> {
    if (!this.#isCurrent(active)) return;
    const connectionAttempt = ++active.connectionAttempt;
    try {
      const rawCredential = await this.#fetchCredential(active.request);
      if (!this.#isCurrentConnection(active, connectionAttempt)) return;
      const credential = ElevenLabsSessionCredentialSchema.parse(rawCredential);
      if (Date.parse(credential.expiresAt) <= this.#scheduler.now()) {
        throw new VoiceCredentialError("missing_configuration");
      }
      if (!active.microphonePermissionReady) {
        await this.#requestMicrophonePermission(active.request.signal);
        if (!this.#isCurrentConnection(active, connectionAttempt)) return;
        active.microphonePermissionReady = true;
      }

      const conversation = await this.#startConversation({
        conversationToken: credential.conversationToken,
        connectionType: "webrtc",
        serverLocation: credential.serverLocation,
        ...(active.request.context
          ? { dynamicVariables: toDynamicVariables(active.request.context) }
          : {}),
        clientTools: this.#createClientTools(active, connectionAttempt),
        onConnect: (value) => {
          if (this.#isCurrentConnection(active, connectionAttempt)) {
            this.#handleConnect(active, value);
          }
        },
        onDisconnect: (value) => {
          if (this.#isCurrentConnection(active, connectionAttempt)) {
            this.#handleDisconnect(active, value);
          }
        },
        onError: (message, context) => {
          if (this.#isCurrentConnection(active, connectionAttempt)) {
            this.#handleError(active, message, context);
          }
        },
        onMessage: (value) => {
          if (this.#isCurrentConnection(active, connectionAttempt)) {
            this.#handleMessage(active, value);
          }
        },
        onModeChange: (value) => {
          if (this.#isCurrentConnection(active, connectionAttempt)) {
            this.#handleMode(active, value);
          }
        },
        onStatusChange: (value) => {
          if (this.#isCurrentConnection(active, connectionAttempt)) {
            this.#handleStatus(active, value);
          }
        }
      });
      if (!this.#isCurrentConnection(active, connectionAttempt)) {
        await conversation.endSession();
        return;
      }
      active.conversation = conversation;
      const sessionId = active.connectedSessionId ?? conversation.getId();
      if (!active.connectedSessionId) {
        active.connectedSessionId = sessionId;
        this.#emitFor(active, { type: "connected", sessionId });
      }
      active.reconnectHandle = undefined;
      this.#emitFor(active, { type: "listening" });
    } catch (error: unknown) {
      if (!this.#isCurrentConnection(active, connectionAttempt)) return;
      await this.#handleFailure(active, classifyProviderFailure(error));
    }
  }

  #createClientTools(
    active: ActiveSession,
    connectionAttempt: number
  ): ElevenLabsConversationStartOptions["clientTools"] {
    return {
      propose_patient_report: (parameters) =>
        this.#proposePatientReport(active, connectionAttempt, parameters),
      request_next_round_step: (parameters) =>
        this.#requestNextRoundStep(active, connectionAttempt, parameters)
    };
  }

  #proposePatientReport(
    active: ActiveSession,
    connectionAttempt: number,
    parameters: unknown
  ): Promise<string> {
    if (!this.#isCurrentConnection(active, connectionAttempt)) {
      return Promise.resolve(serializeToolOutcome(safeToolOutcomes.roundChanged));
    }
    const proposal = VoiceAgentReportProposalSchema.safeParse(parameters);
    if (!proposal.success) {
      return Promise.resolve(serializeToolOutcome(safeToolOutcomes.invalidReport));
    }
    const proposalKey = JSON.stringify(proposal.data);
    const duplicate = active.proposalToolResults.get(proposalKey);
    if (duplicate) return duplicate;
    if (active.proposalToolResults.size >= 8) {
      return Promise.resolve(serializeToolOutcome(safeToolOutcomes.toolUnavailable));
    }

    const result = this.#invokeTool(active, connectionAttempt, () =>
      active.request.clientTools?.proposePatientReport(proposal.data)
    );
    active.proposalToolResults.set(proposalKey, result);
    return result;
  }

  #requestNextRoundStep(
    active: ActiveSession,
    connectionAttempt: number,
    parameters: unknown
  ): Promise<string> {
    if (!this.#isCurrentConnection(active, connectionAttempt)) {
      return Promise.resolve(serializeToolOutcome(safeToolOutcomes.roundChanged));
    }
    if (!NoClientToolInputSchema.safeParse(parameters).success) {
      return Promise.resolve(serializeToolOutcome(safeToolOutcomes.invalidToolInput));
    }
    return this.#invokeTool(active, connectionAttempt, () =>
      active.request.clientTools?.requestNextRoundStep()
    );
  }

  async #invokeTool(
    active: ActiveSession,
    connectionAttempt: number,
    invoke: () => Promise<VoiceAgentToolOutcome> | undefined
  ): Promise<string> {
    if (!this.#isCurrentConnection(active, connectionAttempt)) {
      return serializeToolOutcome(safeToolOutcomes.roundChanged);
    }
    try {
      const pendingOutcome = invoke();
      if (!pendingOutcome) return serializeToolOutcome(safeToolOutcomes.toolUnavailable);
      const outcome = VoiceAgentToolOutcomeSchema.safeParse(await pendingOutcome);
      if (!this.#isCurrentConnection(active, connectionAttempt)) {
        return serializeToolOutcome(safeToolOutcomes.roundChanged);
      }
      return serializeToolOutcome(
        outcome.success ? outcome.data : safeToolOutcomes.toolUnavailable
      );
    } catch {
      return serializeToolOutcome(
        this.#isCurrentConnection(active, connectionAttempt)
          ? safeToolOutcomes.toolUnavailable
          : safeToolOutcomes.roundChanged
      );
    }
  }

  #handleConnect(active: ActiveSession, rawValue: unknown): void {
    if (!this.#isCurrent(active)) return;
    const value = ProviderConnectSchema.safeParse(rawValue);
    if (!value.success) {
      void this.#failMalformed(active);
      return;
    }
    if (active.connectedSessionId === value.data.conversationId) return;
    active.connectedSessionId = value.data.conversationId;
    this.#emitFor(active, { type: "connected", sessionId: value.data.conversationId });
  }

  #handleMessage(active: ActiveSession, rawValue: unknown): void {
    if (!this.#isCurrent(active)) return;
    const value = ProviderMessageSchema.safeParse(rawValue);
    if (!value.success) {
      void this.#failMalformed(active);
      return;
    }
    if (value.data.event_id !== undefined) {
      if (active.seenMessageIds.has(value.data.event_id)) return;
      active.seenMessageIds.add(value.data.event_id);
    }
    const text = value.data.message.trim();
    if (text.length === 0) return;
    this.#emitFor(
      active,
      value.data.role === "user"
        ? { type: "transcript_final", text }
        : { type: "narration", text: text.slice(0, 1000) }
    );
  }

  #handleMode(active: ActiveSession, rawValue: unknown): void {
    if (!this.#isCurrent(active)) return;
    const value = ProviderModeSchema.safeParse(rawValue);
    if (!value.success) {
      void this.#failMalformed(active);
      return;
    }
    if (value.data.mode === "listening") this.#emitFor(active, { type: "listening" });
  }

  #handleStatus(active: ActiveSession, rawValue: unknown): void {
    if (!this.#isCurrent(active)) return;
    const value = ProviderStatusSchema.safeParse(rawValue);
    if (!value.success) {
      void this.#failMalformed(active);
      return;
    }
    if (value.data.status === "connecting") this.#emitFor(active, { type: "connecting" });
  }

  #handleError(active: ActiveSession, message: unknown, context?: unknown): void {
    if (!this.#isCurrent(active)) return;
    const failure = classifyProviderFailure(
      typeof message === "string"
        ? `${message} ${typeof context === "string" ? context : ""}`
        : message
    );
    void this.#handleFailure(active, failure);
  }

  #handleDisconnect(active: ActiveSession, rawValue: unknown): void {
    if (!this.#isCurrent(active)) return;
    const value = ProviderDisconnectSchema.safeParse(rawValue);
    if (!value.success) {
      void this.#failMalformed(active);
      return;
    }
    active.conversation = undefined;
    active.connectedSessionId = undefined;
    if (value.data.reason === "user") {
      void this.#terminate(active, "ended_by_user");
    } else if (value.data.reason === "agent") {
      void this.#terminate(active, "ended_by_provider");
    } else {
      void this.#handleFailure(active, "network");
    }
  }

  async #handleFailure(active: ActiveSession, failure: ProviderFailure): Promise<void> {
    if (!this.#isCurrent(active)) return;
    switch (failure) {
      case "permission_denied":
        this.#emitFor(active, { type: "error", recoverable: false, code: failure });
        await this.#terminate(active, "permission_denied", false);
        return;
      case "token":
        this.#emitFor(active, { type: "unavailable", reason: "missing_configuration" });
        await this.#terminate(active, "credential_unavailable", false);
        return;
      case "quota":
        this.#emitFor(active, { type: "unavailable", reason: "quota" });
        await this.#terminate(active, "quota", false);
        return;
      case "provider":
        this.#emitFor(active, { type: "error", recoverable: false, code: "provider" });
        await this.#terminate(active, "provider_error", false);
        return;
      case "network":
        await this.#scheduleReconnect(active);
        return;
    }
  }

  async #scheduleReconnect(active: ActiveSession): Promise<void> {
    if (!this.#isCurrent(active) || active.reconnectHandle !== undefined) return;
    if (active.reconnectAttempt >= this.#maxReconnectAttempts) {
      this.#emitFor(active, { type: "error", recoverable: false, code: "network" });
      await this.#terminate(active, "reconnect_exhausted");
      return;
    }
    active.reconnectAttempt += 1;
    // Invalidate callbacks and tools from the failed connection before the retry delay.
    active.connectionAttempt += 1;
    active.seenMessageIds.clear();
    this.#emitFor(active, { type: "error", recoverable: true, code: "network" });
    this.#emitFor(active, { type: "reconnecting", attempt: active.reconnectAttempt });
    active.reconnectHandle = this.#scheduler.setTimeout(() => {
      active.reconnectHandle = undefined;
      void this.#connect(active);
    }, this.#reconnectDelayMs * active.reconnectAttempt);
  }

  async #failMalformed(active: ActiveSession): Promise<void> {
    if (!this.#isCurrent(active)) return;
    this.#emitFor(active, { type: "error", recoverable: false, code: "malformed_event" });
    await this.#terminate(active, "malformed_provider_event", false);
  }

  async #terminate(active: ActiveSession, reason: string, emitEnded = true): Promise<void> {
    if (!this.#isCurrent(active)) return;
    active.terminal = true;
    active.request.signal.removeEventListener("abort", active.onAbort);
    if (active.timeoutHandle !== undefined) this.#scheduler.clearTimeout(active.timeoutHandle);
    if (active.reconnectHandle !== undefined) this.#scheduler.clearTimeout(active.reconnectHandle);
    const conversation = active.conversation;
    active.conversation = undefined;
    if (this.#active === active) this.#active = undefined;
    // Emit before asynchronous transport cleanup so an old session cannot end a replacement session.
    if (emitEnded) this.#emit({ type: "ended", reason: StopReasonSchema.parse(reason) });
    if (conversation) {
      try {
        await conversation.endSession();
      } catch {
        // Cleanup failure cannot make raw provider details observable or revive the session.
      }
    }
  }

  #isCurrent(active: ActiveSession): boolean {
    return this.#active === active && active.generation === this.#generation && !active.terminal;
  }

  #isCurrentConnection(active: ActiveSession, connectionAttempt: number): boolean {
    return this.#isCurrent(active) && active.connectionAttempt === connectionAttempt;
  }

  #emitFor(active: ActiveSession, rawEvent: VoicePresentationEvent): void {
    if (this.#isCurrent(active)) this.#emit(rawEvent);
  }

  #emit(rawEvent: VoicePresentationEvent): void {
    const event = VoicePresentationEventSchema.parse(rawEvent);
    for (const listener of this.#listeners) listener(event);
  }
}
