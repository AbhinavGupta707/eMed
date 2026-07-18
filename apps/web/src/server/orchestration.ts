import {
  AdaptiveEvidenceRouteSelectedPayloadSchema,
  CaptureQualityRejectedPayloadSchema,
  FollowUpAnsweredPayloadSchema,
  MedicationReviewSkippedPayloadSchema,
  MedicationObservationConfirmedPayloadSchema,
  MedicationLabelProposedPayloadSchema,
  PatientReportConfirmedPayloadSchema,
  VoiceBiomarkerAcceptedPayloadSchema,
  VoiceBiomarkerSkippedPayloadSchema,
  createAdaptiveEvidenceRouteSelectedEvent,
  createCaptureQualityRejectedEvent,
  createFollowUpAnsweredEvent,
  createMeasurementAcceptedEvent,
  createMedicationLabelProposedEvent,
  createMedicationObservationConfirmedEvent,
  createMedicationReviewSkippedEvent,
  createPatientReportConfirmedEvent,
  createVoiceBiomarkerAcceptedEvent,
  createVoiceBiomarkerQualityRejectedEvent,
  createVoiceBiomarkerSkippedEvent,
  createRoundStateChangedEvent
} from "@homerounds/audit";
import {
  AdaptiveSelectionInputSchema,
  CaptureQualitySchema,
  EvidenceModuleCandidateSchema,
  ConfirmedMedicationObservationFactSchema,
  MeasurementFactSchema,
  PatientReportSchema,
  ProtocolResultSchema,
  RoundSchema,
  VoiceBiomarkerAssessmentResultSchema,
  VoiceBiomarkerFactSchema,
  type ClinicalTask,
  type AdaptiveSelectionOutcome,
  type CaptureQuality,
  type DomainEvent,
  type EvidenceModuleCandidate,
  type ConfirmedMedicationObservationFact,
  type MedicationLabelExtractionOutcome,
  type MeasurementFact,
  type PatientReport,
  type ProtocolResult,
  type Round,
  type RoundState,
  type VoiceBiomarkerAssessmentResult,
  type VoiceBiomarkerFact
} from "@homerounds/contracts";
import { reduceRoundState } from "@homerounds/domain";
import { createConfirmedMedicationObservationFact } from "@homerounds/assessments";
import {
  AdaptiveSelectionService,
  createAdaptiveSelectionFallback,
  type AdaptiveSelectionAuthorityState,
  type AdaptiveSelectionProvider
} from "@homerounds/inference";
import type {
  HomeRoundsRepository,
  MeasurementFactRecord,
  VoiceBiomarkerFactRecord
} from "@homerounds/persistence";
import { planNextModule } from "@homerounds/planner";
import {
  ProtocolDefinitionSchema,
  evaluateProtocol,
  type ProtocolDefinition,
  type ProtocolEvaluationDecision,
  type ProtocolEvaluationInput
} from "@homerounds/protocols";
import { z } from "zod";

import { constantTimeEqual, deterministicUuid, hmac } from "./crypto";

export type OrchestrationErrorCode =
  | "round_not_found"
  | "round_conflict"
  | "patient_mismatch"
  | "stale_state"
  | "invalid_state"
  | "invalid_transition"
  | "snapshot_unavailable"
  | "assessment_attestation_invalid"
  | "assessment_provider_mismatch"
  | "measurement_conflict"
  | "report_missing"
  | "medication_confirmation_required"
  | "medication_proposal_missing"
  | "medication_fact_conflict"
  | "voice_biomarker_confirmation_required"
  | "voice_biomarker_fact_conflict";

export class OrchestrationError extends Error {
  constructor(
    readonly code: OrchestrationErrorCode,
    readonly retryable: boolean
  ) {
    super(`Round orchestration failed: ${code}`);
    this.name = "OrchestrationError";
  }
}

type IdFactory = () => string;

type CommonDependencies<TSnapshot, TFact> = {
  repository: HomeRoundsRepository<TSnapshot, TFact>;
  protocol: ProtocolDefinition;
  selectedProvider: "finger_ppg" | "vitallens";
  isSelectedProviderAvailable: () => Promise<boolean>;
  assessmentAttestationSecret: string;
  adaptiveSelectionProvider: AdaptiveSelectionProvider;
  adaptiveSelectionEnabled: boolean;
  medicationLabelEnabled: boolean;
  voiceBiomarkerEnabled: boolean;
  now?: () => string;
  createId?: IdFactory;
};

const AssessmentAttestationPayloadSchema = z
  .object({
    assessmentSessionId: z.uuid(),
    roundId: z.uuid(),
    patientId: z.string().min(1).max(120),
    provider: z.enum(["finger_ppg", "vitallens", "local_voice_features"]),
    expiresAt: z.iso.datetime()
  })
  .strict();

type AssessmentAttestationPayload = z.infer<typeof AssessmentAttestationPayloadSchema>;

export type ReportOrchestrationResult = {
  round: Round;
  next: "assessment_selected" | "emergency_closed" | "abstained_for_review";
  selectedModuleId: string | null;
  protocolResult: ProtocolResult | null;
  evidenceRoute: AdaptiveEvidenceRouteData;
};

export type AdaptiveEvidenceRouteData = {
  selection: AdaptiveSelectionOutcome | null;
  candidates: EvidenceModuleCandidate[];
  selectedModuleId: string | null;
  medicationConfirmed: boolean;
  medicationSkipped: boolean;
  voiceBiomarkerCompleted: boolean;
  voiceBiomarkerSkipped: boolean;
};

export type MedicationConfirmationResult = {
  round: Round;
  fact: ConfirmedMedicationObservationFact;
  persisted: true;
  duplicateSuppressed: boolean;
};

export type AssessmentStartResult = {
  round: Round;
  assessmentSessionId: string;
  provider: "finger_ppg" | "vitallens";
  attestation: string;
  expiresAt: string;
};

export type AssessmentSubmissionResult = {
  round: Round;
  measurement: MeasurementFact;
  decision: ProtocolEvaluationDecision;
};

export type VoiceBiomarkerSessionResult = {
  round: Round;
  assessmentSessionId: string;
  provider: "local_voice_features";
  attestation: string;
  expiresAt: string;
};

export type VoiceBiomarkerSubmissionResult = {
  round: Round;
  result: Exclude<VoiceBiomarkerAssessmentResult, { status: "unavailable" }>;
  evidenceRoute: AdaptiveEvidenceRouteData;
};

export type CaptureQualitySubmissionResult =
  | { round: Round; next: "retry"; protocolResult: null }
  | { round: Round; next: "abstained_for_review"; protocolResult: ProtocolResult };

export type FollowUpSubmissionResult = {
  round: Round;
  protocolResult: ProtocolResult;
};

function defaultNow(): string {
  return new Date().toISOString();
}

function defaultId(): string {
  return globalThis.crypto.randomUUID();
}

function sameMeasurement(left: MeasurementFact, right: MeasurementFact): boolean {
  return (
    JSON.stringify(MeasurementFactSchema.parse(left)) ===
    JSON.stringify(MeasurementFactSchema.parse(right))
  );
}

function sameVoiceBiomarkerFact(left: VoiceBiomarkerFact, right: VoiceBiomarkerFact): boolean {
  return (
    JSON.stringify(VoiceBiomarkerFactSchema.parse(left)) ===
    JSON.stringify(VoiceBiomarkerFactSchema.parse(right))
  );
}

