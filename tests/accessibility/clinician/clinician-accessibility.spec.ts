import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { createQualityReviewTask, testRunKey } from "../../e2e/clinician/support";

const plannedWidths = [320, 375, 414, 768, 1024, 1280, 1440, 1920] as const;

function monitorPage(page: Page): { consoleErrors: string[]; pageErrors: string[] } {
  const failures = { consoleErrors: [] as string[], pageErrors: [] as string[] };
  page.on("console", (message) => {
    if (message.type() === "error") failures.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => failures.pageErrors.push(String(error)));
  return failures;
}

async function seriousOrCriticalViolations(page: Page) {
  const result = await new AxeBuilder({ page }).analyze();
  return result.violations.filter((violation) =>
    ["serious", "critical"].includes(violation.impact ?? "")
  );
}

test("keeps the clinician cockpit responsive, keyboard operable, and serious/critical axe clean", async ({
  page,
  request
}, testInfo) => {
  const failures = monitorPage(page);
  const setup = await createQualityReviewTask(request, testRunKey(testInfo, "accessibility"));
  await page.setViewportSize({ width: plannedWidths[0], height: 900 });
  await page.goto(`/clinician?roundId=${setup.round.id}`);
  await expect(
    page.getByRole("heading", { level: 2, name: "Synthetic record synthetic-maya" })
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.getByRole("navigation", { name: "Clinician priority queue" })).toBeVisible();

  const compactDensity = page.getByRole("radio", { name: "Compact" });
  await compactDensity.focus();
  await page.keyboard.press("Space");
  await expect(compactDensity).toBeChecked();

  const reload = page.getByRole("button", { name: "Reload clinician priority queue" });
  await reload.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { level: 2, name: "Synthetic record synthetic-maya" })
  ).toBeVisible({ timeout: 30_000 });

  const complete = page.getByRole("button", { name: "Complete task" });
  await complete.focus();
  await page.keyboard.press("Enter");
  const confirmation = page.getByRole("dialog", { name: "Complete this task?" });
  await expect(confirmation).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(confirmation).toBeHidden();
  await expect(complete).toBeFocused();

  const touchTargets = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("button, textarea, label:has(input)"))
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 0 &&
          rect.height > 0
        );
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          label:
            element.getAttribute("aria-label") ?? element.textContent?.trim() ?? element.tagName,
          width: rect.width,
          height: rect.height
        };
      })
  );
  expect(touchTargets.length).toBeGreaterThan(0);
  for (const target of touchTargets) {
    expect(target.width, `${target.label} touch width`).toBeGreaterThanOrEqual(44);
    expect(target.height, `${target.label} touch height`).toBeGreaterThanOrEqual(44);
  }

  expect(await seriousOrCriticalViolations(page)).toEqual([]);

  for (const width of plannedWidths) {
    await page.setViewportSize({ width, height: 900 });
    const geometry = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth
    }));
    expect(geometry.scrollWidth, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(
      geometry.clientWidth
    );
  }

  await page.setViewportSize({ width: plannedWidths.at(-1) ?? 1920, height: 1080 });
  expect(await seriousOrCriticalViolations(page)).toEqual([]);
  expect(failures.consoleErrors).toEqual([]);
  expect(failures.pageErrors).toEqual([]);
});
