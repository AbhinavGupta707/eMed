import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  CompanionTaskResultRequestSchema,
  type CompanionTaskResultRequest
} from "../../../packages/companion/src/index";
import {
  DerivedBaselineSampleSchema,
  PersonalChangePolicySchema,
  projectPersonalBaseline,
  type BaselineMeasurementContext,
  type PersonalChangePolicy
} from "../../../packages/baselines/src/index";
import {
  SENSING_NOW,
  SENSING_PATIENT_ID,
  baselineSample,
  fingerBaselineContext,
  fingerQualityMetrics,
  registeredAlgorithms
} from "./fixtures";

const operationId = "77000000-0000-4000-8000-000000000001";
const taskId = "capture.finger_ppg.pulse";

function candidate(): CompanionTaskResultRequest {
  return CompanionTaskResultRequestSchema.parse({
    operationId,
    expectedSessionVersion: 4,
    taskId,
    taskKind: "finger_pulse",
    clientObservedAt: SENSING_NOW,
    rawMediaStored: false,
    outcome: "derived_candidate",
    derived: {
      pulseBpm: 72,
      durationMs: 15_000,
      algorithmVersion: registeredAlgorithms.finger,
      quality: {
        status: "unreviewed",
        score: 0.9,
        reasons: [],
        metrics: fingerQualityMetrics
      }
    }
  });
}

const policy: PersonalChangePolicy = PersonalChangePolicySchema.parse({
  schemaVersion: "personal-change-policy.v1",
  policyVersion: "pulse-within-person-v1",
  signal: { kind: "pulse_bpm", unit: "bpm" },
  comparisonBasis: "within_person_only",
  clinicalInterpretation: "none",
  minimumComparableSamples: 3,
  absoluteDeltaThreshold: 6,
  relativeDeltaThreshold: 0.08
});

describe("cross-device sensing result contracts", () => {
  it("pins the exact registered algorithms used by deterministic workflow validation", () => {
    expect(registeredAlgorithms).toEqual({
      finger: "finger_ppg_hr_v1",
      face: "vitallens_face_rppg_rgb24_v2",
      voice: "local_sustained_vowel_features_v1"
    });
  });

  it.each([
    ["owner", { ownerPatientId: "another-synthetic-owner" }],
    ["round", { roundId: "77000000-0000-4000-8000-000000000002" }],
    ["state", { roundStateVersion: 99 }],
    ["server result id", { resultId: "77000000-0000-4000-8000-000000000003" }],
    ["accepted quality authority", { qualityAccepted: true }],
    ["workflow authority", { protocolDecision: "accept" }],
    ["raw frame", { rawFrame: "forbidden-frame" }],
    ["raw audio", { rawAudio: "forbidden-audio" }],
    ["transcript", { transcript: "forbidden-conversation" }],
    ["provider payload", { providerPayload: { bpm: 72 } }],
    ["raw-media flag", { rawMediaStored: true }]
  ])("cannot represent client-selected %s data", (_name, mutation) => {
    expect(
      CompanionTaskResultRequestSchema.safeParse({ ...candidate(), ...mutation }).success
    ).toBe(false);
  });

  it.each([
    ["quality rejection", "quality_rejected", "quality_too_low"],
    ["permission denial", "unavailable", "permission_denied"],
    ["unsupported device", "unavailable", "unsupported_device"],
    ["provider unavailable", "unavailable", "provider_unavailable"],
    ["patient cancellation", "declined", "patient_declined"]
  ] as const)("keeps %s as a non-numeric result", (_name, outcome, reason) => {
    const parsed = CompanionTaskResultRequestSchema.parse({
      operationId,
      expectedSessionVersion: 4,
      taskId,
      taskKind: "finger_pulse",
      clientObservedAt: SENSING_NOW,
      rawMediaStored: false,
      outcome,
      reason
    });
    expect(parsed).not.toHaveProperty("derived");
    expect(parsed).not.toHaveProperty("pulseBpm");
    expect(parsed.rawMediaStored).toBe(false);
  });

  it("requires medication observations to be local/manual and explicitly confirmed", () => {
    const source = readFileSync(
      new URL("../../../apps/web/src/features/companion/companion-stations.tsx", import.meta.url),
      "utf8"
    );
    expect(source).toContain("Manual label review");
    expect(source).toContain("HomeRounds has not extracted or confirmed any detail.");
    expect(source).toMatch(/No\s+image is uploaded, extracted, or retained\./);
    expect(source).toContain('source: prepared ? "image_review" : "text_entry"');
    expect(source).not.toMatch(/modelExtracted|aiConfirmed|providerObservation/);
  });
});

