import type {
  CompanionConsentRequirement,
  CompanionPhoneSnapshot,
  CompanionTaskKind,
  CompanionTaskPhase
} from "../../../../../packages/companion/src/schemas";

export const COMPANION_POLL_INTERVAL_MS = 1_500;

export type CompanionConnectionState =
  "connecting" | "connected" | "resuming" | "network_recovery" | "expired";

export type CompanionTaskContent = {
  title: string;
  purpose: string;
  permission: string;
  guidance: string;
};

const contentByTaskKind: Readonly<Record<CompanionTaskKind, CompanionTaskContent>> = {
  finger_pulse: {
    title: "Finger pulse check",
    purpose: "A short pulse check can add one useful signal to this round.",
    permission: "This check uses your phone camera only while the check is running.",
    guidance: "Cover the rear camera and flash with one finger, then hold still."
  },
  face_pulse: {
    title: "Face pulse check",
    purpose: "A short face pulse check can add one useful signal to this round.",
    permission: "This check uses the front camera and sends a small sample for processing.",
    guidance: "Rest the phone, keep your face in view, and hold still in good light."
  },
  voice_signal: {
    title: "Voice signal check",
    purpose: "A short, optional voice pattern can be compared with your own prior samples.",
    permission: "The microphone is used only for this check. The recording is not kept.",
    guidance: "Take a comfortable breath, then hold “ah” steadily when asked."
  },
  medication_label: {
    title: "Medication label check",
    purpose: "A clear label can help you review the medicine details you mentioned.",
    permission: "The camera is used only while you review one label. The photo is not kept.",
    guidance: "Place one label inside the frame and hold the phone steady in good light."
  }
};

export function taskContent(kind: CompanionTaskKind): CompanionTaskContent {
  return contentByTaskKind[kind];
}

export function firstPhaseFor(
  requirement: CompanionConsentRequirement
): Extract<CompanionTaskPhase, "permission" | "guidance"> {
  return requirement.kind === "none" ? "guidance" : "permission";
}

export function shouldPoll(
  connection: CompanionConnectionState,
  snapshot: CompanionPhoneSnapshot | null,
  documentVisible: boolean
): boolean {
  return (
    documentVisible &&
    snapshot !== null &&
    connection !== "expired" &&
    snapshot.status === "active" &&
    snapshot.taskPhase !== "desktop_acknowledged"
  );
}

export function isTerminalPhonePhase(phase: CompanionTaskPhase): boolean {
  return phase === "desktop_acknowledged";
}
