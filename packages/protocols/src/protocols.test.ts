import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { evaluateProtocol, parseProtocolDefinition, type ProtocolEvaluationDecision } from ".";

const fixture: unknown = JSON.parse(
  readFileSync(
    new URL("../../../data/protocols/cardiometabolic-demo.v1.json", import.meta.url),
    "utf8"
  )
);

const baseReport = {
  reportId: "dcfce5d5-b681-4593-81af-806256e9e352",
  roundId: "cc80d269-2f79-4328-a129-98cac85219e4",
  weakness: "mild",
  palpitations: "absent",
  redFlags: { chestPain: "no", severeBreathlessness: "no", fainted: "no" },
  inputMode: "text",
  confirmedAt: "2026-07-17T09:55:00.000Z"
} as const;

const baseMeasurement = {
  factId: "13369361-df18-4b88-9b0f-3632b896a57f",
  assessmentSessionId: "45906cff-34ea-4a86-a0c0-05967adb20c4",
  provider: "finger_ppg",
  value: 72,
  unit: "bpm",
  observedAt: "2026-07-17T09:58:00.000Z",
  durationMs: 20_000,
  algorithmVersion: "synthetic_fixture_v1",
  providerModelVersion: null,
  quality: { status: "pass", score: 0.95, reasons: [], metrics: {} },
  rawMediaRef: null
} as const;

function input(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    now: "2026-07-17T10:00:00.000Z",
    report: baseReport,
    measurement: { status: "present", fact: baseMeasurement },
    followUp: { status: "not_asked" },
    followUpQuestionsAsked: 0,
    ...overrides
  };
}

function result(decision: ProtocolEvaluationDecision) {
  expect(decision.kind).toBe("result");
  if (decision.kind !== "result") throw new Error("expected a terminal protocol result");
  return decision.result;
}

describe("closed protocol definition", () => {
  it("parses the versioned illustrative fixture with owner, review and provenance metadata", () => {
    const parsed = parseProtocolDefinition(fixture);

    expect(parsed).toMatchObject({
      dsl: "homerounds.protocol",
      schemaVersion: 1,
      authoringMode: "reviewed_static",
      id: "cardiometabolic_demo",
      version: "1.0.0",
      status: "illustrative_demo_only",
      neutralActionWording: "programme review requested",
      clinicalOwner: { role: "Demo protocol review role" },
      reviewDate: "2026-10-17"
    });
    expect(parsed.rules.every(({ evidence }) => evidence.sourceIds.length > 0)).toBe(true);
  });

  it.each([
    ["arbitrary JavaScript", { javascript: "return process.env.SECRET" }],
    ["JSONLogic", { logic: { ">": [{ var: "pulse" }, 100] } }],
    ["unknown fields", { unexpected: true }]
  ])("rejects %s fields rather than executing or ignoring them", (_label, addition) => {
    const candidate = structuredClone(fixture) as Record<string, unknown>;
    Object.assign(candidate, addition);
    expect(() => parseProtocolDefinition(candidate)).toThrow();
  });

  it.each([
    "dsl: homerounds.protocol\nrules: []",
    "() => ({ outcome: 'emergency_guidance' })",
    '{"and":[{"var":"pulse"}]}'
  ])("rejects executable, YAML, and expression strings", (candidate) => {
    expect(() => parseProtocolDefinition(candidate)).toThrow();
  });

  it("rejects definitions marked as model-authored", () => {
    const candidate = structuredClone(fixture) as Record<string, unknown>;
    candidate.authoringMode = "model_generated";
    expect(() => parseProtocolDefinition(candidate)).toThrow();
  });

  it("rejects unknown operators, wrong units, unbounded conditions and action mismatches", () => {
    const parsed = parseProtocolDefinition(fixture);
    const badOperator = structuredClone(parsed);
    (badOperator.rules[0]?.all[0] as { operator: string }).operator = "eval";
    expect(() => parseProtocolDefinition(badOperator)).toThrow();

    const wrongUnit = structuredClone(parsed);
    const pulseRule = wrongUnit.rules.find(({ id }) => id === "illustrative_high_pulse");
    (pulseRule?.all[0] as { unit: string }).unit = "hz";
    expect(() => parseProtocolDefinition(wrongUnit)).toThrow();

    const unbounded = structuredClone(parsed);
    const condition = unbounded.rules[0]?.all[0];
    if (!condition) throw new Error("fixture rule missing condition");
    unbounded.rules[0]?.all.push(...Array.from({ length: 8 }, () => condition));
    expect(() => parseProtocolDefinition(unbounded)).toThrow();

    const actionMismatch = structuredClone(parsed);
    const fallbackEffect = actionMismatch.fallback.effect;
    fallbackEffect.allowedActions = ["show_emergency_guidance"];
    expect(() => parseProtocolDefinition(actionMismatch)).toThrow();
  });

  it("rejects missing versions, unknown evidence, unsafe fallback, and incomplete safety gates", () => {
    const parsed = parseProtocolDefinition(fixture);
    const noVersion = structuredClone(parsed) as Record<string, unknown>;
    delete noVersion.version;
    expect(() => parseProtocolDefinition(noVersion)).toThrow();

    const unknownEvidence = structuredClone(parsed);
    unknownEvidence.rules[0]?.evidence.sourceIds.push("not_registered");
    expect(() => parseProtocolDefinition(unknownEvidence)).toThrow();

    const unsafeFallback = structuredClone(parsed);
    unsafeFallback.fallback.effect.outcome = "programme_review_requested";
    expect(() => parseProtocolDefinition(unsafeFallback)).toThrow();

    const missingGate = structuredClone(parsed);
    missingGate.rules = missingGate.rules.filter(({ id }) => id !== "measurement_stale");
    expect(() => parseProtocolDefinition(missingGate)).toThrow();
  });
});

