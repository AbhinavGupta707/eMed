#!/usr/bin/env node

import {
  checkSeededScenarios,
  createDemoRuntime,
  loadScenarioBundle,
  parseArguments
} from "./lib.mjs";

try {
  const runtime = createDemoRuntime(parseArguments(process.argv.slice(2)));
  const bundle = await loadScenarioBundle();
  const checked = await checkSeededScenarios(runtime, bundle);
  for (const item of checked) {
    console.log(`${item.scenarioId}: ready at ${item.roundId} (${item.runtimeProfile})`);
  }
  console.log("Demo baseline is ready: three invited rounds and an empty scoped clinician queue.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Demo check failed.");
  process.exitCode = 1;
}
