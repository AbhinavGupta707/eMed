import { defineConfig, devices } from "@playwright/test";

const origin = "http://127.0.0.1:3142";

export default defineConfig({
  testDir: ".",
  testMatch: "voice-agent.e2e.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  outputDir: "/tmp/homerounds-voice-agent-fallback-results",
  timeout: 120_000,
  expect: { timeout: 12_000 },
  use: {
    baseURL: origin,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"]
  },
  webServer: {
    command: `APP_ENV=development APP_BASE_URL=${origin} PERSISTENCE_PROVIDER=memory VOICE_PROVIDER=disabled VOICE_BIOMARKER_ENABLED=false INFERENCE_PROVIDER=fake FAKE_INFERENCE_PROFILE=deterministic ADAPTIVE_SELECTION_ENABLED=true MEDICATION_LABEL_AI_ENABLED=false pnpm --filter @homerounds/web dev --hostname 127.0.0.1 --port 3142`,
    url: origin,
    reuseExistingServer: false,
    timeout: 120_000
  },
  projects: [{ name: "voice-agent-fallback-chromium" }]
});
