import { expect, test } from "@playwright/test";

import { expectNoBrowserFailures, observeBrowserFailures } from "../../e2e/patient/support";

const BUDGET = {
  warmDomContentLoadedMs: 2_000,
  warmLoadMs: 2_500,
  readyMs: 2_500,
  apiBatchMs: 2_000,
  cls: 0.1
} as const;

test("unchanged warm browser budgets and concurrent trigger suppression remain bounded", async ({
  page,
  request
}, testInfo) => {
  const failures = observeBrowserFailures(page);
  await page.addInitScript(() => {
    const measured = window as Window & { __finalPassCls?: number };
    measured.__finalPassCls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number };
        if (!shift.hadRecentInput) measured.__finalPassCls! += shift.value ?? 0;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });

  await page.goto("/round?scenario=maya-happy-text");
  await expect(
    page.getByRole("heading", { level: 1, name: "Ready when you are, Maya." })
  ).toBeVisible();
  await page.reload({ waitUntil: "load" });
  const readyStarted = performance.now();
  await page.reload({ waitUntil: "load" });
  await expect(
    page.getByRole("heading", { level: 1, name: "Ready when you are, Maya." })
  ).toBeVisible();
  const readyMs = performance.now() - readyStarted;
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
  const cls = await page.evaluate(
    () => (window as Window & { __finalPassCls?: number }).__finalPassCls ?? 0
  );
  expect(navigation).not.toBeNull();
  expect(navigation!.domContentLoadedMs).toBeLessThanOrEqual(BUDGET.warmDomContentLoadedMs);
  expect(navigation!.loadMs).toBeLessThanOrEqual(BUDGET.warmLoadMs);
  expect(readyMs).toBeLessThanOrEqual(BUDGET.readyMs);
  expect(cls).toBeLessThanOrEqual(BUDGET.cls);

  const triggerId = `final-pass-performance:v1:${Date.now()}`;
  const operationStarted = performance.now();
  const responses = await Promise.all(
    Array.from({ length: 6 }, () =>
      request.post("/api/rounds", {
        headers: { origin: "http://127.0.0.1:3153", "x-homerounds-demo-role": "patient" },
        data: {
          patientId: "synthetic-maya",
          triggerId,
          purpose: "Synthetic concurrent release-performance trigger",
          protocolId: "cardiometabolic_demo",
          burdenSeconds: 90
        }
      })
    )
  );
  const apiBatchMs = performance.now() - operationStarted;
  const statuses = responses.map((response) => response.status());
  expect(
    statuses.every((status) => status === 200 || status === 201),
    statuses.join(",")
  ).toBe(true);
  const bodies = (await Promise.all(responses.map((response) => response.json()))) as Array<{
    data: { created: boolean; round: { id: string } };
  }>;
  expect(bodies.filter(({ data }) => data.created)).toHaveLength(1);
  expect(new Set(bodies.map(({ data }) => data.round.id)).size).toBe(1);
  expect(apiBatchMs).toBeLessThanOrEqual(BUDGET.apiBatchMs);

  await testInfo.attach("final-pass-performance.json", {
    body: Buffer.from(
      JSON.stringify(
        { budget: BUDGET, measured: { ...navigation, readyMs, cls, apiBatchMs }, concurrency: 6 },
        null,
        2
      )
    ),
    contentType: "application/json"
  });
  console.info(
    `FINAL_PASS_PERFORMANCE ${JSON.stringify({ ...navigation, readyMs, cls, apiBatchMs })}`
  );
  await expectNoBrowserFailures(failures);
});
