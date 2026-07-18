import { z } from "zod";

import {
  DerivedBaselineSampleSchema,
  DerivedBaselineSeriesSchema,
  canonicalBaselineContextKey,
  type DerivedBaselineSample,
  type DerivedBaselineSeries
} from "./schemas";

const CreateSeriesInputSchema = z
  .object({
    seriesId: z.uuid(),
    sample: DerivedBaselineSampleSchema,
    recordedAt: z.iso.datetime()
  })
  .strict();

const AppendSeriesInputSchema = z
  .object({
    series: DerivedBaselineSeriesSchema,
    sample: DerivedBaselineSampleSchema,
    expectedSeriesVersion: z.number().int().positive(),
    recordedAt: z.iso.datetime()
  })
  .strict();

export class BaselineSeriesConflictError extends Error {
  readonly code = "baseline_series_conflict";

  constructor(readonly reason: "stale_version" | "non_comparable" | "out_of_order") {
    super(`Derived baseline series rejected an append: ${reason}.`);
    this.name = "BaselineSeriesConflictError";
  }
}

export function createDerivedBaselineSeries(inputValue: {
  seriesId: string;
  sample: DerivedBaselineSample;
  recordedAt: string;
}): DerivedBaselineSeries {
  const input = CreateSeriesInputSchema.parse(inputValue);
  return DerivedBaselineSeriesSchema.parse({
    schemaVersion: "derived-baseline-series.v1",
    seriesId: input.seriesId,
    patientId: input.sample.patientId,
    dataClassification: "synthetic_demo",
    signal: input.sample.signal,
    context: input.sample.context,
    contextKey: canonicalBaselineContextKey(input.sample.signal, input.sample.context),
    seriesVersion: 1,
    samples: [input.sample],
    createdAt: input.recordedAt,
    updatedAt: input.recordedAt
  });
}

export function appendDerivedBaselineSample(inputValue: {
  series: DerivedBaselineSeries;
  sample: DerivedBaselineSample;
  expectedSeriesVersion: number;
  recordedAt: string;
}): DerivedBaselineSeries {
  const input = AppendSeriesInputSchema.parse(inputValue);
  if (input.series.seriesVersion !== input.expectedSeriesVersion) {
    throw new BaselineSeriesConflictError("stale_version");
  }
  const sampleContextKey = canonicalBaselineContextKey(input.sample.signal, input.sample.context);
  if (
    input.sample.patientId !== input.series.patientId ||
    sampleContextKey !== input.series.contextKey
  ) {
    throw new BaselineSeriesConflictError("non_comparable");
  }
  const prior = input.series.samples.at(-1);
  if (!prior || Date.parse(input.sample.observedAt) <= Date.parse(prior.observedAt)) {
    throw new BaselineSeriesConflictError("out_of_order");
  }
  return DerivedBaselineSeriesSchema.parse({
    ...input.series,
    seriesVersion: input.series.seriesVersion + 1,
    samples: [...input.series.samples, input.sample],
    updatedAt: input.recordedAt
  });
}
