import { expect, test } from "@playwright/test";

import {
  calmAnswers,
  completeStructuredAnswers,
  confirmSyntheticVoiceNarrative,
  expectNoBrowserFailures,
  installSyntheticMicrophone,
  installVoiceStationRouteFixture,
  monitorBrowserFailures,
  startRound,
  submitConfirmedReport,
  submitTypedReport
} from "../../e2e/voice-agent/support";

const FIXTURE_CONNECTION_BUDGET_MS = 1_000;
const WARM_REPORT_BUDGET_MS = 1_500;
const LOCAL_ANALYSIS_BUDGET_MS = 12_000;

test("keyless fixture connection and deterministic report selection stay inside local budgets", async ({
  page
}) => {
  const failures = monitorBrowserFailures(page);
  const started = await startRound(page, "/round?scenario=maya-happy-text");
  const reportWarmup = await page.request.post(`/api/rounds/${started.round.id}/report`, {
    headers: { origin: new URL(page.url()).origin },
    data: {}
  });
  expect(reportWarmup.status()).toBe(400);
  await completeStructuredAnswers(page, calmAnswers);
  const connectedMs = await confirmSyntheticVoiceNarrative(
    page,
    "Synthetic performance fixture for explicit confirmation."
  );
  expect(connectedMs).toBeLessThanOrEqual(FIXTURE_CONNECTION_BUDGET_MS);

  const reportStartedAt = performance.now();
  const report = await submitConfirmedReport(page);
  const reportMs = performance.now() - reportStartedAt;
  expect(report.selectedModuleId).toBe("capture.finger_ppg.pulse");
  expect(reportMs).toBeLessThanOrEqual(WARM_REPORT_BUDGET_MS);
  await expect(page.getByRole("heading", { level: 2, name: "Round Map" })).toBeVisible();
  expectNoBrowserFailures(failures);
});

test("local voice analysis reaches a bounded quality result without creating a failed fact", async ({
  page
}) => {
  const failures = monitorBrowserFailures(page);
  const submittedVoiceResults: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      /\/api\/rounds\/[^/]+\/voice-biomarker$/.test(new URL(request.url()).pathname)
    ) {
      submittedVoiceResults.push(request.url());
    }
  });
  await installSyntheticMicrophone(page, "silence");
  await installVoiceStationRouteFixture(page);
  await startRound(page, "/round?scenario=maya-poor-quality");
  await submitTypedReport(
    page,
    { ...calmAnswers, palpitations: "Comes and goes" },
    "Synthetic bounded local-analysis fixture."
  );
  await page.getByLabel(/I consent to one separate local sustained-vowel capture/i).check();

  const analysisStartedAt = performance.now();
  await page.getByRole("button", { name: "Start 7-second capture" }).click();
  await expect(
    page.getByRole("heading", { level: 3, name: "Retry the quality check" })
  ).toBeVisible({ timeout: LOCAL_ANALYSIS_BUDGET_MS });
  const analysisMs = performance.now() - analysisStartedAt;
  expect(analysisMs).toBeLessThanOrEqual(LOCAL_ANALYSIS_BUDGET_MS);
  await expect(page.getByText("No feature fact or measurement was created.")).toBeVisible();
  expect(submittedVoiceResults).toEqual([]);
  expectNoBrowserFailures(failures);
});
