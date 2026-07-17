import {
  HomeRoundsApiError,
  type CreateRoundRequest,
  type ExecuteActionRequest,
  type StartAssessmentRequest,
  type SubmitAssessmentRequest,
  type SubmitReportRequest,
  type TransitionRoundRequest
} from "@homerounds/api-client";
import {
  MeasurementFactSchema,
  PatientReportSchema,
  ProtocolResultSchema,
  RoundSchema,
  VoiceBiomarkerFactSchema,
  type CaptureQuality,
  type OpticalAssessmentProvider,
  type OpticalAssessmentResult,
  type PatientReport,
  type Round,
  type RoundState
} from "@homerounds/contracts";
import { describe, expect, it, vi } from "vitest";

import { SYNTHETIC_MAYA_ROUND } from "../shared-round/patient-round-config";
import type { RecordedCaptureReplay } from "../patient/recorded-capture-replay";
import {
  PatientWorkflowController,
  patientWorkflowView,
  type PatientRoundApi
} from "./patient-workflow-controller";

const ROUND_ID = "72621407-a788-4f4f-98c2-8991b1dc6f23";
const REPORT_ID = "f98766f5-c958-4595-9693-7e45ce858a83";
const SESSION_ID = "6c25c86f-e00a-451d-b9db-b69418742f9b";
const FACT_ID = "94976b68-3e69-4669-b490-21b9bd9379a4";
const TASK_ID = "91b412ba-37f0-4973-a9b2-21bc6c3413c8";
const NOW = "2026-07-17T10:00:00.000Z";

type AssessmentSessionResult = Awaited<ReturnType<PatientRoundApi["startAssessment"]>>;
type AssessmentSubmissionResult = Awaited<ReturnType<PatientRoundApi["submitAssessment"]>>;
type ActionResult = Awaited<ReturnType<PatientRoundApi["executeAction"]>>;
type EvidenceRoute = NonNullable<Awaited<ReturnType<PatientRoundApi["getRound"]>>["evidenceRoute"]>;

