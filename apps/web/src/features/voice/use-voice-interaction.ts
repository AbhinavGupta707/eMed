"use client";

import type { VoicePresentationEvent, VoiceSessionProvider } from "@homerounds/contracts/voice";
import {
  createInitialVoiceSessionState,
  createTranscriptState,
  reduceTranscript,
  reduceVoiceSession,
  type TranscriptConfirmation,
  type TranscriptState,
  type VoiceSessionState
} from "@homerounds/voice";
import { useCallback, useEffect, useRef, useState } from "react";

type VoiceCapabilities = Readonly<{ available: boolean; voice: boolean; text: boolean }>;

type UseVoiceInteractionOptions = Readonly<{
  provider: VoiceSessionProvider;
  roundId: string;
  createId?: () => string;
  now?: () => string;
  onConfirmed?: (confirmation: TranscriptConfirmation) => void;
}>;

export type VoiceInteractionController = Readonly<{
  capabilities: VoiceCapabilities | null;
  session: VoiceSessionState;
  transcript: TranscriptState;
  startVoice(): Promise<void>;
  endVoice(): Promise<void>;
  cancelVoice(): Promise<void>;
  setMuted(muted: boolean): Promise<void>;
  replaceTranscript(text: string): void;
  confirmTranscript(): TranscriptConfirmation | null;
}>;

function defaultCreateId(): string {
  return globalThis.crypto.randomUUID();
}

function defaultNow(): string {
  return new Date().toISOString();
}

/** React ownership for ephemeral transcript/session state. Nothing here writes storage or logs content. */
export function useVoiceInteraction({
  provider,
  roundId,
  createId = defaultCreateId,
  now = defaultNow,
  onConfirmed
}: UseVoiceInteractionOptions): VoiceInteractionController {
  const [capabilities, setCapabilities] = useState<VoiceCapabilities | null>(null);
  const [session, setSession] = useState<VoiceSessionState>(createInitialVoiceSessionState);
  const [transcript, setTranscript] = useState<TranscriptState>(() =>
    createTranscriptState(roundId, 1)
  );
  const sessionRef = useRef(session);
  const transcriptRef = useRef(transcript);
  const generationRef = useRef(1);
  const abortRef = useRef<AbortController | null>(null);
  const proposalIdRef = useRef<string | null>(null);
  const eventSequenceRef = useRef(0);

  const nextEventId = useCallback(
    (prefix: string) => `${prefix}-${++eventSequenceRef.current}`,
    []
  );

  const updateSession = useCallback((event: Parameters<typeof reduceVoiceSession>[1]) => {
    const transition = reduceVoiceSession(sessionRef.current, event);
    if (transition.accepted) {
      sessionRef.current = transition.state;
      setSession(transition.state);
    }
    return transition;
  }, []);

  const updateTranscript = useCallback((event: Parameters<typeof reduceTranscript>[1]) => {
    const transition = reduceTranscript(transcriptRef.current, event);
    if (transition.accepted) {
      transcriptRef.current = transition.state;
      setTranscript(transition.state);
    }
    return transition;
  }, []);

  useEffect(() => {
    let active = true;
    void provider.capabilities().then(
      (value) => {
        if (active) setCapabilities(value);
      },
      () => {
        if (active) setCapabilities({ available: false, voice: false, text: true });
      }
    );
    return () => {
      active = false;
    };
  }, [provider]);

  useEffect(() => {
    const unsubscribe = provider.subscribe((event: VoicePresentationEvent) => {
      const sessionTransition = updateSession({
        type: "presentation",
        eventId: nextEventId(`provider-${event.type}`),
        generation: generationRef.current,
        event
      });
      if (!sessionTransition.accepted) return;
      if (event.type !== "transcript_tentative" && event.type !== "transcript_final") return;
      const proposalId = proposalIdRef.current ?? createId();
      proposalIdRef.current = proposalId;
      updateTranscript({
        type: "provider_transcript",
        eventId: nextEventId(`transcript-${event.type}`),
        generation: generationRef.current,
        proposalId,
        text: event.text,
        isFinal: event.type === "transcript_final"
      });
    });
    return unsubscribe;
  }, [createId, nextEventId, provider, updateSession, updateTranscript]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      void provider.stop("navigation").catch(() => undefined);
    };
  }, [provider]);

  const startVoice = useCallback(async () => {
    abortRef.current?.abort();
    const nextGeneration =
      sessionRef.current.status === "idle" ? generationRef.current : generationRef.current + 1;
    generationRef.current = nextGeneration;
    proposalIdRef.current = null;
    const nextTranscript = createTranscriptState(roundId, nextGeneration);
    transcriptRef.current = nextTranscript;
    setTranscript(nextTranscript);
    updateSession({
      type: "start",
      eventId: nextEventId("session-start"),
      roundId,
      phase: "patient_report",
      generation: nextGeneration
    });
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await provider.start({
        roundId,
        phase: "patient_report",
        signal: controller.signal
      });
    } catch {
      updateSession({
        type: "presentation",
        eventId: nextEventId("session-start-error"),
        generation: nextGeneration,
        event: { type: "error", recoverable: false, code: "provider" }
      });
    }
  }, [nextEventId, provider, roundId, updateSession]);

  const endVoice = useCallback(async () => {
    await provider.stop("completed");
  }, [provider]);

  const cancelVoice = useCallback(async () => {
    const generation = generationRef.current;
    updateSession({
      type: "cancel",
      eventId: nextEventId("session-cancel"),
      generation
    });
    abortRef.current?.abort();
    await provider.stop("cancelled");
  }, [nextEventId, provider, updateSession]);

  const setMuted = useCallback(
    async (muted: boolean) => {
      await provider.setMuted(muted);
    },
    [provider]
  );

  const replaceTranscript = useCallback(
    (text: string) => {
      if (text.trim().length === 0) return;
      if (transcriptRef.current.proposal) {
        updateTranscript({ type: "edit", eventId: nextEventId("transcript-edit"), text });
        return;
      }
      const proposalId = proposalIdRef.current ?? createId();
      proposalIdRef.current = proposalId;
      updateTranscript({
        type: "text_entered",
        eventId: nextEventId("transcript-text"),
        proposalId,
        text
      });
    },
    [createId, nextEventId, updateTranscript]
  );

  const confirmTranscript = useCallback((): TranscriptConfirmation | null => {
    const transition = updateTranscript({
      type: "confirm",
      eventId: nextEventId("transcript-confirm"),
      confirmedAt: now()
    });
    const confirmation = transition.accepted ? transition.state.confirmation : null;
    if (confirmation) onConfirmed?.(confirmation);
    return confirmation;
  }, [nextEventId, now, onConfirmed, updateTranscript]);

  return {
    capabilities,
    session,
    transcript,
    startVoice,
    endVoice,
    cancelVoice,
    setMuted,
    replaceTranscript,
    confirmTranscript
  };
}
