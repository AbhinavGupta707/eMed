import { z } from "zod";

import { DeterministicTriggerEvaluationSchema } from "../../../../../packages/triggers/src/index";

const TriggeredEvaluationSchema = DeterministicTriggerEvaluationSchema.refine(
  (evaluation) => evaluation.status === "triggered",
  "only triggered proposal evaluations can be committed"
).transform((evaluation) => {
  if (evaluation.status !== "triggered") {
    throw new Error("Only triggered proposal evaluations can be committed.");
  }
  return evaluation;
});

export const CommittedTriggerProposalSchema = z
  .object({
    schemaVersion: z.literal("committed-trigger-proposal.v1"),
    evaluation: TriggeredEvaluationSchema,
    committedAt: z.iso.datetime()
  })
  .strict();
export type CommittedTriggerProposal = z.infer<typeof CommittedTriggerProposalSchema>;

export type TriggerProposalCommitResult = {
  readonly record: CommittedTriggerProposal;
  readonly replayed: boolean;
};

export type TriggerProposalRepository = {
  commit(record: CommittedTriggerProposal): Promise<TriggerProposalCommitResult>;
  getByIdempotencyKey(idempotencyKey: string): Promise<CommittedTriggerProposal | null>;
};

export class TriggerProposalConflictError extends Error {
  readonly code = "trigger_proposal_conflict";

  constructor(readonly idempotencyKey: string) {
    super(`Trigger proposal ${idempotencyKey} conflicts with an existing proposal.`);
    this.name = "TriggerProposalConflictError";
  }
}

export class InMemoryTriggerProposalRepository implements TriggerProposalRepository {
  readonly #records = new Map<string, CommittedTriggerProposal>();

  async commit(recordValue: CommittedTriggerProposal): Promise<TriggerProposalCommitResult> {
    const record = CommittedTriggerProposalSchema.parse(recordValue);
    const idempotencyKey = record.evaluation.proposal.idempotencyKey;
    const existing = this.#records.get(idempotencyKey);
    if (existing) {
      if (
        existing.evaluation.proposal.proposalId !== record.evaluation.proposal.proposalId ||
        existing.evaluation.proposal.triggerId !== record.evaluation.proposal.triggerId ||
        existing.evaluation.patientId !== record.evaluation.patientId ||
        existing.evaluation.policyVersion !== record.evaluation.policyVersion
      ) {
        throw new TriggerProposalConflictError(idempotencyKey);
      }
      return { record: structuredClone(existing), replayed: true };
    }
    this.#records.set(idempotencyKey, structuredClone(record));
    return { record: structuredClone(record), replayed: false };
  }

  async getByIdempotencyKey(idempotencyKey: string): Promise<CommittedTriggerProposal | null> {
    const record = this.#records.get(z.string().trim().min(1).max(160).parse(idempotencyKey));
    return record ? structuredClone(record) : null;
  }
}
