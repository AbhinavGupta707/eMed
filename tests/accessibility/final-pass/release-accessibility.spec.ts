import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import {
  calmReport,
  expectNoBrowserFailures,
  installCameraState,
  numericMeasurement,
  observeBrowserFailures,
  submitTextReport
} from "../../e2e/patient/support";

const plannedWidths = [320, 375, 390, 414, 768, 1024, 1280, 1440, 1920] as const;

async function expectNoSeriousOrCriticalAxeFindings(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((violation) =>
      ["serious", "critical"].includes(violation.impact ?? "")
    )
  ).toEqual([]);
}

async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const geometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(geometry.scrollWidth, `${label} has horizontal overflow`).toBeLessThanOrEqual(
    geometry.clientWidth
  );
}

test("release path preserves keyboard, text, touch, reflow, focus, and non-colour recovery", async ({
  page
}) => {
  const failures = observeBrowserFailures(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installCameraState(page, "permission-denied");
  await page.goto("/round?scenario=maya-happy-text");
  await expect(
    page.getByRole("heading", { level: 1, name: "Ready when you are, Maya." })
  ).toBeVisible();

  for (const width of plannedWidths) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoHorizontalOverflow(page, `${width}px viewport`);
  }

  await page.setViewportSize({ width: 320, height: 900 });
  const undersized = await page.locator("button, a[href]").evaluateAll((elements) =>
    elements
      .filter((element) => {
        const bounds = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const root = element.getRootNode();
        const insideNextDevelopmentPortal =
          root instanceof ShadowRoot && root.host.tagName === "NEXTJS-PORTAL";
        return (
          !element.closest("nextjs-portal") &&
          !insideNextDevelopmentPortal &&
          bounds.width > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden"
        );
      })
      .map((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          label: element.getAttribute("aria-label") ?? element.textContent?.trim() ?? "unlabelled",
          width: bounds.width,
          height: bounds.height
        };
      })
      .filter(({ width, height }) => width < 44 || height < 44)
  );
  expect(undersized).toEqual([]);

  const consent = page.getByLabel(
    "I understand this check does not diagnose a condition or contact a medical service."
  );
  await consent.focus();
  const focusStyle = await consent.evaluate((element) => {
    const labelledTarget = element.closest("label") ?? element;
    const style = getComputedStyle(labelledTarget);
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
  });
  expect(focusStyle.outlineStyle !== "none" && Number.parseFloat(focusStyle.outlineWidth) > 0).toBe(
    true
  );
  await page.keyboard.press("Space");
  await expect(consent).toBeChecked();
  const start = page.getByRole("button", { name: "Start my check-in" });
  await start.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { level: 1, name: "Three questions before we talk." })
  ).toBeVisible();
  await expectNoSeriousOrCriticalAxeFindings(page);

  await submitTextReport(page, calmReport, { proveNoKeyVoiceFallback: true });
  await page.getByRole("button", { name: "Continue to this check" }).click();
  await page.getByRole("button", { name: "Continue on this computer" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "The selected camera check is unavailable" })
  ).toBeVisible();
  await expect(page.getByText("Camera permission was not granted", { exact: true })).toBeVisible();
  await expect(page.getByText(/No image or measurement was saved/i)).toBeVisible();
  await expect(numericMeasurement(page)).toHaveCount(0);
  await expectNoSeriousOrCriticalAxeFindings(page);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
  });
  await expectNoHorizontalOverflow(page, "200% zoom at 1280px");
  await page.evaluate(() => {
    document.documentElement.style.zoom = "";
  });

  const reducedMotion = await page.evaluate(
    () => globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  expect(reducedMotion).toBe(true);
  await expectNoBrowserFailures(failures);
});
