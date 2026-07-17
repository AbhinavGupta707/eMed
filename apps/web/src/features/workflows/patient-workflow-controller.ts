import type { HomeRoundsApiClient } from "@homerounds/api-client";
import {
  PatientReportSchema,
  RedFlagAnswerSchema,
  type CaptureQuality,
  type MeasurementFact,
  type OpticalAssessmentProvider,
  type OpticalProviderKind,
  type OpticalUnavailableReason,
  type PatientReport,
  type ProtocolResult,
  type Round,
  type RoundState
} from "@homerounds/contracts";

import {
  mapPatientError,
  patientUiError,
  type PatientUiError
} from "../shared-round/error-mapping";
import {
  PatientRoundLaunchConfigSchema,
  type PatientRoundLaunchConfig
} from "../shared-round/patient-round-config";

export type PatientRoundApi = Pick<
  HomeRoundsApiClient,
  | "createRound"
  | "getRound"
  | "transitionRound"
  | "submitReport"
  | "startAssessment"
  | "submitAssessment"
  | "executeAction"
>;

type AssessmentSession = Awaited<ReturnType<PatientRoundApi["startAssessment"]>>;
type ProtocolDecision = Awaited<ReturnType<PatientRoundApi["submitAssessment"]>>["decision"];
type ActionResult = Awaited<ReturnType<PatientRoundApi["executeAction"]>>;
type ProviderAvailability = Awaited<ReturnType<OpticalAssessmentProvider["checkAvailability"]>>;

export type PatientWorkflowPending =
  | "loading"
  | "transition"
  | "submitting_report"
  | "preparing_camera"
  | "capturing"
  | "submitting_measurement"
  | "confirming_action"
  | "refreshing"
  | null;

export type PatientWorkflowState = Readonly<{
  round: Round | null;
  optimisticRoundState: RoundState | null;
  pending: PatientWorkflowPending;
  online: boolean;
  error: PatientUiError | null;
  assessmentSession: AssessmentSession | null;
  availability: ProviderAvailability | null;
  quality: CaptureQuality | null;
  measurement: MeasurementFact | null;
  decision: ProtocolDecision | null;
  protocolResult: ProtocolResult | null;
  action: ActionResult | null;
  followUpAnswer: "yes" | "no" | "unsure" | null;
  interrupted: boolean;
}>;

export type PatientWorkflowView =
  | "loading"
  | "invitation"
  | "report"
  | "measurement_prepare"
  | "measurement_ready"
  | "measurement_unavailable"
  | "capturing"
  | "capture_retry"
  | "follow_up"
  | "action_confirmation"
  | "emergency"
  | "processing"
  | "resume_recovery"
  | "outcome"
  | "cancelled";

export type OpticalProviderFactory = (kind: OpticalProviderKind) => OpticalAssessmentProvider;

export type PatientWorkflowDependencies = Readonly<{
  api: PatientRoundApi;
  config: PatientRoundLaunchConfig;
  createOpticalProvider: OpticalProviderFactory;
  now?: () => string;
  isOnline?: () => boolean;
}>;

const cancellableStates = new Set<RoundState>([
  "invited",
  "red_flag_screen",
  "collecting_report",
  "assessment_selected",
  "capturing",
  "capture_retry",
  "assessment_complete",
  "follow_up_selected"
]);

function defaultNow(): string {
  return new Date().toISOString();
}

function defaultOnline(): boolean {
  return typeof navigator === "undefined" || typeof navigator.onLine !== "boolean"
    ? true
    : navigator.onLine;
}

function unavailableError(reason: OpticalUnavailableReason): PatientUiError {
  switch (reason) {
    case "permission_denied":
      return patientUiError("permission_denied");
    case "unsupported_device":
      return patientUiError("unsupported_device");
    case "network_unavailable":
      return patientUiError("network");
    case "missing_configuration":
    case "provider_unavailable":
      return patientUiError("provider_unavailable");
  }
}

function effectiveRoundState(state: PatientWorkflowState): RoundState | null {
  return state.optimisticRoundState ?? state.round?.state ?? null;
}

