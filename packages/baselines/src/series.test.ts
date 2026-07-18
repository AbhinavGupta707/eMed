import { describe, expect, it } from "vitest";

import { DerivedBaselineSampleSchema } from "./schemas";
import {
  BaselineSeriesConflictError,
  appendDerivedBaselineSample,
  createDerivedBaselineSeries
} from "./series";

function sample(id: string, observedAt: string, algorithm = "finger_ppg_local_v1") {
  return DerivedBaselineSampleSchema.parse({
    schemaVersion: "derived-baseline-sample.v1",
    sampleId: id,
    patientId: "synthetic-maya",
    dataClassification: "synthetic_demo",
    signal: { kind: "pulse_bpm", unit: "bpm" },
    value: 73,
    observedAt,
    context: {
      schemaVersion: "baseline-measurement-context.v1",
      provider: "finger_ppg",
      providerVersion: { status: "not_applicable" },
      algorithmVersion: { status: "known", value: algorithm },
      device: {
        schemaVersion: "device-context.v1",
        deviceClass: "phone",
        platform: "ios",
        captureSurface: "rear_camera"
      }
    },
    quality: { status: "pass", score: 0.9 },
    provenance: {
      schemaVersion: "baseline-sample-provenance.v1",
      sourceKind: "synthetic_seed",
      sourceFactId: "30000000-0000-4000-8000-000000000001",
      roundId: "40000000-0000-4000-8000-000000000001",
      assessmentSessionId: "50000000-0000-4000-8000-000000000001",
      qualityGateVersion: "optical-quality-v1",
      structuredDerivedOnly: true,
      rawMediaStored: false,
      transcriptStored: false
    }
  });
}

describe("versioned derived baseline series", () => {
  it("creates and appends strictly chronological comparable samples", () => {
    const first = sample("10000000-0000-4000-8000-000000000001", "2026-07-10T08:00:00.000Z");
    const series = createDerivedBaselineSeries({
      seriesId: "20000000-0000-4000-8000-000000000001",
      sample: first,
      recordedAt: "2026-07-10T08:00:01.000Z"
    });
    const updated = appendDerivedBaselineSample({
      series,
      sample: sample("10000000-0000-4000-8000-000000000002", "2026-07-12T08:00:00.000Z"),
      expectedSeriesVersion: 1,
      recordedAt: "2026-07-12T08:00:01.000Z"
    });

    expect(updated).toMatchObject({
      seriesVersion: 2,
      samples: [{ sampleId: first.sampleId }, {}]
    });
  });

  it("rejects stale, non-comparable, and out-of-order appends", () => {
    const first = sample("10000000-0000-4000-8000-000000000001", "2026-07-10T08:00:00.000Z");
    const series = createDerivedBaselineSeries({
      seriesId: "20000000-0000-4000-8000-000000000001",
      sample: first,
      recordedAt: "2026-07-10T08:00:01.000Z"
    });
    const next = sample("10000000-0000-4000-8000-000000000002", "2026-07-12T08:00:00.000Z");

    expect(() =>
      appendDerivedBaselineSample({
        series,
        sample: next,
        expectedSeriesVersion: 2,
        recordedAt: "2026-07-12T08:00:01.000Z"
      })
    ).toThrowError(new BaselineSeriesConflictError("stale_version"));
    expect(() =>
      appendDerivedBaselineSample({
        series,
        sample: sample(
          "10000000-0000-4000-8000-000000000003",
          "2026-07-12T08:00:00.000Z",
          "finger_ppg_local_v2"
        ),
        expectedSeriesVersion: 1,
        recordedAt: "2026-07-12T08:00:01.000Z"
      })
    ).toThrowError(new BaselineSeriesConflictError("non_comparable"));
    expect(() =>
      appendDerivedBaselineSample({
        series,
        sample: sample("10000000-0000-4000-8000-000000000004", "2026-07-09T08:00:00.000Z"),
        expectedSeriesVersion: 1,
        recordedAt: "2026-07-12T08:00:01.000Z"
      })
    ).toThrowError(new BaselineSeriesConflictError("out_of_order"));
  });
});