function assertPassingVoiceBiomarkerPolicy(fact: VoiceBiomarkerFact): void {
  const quality = fact.quality;
  const features = fact.features;
  const completeFeatures = [
    features.medianFundamentalFrequencyHz,
    features.pitchVariabilitySemitones,
    features.jitterPercent,
    features.shimmerPercent,
    features.harmonicToNoiseRatioDb
  ].every((value) => value !== null);
  if (
    fact.durationMs < 6_000 ||
    fact.durationMs > 12_000 ||
    features.phonationDurationMs !== fact.durationMs ||
    quality.metrics.durationMs !== fact.durationMs ||
    quality.score < 0.7 ||
    quality.reasons.length > 0 ||
    quality.metrics.sampleRateHz < 8_000 ||
    quality.metrics.sampleRateHz > 192_000 ||
    quality.metrics.clippingFraction > 0.02 ||
    quality.metrics.voicedFraction < 0.6 ||
    quality.metrics.estimatedSnrDb === null ||
    quality.metrics.estimatedSnrDb < 10 ||
    !completeFeatures
  ) {
    throw new OrchestrationError("voice_biomarker_fact_conflict", false);
  }
}

function emptyEvidenceRoute(): AdaptiveEvidenceRouteData {
  return {
    selection: null,
    candidates: [],
    selectedModuleId: null,
    medicationConfirmed: false,
    medicationSkipped: false,
    voiceBiomarkerCompleted: false,
    voiceBiomarkerSkipped: false
  };
}

function evidenceModuleCandidates(input: {
  selectedProvider: "finger_ppg" | "vitallens";
  pulseAvailable: boolean;
  medicationLabelEnabled: boolean;
  voiceBiomarkerEnabled: boolean;
}): EvidenceModuleCandidate[] {
  return EvidenceModuleCandidateSchema.array()
    .min(1)
    .max(8)
    .parse([
      {
        id: `capture.${input.selectedProvider}.pulse`,
        kind: "pulse_capture",
        label:
          input.selectedProvider === "finger_ppg"
            ? "Quality-gated finger pulse check"
            : "Consent-based VitalLens pulse check",
        description:
          "A pulse estimate is accepted only when the deterministic capture-quality gate passes.",
        producesFactKeys: ["pulse_bpm"],
        availability: input.pulseAvailable
          ? { status: "available" }
          : { status: "unavailable", reason: "provider_unavailable" },
        estimatedBurdenSeconds: 30,
        deterministicRank: 0
      },
      {
        id: "medication.label.review",
        kind: "medication_label",
        label: "Medication label review",
        description:
          "Review a synthetic label image or enter visible fields as text, then explicitly confirm them.",
        producesFactKeys: ["medication_label_observation"],
        availability: input.medicationLabelEnabled
          ? { status: "available" }
          : { status: "unavailable", reason: "not_needed" },
        estimatedBurdenSeconds: 60,
        deterministicRank: 1
      },
      {
        id: "voice.local.baseline",
        kind: "voice_biomarker",
        label: "Optional research voice signal",
        description:
          "A short sustained vowel is analysed locally and accepted only when its quality gate passes.",
        producesFactKeys: ["voice_biomarker_observation"],
        availability: input.voiceBiomarkerEnabled
          ? { status: "available" }
          : { status: "unavailable", reason: "not_needed" },
        estimatedBurdenSeconds: 20,
        deterministicRank: 2
      }
    ]);
}

function selectedModuleFromOutcome(
  outcome: AdaptiveSelectionOutcome,
  deterministicFallbackModuleId: string
): string {
  if (outcome.status === "fallback") return outcome.selectedModuleId;
  return outcome.envelope.decision.decision === "select"
    ? outcome.envelope.decision.candidateModuleId
    : deterministicFallbackModuleId;
}

function boundedPatientContext(report: PatientReport): string {
  const structured = `Confirmed weakness: ${report.weakness}; confirmed palpitations: ${report.palpitations}.`;
  const narrative = report.note?.trim();
  return narrative ? `${structured} Confirmed narrative: ${narrative}`.slice(0, 240) : structured;
}

export class RoundOrchestrationService<TSnapshot, TFact> {
  readonly #repository: HomeRoundsRepository<TSnapshot, TFact>;
  readonly #protocol: ProtocolDefinition;
  readonly #selectedProvider: "finger_ppg" | "vitallens";
  readonly #isSelectedProviderAvailable: () => Promise<boolean>;
  readonly #attestationSecret: string;
  readonly #now: () => string;
  readonly #createId: IdFactory;
  readonly #adaptiveSelection: AdaptiveSelectionService;
  readonly #adaptiveSelectionEnabled: boolean;
  readonly #medicationLabelEnabled: boolean;
  readonly #voiceBiomarkerEnabled: boolean;

