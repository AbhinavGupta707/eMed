#!/usr/bin/env node

import { createDemoRuntime, loadScenarioBundle, parseArguments, seedScenarios } from "./lib.mjs";

try {
  const runtime = createDemoRuntime(parseArguments(process.argv.slice(2)));
  const bundle = await loadScenarioBundle();
  const seeded = await seedScenarios(runtime, bundle);
  for (const item of seeded) {
    console.log(
      `${item.scenarioId}: ${item.roundId} (${item.state}; ${item.created ? "created" : "already present"}; ${item.runtimeProfile})`
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Demo seed failed.");
  process.exitCode = 1;
}
