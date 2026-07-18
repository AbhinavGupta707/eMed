import { z } from "zod";

import {
  DEFAULT_SIGNAL_THRESHOLDS,
  FINGER_PPG_ALGORITHM_VERSION,
  VITALLENS_ALGORITHM_VERSION,
  VOICE_BIOMARKER_ALGORITHM_VERSION,
  createConfirmedMedicationObservationFact
} from "@homerounds/assessments";
import type { CompanionResultRecord } from "@homerounds/companion";
import { MeasurementFactSchema, type MeasurementFact } from "@homerounds/contracts/assessment";
import {
  VoiceBiomarkerFactSchema,
  type MedicationReviewItem,
  type VoiceBiomarkerFact
} from "@homerounds/contracts";
import { DerivedBaselineSampleSchema, type DeviceContext } from "@homerounds/baselines";

import { deterministicUuid } from "../crypto";
import type { ServerRuntime } from "../runtime";
import { readSyntheticBaselineSeed } from "../baselines";
import type { CompanionWorkflowDeviceContext, CompanionWorkflowPort } from "./runtime";

const FingerMetricsSchema = z
  .object({
    durationMs: z.number().int().min(DEFAULT_SIGNAL_THRESHOLDS.minimumDurationMs),
    sampleCount: z.number().int().positive(),
    cadenceHz: z
      .number()
      .min(DEFAULT_SIGNAL_THRESHOLDS.minimumCadenceHz)
      .max(DEFAULT_SIGNAL_THRESHOLDS.maximumCadenceHz),
    jitterRatio: z.number().min(0).max(DEFAULT_SIGNAL_THRESHOLDS.maximumJitterRatio),
    droppedFrameRatio: z.number().min(0).max(DEFAULT_SIGNAL_THRESHOLDS.maximumDroppedFrameRatio),
    coverage: z.number().min(DEFAULT_SIGNAL_THRESHOLDS.minimumCoverage).max(1),
    saturation: z.number().min(0).max(DEFAULT_SIGNAL_THRESHOLDS.maximumSaturation),
    motion: z.number().min(0).max(DEFAULT_SIGNAL_THRESHOLDS.maximumMotion),
    signalStrength: z.number().min(DEFAULT_SIGNAL_THRESHOLDS.minimumSignalStrength),
    spectralBpm: z
      .number()
      .min(DEFAULT_SIGNAL_THRESHOLDS.minimumBpm)
      .max(DEFAULT_SIGNAL_THRESHOLDS.maximumBpm),
    autocorrelationBpm: z
      .number()
      .min(DEFAULT_SIGNAL_THRESHOLDS.minimumBpm)
      .max(DEFAULT_SIGNAL_THRESHOLDS.maximumBpm),
    estimatorDifferenceBpm: z
      .number()
      .min(0)
      .max(DEFAULT_SIGNAL_THRESHOLDS.maximumEstimatorDifferenceBpm),
    torchAvailable: z.union([z.literal(0), z.literal(1)])
  })
  .strict();

const VitalLensMetricsSchema = z
  .object({
    provider_confidence: z.number().min(0.7).max(1),
    face_detected: z.literal(1)
  })
  .strict();

const VoiceMetricsSchema = z
  .object({
    sampleRateHz: z.number().min(8_000).max(192_000),
    durationMs: z.number().int().min(6_000).max(12_000),
    clippingFraction: z.number().min(0).max(0.02),
    voicedFraction: z.number().min(0.6).max(1),
    estimatedSnrDb: z.number().min(10)
  })
  .strict();

function assertBoundRecord(record: CompanionResultRecord, ownerPatientId: string): void {
  if (record.result.taskId !== record.task.taskId || record.result.taskKind !== record.task.kind) {
    throw new Error("Companion result no longer matches its server-bound task.");
  }
  z.string().min(1).max(120).parse(ownerPatientId);
}

function contextFor(
  taskKind: CompanionResultRecord["task"]["kind"],
  device: CompanionWorkflowDeviceContext
): DeviceContext {
  return {
    schemaVersion: "device-context.v1",
    deviceClass: device.deviceClass,
    platform: device.platform,
    captureSurface:
      taskKind === "finger_pulse"
        ? "rear_camera"
        : taskKind === "face_pulse"
          ? "front_camera"
          : taskKind === "voice_signal"
            ? "microphone"
            : "unknown"
  };
}

function assertCurrentTask(
  record: CompanionResultRecord,
  round: Awaited<ReturnType<ServerRuntime["orchestration"]["getRound"]>>,
  selectedModuleId: string | null
): void {
  if (
    round.stateVersion !== record.roundStateVersion ||
    round.patientId === "" ||
    selectedModuleId !== record.task.taskId
  ) {
    throw new Error("Companion result is stale relative to the authoritative round.");
  }
}

