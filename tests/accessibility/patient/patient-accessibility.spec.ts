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

const plannedWidths = [320, 375, 414, 768, 1024, 1280, 1440, 1920] as const;

async function expectNoSeriousOrCriticalAxeFindings(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((violation) =>
      ["serious", "critical"].includes(violation.impact ?? "")
    )
  ).toEqual([]);
}

test("patient path is responsive, keyboard operable, touch sized, and axe clean", async ({
  page
}) => {
  const failures = observeBrowserFailures(page);
  await installCameraState(page, "permission-denied");
  await page.goto("/round?scenario=maya-happy-text");
  await expect(
    page.getByRole("heading", { level: 1, name: "Your two-minute check is ready" })
  ).toBeVisible();

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

  await page.setViewportSize({ width: 320, height: 900 });
  const undersizedTargets = await page.locator("button, a[href]").evaluateAll((elements) =>
    elements
      .filter((element) => {
        const style = getComputedStyle(element);
        const bounds = element.getBoundingClientRect();
        const root = element.getRootNode();
        const insideNextDevelopmentPortal =
          root instanceof ShadowRoot && root.host.tagName === "NEXTJS-PORTAL";
        return (
          !element.closest("nextjs-portal") &&
          !insideNextDevelopmentPortal &&
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          bounds.width > 0
        );
      })
      .map((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          label: element.textContent?.trim() ?? element.getAttribute("aria-label") ?? "unlabelled",
          width: bounds.width,
          height: bounds.height
        };
      })
      .filter((target) => target.width < 44 || target.height < 44)
  );
  expect(undersizedTargets).toEqual([]);

  const consent = page.getByLabel(
    "I understand this is a synthetic demonstration, not clinically validated software, and not a medical service."
  );
  const consentTarget = await consent.evaluate((input) => {
    const bounds = input.closest("label")?.getBoundingClientRect();
    return { width: bounds?.width ?? 0, height: bounds?.height ?? 0 };
  });
  expect(consentTarget.width).toBeGreaterThanOrEqual(44);
  expect(consentTarget.height).toBeGreaterThanOrEqual(44);
  await expectNoSeriousOrCriticalAxeFindings(page);

  await consent.focus();
  await page.keyboard.press("Space");
  await expect(consent).toBeChecked();
  const start = page.getByRole("button", { name: "Start the check" });
  await start.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { level: 1, name: "Tell us what is happening now" })
  ).toBeVisible();
  await expectNoSeriousOrCriticalAxeFindings(page);

  await submitTextReport(page, calmReport, { proveNoKeyVoiceFallback: true });
  await page.getByRole("button", { name: "Check this device" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "The selected camera check is unavailable" })
  ).toBeVisible();
  await expect(page.getByText("Camera permission was not granted", { exact: true })).toBeVisible();
  await expect(page.getByText(/No image or measurement was saved/i)).toBeVisible();
  await expect(numericMeasurement(page)).toHaveCount(0);
  await expectNoSeriousOrCriticalAxeFindings(page);

  await page.getByRole("button", { name: "Continue without a measurement" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Confirm the next demo step" })
  ).toBeVisible();
  await expect(numericMeasurement(page)).toHaveCount(0);
  await expectNoSeriousOrCriticalAxeFindings(page);
  await expect(
    page.getByText("Synthetic demonstration — not clinically validated", { exact: true })
  ).toBeVisible();
  await expectNoBrowserFailures(failures);
});
