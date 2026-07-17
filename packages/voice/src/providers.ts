import {
  VoicePresentationEventSchema,
  VoiceSessionContextSchema,
  type VoiceAgentClientToolHandlers,
  type VoicePresentationEvent,
  type VoiceSessionProvider
} from "@homerounds/contracts/voice";
import { z } from "zod";

import { SYNTHETIC_REPORT_PROPOSAL_FIXTURE, SYNTHETIC_TRANSCRIPT_FIXTURES } from "./fixtures";
import { VoiceSessionPhaseSchema } from "./session";

export const VoiceAgentClientToolHandlersSchema = z
  .object({
    proposePatientReport: z.custom<VoiceAgentClientToolHandlers["proposePatientReport"]>(
      (value) => typeof value === "function"
    ),
    requestNextRoundStep: z.custom<VoiceAgentClientToolHandlers["requestNextRoundStep"]>(
      (value) => typeof value === "function"
    )
  })
  .strict();

export const VoiceSessionStartInputSchema = z
  .object({
    roundId: z.uuid(),
    phase: VoiceSessionPhaseSchema,
    signal: z.custom<AbortSignal>((value) => value instanceof AbortSignal),
    context: VoiceSessionContextSchema.optional(),
    clientTools: VoiceAgentClientToolHandlersSchema.optional()
  })
  .strict();

type ProviderStartInput = Parameters<VoiceSessionProvider["start"]>[0];

const TextInputSchema = z.string().trim().min(1).max(2000);
const StopReasonSchema = z.string().trim().min(1).max(120);

export type VoiceProviderListener = (event: VoicePresentationEvent) => void;

class PresentationEventBus {
  readonly #listeners = new Set<VoiceProviderListener>();

