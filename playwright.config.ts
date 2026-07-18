import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:3099",
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  webServer: {
    command:
      "APP_BASE_URL=http://127.0.0.1:3099 PERSISTENCE_PROVIDER=memory VOICE_PROVIDER=disabled INFERENCE_PROVIDER=disabled ADAPTIVE_SELECTION_ENABLED=false MEDICATION_LABEL_AI_ENABLED=false pnpm --filter @homerounds/web dev --webpack --hostname 127.0.0.1 --port 3099",
    url: "http://127.0.0.1:3099",
    reuseExistingServer: false,
    timeout: 120_000
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-safari-layout", use: { ...devices["iPhone 12"] } }
  ]
});
