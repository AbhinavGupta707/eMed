import { z } from "zod";

import {
  DerivedBaselineSeriesSchema,
  PersonalChangePolicySchema
} from "../../../../../packages/baselines/src/index";
import { BoundedPersonalizationProfileSchema } from "../../../../../packages/personalization/src/index";
import seedDocument from "../../../../../data/demo/baselines/maya-history.v1.json";

import type { BaselineServerService } from "./service";

export const SyntheticBaselineSeedSchema = z
  .object({
    schemaVersion: z.literal("synthetic-baseline-seed.v1"),
    dataClassification: z.literal("synthetic_demo"),
    patientId: z.string().trim().min(1).max(120),
    series: z.array(DerivedBaselineSeriesSchema).min(1).max(20),
    policies: z.array(PersonalChangePolicySchema).min(1).max(20),
    personalization: BoundedPersonalizationProfileSchema
  })
  .strict()
  .superRefine((seed, context) => {
    if (seed.personalization.patientId !== seed.patientId) {
      context.addIssue({
        code: "custom",
        path: ["personalization", "patientId"],
        message: "seed profile patient must match the seed"
      });
    }
    for (const [index, series] of seed.series.entries()) {
      if (series.patientId !== seed.patientId) {
        context.addIssue({
          code: "custom",
          path: ["series", index, "patientId"],
          message: "seed series patient must match the seed"
        });
      }
    }
  });
export type SyntheticBaselineSeed = z.infer<typeof SyntheticBaselineSeedSchema>;

export function readSyntheticBaselineSeed(): SyntheticBaselineSeed {
  return SyntheticBaselineSeedSchema.parse(seedDocument);
}

export async function seedSyntheticBaselineHistory(service: BaselineServerService): Promise<void> {
  const seed = readSyntheticBaselineSeed();
  for (const series of seed.series) await service.saveSeedSeries(series);
  await service.saveSeedProfile(seed.personalization);
}
