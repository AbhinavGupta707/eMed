import { defineConfig, devices } from "@playwright/test";

import { LANE_ORIGIN } from "./support";

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.e2e.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: LANE_ORIGIN,
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  webServer: {
    command: "pnpm --filter @homerounds/web exec next dev --hostname 127.0.0.1 --port 3102",
    env: { APP_BASE_URL: LANE_ORIGIN, APP_ENV: "development", DEMO_MODE: "true" },
    url: LANE_ORIGIN,
    reuseExistingServer: false,
    timeout: 120_000
  }
});