describe("personal baseline comparison contracts", () => {
  const history = [
    baselineSample({ id: 1, day: 10, value: 72 }),
    baselineSample({ id: 2, day: 12, value: 74 }),
    baselineSample({ id: 3, day: 14, value: 73 })
  ];

  it("preserves unknown, first-sample, and insufficient-history states", () => {
    expect(
      projectPersonalBaseline({
        patientId: SENSING_PATIENT_ID,
        currentSample: null,
        history: [],
        policy,
        generatedAt: SENSING_NOW
      })
    ).toMatchObject({ status: "unknown", reason: "current_sample_unavailable" });
    expect(
      projectPersonalBaseline({
        patientId: SENSING_PATIENT_ID,
        currentSample: baselineSample({ id: 4, day: 16, value: 73 }),
        history: [],
        policy,
        generatedAt: SENSING_NOW
      })
    ).toMatchObject({ status: "first_sample", comparableSampleCount: 0 });
    expect(
      projectPersonalBaseline({
        patientId: SENSING_PATIENT_ID,
        currentSample: baselineSample({ id: 4, day: 16, value: 73 }),
        history: history.slice(0, 2),
        policy,
        generatedAt: SENSING_NOW
      })
    ).toMatchObject({
      status: "insufficient_history",
      comparableSampleCount: 2,
      requiredComparableSamples: 3
    });
  });

  it("projects changed and unchanged comparisons without clinical or workflow authority", () => {
    const unchanged = projectPersonalBaseline({
      patientId: SENSING_PATIENT_ID,
      currentSample: baselineSample({ id: 4, day: 16, value: 74 }),
      history,
      policy,
      generatedAt: SENSING_NOW
    });
    const changed = projectPersonalBaseline({
      patientId: SENSING_PATIENT_ID,
      currentSample: baselineSample({ id: 5, day: 16, value: 82 }),
      history,
      policy,
      generatedAt: SENSING_NOW
    });
    expect(unchanged).toMatchObject({
      status: "comparable_unchanged",
      comparison: { baselineMedian: 73, absoluteDelta: 1 },
      authority: { clinicalInterpretation: "none", workflowAuthority: false }
    });
    expect(changed).toMatchObject({
      status: "comparable_changed",
      comparison: { baselineMedian: 73, absoluteDelta: 9 },
      authority: { clinicalInterpretation: "none", workflowAuthority: false }
    });
  });

  it.each([
    [
      "provider",
      {
        ...fingerBaselineContext,
        provider: "vitallens",
        providerVersion: { status: "known", value: "vitallens-model-4.2" },
        device: { ...fingerBaselineContext.device, captureSurface: "front_camera" }
      } satisfies BaselineMeasurementContext,
      "provider_mismatch"
    ],
    [
      "algorithm version",
      {
        ...fingerBaselineContext,
        algorithmVersion: { status: "known", value: "finger_ppg_hr_v2" }
      } satisfies BaselineMeasurementContext,
      "algorithm_version_mismatch"
    ],
    [
      "device platform",
      {
        ...fingerBaselineContext,
        device: { ...fingerBaselineContext.device, platform: "android" }
      } satisfies BaselineMeasurementContext,
      "platform_mismatch"
    ],
    [
      "capture surface",
      {
        ...fingerBaselineContext,
        device: { ...fingerBaselineContext.device, captureSurface: "front_camera" }
      } satisfies BaselineMeasurementContext,
      "capture_surface_mismatch"
    ]
  ])("separates %s contexts", (_name, context, reason) => {
    const projection = projectPersonalBaseline({
      patientId: SENSING_PATIENT_ID,
      currentSample: baselineSample({ id: 20, day: 16, value: 73, context }),
      history,
      policy,
      generatedAt: SENSING_NOW
    });
    expect(projection).toMatchObject({
      status: "non_comparable",
      reasons: expect.arrayContaining([reason])
    });
  });

  it("makes retained media, transcript, and failed quality samples unrepresentable", () => {
    const valid = baselineSample({ id: 30, day: 16, value: 73 });
    expect(
      DerivedBaselineSampleSchema.safeParse({
        ...valid,
        provenance: { ...valid.provenance, rawMediaStored: true }
      }).success
    ).toBe(false);
    expect(
      DerivedBaselineSampleSchema.safeParse({
        ...valid,
        provenance: { ...valid.provenance, transcriptStored: true }
      }).success
    ).toBe(false);
    expect(
      DerivedBaselineSampleSchema.safeParse({
        ...valid,
        quality: { status: "fail", score: 0 }
      }).success
    ).toBe(false);
  });
});
