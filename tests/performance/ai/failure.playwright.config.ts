import { defineConfig, devices } from "@playwright/test";

process.env.HOMEROUNDS_AI_PERFORMANCE_PROFILE = "failure";
const origin = "http://127.0.0.1:3132";

export default defineConfig({
  testDir: ".",
  testMatch: "adaptive-ai-performance.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  outputDir: "/tmp/homerounds-ai-failure-performance-results",
  timeout: 120_000,
  expect: { timeout: 12_000 },
  use: {
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  webServer: {
    command: `APP_ENV=development APP_BASE_URL=${origin} PERSISTENCE_PROVIDER=memory VOICE_PROVIDER=disabled INFERENCE_PROVIDER=fake FAKE_INFERENCE_PROFILE=failure ADAPTIVE_SELECTION_ENABLED=true MEDICATION_LABEL_AI_ENABLED=true NEXT_PUBLIC_VOICE_TEST_FIXTURE=synthetic pnpm --filter @homerounds/web dev --hostname 127.0.0.1 --port 3132`,
    url: origin,
    reuseExistingServer: false,
    timeout: 120_000
  },
  projects: [{ name: "ai-failure-performance-chromium", use: { ...devices["Desktop Chrome"] } }]
});
