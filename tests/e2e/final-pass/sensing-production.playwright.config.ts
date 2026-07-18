import { defineConfig, devices } from "@playwright/test";

const origin = "http://127.0.0.1:3156";

export default defineConfig({
  testDir: ".",
  testMatch: "finger-sensing.e2e.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  outputDir: "/tmp/homerounds-final-pass-sensing-production-results",
  timeout: 240_000,
  expect: { timeout: 15_000 },
  use: {
    ...devices["Desktop Chrome"],
    baseURL: origin,
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  webServer: {
    command: `APP_ENV=development APP_BASE_URL=${origin} PERSISTENCE_PROVIDER=memory VOICE_PROVIDER=disabled INFERENCE_PROVIDER=disabled ADAPTIVE_SELECTION_ENABLED=false MEDICATION_LABEL_AI_ENABLED=false pnpm --filter @homerounds/web build && APP_ENV=development APP_BASE_URL=${origin} PERSISTENCE_PROVIDER=memory VOICE_PROVIDER=disabled INFERENCE_PROVIDER=disabled ADAPTIVE_SELECTION_ENABLED=false MEDICATION_LABEL_AI_ENABLED=false pnpm --filter @homerounds/web exec next start --hostname 127.0.0.1 --port 3156`,
    url: origin,
    reuseExistingServer: false,
    timeout: 240_000
  },
  projects: [{ name: "final-pass-sensing-production-chromium" }]
});
