import {
  ApiErrorCodeSchema,
  ApiErrorEnvelopeSchema,
  ApiSuccessEnvelopeSchema,
  CreateRoundRequestSchema,
  ExecuteActionRequestSchema,
  RoundDataSchema,
  SubmitAssessmentRequestSchema,
  SubmitReportRequestSchema
} from "../../packages/api-client/src/index";
import type { ProtocolResult, Round } from "../../packages/contracts/src/index";
import { describe, expect, it } from "vitest";

const NOW = "2026-07-17T12:00:00.000Z";
const ROUND_ID = "40000000-0000-4000-8000-000000000001";
const REPORT_ID = "40000000-0000-4000-8000-000000000002";
const FACT_ID = "40000000-0000-4000-8000-000000000003";
const SESSION_ID = "40000000-0000-4000-8000-000000000004";

const round: Round = {
  id: ROUND_ID,
  patientId: "synthetic-maya",
  state: "invited",
  stateVersion: 0,
  purpose: "Synthetic API compatibility fixture",
  triggerId: "homerounds-test:api-compatibility",
  burdenSecondsRemaining: 90,
  protocolId: "cardiometabolic_demo",
  createdAt: NOW,
  updatedAt: NOW,
  closedAt: null
};

const protocolResult: ProtocolResult = {
  protocolId: "cardiometabolic_demo",
  protocolVersion: "1.0.0",
  matchedRuleIds: ["illustrative_normal_pulse"],
  factIds: [FACT_ID],
  outcome: "programme_review_requested",
  allowedActions: ["create_programme_task"],
  missingFactKeys: [],
  explanationKey: "protocol.pulse.illustrative_normal"
};

const meta = {
  correlationId: "api-compatibility",
  runtimeProfile: "in_memory_demo_fallback" as const
};

describe("API schema compatibility", () => {
  it("parses the legacy round response while accepting current optional projections", () => {
    const envelope = ApiSuccessEnvelopeSchema(RoundDataSchema);

    expect(envelope.safeParse({ data: { round }, meta }).success).toBe(true);
    expect(
      envelope.safeParse({
        data: { round, protocolResult: null, task: null },
        meta
      }).success
    ).toBe(true);
  });

  it("keeps requests and nested clinical objects strictly closed", () => {
    const validCreate = {
      patientId: "synthetic-maya",
      triggerId: "homerounds-test:strict-create",
      purpose: "Synthetic strict request",
      protocolId: "cardiometabolic_demo",
      burdenSeconds: 90
    };
    const validReport = {
      report: {
        reportId: REPORT_ID,
        roundId: ROUND_ID,
        weakness: "absent",
        palpitations: "absent",
        redFlags: { chestPain: "no", severeBreathlessness: "no", fainted: "no" },
        inputMode: "text",
        confirmedAt: NOW
      },
      expectedStateVersion: 2
    };
    const validAssessment = {
      expectedStateVersion: 5,
      measurement: {
        factId: FACT_ID,
        assessmentSessionId: SESSION_ID,
        provider: "finger_ppg",
        value: 72,
        unit: "bpm",
        observedAt: NOW,
        durationMs: 30_000,
        algorithmVersion: "synthetic_fixture_v1",
        providerModelVersion: null,
        quality: { status: "pass", score: 0.95, reasons: [], metrics: {} },
        rawMediaRef: null
      },
      attestation: "a".repeat(32)
    };

    expect(CreateRoundRequestSchema.safeParse({ ...validCreate, tenantId: "other" }).success).toBe(
      false
    );
    expect(
      SubmitReportRequestSchema.safeParse({
        ...validReport,
        report: {
          ...validReport.report,
          urgency: "emergency"
        }
      }).success
    ).toBe(false);
    expect(
      SubmitReportRequestSchema.safeParse({
        ...validReport,
        report: {
          ...validReport.report,
          redFlags: { ...validReport.report.redFlags, modelConfidence: 1 }
        }
      }).success
    ).toBe(false);
    expect(
      SubmitAssessmentRequestSchema.safeParse({
        ...validAssessment,
        measurement: {
          ...validAssessment.measurement,
          rawFrames: "RAW_FRAME_CANARY"
        }
      }).success
    ).toBe(false);
    expect(
      SubmitAssessmentRequestSchema.safeParse({
        ...validAssessment,
        measurement: {
          ...validAssessment.measurement,
          quality: { ...validAssessment.measurement.quality, providerPayload: { pulse: 72 } }
        }
      }).success
    ).toBe(false);
    expect(
      ExecuteActionRequestSchema.safeParse({
        expectedStateVersion: 8,
        protocolResult,
        confirmation: { confirmed: true, confirmedAt: NOW },
        actionType: "show_emergency_guidance"
      }).success
    ).toBe(false);
  });

  it("preserves the stable error envelope and rejects unknown future codes", () => {
    for (const code of ApiErrorCodeSchema.options) {
      expect(
        ApiErrorEnvelopeSchema.safeParse({
          error: {
            code,
            userMessageKey: `api.error.${code}`,
            correlationId: "compatibility-error",
            issues: [],
            retryAfterSeconds: code === "rate_limited" ? 60 : null
          }
        }).success
      ).toBe(true);
    }
    expect(
      ApiErrorEnvelopeSchema.safeParse({
        error: {
          code: "new_unversioned_error",
          userMessageKey: "api.error.unknown",
          correlationId: "compatibility-error",
          issues: [],
          retryAfterSeconds: null
        }
      }).success
    ).toBe(false);
  });

  it("rejects stale, malicious, and oversized request variants without coercion", () => {
    expect(
      CreateRoundRequestSchema.safeParse({
        patientId: "synthetic-maya",
        triggerId: "homerounds-test:oversized",
        purpose: "x".repeat(241),
        protocolId: "cardiometabolic_demo",
        burdenSeconds: 90
      }).success
    ).toBe(false);
    expect(
      CreateRoundRequestSchema.safeParse({
        patientId: "synthetic-maya' OR '1'='1",
        triggerId: "homerounds-test:malicious",
        purpose: "Synthetic malicious-string fixture",
        protocolId: "cardiometabolic_demo",
        burdenSeconds: 0
      }).success
    ).toBe(false);
    expect(
      ExecuteActionRequestSchema.safeParse({
        expectedStateVersion: -1,
        protocolResult,
        confirmation: { confirmed: true, confirmedAt: NOW }
      }).success
    ).toBe(false);
  });
});