function correlationId(resultId: string): string {
  return `companion-${resultId}`;
}

function medicationItems(
  fields: Extract<
    CompanionResultRecord["result"],
    { taskKind: "medication_label"; outcome: "derived_candidate" }
  >["derived"]["fields"]
): MedicationReviewItem[] {
  return fields.map((field) => ({
    field: field.field,
    disposition: field.status === "confirmed" ? "accepted" : "not_visible",
    reviewedValue: field.value
  }));
}

export class CompanionWorkflowProcessor implements CompanionWorkflowPort {
  constructor(private readonly runtime: ServerRuntime) {}

  async process(input: {
    record: CompanionResultRecord;
    ownerPatientId: string;
    device: CompanionWorkflowDeviceContext;
  }): Promise<void> {
    const { record, ownerPatientId, device } = input;
    assertBoundRecord(record, ownerPatientId);
    if (record.result.outcome !== "derived_candidate") {
      await this.#processNonMeasurement(record, ownerPatientId);
      return;
    }
    switch (record.result.taskKind) {
      case "finger_pulse":
      case "face_pulse":
        await this.#processOptical(record, ownerPatientId, device);
        return;
      case "voice_signal":
        await this.#processVoice(record, ownerPatientId, device);
        return;
      case "medication_label":
        await this.#processMedication(record, ownerPatientId);
        return;
    }
  }

