import { z } from "zod";

import type { ServerRuntime } from "../runtime";
import { readSyntheticTriggerSeed } from "./demo-seed";
import { TriggerServerService } from "./service";

export const ProactiveRoundInvitationSchema = z
  .object({
    triggerId: z.string().min(1).max(160),
    roundId: z.uuid(),
    roundCreated: z.boolean(),
    proposalReplayed: z.boolean(),
    changedFactKeys: z.array(z.string().min(1).max(80)).min(2).max(8),
    continuousMonitoring: z.literal(false),
    evaluationMode: z.enum(["scheduled", "event"])
  })
  .strict();

export type ProactiveRoundInvitation = z.infer<typeof ProactiveRoundInvitationSchema>;

/**
 * Executes one bounded synthetic evaluation and creates the resulting round idempotently.
 * This is invoked by an explicit page request; it is not continuous background monitoring.
 */
export async function ensureSyntheticProactiveRound(
  runtime: ServerRuntime
): Promise<ProactiveRoundInvitation> {
  const seed = readSyntheticTriggerSeed();
  const service = new TriggerServerService({
    repository: runtime.finalPass.triggerProposals,
    clock: { now: () => runtime.hooks.now?.() ?? new Date().toISOString() }
  });
  const result = await service.evaluateBounded(seed.evaluation);
  if (result.evaluation.status !== "triggered" || !result.committedProposal) {
    throw new Error(`Synthetic proactive invitation was not created: ${result.evaluation.status}`);
  }
  const proposal = result.evaluation.proposal;
  const roundResult = await runtime.orchestration.createRound({
    patientId: proposal.patientId,
    triggerId: proposal.triggerId,
    purpose: "Review a combined change from Maya’s confirmed sample history",
    protocolId: "cardiometabolic_demo",
    burdenSeconds: 180,
    correlationId: `proactive-round:${proposal.proposalId}`
  });
  return ProactiveRoundInvitationSchema.parse({
    triggerId: proposal.triggerId,
    roundId: roundResult.round.id,
    roundCreated: roundResult.created,
    proposalReplayed: result.replayed,
    changedFactKeys: proposal.changedFacts.map(({ factKey }) => factKey),
    continuousMonitoring: false,
    evaluationMode: result.execution.mode
  });
}