describe("deterministic protocol decision table", () => {
  it("gives a confirmed red flag precedence over a failed measurement", () => {
    const report = {
      ...baseReport,
      redFlags: { ...baseReport.redFlags, chestPain: "yes" as const }
    };
    const decision = evaluateProtocol(
      fixture,
      input({
        report,
        measurement: {
          status: "quality_failed",
          quality: { status: "fail", score: 0.1, reasons: ["weak_signal"], metrics: {} }
        }
      })
    );

    expect(result(decision)).toMatchObject({
      matchedRuleIds: ["red_flag_chest_pain_yes"],
      outcome: "emergency_guidance",
      allowedActions: ["show_emergency_guidance"]
    });
  });

  it("preserves an uncertain red-flag answer and abstains for review", () => {
    const report = {
      ...baseReport,
      redFlags: { ...baseReport.redFlags, fainted: "unsure" as const }
    };

    expect(result(evaluateProtocol(fixture, input({ report })))).toMatchObject({
      matchedRuleIds: ["red_flag_fainted_unsure"],
      outcome: "abstain_for_review",
      allowedActions: ["create_programme_task"]
    });
  });

  it.each([
    ["normal", 72, "illustrative_normal_pulse"],
    ["normal lower boundary", 60, "illustrative_normal_pulse"],
    ["normal upper boundary", 99, "illustrative_normal_pulse"],
    ["high boundary", 100, "illustrative_high_pulse"],
    ["low boundary", 59, "illustrative_low_pulse"]
  ])("evaluates a valid %s illustrative measurement", (_label, value, ruleId) => {
    const decision = evaluateProtocol(
      fixture,
      input({ measurement: { status: "present", fact: { ...baseMeasurement, value } } })
    );

    expect(result(decision)).toMatchObject({
      matchedRuleIds: [ruleId],
      outcome: "programme_review_requested",
      allowedActions: ["create_programme_task"],
      missingFactKeys: []
    });
  });

  it.each([
    [
      "poor quality",
      {
        status: "quality_failed",
        quality: { status: "retry", score: 0.4, reasons: ["motion"], metrics: {} }
      },
      "measurement_quality_failed",
      ["pulse_bpm"]
    ],
    ["missing", { status: "missing" }, "measurement_missing", ["pulse_bpm"]],
    [
      "unknown",
      { status: "unknown", factIds: ["uncertain-source-fact"] },
      "measurement_unknown",
      ["pulse_bpm"]
    ],
    [
      "conflicting",
      { status: "conflicting", factIds: ["fact-a", "fact-b"] },
      "measurement_conflicting",
      []
    ]
  ])("abstains for %s evidence", (_label, measurement, ruleId, missingFactKeys) => {
    const protocolResult = result(evaluateProtocol(fixture, input({ measurement })));

    expect(protocolResult).toMatchObject({
      matchedRuleIds: [ruleId],
      outcome: "abstain_for_review",
      allowedActions: ["create_programme_task"],
      missingFactKeys
    });
    if (_label === "poor quality") {
      expect(protocolResult.factIds).toEqual([baseReport.reportId]);
    }
  });

  it("derives staleness from the injected clock and explicit freshness window", () => {
    const measurement = {
      status: "present",
      fact: { ...baseMeasurement, observedAt: "2026-07-17T08:59:59.000Z" }
    };
    expect(result(evaluateProtocol(fixture, input({ measurement })))).toMatchObject({
      matchedRuleIds: ["measurement_stale"],
      outcome: "abstain_for_review",
      missingFactKeys: ["pulse_bpm"]
    });
  });

  it("treats evidence exactly on the freshness boundary as current", () => {
    const measurement = {
      status: "present",
      fact: { ...baseMeasurement, observedAt: "2026-07-17T09:00:00.000Z" }
    };
    expect(result(evaluateProtocol(fixture, input({ measurement })))).toMatchObject({
      matchedRuleIds: ["illustrative_normal_pulse"],
      outcome: "programme_review_requested"
    });
  });

  it("treats future-dated measurement evidence as unknown", () => {
    const measurement = {
      status: "present",
      fact: { ...baseMeasurement, observedAt: "2026-07-17T10:00:01.000Z" }
    };
    expect(result(evaluateProtocol(fixture, input({ measurement })))).toMatchObject({
      matchedRuleIds: ["measurement_unknown"],
      outcome: "abstain_for_review"
    });
  });

  it("asks one bounded follow-up", () => {
    const report = { ...baseReport, weakness: "moderate" as const };
    const first = evaluateProtocol(fixture, input({ report }));
    expect(first).toMatchObject({
      kind: "follow_up_required",
      matchedRuleIds: ["normal_pulse_moderate_weakness_follow_up"],
      question: { id: "symptoms_worse_today", answerType: "yes_no_unsure" }
    });
  });

  it.each([
    ["yes", "follow_up_answer_yes", "programme_review_requested"],
    ["no", "follow_up_answer_no", "programme_review_requested"],
    ["unsure", "follow_up_answer_unsure", "abstain_for_review"]
  ] as const)("returns the confirmed %s follow-up outcome", (answer, ruleId, outcome) => {
    const report = { ...baseReport, weakness: "moderate" as const };
    const answered = evaluateProtocol(
      fixture,
      input({
        report,
        followUpQuestionsAsked: 1,
        followUp: { status: "answered", questionId: "symptoms_worse_today", answer }
      })
    );
    expect(result(answered)).toMatchObject({
      matchedRuleIds: [ruleId],
      outcome
    });
  });

  it("never asks a second follow-up after the burden budget is exhausted", () => {
    const report = { ...baseReport, weakness: "moderate" as const };
    const decision = evaluateProtocol(
      fixture,
      input({ report, followUpQuestionsAsked: 1, followUp: { status: "not_asked" } })
    );

    expect(result(decision)).toMatchObject({
      matchedRuleIds: ["normal_pulse_follow_up_budget_exhausted"],
      outcome: "abstain_for_review",
      missingFactKeys: ["follow_up_answer"]
    });
  });

  it("uses emergency effect, priority, then lexical rule ID as stable tie-breaks", () => {
    const report = {
      ...baseReport,
      redFlags: {
        chestPain: "yes" as const,
        severeBreathlessness: "no" as const,
        fainted: "yes" as const
      }
    };
    expect(result(evaluateProtocol(fixture, input({ report })))).toMatchObject({
      matchedRuleIds: ["red_flag_chest_pain_yes"],
      outcome: "emergency_guidance"
    });
  });

  it("produces byte-for-byte equivalent golden decisions for a fixed input", () => {
    const evaluationInput = input();
    const first = evaluateProtocol(fixture, evaluationInput);
    const second = evaluateProtocol(structuredClone(fixture), structuredClone(evaluationInput));

    expect(second).toEqual(first);
    expect(first).toMatchSnapshot();
  });

  it("rejects unknown input fields and inconsistent follow-up state", () => {
    expect(() => evaluateProtocol(fixture, input({ modelDiagnosis: "anything" }))).toThrow();
    expect(() =>
      evaluateProtocol(
        fixture,
        input({
          followUpQuestionsAsked: 0,
          followUp: { status: "answered", questionId: "symptoms_worse_today", answer: "no" }
        })
      )
    ).toThrow();
  });
});
