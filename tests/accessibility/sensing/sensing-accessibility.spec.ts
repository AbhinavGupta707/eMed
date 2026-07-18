import AxeBuilder from "@axe-core/playwright";
import { devices, expect, test, type Page } from "@playwright/test";

import { expectPhoneReady, launchDesktopPairing, openPhone } from "../../e2e/companion/support";
import { expectNoBrowserFailures, observeBrowserFailures } from "../../e2e/patient/support";

const WIDTHS = [320, 375, 390, 414, 768, 1024, 1280, 1440, 1920] as const;

async function expectNoSeriousOrCriticalViolations(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page }).analyze();
  expect(
    result.violations.filter(({ impact }) => impact === "serious" || impact === "critical")
  ).toEqual([]);
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    documentClientWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    bodyClientWidth: document.body.clientWidth,
    bodyScrollWidth: document.body.scrollWidth
  }));
  expect(dimensions.documentScrollWidth).toBeLessThanOrEqual(dimensions.documentClientWidth + 1);
  expect(dimensions.bodyScrollWidth).toBeLessThanOrEqual(dimensions.bodyClientWidth + 1);
}

test("the selected sensing station preserves text, keyboard, touch, zoom, and reduced-motion access", async ({
  browser
}) => {
  const desktopContext = await browser.newContext({
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:3121",
    reducedMotion: "reduce"
  });
  const desktop = await desktopContext.newPage();
  const desktopFailures = observeBrowserFailures(desktop);
  const issue = await launchDesktopPairing(desktop);
  const phone = await openPhone(browser, issue.pairingLink);
  await expectPhoneReady(phone.page);

  await phone.page.keyboard.press("Tab");
  const continueButton = phone.page.getByRole("button", { name: "Continue" });
  await expect(continueButton).toBeFocused();
  const focusStyle = await continueButton.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      boxShadow: style.boxShadow
    };
  });
  expect(
    (focusStyle.outlineStyle !== "none" && focusStyle.outlineWidth !== "0px") ||
      focusStyle.boxShadow !== "none"
  ).toBe(true);
  await continueButton.press("Enter");
  await expect(
    phone.page.getByRole("heading", { level: 1, name: "You stay in control" })
  ).toBeVisible();
  await expect(
    phone.page.getByText("You can stop at any time. No recording or image is saved.", {
      exact: true
    })
  ).toBeVisible();

  const consent = phone.page.getByRole("button", {
    name: "I understand and want to continue"
  });
  const consentBox = await consent.boundingBox();
  expect(consentBox).not.toBeNull();
  expect(consentBox!.height).toBeGreaterThanOrEqual(44);
  expect(consentBox!.width).toBeGreaterThanOrEqual(44);
  await consent.tap();
  await phone.page.getByRole("button", { name: "I’m ready" }).tap();

  const station = phone.page.locator('section[aria-label="Finger pulse check"]');
  await expect(station).toBeVisible();
  await expect(station.getByText("Selected for this round", { exact: true })).toBeVisible();
  const feedback = station.getByRole("status");
  await expect(feedback).not.toHaveText("");
  const provenance = station.locator('dl[aria-label="Check provenance"]');
  await expect(provenance.getByText("Device", { exact: true })).toBeVisible();
  await expect(provenance.getByText("Browser", { exact: true })).toBeVisible();
  await expect(provenance.getByText("Method", { exact: true })).toBeVisible();
  await expect(provenance.getByText("Privacy", { exact: true })).toBeVisible();
  await expect(provenance.getByText("Processed on this phone", { exact: true })).toBeVisible();
  await expect(
    phone.page.getByText("Sample profile · Not medical care", { exact: true })
  ).toBeVisible();

  expect(
    await phone.page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)
  ).toBe(true);
  const controls = station.getByRole("button");
  const controlCount = await controls.count();
  expect(controlCount).toBeGreaterThan(0);
  for (let index = 0; index < controlCount; index += 1) {
    const box = await controls.nth(index).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  }
  await expectNoSeriousOrCriticalViolations(phone.page);

  for (const width of WIDTHS) {
    await phone.page.setViewportSize({ width, height: width <= 414 ? 844 : 900 });
    await expectNoHorizontalOverflow(phone.page);
    await expect(station).toBeVisible();
  }

  await phone.page.setViewportSize({ width: 1280, height: 900 });
  await phone.page.evaluate(() => document.documentElement.style.setProperty("zoom", "2"));
  await expectNoHorizontalOverflow(phone.page);
  await expect(station).toBeVisible();
  await expect(feedback).toBeVisible();
  await phone.page.evaluate(() => document.documentElement.style.removeProperty("zoom"));

  await expectNoBrowserFailures(phone.failures);
  await expectNoBrowserFailures(desktopFailures);
  await phone.context.close();
  await desktopContext.close();
});
