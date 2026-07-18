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
  ClinicalTaskSchema,
  MeasurementFactSchema,
  ProtocolResultSchema,
  RoundSchema,
  VoiceBiomarkerFactSchema,
  type OpticalAssessmentProvider,
  type OpticalAssessmentResult,
  type Round,
  type RoundState,
  type VoiceBiomarkerAssessmentResult,
  type VoiceBiomarkerProvider
} from "@homerounds/contracts";
import { DisabledVoiceSessionProvider } from "@homerounds/voice";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SYNTHETIC_MAYA_ROUND } from "../shared-round/patient-round-config";
import type { PatientRoundApi } from "../workflows/patient-workflow-controller";
import { MAYA_HAPPY_PATH_ROUND_MAP } from "./adaptive-round-map.fixtures";
import { PatientRoundApp } from "./patient-round-app";

const ROUND_ID = "14df34c4-8204-4810-8113-37b63c963a91";
const SESSION_ID = "1596aee5-e0ae-45df-bd5f-96fd89700f7b";
const FACT_ID = "cbb31bb5-f5a1-464c-9954-c54a771ed47d";
const REPORT_ID = "19df6892-ed28-4ef2-8d36-5a2133cad9a4";
const TASK_ID = "39fc4367-c569-4565-9899-c94d4b9cced7";
const NOW = "2026-07-17T11:00:00.000Z";
const PHONE_PREFERENCE = {
  status: "set" as const,
  value: "phone" as const,
  provenance: {
    schemaVersion: "preference-provenance.v1" as const,
    source: "patient_confirmation" as const,
    confirmationId: "60000000-0000-4000-8000-000000000001",
    recordedAt: NOW
  }
};

type AssessmentSessionResult = Awaited<ReturnType<PatientRoundApi["startAssessment"]>>;
type AssessmentSubmissionResult = Awaited<ReturnType<PatientRoundApi["submitAssessment"]>>;
type ActionResult = Awaited<ReturnType<PatientRoundApi["executeAction"]>>;
type EvidenceRoute = NonNullable<Awaited<ReturnType<PatientRoundApi["getRound"]>>["evidenceRoute"]>;

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

const voiceBiomarkerFact = VoiceBiomarkerFactSchema.parse({
  factId: "7789faf2-cf7a-4162-b65e-681f5909535c",
  roundId: ROUND_ID,
  assessmentSessionId: SESSION_ID,
  provider: "local_voice_features",
  observedAt: NOW,
  durationMs: 7_000,
  algorithmVersion: "voice_local_features_v1",
  features: {
    medianFundamentalFrequencyHz: 181.2,
    pitchVariabilitySemitones: 0.7,
    jitterPercent: 0.8,
    shimmerPercent: 2.4,
    harmonicToNoiseRatioDb: 18.1,
    phonationDurationMs: 7_000
  },
  quality: {
    status: "pass",
    score: 0.91,
    reasons: [],
    metrics: {
      sampleRateHz: 48_000,
      durationMs: 7_000,
      clippingFraction: 0,
      voicedFraction: 0.91,
      estimatedSnrDb: 22
    }
  },
  researchOnly: true,
  rawMediaRef: null
});

const completedTask = ClinicalTaskSchema.parse({
  id: TASK_ID,
  roundId: ROUND_ID,
  patientId: "synthetic-maya",
  idempotencyKey: "synthetic-idempotency-key-0001",
  type: "programme_review",
  ownerRole: "programme_clinician",
  priority: "routine",
  reasonKey: "protocol.measurement.quality_failed",
  status: "completed",
  serviceWindowLabel: "Demo-only review; no response promised.",
  protocolId: "cardiometabolic_demo",
  createdAt: NOW,
  updatedAt: "2026-07-17T11:09:00.000Z"
});

function nextRound(round: Round, state: RoundState): Round {
  return makeRound(state, round.stateVersion + 1);
}

