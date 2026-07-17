import { defineConfig, devices } from "@playwright/test";

const origin = "http://127.0.0.1:3143";

export default defineConfig({
  testDir: ".",
  testMatch: "voice-agent-accessibility.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  outputDir: "/tmp/homerounds-voice-agent-accessibility-results",
  timeout: 120_000,
  expect: { timeout: 12_000 },
  use: {
    baseURL: origin,
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  webServer: {
    command: `APP_ENV=development APP_BASE_URL=${origin} PERSISTENCE_PROVIDER=memory VOICE_PROVIDER=disabled VOICE_BIOMARKER_ENABLED=true INFERENCE_PROVIDER=fake FAKE_INFERENCE_PROFILE=deterministic ADAPTIVE_SELECTION_ENABLED=true MEDICATION_LABEL_AI_ENABLED=false NEXT_PUBLIC_VOICE_TEST_FIXTURE=synthetic pnpm --filter @homerounds/web dev --hostname 127.0.0.1 --port 3143`,
    url: origin,
    reuseExistingServer: false,
    timeout: 120_000
  },
  projects: [
    { name: "voice-agent-accessibility-chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "voice-agent-accessibility-iphone-webkit",
      use: { ...devices["iPhone 12"] }
    }
  ]
});
