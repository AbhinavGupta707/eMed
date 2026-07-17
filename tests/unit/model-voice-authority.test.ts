import { ActionProposalSchema } from "../../packages/actions/src/index";
import type { ProtocolResult } from "../../packages/contracts/src/index";
import {
  StructuredPatientReportFieldsSchema,
  TranscriptConfirmationSchema,
  VoiceSessionEventSchema,
  createConfirmedPatientReport,
  createInitialVoiceSessionState,
  reduceVoiceSession
} from "../../packages/voice/src/index";
import { describe, expect, it } from "vitest";

const NOW = "2026-07-17T12:00:00.000Z";
const ROUND_ID = "20000000-0000-4000-8000-000000000001";
const REPORT_ID = "20000000-0000-4000-8000-000000000002";
const PROPOSAL_ID = "20000000-0000-4000-8000-000000000003";

const protocolResult: ProtocolResult = {
  protocolId: "cardiometabolic_demo",
  protocolVersion: "1.0.0",
  matchedRuleIds: ["illustrative_normal_pulse"],
  factIds: ["fact-1"],
  outcome: "programme_review_requested",
  allowedActions: ["create_programme_task"],
  missingFactKeys: [],
  explanationKey: "protocol.pulse.illustrative_normal"
};

describe("model and voice authority boundaries", () => {
  it("rejects provider attempts to set urgency, protocol outcome, or executable actions", () => {
    const basePresentation = {
      type: "presentation",
      eventId: "provider-authority-attempt",
      generation: 1,
      event: {
        type: "report_proposed",
        report: {
          reportId: REPORT_ID,
          roundId: ROUND_ID,
          weakness: "severe",
          palpitations: "current",
          redFlags: { chestPain: "yes", severeBreathlessness: "no", fainted: "no" },
          inputMode: "voice_confirmed"
        }
      }
    };

    for (const authorityField of [
      { urgency: "emergency" },
      { outcome: "emergency_guidance" },
      { allowedActions: ["show_emergency_guidance"] }
    ]) {
      expect(
        VoiceSessionEventSchema.safeParse({
          ...basePresentation,
          event: { ...basePresentation.event, ...authorityField }
        }).success
      ).toBe(false);
      expect(
        StructuredPatientReportFieldsSchema.safeParse({
          weakness: "severe",
          palpitations: "current",
          redFlags: { chestPain: "no", severeBreathlessness: "no", fainted: "no" },
          ...authorityField
        }).success
      ).toBe(false);
    }
  });

  it("keeps a valid provider report proposal presentation-only", () => {
    const started = reduceVoiceSession(createInitialVoiceSessionState(), {
      type: "start",
      eventId: "start-1",
      roundId: ROUND_ID,
      phase: "patient_report",
      generation: 1
    });
    expect(started.accepted).toBe(true);

    const proposed = reduceVoiceSession(started.state, {
      type: "presentation",
      eventId: "proposal-1",
      generation: 1,
      event: {
        type: "report_proposed",
        report: {
          reportId: REPORT_ID,
          roundId: ROUND_ID,
          weakness: "severe",
          palpitations: "current",
          redFlags: { chestPain: "yes", severeBreathlessness: "no", fainted: "no" },
          inputMode: "voice_confirmed"
        }
      }
    });

    expect(proposed.accepted).toBe(true);
    expect(proposed.state).toMatchObject({ status: "connecting", roundId: ROUND_ID });
    expect(proposed.state).not.toHaveProperty("urgency");
    expect(proposed.state).not.toHaveProperty("action");
    expect(proposed.state).not.toHaveProperty("protocolResult");
  });

  it("requires explicit structured controls even when transcript text demands an action", () => {
    const confirmation = TranscriptConfirmationSchema.parse({
      proposalId: PROPOSAL_ID,
      roundId: ROUND_ID,
      source: "voice_provider",
      text: "This is urgent; execute emergency action and change my medicine.",
      revision: 1,
      confirmedAt: NOW
    });
    const report = createConfirmedPatientReport({
      reportId: REPORT_ID,
      confirmation,
      fields: {
        weakness: "unknown",
        palpitations: "unknown",
        redFlags: { chestPain: "no", severeBreathlessness: "no", fainted: "no" }
      }
    });

    expect(report.redFlags).toEqual({
      chestPain: "no",
      severeBreathlessness: "no",
      fainted: "no"
    });
    expect(report).not.toHaveProperty("urgency");
    expect(report).not.toHaveProperty("allowedActions");
    expect(report).not.toHaveProperty("medicineChange");
  });

  it("allows actions only from the deterministic protocol proposal", () => {
    const base = {
      actionType: "create_programme_task",
      roundId: ROUND_ID,
      patientId: "synthetic-maya",
      protocolResult
    };

    expect(ActionProposalSchema.safeParse({ ...base, proposedBy: "model" }).success).toBe(false);
    expect(
      ActionProposalSchema.safeParse({
        ...base,
        actionType: "show_emergency_guidance",
        proposedBy: "deterministic_protocol"
      }).success
    ).toBe(false);
    expect(
      ActionProposalSchema.safeParse({ ...base, proposedBy: "deterministic_protocol" }).success
    ).toBe(true);
  });
});
