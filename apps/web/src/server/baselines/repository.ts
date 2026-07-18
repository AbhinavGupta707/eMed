import {
  BoundedPersonalizationProfileSchema,
  type BoundedPersonalizationProfile
} from "@homerounds/personalization";
import { DerivedBaselineSeriesSchema, type DerivedBaselineSeries } from "@homerounds/baselines";

export type BaselineSeriesRepository = {
  getSeries(patientId: string, contextKey: string): Promise<DerivedBaselineSeries | null>;
  listSeries(patientId: string): Promise<DerivedBaselineSeries[]>;
  saveSeries(series: DerivedBaselineSeries, expectedSeriesVersion: number | null): Promise<void>;
};

export type PersonalizationProfileRepository = {
  getProfile(patientId: string): Promise<BoundedPersonalizationProfile | null>;
  saveProfile(
    profile: BoundedPersonalizationProfile,
    expectedProfileVersion: number | null
  ): Promise<void>;
};

export type BaselineServerRepository = BaselineSeriesRepository & PersonalizationProfileRepository;

export class BaselineRepositoryConflictError extends Error {
  readonly code = "baseline_repository_conflict";

  constructor(readonly recordId: string) {
    super(`Structured baseline record ${recordId} changed concurrently.`);
    this.name = "BaselineRepositoryConflictError";
  }
}

export class InMemoryBaselineServerRepository implements BaselineServerRepository {
  readonly #series = new Map<string, DerivedBaselineSeries>();
  readonly #profiles = new Map<string, BoundedPersonalizationProfile>();

  async getSeries(patientId: string, contextKey: string): Promise<DerivedBaselineSeries | null> {
    const series = this.#series.get(this.#seriesKey(patientId, contextKey));
    return series ? structuredClone(series) : null;
  }

  async listSeries(patientId: string): Promise<DerivedBaselineSeries[]> {
    return [...this.#series.values()]
      .filter((series) => series.patientId === patientId)
      .map((series) => structuredClone(series));
  }

  async saveSeries(
    seriesInput: DerivedBaselineSeries,
    expectedSeriesVersion: number | null
  ): Promise<void> {
    const series = DerivedBaselineSeriesSchema.parse(seriesInput);
    const key = this.#seriesKey(series.patientId, series.contextKey);
    const current = this.#series.get(key);
    if (
      (expectedSeriesVersion === null && current !== undefined) ||
      (expectedSeriesVersion !== null && current?.seriesVersion !== expectedSeriesVersion)
    ) {
      throw new BaselineRepositoryConflictError(series.seriesId);
    }
    this.#series.set(key, structuredClone(series));
  }

  async getProfile(patientId: string): Promise<BoundedPersonalizationProfile | null> {
    const profile = this.#profiles.get(patientId);
    return profile ? structuredClone(profile) : null;
  }

  async saveProfile(
    profileInput: BoundedPersonalizationProfile,
    expectedProfileVersion: number | null
  ): Promise<void> {
    const profile = BoundedPersonalizationProfileSchema.parse(profileInput);
    const current = this.#profiles.get(profile.patientId);
    if (
      (expectedProfileVersion === null && current !== undefined) ||
      (expectedProfileVersion !== null && current?.profileVersion !== expectedProfileVersion)
    ) {
      throw new BaselineRepositoryConflictError(profile.patientId);
    }
    this.#profiles.set(profile.patientId, structuredClone(profile));
  }

  #seriesKey(patientId: string, contextKey: string): string {
    return `${patientId}\u001f${contextKey}`;
  }
}