export function patientWorkflowView(state: PatientWorkflowState): PatientWorkflowView {
  const roundState = effectiveRoundState(state);
  if (roundState === null) return "loading";
  if (state.action !== null) return "outcome";

  switch (roundState) {
    case "invited":
      return "invitation";
    case "red_flag_screen":
    case "collecting_report":
      return "report";
    case "assessment_selected":
      return "measurement_prepare";
    case "capturing":
      if (state.pending === "capturing" || state.pending === "submitting_measurement") {
        return "capturing";
      }
      if (state.quality?.status === "fail") return "capture_retry";
      if (state.assessmentSession === null) return "resume_recovery";
      if (state.availability?.available === false) return "measurement_unavailable";
      if (state.availability?.available === true) return "measurement_ready";
      return "processing";
    case "capture_retry":
      return state.assessmentSession === null ? "resume_recovery" : "capture_retry";
    case "assessment_complete":
    case "protocol_ready":
    case "protocol_decided":
      return "processing";
    case "follow_up_selected":
      return state.decision?.kind === "follow_up_required" ? "follow_up" : "resume_recovery";
    case "action_pending":
      return state.protocolResult === null ? "resume_recovery" : "action_confirmation";
    case "awaiting_clinician":
    case "outcome_ready":
    case "closed":
      return "outcome";
    case "emergency_closed":
      return "emergency";
    case "abstained_for_review":
      return state.protocolResult === null ? "outcome" : "action_confirmation";
    case "patient_declined":
      return "cancelled";
  }
}

export class PatientWorkflowController {
  readonly #api: PatientRoundApi;
  readonly #config: PatientRoundLaunchConfig;
  readonly #createOpticalProvider: OpticalProviderFactory;
  readonly #now: () => string;
  readonly #isOnline: () => boolean;
  readonly #listeners = new Set<() => void>();
  #state: PatientWorkflowState;
  #provider: OpticalAssessmentProvider | null = null;
  #captureAbort: AbortController | null = null;
  #captureGeneration = 0;
  #disposed = false;

