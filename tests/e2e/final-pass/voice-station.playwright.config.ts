import { defineConfig, devices } from "@playwright/test";

const origin = "http://127.0.0.1:3155";

export default defineConfig({
  testDir: ".",
  testMatch: "voice-station.e2e.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  outputDir: "/tmp/homerounds-final-pass-voice-results",
  timeout: 180_000,
  expect: { timeout: 12_000 },
  use: {
    ...devices["Desktop Chrome"],
    baseURL: origin,
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  webServer: {
    command: `APP_ENV=development APP_BASE_URL=${origin} PERSISTENCE_PROVIDER=memory VOICE_PROVIDER=disabled VOICE_BIOMARKER_ENABLED=true INFERENCE_PROVIDER=fake FAKE_INFERENCE_PROFILE=deterministic ADAPTIVE_SELECTION_ENABLED=true MEDICATION_LABEL_AI_ENABLED=false NEXT_PUBLIC_VOICE_TEST_FIXTURE=synthetic pnpm --filter @homerounds/web dev --webpack --hostname 127.0.0.1 --port 3155`,
    url: origin,
    reuseExistingServer: false,
    timeout: 120_000
  },
  projects: [{ name: "final-pass-voice-fixture-chromium" }]
});