  subscribe(listener: VoiceProviderListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  emit(rawEvent: VoicePresentationEvent): void {
    const event = VoicePresentationEventSchema.parse(rawEvent);
    for (const listener of this.#listeners) listener(event);
  }
}

type ActiveTextSession = Readonly<{
  sessionId: string;
  signal: AbortSignal;
  onAbort: () => void;
}>;

export class TextVoiceSessionProvider implements VoiceSessionProvider {
  readonly kind = "disabled" as const;
  readonly #events = new PresentationEventBus();
  readonly #createSessionId: () => string;
  #active: ActiveTextSession | undefined;

  constructor(createSessionId: () => string = () => globalThis.crypto.randomUUID()) {
    this.#createSessionId = createSessionId;
  }

  capabilities(): Promise<{ available: boolean; voice: boolean; text: boolean }> {
    return Promise.resolve({ available: true, voice: false, text: true });
  }

  async start(input: ProviderStartInput): Promise<{ sessionId: string }> {
    const parsed = VoiceSessionStartInputSchema.parse(input);
    if (parsed.signal.aborted) throw new DOMException("Session cancelled", "AbortError");
    if (this.#active) await this.stop("replaced");

    const sessionId = this.#createSessionId();
    const onAbort = () => void this.stop("cancelled");
    this.#active = { sessionId, signal: parsed.signal, onAbort };
    parsed.signal.addEventListener("abort", onAbort, { once: true });
    this.#events.emit({ type: "connecting" });
    this.#events.emit({ type: "connected", sessionId });
    this.#events.emit({ type: "listening" });
    return { sessionId };
  }

  async stop(reason: string): Promise<void> {
    const active = this.#active;
    if (!active) return;
    this.#active = undefined;
    active.signal.removeEventListener("abort", active.onAbort);
    this.#events.emit({ type: "ended", reason: StopReasonSchema.parse(reason) });
  }

  setMuted(muted: boolean): Promise<void> {
    if (this.#active) this.#events.emit({ type: "muted", muted });
    return Promise.resolve();
  }

  sendText(text: string): Promise<void> {
    if (!this.#active) return Promise.reject(new Error("No active text session"));
    this.#events.emit({ type: "transcript_final", text: TextInputSchema.parse(text) });
    return Promise.resolve();
  }

  subscribe(listener: VoiceProviderListener): () => void {
    return this.#events.subscribe(listener);
  }
}

/** Identifier-free, in-memory voice fixture for browser automation only. */
export class SyntheticVoiceSessionProvider implements VoiceSessionProvider {
  readonly kind = "disabled" as const;
  readonly #events = new PresentationEventBus();
  readonly #createSessionId: () => string;
  #active: ActiveTextSession | undefined;

  constructor(createSessionId: () => string = () => globalThis.crypto.randomUUID()) {
    this.#createSessionId = createSessionId;
  }

  capabilities(): Promise<{ available: boolean; voice: boolean; text: boolean }> {
    return Promise.resolve({ available: true, voice: true, text: true });
  }

  async start(input: ProviderStartInput): Promise<{ sessionId: string }> {
    const parsed = VoiceSessionStartInputSchema.parse(input);
    if (parsed.signal.aborted) throw new DOMException("Session cancelled", "AbortError");
    if (this.#active) await this.stop("replaced");

    const sessionId = this.#createSessionId();
    const onAbort = () => void this.stop("cancelled");
    this.#active = { sessionId, signal: parsed.signal, onAbort };
    parsed.signal.addEventListener("abort", onAbort, { once: true });
    this.#events.emit({ type: "connecting" });
    this.#events.emit({ type: "connected", sessionId });
    this.#events.emit({ type: "listening" });
    this.#events.emit(SYNTHETIC_TRANSCRIPT_FIXTURES.tentative);
    this.#events.emit(SYNTHETIC_TRANSCRIPT_FIXTURES.final);
    if (parsed.clientTools) {
      await parsed.clientTools.proposePatientReport(SYNTHETIC_REPORT_PROPOSAL_FIXTURE);
    }
    return { sessionId };
  }

  async stop(reason: string): Promise<void> {
    const active = this.#active;
    if (!active) return;
    this.#active = undefined;
    active.signal.removeEventListener("abort", active.onAbort);
    this.#events.emit({ type: "ended", reason: StopReasonSchema.parse(reason) });
  }

  setMuted(muted: boolean): Promise<void> {
    if (this.#active) this.#events.emit({ type: "muted", muted });
    return Promise.resolve();
  }

  sendText(text: string): Promise<void> {
    if (!this.#active) return Promise.reject(new Error("No active synthetic session"));
    this.#events.emit({ type: "transcript_final", text: TextInputSchema.parse(text) });
    return Promise.resolve();
  }

  subscribe(listener: VoiceProviderListener): () => void {
    return this.#events.subscribe(listener);
  }
}

export class DisabledVoiceSessionProvider implements VoiceSessionProvider {
  readonly kind = "disabled" as const;
  readonly #events = new PresentationEventBus();
  readonly #reason: "disabled" | "missing_configuration";
  readonly #createSessionId: () => string;
  #started = false;

  constructor(
    reason: "disabled" | "missing_configuration" = "disabled",
    createSessionId: () => string = () => globalThis.crypto.randomUUID()
  ) {
    this.#reason = reason;
    this.#createSessionId = createSessionId;
  }

  capabilities(): Promise<{ available: boolean; voice: boolean; text: boolean }> {
    return Promise.resolve({ available: false, voice: false, text: true });
  }

  start(input: ProviderStartInput): Promise<{ sessionId: string }> {
    const parsed = VoiceSessionStartInputSchema.parse(input);
    const sessionId = this.#createSessionId();
    if (parsed.signal.aborted)
      return Promise.reject(new DOMException("Session cancelled", "AbortError"));
    this.#started = true;
    this.#events.emit({ type: "unavailable", reason: this.#reason });
    return Promise.resolve({ sessionId });
  }

  stop(reason: string): Promise<void> {
    if (!this.#started) return Promise.resolve();
    this.#started = false;
    this.#events.emit({ type: "ended", reason: StopReasonSchema.parse(reason) });
    return Promise.resolve();
  }

  setMuted(muted: boolean): Promise<void> {
    if (this.#started) this.#events.emit({ type: "muted", muted });
    return Promise.resolve();
  }

  sendText(text: string): Promise<void> {
    this.#events.emit({ type: "transcript_final", text: TextInputSchema.parse(text) });
    return Promise.resolve();
  }

  subscribe(listener: VoiceProviderListener): () => void {
    return this.#events.subscribe(listener);
  }
}
