import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.HOMEROUNDS_HOSTED_BASE_URL;

if (!baseURL) {
  throw new Error("HOMEROUNDS_HOSTED_BASE_URL is required for the hosted companion check");
}

export default defineConfig({
  testDir: ".",
  testMatch: "companion.e2e.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  outputDir: "/tmp/homerounds-companion-hosted-results",
  timeout: 180_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  projects: [{ name: "hosted-companion-chromium", use: { ...devices["Desktop Chrome"] } }]
});
