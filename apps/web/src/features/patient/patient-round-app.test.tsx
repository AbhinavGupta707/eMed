/** @jsxRuntime automatic */
/** @jsxImportSource react */
// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import type {
  ExecuteActionRequest,
  StartAssessmentRequest,
  SubmitAssessmentRequest,
  SubmitReportRequest,
  TransitionRoundRequest
} from "@homerounds/api-client";
import {
  MeasurementFactSchema,
  ProtocolResultSchema,
  RoundSchema,
  type OpticalAssessmentProvider,
  type OpticalAssessmentResult,
  type Round,
  type RoundState
} from "@homerounds/contracts";
import { DisabledVoiceSessionProvider } from "@homerounds/voice";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SYNTHETIC_MAYA_ROUND } from "../shared-round/patient-round-config";
import type { PatientRoundApi } from "../workflows/patient-workflow-controller";
import { PatientRoundApp } from "./patient-round-app";

const ROUND_ID = "14df34c4-8204-4810-8113-37b63c963a91";
const SESSION_ID = "1596aee5-e0ae-45df-bd5f-96fd89700f7b";
const FACT_ID = "cbb31bb5-f5a1-464c-9954-c54a771ed47d";
const REPORT_ID = "19df6892-ed28-4ef2-8d36-5a2133cad9a4";
const TASK_ID = "39fc4367-c569-4565-9899-c94d4b9cced7";
const NOW = "2026-07-17T11:00:00.000Z";

type AssessmentSessionResult = Awaited<ReturnType<PatientRoundApi["startAssessment"]>>;
type AssessmentSubmissionResult = Awaited<ReturnType<PatientRoundApi["submitAssessment"]>>;
type ActionResult = Awaited<ReturnType<PatientRoundApi["executeAction"]>>;

function makeRound(state: RoundState = "invited", version = 0): Round {
  const time = new Date(Date.parse(NOW) + version * 1_000).toISOString();
  return RoundSchema.parse({
    id: ROUND_ID,
    patientId: "synthetic-maya",
    state,
    stateVersion: version,
    purpose: SYNTHETIC_MAYA_ROUND.purpose,
    triggerId: SYNTHETIC_MAYA_ROUND.triggerId,
    burdenSecondsRemaining: 120,
    protocolId: "cardiometabolic_demo",
    createdAt: NOW,
    updatedAt: time,
    closedAt: ["emergency_closed", "abstained_for_review", "patient_declined", "closed"].includes(
      state
    )
      ? time
      : null
  });
}

const programmeResult = ProtocolResultSchema.parse({
  protocolId: "cardiometabolic_demo",
  protocolVersion: "1.0.0",
  matchedRuleIds: ["illustrative_high_pulse"],
  factIds: [REPORT_ID, FACT_ID],
  outcome: "programme_review_requested",
  allowedActions: ["create_programme_task"],
  missingFactKeys: [],
  explanationKey: "protocol.pulse.illustrative_high"
});

const emergencyResult = ProtocolResultSchema.parse({
  protocolId: "cardiometabolic_demo",
  protocolVersion: "1.0.0",
  matchedRuleIds: ["red_flag_chest_pain_yes"],
  factIds: [REPORT_ID],
  outcome: "emergency_guidance",
  allowedActions: ["show_emergency_guidance"],
  missingFactKeys: [],
  explanationKey: "protocol.red_flag.chest_pain"
});

const measurement = MeasurementFactSchema.parse({
  factId: FACT_ID,
  assessmentSessionId: SESSION_ID,
  provider: "finger_ppg",
  value: 103,
  unit: "bpm",
  observedAt: NOW,
  durationMs: 20_000,
  algorithmVersion: "finger_ppg_hr_v1",
  providerModelVersion: null,
  quality: { status: "pass", score: 0.94, reasons: [], metrics: { stable: 1 } },
  rawMediaRef: null
});

function nextRound(round: Round, state: RoundState): Round {
  return makeRound(state, round.stateVersion + 1);
}

class UiApi implements PatientRoundApi {
  round = makeRound();
  readonly calls = {
    submitReport: vi.fn(),
    startAssessment: vi.fn(),
    submitAssessment: vi.fn()
  };

