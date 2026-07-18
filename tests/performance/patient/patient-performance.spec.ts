import { expect, test } from "@playwright/test";

import { expectNoBrowserFailures, observeBrowserFailures } from "../../e2e/patient/support";

// These are warm, same-host browser budgets. They deliberately exclude cold compilation and do not
// depend on third-party network speed, provider credentials, or synthetic throttling assumptions.
const WARM_DOM_CONTENT_LOADED_BUDGET_MS = 2_000;
const WARM_LOAD_BUDGET_MS = 2_500;
const PATIENT_STATE_RENDER_BUDGET_MS = 2_500;
const SAVED_STATE_REFRESH_BUDGET_MS = 1_000;
const CUMULATIVE_LAYOUT_SHIFT_BUDGET = 0.1;

test("warm patient shell and saved-state refresh stay inside local browser budgets", async ({
  page
}) => {
  const failures = observeBrowserFailures(page);
  await page.addInitScript(() => {
    const measuredWindow = window as Window & { __homeroundsCls?: number };
    measuredWindow.__homeroundsCls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number };
        if (!shift.hadRecentInput) measuredWindow.__homeroundsCls! += shift.value ?? 0;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });

  // Prime the Next development route so the measured navigation represents application work,
  // rather than one-time framework compilation in this evidence environment.
  await page.goto("/round?scenario=maya-happy-text");
  await expect(
    page.getByRole("heading", { level: 1, name: "Ready when you are, Maya." })
  ).toBeVisible();

  // Webpack development mode may finish a one-time route/HMR update after the first visible
  // render. Complete one unmeasured reload so the budget below measures a genuinely warm shell.
  await page.reload({ waitUntil: "load" });
  await expect(
    page.getByRole("heading", { level: 1, name: "Ready when you are, Maya." })
  ).toBeVisible();

  const renderStartedAt = Date.now();
  await page.reload({ waitUntil: "load" });
  await expect(
    page.getByRole("heading", { level: 1, name: "Ready when you are, Maya." })
  ).toBeVisible();
  const patientStateRenderMs = Date.now() - renderStartedAt;

  const navigation = await page.evaluate(() => {
    const entry = performance.getEntriesByType("navigation")[0] as
      PerformanceNavigationTiming | undefined;
    if (!entry) return null;
    return {
      domContentLoadedMs: entry.domContentLoadedEventEnd - entry.startTime,
      loadMs: entry.loadEventEnd - entry.startTime
    };
  });
  expect(navigation).not.toBeNull();
  expect(navigation!.domContentLoadedMs).toBeLessThanOrEqual(WARM_DOM_CONTENT_LOADED_BUDGET_MS);
  expect(navigation!.loadMs).toBeLessThanOrEqual(WARM_LOAD_BUDGET_MS);
  expect(patientStateRenderMs).toBeLessThanOrEqual(PATIENT_STATE_RENDER_BUDGET_MS);

  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        /\/api\/rounds\/[^/]+$/.test(new URL(response.url()).pathname)
    ),
    page.getByRole("button", { name: "Resume saved progress" }).click()
  ]);

  const refreshStartedAt = await page.evaluate(() => performance.now());
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        /\/api\/rounds\/[^/]+$/.test(new URL(response.url()).pathname)
    ),
    page.getByRole("button", { name: "Resume saved progress" }).click()
  ]);
  await expect(
    page.getByRole("heading", { level: 1, name: "Ready when you are, Maya." })
  ).toBeVisible();
  const savedStateRefreshMs = (await page.evaluate(() => performance.now())) - refreshStartedAt;
  expect(savedStateRefreshMs).toBeLessThanOrEqual(SAVED_STATE_REFRESH_BUDGET_MS);

  const cumulativeLayoutShift = await page.evaluate(
    () => (window as Window & { __homeroundsCls?: number }).__homeroundsCls ?? 0
  );
  expect(cumulativeLayoutShift).toBeLessThanOrEqual(CUMULATIVE_LAYOUT_SHIFT_BUDGET);
  await expect(page.getByText("Sample profile · Not medical care", { exact: true })).toBeVisible();
  await expectNoBrowserFailures(failures);
});
