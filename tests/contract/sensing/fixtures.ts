import {
  FINGER_PPG_ALGORITHM_VERSION,
  VITALLENS_ALGORITHM_VERSION,
  VOICE_BIOMARKER_ALGORITHM_VERSION
} from "../../../packages/assessments/src/index";
import {
  CompanionResultRecordSchema,
  type CompanionResultRecord,
  type CompanionTaskKind
} from "../../../packages/companion/src/index";
import {
  DerivedBaselineSampleSchema,
  type BaselineMeasurementContext,
  type DerivedBaselineSample
} from "../../../packages/baselines/src/index";

export const SENSING_NOW = "2026-07-18T12:00:00.000Z";
export const SENSING_PATIENT_ID = "synthetic-maya";

export const fingerQualityMetrics = {
  durationMs: 15_000,
  sampleCount: 451,
  cadenceHz: 30,
  jitterRatio: 0.01,
  droppedFrameRatio: 0.01,
  coverage: 0.9,
  saturation: 0.05,
  motion: 0.05,
  signalStrength: 0.01,
  spectralBpm: 72,
  autocorrelationBpm: 72,
  estimatorDifferenceBpm: 0,
  torchAvailable: 1
} as const;

type RecordInput = Readonly<{
  roundId: string;
  roundStateVersion: number;
  resultId: string;
  taskKind: CompanionTaskKind;
  taskId: string;
  derived: Readonly<Record<string, unknown>>;
}>;

export function companionDerivedRecord(input: RecordInput): CompanionResultRecord {
  return CompanionResultRecordSchema.parse({
    resultId: input.resultId,
    pairingId: "71000000-0000-4000-8000-000000000001",
    sessionId: "71000000-0000-4000-8000-000000000002",
    roundId: input.roundId,
    roundStateVersion: input.roundStateVersion,
    task: {
      taskId: input.taskId,
      kind: input.taskKind,
      taskVersion: Math.max(1, input.roundStateVersion)
    },
    result: {
      operationId: "71000000-0000-4000-8000-000000000003",
      expectedSessionVersion: 4,
      taskId: input.taskId,
      taskKind: input.taskKind,
      clientObservedAt: SENSING_NOW,
      rawMediaStored: false,
      outcome: "derived_candidate",
      derived: input.derived
    },
    receivedAt: SENSING_NOW,
    validationStatus: "pending_deterministic_workflow"
  });
}

export function fingerRecord(input: {
  roundId: string;
  roundStateVersion: number;
  resultId: string;
  pulseBpm?: number;
  algorithmVersion?: string;
  metrics?: Readonly<Record<string, number>>;
}): CompanionResultRecord {
  return companionDerivedRecord({
    ...input,
    taskId: "capture.finger_ppg.pulse",
    taskKind: "finger_pulse",
    derived: {
      pulseBpm: input.pulseBpm ?? 72,
      durationMs: 15_000,
      algorithmVersion: input.algorithmVersion ?? FINGER_PPG_ALGORITHM_VERSION,
      quality: {
        status: "unreviewed",
        score: 0.9,
        reasons: [],
        metrics: input.metrics ?? fingerQualityMetrics
      }
    }
  });
}

export function faceRecord(input: {
  roundId: string;
  roundStateVersion: number;
  resultId: string;
  confidence?: number;
  faceDetected?: number;
  providerVersion?: string;
}): CompanionResultRecord {
  const confidence = input.confidence ?? 0.92;
  return companionDerivedRecord({
    ...input,
    taskId: "capture.vitallens.pulse",
    taskKind: "face_pulse",
    derived: {
      pulseBpm: 71,
      durationMs: 15_000,
      providerVersion: input.providerVersion ?? "vitallens-model-4.2",
      consentGrantedAt: "2026-07-18T11:59:00.000Z",
      quality: {
        status: "unreviewed",
        score: confidence,
        reasons: [],
        metrics: {
          provider_confidence: confidence,
          face_detected: input.faceDetected ?? 1
        }
      }
    }
  });
}

export function voiceRecord(input: {
  roundId: string;
  roundStateVersion: number;
  resultId: string;
  algorithmVersion?: string;
}): CompanionResultRecord {
  return companionDerivedRecord({
    ...input,
    taskId: "voice.local.baseline",
    taskKind: "voice_signal",
    derived: {
      durationMs: 7_000,
      algorithmVersion: input.algorithmVersion ?? VOICE_BIOMARKER_ALGORITHM_VERSION,
      researchOnly: true,
      features: {
        medianFundamentalFrequencyHz: 180,
        pitchVariabilitySemitones: 0.2,
        jitterPercent: 0.1,
        shimmerPercent: 0.8,
        harmonicToNoiseRatioDb: 28,
        phonationDurationMs: 7_000
      },
      quality: {
        status: "unreviewed",
        score: 0.94,
        reasons: [],
        metrics: {
          sampleRateHz: 48_000,
          durationMs: 7_000,
          clippingFraction: 0.001,
          voicedFraction: 0.96,
          estimatedSnrDb: 24
        }
      }
    }
  });
}

export const registeredAlgorithms = {
  finger: FINGER_PPG_ALGORITHM_VERSION,
  face: VITALLENS_ALGORITHM_VERSION,
  voice: VOICE_BIOMARKER_ALGORITHM_VERSION
} as const;

export const fingerBaselineContext: BaselineMeasurementContext = {
  schemaVersion: "baseline-measurement-context.v1",
  provider: "finger_ppg",
  providerVersion: { status: "not_applicable" },
  algorithmVersion: { status: "known", value: FINGER_PPG_ALGORITHM_VERSION },
  device: {
    schemaVersion: "device-context.v1",
    deviceClass: "phone",
    platform: "ios",
    captureSurface: "rear_camera"
  }
};

export function baselineSample(input: {
  id: number;
  day: number;
  value: number;
  context?: BaselineMeasurementContext;
}): DerivedBaselineSample {
  const id = String(input.id).padStart(12, "0");
  return DerivedBaselineSampleSchema.parse({
    schemaVersion: "derived-baseline-sample.v1",
    sampleId: `72000000-0000-4000-8000-${id}`,
    patientId: SENSING_PATIENT_ID,
    dataClassification: "synthetic_demo",
    signal: { kind: "pulse_bpm", unit: "bpm" },
    value: input.value,
    observedAt: `2026-07-${String(input.day).padStart(2, "0")}T08:00:00.000Z`,
    context: input.context ?? fingerBaselineContext,
    quality: { status: "pass", score: 0.92 },
    provenance: {
      schemaVersion: "baseline-sample-provenance.v1",
      sourceKind: "synthetic_seed",
      sourceFactId: `73000000-0000-4000-8000-${id}`,
      roundId: `74000000-0000-4000-8000-${id}`,
      assessmentSessionId: `75000000-0000-4000-8000-${id}`,
      qualityGateVersion: "optical-quality-v1",
      structuredDerivedOnly: true,
      rawMediaStored: false,
      transcriptStored: false
    }
  });
}
