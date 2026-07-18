import { z } from "zod";

import {
  BoundedTriggerInferenceHandoffSchema,
  DeterministicTriggerEvaluationSchema,
  ServerEligibleTriggerCandidateSchema,
  TriggerFactKeySchema,
  type BoundedTriggerInferenceHandoff,
  type DeterministicTriggerEvaluation,
  type ServerEligibleTriggerCandidate
} from "./schemas";

const MemoryMetadataSchema = z
  .object({
    consentStatus: z.enum(["not_requested", "declined", "withdrawn", "granted"]),
    storeVersion: z.number().int().positive(),
    activeKeys: z.array(TriggerFactKeySchema).max(12)
  })
  .strict();

const ProjectHandoffInputSchema = z
  .object({
    evaluation: DeterministicTriggerEvaluationSchema,
    candidates: z.array(ServerEligibleTriggerCandidateSchema).min(1).max(8),
    memory: MemoryMetadataSchema.optional(),
    generatedAt: z.iso.datetime()
  })
  .strict();

export function projectBoundedTriggerInferenceHandoff(inputValue: {
  evaluation: DeterministicTriggerEvaluation;
  candidates: readonly ServerEligibleTriggerCandidate[];
  memory?: {
    consentStatus: "not_requested" | "declined" | "withdrawn" | "granted";
    storeVersion: number;
    activeKeys: readonly string[];
  };
  generatedAt: string;
}): BoundedTriggerInferenceHandoff {
  const input = ProjectHandoffInputSchema.parse(inputValue);
  if (input.evaluation.status !== "triggered") {
    throw new Error("Only a deterministic triggered proposal can be projected to inference.");
  }
  const changedFactKeys = input.evaluation.proposal.changedFacts
    .map(({ factKey }) => factKey)
    .sort();
  const context: BoundedTriggerInferenceHandoff["context"] = [
    {
      referenceId: input.evaluation.proposal.triggerId,
      summaryCode: "combined_personal_change",
      summary: `${changedFactKeys.length} structured synthetic facts changed under policy ${input.evaluation.policyVersion}; deterministic safety and workflow gates remain authoritative.`,
      factKeys: changedFactKeys
    }
  ];
  if (input.memory?.consentStatus === "granted" && input.memory.activeKeys.length > 0) {
    const activeKeys = [...new Set(input.memory.activeKeys)].sort();
    context.push({
      referenceId: `memory-metadata:v${input.memory.storeVersion}`,
      summaryCode: "consented_memory_metadata",
      summary: `Consented structured memory metadata is available for ${activeKeys.length} bounded keys; values are withheld from inference.`,
      factKeys: activeKeys
    });
  }
  return BoundedTriggerInferenceHandoffSchema.parse({
    schemaVersion: "bounded-trigger-inference-handoff.v1",
    triggerId: input.evaluation.proposal.triggerId,
    patientId: input.evaluation.patientId,
    dataClassification: "synthetic_demo",
    policyVersion: input.evaluation.policyVersion,
    generatedAt: input.generatedAt,
    context,
    candidates: input.candidates,
    exclusions: {
      rawFactValues: true,
      rawHistory: true,
      memoryValues: true,
      transcripts: true,
      prompts: true,
      providerPayloads: true,
      hiddenReasoning: true
    },
    authority: {
      candidateSelectionOnly: true,
      clinicalInterpretation: "none",
      urgencyAuthority: false,
      qualityAuthority: false,
      actionAuthority: false,
      workflowAuthority: false
    }
  });
}
