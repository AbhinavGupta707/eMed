"use client";

import type { VoiceSessionProvider } from "@homerounds/contracts/voice";
import type { TranscriptConfirmation, VoiceSessionFailureCode } from "@homerounds/voice";
import { Fragment, createElement, useId, useState, type ChangeEvent } from "react";

import styles from "./voice-interaction.module.css";
import { useVoiceInteraction } from "./use-voice-interaction";

export type VoiceInteractionPanelProps = Readonly<{
  roundId: string;
  provider: VoiceSessionProvider;
  onConfirmed: (confirmation: TranscriptConfirmation) => void;
  createId?: () => string;
  now?: () => string;
}>;

const statusText = {
  idle: "Text entry is ready.",
  connecting: "Connecting to the voice service…",
  permission_required: "Your browser will ask for microphone permission.",
  connected: "Voice is connected.",
  listening: "Microphone is listening.",
  speaking: "The voice assistant is speaking.",
  muted: "Microphone is muted.",
  reconnecting: "The connection was interrupted. Reconnecting…",
  unavailable: "Voice is unavailable. You can complete this step with text.",
  failed: "Voice stopped safely. You can complete this step with text.",
  ended: "Voice session ended. Your text remains available for review.",
  cancelled: "Voice session cancelled. You can continue with text."
} as const;

const activeVoiceStatuses = new Set([
  "connecting",
  "permission_required",
  "connected",
  "listening",
  "speaking",
  "muted",
  "reconnecting"
]);

const failureText = {
  permission_denied:
    "Microphone access was denied. Continue with text, or change the permission and try again.",
  credential_unavailable: "Voice is not configured. You can complete this step with text.",
  quota: "The voice service has reached its usage limit. You can complete this step with text.",
  network: "The voice connection was lost. Your text remains available.",
  malformed_provider_event:
    "The voice response could not be read safely. Please continue with text.",
  provider: "The voice service stopped safely. Please continue with text.",
  timeout: "The voice session reached its time limit. Please continue with text.",
  reconnect_exhausted: "The voice connection could not be restored. Please continue with text."
} as const satisfies Record<VoiceSessionFailureCode, string>;

export function VoiceInteractionPanel(props: VoiceInteractionPanelProps) {
  // A round change remounts all ephemeral transcript/media state to prevent cross-round leakage.
  return createElement(VoiceInteractionPanelSession, { ...props, key: props.roundId });
}

function VoiceInteractionPanelSession({
  roundId,
  provider,
  onConfirmed,
  createId,
  now
}: VoiceInteractionPanelProps) {
  const controller = useVoiceInteraction({
    provider,
    roundId,
    onConfirmed,
    ...(createId ? { createId } : {}),
    ...(now ? { now } : {})
  });
  const proposal = controller.transcript.proposal;
  const [userEdit, setUserEdit] = useState<string | null>(null);
  const baseId = useId();
  const headingId = `${baseId}-voice-heading`;
  const transcriptId = `${baseId}-voice-transcript`;
  const transcriptHelpId = `${baseId}-voice-transcript-help`;
  const transcriptStateId = `${baseId}-voice-transcript-state`;
  const editorText = userEdit ?? proposal?.text ?? "";
  const dirty = userEdit !== null;

  const voiceActive = activeVoiceStatuses.has(controller.session.status);
  const canStartVoice = controller.capabilities?.voice === true && !voiceActive;
  const confirmed = controller.transcript.confirmation !== null;
  const displayedStatus =
    (controller.session.status === "failed" || controller.session.status === "unavailable") &&
    controller.session.failure
      ? failureText[controller.session.failure]
      : controller.session.status === "idle" && controller.capabilities?.voice === false
        ? "Voice is unavailable. You can complete this step with text."
        : statusText[controller.session.status];

  function confirmVisibleText() {
    controller.replaceTranscript(editorText);
    const confirmation = controller.confirmTranscript();
    if (confirmation) {
      setUserEdit(null);
    }
  }

  const voiceControls = voiceActive
    ? createElement(
        Fragment,
        null,
        createElement(
          "button",
          {
            className: styles.secondaryButton,
            type: "button",
            onClick: () => controller.setMuted(!controller.session.muted)
          },
          controller.session.muted ? "Unmute microphone" : "Mute microphone"
        ),
        createElement(
          "button",
          {
            className: styles.secondaryButton,
            type: "button",
            onClick: controller.endVoice
          },
          "End voice"
        ),
        createElement(
          "button",
          {
            className: styles.secondaryButton,
            type: "button",
            onClick: controller.cancelVoice
          },
          "Cancel voice"
        )
      )
    : null;

  const transcriptState = confirmed
    ? "Confirmed"
    : proposal?.isFinal || dirty
      ? "Ready for your confirmation"
      : proposal
        ? "Tentative transcript"
        : "No transcript yet";

  return createElement(
    "section",
    { className: styles.panel, "aria-labelledby": headingId },
    createElement(
      "div",
      { className: styles.headingRow },
      createElement(
        "div",
        null,
        createElement("p", { className: styles.eyebrow }, "Optional AI voice"),
        createElement(
          "h2",
          { id: headingId, className: styles.heading },
          "Tell us how you have been feeling"
        )
      ),
      createElement("span", { className: styles.modeBadge }, "Text always available")
    ),
    createElement(
      "p",
      { className: styles.safetyNote },
      "Voice and typed text are untrusted drafts. They cannot diagnose, set urgency, answer required safety questions, change medicines, or request an action."
    ),
    createElement(
      "p",
      { className: styles.status, role: "status", "aria-live": "polite" },
      displayedStatus
    ),
    createElement(
      "div",
      { className: styles.controls, "aria-label": "Voice controls" },
      canStartVoice
        ? createElement(
            "button",
            {
              className: styles.primaryButton,
              type: "button",
              onClick: () => {
                setUserEdit(null);
                void controller.startVoice();
              }
            },
            "Start voice"
          )
        : null,
      voiceControls
    ),
    createElement(
      "div",
      { className: styles.field },
      createElement(
        "label",
        { htmlFor: transcriptId, className: styles.label },
        "Your check-in text"
      ),
      createElement("textarea", {
        id: transcriptId,
        className: styles.textarea,
        value: editorText,
        maxLength: 2000,
        rows: 5,
        disabled: confirmed,
        "aria-describedby": `${transcriptHelpId} ${transcriptStateId}`,
        onChange: (event: ChangeEvent<HTMLTextAreaElement>) => {
          setUserEdit(event.currentTarget.value);
        }
      }),
      createElement(
        "div",
        { className: styles.fieldMeta },
        createElement(
          "p",
          { id: transcriptHelpId },
          "Review and edit every word. This draft is not saved by default."
        ),
        createElement("p", { id: transcriptStateId }, transcriptState)
      )
    ),
    createElement(
      "button",
      {
        className: styles.confirmButton,
        type: "button",
        disabled: confirmed || editorText.trim().length === 0,
        onClick: confirmVisibleText
      },
      confirmed ? "Text confirmed" : "Confirm this text"
    )
  );
}