  constructor(dependencies: CommonDependencies<TSnapshot, TFact>) {
    this.#repository = dependencies.repository;
    this.#protocol = ProtocolDefinitionSchema.parse(dependencies.protocol);
    this.#selectedProvider = dependencies.selectedProvider;
    this.#isSelectedProviderAvailable = dependencies.isSelectedProviderAvailable;
    this.#attestationSecret = z.string().min(32).parse(dependencies.assessmentAttestationSecret);
    this.#now = dependencies.now ?? defaultNow;
    this.#createId = dependencies.createId ?? defaultId;
    this.#adaptiveSelectionEnabled = dependencies.adaptiveSelectionEnabled;
    this.#medicationLabelEnabled = dependencies.medicationLabelEnabled;
    this.#voiceBiomarkerEnabled = dependencies.voiceBiomarkerEnabled;
    this.#adaptiveSelection = new AdaptiveSelectionService({
      provider: dependencies.adaptiveSelectionProvider,
      readAuthorityState: (roundId, signal) => this.#readAdaptiveAuthorityState(roundId, signal)
    });
  }

  async createRound(input: {
    patientId: string;
    triggerId: string;
    purpose: string;
    protocolId: string;
    burdenSeconds: number;
    correlationId: string;
  }): Promise<{ round: Round; created: boolean }> {
    const occurredAt = this.#now();
    const id = deterministicUuid("round", input.patientId, input.triggerId);
    const candidate = RoundSchema.parse({
      id,
      patientId: input.patientId,
      state: "invited",
      stateVersion: 0,
      purpose: input.purpose,
      triggerId: input.triggerId,
      burdenSecondsRemaining: input.burdenSeconds,
      protocolId: input.protocolId,
      createdAt: occurredAt,
      updatedAt: occurredAt,
      closedAt: null
    });
    let created = false;
    try {
      await this.#repository.createRound(candidate);
      created = true;
    } catch {
      const existing = await this.#repository.getRound(id);
      if (
        !existing ||
        existing.patientId !== candidate.patientId ||
        existing.triggerId !== candidate.triggerId ||
        existing.protocolId !== candidate.protocolId ||
        existing.purpose !== candidate.purpose
      ) {
        throw new OrchestrationError("round_conflict", false);
      }
    }
    const round = (await this.#repository.getRound(id)) ?? candidate;
    await this.#ensureStandaloneEvent({
      eventId: deterministicUuid("round-created", id),
      type: "round_created",
      schemaVersion: 1,
      occurredAt: round.createdAt,
      actor: { kind: "system", id: "homerounds-trigger-service" },
      patientId: round.patientId,
      roundId: round.id,
      correlationId: input.correlationId,
      source: "system",
      payload: {
        triggerId: round.triggerId,
        protocolId: round.protocolId,
        syntheticDataOnly: true
      }
    });
    return { round, created };
  }

  async getRound(roundId: string): Promise<Round> {
    const round = await this.#repository.getRound(z.uuid().parse(roundId));
    if (!round) throw new OrchestrationError("round_not_found", false);
    return round;
  }

  async getEvidenceRoute(roundId: string): Promise<AdaptiveEvidenceRouteData> {
    const id = z.uuid().parse(roundId);
    const events = await this.#repository.listAuditEvents(id);
    const selectedRoutes = events
      .filter(({ type }) => type === "adaptive_evidence_route_selected")
      .map((event) => ({
        occurredAt: event.occurredAt,
        payload: AdaptiveEvidenceRouteSelectedPayloadSchema.safeParse(event.payload)
      }))
      .filter((entry) => entry.payload.success)
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
    const selected = selectedRoutes[0]?.payload;
    if (!selected?.success) return emptyEvidenceRoute();
    const medicationConfirmed = events
      .filter(({ type }) => type === "medication_observation_confirmed")
      .map(({ payload }) => MedicationObservationConfirmedPayloadSchema.safeParse(payload))
      .some((result) => result.success && result.data.fact.roundId === id);
    const medicationSkipped = events
      .filter(({ type }) => type === "medication_review_skipped")
      .map(({ payload }) => MedicationReviewSkippedPayloadSchema.safeParse(payload))
      .some((result) => result.success);
    const voiceBiomarkerCompleted = events
      .filter(({ type }) => type === "voice_biomarker_accepted")
      .map(({ payload }) => VoiceBiomarkerAcceptedPayloadSchema.safeParse(payload))
      .some((result) => result.success);
    const voiceBiomarkerSkipped = events
      .filter(({ type }) => type === "voice_biomarker_skipped")
      .map(({ payload }) => VoiceBiomarkerSkippedPayloadSchema.safeParse(payload))
      .some((result) => result.success);
    return {
      selection: selected.data.selection,
      candidates: selected.data.candidates,
      selectedModuleId: selected.data.selectedModuleId,
      medicationConfirmed,
      medicationSkipped,
      voiceBiomarkerCompleted,
      voiceBiomarkerSkipped
    };
  }

  async recordMedicationLabelProposal(input: {
    roundId: string;
    patientId: string;
    expectedStateVersion: number;
    outcome: MedicationLabelExtractionOutcome;
    correlationId: string;
  }): Promise<MedicationLabelExtractionOutcome> {
    if (input.outcome.status === "failed") return input.outcome;
    const round = await this.getRound(input.roundId);
    if (round.patientId !== input.patientId) {
      throw new OrchestrationError("patient_mismatch", false);
    }
    if (round.state !== "assessment_selected") {
      throw new OrchestrationError("invalid_state", false);
    }
    if (round.stateVersion !== input.expectedStateVersion) {
      throw new OrchestrationError("stale_state", true);
    }
    const route = await this.getEvidenceRoute(round.id);
    if (
      route.selectedModuleId !== "medication.label.review" ||
      route.medicationConfirmed ||
      route.medicationSkipped
    ) {
      throw new OrchestrationError("invalid_state", false);
    }
    const proposal = input.outcome.proposal;
    if (proposal.roundId !== round.id || proposal.stateVersion !== round.stateVersion) {
      throw new OrchestrationError("stale_state", true);
    }
    await this.#ensureStandaloneEvent(
      createMedicationLabelProposedEvent({
        eventId: deterministicUuid("medication-label-proposed", proposal.proposalId),
        occurredAt: proposal.provenance.attemptedAt,
        actor: { kind: "system", id: "homerounds-medication-label-extractor" },
        patientId: round.patientId,
        roundId: round.id,
        correlationId: input.correlationId,
        source: "system",
        proposal,
        explicitlyConfirmed: false,
        rawMediaStored: false,
        providerPayloadStored: false
      })
    );
    return input.outcome;
  }

  async confirmMedicationObservation(input: {
    roundId: string;
    patientId: string;
    expectedStateVersion: number;
    fact: ConfirmedMedicationObservationFact;
    actorId: string;
    correlationId: string;
  }): Promise<MedicationConfirmationResult> {
    const fact = ConfirmedMedicationObservationFactSchema.parse(input.fact);
    const round = await this.getRound(input.roundId);
    if (round.patientId !== input.patientId || fact.roundId !== round.id) {
      throw new OrchestrationError("patient_mismatch", false);
    }
    if (round.state !== "assessment_selected") {
      throw new OrchestrationError("invalid_state", false);
    }
    if (
      round.stateVersion !== input.expectedStateVersion ||
      fact.stateVersion !== round.stateVersion
    ) {
      throw new OrchestrationError("stale_state", true);
    }
    const route = await this.getEvidenceRoute(round.id);
    if (route.selectedModuleId !== "medication.label.review" || route.medicationSkipped) {
      throw new OrchestrationError("invalid_state", false);
    }
    const events = await this.#repository.listAuditEvents(round.id);
    const priorConfirmations = events
      .filter(({ type }) => type === "medication_observation_confirmed")
      .map(({ payload }) => MedicationObservationConfirmedPayloadSchema.safeParse(payload))
      .filter((result) => result.success)
      .map((result) => result.data.fact);
    const existing = priorConfirmations[0];
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(fact)) {
        throw new OrchestrationError("medication_fact_conflict", false);
      }
      return { round, fact, persisted: true, duplicateSuppressed: true };
    }

    let proposalVerified = false;
    let reconstructed: ConfirmedMedicationObservationFact | null;
    if (fact.source === "image_review") {
      const proposal = events
        .filter(({ type }) => type === "medication_label_proposed")
        .map(({ payload }) => MedicationLabelProposedPayloadSchema.safeParse(payload))
        .filter((result) => result.success)
        .map((result) => result.data.proposal)
        .find(({ proposalId }) => proposalId === fact.proposalId);
      if (!proposal) throw new OrchestrationError("medication_proposal_missing", false);
      reconstructed = createConfirmedMedicationObservationFact({
        source: "image_review",
        proposal,
        roundId: round.id,
        stateVersion: round.stateVersion,
        reviewItems: fact.reviewItems,
        explicitlyConfirmed: true,
        createId: () => fact.factId,
        now: () => fact.confirmedAt
      });
      proposalVerified = true;
    } else {
      reconstructed = createConfirmedMedicationObservationFact({
        source: "text_entry",
        roundId: round.id,
        stateVersion: round.stateVersion,
        reviewItems: fact.reviewItems,
        explicitlyConfirmed: true,
        createId: () => fact.factId,
        now: () => fact.confirmedAt
      });
    }
    if (!reconstructed || JSON.stringify(reconstructed) !== JSON.stringify(fact)) {
      throw new OrchestrationError("medication_fact_conflict", false);
    }
    await this.#ensureStandaloneEvent(
      createMedicationObservationConfirmedEvent({
        eventId: deterministicUuid("medication-observation-confirmed", fact.factId),
        occurredAt: fact.confirmedAt,
        actor: { kind: "patient", id: input.actorId },
        patientId: round.patientId,
        roundId: round.id,
        correlationId: input.correlationId,
        source: "patient_ui",
        fact,
        proposalVerified,
        rawMediaStored: false
      })
    );
    return { round, fact, persisted: true, duplicateSuppressed: false };
  }

  async transition(input: {
    roundId: string;
    patientId: string | null;
    to: RoundState;
    expectedStateVersion: number;
    actor: { kind: "patient" | "clinician" | "system"; id: string };
    source: "patient_ui" | "clinician_ui" | "system";
    correlationId: string;
    additionalEvents?: readonly DomainEvent[];
  }): Promise<Round> {
    const current = await this.getRound(input.roundId);
    if (input.patientId !== null && current.patientId !== input.patientId) {
      throw new OrchestrationError("patient_mismatch", false);
    }
    const occurredAt = this.#now();
    const reduced = reduceRoundState(current, {
      to: input.to,
      expectedStateVersion: input.expectedStateVersion,
      occurredAt
    });
    if (!reduced.ok) {
      throw new OrchestrationError(
        reduced.error.code === "stale_state_version" ? "stale_state" : "invalid_transition",
        reduced.error.code === "stale_state_version"
      );
    }
    const next = reduced.round;
    const event = createRoundStateChangedEvent({
      eventId: this.#createId(),
      occurredAt,
      actor: input.actor,
      patientId: next.patientId,
      roundId: next.id,
      correlationId: input.correlationId,
      source: input.source,
      before: current.state,
      after: next.state,
      beforeVersion: current.stateVersion,
      afterVersion: next.stateVersion
    });
    try {
      await this.#repository.updateRoundWithAudit(
        next,
        current.stateVersion,
        event,
        input.additionalEvents
      );
    } catch {
      throw new OrchestrationError("stale_state", true);
    }
    return next;
  }

  async submitReport(input: {
    roundId: string;
    patientId: string;
    report: PatientReport;
    expectedStateVersion: number;
    actorId: string;
    correlationId: string;
    signal?: AbortSignal;
  }): Promise<ReportOrchestrationResult> {
    const report = PatientReportSchema.strict().parse(input.report);
    const round = await this.getRound(input.roundId);
    if (round.patientId !== input.patientId || report.roundId !== round.id) {
      throw new OrchestrationError("patient_mismatch", false);
    }
    if (round.state !== "collecting_report") {
      throw new OrchestrationError("invalid_state", false);
    }
    if (round.stateVersion !== input.expectedStateVersion) {
      throw new OrchestrationError("stale_state", true);
    }

    const reportEvent = createPatientReportConfirmedEvent({
      eventId: deterministicUuid("report-confirmed", report.reportId),
      occurredAt: report.confirmedAt,
      actor: { kind: "patient", id: input.actorId },
      patientId: round.patientId,
      roundId: round.id,
      correlationId: input.correlationId,
      source: "patient_ui",
      reportId: report.reportId,
      weakness: report.weakness,
      palpitations: report.palpitations,
      redFlags: report.redFlags,
      inputMode: report.inputMode,
      confirmedAt: report.confirmedAt,
      freeTextStored: false
    });
    await this.#ensureStandaloneEvent(reportEvent);

    const initialDecision = evaluateProtocol(this.#protocol, {
      now: this.#now(),
      report,
      measurement: { status: "missing" },
      followUp: { status: "not_asked" },
      followUpQuestionsAsked: 0
    });
    const matchedRuleId =
      initialDecision.kind === "result"
        ? initialDecision.result.matchedRuleIds[0]
        : initialDecision.matchedRuleIds[0];
    const matchedRule = this.#protocol.rules.find(({ id }) => id === matchedRuleId);
    if (matchedRule?.stage === "red_flag" && initialDecision.kind === "result") {
      const to =
        initialDecision.result.outcome === "emergency_guidance"
          ? "emergency_closed"
          : "abstained_for_review";
      const nextRound = await this.transition({
        roundId: round.id,
        patientId: round.patientId,
        to,
        expectedStateVersion: round.stateVersion,
        actor: { kind: "system", id: "homerounds-red-flag-gate" },
        source: "system",
        correlationId: input.correlationId
      });
      return {
        round: nextRound,
        next: to,
        selectedModuleId: null,
        protocolResult: initialDecision.result,
        evidenceRoute: emptyEvidenceRoute()
      };
    }

    const available = await this.#isSelectedProviderAvailable();
    const plan = planNextModule({
      neededFactKeys: ["pulse_bpm"],
      burdenSecondsRemaining: round.burdenSecondsRemaining,
      followUpQuestionsAsked: 0,
      candidates: [
        {
          id: `capture.${this.#selectedProvider}.pulse`,
          kind: "pulse_capture",
          producesFactKey: "pulse_bpm",
          available,
          estimatedBurdenSeconds: 30,
          scoring: { informationGain: 90, reliability: 80, burdenCost: 15 }
        }
      ]
    });
    if (!plan.selected) {
      if (initialDecision.kind !== "result") {
        throw new OrchestrationError("invalid_state", false);
      }
      const nextRound = await this.transition({
        roundId: round.id,
        patientId: round.patientId,
        to: "abstained_for_review",
        expectedStateVersion: round.stateVersion,
        actor: { kind: "system", id: "homerounds-planner" },
        source: "system",
        correlationId: input.correlationId
      });
      return {
        round: nextRound,
        next: "abstained_for_review",
        selectedModuleId: null,
        protocolResult: initialDecision.result,
        evidenceRoute: emptyEvidenceRoute()
      };
    }
    const candidates = evidenceModuleCandidates({
      selectedProvider: this.#selectedProvider,
      pulseAvailable: available,
      medicationLabelEnabled: this.#medicationLabelEnabled,
      voiceBiomarkerEnabled: this.#voiceBiomarkerEnabled
    });
    const adaptiveInput = AdaptiveSelectionInputSchema.parse({
      contractVersion: "adaptive-selection.v1",
      roundId: round.id,
      stateVersion: round.stateVersion,
      syntheticDataOnly: true,
      redFlagGate: "clear",
      neededFactKeys: [
        "pulse_bpm",
        ...(this.#medicationLabelEnabled ? (["medication_label_observation"] as const) : []),
        ...(this.#voiceBiomarkerEnabled ? (["voice_biomarker_observation"] as const) : [])
      ],
      burdenSecondsRemaining: round.burdenSecondsRemaining,
      context: [
        {
          referenceId: "patient.report",
          summary: boundedPatientContext(report),
          factIds: [report.reportId]
        }
      ],
      candidates,
      deterministicFallbackModuleId: plan.selected.id
    });
    const signal = input.signal ?? new AbortController().signal;
    const selection = this.#adaptiveSelectionEnabled
      ? await this.#adaptiveSelection.select(adaptiveInput, signal)
      : createAdaptiveSelectionFallback(adaptiveInput, "disabled", null);
    const selectedModuleId = selectedModuleFromOutcome(selection, plan.selected.id);
    const routeEvent = createAdaptiveEvidenceRouteSelectedEvent({
      eventId: deterministicUuid("adaptive-route-selected", report.reportId),
      occurredAt: this.#now(),
      actor: { kind: "system", id: "homerounds-adaptive-selector" },
      patientId: round.patientId,
      roundId: round.id,
      correlationId: input.correlationId,
      source: "system",
      selection,
      candidates,
      selectedModuleId,
      deterministicAuthorityRetained: true,
      promptStored: false,
      providerPayloadStored: false
    });
    const nextRound = await this.transition({
      roundId: round.id,
      patientId: round.patientId,
      to: "assessment_selected",
      expectedStateVersion: round.stateVersion,
      actor: { kind: "system", id: "homerounds-planner" },
      source: "system",
      correlationId: input.correlationId,
      additionalEvents: [routeEvent]
    });
    return {
      round: nextRound,
      next: "assessment_selected",
      selectedModuleId,
      protocolResult: null,
      evidenceRoute: {
        selection,
        candidates,
        selectedModuleId,
        medicationConfirmed: false,
        medicationSkipped: false,
        voiceBiomarkerCompleted: false,
        voiceBiomarkerSkipped: false
      }
    };
  }

  async getLatestVoiceBiomarkerFact(roundId: string): Promise<VoiceBiomarkerFact | null> {
    const facts = await this.#repository.listVoiceBiomarkerFacts(z.uuid().parse(roundId));
    return (
      [...facts].sort((left, right) => right.fact.observedAt.localeCompare(left.fact.observedAt))[0]
        ?.fact ?? null
    );
  }

  async startVoiceBiomarker(input: {
    roundId: string;
    patientId: string;
    expectedStateVersion: number;
    assessmentSessionId?: string;
  }): Promise<VoiceBiomarkerSessionResult> {
    const round = await this.getRound(input.roundId);
    if (round.patientId !== input.patientId) {
      throw new OrchestrationError("patient_mismatch", false);
    }
    if (round.state !== "assessment_selected") {
      throw new OrchestrationError("invalid_state", false);
    }
    if (round.stateVersion !== input.expectedStateVersion) {
      throw new OrchestrationError("stale_state", true);
    }
    const route = await this.getEvidenceRoute(round.id);
    if (
      !this.#voiceBiomarkerEnabled ||
      route.selectedModuleId !== "voice.local.baseline" ||
      route.voiceBiomarkerCompleted ||
      route.voiceBiomarkerSkipped
    ) {
      throw new OrchestrationError("invalid_state", false);
    }
    const assessmentSessionId = z.uuid().parse(input.assessmentSessionId ?? this.#createId());
    const expiresAt = new Date(Date.parse(this.#now()) + 5 * 60_000).toISOString();
    const payload = AssessmentAttestationPayloadSchema.parse({
      assessmentSessionId,
      roundId: round.id,
      patientId: round.patientId,
      provider: "local_voice_features",
      expiresAt
    });
    return {
      round,
      assessmentSessionId,
      provider: "local_voice_features",
      attestation: this.#signAttestation(payload),
      expiresAt
    };
  }

  async submitVoiceBiomarker(input: {
    roundId: string;
    patientId: string;
    expectedStateVersion: number;
    result: Exclude<VoiceBiomarkerAssessmentResult, { status: "unavailable" }>;
    attestation: string;
    actorId: string;
    correlationId: string;
  }): Promise<VoiceBiomarkerSubmissionResult> {
    const parsed = VoiceBiomarkerAssessmentResultSchema.parse(input.result);
    if (parsed.status === "unavailable") {
      throw new OrchestrationError("invalid_state", false);
    }
    const round = await this.getRound(input.roundId);
    if (round.patientId !== input.patientId || round.state !== "assessment_selected") {
      throw new OrchestrationError(
        round.patientId !== input.patientId ? "patient_mismatch" : "invalid_state",
        false
      );
    }
    const route = await this.getEvidenceRoute(round.id);
    if (route.selectedModuleId !== "voice.local.baseline" || route.voiceBiomarkerSkipped) {
      throw new OrchestrationError("invalid_state", false);
    }

    if (parsed.status === "completed") {
      const fact = VoiceBiomarkerFactSchema.parse(parsed.fact);
      const existingFacts = await this.#repository.listVoiceBiomarkerFacts(round.id);
      const existing = existingFacts.find(
        ({ fact: candidate }) =>
          candidate.factId === fact.factId ||
          candidate.assessmentSessionId === fact.assessmentSessionId
      );
      if (route.voiceBiomarkerCompleted && !existing) {
        throw new OrchestrationError("voice_biomarker_fact_conflict", false);
      }
      const attestation = this.#verifyAttestation(input.attestation, existing !== undefined);
      if (
        fact.roundId !== round.id ||
        attestation.roundId !== round.id ||
        attestation.patientId !== round.patientId ||
        attestation.assessmentSessionId !== fact.assessmentSessionId ||
        attestation.provider !== "local_voice_features" ||
        fact.provider !== attestation.provider
      ) {
        throw new OrchestrationError("assessment_attestation_invalid", false);
      }
      if (round.stateVersion !== input.expectedStateVersion && !existing) {
        throw new OrchestrationError("stale_state", true);
      }
      if (existing && !sameVoiceBiomarkerFact(existing.fact, fact)) {
        throw new OrchestrationError("voice_biomarker_fact_conflict", false);
      }
      assertPassingVoiceBiomarkerPolicy(fact);
      if (!existing) {
        const record: VoiceBiomarkerFactRecord = {
          roundId: round.id,
          patientId: round.patientId,
          fact
        };
        await this.#repository.saveVoiceBiomarkerFact(record);
      }
      await this.#ensureStandaloneEvent(
        createVoiceBiomarkerAcceptedEvent({
          eventId: deterministicUuid("voice-biomarker-accepted", fact.factId),
          occurredAt: fact.observedAt,
          actor: { kind: "patient", id: input.actorId },
          patientId: round.patientId,
          roundId: round.id,
          correlationId: input.correlationId,
          source: "patient_ui",
          factId: fact.factId,
          assessmentSessionId: fact.assessmentSessionId,
          provider: "local_voice_features",
          qualityStatus: "pass",
          researchOnly: true,
          rawMediaStored: false
        })
      );
    } else {
      if (round.stateVersion !== input.expectedStateVersion || route.voiceBiomarkerCompleted) {
        throw new OrchestrationError("stale_state", true);
      }
      const attestation = this.#verifyAttestation(input.attestation, false);
      if (
        attestation.roundId !== round.id ||
        attestation.patientId !== round.patientId ||
        attestation.provider !== "local_voice_features"
      ) {
        throw new OrchestrationError("assessment_attestation_invalid", false);
      }
      await this.#ensureStandaloneEvent(
        createVoiceBiomarkerQualityRejectedEvent({
          eventId: deterministicUuid(
            "voice-biomarker-quality",
            attestation.assessmentSessionId,
            parsed.status
          ),
          occurredAt: this.#now(),
          actor: { kind: "patient", id: input.actorId },
          patientId: round.patientId,
          roundId: round.id,
          correlationId: input.correlationId,
          source: "patient_ui",
          assessmentSessionId: attestation.assessmentSessionId,
          quality: parsed.quality,
          researchOnly: true,
          rawMediaStored: false
        })
      );
    }
    return {
      round,
      result: parsed,
      evidenceRoute: await this.getEvidenceRoute(round.id)
    };
  }

  async skipVoiceBiomarker(input: {
    roundId: string;
    patientId: string;
    expectedStateVersion: number;
    reason: "patient_declined" | "unsupported_device" | "permission_denied";
    actorId: string;
    correlationId: string;
  }): Promise<{ round: Round; evidenceRoute: AdaptiveEvidenceRouteData }> {
    const round = await this.getRound(input.roundId);
    if (round.patientId !== input.patientId) {
      throw new OrchestrationError("patient_mismatch", false);
    }
    if (round.state !== "assessment_selected") {
      throw new OrchestrationError("invalid_state", false);
    }
    if (round.stateVersion !== input.expectedStateVersion) {
      throw new OrchestrationError("stale_state", true);
    }
    const route = await this.getEvidenceRoute(round.id);
    if (route.selectedModuleId !== "voice.local.baseline" || route.voiceBiomarkerCompleted) {
      throw new OrchestrationError("invalid_state", false);
    }
    await this.#ensureStandaloneEvent(
      createVoiceBiomarkerSkippedEvent({
        eventId: deterministicUuid("voice-biomarker-skipped", round.id),
        occurredAt: this.#now(),
        actor: { kind: "patient", id: input.actorId },
        patientId: round.patientId,
        roundId: round.id,
        correlationId: input.correlationId,
        source: "patient_ui",
        reason: input.reason,
        deterministicAuthorityRetained: true,
        rawMediaStored: false
      })
    );
    return { round, evidenceRoute: await this.getEvidenceRoute(round.id) };
  }

  async startAssessment(input: {
    roundId: string;
    patientId: string;
    expectedStateVersion: number;
    skipMedicationReview: boolean;
    actorId: string;
    correlationId: string;
    assessmentSessionId?: string;
  }): Promise<AssessmentStartResult> {
    const round = await this.getRound(input.roundId);
    if (round.patientId !== input.patientId) {
      throw new OrchestrationError("patient_mismatch", false);
    }
    const resumableCompanionCapture =
      round.state === "capturing" && input.assessmentSessionId !== undefined;
    if (
      round.state !== "assessment_selected" &&
      round.state !== "capture_retry" &&
      !resumableCompanionCapture
    ) {
      throw new OrchestrationError("invalid_state", false);
    }
    if (resumableCompanionCapture && round.stateVersion !== input.expectedStateVersion) {
      throw new OrchestrationError("stale_state", true);
    }
    const evidenceRoute = await this.getEvidenceRoute(round.id);
    const medicationReviewPending =
      round.state === "assessment_selected" &&
      evidenceRoute.selectedModuleId === "medication.label.review" &&
      !evidenceRoute.medicationConfirmed &&
      !evidenceRoute.medicationSkipped;
    const voiceBiomarkerPending =
      round.state === "assessment_selected" &&
      evidenceRoute.selectedModuleId === "voice.local.baseline" &&
      !evidenceRoute.voiceBiomarkerCompleted &&
      !evidenceRoute.voiceBiomarkerSkipped;
    if (medicationReviewPending && !input.skipMedicationReview) {
      throw new OrchestrationError("medication_confirmation_required", false);
    }
    if (input.skipMedicationReview && !medicationReviewPending) {
      throw new OrchestrationError("invalid_state", false);
    }
    if (voiceBiomarkerPending) {
      throw new OrchestrationError("voice_biomarker_confirmation_required", false);
    }
    const skipEvent = input.skipMedicationReview
      ? createMedicationReviewSkippedEvent({
          eventId: deterministicUuid("medication-review-skipped", round.id),
          occurredAt: this.#now(),
          actor: { kind: "patient", id: input.actorId },
          patientId: round.patientId,
          roundId: round.id,
          correlationId: input.correlationId,
          source: "patient_ui",
          reason: "patient_declined",
          deterministicAuthorityRetained: true,
          rawMediaStored: false
        })
      : undefined;
    const assessmentSessionId = z.uuid().parse(input.assessmentSessionId ?? this.#createId());
    const expiresAt = new Date(Date.parse(this.#now()) + 5 * 60_000).toISOString();
    const nextRound = resumableCompanionCapture
      ? round
      : await this.transition({
          roundId: round.id,
          patientId: round.patientId,
          to: "capturing",
          expectedStateVersion: input.expectedStateVersion,
          actor: { kind: "patient", id: input.actorId },
          source: "patient_ui",
          correlationId: input.correlationId,
          ...(skipEvent ? { additionalEvents: [skipEvent] } : {})
        });
    const payload = AssessmentAttestationPayloadSchema.parse({
      assessmentSessionId,
      roundId: round.id,
      patientId: round.patientId,
      provider: this.#selectedProvider,
      expiresAt
    });
    return {
      round: nextRound,
      assessmentSessionId,
      provider: this.#selectedProvider,
      attestation: this.#signAttestation(payload),
      expiresAt
    };
  }

  async submitAssessment(input: {
    roundId: string;
    patientId: string;
    expectedStateVersion: number;
    measurement: MeasurementFact;
    attestation: string;
    actorId: string;
    correlationId: string;
  }): Promise<AssessmentSubmissionResult> {
    const measurement = MeasurementFactSchema.strict().parse(input.measurement);
    let round = await this.getRound(input.roundId);
    if (round.patientId !== input.patientId) {
      throw new OrchestrationError("patient_mismatch", false);
    }
    const existingMeasurements = await this.#repository.listMeasurementFacts(round.id);
    const existing = existingMeasurements.find(
      ({ fact }) =>
        fact.factId === measurement.factId ||
        fact.assessmentSessionId === measurement.assessmentSessionId
    );
    const attestation = this.#verifyAttestation(input.attestation, existing !== undefined);
    if (
      attestation.roundId !== round.id ||
      attestation.patientId !== round.patientId ||
      attestation.assessmentSessionId !== measurement.assessmentSessionId
    ) {
      throw new OrchestrationError("assessment_attestation_invalid", false);
    }
    if (
      attestation.provider !== this.#selectedProvider ||
      measurement.provider !== attestation.provider
    ) {
      throw new OrchestrationError("assessment_provider_mismatch", false);
    }
    if (round.stateVersion !== input.expectedStateVersion && !existing) {
      throw new OrchestrationError("stale_state", true);
    }
    if (existing && !sameMeasurement(existing.fact, measurement)) {
      throw new OrchestrationError("measurement_conflict", false);
    }
    if (!existing) {
      if (round.state !== "capturing") throw new OrchestrationError("invalid_state", false);
      const record: MeasurementFactRecord = {
        roundId: round.id,
        patientId: round.patientId,
        fact: measurement
      };
      await this.#repository.saveMeasurementFact(record);
    }
    await this.#ensureStandaloneEvent(
      createMeasurementAcceptedEvent({
        eventId: deterministicUuid("measurement-accepted", measurement.factId),
        occurredAt: measurement.observedAt,
        actor: { kind: "patient", id: input.actorId },
        patientId: round.patientId,
        roundId: round.id,
        correlationId: input.correlationId,
        source: "patient_ui",
        factId: measurement.factId,
        assessmentSessionId: measurement.assessmentSessionId,
        provider: measurement.provider,
        unit: measurement.unit,
        qualityStatus: "pass",
        rawMediaStored: false
      })
    );
    if (round.state === "capturing") {
      round = await this.transition({
        roundId: round.id,
        patientId: round.patientId,
        to: "assessment_complete",
        expectedStateVersion: round.stateVersion,
        actor: { kind: "system", id: "homerounds-quality-gate" },
        source: "system",
        correlationId: input.correlationId
      });
    }

    const report = await this.#confirmedReport(round.id);
    const decision = evaluateProtocol(this.#protocol, {
      now: this.#now(),
      report,
      measurement: { status: "present", fact: measurement },
      followUp: { status: "not_asked" },
      followUpQuestionsAsked: 0
    });
    if (decision.kind === "follow_up_required") {
      if (round.state === "assessment_complete") {
        round = await this.transition({
          roundId: round.id,
          patientId: round.patientId,
          to: "follow_up_selected",
          expectedStateVersion: round.stateVersion,
          actor: { kind: "system", id: "homerounds-protocol-evaluator" },
          source: "system",
          correlationId: input.correlationId
        });
      }
      if (round.state !== "follow_up_selected") {
        throw new OrchestrationError("invalid_state", false);
      }
      return { round, measurement, decision };
    }

    const result = ProtocolResultSchema.parse(decision.result);
    if (result.outcome === "emergency_guidance") {
      throw new OrchestrationError("invalid_state", false);
    }
    if (result.outcome === "abstain_for_review") {
      if (round.state === "assessment_complete") {
        round = await this.transition({
          roundId: round.id,
          patientId: round.patientId,
          to: "abstained_for_review",
          expectedStateVersion: round.stateVersion,
          actor: { kind: "system", id: "homerounds-protocol-evaluator" },
          source: "system",
          correlationId: input.correlationId
        });
      }
      return { round, measurement, decision };
    }

    if (round.state === "assessment_complete") {
      round = await this.#systemTransition(round, "protocol_ready", input.correlationId);
    }
    if (round.state === "protocol_ready") {
      round = await this.#systemTransition(round, "protocol_decided", input.correlationId);
    }
    if (round.state === "protocol_decided") {
      round = await this.#systemTransition(round, "action_pending", input.correlationId);
    }
    if (round.state !== "action_pending") {
      throw new OrchestrationError("invalid_state", false);
    }
    return { round, measurement, decision };
  }

  async submitCaptureQuality(input: {
    roundId: string;
    patientId: string;
    expectedStateVersion: number;
    assessmentSessionId: string;
    provider: "finger_ppg" | "vitallens";
    quality: CaptureQuality;
    attestation: string;
    actorId: string;
    correlationId: string;
  }): Promise<CaptureQualitySubmissionResult> {
    const quality = CaptureQualitySchema.strict()
      .refine(({ status }) => status !== "pass", {
        message: "a rejected capture cannot have passing quality"
      })
      .parse(input.quality);
    const round = await this.getRound(input.roundId);
    if (round.patientId !== input.patientId) {
      throw new OrchestrationError("patient_mismatch", false);
    }
    if (round.stateVersion !== input.expectedStateVersion) {
      throw new OrchestrationError("stale_state", true);
    }
    if (round.state !== "capturing") {
      throw new OrchestrationError("invalid_state", false);
    }
    const attestation = this.#verifyAttestation(input.attestation, false);
    if (
      attestation.roundId !== round.id ||
      attestation.patientId !== round.patientId ||
      attestation.assessmentSessionId !== input.assessmentSessionId
    ) {
      throw new OrchestrationError("assessment_attestation_invalid", false);
    }
    if (attestation.provider !== input.provider || input.provider !== this.#selectedProvider) {
      throw new OrchestrationError("assessment_provider_mismatch", false);
    }

    const occurredAt = this.#now();
    const qualityEvent = createCaptureQualityRejectedEvent({
      eventId: deterministicUuid(
        "capture-quality-rejected",
        round.id,
        input.assessmentSessionId,
        quality.status
      ),
      occurredAt,
      actor: { kind: "patient", id: input.actorId },
      patientId: round.patientId,
      roundId: round.id,
      correlationId: input.correlationId,
      source: "patient_ui",
      assessmentSessionId: input.assessmentSessionId,
      provider: input.provider,
      quality,
      rawMediaStored: false
    });

    const priorRetryRecorded = (await this.#repository.listAuditEvents(round.id))
      .filter(({ type }) => type === "capture_quality_rejected")
      .map(({ payload }) => CaptureQualityRejectedPayloadSchema.safeParse(payload))
      .some((payload) => payload.success && payload.data.quality.status === "retry");

    if (quality.status === "retry" && !priorRetryRecorded) {
      return {
        round: await this.transition({
          roundId: round.id,
          patientId: round.patientId,
          to: "capture_retry",
          expectedStateVersion: round.stateVersion,
          actor: { kind: "system", id: "homerounds-quality-gate" },
          source: "system",
          correlationId: input.correlationId,
          additionalEvents: [qualityEvent]
        }),
        next: "retry",
        protocolResult: null
      };
    }

    const decision = evaluateProtocol(this.#protocol, {
      now: occurredAt,
      report: await this.#confirmedReport(round.id),
      measurement: { status: "quality_failed", quality },
      followUp: { status: "not_asked" },
      followUpQuestionsAsked: 0
    });
    if (decision.kind !== "result" || decision.result.outcome !== "abstain_for_review") {
      throw new OrchestrationError("round_conflict", false);
    }
    return {
      round: await this.transition({
        roundId: round.id,
        patientId: round.patientId,
        to: "abstained_for_review",
        expectedStateVersion: round.stateVersion,
        actor: { kind: "system", id: "homerounds-quality-gate" },
        source: "system",
        correlationId: input.correlationId,
        additionalEvents: [qualityEvent]
      }),
      next: "abstained_for_review",
      protocolResult: ProtocolResultSchema.parse(decision.result)
    };
  }

  async submitFollowUp(input: {
    roundId: string;
    patientId: string;
    expectedStateVersion: number;
    questionId: string;
    answer: "yes" | "no" | "unsure";
    answeredAt: string;
    actorId: string;
    correlationId: string;
  }): Promise<FollowUpSubmissionResult> {
    let round = await this.getRound(input.roundId);
    if (round.patientId !== input.patientId) {
      throw new OrchestrationError("patient_mismatch", false);
    }
    if (round.state !== "follow_up_selected") {
      throw new OrchestrationError("invalid_state", false);
    }
    if (round.stateVersion !== input.expectedStateVersion) {
      throw new OrchestrationError("stale_state", true);
    }
    const question = this.#protocol.questions.find(({ id }) => id === input.questionId);
    if (!question) throw new OrchestrationError("round_conflict", false);
    const measurement = await this.#measurementEvidence(round.id);
    if (measurement.status !== "present") {
      throw new OrchestrationError("measurement_conflict", false);
    }
    const decision = evaluateProtocol(this.#protocol, {
      now: this.#now(),
      report: await this.#confirmedReport(round.id),
      measurement,
      followUp: {
        status: "answered",
        questionId: question.id,
        answer: input.answer
      },
      followUpQuestionsAsked: 1
    });
    if (decision.kind !== "result") {
      throw new OrchestrationError("round_conflict", false);
    }
    const result = ProtocolResultSchema.parse(decision.result);
    const occurredAt = this.#now();
    round = await this.transition({
      roundId: round.id,
      patientId: round.patientId,
      to: "protocol_ready",
      expectedStateVersion: round.stateVersion,
      actor: { kind: "system", id: "homerounds-protocol-evaluator" },
      source: "system",
      correlationId: input.correlationId,
      additionalEvents: [
        createFollowUpAnsweredEvent({
          eventId: deterministicUuid("follow-up-answered", round.id, question.id),
          occurredAt,
          actor: { kind: "patient", id: input.actorId },
          patientId: round.patientId,
          roundId: round.id,
          correlationId: input.correlationId,
          source: "patient_ui",
          questionId: question.id,
          answer: input.answer,
          answeredAt: input.answeredAt
        })
      ]
    });
    if (result.outcome === "abstain_for_review") {
      round = await this.#systemTransition(round, "abstained_for_review", input.correlationId);
      return { round, protocolResult: result };
    }
    if (result.outcome !== "programme_review_requested") {
      throw new OrchestrationError("round_conflict", false);
    }
    round = await this.#systemTransition(round, "protocol_decided", input.correlationId);
    round = await this.#systemTransition(round, "action_pending", input.correlationId);
    return { round, protocolResult: result };
  }

  async listQueue(roundIds: readonly string[]): Promise<ClinicalQueueResult> {
    const ids = z.array(z.uuid()).min(1).max(50).parse(roundIds);
    const tasks = (
      await Promise.all(ids.map((roundId) => this.#repository.listTasksForRound(roundId)))
    )
      .flat()
      .sort(
        (left, right) =>
          ({ urgent_demo_only: 0, priority: 1, routine: 2 })[left.priority] -
            { urgent_demo_only: 0, priority: 1, routine: 2 }[right.priority] ||
          left.createdAt.localeCompare(right.createdAt) ||
          left.id.localeCompare(right.id)
      );
    return { tasks, scope: "requested_rounds" };
  }

  async getProtocolResult(roundId: string): Promise<ProtocolResult | null> {
    const round = await this.getRound(roundId);
    if (
      ![
        "action_pending",
        "abstained_for_review",
        "awaiting_clinician",
        "outcome_ready",
        "closed",
        "emergency_closed"
      ].includes(round.state)
    ) {
      return null;
    }
    const report = await this.#confirmedReport(round.id);
    const measurement = await this.#measurementEvidence(round.id);
    const followUp = await this.#followUpEvidence(round.id);
    const decision = evaluateProtocol(this.#protocol, {
      now: this.#now(),
      report,
      measurement,
      followUp,
      followUpQuestionsAsked: followUp.status === "not_asked" ? 0 : 1
    });
    return decision.kind === "result" ? ProtocolResultSchema.parse(decision.result) : null;
  }

  async assertProtocolResult(roundId: string, resultInput: ProtocolResult): Promise<void> {
    const expected = ProtocolResultSchema.parse(resultInput);
    const report = await this.#confirmedReport(roundId);
    const measurement = await this.#measurementEvidence(roundId);
    const followUp = await this.#followUpEvidence(roundId);
    const decision = evaluateProtocol(this.#protocol, {
      now: this.#now(),
      report,
      measurement,
      followUp,
      followUpQuestionsAsked: followUp.status === "not_asked" ? 0 : 1
    });
    if (
      decision.kind !== "result" ||
      JSON.stringify(ProtocolResultSchema.parse(decision.result)) !== JSON.stringify(expected)
    ) {
      throw new OrchestrationError("round_conflict", false);
    }
  }

  async #readAdaptiveAuthorityState(
    roundId: string,
    signal: AbortSignal
  ): Promise<AdaptiveSelectionAuthorityState | null> {
    if (signal.aborted) return null;
    const round = await this.#repository.getRound(roundId);
    if (!round || signal.aborted) return null;
    let redFlagGate: AdaptiveSelectionAuthorityState["redFlagGate"] = "uncertain";
    try {
      const report = await this.#confirmedReport(round.id);
      const decision = evaluateProtocol(this.#protocol, {
        now: this.#now(),
        report,
        measurement: { status: "missing" },
        followUp: { status: "not_asked" },
        followUpQuestionsAsked: 0
      });
      const matchedRuleId =
        decision.kind === "result" ? decision.result.matchedRuleIds[0] : decision.matchedRuleIds[0];
      const matchedRule = this.#protocol.rules.find(({ id }) => id === matchedRuleId);
      redFlagGate = matchedRule?.stage === "red_flag" ? "blocked" : "clear";
    } catch {
      redFlagGate = "uncertain";
    }
    return {
      roundId: round.id,
      stateVersion: round.stateVersion,
      syntheticDataOnly: true,
      redFlagGate
    };
  }

  async #systemTransition(round: Round, to: RoundState, correlationId: string): Promise<Round> {
    return this.transition({
      roundId: round.id,
      patientId: round.patientId,
      to,
      expectedStateVersion: round.stateVersion,
      actor: { kind: "system", id: "homerounds-orchestration-service" },
      source: "system",
      correlationId
    });
  }

  #signAttestation(payload: AssessmentAttestationPayload): string {
    const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    return `${encoded}.${hmac(encoded, this.#attestationSecret)}`;
  }

  #verifyAttestation(token: string, allowExpired: boolean): AssessmentAttestationPayload {
    const [encoded, signature, ...rest] = token.split(".");
    if (
      !encoded ||
      !signature ||
      rest.length > 0 ||
      !constantTimeEqual(signature, hmac(encoded, this.#attestationSecret))
    ) {
      throw new OrchestrationError("assessment_attestation_invalid", false);
    }
    try {
      const payload = AssessmentAttestationPayloadSchema.parse(
        JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as unknown
      );
      if (!allowExpired && Date.parse(payload.expiresAt) <= Date.parse(this.#now())) {
        throw new OrchestrationError("assessment_attestation_invalid", false);
      }
      return payload;
    } catch (error: unknown) {
      if (error instanceof OrchestrationError) throw error;
      throw new OrchestrationError("assessment_attestation_invalid", false);
    }
  }

  async #confirmedReport(roundId: string): Promise<PatientReport> {
    const events = await this.#repository.listAuditEvents(roundId);
    const reports = events
      .filter(({ type }) => type === "patient_report_confirmed")
      .map((event) => PatientReportConfirmedPayloadSchema.safeParse(event.payload))
      .filter((result) => result.success)
      .map((result) => result.data)
      .sort((left, right) => right.confirmedAt.localeCompare(left.confirmedAt));
    const report = reports[0];
    if (!report) throw new OrchestrationError("report_missing", false);
    return PatientReportSchema.parse({
      reportId: report.reportId,
      roundId,
      weakness: report.weakness,
      palpitations: report.palpitations,
      redFlags: report.redFlags,
      inputMode: report.inputMode,
      confirmedAt: report.confirmedAt
    });
  }

  async #measurementEvidence(roundId: string): Promise<ProtocolEvaluationInput["measurement"]> {
    const measurements = await this.#repository.listMeasurementFacts(roundId);
    const latest = [...measurements].sort((left, right) =>
      right.fact.observedAt.localeCompare(left.fact.observedAt)
    )[0];
    if (latest) return { status: "present", fact: latest.fact };
    const qualityFailures = (await this.#repository.listAuditEvents(roundId))
      .filter(({ type }) => type === "capture_quality_rejected")
      .map((event) => ({
        occurredAt: event.occurredAt,
        payload: CaptureQualityRejectedPayloadSchema.safeParse(event.payload)
      }))
      .filter((entry) => entry.payload.success)
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
    const latestFailure = qualityFailures[0];
    return latestFailure?.payload.success
      ? { status: "quality_failed", quality: latestFailure.payload.data.quality }
      : { status: "missing" };
  }

  async #followUpEvidence(roundId: string): Promise<ProtocolEvaluationInput["followUp"]> {
    const answers = (await this.#repository.listAuditEvents(roundId))
      .filter(({ type }) => type === "follow_up_answered")
      .map((event) => FollowUpAnsweredPayloadSchema.safeParse(event.payload))
      .filter((result) => result.success)
      .map((result) => result.data)
      .sort((left, right) => right.answeredAt.localeCompare(left.answeredAt));
    const latest = answers[0];
    return latest
      ? { status: "answered", questionId: latest.questionId, answer: latest.answer }
      : { status: "not_asked" };
  }

  async #ensureStandaloneEvent(event: DomainEvent): Promise<void> {
    const existing = (await this.#repository.listAuditEvents(event.roundId)).find(
      ({ eventId }) => eventId === event.eventId
    );
    if (existing) {
      if (
        existing.type !== event.type ||
        existing.patientId !== event.patientId ||
        existing.roundId !== event.roundId ||
        JSON.stringify(existing.payload) !== JSON.stringify(event.payload)
      ) {
        throw new OrchestrationError("round_conflict", false);
      }
      return;
    }
    await this.#repository.appendAuditEvent(event);
  }
}

export type ClinicalQueueResult = {
  tasks: ClinicalTask[];
  scope: "requested_rounds";
};
