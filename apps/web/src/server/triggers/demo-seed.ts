import { z } from "zod";

import {
  EvaluateTriggerRequestSchema,
  ServerEligibleTriggerCandidateSchema,
  TriggerFactKeySchema
} from "../../../../../packages/triggers/src/index";
import seedDocument from "../../../../../data/demo/triggers/maya-combined-change.v1.json";

const SyntheticTriggerSeedSchema = z
  .object({
    schemaVersion: z.literal("synthetic-trigger-seed.v1"),
    dataClassification: z.literal("synthetic_demo"),
    evaluation: EvaluateTriggerRequestSchema,
    memoryMetadata: z
      .object({
        consentStatus: z.literal("granted"),
        storeVersion: z.number().int().positive(),
        activeKeys: z.array(TriggerFactKeySchema).max(12)
      })
      .strict(),
    eligibleCandidates: z.array(ServerEligibleTriggerCandidateSchema).min(1).max(8)
  })
  .strict();
export type SyntheticTriggerSeed = z.infer<typeof SyntheticTriggerSeedSchema>;

export function readSyntheticTriggerSeed(): SyntheticTriggerSeed {
  return SyntheticTriggerSeedSchema.parse(seedDocument);
}