const emptyEvidenceRoute = {
  selection: null,
  candidates: [],
  selectedModuleId: null,
  medicationConfirmed: false,
  medicationSkipped: false,
  voiceBiomarkerCompleted: false,
  voiceBiomarkerSkipped: false
} satisfies EvidenceRoute;

const voiceEvidenceRoute = {
  ...emptyEvidenceRoute,
  candidates: [
    {
      id: "voice.local.baseline",
      kind: "voice_biomarker" as const,
      label: "Local voice research signal",
      description: "Capture a separate sustained vowel locally.",
      producesFactKeys: ["voice_biomarker_observation" as const],
      availability: { status: "available" as const },
      estimatedBurdenSeconds: 15,
      deterministicRank: 1
    }
  ],
  selectedModuleId: "voice.local.baseline"
} satisfies EvidenceRoute;

class UiApi implements PatientRoundApi {
  round = makeRound();
  task: typeof completedTask | null = null;
  evidenceRoute: EvidenceRoute = emptyEvidenceRoute;
  readonly calls = {
    submitReport: vi.fn(),
    startVoiceBiomarker: vi.fn(),
    submitVoiceBiomarker: vi.fn(),
    skipVoiceBiomarker: vi.fn(),
    startAssessment: vi.fn(),
    submitAssessment: vi.fn()
  };

  createRound(): Promise<{ round: Round; created: boolean }> {
    return Promise.resolve({ round: this.round, created: false });
  }

