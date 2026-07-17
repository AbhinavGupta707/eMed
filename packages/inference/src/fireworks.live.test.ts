import { expect, it } from "vitest";

import { StructuredAdaptiveSelectionProvider } from "./adaptive-selection";
import {
  createRuntimeFireworksDependencies,
  FireworksChatCompletionsTransport
} from "./fireworks-transport";
import { adaptiveInputFixture } from "./test-fixtures";

const apiKey = process.env.FIREWORKS_API_KEY;
const liveEnabled = process.env.RUN_LIVE_FIREWORKS_TESTS === "true" && Boolean(apiKey);
const liveIt = liveEnabled ? it : it.skip;

liveIt(
  "passes three consecutive exact-contract Fireworks selections (skipped without explicit opt-in and key)",
  async () => {
    const provider = new StructuredAdaptiveSelectionProvider(
      new FireworksChatCompletionsTransport({
        apiKey,
        dependencies: createRuntimeFireworksDependencies(),
        policy: { timeoutMs: 30_000, maxAttempts: 1 }
      })
    );
    const input = adaptiveInputFixture();

    for (let run = 0; run < 3; run += 1) {
      const result = await provider.select(input, new AbortController().signal);
      expect(result).toMatchObject({
        ok: true,
        envelope: {
          roundId: input.roundId,
          stateVersion: input.stateVersion,
          provenance: {
            provider: "fireworks",
            task: "adaptive_module_selection",
            modelAlias: "deepseek-v4-pro-none",
            contractVersion: "adaptive-selection.v1"
          }
        }
      });
    }
  },
  100_000
);