  createRound(): Promise<{ round: Round; created: boolean }> {
    return Promise.resolve({ round: this.round, created: false });
  }

  getRound(): Promise<{ round: Round }> {
    return Promise.resolve({ round: this.round });
  }

  transitionRound(_roundId: string, input: TransitionRoundRequest): Promise<{ round: Round }> {
    this.round = nextRound(this.round, input.to);
    return Promise.resolve({ round: this.round });
  }

  submitReport(
    roundId: string,
    input: SubmitReportRequest
  ): ReturnType<PatientRoundApi["submitReport"]> {
    this.calls.submitReport(roundId, input);
    if (input.report.redFlags.chestPain === "yes") {
      this.round = nextRound(this.round, "emergency_closed");
      return Promise.resolve({
        round: this.round,
        next: "emergency_closed",
        selectedModuleId: null,
        protocolResult: emergencyResult
      });
    }
    this.round = nextRound(this.round, "assessment_selected");
    return Promise.resolve({
      round: this.round,
      next: "assessment_selected",
      selectedModuleId: "capture.finger_ppg.pulse",
      protocolResult: null
    });
  }

  startAssessment(
    roundId: string,
    input: StartAssessmentRequest
  ): Promise<AssessmentSessionResult> {
    this.calls.startAssessment(roundId, input);
    this.round = nextRound(this.round, "capturing");
    return Promise.resolve({
      round: this.round,
      assessmentSessionId: SESSION_ID,
      provider: "finger_ppg",
      attestation: "synthetic-assessment-attestation-value-0001",
      expiresAt: "2026-07-17T11:05:00.000Z"
    });
  }

  submitAssessment(
    roundId: string,
    input: SubmitAssessmentRequest
  ): Promise<AssessmentSubmissionResult> {
    this.calls.submitAssessment(roundId, input);
    this.round = nextRound(this.round, "action_pending");
    return Promise.resolve({
      round: this.round,
      measurement: input.measurement,
      decision: { kind: "result", result: programmeResult }
    });
  }

  executeAction(_roundId: string, input: ExecuteActionRequest): Promise<ActionResult> {
    if (input.protocolResult.outcome === "emergency_guidance") {
      return Promise.resolve({
        kind: "emergency_guidance",
        message: {
          templateId: "emergency_guidance_demo_v1",
          heading: "Stop this demo round",
          body: "This prototype cannot assess an emergency. In a real situation, use the emergency help available where you are.",
          serviceWindowLabel: null,
          demoOnly: true,
          diagnosticClaim: false
        }
      });
    }
    this.round = nextRound(this.round, "awaiting_clinician");
    return Promise.resolve({
      kind: "programme_task",
      created: true,
      task: {
        id: TASK_ID,
        roundId: ROUND_ID,
        patientId: "synthetic-maya",
        idempotencyKey: "synthetic-idempotency-key-0001",
        type: "programme_review",
        ownerRole: "programme_clinician",
        priority: "priority",
        reasonKey: programmeResult.explanationKey,
        status: "open",
        serviceWindowLabel: "Demo-only review; no response promised.",
        protocolId: "cardiometabolic_demo",
        createdAt: NOW,
        updatedAt: NOW
      },
      message: {
        templateId: "programme_review_requested_v1",
        heading: "Programme review requested",
        body: "Your programme team can review the confirmed information from this synthetic demo round.",
        serviceWindowLabel: "Demo-only review; no response promised.",
        demoOnly: true,
        diagnosticClaim: false
      }
    });
  }
}

class UiProvider implements OpticalAssessmentProvider {
  readonly kind = "finger_ppg" as const;
  availability: Awaited<ReturnType<OpticalAssessmentProvider["checkAvailability"]>> = {
    available: true,
    capabilities: { camera: true }
  };
  result: OpticalAssessmentResult = { status: "completed", measurement };

  checkAvailability(): Promise<
    Awaited<ReturnType<OpticalAssessmentProvider["checkAvailability"]>>
  > {
    return Promise.resolve(this.availability);
  }

  capture(): Promise<OpticalAssessmentResult> {
    return Promise.resolve(this.result);
  }

