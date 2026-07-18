import type { OpticalAssessmentResult } from "@homerounds/contracts/assessment";
import type { VoiceBiomarkerFact } from "@homerounds/contracts";
import {
  CompanionTaskResultRequestSchema,
  type CompanionPhoneSnapshot,
  type CompanionTaskResultRequest
} from "@homerounds/companion/schemas";

export type CompanionResultDependencies = Readonly<{
  createId: () => string;
  now: () => string;
}>;

type NonMeasurementOutcome = Extract<
  CompanionTaskResultRequest,
  { outcome: "quality_rejected" | "unavailable" | "declined" }
>["outcome"];

type NonMeasurementReason = Extract<
  CompanionTaskResultRequest,
  { outcome: "quality_rejected" | "unavailable" | "declined" }
>["reason"];

export type CompanionUnavailableReason = Extract<
  NonMeasurementReason,
  "permission_denied" | "unsupported_device" | "network_interrupted" | "provider_unavailable"
>;

type CompanionQualityRejectedReason = Extract<NonMeasurementReason, "quality_too_low">;

type CompanionDeclinedReason = Extract<NonMeasurementReason, "patient_declined">;

function resultBase(snapshot: CompanionPhoneSnapshot, dependencies: CompanionResultDependencies) {
  return {
    operationId: dependencies.createId(),
    expectedSessionVersion: snapshot.sessionVersion,
    taskId: snapshot.task.taskId,
    taskKind: snapshot.task.kind,
    clientObservedAt: dependencies.now(),
    rawMediaStored: false as const
  };
}

export function createNonMeasurementResult(
  snapshot: CompanionPhoneSnapshot,
  outcome: "quality_rejected",
  reason: CompanionQualityRejectedReason,
  dependencies: CompanionResultDependencies
): CompanionTaskResultRequest;
export function createNonMeasurementResult(
  snapshot: CompanionPhoneSnapshot,
  outcome: "unavailable",
  reason: CompanionUnavailableReason,
  dependencies: CompanionResultDependencies
): CompanionTaskResultRequest;
export function createNonMeasurementResult(
  snapshot: CompanionPhoneSnapshot,
  outcome: "declined",
  reason: CompanionDeclinedReason,
  dependencies: CompanionResultDependencies
): CompanionTaskResultRequest;
export function createNonMeasurementResult(
  snapshot: CompanionPhoneSnapshot,
  outcome: NonMeasurementOutcome,
  reason: NonMeasurementReason,
  dependencies: CompanionResultDependencies
): CompanionTaskResultRequest {
  return CompanionTaskResultRequestSchema.parse({
    ...resultBase(snapshot, dependencies),
    outcome,
    reason
  });
}

export function unavailableReasonForOptical(
  reason: Extract<OpticalAssessmentResult, { status: "unavailable" }>["reason"]
): CompanionUnavailableReason {
  switch (reason) {
    case "permission_denied":
      return "permission_denied";
    case "unsupported_device":
      return "unsupported_device";
    case "network_unavailable":
      return "network_interrupted";
    case "missing_configuration":
    case "provider_unavailable":
      return "provider_unavailable";
  }
}

export function createOpticalCandidateResult(
  snapshot: CompanionPhoneSnapshot,
  result: Extract<OpticalAssessmentResult, { status: "completed" }>,
  dependencies: CompanionResultDependencies
): CompanionTaskResultRequest {
  const measurement = result.measurement;
  const quality = {
    status: "unreviewed" as const,
    score: measurement.quality.score,
    reasons: measurement.quality.reasons
  };

  if (snapshot.task.kind === "finger_pulse" && measurement.provider === "finger_ppg") {
    return CompanionTaskResultRequestSchema.parse({
      ...resultBase(snapshot, dependencies),
      outcome: "derived_candidate",
      derived: {
        pulseBpm: measurement.value,
        durationMs: measurement.durationMs,
        algorithmVersion: measurement.algorithmVersion,
        quality
      }
    });
  }

  if (
    snapshot.task.kind === "face_pulse" &&
    measurement.provider === "vitallens" &&
    measurement.providerModelVersion !== null &&
    snapshot.consentState.status === "granted"
  ) {
    return CompanionTaskResultRequestSchema.parse({
      ...resultBase(snapshot, dependencies),
      outcome: "derived_candidate",
      derived: {
        pulseBpm: measurement.value,
        durationMs: measurement.durationMs,
        providerVersion: measurement.providerModelVersion,
        consentGrantedAt: snapshot.consentState.grantedAt,
        quality
      }
    });
  }

  return createNonMeasurementResult(snapshot, "quality_rejected", "quality_too_low", dependencies);
}

export function createVoiceCandidateResult(
  snapshot: CompanionPhoneSnapshot,
  fact: VoiceBiomarkerFact,
  dependencies: CompanionResultDependencies
): CompanionTaskResultRequest {
  const features = fact.features;
  if (
    snapshot.task.kind !== "voice_signal" ||
    features.medianFundamentalFrequencyHz === null ||
    features.pitchVariabilitySemitones === null ||
    features.jitterPercent === null ||
    features.shimmerPercent === null ||
    features.harmonicToNoiseRatioDb === null
  ) {
    return createNonMeasurementResult(
      snapshot,
      "quality_rejected",
      "quality_too_low",
      dependencies
    );
  }

  return CompanionTaskResultRequestSchema.parse({
    ...resultBase(snapshot, dependencies),
    outcome: "derived_candidate",
    derived: {
      durationMs: fact.durationMs,
      algorithmVersion: fact.algorithmVersion,
      researchOnly: true,
      features: {
        medianFundamentalFrequencyHz: features.medianFundamentalFrequencyHz,
        pitchVariabilitySemitones: features.pitchVariabilitySemitones,
        jitterPercent: features.jitterPercent,
        shimmerPercent: features.shimmerPercent,
        harmonicToNoiseRatioDb: features.harmonicToNoiseRatioDb
      },
      quality: {
        status: "unreviewed",
        score: fact.quality.score,
        reasons: fact.quality.reasons
      }
    }
  });
}
