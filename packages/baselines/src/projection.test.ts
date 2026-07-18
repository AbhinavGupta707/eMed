import { describe, expect, it } from "vitest";

import {
  DerivedBaselineSampleSchema,
  PersonalChangePolicySchema,
  type BaselineMeasurementContext,
  type DerivedBaselineSample,
  type PersonalChangePolicy
} from "./schemas";
import { projectPersonalBaseline } from "./projection";

const NOW = "2026-07-18T12:00:00.000Z";
const PATIENT_ID = "synthetic-maya";

const fingerContext: BaselineMeasurementContext = {
  schemaVersion: "baseline-measurement-context.v1",
  provider: "finger_ppg",
  providerVersion: { status: "not_applicable" },
  algorithmVersion: { status: "known", value: "finger_ppg_local_v1" },
  device: {
    schemaVersion: "device-context.v1",
    deviceClass: "phone",
    platform: "ios",
    captureSurface: "rear_camera"
  }
};

const policy: PersonalChangePolicy = {
  schemaVersion: "personal-change-policy.v1",
  policyVersion: "pulse-within-person-v1",
  signal: { kind: "pulse_bpm", unit: "bpm" },
  comparisonBasis: "within_person_only",
  clinicalInterpretation: "none",
  minimumComparableSamples: 3,
  absoluteDeltaThreshold: 6,
  relativeDeltaThreshold: 0.08
};

function uuid(namespace: number, value: number): string {
  return `${String(namespace).padStart(8, "0")}-0000-4000-8000-${String(value).padStart(12, "0")}`;
}

function sample(
  value: number,
  day: number,
  id: number,
  context: BaselineMeasurementContext = fingerContext
): DerivedBaselineSample {
  return DerivedBaselineSampleSchema.parse({
    schemaVersion: "derived-baseline-sample.v1",
    sampleId: uuid(1, id),
    patientId: PATIENT_ID,
    dataClassification: "synthetic_demo",
    signal: { kind: "pulse_bpm", unit: "bpm" },
    value,
    observedAt: `2026-07-${String(day).padStart(2, "0")}T08:00:00.000Z`,
    context,
    quality: { status: "pass", score: 0.92 },
    provenance: {
      schemaVersion: "baseline-sample-provenance.v1",
      sourceKind: "synthetic_seed",
      sourceFactId: uuid(2, id),
      roundId: uuid(3, id),
      assessmentSessionId: uuid(4, id),
      qualityGateVersion: "optical-quality-v1",
      structuredDerivedOnly: true,
      rawMediaStored: false,
      transcriptStored: false
    }
  });
}

const history = [sample(72, 10, 1), sample(74, 12, 2), sample(73, 14, 3)];

