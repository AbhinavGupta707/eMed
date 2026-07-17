import {
  PatientReportConfirmedPayloadSchema,
  createMeasurementAcceptedEvent,
  createPatientReportConfirmedEvent,
  createRoundStateChangedEvent
} from "@homerounds/audit";
import {
  MeasurementFactSchema,
  PatientReportSchema,
  ProtocolResultSchema,
  RoundSchema,
  type ClinicalTask,
  type DomainEvent,
  type MeasurementFact,
  type PatientReport,
  type ProtocolResult,
  type Round,
  type RoundState
} from "@homerounds/contracts";
import { reduceRoundState } from "@homerounds/domain";
import type { HomeRoundsRepository, MeasurementFactRecord } from "@homerounds/persistence";
import { planNextModule } from "@homerounds/planner";
import {
  ProtocolDefinitionSchema,
  evaluateProtocol,
  type ProtocolDefinition,
  type ProtocolEvaluationDecision
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
  | "report_missing";

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
  now?: () => string;
  createId?: IdFactory;
};

const AssessmentAttestationPayloadSchema = z
  .object({
    assessmentSessionId: z.uuid(),
    roundId: z.uuid(),
    patientId: z.string().min(1).max(120),
    provider: z.enum(["finger_ppg", "vitallens"]),
    expiresAt: z.iso.datetime()
  })
  .strict();

type AssessmentAttestationPayload = z.infer<typeof AssessmentAttestationPayloadSchema>;

export type ReportOrchestrationResult = {
  round: Round;
  next: "assessment_selected" | "emergency_closed" | "abstained_for_review";
  selectedModuleId: string | null;
  protocolResult: ProtocolResult | null;
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

export class RoundOrchestrationService<TSnapshot, TFact> {
  readonly #repository: HomeRoundsRepository<TSnapshot, TFact>;
  readonly #protocol: ProtocolDefinition;
  readonly #selectedProvider: "finger_ppg" | "vitallens";
  readonly #isSelectedProviderAvailable: () => Promise<boolean>;
  readonly #attestationSecret: string;
  readonly #now: () => string;
  readonly #createId: IdFactory;

  constructor(dependencies: CommonDependencies<TSnapshot, TFact>) {
    this.#repository = dependencies.repository;
    this.#protocol = ProtocolDefinitionSchema.parse(dependencies.protocol);
    this.#selectedProvider = dependencies.selectedProvider;
    this.#isSelectedProviderAvailable = dependencies.isSelectedProviderAvailable;
    this.#attestationSecret = z.string().min(32).parse(dependencies.assessmentAttestationSecret);
    this.#now = dependencies.now ?? defaultNow;
    this.#createId = dependencies.createId ?? defaultId;
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

  async transition(input: {
    roundId: string;
    patientId: string | null;
    to: RoundState;
    expectedStateVersion: number;
    actor: { kind: "patient" | "clinician" | "system"; id: string };
    source: "patient_ui" | "clinician_ui" | "system";
    correlationId: string;
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
      await this.#repository.updateRoundWithAudit(next, current.stateVersion, event);
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
        protocolResult: initialDecision.result
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
        protocolResult: initialDecision.result
      };
    }
    const nextRound = await this.transition({
      roundId: round.id,
      patientId: round.patientId,
      to: "assessment_selected",
      expectedStateVersion: round.stateVersion,
      actor: { kind: "system", id: "homerounds-planner" },
      source: "system",
      correlationId: input.correlationId
    });
    return {
      round: nextRound,
      next: "assessment_selected",
      selectedModuleId: plan.selected.id,
      protocolResult: null
    };
  }

  async startAssessment(input: {
    roundId: string;
    patientId: string;
    expectedStateVersion: number;
    actorId: string;
    correlationId: string;
  }): Promise<AssessmentStartResult> {
    const round = await this.getRound(input.roundId);
    if (round.patientId !== input.patientId) {
      throw new OrchestrationError("patient_mismatch", false);
    }
    if (round.state !== "assessment_selected") {
      throw new OrchestrationError("invalid_state", false);
    }
    const assessmentSessionId = this.#createId();
    const expiresAt = new Date(Date.parse(this.#now()) + 5 * 60_000).toISOString();
    const nextRound = await this.transition({
      roundId: round.id,
      patientId: round.patientId,
      to: "capturing",
      expectedStateVersion: input.expectedStateVersion,
      actor: { kind: "patient", id: input.actorId },
      source: "patient_ui",
      correlationId: input.correlationId
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

  async assertProtocolResult(roundId: string, resultInput: ProtocolResult): Promise<void> {
    const expected = ProtocolResultSchema.parse(resultInput);
    const report = await this.#confirmedReport(roundId);
    const measurements = await this.#repository.listMeasurementFacts(roundId);
    const latest = [...measurements].sort((left, right) =>
      right.fact.observedAt.localeCompare(left.fact.observedAt)
    )[0];
    const decision = evaluateProtocol(this.#protocol, {
      now: this.#now(),
      report,
      measurement: latest ? { status: "present", fact: latest.fact } : { status: "missing" },
      followUp: { status: "not_asked" },
      followUpQuestionsAsked: 0
    });
    if (
      decision.kind !== "result" ||
      JSON.stringify(ProtocolResultSchema.parse(decision.result)) !== JSON.stringify(expected)
    ) {
      throw new OrchestrationError("round_conflict", false);
    }
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
