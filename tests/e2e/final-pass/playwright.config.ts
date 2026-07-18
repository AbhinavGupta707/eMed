import { defineConfig, devices } from "@playwright/test";

const origin = "http://127.0.0.1:3151";
const desktopChrome = devices["Desktop Chrome"];

export default defineConfig({
  testDir: ".",
  testMatch: "release-boundary.e2e.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  outputDir: "/tmp/homerounds-final-pass-e2e-results",
  timeout: 180_000,
  expect: { timeout: 12_000 },
  use: {
    ...desktopChrome,
    baseURL: origin,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
  },
  webServer: {
    command: `APP_ENV=development APP_BASE_URL=${origin} PERSISTENCE_PROVIDER=memory VOICE_PROVIDER=disabled VOICE_BIOMARKER_ENABLED=false INFERENCE_PROVIDER=fake FAKE_INFERENCE_PROFILE=deterministic ADAPTIVE_SELECTION_ENABLED=true MEDICATION_LABEL_AI_ENABLED=true pnpm --filter @homerounds/web build && APP_ENV=development APP_BASE_URL=${origin} PERSISTENCE_PROVIDER=memory VOICE_PROVIDER=disabled VOICE_BIOMARKER_ENABLED=false INFERENCE_PROVIDER=fake FAKE_INFERENCE_PROFILE=deterministic ADAPTIVE_SELECTION_ENABLED=true MEDICATION_LABEL_AI_ENABLED=true pnpm --filter @homerounds/web exec next start --hostname 127.0.0.1 --port 3151`,
    url: origin,
    reuseExistingServer: false,
    timeout: 120_000
  },
  projects: [{ name: "emulated-windows-chrome" }]
});
