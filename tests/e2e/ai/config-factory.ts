import { defineConfig, devices } from "@playwright/test";

export type AiTestProfile = "abstain" | "deterministic" | "failure" | "medication" | "slow";

export function aiPlaywrightConfig(profile: AiTestProfile, port: number) {
  process.env.HOMEROUNDS_AI_PLAYWRIGHT_PROFILE = profile;
  const origin = `http://127.0.0.1:${port}`;
  return defineConfig({
    testDir: ".",
    testMatch: "adaptive-ai.e2e.ts",
    fullyParallel: false,
    workers: 1,
    retries: 0,
    reporter: "list",
    outputDir: `/tmp/homerounds-ai-${profile}-e2e-results`,
    timeout: 120_000,
    expect: { timeout: 12_000 },
    use: {
      screenshot: "only-on-failure",
      trace: "retain-on-failure",
      ...devices["Desktop Chrome"]
    },
    webServer: {
      command: `APP_ENV=development APP_BASE_URL=${origin} PERSISTENCE_PROVIDER=memory VOICE_PROVIDER=disabled INFERENCE_PROVIDER=fake FAKE_INFERENCE_PROFILE=${profile} ADAPTIVE_SELECTION_ENABLED=true MEDICATION_LABEL_AI_ENABLED=true NEXT_PUBLIC_VOICE_TEST_FIXTURE=synthetic pnpm --filter @homerounds/web dev --hostname 127.0.0.1 --port ${port}`,
      url: origin,
      reuseExistingServer: false,
      timeout: 120_000
    },
    projects: [{ name: `ai-${profile}-chromium` }]
  });
}
