import { RoundSchema, RoundStateSchema, type Round, type RoundState } from "@homerounds/contracts";
import { z } from "zod";

export const TERMINAL_ROUND_STATES = [
  "closed",
  "emergency_closed",
  "abstained_for_review",
  "patient_declined"
] as const satisfies readonly RoundState[];

const terminalRoundStates = new Set<RoundState>(TERMINAL_ROUND_STATES);

export const ROUND_TRANSITIONS = {
  invited: ["red_flag_screen", "patient_declined"],
  red_flag_screen: ["collecting_report", "emergency_closed", "patient_declined"],
  collecting_report: [
    "assessment_selected",
    "protocol_ready",
    "emergency_closed",
    "abstained_for_review",
    "patient_declined"
  ],
  assessment_selected: [
    "capturing",
    "assessment_complete",
    "protocol_ready",
    "abstained_for_review",
    "patient_declined"
  ],
  capturing: ["capture_retry", "assessment_complete", "abstained_for_review", "patient_declined"],
  capture_retry: ["capturing", "abstained_for_review", "patient_declined"],
  assessment_complete: [
    "follow_up_selected",
    "protocol_ready",
    "abstained_for_review",
    "patient_declined"
  ],
  follow_up_selected: ["protocol_ready", "abstained_for_review", "patient_declined"],
  protocol_ready: ["protocol_decided", "abstained_for_review"],
  protocol_decided: ["action_pending", "emergency_closed", "abstained_for_review"],
  action_pending: ["awaiting_clinician"],
  awaiting_clinician: ["outcome_ready"],
  outcome_ready: ["closed"],
  closed: [],
  emergency_closed: [],
  abstained_for_review: [],
  patient_declined: []
} as const satisfies Record<RoundState, readonly RoundState[]>;

export const RoundTransitionRequestSchema = z.object({
  to: RoundStateSchema,
  expectedStateVersion: z.number().int().nonnegative(),
  occurredAt: z.iso.datetime()
});

export type RoundTransitionRequest = z.infer<typeof RoundTransitionRequestSchema>;

export const RoundTransitionErrorSchema = z.discriminatedUnion("code", [
  z.object({
    code: z.literal("invalid_round"),
    message: z.string(),
    issues: z.array(z.string())
  }),
  z.object({
    code: z.literal("invalid_request"),
    message: z.string(),
    issues: z.array(z.string())
  }),
  z.object({
    code: z.literal("stale_state_version"),
    message: z.string(),
    expected: z.number().int().nonnegative(),
    actual: z.number().int().nonnegative()
  }),
  z.object({
    code: z.literal("terminal_state"),
    message: z.string(),
    from: RoundStateSchema,
    attempted: RoundStateSchema
  }),
  z.object({
    code: z.literal("invalid_transition"),
    message: z.string(),
    from: RoundStateSchema,
    attempted: RoundStateSchema,
    allowed: z.array(RoundStateSchema)
  }),
  z.object({
    code: z.literal("non_monotonic_timestamp"),
    message: z.string(),
    previous: z.iso.datetime(),
    attempted: z.iso.datetime()
  })
]);

export type RoundTransitionError = z.infer<typeof RoundTransitionErrorSchema>;

export type RoundTransitionResult =
  { ok: true; round: Round } | { ok: false; error: RoundTransitionError };

function issuePaths(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "root";
    return `${path}: ${issue.message}`;
  });
}

export function isTerminalRoundState(state: RoundState): boolean {
  return terminalRoundStates.has(state);
}

export function isAllowedRoundTransition(from: RoundState, to: RoundState): boolean {
  return (ROUND_TRANSITIONS[from] as readonly RoundState[]).includes(to);
}

/**
 * Applies one persisted round-state transition. This reducer never mutates the
 * input round and never coerces an invalid or stale request into a valid state.
 */
export function reduceRoundState(
  roundInput: Round,
  requestInput: RoundTransitionRequest
): RoundTransitionResult {
  const parsedRound = RoundSchema.safeParse(roundInput);
  if (!parsedRound.success) {
    return {
      ok: false,
      error: {
        code: "invalid_round",
        message: "The persisted round does not satisfy the frozen round contract.",
        issues: issuePaths(parsedRound.error)
      }
    };
  }

  const parsedRequest = RoundTransitionRequestSchema.safeParse(requestInput);
  if (!parsedRequest.success) {
    return {
      ok: false,
      error: {
        code: "invalid_request",
        message: "The requested round transition is malformed.",
        issues: issuePaths(parsedRequest.error)
      }
    };
  }

  const round = parsedRound.data;
  const request = parsedRequest.data;
  const roundInvariantIssues: string[] = [];
  if (Date.parse(round.updatedAt) < Date.parse(round.createdAt)) {
    roundInvariantIssues.push("updatedAt: must not predate createdAt");
  }
  if (isTerminalRoundState(round.state)) {
    if (round.closedAt === null) {
      roundInvariantIssues.push("closedAt: terminal states require a closure timestamp");
    } else if (round.closedAt !== round.updatedAt) {
      roundInvariantIssues.push(
        "closedAt: terminal closure must match the latest update timestamp"
      );
    }
  } else if (round.closedAt !== null) {
    roundInvariantIssues.push("closedAt: non-terminal states cannot carry a closure timestamp");
  }
  if (roundInvariantIssues.length > 0) {
    return {
      ok: false,
      error: {
        code: "invalid_round",
        message: "The persisted round violates round-state invariants.",
        issues: roundInvariantIssues
      }
    };
  }

  if (request.expectedStateVersion !== round.stateVersion) {
    return {
      ok: false,
      error: {
        code: "stale_state_version",
        message: "The round changed after the caller read it.",
        expected: request.expectedStateVersion,
        actual: round.stateVersion
      }
    };
  }

  if (isTerminalRoundState(round.state)) {
    return {
      ok: false,
      error: {
        code: "terminal_state",
        message: `Round state ${round.state} is terminal.`,
        from: round.state,
        attempted: request.to
      }
    };
  }

  if (!isAllowedRoundTransition(round.state, request.to)) {
    return {
      ok: false,
      error: {
        code: "invalid_transition",
        message: `Round state ${round.state} cannot transition to ${request.to}.`,
        from: round.state,
        attempted: request.to,
        allowed: [...ROUND_TRANSITIONS[round.state]]
      }
    };
  }

  if (Date.parse(request.occurredAt) < Date.parse(round.updatedAt)) {
    return {
      ok: false,
      error: {
        code: "non_monotonic_timestamp",
        message: "A transition cannot predate the latest persisted round update.",
        previous: round.updatedAt,
        attempted: request.occurredAt
      }
    };
  }

  const nextRound = RoundSchema.parse({
    ...round,
    state: request.to,
    stateVersion: round.stateVersion + 1,
    updatedAt: request.occurredAt,
    closedAt: isTerminalRoundState(request.to) ? request.occurredAt : null
  });

  return { ok: true, round: nextRound };
}
