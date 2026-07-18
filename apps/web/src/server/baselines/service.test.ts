import { describe, expect, it } from "vitest";

import {
  DerivedBaselineSampleSchema,
  type BaselineMeasurementContext
} from "../../../../../packages/baselines/src/index";

import { readSyntheticBaselineSeed, seedSyntheticBaselineHistory } from "./demo-seed";
import { BaselineRepositoryConflictError, InMemoryBaselineServerRepository } from "./repository";
import { BaselineServerService } from "./service";

const NOW = "2026-07-18T12:00:00.000Z";

function createHarness() {
  const repository = new InMemoryBaselineServerRepository();
  let nextId = 90;
  const service = new BaselineServerService({
    repository,
    clock: { now: () => NOW },
    ids: {
      createId: () => `90000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}`
    }
  });
  return { repository, service };
}

function currentPulse(
  value: number,
  id: number,
  context: BaselineMeasurementContext,
  observedAt = "2026-07-18T08:00:00.000Z"
) {
  return DerivedBaselineSampleSchema.parse({
    schemaVersion: "derived-baseline-sample.v1",
    sampleId: `80000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
    patientId: "synthetic-maya",
    dataClassification: "synthetic_demo",
    signal: { kind: "pulse_bpm", unit: "bpm" },
    value,
    observedAt,
    context,
    quality: { status: "pass", score: 0.95 },
    provenance: {
      schemaVersion: "baseline-sample-provenance.v1",
      sourceKind: "synthetic_seed",
      sourceFactId: `81000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
      roundId: `82000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
      assessmentSessionId: `83000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
      qualityGateVersion: "optical-quality-v1",
      structuredDerivedOnly: true,
      rawMediaStored: false,
      transcriptStored: false
    }
  });
}

describe("baseline server seam", () => {
  it("parses honest synthetic history with separated contexts and structured preferences", () => {
    const seed = readSyntheticBaselineSeed();
    expect(seed.series).toHaveLength(3);
    expect(new Set(seed.series.map((series) => series.contextKey))).toHaveLength(3);
    expect(seed.personalization).toMatchObject({
      patientId: "synthetic-maya",
      defaultDevice: { status: "set", value: "phone" },
      accessibility: {
        status: "set",
        modes: ["larger_text", "reduced_motion", "persistent_captions"]
      },
      language: { status: "set", languageTag: "en-GB" }
    });
    expect(seed.personalization.completedTasks).toHaveLength(4);
    expect(JSON.stringify(seed)).not.toMatch(/"(?:rawAudio|rawVideo|rawFrames|transcript)"/);
  });

  it("seeds idempotently and returns a bounded personalisation projection", async () => {
    const { service } = createHarness();
    await seedSyntheticBaselineHistory(service);
    await seedSyntheticBaselineHistory(service);

    await expect(service.listPatientSeries("synthetic-maya")).resolves.toHaveLength(3);
    await expect(service.getPersonalizationProjection("synthetic-maya", 2)).resolves.toMatchObject({
      recentCompletedTasks: [{}, {}],
      authority: { scope: "presentation_preferences_only", workflowAuthority: false }
    });
  });

  it("records comparable changed and unchanged samples against exact context history", async () => {
    const { service } = createHarness();
    await seedSyntheticBaselineHistory(service);
    const seed = readSyntheticBaselineSeed();
    const pulseSeries = seed.series.find((series) => series.context.provider === "finger_ppg");
    const pulsePolicy = seed.policies.find((policy) => policy.signal.kind === "pulse_bpm");
    if (!pulseSeries || !pulsePolicy) throw new Error("Synthetic pulse seed is incomplete.");

    const unchanged = await service.recordDerivedSample({
      sample: currentPulse(74, 1, pulseSeries.context, "2026-07-17T08:00:00.000Z"),
      policy: pulsePolicy
    });
    const changed = await service.recordDerivedSample({
      sample: currentPulse(84, 2, pulseSeries.context),
      policy: pulsePolicy
    });

    expect(unchanged).toMatchObject({
      replayed: false,
      series: { seriesVersion: 4 },
      projection: { status: "comparable_unchanged" }
    });
    expect(changed).toMatchObject({
      replayed: false,
      series: { seriesVersion: 5 },
      projection: { status: "comparable_changed" }
    });
  });

  it("does not compare a changed algorithm context and replays identical samples", async () => {
    const { service } = createHarness();
    await seedSyntheticBaselineHistory(service);
    const seed = readSyntheticBaselineSeed();
    const pulseSeries = seed.series.find((series) => series.context.provider === "finger_ppg");
    const pulsePolicy = seed.policies.find((policy) => policy.signal.kind === "pulse_bpm");
    if (!pulseSeries || !pulsePolicy) throw new Error("Synthetic pulse seed is incomplete.");
    const v2Context = {
      ...pulseSeries.context,
      algorithmVersion: { status: "known" as const, value: "finger_ppg_local_v2" }
    };
    const sample = currentPulse(74, 3, v2Context);

    const first = await service.recordDerivedSample({ sample, policy: pulsePolicy });
    const replay = await service.recordDerivedSample({ sample, policy: pulsePolicy });

    expect(first.projection).toMatchObject({
      status: "non_comparable",
      reasons: expect.arrayContaining(["algorithm_version_mismatch"])
    });
    expect(replay).toMatchObject({ replayed: true, series: { seriesVersion: 1 } });
  });

  it("enforces optimistic repository versions", async () => {
    const { repository } = createHarness();
    const series = readSyntheticBaselineSeed().series[0];
    if (!series) throw new Error("Synthetic baseline seed is empty.");
    await repository.saveSeries(series, null);

    await expect(repository.saveSeries(series, null)).rejects.toBeInstanceOf(
      BaselineRepositoryConflictError
    );
    await expect(repository.saveSeries(series, 2)).rejects.toBeInstanceOf(
      BaselineRepositoryConflictError
    );
  });
});
