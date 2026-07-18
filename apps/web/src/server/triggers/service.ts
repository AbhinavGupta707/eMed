import { z } from "zod";

import {
  DeterministicTriggerEvaluationSchema,
  EvaluateTriggerRequestSchema,
  evaluateDeterministicTrigger,
  type DeterministicTriggerEvaluation,
  type EvaluateTriggerRequest
} from "../../../../../packages/triggers/src/index";

import {
  CommittedTriggerProposalSchema,
  type CommittedTriggerProposal,
  type TriggerProposalRepository
} from "./repository";

export type TriggerServerClock = { now(): string };

export type TriggerServerServiceDependencies = {
  repository: TriggerProposalRepository;
  clock: TriggerServerClock;
};

const EvaluateBoundedTriggerRequestSchema = EvaluateTriggerRequestSchema;
export type EvaluateBoundedTriggerRequest = EvaluateTriggerRequest;

export const EvaluateBoundedTriggerResultSchema = z
  .object({
    evaluation: DeterministicTriggerEvaluationSchema,
    committedProposal: CommittedTriggerProposalSchema.nullable(),
    replayed: z.boolean(),
    execution: z
      .object({
        mode: z.enum(["scheduled", "event"]),
        boundedEvaluation: z.literal(true),
        continuousMonitoring: z.literal(false),
        roundCreated: z.literal(false)
      })
      .strict()
  })
  .strict();
export type EvaluateBoundedTriggerResult = z.infer<typeof EvaluateBoundedTriggerResultSchema>;

export class TriggerServerService {
  readonly #repository: TriggerProposalRepository;
  readonly #clock: TriggerServerClock;

  constructor(dependencies: TriggerServerServiceDependencies) {
    this.#repository = dependencies.repository;
    this.#clock = dependencies.clock;
  }

  /** One bounded invocation only. Scheduling/event delivery belongs to the integration layer. */
  async evaluateBounded(
    inputValue: EvaluateBoundedTriggerRequest
  ): Promise<EvaluateBoundedTriggerResult> {
    const input = EvaluateBoundedTriggerRequestSchema.parse(inputValue);
    const now = z.iso.datetime().parse(this.#clock.now());
    const evaluation = evaluateDeterministicTrigger({ ...input, evaluatedAt: now });
    const execution = {
      mode: input.invocation.kind,
      boundedEvaluation: true as const,
      continuousMonitoring: false as const,
      roundCreated: false as const
    };
    if (evaluation.status !== "triggered") {
      return EvaluateBoundedTriggerResultSchema.parse({
        evaluation,
        committedProposal: null,
        replayed: false,
        execution
      });
    }
    const commit = await this.#repository.commit({
      schemaVersion: "committed-trigger-proposal.v1",
      evaluation,
      committedAt: now
    });
    return EvaluateBoundedTriggerResultSchema.parse({
      evaluation: commit.record.evaluation,
      committedProposal: commit.record,
      replayed: commit.replayed,
      execution
    });
  }

  async getCommittedProposal(idempotencyKey: string): Promise<CommittedTriggerProposal | null> {
    return this.#repository.getByIdempotencyKey(idempotencyKey);
  }
}

export function isTriggeredEvaluation(
  evaluation: DeterministicTriggerEvaluation
): evaluation is Extract<DeterministicTriggerEvaluation, { status: "triggered" }> {
  return evaluation.status === "triggered";
}
