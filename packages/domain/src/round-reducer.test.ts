import { RoundStateSchema, type Round, type RoundState } from "@homerounds/contracts";
import { describe, expect, it } from "vitest";

import {
  ROUND_TRANSITIONS,
  TERMINAL_ROUND_STATES,
  isAllowedRoundTransition,
  reduceRoundState
} from "./round-reducer";

const states = RoundStateSchema.options;

function roundIn(state: RoundState): Round {
  return {
    id: "14df34c4-8204-4810-8113-37b63c963a91",
    patientId: "synthetic-maya",
    state,
    stateVersion: 7,
    purpose: "Fictional programme check-in",
    triggerId: "synthetic-trigger-001",
    burdenSecondsRemaining: 180,
    protocolId: "fictional-cardiometabolic-v1",
    createdAt: "2026-07-17T08:00:00.000Z",
    updatedAt: "2026-07-17T08:05:00.000Z",
    closedAt: TERMINAL_ROUND_STATES.includes(state as (typeof TERMINAL_ROUND_STATES)[number])
      ? "2026-07-17T08:05:00.000Z"
      : null
  };
}

describe("round-state reducer", () => {
  it("defines an explicit transition list for every frozen state", () => {
    expect(Object.keys(ROUND_TRANSITIONS).sort()).toEqual([...states].sort());
  });

  it("exhaustively accepts only declared source/target pairs", () => {
    for (const from of states) {
      for (const to of states) {
        const source = roundIn(from);
        const result = reduceRoundState(source, {
          to,
          expectedStateVersion: source.stateVersion,
          occurredAt: "2026-07-17T08:06:00.000Z"
        });
        const expected = isAllowedRoundTransition(from, to);

        expect(result.ok, `${from} -> ${to}`).toBe(expected);
        expect(source.state, "the reducer must not mutate its input").toBe(from);

        if (result.ok) {
          expect(result.round.state).toBe(to);
          expect(result.round.stateVersion).toBe(8);
          expect(result.round.closedAt).toBe(
            TERMINAL_ROUND_STATES.includes(to as (typeof TERMINAL_ROUND_STATES)[number])
              ? "2026-07-17T08:06:00.000Z"
              : null
          );
        } else if (TERMINAL_ROUND_STATES.includes(from as (typeof TERMINAL_ROUND_STATES)[number])) {
          expect(result.error.code).toBe("terminal_state");
        } else {
          expect(result.error.code).toBe("invalid_transition");
        }
      }
    }
  });

  it("rejects a stale optimistic version without changing state", () => {
    const source = roundIn("collecting_report");
    const result = reduceRoundState(source, {
      to: "assessment_selected",
      expectedStateVersion: 6,
      occurredAt: "2026-07-17T08:06:00.000Z"
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "stale_state_version",
        message: "The round changed after the caller read it.",
        expected: 6,
        actual: 7
      }
    });
  });

  it("rejects a timestamp older than the persisted update", () => {
    const source = roundIn("capturing");
    const result = reduceRoundState(source, {
      to: "capture_retry",
      expectedStateVersion: 7,
      occurredAt: "2026-07-17T08:04:59.999Z"
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("non_monotonic_timestamp");
  });

  it("rejects malformed persisted input at the runtime boundary", () => {
    const malformed = { ...roundIn("invited"), patientId: "" };
    const result = reduceRoundState(malformed, {
      to: "red_flag_screen",
      expectedStateVersion: 7,
      occurredAt: "2026-07-17T08:06:00.000Z"
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("invalid_round");
  });

  it("rejects impossible closure state even when the frozen shape parses", () => {
    const impossible = {
      ...roundIn("capturing"),
      closedAt: "2026-07-17T08:05:00.000Z"
    };
    const result = reduceRoundState(impossible, {
      to: "assessment_complete",
      expectedStateVersion: 7,
      occurredAt: "2026-07-17T08:06:00.000Z"
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("invalid_round");
      if (result.error.code === "invalid_round") {
        expect(result.error.issues).toContain(
          "closedAt: non-terminal states cannot carry a closure timestamp"
        );
      }
    }
  });
});
