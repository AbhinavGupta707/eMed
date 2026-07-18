import { DerivedBaselineSeriesSchema, type DerivedBaselineSeries } from "@homerounds/baselines";
import {
  BoundedPersonalizationProfileSchema,
  type BoundedPersonalizationProfile
} from "@homerounds/personalization";
import postgres from "postgres";
import { z } from "zod";

type Client = ReturnType<typeof postgres>;

const StoredRecordRowSchema = z.object({ record: z.unknown() }).passthrough();

function recordFrom<T>(rows: readonly unknown[], schema: z.ZodType<T>): T | null {
  const row = rows[0];
  if (!row) return null;
  return schema.parse(StoredRecordRowSchema.parse(row).record);
}

export class PostgresBaselineRepositoryConflictError extends Error {
  readonly code = "baseline_repository_conflict";

  constructor(readonly recordId: string) {
    super(`Structured baseline record ${recordId} changed concurrently.`);
    this.name = "PostgresBaselineRepositoryConflictError";
  }
}

export class PostgresBaselineRepository {
  constructor(private readonly client: Client) {}

  async getSeries(patientId: string, contextKey: string): Promise<DerivedBaselineSeries | null> {
    return recordFrom(
      await this.client`
        select record from baseline_series
        where patient_id = ${patientId} and context_key = ${contextKey}
        limit 1
      `,
      DerivedBaselineSeriesSchema
    );
  }

  async listSeries(patientId: string): Promise<DerivedBaselineSeries[]> {
    const rows = await this.client`
      select record from baseline_series
      where patient_id = ${patientId}
      order by updated_at asc, context_key asc
    `;
    return rows.map((row) =>
      DerivedBaselineSeriesSchema.parse(StoredRecordRowSchema.parse(row).record)
    );
  }

  async saveSeries(
    seriesInput: DerivedBaselineSeries,
    expectedSeriesVersion: number | null
  ): Promise<void> {
    const series = DerivedBaselineSeriesSchema.parse(seriesInput);
    const serialized = JSON.stringify(series);
    if (expectedSeriesVersion === null) {
      const inserted = await this.client`
        insert into baseline_series (
          patient_id, context_key, series_id, series_version, updated_at, record
        ) values (
          ${series.patientId}, ${series.contextKey}, ${series.seriesId}, ${series.seriesVersion},
          ${series.updatedAt}, ${serialized}::text::jsonb
        )
        on conflict (patient_id, context_key) do nothing
        returning record
      `;
      if (inserted.length > 0) return;
      const existing = await this.getSeries(series.patientId, series.contextKey);
      if (existing && JSON.stringify(existing) === serialized) return;
      throw new PostgresBaselineRepositoryConflictError(series.seriesId);
    }

    const updated = await this.client`
      update baseline_series set
        series_version = ${series.seriesVersion}, updated_at = ${series.updatedAt},
        record = ${serialized}::text::jsonb
      where patient_id = ${series.patientId} and context_key = ${series.contextKey}
        and series_version = ${expectedSeriesVersion}
      returning record
    `;
    if (updated.length === 0) {
      throw new PostgresBaselineRepositoryConflictError(series.seriesId);
    }
  }

  async getProfile(patientId: string): Promise<BoundedPersonalizationProfile | null> {
    return recordFrom(
      await this.client`
        select record from personalization_profiles where patient_id = ${patientId} limit 1
      `,
      BoundedPersonalizationProfileSchema
    );
  }

  async saveProfile(
    profileInput: BoundedPersonalizationProfile,
    expectedProfileVersion: number | null
  ): Promise<void> {
    const profile = BoundedPersonalizationProfileSchema.parse(profileInput);
    const serialized = JSON.stringify(profile);
    if (expectedProfileVersion === null) {
      const inserted = await this.client`
        insert into personalization_profiles (
          patient_id, profile_version, updated_at, record
        ) values (
          ${profile.patientId}, ${profile.profileVersion}, ${profile.updatedAt},
          ${serialized}::text::jsonb
        )
        on conflict (patient_id) do nothing
        returning record
      `;
      if (inserted.length > 0) return;
      const existing = await this.getProfile(profile.patientId);
      if (existing && JSON.stringify(existing) === serialized) return;
      throw new PostgresBaselineRepositoryConflictError(profile.patientId);
    }

    const updated = await this.client`
      update personalization_profiles set
        profile_version = ${profile.profileVersion}, updated_at = ${profile.updatedAt},
        record = ${serialized}::text::jsonb
      where patient_id = ${profile.patientId} and profile_version = ${expectedProfileVersion}
      returning record
    `;
    if (updated.length === 0) {
      throw new PostgresBaselineRepositoryConflictError(profile.patientId);
    }
  }
}

export type PostgresBaselineRepositoryConnection = {
  repository: PostgresBaselineRepository;
  close: () => Promise<void>;
};

export function connectPostgresBaselineRepository(
  databaseUrl: string
): PostgresBaselineRepositoryConnection {
  z.string().url().parse(databaseUrl);
  const client = postgres(databaseUrl, {
    max: 3,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: true
  });
  return {
    repository: new PostgresBaselineRepository(client),
    close: async () => client.end({ timeout: 5 })
  };
}