function makeRound(state: RoundState = "invited", stateVersion = 0): Round {
  return RoundSchema.parse({
    id: ROUND_ID,
    patientId: "synthetic-maya",
    state,
    stateVersion,
    purpose: SYNTHETIC_MAYA_ROUND.purpose,
    triggerId: SYNTHETIC_MAYA_ROUND.triggerId,
    burdenSecondsRemaining: 120,
    protocolId: "cardiometabolic_demo",
    createdAt: NOW,
    updatedAt: new Date(Date.parse(NOW) + stateVersion * 1_000).toISOString(),
    closedAt: ["closed", "emergency_closed", "abstained_for_review", "patient_declined"].includes(
      state
    )
      ? new Date(Date.parse(NOW) + stateVersion * 1_000).toISOString()
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

const abstainResult = ProtocolResultSchema.parse({
  protocolId: "cardiometabolic_demo",
  protocolVersion: "1.0.0",
  matchedRuleIds: ["measurement_quality_failed"],
  factIds: [REPORT_ID],
  outcome: "abstain_for_review",
  allowedActions: ["create_programme_task"],
  missingFactKeys: ["pulse_bpm"],
  explanationKey: "protocol.measurement.quality_failed"
});

const measurement = MeasurementFactSchema.parse({
  factId: FACT_ID,
  assessmentSessionId: SESSION_ID,
  provider: "finger_ppg",
  value: 104,
  unit: "bpm",
  observedAt: NOW,
  durationMs: 20_000,
  algorithmVersion: "finger_ppg_hr_v1",
  providerModelVersion: null,
  quality: { status: "pass", score: 0.92, reasons: [], metrics: { durationMs: 20_000 } },
  rawMediaRef: null
});

const voiceBiomarkerFact = VoiceBiomarkerFactSchema.parse({
  factId: "1b8c6cc8-a9bb-4eb0-92f5-b99c62a16954",
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

function makeReport(
  roundId: string,
  redFlags: PatientReport["redFlags"] = {
    chestPain: "no",
    severeBreathlessness: "no",
    fainted: "no"
  }
): PatientReport {
  return PatientReportSchema.parse({
    reportId: REPORT_ID,
    roundId,
    weakness: "mild",
    palpitations: "intermittent",
    redFlags,
    inputMode: "text",
    confirmedAt: NOW
  });
}

function nextRound(current: Round, state: RoundState): Round {
  return makeRound(state, current.stateVersion + 1);
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

const medicationEvidenceRoute = {
  selection: {
    status: "accepted" as const,
    envelope: {
      roundId: ROUND_ID,
      stateVersion: 2,
      decision: {
        decision: "select" as const,
        candidateModuleId: "medication.label.review",
        evidenceReferenceIds: ["patient.report"],
        rationale: "Review a synthetic label before continuing.",
        uncertainty: "medium" as const,
        missingInformation: []
      },
      provenance: {
        attemptId: "4d3f935c-4570-451e-a00f-65254e215949",
        provider: "fake" as const,
        task: "adaptive_module_selection" as const,
        modelAlias: "fake-adaptive-v1",
        contractVersion: "adaptive-selection.v1",
        attemptedAt: NOW,
        durationMs: 1,
        tokenUsage: null
      }
    }
  },
  candidates: [
    {
      id: "medication.label.review",
      kind: "medication_label" as const,
      label: "Medication label review",
      description: "Review visible synthetic label fields.",
      producesFactKeys: ["medication_label_observation" as const],
      availability: { status: "available" as const },
      estimatedBurdenSeconds: 60,
      deterministicRank: 1
    }
  ],
  selectedModuleId: "medication.label.review",
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

class FakeApi implements PatientRoundApi {
  round: Round;
  evidenceRoute: EvidenceRoute = emptyEvidenceRoute;
  protocolProjection: typeof programmeResult | typeof abstainResult | null = null;
  transitionOverride:
    ((roundId: string, input: TransitionRoundRequest) => Promise<{ round: Round }>) | null = null;
  assessmentDecision: AssessmentSubmissionResult["decision"] = {
    kind: "result",
    result: programmeResult
  };
  readonly calls = {
    createRound: vi.fn(),
    getRound: vi.fn(),
    transitionRound: vi.fn(),
    submitReport: vi.fn(),
    confirmMedicationObservation: vi.fn(),
    startVoiceBiomarker: vi.fn(),
    submitVoiceBiomarker: vi.fn(),
    skipVoiceBiomarker: vi.fn(),
    startAssessment: vi.fn(),
    submitAssessment: vi.fn(),
    submitCaptureQuality: vi.fn(),
    submitFollowUp: vi.fn(),
    executeAction: vi.fn()
  };

  constructor(round: Round = makeRound()) {
    this.round = round;
  }

  createRound(input: CreateRoundRequest): Promise<{ round: Round; created: boolean }> {
    this.calls.createRound(input);
    return Promise.resolve({ round: this.round, created: false });
  }

  getRound(roundId: string): Promise<{
    round: Round;
    protocolResult?: typeof programmeResult | typeof abstainResult | null;
  }> {
    this.calls.getRound(roundId);
    return Promise.resolve({
      round: this.round,
      protocolResult: this.protocolProjection,
      evidenceRoute: this.evidenceRoute
    });
  }

  transitionRound(roundId: string, input: TransitionRoundRequest): Promise<{ round: Round }> {
    this.calls.transitionRound(roundId, input);
    if (this.transitionOverride) return this.transitionOverride(roundId, input);
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
        evidenceRoute: emptyEvidenceRoute
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
    roundId: string,
    input: Parameters<PatientRoundApi["confirmMedicationObservation"]>[1]
  ): ReturnType<PatientRoundApi["confirmMedicationObservation"]> {
    this.calls.confirmMedicationObservation(roundId, input);
    this.evidenceRoute = { ...this.evidenceRoute, medicationConfirmed: true };
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
      expiresAt: "2026-07-17T10:05:00.000Z"
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
    return Promise.resolve({ round: this.round, evidenceRoute: this.evidenceRoute });
  }

  startAssessment(
    roundId: string,
    input: StartAssessmentRequest
  ): Promise<AssessmentSessionResult> {
    this.calls.startAssessment(roundId, input);
    if (input.skipMedicationReview) {
      this.evidenceRoute = { ...this.evidenceRoute, medicationSkipped: true };
    }
    this.round = nextRound(this.round, "capturing");
    return Promise.resolve({
      round: this.round,
      assessmentSessionId: SESSION_ID,
      provider: "finger_ppg",
      attestation: "synthetic-assessment-attestation-value-0001",
      expiresAt: "2026-07-17T10:05:00.000Z"
    });
  }

  submitAssessment(
    roundId: string,
    input: SubmitAssessmentRequest
  ): Promise<AssessmentSubmissionResult> {
    this.calls.submitAssessment(roundId, input);
    this.round = nextRound(
      this.round,
      this.assessmentDecision.kind === "result" ? "action_pending" : "follow_up_selected"
    );
    return Promise.resolve({
      round: this.round,
      measurement: input.measurement,
      decision: this.assessmentDecision
    });
  }

  submitCaptureQuality(
    roundId: string,
    input: Parameters<PatientRoundApi["submitCaptureQuality"]>[1]
  ): ReturnType<PatientRoundApi["submitCaptureQuality"]> {
    this.calls.submitCaptureQuality(roundId, input);
    const firstRetry =
      input.quality.status === "retry" && this.calls.submitCaptureQuality.mock.calls.length === 1;
    this.round = nextRound(this.round, firstRetry ? "capture_retry" : "abstained_for_review");
    return Promise.resolve(
      firstRetry
        ? { next: "retry", round: this.round, protocolResult: null }
        : { next: "abstained_for_review", round: this.round, protocolResult: abstainResult }
    );
  }

  submitFollowUp(
    roundId: string,
    input: Parameters<PatientRoundApi["submitFollowUp"]>[1]
  ): ReturnType<PatientRoundApi["submitFollowUp"]> {
    this.calls.submitFollowUp(roundId, input);
    this.round = nextRound(this.round, "action_pending");
    return Promise.resolve({ round: this.round, protocolResult: programmeResult });
  }

  executeAction(roundId: string, input: ExecuteActionRequest): Promise<ActionResult> {
    this.calls.executeAction(roundId, input);
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
        reasonKey: input.protocolResult.explanationKey,
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

class FakeProvider implements OpticalAssessmentProvider {
  readonly kind = "finger_ppg" as const;
  availability: Awaited<ReturnType<OpticalAssessmentProvider["checkAvailability"]>> = {
    available: true,
    capabilities: { camera: true }
  };
  readonly results: OpticalAssessmentResult[] = [];
  captureOverride: (() => Promise<OpticalAssessmentResult>) | null = null;
  disposeCount = 0;

  checkAvailability(): Promise<
    Awaited<ReturnType<OpticalAssessmentProvider["checkAvailability"]>>
  > {
    return Promise.resolve(this.availability);
  }

  capture(): Promise<OpticalAssessmentResult> {
    if (this.captureOverride) return this.captureOverride();
    const result = this.results.shift();
    if (!result) throw new Error("No fake capture result queued");
    return Promise.resolve(result);
  }

  dispose(): Promise<void> {
    this.disposeCount += 1;
    return Promise.resolve();
  }
}

function controllerFor(api: FakeApi, provider = new FakeProvider(), online = true) {
  const controller = new PatientWorkflowController({
    api,
    config: SYNTHETIC_MAYA_ROUND,
    createOpticalProvider: () => provider,
    now: () => NOW,
    isOnline: () => online
  });
  return { controller, provider };
}

const recordedReplay = {
  schemaVersion: 1,
  fixtureType: "recorded_valid_capture_replay",
  dataClassification: "synthetic_demo",
  label: "Recorded synthetic valid capture — demo recovery only",
  notClinicallyValidated: true,
  containsRawMedia: false,
  containsPatientData: false,
  automaticFallbackAllowed: false,
  usePolicy: {
    requiresDemoMode: true,
    requiresLiveCaptureFailure: true,
    requiresExplicitUserSelection: true,
    mustRemainVisiblyLabelled: true,
    mustNeverReplaceOrModifyLiveMeasurement: true
  },
  measurementPrototype: {
    provider: "finger_ppg",
    value: 78,
    unit: "bpm",
    durationMs: 20_000,
    algorithmVersion: "homerounds-finger-ppg-fixture-v1",
    providerModelVersion: null,
    quality: { status: "pass", score: 0.92, reasons: [], metrics: { fixtureReplay: 1 } },
    rawMediaRef: null
  },
  provenance: {
    source: "deterministic_synthetic_engineering_fixture",
    recordedAt: NOW,
    physicalDeviceEvidence: false,
    medicalDeviceValidation: false
  }
} satisfies RecordedCaptureReplay;

async function advanceToAssessment(controller: PatientWorkflowController): Promise<void> {
  await controller.initialise();
  await controller.startRound();
  await controller.submitConfirmedReport(makeReport(ROUND_ID));
}

function retryQuality(status: "retry" | "fail" = "retry"): CaptureQuality {
  return {
    status,
    score: 0.2,
    reasons: ["motion"],
    metrics: { motion: 0.9 }
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("patient workflow controller", () => {
  it("completes the quality-passing text path and creates one confirmed synthetic task", async () => {
    const api = new FakeApi();
    const { controller, provider } = controllerFor(api);
    provider.results.push({ status: "completed", measurement });

    await advanceToAssessment(controller);
    await controller.prepareMeasurement();
    await controller.captureMeasurement();

    expect(patientWorkflowView(controller.getSnapshot())).toBe("action_confirmation");
    expect(controller.getSnapshot().measurement?.value).toBe(104);
    expect(api.calls.submitAssessment).toHaveBeenCalledTimes(1);

    await controller.confirmAction();

    expect(patientWorkflowView(controller.getSnapshot())).toBe("outcome");
    expect(controller.getSnapshot().action).toMatchObject({
      kind: "programme_task",
      created: true
    });
    expect(api.calls.executeAction).toHaveBeenCalledTimes(1);
  });

  it("audits an explicit optional label-review skip before preparing the pulse provider", async () => {
    const api = new FakeApi();
    api.evidenceRoute = medicationEvidenceRoute;
    const { controller } = controllerFor(api);

    await advanceToAssessment(controller);
    expect(patientWorkflowView(controller.getSnapshot())).toBe("medication_review");

    await controller.skipMedicationReview();

    expect(api.calls.startAssessment).toHaveBeenCalledWith(ROUND_ID, {
      expectedStateVersion: 3,
      skipMedicationReview: true
    });
    expect(controller.getSnapshot().evidenceRoute).toMatchObject({
      medicationConfirmed: false,
      medicationSkipped: true
    });
    expect(controller.getSnapshot().round?.state).toBe("capturing");
    expect(patientWorkflowView(controller.getSnapshot())).toBe("measurement_ready");
  });

  it("requires the selected local voice station before opening the pulse workflow", async () => {
    const api = new FakeApi();
    api.evidenceRoute = voiceEvidenceRoute;
    const { controller } = controllerFor(api);

    await advanceToAssessment(controller);
    expect(patientWorkflowView(controller.getSnapshot())).toBe("voice_biomarker");
    expect(api.calls.startAssessment).not.toHaveBeenCalled();

    await controller.prepareVoiceBiomarker();
    expect(controller.getSnapshot().voiceBiomarkerSession?.assessmentSessionId).toBe(SESSION_ID);
    await controller.completeVoiceBiomarker(voiceBiomarkerFact);

    expect(api.calls.submitVoiceBiomarker).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().voiceBiomarkerFact?.rawMediaRef).toBeNull();
    expect(controller.getSnapshot().evidenceRoute.voiceBiomarkerCompleted).toBe(true);
    expect(patientWorkflowView(controller.getSnapshot())).toBe("measurement_prepare");

    await controller.prepareMeasurement();
    expect(api.calls.startAssessment).toHaveBeenCalledTimes(1);
  });

  it("records an explicit voice-station decline before allowing the pulse workflow", async () => {
    const api = new FakeApi();
    api.evidenceRoute = voiceEvidenceRoute;
    const { controller } = controllerFor(api);

    await advanceToAssessment(controller);
    await controller.skipVoiceBiomarker("patient_declined");

    expect(api.calls.skipVoiceBiomarker).toHaveBeenCalledWith(ROUND_ID, {
      expectedStateVersion: 3,
      reason: "patient_declined"
    });
    expect(controller.getSnapshot().voiceBiomarkerFact).toBeNull();
    expect(patientWorkflowView(controller.getSnapshot())).toBe("measurement_prepare");
  });

  it("hard-stops on a structured red flag before provider selection", async () => {
    const api = new FakeApi();
    const providerFactory = vi.fn(() => new FakeProvider());
    const controller = new PatientWorkflowController({
      api,
      config: SYNTHETIC_MAYA_ROUND,
      createOpticalProvider: providerFactory,
      now: () => NOW
    });
    await controller.initialise();
    await controller.startRound();
    await controller.submitConfirmedReport(
      makeReport(ROUND_ID, {
        chestPain: "yes",
        severeBreathlessness: "no",
        fainted: "no"
      })
    );

    expect(patientWorkflowView(controller.getSnapshot())).toBe("emergency");
    expect(controller.getSnapshot().protocolResult?.outcome).toBe("emergency_guidance");
    expect(providerFactory).not.toHaveBeenCalled();
    expect(api.calls.startAssessment).not.toHaveBeenCalled();
  });

  it.each([
    ["permission_denied", "permission_denied"],
    ["unsupported_device", "unsupported_device"],
    ["network_unavailable", "network"]
  ] as const)("maps %s camera availability without capture or fallback", async (reason, code) => {
    const api = new FakeApi();
    const { controller, provider } = controllerFor(api);
    provider.availability = { available: false, reason };
    await advanceToAssessment(controller);
    await controller.prepareMeasurement();

    expect(patientWorkflowView(controller.getSnapshot())).toBe("measurement_unavailable");
    expect(controller.getSnapshot().error?.code).toBe(code);
    expect(api.calls.submitAssessment).not.toHaveBeenCalled();
  });

  it("offers one poor-quality retry, then abstains without a numeric fact", async () => {
    const api = new FakeApi();
    const { controller, provider } = controllerFor(api);
    provider.results.push(
      { status: "retry", quality: { ...retryQuality(), status: "retry" } },
      { status: "failed", quality: { ...retryQuality("fail"), status: "fail" } }
    );
    await advanceToAssessment(controller);
    await controller.prepareMeasurement();
    await controller.captureMeasurement();

    expect(controller.getSnapshot().round?.state).toBe("capture_retry");
    expect(controller.getSnapshot().measurement).toBeNull();
    expect(controller.getSnapshot().assessmentSession).toBeNull();
    expect(patientWorkflowView(controller.getSnapshot())).toBe("capture_retry");

    await controller.retryMeasurement();
    expect(patientWorkflowView(controller.getSnapshot())).toBe("action_confirmation");
    expect(controller.getSnapshot().quality?.status).toBe("fail");
    expect(controller.getSnapshot().round?.state).toBe("abstained_for_review");
    expect(controller.getSnapshot().protocolResult?.outcome).toBe("abstain_for_review");
    expect(api.calls.submitCaptureQuality).toHaveBeenCalledTimes(2);
    expect(api.calls.submitAssessment).not.toHaveBeenCalled();

    await controller.confirmAction();
    expect(controller.getSnapshot().action).toMatchObject({ kind: "programme_task" });
    expect(controller.getSnapshot().measurement).toBeNull();
  });

  it("uses the labelled recorded capture only after an explicit retry-state selection", async () => {
    const api = new FakeApi();
    const provider = new FakeProvider();
    provider.results.push({
      status: "retry",
      quality: { ...retryQuality(), status: "retry" }
    });
    const controller = new PatientWorkflowController({
      api,
      config: SYNTHETIC_MAYA_ROUND,
      createOpticalProvider: () => provider,
      loadRecordedCaptureReplay: () => Promise.resolve(recordedReplay),
      createId: () => FACT_ID,
      now: () => NOW
    });
    await advanceToAssessment(controller);
    await controller.prepareMeasurement();
    await controller.captureMeasurement();

    expect(controller.getSnapshot().round?.state).toBe("capture_retry");
    expect(api.calls.submitAssessment).not.toHaveBeenCalled();

    await controller.useRecordedDemoCapture();

    expect(api.calls.startAssessment).toHaveBeenCalledTimes(2);
    expect(api.calls.submitAssessment).toHaveBeenCalledTimes(1);
    expect(api.calls.submitAssessment.mock.calls[0]?.[1]).toMatchObject({
      measurement: {
        value: 78,
        algorithmVersion: "homerounds-finger-ppg-fixture-v1",
        rawMediaRef: null
      }
    });
    expect(controller.getSnapshot().recordedReplayLabel).toMatch(/Recorded synthetic/i);
    expect(patientWorkflowView(controller.getSnapshot())).toBe("action_confirmation");
  });

  it("pauses safely when the protocol returns its one structured follow-up", async () => {
    const api = new FakeApi();
    api.assessmentDecision = {
      kind: "follow_up_required",
      protocolId: "cardiometabolic_demo",
      protocolVersion: "1.0.0",
      matchedRuleIds: ["normal_pulse_moderate_weakness_follow_up"],
      factIds: [REPORT_ID, FACT_ID],
      question: {
        id: "symptoms_worse_today",
        promptKey: "protocol.question.symptoms_worse_today",
        answerType: "yes_no_unsure"
      },
      explanationKey: "protocol.follow_up.required"
    };
    const { controller, provider } = controllerFor(api);
    provider.results.push({ status: "completed", measurement });
    await advanceToAssessment(controller);
    await controller.prepareMeasurement();
    await controller.captureMeasurement();

    expect(patientWorkflowView(controller.getSnapshot())).toBe("follow_up");
    await controller.answerFollowUp("yes");

    expect(controller.getSnapshot().followUpAnswer).toBe("yes");
    expect(controller.getSnapshot().error).toBeNull();
    expect(controller.getSnapshot().round?.state).toBe("action_pending");
    expect(controller.getSnapshot().protocolResult).toEqual(programmeResult);
    expect(patientWorkflowView(controller.getSnapshot())).toBe("action_confirmation");
    expect(api.calls.submitFollowUp).toHaveBeenCalledTimes(1);
    expect(api.calls.executeAction).not.toHaveBeenCalled();
  });

  it("rolls an optimistic transition back on a network failure", async () => {
    const api = new FakeApi();
    const pending = deferred<{ round: Round }>();
    api.transitionOverride = () => pending.promise;
    const { controller } = controllerFor(api);
    await controller.initialise();

    const transition = controller.startRound();
    expect(patientWorkflowView(controller.getSnapshot())).toBe("report");
    pending.reject(new TypeError("synthetic network failure"));
    await transition;

    expect(controller.getSnapshot().round?.state).toBe("invited");
    expect(controller.getSnapshot().optimisticRoundState).toBeNull();
    expect(controller.getSnapshot().error?.code).toBe("network");
  });

  it("reloads the latest round after a stale-state response", async () => {
    const api = new FakeApi();
    api.transitionOverride = () => {
      api.round = makeRound("red_flag_screen", 1);
      return Promise.reject(
        new HomeRoundsApiError({
          error: {
            code: "stale_state",
            userMessageKey: "api.error.stale_state",
            correlationId: "synthetic-correlation",
            issues: [],
            retryAfterSeconds: null
          }
        })
      );
    };
    const { controller } = controllerFor(api);
    await controller.initialise();
    await controller.startRound();

    expect(controller.getSnapshot().round?.state).toBe("red_flag_screen");
    expect(controller.getSnapshot().error?.code).toBe("stale_state");
    expect(api.calls.getRound).toHaveBeenCalledTimes(1);
  });

  it("restores persisted state without reusing ephemeral capture or protocol data", async () => {
    const api = new FakeApi(makeRound("capturing", 4));
    const { controller } = controllerFor(api);
    await controller.initialise();

    expect(patientWorkflowView(controller.getSnapshot())).toBe("resume_recovery");
    expect(controller.getSnapshot().assessmentSession).toBeNull();
    expect(controller.getSnapshot().protocolResult).toBeNull();
  });

  it("restores the server-projected deterministic result for an action-ready round", async () => {
    const api = new FakeApi(makeRound("action_pending", 5));
    api.protocolProjection = programmeResult;
    const { controller } = controllerFor(api);

    await controller.initialise();

    expect(api.calls.getRound).toHaveBeenCalledWith(ROUND_ID);
    expect(controller.getSnapshot().protocolResult).toEqual(programmeResult);
    expect(patientWorkflowView(controller.getSnapshot())).toBe("action_confirmation");
  });

  it("does not issue network calls while offline", async () => {
    const api = new FakeApi();
    const { controller } = controllerFor(api, new FakeProvider(), false);
    await controller.initialise();

    expect(controller.getSnapshot().error?.code).toBe("offline");
    expect(api.calls.createRound).not.toHaveBeenCalled();
  });

  it("ignores a late passing capture after page-hide cleanup", async () => {
    const api = new FakeApi();
    const { controller, provider } = controllerFor(api);
    const capture = deferred<OpticalAssessmentResult>();
    provider.captureOverride = () => capture.promise;
    await advanceToAssessment(controller);
    await controller.prepareMeasurement();

    const pendingCapture = controller.captureMeasurement();
    await controller.interrupt();
    capture.resolve({ status: "completed", measurement });
    await pendingCapture;

    expect(provider.disposeCount).toBe(1);
    expect(controller.getSnapshot().measurement).toBeNull();
    expect(api.calls.submitAssessment).not.toHaveBeenCalled();
  });

  it("times out an active capture into abstention with no measurement", async () => {
    const api = new FakeApi();
    const { controller, provider } = controllerFor(api);
    const capture = deferred<OpticalAssessmentResult>();
    provider.captureOverride = () => capture.promise;
    await advanceToAssessment(controller);
    await controller.prepareMeasurement();
    const pendingCapture = controller.captureMeasurement();

    await controller.timeout();
    capture.resolve({ status: "failed", quality: { ...retryQuality("fail"), status: "fail" } });
    await pendingCapture;

    expect(controller.getSnapshot().round?.state).toBe("abstained_for_review");
    expect(controller.getSnapshot().measurement).toBeNull();
    expect(controller.getSnapshot().error?.code).toBe("timeout");
  });
});
