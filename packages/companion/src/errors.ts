export type CompanionServiceErrorCode =
  | "pairing_not_found"
  | "token_invalid"
  | "token_expired"
  | "token_used"
  | "session_unauthorized"
  | "session_expired"
  | "revoked"
  | "stale_version"
  | "authority_changed"
  | "forbidden"
  | "invalid_task"
  | "invalid_transition"
  | "idempotency_conflict"
  | "repository_conflict";

export class CompanionServiceError extends Error {
  constructor(
    readonly code: CompanionServiceErrorCode,
    readonly retryable: boolean
  ) {
    super(`Companion request rejected: ${code}`);
    this.name = "CompanionServiceError";
  }
}
