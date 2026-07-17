import type { PatientReport } from "../../packages/contracts/src/index";
import {
  evaluateProtocol,
  ProtocolDefinitionSchema,
  type ProtocolDefinition,
  type ProtocolEvaluationInput
} from "../../packages/protocols/src/index";
import { describe, expect, it } from "vitest";

import protocolFixture from "../../data/protocols/cardiometabolic-demo.v1.json";

const NOW = "2026-07-17T12:00:00.000Z";
const ROUND_ID = "10000000-0000-4000-8000-000000000001";
const REPORT_ID = "10000000-0000-4000-8000-000000000002";
const FACT_ID = "10000000-0000-4000-8000-000000000003";
const SESSION_ID = "10000000-0000-4000-8000-000000000004";

const protocol = ProtocolDefinitionSchema.parse(protocolFixture);

function report(overrides: Partial<PatientReport> = {}): PatientReport {
  return {
    reportId: REPORT_ID,
    roundId: ROUND_ID,
    weakness: "absent",
    palpitations: "absent",
    redFlags: { chestPain: "no", severeBreathlessness: "no", fainted: "no" },
    inputMode: "text",
    confirmedAt: NOW,
    ...overrides
  };
}

function pulseInput(value: number): ProtocolEvaluationInput {
  return {
    now: NOW,
    report: report(),
    measurement: {
      status: "present",
      fact: {
        factId: FACT_ID,
        assessmentSessionId: SESSION_ID,
        provider: "finger_ppg",
        value,
        unit: "bpm",
        observedAt: NOW,
        durationMs: 30_000,
        algorithmVersion: "synthetic_fixture_v1",
        providerModelVersion: null,
        quality: { status: "pass", score: 0.95, reasons: [], metrics: {} },
        rawMediaRef: null
      }
    },
    followUp: { status: "not_asked" },
    followUpQuestionsAsked: 0
  };
}

function matchedRule(definition: ProtocolDefinition, value: number): string {
  const decision = evaluateProtocol(definition, pulseInput(value));
  expect(decision.kind).toBe("result");
  if (decision.kind !== "result") throw new Error("Expected a terminal protocol result.");
  return decision.result.matchedRuleIds[0] ?? "";
}

describe("adversarial protocol evidence", () => {
  it("rejects safety-gate and arbitrary-expression protocol mutations", () => {
    const missingSafetyGate = {
      ...protocol,
      rules: protocol.rules.filter(({ id }) => id !== "red_flag_fainted_unsure")
    };
    const modelAuthored = { ...protocol, authoringMode: "model_generated" };
    const reinterpretedRedFlag = {
      ...protocol,
      rules: protocol.rules.map((rule) =>
        rule.id === "red_flag_chest_pain_yes"
          ? {
              ...rule,
              effect: {
                kind: "return",
                outcome: "programme_review_requested",
                allowedActions: ["create_programme_task"],
                missingFactKeys: [],
                explanationKey: "protocol.red_flag.downgraded"
              }
            }
          : rule
      )
    };
    const arbitraryExpression = {
      ...protocol,
      rules: protocol.rules.map((rule) =>
        rule.id === "illustrative_high_pulse"
          ? {
              ...rule,
              all: [
                {
                  kind: "pulse_bpm",
                  operator: "expression",
                  expression: "model_decides_urgency(value)"
                }
              ]
            }
          : rule
      )
    };

    for (const mutation of [
      missingSafetyGate,
      modelAuthored,
      reinterpretedRedFlag,
      arbitraryExpression
    ]) {
      expect(ProtocolDefinitionSchema.safeParse(mutation).success).toBe(false);
    }
  });

  it("asserts exact threshold edges and abstains in an uncovered fractional gap", () => {
    expect(matchedRule(protocol, 59.999)).toBe("illustrative_low_pulse");
    expect(matchedRule(protocol, 60)).toBe("illustrative_normal_pulse");
    expect(matchedRule(protocol, 99)).toBe("illustrative_normal_pulse");
    expect(matchedRule(protocol, 99.5)).toBe("unmatched_inputs_abstain");
    expect(matchedRule(protocol, 100)).toBe("illustrative_high_pulse");
  });

  it("kills a critical high-threshold mutation with a boundary fixture", () => {
    const thresholdMutation = ProtocolDefinitionSchema.parse({
      ...protocol,
      rules: protocol.rules.map((rule) =>
        rule.id === "illustrative_high_pulse"
          ? {
              ...rule,
              all: rule.all.map((condition) =>
                condition.kind === "pulse_bpm" && condition.operator === "gte"
                  ? { ...condition, value: 101 }
                  : condition
              )
            }
          : rule
      )
    });

    expect(matchedRule(protocol, 100)).toBe("illustrative_high_pulse");
    expect(matchedRule(thresholdMutation, 100)).toBe("unmatched_inputs_abstain");
  });

  it("replays byte-identically despite rule and evidence ordering", () => {
    const input: ProtocolEvaluationInput = {
      now: NOW,
      report: report({
        redFlags: { chestPain: "yes", severeBreathlessness: "no", fainted: "yes" }
      }),
      measurement: { status: "conflicting", factIds: ["fact-z", "fact-a", "fact-z"] },
      followUp: { status: "not_asked" },
      followUpQuestionsAsked: 0
    };
    const reordered = ProtocolDefinitionSchema.parse({
      ...protocol,
      rules: [...protocol.rules].reverse()
    });
    const serializations = Array.from({ length: 25 }, (_, index) =>
      JSON.stringify(evaluateProtocol(index % 2 === 0 ? protocol : reordered, input))
    );

    expect(new Set(serializations)).toHaveLength(1);
    expect(JSON.parse(serializations[0] ?? "null")).toMatchObject({
      kind: "result",
      result: {
        matchedRuleIds: ["red_flag_chest_pain_yes"],
        outcome: "emergency_guidance"
      }
    });
  });
});
