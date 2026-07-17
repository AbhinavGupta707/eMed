import { describe, expect, it } from "vitest";

import { planNextModule } from ".";

const pulseCandidate = {
  id: "pulse_primary",
  kind: "pulse_capture",
  producesFactKey: "pulse_bpm",
  available: true,
  estimatedBurdenSeconds: 30,
  scoring: { informationGain: 90, reliability: 80, burdenCost: 30 }
} as const;

const followUpCandidate = {
  id: "follow_up_primary",
  kind: "structured_follow_up",
  producesFactKey: "follow_up_answer",
  available: true,
  estimatedBurdenSeconds: 20,
  scoring: { informationGain: 80, reliability: 100, burdenCost: 20 }
} as const;

const voiceCandidate = {
  id: "voice_signal_primary",
  kind: "voice_biomarker",
  producesFactKey: "voice_biomarker_observation",
  available: true,
  estimatedBurdenSeconds: 20,
  scoring: { informationGain: 60, reliability: 60, burdenCost: 20 }
} as const;

function input(overrides: Record<string, unknown> = {}) {
  return {
    neededFactKeys: ["pulse_bpm", "follow_up_answer"],
    burdenSecondsRemaining: 120,
    followUpQuestionsAsked: 0,
    candidates: [pulseCandidate, followUpCandidate],
    ...overrides
  };
}

describe("deterministic module planner", () => {
  it("selects the highest-scoring eligible module", () => {
    const plan = planNextModule(input());

    expect(plan.selected?.id).toBe("pulse_primary");
    expect(plan.evaluations).toHaveLength(2);
    expect(plan.evaluations.every(({ eligible }) => eligible)).toBe(true);
  });

  it("reports every eligibility failure without a silent fallback", () => {
    const unavailable = { ...pulseCandidate, available: false, estimatedBurdenSeconds: 200 };
    const plan = planNextModule(
      input({
        neededFactKeys: ["follow_up_answer"],
        burdenSecondsRemaining: 10,
        candidates: [unavailable]
      })
    );

    expect(plan.selected).toBeNull();
    expect(plan.evaluations[0]).toMatchObject({
      eligible: false,
      reasons: ["not_needed", "unavailable", "burden_exceeded"]
    });
  });

  it("makes all follow-up modules ineligible once the one-question budget is exhausted", () => {
    const secondFollowUp = { ...followUpCandidate, id: "follow_up_secondary" };
    const plan = planNextModule(
      input({
        neededFactKeys: ["follow_up_answer"],
        followUpQuestionsAsked: 1,
        candidates: [followUpCandidate, secondFollowUp]
      })
    );

    expect(plan.selected).toBeNull();
    expect(plan.evaluations).toEqual([
      expect.objectContaining({ eligible: false, reasons: ["follow_up_budget_exhausted"] }),
      expect.objectContaining({ eligible: false, reasons: ["follow_up_budget_exhausted"] })
    ]);
  });

  it("uses lower burden when scores tie", () => {
    const slower = { ...pulseCandidate, id: "pulse_slower", estimatedBurdenSeconds: 50 };
    const faster = { ...pulseCandidate, id: "pulse_faster", estimatedBurdenSeconds: 20 };

    expect(planNextModule(input({ candidates: [slower, faster] })).selected?.id).toBe(
      "pulse_faster"
    );
  });

  it("uses fixed module kind then lexical ID when score and burden tie", () => {
    const scoring = { informationGain: 50, reliability: 50, burdenCost: 10 };
    const followUp = {
      ...followUpCandidate,
      id: "aaa_follow_up",
      estimatedBurdenSeconds: 20,
      scoring
    };
    const pulseZ = { ...pulseCandidate, id: "zzz_pulse", estimatedBurdenSeconds: 20, scoring };
    const pulseA = { ...pulseCandidate, id: "aaa_pulse", estimatedBurdenSeconds: 20, scoring };

    expect(planNextModule(input({ candidates: [followUp, pulseZ] })).selected?.id).toBe(
      "zzz_pulse"
    );
    expect(planNextModule(input({ candidates: [pulseZ, pulseA] })).selected?.id).toBe("aaa_pulse");
  });

  it("is independent of candidate input order", () => {
    const forward = planNextModule(input());
    const reverse = planNextModule(input({ candidates: [followUpCandidate, pulseCandidate] }));

    expect(reverse.selected).toEqual(forward.selected);
  });

  it("keeps the research-only voice signal inside normal fact, burden, and availability gates", () => {
    const eligible = planNextModule(
      input({
        neededFactKeys: ["voice_biomarker_observation"],
        candidates: [voiceCandidate]
      })
    );
    expect(eligible.selected?.id).toBe("voice_signal_primary");

    const unavailable = planNextModule(
      input({
        neededFactKeys: ["voice_biomarker_observation"],
        candidates: [{ ...voiceCandidate, available: false }]
      })
    );
    expect(unavailable.selected).toBeNull();
    expect(unavailable.evaluations[0]?.reasons).toEqual(["unavailable"]);
  });

  it("rejects unknown fields, invalid module outputs, duplicate IDs, and impossible budgets", () => {
    expect(() => planNextModule({ ...input(), unknown: true })).toThrow();
    expect(() =>
      planNextModule(
        input({ candidates: [{ ...pulseCandidate, producesFactKey: "follow_up_answer" }] })
      )
    ).toThrow();
    expect(() => planNextModule(input({ candidates: [pulseCandidate, pulseCandidate] }))).toThrow();
    expect(() => planNextModule(input({ followUpQuestionsAsked: 2 }))).toThrow();
  });
});
