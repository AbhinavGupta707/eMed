import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "sensing-performance.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  outputDir: "/tmp/homerounds-sensing-performance-results",
  timeout: 180_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://127.0.0.1:3122",
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  webServer: {
    command:
      "APP_BASE_URL=http://127.0.0.1:3122 PERSISTENCE_PROVIDER=memory VOICE_PROVIDER=disabled INFERENCE_PROVIDER=disabled ADAPTIVE_SELECTION_ENABLED=false MEDICATION_LABEL_AI_ENABLED=false pnpm --filter @homerounds/web dev --hostname 127.0.0.1 --port 3122",
    url: "http://127.0.0.1:3122",
    reuseExistingServer: false,
    timeout: 120_000
  },
  projects: [{ name: "sensing-performance-chromium", use: { ...devices["Desktop Chrome"] } }]
});
