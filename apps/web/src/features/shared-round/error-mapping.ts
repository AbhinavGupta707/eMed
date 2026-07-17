import { HomeRoundsApiError } from "@homerounds/api-client";

export type PatientUiErrorCode =
  | "offline"
  | "network"
  | "stale_state"
  | "permission_denied"
  | "unsupported_device"
  | "provider_unavailable"
  | "timeout"
  | "follow_up_submission_unavailable"
  | "resume_data_unavailable"
  | "conflict"
  | "unavailable"
  | "unexpected";

export type PatientUiError = Readonly<{
  code: PatientUiErrorCode;
  title: string;
  message: string;
  recoverable: boolean;
}>;

const messages = {
  offline: {
    title: "You appear to be offline",
    message: "Reconnect before continuing. Nothing new has been submitted.",
    recoverable: true
  },
  network: {
    title: "We could not reach HomeRounds",
    message: "Your last confirmed server state is unchanged. Check your connection and try again.",
    recoverable: true
  },
  stale_state: {
    title: "This round changed elsewhere",
    message: "We reloaded the latest server state. Review it before trying the next step again.",
    recoverable: true
  },
  permission_denied: {
    title: "Camera permission was not granted",
    message:
      "No image or measurement was saved. You can change the permission or continue without a measurement.",
    recoverable: true
  },
  unsupported_device: {
    title: "This camera check is not supported here",
    message: "No measurement was created. You can continue without one and request review.",
    recoverable: true
  },
  provider_unavailable: {
    title: "The selected measurement service is unavailable",
    message:
      "HomeRounds will not switch providers or invent a value. Continue without a measurement or try again later.",
    recoverable: true
  },
  timeout: {
    title: "This step timed out",
    message:
      "The camera and microphone were stopped. Reopen the round to continue from its saved state.",
    recoverable: true
  },
  follow_up_submission_unavailable: {
    title: "This answer was not submitted",
    message:
      "The round remains safely paused at its single follow-up question. No result or action was invented.",
    recoverable: false
  },
  resume_data_unavailable: {
    title: "This step needs a fresh server projection",
    message:
      "The saved round state is intact, but this build cannot safely reconstruct the required decision details after refresh.",
    recoverable: false
  },
  conflict: {
    title: "This step can no longer be completed",
    message: "The server rejected the transition. Reload the latest round before continuing.",
    recoverable: true
  },
  unavailable: {
    title: "This service is temporarily unavailable",
    message: "The round has not advanced. Try again later or use the available text path.",
    recoverable: true
  },
  unexpected: {
    title: "HomeRounds stopped safely",
    message: "No unconfirmed information was submitted. Reload the round before trying again.",
    recoverable: true
  }
} as const satisfies Record<
  PatientUiErrorCode,
  { title: string; message: string; recoverable: boolean }
>;

export function patientUiError(code: PatientUiErrorCode): PatientUiError {
  return { code, ...messages[code] };
}

export function mapPatientError(error: unknown, online: boolean): PatientUiError {
  if (!online) return patientUiError("offline");
  if (error instanceof HomeRoundsApiError) {
    switch (error.envelope.error.code) {
      case "stale_state":
        return patientUiError("stale_state");
      case "conflict":
        return patientUiError("conflict");
      case "unavailable":
      case "rate_limited":
        return patientUiError("unavailable");
      case "invalid_request":
      case "unauthorized":
      case "forbidden":
      case "not_found":
      case "payload_too_large":
      case "unsupported_media_type":
      case "method_not_allowed":
      case "origin_rejected":
      case "internal_error":
        return patientUiError("unexpected");
    }
  }
  if (error instanceof TypeError) return patientUiError("network");
  return patientUiError("unexpected");
}
