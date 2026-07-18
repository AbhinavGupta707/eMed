import { describe, expect, it } from "vitest";

import { projectBoundedTriggerInferenceHandoff } from "../../../../../packages/triggers/src/index";

import { readSyntheticTriggerSeed } from "./demo-seed";
import { InMemoryTriggerProposalRepository } from "./repository";
import { TriggerServerService } from "./service";

const NOW = "2026-07-18T12:00:00.000Z";

function harness() {
  const repository = new InMemoryTriggerProposalRepository();
  const service = new TriggerServerService({ repository, clock: { now: () => NOW } });
  return { repository, service };
}

describe("bounded proactive trigger server seam", () => {
  it("parses the synthetic seed and honestly reports a one-shot scheduled evaluation", async () => {
    const seed = readSyntheticTriggerSeed();
    const { service } = harness();
    const result = await service.evaluateBounded(seed.evaluation);

    expect(result).toMatchObject({
      evaluation: { status: "triggered", reason: "combined_personal_change" },
      replayed: false,
      execution: {
        mode: "scheduled",
        boundedEvaluation: true,
        continuousMonitoring: false,
        roundCreated: false
      },
      committedProposal: {
        evaluation: {
          proposal: { status: "proposed", authority: { workflowAuthority: false } },
          event: { roundCreated: false }
        }
      }
    });
  });

  it("atomically suppresses duplicate and concurrent round proposals", async () => {
    const seed = readSyntheticTriggerSeed();
    const { service } = harness();
    const [left, right] = await Promise.all([
      service.evaluateBounded(seed.evaluation),
      service.evaluateBounded(seed.evaluation)
    ]);

    expect([left.replayed, right.replayed].sort()).toEqual([false, true]);
    expect(left.evaluation).toEqual(right.evaluation);
    if (left.evaluation.status !== "triggered") throw new Error("Expected triggered fixture.");
    await expect(
      service.getCommittedProposal(left.evaluation.proposal.idempotencyKey)
    ).resolves.toMatchObject({
      evaluation: { proposal: { proposalId: left.evaluation.proposal.proposalId } }
    });
  });

  it("projects only fixed summaries, metadata keys, and server-eligible candidates", async () => {
    const seed = readSyntheticTriggerSeed();
    const { service } = harness();
    const result = await service.evaluateBounded(seed.evaluation);
    const handoff = projectBoundedTriggerInferenceHandoff({
      evaluation: result.evaluation,
      candidates: seed.eligibleCandidates,
      memory: seed.memoryMetadata,
      generatedAt: NOW
    });
    const serialized = JSON.stringify(handoff);

    expect(handoff.candidates).toHaveLength(2);
    expect(handoff.context.map(({ summaryCode }) => summaryCode)).toEqual([
      "combined_personal_change",
      "consented_memory_metadata"
    ]);
    expect(serialized).not.toContain("Ignore all prior instructions");
    expect(serialized).not.toContain("full history");
    expect(serialized).not.toContain("breakfast routine changed");
  });

  it("does not commit a proposal for unknown current facts", async () => {
    const seed = readSyntheticTriggerSeed();
    const { service } = harness();
    const currentFacts = seed.evaluation.currentFacts.map((fact, index) =>
      index === 0
        ? {
            ...fact,
            value: { status: "unknown" as const, reason: "quality_not_accepted" as const }
          }
        : fact
    );
    const result = await service.evaluateBounded({ ...seed.evaluation, currentFacts });

    expect(result).toMatchObject({
      evaluation: { status: "insufficient_data", proposal: null, event: null },
      committedProposal: null,
      replayed: false
    });
  });
});