  async #processOptical(
    record: CompanionResultRecord,
    patientId: string,
    device: CompanionWorkflowDeviceContext
  ): Promise<void> {
    if (record.result.outcome !== "derived_candidate") return;
    if (record.result.taskKind !== "finger_pulse" && record.result.taskKind !== "face_pulse")
      return;
    const factId = deterministicUuid("companion-measurement", record.resultId);
    const assessmentSessionId = deterministicUuid("companion-assessment", record.resultId);
    const priorMeasurement = (await this.runtime.repository.listMeasurementFacts(record.roundId))
      .map(({ fact }) => fact)
      .find((fact) => fact.factId === factId);
    if (priorMeasurement) {
      await this.#recordOpticalBaseline(priorMeasurement, record.roundId, patientId, device);
      return;
    }
    const round = await this.runtime.orchestration.getRound(record.roundId);
    if (round.patientId !== patientId)
      throw new Error("Companion result owner does not match round.");
    const route = await this.runtime.orchestration.getEvidenceRoute(round.id);
    assertCurrentTask(record, round, route.selectedModuleId);

    const quality = record.result.derived.quality;
    if (quality.reasons.length > 0 || quality.metrics === undefined) {
      throw new Error("Companion optical candidate did not pass capture-quality review.");
    }
    let measurement: MeasurementFact;
    if (record.result.taskKind === "finger_pulse") {
      if (record.result.derived.algorithmVersion !== FINGER_PPG_ALGORITHM_VERSION) {
        throw new Error("Companion finger algorithm version is not registered.");
      }
      const metrics = FingerMetricsSchema.parse(quality.metrics);
      const estimated =
        Math.round(((metrics.spectralBpm + metrics.autocorrelationBpm) / 2) * 10) / 10;
      if (
        metrics.durationMs !== record.result.derived.durationMs ||
        Math.abs(estimated - record.result.derived.pulseBpm) > 0.1
      ) {
        throw new Error("Companion finger result is inconsistent with its quality metrics.");
      }
      measurement = MeasurementFactSchema.strict().parse({
        factId,
        assessmentSessionId,
        provider: "finger_ppg",
        value: record.result.derived.pulseBpm,
        unit: "bpm",
        observedAt: record.result.clientObservedAt,
        durationMs: record.result.derived.durationMs,
        algorithmVersion: FINGER_PPG_ALGORITHM_VERSION,
        providerModelVersion: null,
        quality: { status: "pass", score: quality.score, reasons: [], metrics },
        rawMediaRef: null
      });
    } else {
      const metrics = VitalLensMetricsSchema.parse(quality.metrics);
      if (Math.abs(metrics.provider_confidence - quality.score) > 0.000_001) {
        throw new Error("Companion VitalLens result is inconsistent with provider confidence.");
      }
      measurement = MeasurementFactSchema.strict().parse({
        factId,
        assessmentSessionId,
        provider: "vitallens",
        value: record.result.derived.pulseBpm,
        unit: "bpm",
        observedAt: record.result.clientObservedAt,
        durationMs: record.result.derived.durationMs,
        algorithmVersion: VITALLENS_ALGORITHM_VERSION,
        providerModelVersion: record.result.derived.providerVersion,
        quality: { status: "pass", score: quality.score, reasons: [], metrics },
        rawMediaRef: null
      });
    }

    const started = await this.runtime.orchestration.startAssessment({
      roundId: round.id,
      patientId,
      expectedStateVersion: round.stateVersion,
      skipMedicationReview: false,
      actorId: "paired-phone",
      correlationId: correlationId(record.resultId),
      assessmentSessionId
    });
    if (started.provider !== measurement.provider) {
      throw new Error("Companion optical provider does not match server selection.");
    }
    await this.runtime.orchestration.submitAssessment({
      roundId: round.id,
      patientId,
      expectedStateVersion: started.round.stateVersion,
      measurement,
      attestation: started.attestation,
      actorId: "paired-phone",
      correlationId: correlationId(record.resultId)
    });
    await this.#recordOpticalBaseline(measurement, round.id, patientId, device);
  }

  async #processVoice(
    record: CompanionResultRecord,
    patientId: string,
    device: CompanionWorkflowDeviceContext
  ): Promise<void> {
    if (record.result.outcome !== "derived_candidate" || record.result.taskKind !== "voice_signal")
      return;
    const factId = deterministicUuid("companion-voice", record.resultId);
    const assessmentSessionId = deterministicUuid("companion-voice-assessment", record.resultId);
    const priorFact = (await this.runtime.repository.listVoiceBiomarkerFacts(record.roundId))
      .map(({ fact }) => fact)
      .find((fact) => fact.factId === factId);
    if (priorFact) {
      await this.#recordVoiceBaseline(priorFact, patientId, device);
      return;
    }
    const round = await this.runtime.orchestration.getRound(record.roundId);
    if (round.patientId !== patientId)
      throw new Error("Companion result owner does not match round.");
    const route = await this.runtime.orchestration.getEvidenceRoute(round.id);
    assertCurrentTask(record, round, route.selectedModuleId);
    const quality = record.result.derived.quality;
    if (record.result.derived.algorithmVersion !== VOICE_BIOMARKER_ALGORITHM_VERSION) {
      throw new Error("Companion voice algorithm version is not registered.");
    }
    if (quality.reasons.length > 0 || quality.metrics === undefined) {
      throw new Error("Companion voice candidate did not pass capture-quality review.");
    }
    const metrics = VoiceMetricsSchema.parse(quality.metrics);
    const features = record.result.derived.features;
    if (
      metrics.durationMs !== record.result.derived.durationMs ||
      features.phonationDurationMs !== record.result.derived.durationMs
    ) {
      throw new Error("Companion voice result is inconsistent with its quality metrics.");
    }
    const started = await this.runtime.orchestration.startVoiceBiomarker({
      roundId: round.id,
      patientId,
      expectedStateVersion: round.stateVersion,
      assessmentSessionId
    });
    const fact: VoiceBiomarkerFact = VoiceBiomarkerFactSchema.parse({
      factId,
      roundId: round.id,
      assessmentSessionId,
      provider: "local_voice_features",
      observedAt: record.result.clientObservedAt,
      durationMs: record.result.derived.durationMs,
      algorithmVersion: record.result.derived.algorithmVersion,
      features,
      quality: { status: "pass", score: quality.score, reasons: [], metrics },
      researchOnly: true,
      rawMediaRef: null
    });
    await this.runtime.orchestration.submitVoiceBiomarker({
      roundId: round.id,
      patientId,
      expectedStateVersion: round.stateVersion,
      result: { status: "completed", fact },
      attestation: started.attestation,
      actorId: "paired-phone",
      correlationId: correlationId(record.resultId)
    });
    await this.#recordVoiceBaseline(fact, patientId, device);
  }

  async #processMedication(record: CompanionResultRecord, patientId: string): Promise<void> {
    if (
      record.result.outcome !== "derived_candidate" ||
      record.result.taskKind !== "medication_label"
    )
      return;
    const factId = deterministicUuid("companion-medication", record.resultId);
    const events = await this.runtime.repository.listAuditEvents(record.roundId);
    if (events.some((event) => JSON.stringify(event.payload).includes(factId))) return;
    const round = await this.runtime.orchestration.getRound(record.roundId);
    if (round.patientId !== patientId)
      throw new Error("Companion result owner does not match round.");
    const route = await this.runtime.orchestration.getEvidenceRoute(round.id);
    assertCurrentTask(record, round, route.selectedModuleId);
    const fact = createConfirmedMedicationObservationFact({
      source: "text_entry",
      roundId: round.id,
      stateVersion: round.stateVersion,
      reviewItems: medicationItems(record.result.derived.fields),
      explicitlyConfirmed: true,
      createId: () => factId,
      now: () => record.result.clientObservedAt
    });
    if (!fact) throw new Error("Companion medication confirmation is invalid.");
    await this.runtime.orchestration.confirmMedicationObservation({
      roundId: round.id,
      patientId,
      expectedStateVersion: round.stateVersion,
      fact,
      actorId: "paired-phone",
      correlationId: correlationId(record.resultId)
    });
  }

  async #processNonMeasurement(record: CompanionResultRecord, patientId: string): Promise<void> {
    if (record.result.taskKind !== "voice_signal") return;
    if (
      record.result.outcome !== "declined" &&
      !(
        record.result.outcome === "unavailable" &&
        ["permission_denied", "unsupported_device"].includes(record.result.reason)
      )
    ) {
      return;
    }
    const events = await this.runtime.repository.listAuditEvents(record.roundId);
    if (events.some(({ type }) => type === "voice_biomarker_skipped")) return;
    const round = await this.runtime.orchestration.getRound(record.roundId);
    if (round.patientId !== patientId)
      throw new Error("Companion result owner does not match round.");
    const route = await this.runtime.orchestration.getEvidenceRoute(round.id);
    assertCurrentTask(record, round, route.selectedModuleId);
    await this.runtime.orchestration.skipVoiceBiomarker({
      roundId: round.id,
      patientId,
      expectedStateVersion: round.stateVersion,
      reason:
        record.result.outcome === "declined"
          ? "patient_declined"
          : record.result.reason === "permission_denied"
            ? "permission_denied"
            : "unsupported_device",
      actorId: "paired-phone",
      correlationId: correlationId(record.resultId)
    });
  }

  async #recordOpticalBaseline(
    fact: MeasurementFact,
    roundId: string,
    patientId: string,
    device: CompanionWorkflowDeviceContext
  ): Promise<void> {
    await this.runtime.ensureBaselinesReady();
    const seed = readSyntheticBaselineSeed();
    const policy = seed.policies.find(({ signal }) => signal.kind === "pulse_bpm");
    if (!policy) throw new Error("Synthetic pulse baseline policy is unavailable.");
    const sample = DerivedBaselineSampleSchema.parse({
      schemaVersion: "derived-baseline-sample.v1",
      sampleId: deterministicUuid("baseline-sample", fact.factId, "pulse_bpm"),
      patientId,
      dataClassification: "synthetic_demo",
      signal: { kind: "pulse_bpm", unit: "bpm" },
      value: fact.value,
      observedAt: fact.observedAt,
      context: {
        schemaVersion: "baseline-measurement-context.v1",
        provider: fact.provider,
        providerVersion:
          fact.providerModelVersion === null
            ? { status: "not_applicable" }
            : { status: "known", value: fact.providerModelVersion },
        algorithmVersion: { status: "known", value: fact.algorithmVersion },
        device: contextFor(fact.provider === "finger_ppg" ? "finger_pulse" : "face_pulse", device)
      },
      quality: { status: "pass", score: fact.quality.score },
      provenance: {
        schemaVersion: "baseline-sample-provenance.v1",
        sourceKind: "optical_measurement",
        sourceFactId: fact.factId,
        roundId,
        assessmentSessionId: fact.assessmentSessionId,
        qualityGateVersion: "optical-quality-v1",
        structuredDerivedOnly: true,
        rawMediaStored: false,
        transcriptStored: false
      }
    });
    await this.runtime.baselines.recordDerivedSample({ sample, policy });
  }

  async #recordVoiceBaseline(
    fact: VoiceBiomarkerFact,
    patientId: string,
    device: CompanionWorkflowDeviceContext
  ): Promise<void> {
    await this.runtime.ensureBaselinesReady();
    const seed = readSyntheticBaselineSeed();
    const policy = seed.policies.find(
      ({ signal }) => signal.kind === "voice_harmonic_to_noise_ratio_db"
    );
    if (!policy || fact.features.harmonicToNoiseRatioDb === null) return;
    const sample = DerivedBaselineSampleSchema.parse({
      schemaVersion: "derived-baseline-sample.v1",
      sampleId: deterministicUuid("baseline-sample", fact.factId, policy.signal.kind),
      patientId,
      dataClassification: "synthetic_demo",
      signal: policy.signal,
      value: fact.features.harmonicToNoiseRatioDb,
      observedAt: fact.observedAt,
      context: {
        schemaVersion: "baseline-measurement-context.v1",
        provider: "local_voice_features",
        providerVersion: { status: "not_applicable" },
        algorithmVersion: { status: "known", value: fact.algorithmVersion },
        device: contextFor("voice_signal", device)
      },
      quality: { status: "pass", score: fact.quality.score },
      provenance: {
        schemaVersion: "baseline-sample-provenance.v1",
        sourceKind: "voice_biomarker_fact",
        sourceFactId: fact.factId,
        roundId: fact.roundId,
        assessmentSessionId: fact.assessmentSessionId,
        qualityGateVersion: "voice-quality-v1",
        structuredDerivedOnly: true,
        rawMediaStored: false,
        transcriptStored: false
      }
    });
    await this.runtime.baselines.recordDerivedSample({ sample, policy });
  }
}
