import { defineConfig, devices } from "@playwright/test";

const origin = "http://127.0.0.1:3152";

export default defineConfig({
  testDir: ".",
  testMatch: "release-accessibility.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  outputDir: "/tmp/homerounds-final-pass-accessibility-results",
  timeout: 180_000,
  expect: { timeout: 10_000 },
  use: {
    ...devices["Desktop Chrome"],
    baseURL: origin,
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  webServer: {
    command: `APP_ENV=development APP_BASE_URL=${origin} PERSISTENCE_PROVIDER=memory VOICE_PROVIDER=disabled INFERENCE_PROVIDER=disabled ADAPTIVE_SELECTION_ENABLED=false MEDICATION_LABEL_AI_ENABLED=false pnpm --filter @homerounds/web dev --webpack --hostname 127.0.0.1 --port 3152`,
    url: origin,
    reuseExistingServer: false,
    timeout: 120_000
  },
  projects: [{ name: "final-pass-accessibility-chromium" }]
});