  getRound(): ReturnType<PatientRoundApi["getRound"]> {
    return Promise.resolve({
      round: this.round,
      protocolResult: null,
      task: this.task,
      evidenceRoute: this.evidenceRoute
    });
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
        protocolResult: emergencyResult,
        evidenceRoute: this.evidenceRoute
      });
    }
    this.round = nextRound(this.round, "assessment_selected");
    return Promise.resolve({
      round: this.round,
      next: "assessment_selected",
      selectedModuleId: "capture.finger_ppg.pulse",
      protocolResult: null,
      evidenceRoute: this.evidenceRoute
    });
  }

  submitMedicationLabelImage(): ReturnType<PatientRoundApi["submitMedicationLabelImage"]> {
    return Promise.resolve({
      outcome: {
        status: "failed",
        failure: { code: "missing_configuration", retryable: false, retryAfterMs: null }
      }
    });
  }

  confirmMedicationObservation(
    _roundId: string,
    input: Parameters<PatientRoundApi["confirmMedicationObservation"]>[1]
  ): ReturnType<PatientRoundApi["confirmMedicationObservation"]> {
    return Promise.resolve({
      round: this.round,
      fact: input.fact,
      persisted: true,
      duplicateSuppressed: false
    });
  }

  startVoiceBiomarker(
    roundId: string,
    input: Parameters<PatientRoundApi["startVoiceBiomarker"]>[1]
  ): ReturnType<PatientRoundApi["startVoiceBiomarker"]> {
    this.calls.startVoiceBiomarker(roundId, input);
    return Promise.resolve({
      round: this.round,
      assessmentSessionId: SESSION_ID,
      provider: "local_voice_features",
      attestation: "synthetic-voice-attestation-value-0000001",
      expiresAt: "2026-07-17T11:05:00.000Z"
    });
  }

  submitVoiceBiomarker(
    roundId: string,
    input: Parameters<PatientRoundApi["submitVoiceBiomarker"]>[1]
  ): ReturnType<PatientRoundApi["submitVoiceBiomarker"]> {
    this.calls.submitVoiceBiomarker(roundId, input);
    this.evidenceRoute = { ...this.evidenceRoute, voiceBiomarkerCompleted: true };
    return Promise.resolve({
      round: this.round,
      result: input.result,
      evidenceRoute: this.evidenceRoute
    });
  }

  skipVoiceBiomarker(
    roundId: string,
    input: Parameters<PatientRoundApi["skipVoiceBiomarker"]>[1]
  ): ReturnType<PatientRoundApi["skipVoiceBiomarker"]> {
    this.calls.skipVoiceBiomarker(roundId, input);
    this.evidenceRoute = { ...this.evidenceRoute, voiceBiomarkerSkipped: true };
    return Promise.resolve({
      round: this.round,
      evidenceRoute: this.evidenceRoute
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

  submitCaptureQuality(
    _roundId: string,
    input: Parameters<PatientRoundApi["submitCaptureQuality"]>[1]
  ): ReturnType<PatientRoundApi["submitCaptureQuality"]> {
    this.round = nextRound(
      this.round,
      input.quality.status === "retry" ? "capture_retry" : "abstained_for_review"
    );
    return Promise.resolve(
      input.quality.status === "retry"
        ? { next: "retry", round: this.round, protocolResult: null }
        : {
            next: "abstained_for_review",
            round: this.round,
            protocolResult: programmeResult
          }
    );
  }

  submitFollowUp(): ReturnType<PatientRoundApi["submitFollowUp"]> {
    this.round = nextRound(this.round, "action_pending");
    return Promise.resolve({ round: this.round, protocolResult: programmeResult });
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

class UiVoiceBiomarkerProvider implements VoiceBiomarkerProvider {
  readonly kind = "local_voice_features" as const;
  result: VoiceBiomarkerAssessmentResult = { status: "completed", fact: voiceBiomarkerFact };

  checkAvailability(): Promise<Awaited<ReturnType<VoiceBiomarkerProvider["checkAvailability"]>>> {
    return Promise.resolve({ available: true, capabilities: { microphone: true, webAudio: true } });
  }

  capture(): Promise<VoiceBiomarkerAssessmentResult> {
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

function renderRound(
  api = new UiApi(),
  provider = new UiProvider(),
  voiceBiomarkerProvider = new UiVoiceBiomarkerProvider()
) {
  render(
    createElement(PatientRoundApp, {
      api,
      config: SYNTHETIC_MAYA_ROUND,
      defaultDevicePreference: PHONE_PREFERENCE,
      createId: () => REPORT_ID,
      createOpticalProvider: () => provider,
      isOnline: () => true,
      now: () => NOW,
      timeoutMs: 60_000,
      voiceBiomarkerProvider,
      voiceProvider: new DisabledVoiceSessionProvider("missing_configuration")
    })
  );
  return { api, provider };
}

async function acceptInvitation(): Promise<void> {
  expect(await screen.findByText("Sample profile · Not medical care")).toBeVisible();
  fireEvent.click(screen.getByLabelText(/I understand this check does not diagnose a condition/i));
  fireEvent.click(screen.getByRole("button", { name: "Start my check-in" }));
  await screen.findByRole("heading", { name: "Three questions before we talk." });
}

function choose(groupName: string, answer: string): void {
  const group = screen.getByRole("group", { name: groupName });
  fireEvent.click(within(group).getByLabelText(answer));
}

async function completeTextReport(chestPain = "No"): Promise<void> {
  choose("Are you having chest pain now?", chestPain);
  choose("Are you severely short of breath now?", "No");
  choose("Have you fainted?", "No");
  fireEvent.click(screen.getByRole("button", { name: "Continue to conversation" }));
  await screen.findByRole("heading", { name: "Tell me what’s changed." });
  choose("How weak do you feel?", "Mild");
  choose("Are you noticing a racing, pounding, or fluttering feeling?", "Comes and goes");
  expect(screen.queryByRole("button", { name: "Start voice" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Your check-in text"), {
    target: { value: "I feel a little weak today." }
  });
  fireEvent.click(screen.getByRole("button", { name: "Confirm this text" }));
  fireEvent.click(screen.getByRole("button", { name: "Review my report" }));
  await screen.findByRole("heading", { name: "Let’s make sure I understood." });
  fireEvent.click(
    screen.getByLabelText(/I reviewed every field and confirm these are my answers/i)
  );
  fireEvent.click(screen.getByRole("button", { name: "Confirm and continue" }));
}

async function continueRecommendationWhenOffered(): Promise<void> {
  await waitFor(() => {
    const nextControl =
      screen.queryByRole("button", { name: "Continue to this check" }) ??
      screen.queryByRole("button", { name: "Continue on this computer" }) ??
      screen.queryByRole("button", { name: "Start 7-second capture" });
    expect(nextControl).not.toBeNull();
  });
  const continueButton = screen.queryByRole("button", { name: "Continue to this check" });
  if (continueButton) fireEvent.click(continueButton);
}

describe("patient round app", () => {
  it("shows the recommendation only after the report and hides unrelated sensors", async () => {
    const api = new UiApi();
    render(
      createElement(PatientRoundApp, {
        api,
        config: SYNTHETIC_MAYA_ROUND,
        createId: () => REPORT_ID,
        createOpticalProvider: () => new UiProvider(),
        isOnline: () => true,
        now: () => NOW,
        roundMapExperience: MAYA_HAPPY_PATH_ROUND_MAP,
        timeoutMs: 60_000,
        voiceProvider: new DisabledVoiceSessionProvider("missing_configuration")
      })
    );

    expect(await screen.findByRole("heading", { name: "Ready when you are, Maya." })).toBeVisible();
    expect(screen.queryByText("Medication label review")).not.toBeInTheDocument();
    await acceptInvitation();
    await completeTextReport();
    expect(await screen.findByRole("heading", { name: /most useful next step/i })).toBeVisible();
    expect(screen.queryByText("Medication label review")).not.toBeInTheDocument();
    expect(screen.queryByText("Optional remote camera check")).not.toBeInTheDocument();
    expect(api.calls.submitReport).toHaveBeenCalledTimes(1);
  });

  it("shows clinician completion from the persisted round after refresh", async () => {
    const api = new UiApi();
    api.round = makeRound("abstained_for_review", 9);
    api.task = completedTask;
    renderRound(api);

    expect(await screen.findByRole("heading", { name: "Review finished" })).toBeVisible();
    expect(
      screen.getByText("The sample care-team review was marked complete inside HomeRounds.")
    ).toBeVisible();
    expect(screen.getByText("Completed in HomeRounds")).toBeVisible();
    expect(
      screen.getByText(/saved status belongs only to the sample HomeRounds profile/i)
    ).toBeVisible();
  });

  it("completes the no-key text path through passing capture and explicit action confirmation", async () => {
    const { api } = renderRound();
    await acceptInvitation();
    await completeTextReport();
    await continueRecommendationWhenOffered();

    await screen.findByRole("heading", { name: "A pulse check is the most useful next step." });
    expect(screen.getByText("Phone preferred for supported checks")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Continue on this computer" }));
    await screen.findByRole("heading", {
      name: /Your device is ready/i
    });
    fireEvent.click(screen.getByLabelText(/I agree to use the camera for this check/i));
    fireEvent.click(screen.getByRole("button", { name: "Start camera check" }));

    await screen.findByRole("heading", { name: "Choose what happens next." });
    expect(screen.getByText(/Pulse reading:/)).toHaveTextContent(/103\s*bpm/);
    fireEvent.click(screen.getByLabelText(/I want to save one sample review request/i));
    fireEvent.click(screen.getByRole("button", { name: "Save review request" }));

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Your review request is saved" })).toBeVisible()
    );
    expect(screen.getByText("One sample request saved")).toBeVisible();
    expect(api.calls.submitReport).toHaveBeenCalledTimes(1);
    expect(api.calls.submitAssessment).toHaveBeenCalledTimes(1);
  });

  it("keeps the camera path unreachable when a required red flag hard-stops the round", async () => {
    const { api } = renderRound();
    await acceptInvitation();
    await completeTextReport("Yes");

    await screen.findByRole("heading", { name: "Stop this check-in." });
    expect(screen.getByText(/ended the ordinary flow before any camera check/i)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Check this device" })).not.toBeInTheDocument();
    expect(api.calls.startAssessment).not.toHaveBeenCalled();
  });

  it("runs a consented local voice research station before exposing the camera pulse step", async () => {
    const api = new UiApi();
    api.evidenceRoute = voiceEvidenceRoute;
    renderRound(api);
    await acceptInvitation();
    await completeTextReport();
    await continueRecommendationWhenOffered();

    expect(
      await screen.findByRole("heading", { name: "Sustained-vowel research signal" })
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Continue on this computer" })
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByLabelText(/I consent to one separate local sustained-vowel capture/i)
    );
    fireEvent.click(screen.getByRole("button", { name: "Start 7-second capture" }));

    await screen.findByRole("heading", { name: "A pulse check is the most useful next step." });
    expect(api.calls.submitVoiceBiomarker).toHaveBeenCalledTimes(1);
    expect(api.calls.startAssessment).not.toHaveBeenCalled();
  });

  it("shows a non-colour denied-camera recovery and never starts capture", async () => {
    const provider = new UiProvider();
    provider.availability = { available: false, reason: "permission_denied" };
    renderRound(new UiApi(), provider);
    await acceptInvitation();
    await completeTextReport();
    await continueRecommendationWhenOffered();
    await screen.findByRole("heading", { name: "A pulse check is the most useful next step." });
    fireEvent.click(screen.getByRole("button", { name: "Continue on this computer" }));

    await screen.findByRole("heading", { name: "The selected camera check is unavailable" });
    expect(screen.getByText("Camera permission was not granted")).toBeVisible();
    expect(screen.getByText(/No camera value was recorded/i)).toBeVisible();
    expect(screen.queryByText(/103 bpm/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continue without a measurement" }));
    await screen.findByRole("heading", { name: "Choose what happens next." });
    expect(screen.getByText("Uncertainty kept intact")).toBeVisible();
  });

  it("keeps a provider outage visible and never invents a reading", async () => {
    const provider = new UiProvider();
    provider.availability = { available: false, reason: "provider_unavailable" };
    renderRound(new UiApi(), provider);
    await acceptInvitation();
    await completeTextReport();
    await continueRecommendationWhenOffered();
    await screen.findByRole("heading", { name: "A pulse check is the most useful next step." });
    fireEvent.click(screen.getByRole("button", { name: "Continue on this computer" }));

    expect(
      await screen.findByRole("heading", { name: "The selected camera check is unavailable" })
    ).toBeVisible();
    expect(screen.getByText("The selected measurement service is unavailable")).toBeVisible();
    expect(screen.queryByText(/103 bpm/)).not.toBeInTheDocument();
  });

  it("shows an offline pause without a retry that cannot run", async () => {
    render(
      createElement(PatientRoundApp, {
        api: new UiApi(),
        config: SYNTHETIC_MAYA_ROUND,
        createOpticalProvider: () => new UiProvider(),
        isOnline: () => false,
        timeoutMs: 60_000,
        voiceProvider: new DisabledVoiceSessionProvider("missing_configuration")
      })
    );

    expect(await screen.findByText("You appear to be offline")).toBeVisible();
    expect(screen.getByText(/Nothing new has been submitted/i)).toBeVisible();
    expect(screen.queryByRole("button", { name: /try connection again/i })).not.toBeInTheDocument();
  });

  it("restores confirmed progress but requires a fresh unfinished capture", async () => {
    const api = new UiApi();
    api.round = makeRound("capturing", 6);
    renderRound(api);

    expect(
      await screen.findByRole("heading", { name: "Your saved round needs a safe recovery step" })
    ).toBeVisible();
    expect(screen.getByText("Nothing unfinished was guessed")).toBeVisible();
  });

  it("shows a final cancellation state with no follow-on action", async () => {
    const api = new UiApi();
    api.round = makeRound("patient_declined", 4);
    renderRound(api);

    expect(await screen.findByRole("heading", { name: "This round was cancelled" })).toBeVisible();
    expect(screen.getByText("Camera and microphone stopped")).toBeVisible();
    expect(screen.queryByRole("button", { name: /continue/i })).not.toBeInTheDocument();
  });
});