  constructor(dependencies: PatientWorkflowDependencies) {
    this.#api = dependencies.api;
    this.#config = PatientRoundLaunchConfigSchema.parse(dependencies.config);
    this.#createOpticalProvider = dependencies.createOpticalProvider;
    this.#now = dependencies.now ?? defaultNow;
    this.#isOnline = dependencies.isOnline ?? defaultOnline;
    this.#state = {
      round: null,
      optimisticRoundState: null,
      pending: null,
      online: this.#isOnline(),
      error: null,
      assessmentSession: null,
      availability: null,
      quality: null,
      measurement: null,
      decision: null,
      protocolResult: null,
      action: null,
      followUpAnswer: null,
      interrupted: false
    };
  }

  getSnapshot = (): PatientWorkflowState => this.#state;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  setOnline(online: boolean): void {
    if (this.#disposed) return;
    this.#update({
      online,
      error: online
        ? this.#state.error?.code === "offline"
          ? null
          : this.#state.error
        : patientUiError("offline")
    });
  }

  async initialise(): Promise<void> {
    if (this.#disposed || this.#state.pending !== null) return;
    if (!this.#requireOnline()) return;
    this.#update({ pending: "loading", error: null });
    try {
      const result = await this.#api.createRound(this.#config);
      if (this.#disposed) return;
      this.#update({ round: result.round, pending: null, interrupted: false });
    } catch (error: unknown) {
      if (this.#disposed) return;
      this.#update({ pending: null, error: mapPatientError(error, this.#state.online) });
    }
  }

  async startRound(): Promise<void> {
    if (this.#state.round?.state !== "invited") return;
    await this.#transitionTo("red_flag_screen");
  }

  async submitConfirmedReport(reportInput: PatientReport): Promise<void> {
    const report = PatientReportSchema.strict().parse(reportInput);
    let round = this.#state.round;
    if (!round || report.roundId !== round.id || !this.#requireOnline()) return;
    if (round.state === "red_flag_screen") {
      round = await this.#transitionTo("collecting_report");
      if (!round) return;
    }
    if (round.state !== "collecting_report") return;

    const rollbackRound = round;
    this.#update({ pending: "submitting_report", error: null });
    try {
      const result = await this.#api.submitReport(round.id, {
        report,
        expectedStateVersion: round.stateVersion
      });
      if (this.#disposed) return;
      this.#update({
        round: result.round,
        pending: null,
        protocolResult: result.protocolResult,
        decision: null,
        optimisticRoundState: null
      });
    } catch (error: unknown) {
      await this.#failOperation(error, rollbackRound);
    }
  }

  async prepareMeasurement(): Promise<void> {
    const round = this.#state.round;
    if (!round || round.state !== "assessment_selected" || !this.#requireOnline()) return;
    this.#update({ pending: "preparing_camera", error: null, availability: null });
    try {
      const session = await this.#api.startAssessment(round.id, {
        expectedStateVersion: round.stateVersion
      });
      if (this.#disposed) return;
      await this.#disposeProvider();
      const provider = this.#createOpticalProvider(session.provider);
      this.#provider = provider;
      this.#update({ round: session.round, assessmentSession: session });
      const availability = await provider.checkAvailability();
      if (this.#disposed || provider !== this.#provider) return;
      this.#update({
        availability,
        pending: null,
        error: availability.available ? null : unavailableError(availability.reason)
      });
    } catch (error: unknown) {
      await this.#failOperation(error, round);
    }
  }

  async captureMeasurement(): Promise<void> {
    await this.#captureCurrentSession();
  }

  async retryMeasurement(): Promise<void> {
    const round = this.#state.round;
    if (!round || round.state !== "capture_retry") return;
    const capturing = await this.#transitionTo("capturing");
    if (!capturing) return;
    await this.#captureCurrentSession();
  }

  async continueWithoutMeasurement(): Promise<void> {
    const round = this.#state.round;
    if (
      !round ||
      ![
        "assessment_selected",
        "capturing",
        "capture_retry",
        "assessment_complete",
        "follow_up_selected"
      ].includes(round.state)
    ) {
      return;
    }
    this.#abortCapture();
    await this.#transitionTo("abstained_for_review");
  }

  answerFollowUp(answerInput: "yes" | "no" | "unsure"): void {
    const answer = RedFlagAnswerSchema.parse(answerInput);
    if (this.#state.decision?.kind !== "follow_up_required") return;
    this.#update({
      followUpAnswer: answer,
      error: patientUiError("follow_up_submission_unavailable")
    });
  }

  async confirmAction(): Promise<void> {
    const round = this.#state.round;
    const protocolResult = this.#state.protocolResult;
    if (!round || !protocolResult || !this.#requireOnline()) return;
    this.#update({ pending: "confirming_action", error: null });
    try {
      const action = await this.#api.executeAction(round.id, {
        expectedStateVersion: round.stateVersion,
        protocolResult,
        confirmation: { confirmed: true, confirmedAt: this.#now() }
      });
      if (this.#disposed) return;
      let refreshed = round;
      try {
        refreshed = (await this.#api.getRound(round.id)).round;
      } catch {
        // The action response is authoritative and sufficient for the outcome screen.
      }
      if (this.#disposed) return;
      this.#update({ action, round: refreshed, pending: null, optimisticRoundState: null });
    } catch (error: unknown) {
      await this.#failOperation(error, round);
    }
  }

  async refresh(): Promise<void> {
    const round = this.#state.round;
    if (!round) {
      await this.initialise();
      return;
    }
    if (!this.#requireOnline()) return;
    this.#abortCapture();
    await this.#disposeProvider();
    this.#update({ pending: "refreshing", error: null });
    try {
      const refreshed = await this.#api.getRound(round.id);
      if (this.#disposed) return;
      this.#update({
        round: refreshed.round,
        optimisticRoundState: null,
        pending: null,
        assessmentSession: null,
        availability: null,
        quality: null,
        measurement: null,
        decision: null,
        protocolResult: null,
        action: null,
        followUpAnswer: null,
        interrupted: false
      });
    } catch (error: unknown) {
      if (this.#disposed) return;
      this.#update({ pending: null, error: mapPatientError(error, this.#state.online) });
    }
  }

  async cancelRound(): Promise<void> {
    const round = this.#state.round;
    if (!round || !cancellableStates.has(round.state)) return;
    this.#abortCapture();
    await this.#transitionTo("patient_declined");
  }

  async timeout(): Promise<void> {
    const round = this.#state.round;
    if (!round) return;
    this.#abortCapture();
    if (["assessment_selected", "capturing", "capture_retry"].includes(round.state)) {
      await this.continueWithoutMeasurement();
    } else {
      await this.cancelRound();
    }
    if (!this.#disposed) this.#update({ error: patientUiError("timeout") });
  }

  async interrupt(): Promise<void> {
    if (this.#disposed) return;
    this.#abortCapture();
    await this.#disposeProvider();
    if (!this.#disposed) {
      this.#update({ pending: null, availability: null, interrupted: true });
    }
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#abortCapture();
    await this.#provider?.dispose().catch(() => undefined);
    this.#provider = null;
    this.#listeners.clear();
  }

  async #captureCurrentSession(): Promise<void> {
    const session = this.#state.assessmentSession;
    const round = this.#state.round;
    const provider = this.#provider;
    if (
      !session ||
      !round ||
      round.state !== "capturing" ||
      !provider ||
      this.#state.availability?.available !== true ||
      !this.#requireOnline()
    ) {
      return;
    }

    const generation = ++this.#captureGeneration;
    const controller = new AbortController();
    this.#captureAbort = controller;
    this.#update({ pending: "capturing", error: null, quality: null });
    try {
      const result = await provider.capture({
        assessmentSessionId: session.assessmentSessionId,
        signal: controller.signal
      });
      if (!this.#captureIsCurrent(generation, provider)) return;
      this.#captureAbort = null;

      switch (result.status) {
        case "unavailable":
          this.#update({
            pending: null,
            availability: { available: false, reason: result.reason },
            error: unavailableError(result.reason)
          });
          return;
        case "retry": {
          const retryRound = await this.#transitionTo("capture_retry");
          if (retryRound) this.#update({ quality: result.quality, pending: null });
          return;
        }
        case "failed":
          this.#update({ quality: result.quality, pending: null });
          return;
        case "completed": {
          this.#update({ pending: "submitting_measurement" });
          const submitted = await this.#api.submitAssessment(round.id, {
            expectedStateVersion: round.stateVersion,
            measurement: result.measurement,
            attestation: session.attestation
          });
          if (!this.#captureIsCurrent(generation, provider)) return;
          this.#update({
            round: submitted.round,
            pending: null,
            measurement: submitted.measurement,
            quality: submitted.measurement.quality,
            decision: submitted.decision,
            protocolResult: submitted.decision.kind === "result" ? submitted.decision.result : null
          });
          return;
        }
      }
    } catch (error: unknown) {
      if (!this.#captureIsCurrent(generation, provider)) return;
      this.#captureAbort = null;
      await this.#failOperation(error, round);
    }
  }

  async #transitionTo(to: RoundState): Promise<Round | null> {
    const round = this.#state.round;
    if (!round || !this.#requireOnline()) return null;
    this.#update({ pending: "transition", optimisticRoundState: to, error: null });
    try {
      const result = await this.#api.transitionRound(round.id, {
        to,
        expectedStateVersion: round.stateVersion
      });
      if (this.#disposed) return null;
      this.#update({ round: result.round, pending: null, optimisticRoundState: null });
      return result.round;
    } catch (error: unknown) {
      await this.#failOperation(error, round);
      return null;
    }
  }

  async #failOperation(error: unknown, rollbackRound: Round): Promise<void> {
    if (this.#disposed) return;
    const mapped = mapPatientError(error, this.#state.online);
    if (mapped.code === "stale_state") {
      try {
        const latest = await this.#api.getRound(rollbackRound.id);
        if (this.#disposed) return;
        this.#update({
          round: latest.round,
          optimisticRoundState: null,
          pending: null,
          assessmentSession: null,
          availability: null,
          quality: null,
          measurement: null,
          decision: null,
          protocolResult: null,
          action: null,
          error: mapped
        });
        return;
      } catch {
        // Keep the last confirmed local round when even the recovery read fails.
      }
    }
    this.#update({
      round: rollbackRound,
      optimisticRoundState: null,
      pending: null,
      error: mapped
    });
  }

  #requireOnline(): boolean {
    const online = this.#isOnline();
    if (online !== this.#state.online) this.setOnline(online);
    if (online) return true;
    this.#update({ error: patientUiError("offline") });
    return false;
  }

  #abortCapture(): void {
    this.#captureGeneration += 1;
    this.#captureAbort?.abort();
    this.#captureAbort = null;
  }

  #captureIsCurrent(generation: number, provider: OpticalAssessmentProvider): boolean {
    return !this.#disposed && generation === this.#captureGeneration && provider === this.#provider;
  }

  async #disposeProvider(): Promise<void> {
    const provider = this.#provider;
    this.#provider = null;
    if (provider) await provider.dispose().catch(() => undefined);
  }

  #update(patch: Partial<PatientWorkflowState>): void {
    if (this.#disposed) return;
    this.#state = { ...this.#state, ...patch };
    for (const listener of this.#listeners) listener();
  }
}
