import { expect, test, type Page } from "@playwright/test";

import { createQualityReviewTask, testRunKey } from "../../e2e/clinician/support";

const BUDGET = {
  lcpMs: 2_500,
  cls: 0.1,
  cockpitReadyMs: 2_500,
  apiRequestMs: 2_000
} as const;

type Sample = {
  lcpMs: number;
  cls: number;
  cockpitReadyMs: number;
  slowestApiRequestMs: number;
};

function p75(values: readonly number[]): number {
  const ordered = values.toSorted((left, right) => left - right);
  return ordered[Math.max(0, Math.ceil(ordered.length * 0.75) - 1)] ?? Number.POSITIVE_INFINITY;
}

async function installWebVitalsCapture(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type MetricWindow = Window & { __clinicianMetrics?: { lcp: number; cls: number } };
    const metricWindow = window as MetricWindow;
    metricWindow.__clinicianMetrics = { lcp: 0, cls: 0 };
    try {
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const latest = entries.at(-1);
        if (latest && metricWindow.__clinicianMetrics) {
          metricWindow.__clinicianMetrics.lcp = latest.startTime;
        }
      }).observe({ type: "largest-contentful-paint", buffered: true });
    } catch {
      // The assertion below fails visibly if this browser cannot expose LCP.
    }
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
          if (!shift.hadRecentInput && metricWindow.__clinicianMetrics) {
            metricWindow.__clinicianMetrics.cls += shift.value;
          }
        }
      }).observe({ type: "layout-shift", buffered: true });
    } catch {
      // The assertion below still reports the captured zero value explicitly.
    }
  });
}

async function readSample(page: Page, cockpitReadyMs: number): Promise<Sample> {
  await page.waitForTimeout(150);
  return page.evaluate((readyMs) => {
    type MetricWindow = Window & { __clinicianMetrics?: { lcp: number; cls: number } };
    const metrics = (window as MetricWindow).__clinicianMetrics ?? { lcp: 0, cls: 0 };
    const apiDurations = performance
      .getEntriesByType("resource")
      .filter((entry) => new URL(entry.name).pathname.startsWith("/api/"))
      .map((entry) => entry.duration);
    return {
      lcpMs: metrics.lcp,
      cls: metrics.cls,
      cockpitReadyMs: readyMs,
      slowestApiRequestMs: Math.max(0, ...apiDurations)
    };
  }, cockpitReadyMs);
}

test("meets the warmed p75-like clinician cockpit performance budget without page errors", async ({
  page,
  request
}, testInfo) => {
  test.setTimeout(45_000);
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  await installWebVitalsCapture(page);

  const setup = await createQualityReviewTask(request, testRunKey(testInfo, "performance"));
  const cockpitPath = `/clinician?roundId=${setup.round.id}`;

  // Warm Next.js route compilation and browser caches outside the measured rehearsal samples.
  await page.goto(cockpitPath);
  await expect(
    page.getByRole("heading", { level: 2, name: "Synthetic record synthetic-maya" })
  ).toBeVisible();

  const samples: Sample[] = [];
  for (let index = 0; index < 4; index += 1) {
    await page.goto(cockpitPath, { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { level: 2, name: "Synthetic record synthetic-maya" })
    ).toBeVisible();
    const cockpitReadyMs = await page.evaluate(() => performance.now());
    samples.push(await readSample(page, cockpitReadyMs));
  }

  const measuredP75 = {
    lcpMs: p75(samples.map(({ lcpMs }) => lcpMs)),
    cls: p75(samples.map(({ cls }) => cls)),
    cockpitReadyMs: p75(samples.map(({ cockpitReadyMs }) => cockpitReadyMs)),
    slowestApiRequestMs: p75(samples.map(({ slowestApiRequestMs }) => slowestApiRequestMs))
  };
  await testInfo.attach("clinician-performance-budget.json", {
    body: Buffer.from(JSON.stringify({ budget: BUDGET, measuredP75, samples }, null, 2)),
    contentType: "application/json"
  });

  expect(
    samples.every(({ lcpMs }) => lcpMs > 0),
    JSON.stringify(samples)
  ).toBe(true);
  expect(measuredP75.lcpMs, JSON.stringify(samples)).toBeLessThanOrEqual(BUDGET.lcpMs);
  expect(measuredP75.cls, JSON.stringify(samples)).toBeLessThanOrEqual(BUDGET.cls);
  expect(measuredP75.cockpitReadyMs, JSON.stringify(samples)).toBeLessThanOrEqual(
    BUDGET.cockpitReadyMs
  );
  expect(measuredP75.slowestApiRequestMs, JSON.stringify(samples)).toBeLessThanOrEqual(
    BUDGET.apiRequestMs
  );
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
