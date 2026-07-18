import { z } from "zod";

import {
  BaselineProjectionSchema,
  DerivedBaselineSampleSchema,
  DerivedBaselineSeriesSchema,
  PersonalChangePolicySchema,
  appendDerivedBaselineSample,
  canonicalBaselineContextKey,
  createDerivedBaselineSeries,
  projectPersonalBaseline,
  type BaselineProjection,
  type DerivedBaselineSample,
  type DerivedBaselineSeries,
  type PersonalChangePolicy
} from "../../../../../packages/baselines/src/index";
import {
  BoundedPersonalizationProfileSchema,
  BoundedPersonalizationProjectionSchema,
  projectBoundedPersonalization,
  type BoundedPersonalizationProfile,
  type BoundedPersonalizationProjection
} from "../../../../../packages/personalization/src/index";

import type { BaselineServerRepository } from "./repository";

export type BaselineServerClock = { now(): string };
export type BaselineServerIdSource = { createId(): string };

export type BaselineServerServiceDependencies = {
  repository: BaselineServerRepository;
  clock: BaselineServerClock;
  ids: BaselineServerIdSource;
};

const RecordSampleInputSchema = z
  .object({
    sample: DerivedBaselineSampleSchema,
    policy: PersonalChangePolicySchema
  })
  .strict();

export const RecordBaselineSampleResultSchema = z
  .object({
    series: DerivedBaselineSeriesSchema,
    projection: BaselineProjectionSchema,
    replayed: z.boolean()
  })
  .strict();
export type RecordBaselineSampleResult = z.infer<typeof RecordBaselineSampleResultSchema>;

export class BaselineServerService {
  readonly #repository: BaselineServerRepository;
  readonly #clock: BaselineServerClock;
  readonly #ids: BaselineServerIdSource;

  constructor(dependencies: BaselineServerServiceDependencies) {
    this.#repository = dependencies.repository;
    this.#clock = dependencies.clock;
    this.#ids = dependencies.ids;
  }

  async recordDerivedSample(inputValue: {
    sample: DerivedBaselineSample;
    policy: PersonalChangePolicy;
  }): Promise<RecordBaselineSampleResult> {
    const input = RecordSampleInputSchema.parse(inputValue);
    const now = z.iso.datetime().parse(this.#clock.now());
    const allSeries = await this.#repository.listSeries(input.sample.patientId);
    const allSamples = allSeries.flatMap((series) => series.samples);
    const priorDuplicate = allSamples.find((sample) => sample.sampleId === input.sample.sampleId);
    if (priorDuplicate && JSON.stringify(priorDuplicate) !== JSON.stringify(input.sample)) {
      throw new Error(
        `Baseline sample ${input.sample.sampleId} was reused with different content.`
      );
    }
    const history = allSamples.filter(
      (sample) =>
        sample.sampleId !== input.sample.sampleId &&
        Date.parse(sample.observedAt) < Date.parse(input.sample.observedAt)
    );
    const projection = projectPersonalBaseline({
      patientId: input.sample.patientId,
      currentSample: input.sample,
      history,
      policy: input.policy,
      generatedAt: now
    });
    const contextKey = canonicalBaselineContextKey(input.sample.signal, input.sample.context);
    const existing = await this.#repository.getSeries(input.sample.patientId, contextKey);
    if (priorDuplicate) {
      if (!existing) throw new Error("A baseline sample exists without its versioned series.");
      return RecordBaselineSampleResultSchema.parse({
        series: existing,
        projection,
        replayed: true
      });
    }
    const series = existing
      ? appendDerivedBaselineSample({
          series: existing,
          sample: input.sample,
          expectedSeriesVersion: existing.seriesVersion,
          recordedAt: now
        })
      : createDerivedBaselineSeries({
          seriesId: z.uuid().parse(this.#ids.createId()),
          sample: input.sample,
          recordedAt: now
        });
    await this.#repository.saveSeries(series, existing?.seriesVersion ?? null);
    return RecordBaselineSampleResultSchema.parse({ series, projection, replayed: false });
  }

  async saveSeedSeries(seriesInput: DerivedBaselineSeries): Promise<void> {
    const series = DerivedBaselineSeriesSchema.parse(seriesInput);
    const current = await this.#repository.getSeries(series.patientId, series.contextKey);
    if (current) {
      if (JSON.stringify(current) !== JSON.stringify(series)) {
        throw new Error(
          `Synthetic baseline series ${series.seriesId} conflicts with existing data.`
        );
      }
      return;
    }
    await this.#repository.saveSeries(series, null);
  }

  async saveSeedProfile(profileInput: BoundedPersonalizationProfile): Promise<void> {
    const profile = BoundedPersonalizationProfileSchema.parse(profileInput);
    const current = await this.#repository.getProfile(profile.patientId);
    if (current) {
      if (JSON.stringify(current) !== JSON.stringify(profile)) {
        throw new Error(`Synthetic personalisation profile ${profile.patientId} conflicts.`);
      }
      return;
    }
    await this.#repository.saveProfile(profile, null);
  }

  async getPersonalizationProjection(
    patientId: string,
    completedTaskLimit = 8
  ): Promise<BoundedPersonalizationProjection | null> {
    const profile = await this.#repository.getProfile(
      z.string().trim().min(1).max(120).parse(patientId)
    );
    if (!profile) return null;
    return BoundedPersonalizationProjectionSchema.parse(
      projectBoundedPersonalization({
        profile,
        generatedAt: z.iso.datetime().parse(this.#clock.now()),
        completedTaskLimit
      })
    );
  }

  async listPatientSeries(patientId: string): Promise<DerivedBaselineSeries[]> {
    const series = await this.#repository.listSeries(
      z.string().trim().min(1).max(120).parse(patientId)
    );
    return z.array(DerivedBaselineSeriesSchema).parse(series);
  }

  project(
    currentSample: DerivedBaselineSample | null,
    history: readonly DerivedBaselineSample[],
    policy: PersonalChangePolicy,
    patientId: string
  ): BaselineProjection {
    return projectPersonalBaseline({
      patientId,
      currentSample,
      history,
      policy,
      generatedAt: z.iso.datetime().parse(this.#clock.now())
    });
  }
}