  dispose(): Promise<void> {
    return Promise.resolve();
  }
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderRound(api = new UiApi(), provider = new UiProvider()) {
  render(
    createElement(PatientRoundApp, {
      api,
      config: SYNTHETIC_MAYA_ROUND,
      createId: () => REPORT_ID,
      createOpticalProvider: () => provider,
      isOnline: () => true,
      now: () => NOW,
      timeoutMs: 60_000,
      voiceProvider: new DisabledVoiceSessionProvider("missing_configuration")
    })
  );
  return { api, provider };
}

async function acceptInvitation(): Promise<void> {
  expect(
    await screen.findByText("Synthetic demonstration — not clinically validated")
  ).toBeVisible();
  fireEvent.click(
    screen.getByLabelText(
      /I understand this is a synthetic demonstration, not clinically validated/i
    )
  );
  fireEvent.click(screen.getByRole("button", { name: "Start the check" }));
  await screen.findByRole("heading", { name: "Tell us what is happening now" });
}

function choose(groupName: string, answer: string): void {
  const group = screen.getByRole("group", { name: groupName });
  fireEvent.click(within(group).getByLabelText(answer));
}

async function completeTextReport(chestPain = "No"): Promise<void> {
  choose("Are you having chest pain now?", chestPain);
  choose("Are you severely short of breath now?", "No");
  choose("Have you fainted?", "No");
  choose("How weak do you feel?", "Mild");
  choose("Are you noticing a racing, pounding, or fluttering feeling?", "Comes and goes");
  expect(screen.queryByRole("button", { name: "Start voice" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Your check-in text"), {
    target: { value: "I feel a little weak today." }
  });
  fireEvent.click(screen.getByRole("button", { name: "Confirm this text" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm and continue" }));
}

describe("patient round app", () => {
  it("completes the no-key text path through passing capture and explicit action confirmation", async () => {
    const { api } = renderRound();
    await acceptInvitation();
    await completeTextReport();

    await screen.findByRole("heading", { name: "Next, prepare a short camera pulse check" });
    fireEvent.click(screen.getByRole("button", { name: "Check this device" }));
    await screen.findByRole("heading", {
      name: /Your device is ready/i
    });
    fireEvent.click(screen.getByLabelText(/I consent to this synthetic-demo camera check/i));
    fireEvent.click(screen.getByRole("button", { name: "Start camera check" }));

    await screen.findByRole("heading", { name: "Confirm the next demo step" });
    expect(screen.getByText(/Demo pulse estimate:/)).toHaveTextContent(/103\s*bpm/);
    fireEvent.click(
      screen.getByLabelText(/I confirm creation of one synthetic programme-review task/i)
    );
    fireEvent.click(screen.getByRole("button", { name: "Create synthetic review task" }));

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Programme review requested" })).toBeVisible()
    );
    expect(screen.getByText("One synthetic task created")).toBeVisible();
    expect(api.calls.submitReport).toHaveBeenCalledTimes(1);
    expect(api.calls.submitAssessment).toHaveBeenCalledTimes(1);
  });

  it("keeps the camera path unreachable when a required red flag hard-stops the round", async () => {
    const { api } = renderRound();
    await acceptInvitation();
    await completeTextReport("Yes");

    await screen.findByRole("heading", { name: "Stop this demo round" });
    expect(screen.getByText(/ended the ordinary flow before any camera check/i)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Check this device" })).not.toBeInTheDocument();
    expect(api.calls.startAssessment).not.toHaveBeenCalled();
  });

  it("shows a non-colour denied-camera recovery and never starts capture", async () => {
    const provider = new UiProvider();
    provider.availability = { available: false, reason: "permission_denied" };
    renderRound(new UiApi(), provider);
    await acceptInvitation();
    await completeTextReport();
    await screen.findByRole("heading", { name: "Next, prepare a short camera pulse check" });
    fireEvent.click(screen.getByRole("button", { name: "Check this device" }));

    await screen.findByRole("heading", { name: "The selected camera check is unavailable" });
    expect(screen.getByText("Camera permission was not granted")).toBeVisible();
    expect(screen.getByText(/No camera value was recorded/i)).toBeVisible();
    expect(screen.queryByText(/103 bpm/)).not.toBeInTheDocument();
  });
});
