import { describe, expect, it } from "vitest";

import { DisabledAdaptiveSelectionProvider, FakeAdaptiveSelectionProvider } from "./baseline";

const input = {
  contractVersion: "adaptive-selection.v1" as const,
  roundId: "cc80d269-2f79-4328-a129-98cac85219e4",
  stateVersion: 2,
  syntheticDataOnly: true as const,
  redFlagGate: "clear" as const,
  neededFactKeys: ["pulse_bpm" as const],
  burdenSecondsRemaining: 60,
  context: [],
  candidates: [
    {
      id: "pulse.local",
      kind: "pulse_capture" as const,
      label: "Check pulse",
      description: "A short local optical pulse check.",
      producesFactKeys: ["pulse_bpm" as const],
      availability: { status: "available" as const },
      estimatedBurdenSeconds: 30,
      deterministicRank: 0
    }
  ],
  deterministicFallbackModuleId: "pulse.local"
};

describe("keyless inference baseline", () => {
  it("fails closed when inference is disabled", async () => {
    await expect(new DisabledAdaptiveSelectionProvider().select()).resolves.toMatchObject({
      ok: false,
      failure: { code: "missing_configuration" }
    });
  });

  it("returns a schema-valid deterministic fake proposal", async () => {
    const provider = new FakeAdaptiveSelectionProvider({
      createId: () => "71f1b1b2-9e60-44d7-bb87-cdf5f96059d4",
      now: () => "2026-07-17T09:00:00.000Z"
    });

    await expect(provider.select(input, new AbortController().signal)).resolves.toMatchObject({
      ok: true,
      envelope: { decision: { decision: "select", candidateModuleId: "pulse.local" } }
    });
  });
});
