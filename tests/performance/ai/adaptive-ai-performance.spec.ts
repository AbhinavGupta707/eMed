import { expect, test } from "@playwright/test";

import {
  calmAnswers,
  completeStructuredAnswers,
  confirmTypedNarrative,
  expectNoBrowserFailures,
  monitorBrowserFailures,
  scenarioUrl,
  startRound
} from "../../e2e/ai/support";

const slowOrigin = "http://127.0.0.1:3131";
const failureOrigin = "http://127.0.0.1:3132";
const WARM_DOM_CONTENT_LOADED_BUDGET_MS = 2_000;
const WARM_LOAD_BUDGET_MS = 2_500;
const WARM_ROUND_API_BUDGET_MS = 750;
const SLOW_SELECTION_MINIMUM_MS = 1_000;
const SLOW_SELECTION_BUDGET_MS = 3_500;
const FAILURE_FALLBACK_BUDGET_MS = 1_500;
const CUMULATIVE_LAYOUT_SHIFT_BUDGET = 0.1;
const currentProfile = process.env.HOMEROUNDS_AI_PERFORMANCE_PROFILE;

async function installClsObserver(page: import("@playwright/test").Page): Promise<void> {
  await page.addInitScript(() => {
    const measuredWindow = window as Window & { __homeroundsAiCls?: number };
    measuredWindow.__homeroundsAiCls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number };
        if (!shift.hadRecentInput) measuredWindow.__homeroundsAiCls! += shift.value ?? 0;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
}

test("warm shell, persisted API, slow selection, and CLS remain inside bounded local budgets", async ({
  page
}) => {
  test.skip(currentProfile !== "slow", "slow performance profile only");
  const failures = monitorBrowserFailures(page);
  await installClsObserver(page);
  await page.goto(scenarioUrl(slowOrigin, "maya-happy-text"));
  await expect(
    page.getByRole("heading", { level: 1, name: "Your two-minute check is ready" })
  ).toBeVisible();

  await page.reload({ waitUntil: "load" });
  const navigation = await page.evaluate(() => {
    const entry = performance.getEntriesByType("navigation")[0] as
      PerformanceNavigationTiming | undefined;
    return entry
      ? {
          domContentLoadedMs: entry.domContentLoadedEventEnd - entry.startTime,
          loadMs: entry.loadEventEnd - entry.startTime
        }
      : null;
  });
  expect(navigation).not.toBeNull();
  expect(navigation!.domContentLoadedMs).toBeLessThanOrEqual(WARM_DOM_CONTENT_LOADED_BUDGET_MS);
  expect(navigation!.loadMs).toBeLessThanOrEqual(WARM_LOAD_BUDGET_MS);

  const started = await startRound(page, scenarioUrl(slowOrigin, "maya-happy-text"));
  const roundRouteWarmup = await page.request.get(`${slowOrigin}/api/rounds/${started.round.id}`);
  expect(roundRouteWarmup.status()).toBe(200);
  const apiStartedAt = performance.now();
  const warmRoundResponse = await page.request.get(`${slowOrigin}/api/rounds/${started.round.id}`);
  const warmRoundApiMs = performance.now() - apiStartedAt;
  expect(warmRoundResponse.status()).toBe(200);
  expect(warmRoundApiMs).toBeLessThanOrEqual(WARM_ROUND_API_BUDGET_MS);

  const reportRouteWarmup = await page.request.post(
    `${slowOrigin}/api/rounds/${started.round.id}/report`,
    { headers: { origin: slowOrigin }, data: {} }
  );
  expect(reportRouteWarmup.status()).toBe(400);

  await completeStructuredAnswers(page, calmAnswers);
  await confirmTypedNarrative(page, "Synthetic slow-provider performance context.");
  const selectionStartedAt = performance.now();
  const reportResponse = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === "POST" &&
      /\/api\/rounds\/[^/]+\/report$/.test(new URL(candidate.url()).pathname)
  );
  await page.getByRole("button", { name: "Confirm and continue" }).click();
  await expect(page.getByRole("button", { name: /Checking answers/i })).toBeDisabled();
  const response = await reportResponse;
  const selectionMs = performance.now() - selectionStartedAt;
  expect(response.status()).toBe(200);
  expect(selectionMs).toBeGreaterThanOrEqual(SLOW_SELECTION_MINIMUM_MS);
  expect(selectionMs).toBeLessThanOrEqual(SLOW_SELECTION_BUDGET_MS);
  await expect(
    page.getByRole("heading", { level: 3, name: "Quality-gated finger pulse check was selected" })
  ).toBeVisible();

  const cumulativeLayoutShift = await page.evaluate(
    () => (window as Window & { __homeroundsAiCls?: number }).__homeroundsAiCls ?? 0
  );
  expect(cumulativeLayoutShift).toBeLessThanOrEqual(CUMULATIVE_LAYOUT_SHIFT_BUDGET);
  expectNoBrowserFailures(failures);
});

test("provider failure reaches the deterministic route inside the warm API recovery budget", async ({
  page
}) => {
  test.skip(currentProfile !== "failure", "failure performance profile only");
  const failures = monitorBrowserFailures(page);
  await page.goto(scenarioUrl(failureOrigin, "maya-happy-text"));
  await expect(
    page.getByRole("heading", { level: 1, name: "Your two-minute check is ready" })
  ).toBeVisible();
  const started = await startRound(page, scenarioUrl(failureOrigin, "maya-happy-text"));
  await completeStructuredAnswers(page, { ...calmAnswers, weakness: "I’m not sure" });
  await confirmTypedNarrative(page, "Synthetic failure-budget context.");
  const fallbackStartedAt = performance.now();
  const reportResponse = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === "POST" &&
      /\/api\/rounds\/[^/]+\/report$/.test(new URL(candidate.url()).pathname)
  );
  await page.getByRole("button", { name: "Confirm and continue" }).click();
  const response = await reportResponse;
  const fallbackMs = performance.now() - fallbackStartedAt;
  expect(response.status()).toBe(200);
  expect(fallbackMs).toBeLessThanOrEqual(FAILURE_FALLBACK_BUDGET_MS);
  await expect(
    page.getByRole("heading", { level: 3, name: "AI selection is unavailable" })
  ).toBeVisible();

  const warmup = await page.request.get(`${failureOrigin}/api/rounds/${started.round.id}`);
  expect(warmup.status()).toBe(200);
  const apiStartedAt = performance.now();
  const persisted = await page.request.get(`${failureOrigin}/api/rounds/${started.round.id}`);
  expect(persisted.status()).toBe(200);
  expect(performance.now() - apiStartedAt).toBeLessThanOrEqual(WARM_ROUND_API_BUDGET_MS);
  expectNoBrowserFailures(failures);
});
