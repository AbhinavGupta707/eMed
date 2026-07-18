import { defineConfig, devices } from "@playwright/test";

import { LANE_ORIGIN } from "../../e2e/clinician/support";

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  use: {
    ...devices["Desktop Chrome"],
    baseURL: LANE_ORIGIN,
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  webServer: {
    command:
      "PERSISTENCE_PROVIDER=memory VOICE_PROVIDER=disabled INFERENCE_PROVIDER=disabled ADAPTIVE_SELECTION_ENABLED=false MEDICATION_LABEL_AI_ENABLED=false pnpm --filter @homerounds/web exec next dev --webpack --hostname 127.0.0.1 --port 3102",
    env: { APP_BASE_URL: LANE_ORIGIN, APP_ENV: "development", DEMO_MODE: "true" },
    url: LANE_ORIGIN,
    reuseExistingServer: false,
    timeout: 120_000
  }
});
