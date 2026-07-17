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

const SAFE_FAILURE_CLASSES = [
  "schema",
  "anyof",
  "oneof",
  "const",
  "enum",
  "reference",
  "$ref",
  "object",
  "unsupported",
  "invalid",
  "model",
  "reasoning",
  "temperature",
  "token",
  "quota",
  "rate",
  "permission"
] as const;

liveIt(
  "passes three consecutive exact-contract Fireworks selections (skipped without explicit opt-in and key)",
  async () => {
    const runtimeDependencies = createRuntimeFireworksDependencies();
    const redactedHttpFailures: Array<{ status: number; classes: string[] }> = [];
    const provider = new StructuredAdaptiveSelectionProvider(
      new FireworksChatCompletionsTransport({
        apiKey,
        dependencies: {
          ...runtimeDependencies,
          fetch: async (input, init) => {
            const response = await runtimeDependencies.fetch(input, init);
            if (!response.ok) {
              let lowerCaseBody = "";
              try {
                lowerCaseBody = (await response.clone().text()).toLowerCase();
              } catch {
                // The transport still reports the typed failure when diagnostics are unreadable.
              }
              redactedHttpFailures.push({
                status: response.status,
                classes: SAFE_FAILURE_CLASSES.filter((value) => lowerCaseBody.includes(value))
              });
            }
            return response;
          }
        },
        policy: { timeoutMs: 30_000, maxAttempts: 1 }
      })
    );
    const input = adaptiveInputFixture();

    for (let run = 0; run < 3; run += 1) {
      const result = await provider.select(input, new AbortController().signal);
      expect(
        result,
        `redacted Fireworks result: ${JSON.stringify({ result, redactedHttpFailures })}`
      ).toMatchObject({
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
