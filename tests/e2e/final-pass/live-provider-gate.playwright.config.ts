import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "live-provider-gate.e2e.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  outputDir: "/tmp/homerounds-final-pass-live-provider-results",
  projects: [{ name: "live-provider-opt-in-gate" }]
});