describe("personal baseline projection", () => {
  it("returns unknown and first-sample states without inventing a default", () => {
    expect(
      projectPersonalBaseline({
        patientId: PATIENT_ID,
        currentSample: null,
        history: [],
        policy,
        generatedAt: NOW
      })
    ).toMatchObject({
      status: "unknown",
      reason: "current_sample_unavailable",
      currentSampleId: null
    });

    expect(
      projectPersonalBaseline({
        patientId: PATIENT_ID,
        currentSample: sample(73, 16, 4),
        history: [],
        policy,
        generatedAt: NOW
      })
    ).toMatchObject({ status: "first_sample", priorSampleCount: 0, comparableSampleCount: 0 });
  });

  it("keeps provider, provider version, algorithm, and device contexts separate", () => {
    const vitallensContext: BaselineMeasurementContext = {
      ...fingerContext,
      provider: "vitallens",
      providerVersion: { status: "known", value: "vitallens_model_4.2" },
      algorithmVersion: { status: "known", value: "vitallens_face_rppg_v1" },
      device: { ...fingerContext.device, captureSurface: "front_camera" }
    };
    const projection = projectPersonalBaseline({
      patientId: PATIENT_ID,
      currentSample: sample(75, 16, 4, vitallensContext),
      history,
      policy,
      generatedAt: NOW
    });

    expect(projection).toMatchObject({
      status: "non_comparable",
      priorSampleCount: 3,
      comparableSampleCount: 0
    });
    if (projection.status !== "non_comparable") throw new Error("Expected non-comparable state.");
    expect(projection.reasons).toEqual(
      expect.arrayContaining([
        "provider_mismatch",
        "provider_version_mismatch",
        "algorithm_version_mismatch",
        "capture_surface_mismatch"
      ])
    );
  });

  it("treats same-provider version and device changes as non-comparable", () => {
    const vitallensContext: BaselineMeasurementContext = {
      ...fingerContext,
      provider: "vitallens",
      providerVersion: { status: "known", value: "vitallens_model_4.2" },
      algorithmVersion: { status: "known", value: "vitallens_face_rppg_v1" },
      device: { ...fingerContext.device, captureSurface: "front_camera" }
    };
    const prior = sample(75, 14, 20, vitallensContext);
    const cases: ReadonlyArray<{
      context: BaselineMeasurementContext;
      reason: string;
    }> = [
      {
        context: {
          ...vitallensContext,
          providerVersion: { status: "known", value: "vitallens_model_4.3" }
        },
        reason: "provider_version_mismatch"
      },
      {
        context: {
          ...vitallensContext,
          algorithmVersion: { status: "known", value: "vitallens_face_rppg_v2" }
        },
        reason: "algorithm_version_mismatch"
      },
      {
        context: {
          ...vitallensContext,
          device: { ...vitallensContext.device, platform: "android" }
        },
        reason: "platform_mismatch"
      },
      {
        context: {
          ...vitallensContext,
          device: { ...vitallensContext.device, deviceClass: "tablet" }
        },
        reason: "device_class_mismatch"
      }
    ];

    for (const [index, testCase] of cases.entries()) {
      const projection = projectPersonalBaseline({
        patientId: PATIENT_ID,
        currentSample: sample(75, 16, 30 + index, testCase.context),
        history: [prior],
        policy,
        generatedAt: NOW
      });
      expect(projection).toMatchObject({
        status: "non_comparable",
        reasons: expect.arrayContaining([testCase.reason])
      });
    }
  });

  it("reports insufficient comparable history independently of unrelated samples", () => {
    const projection = projectPersonalBaseline({
      patientId: PATIENT_ID,
      currentSample: sample(74, 16, 4),
      history: history.slice(0, 2),
      policy,
      generatedAt: NOW
    });

    expect(projection).toMatchObject({
      status: "insufficient_history",
      comparableSampleCount: 2,
      requiredComparableSamples: 3
    });
  });

  it("projects unchanged and changed within-person states without clinical authority", () => {
    const unchanged = projectPersonalBaseline({
      patientId: PATIENT_ID,
      currentSample: sample(74, 16, 4),
      history,
      policy,
      generatedAt: NOW
    });
    const changed = projectPersonalBaseline({
      patientId: PATIENT_ID,
      currentSample: sample(82, 16, 5),
      history,
      policy,
      generatedAt: NOW
    });

    expect(unchanged).toMatchObject({
      status: "comparable_unchanged",
      comparison: { baselineMedian: 73, absoluteDelta: 1, comparableSampleCount: 3 },
      authority: { clinicalInterpretation: "none", workflowAuthority: false }
    });
    expect(changed).toMatchObject({
      status: "comparable_changed",
      comparison: { baselineMedian: 73, absoluteDelta: 9, comparableSampleCount: 3 },
      authority: { clinicalInterpretation: "none", workflowAuthority: false }
    });
  });

  it("preserves unknown context and invalid history timing as explicit unknowns", () => {
    const unknownContext: BaselineMeasurementContext = {
      ...fingerContext,
      algorithmVersion: { status: "unknown" }
    };
    expect(
      projectPersonalBaseline({
        patientId: PATIENT_ID,
        currentSample: sample(74, 16, 4, unknownContext),
        history,
        policy,
        generatedAt: NOW
      })
    ).toMatchObject({ status: "unknown", reason: "current_context_unknown" });

    expect(
      projectPersonalBaseline({
        patientId: PATIENT_ID,
        currentSample: sample(74, 16, 4),
        history: [sample(73, 17, 5)],
        policy,
        generatedAt: NOW
      })
    ).toMatchObject({ status: "unknown", reason: "history_time_invalid" });
  });

  it("makes non-derived media and conversational content unrepresentable", () => {
    const valid = sample(74, 16, 4);
    expect(
      DerivedBaselineSampleSchema.safeParse({
        ...valid,
        provenance: { ...valid.provenance, rawAudio: "forbidden" }
      }).success
    ).toBe(false);
    expect(
      DerivedBaselineSampleSchema.safeParse({
        ...valid,
        provenance: { ...valid.provenance, transcript: "forbidden" }
      }).success
    ).toBe(false);
    expect(
      PersonalChangePolicySchema.safeParse({
        ...policy,
        populationThreshold: 100,
        diagnosis: "forbidden"
      }).success
    ).toBe(false);
  });
});
