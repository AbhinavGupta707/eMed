import AxeBuilder from "@axe-core/playwright";
import { devices, expect, test } from "@playwright/test";

import { expectPhoneReady, launchDesktopPairing, openPhone } from "../../e2e/companion/support";
import { expectNoBrowserFailures, observeBrowserFailures } from "../../e2e/patient/support";

const WIDTHS = [320, 375, 390, 414, 768, 1024, 1280, 1440, 1920] as const;

async function expectNoSeriousOrCriticalViolations(page: import("@playwright/test").Page) {
  const result = await new AxeBuilder({ page }).analyze();
  expect(
    result.violations.filter(({ impact }) => impact === "serious" || impact === "critical")
  ).toEqual([]);
}

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    documentClientWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    bodyClientWidth: document.body.clientWidth,
    bodyScrollWidth: document.body.scrollWidth
  }));
  expect(dimensions.documentScrollWidth).toBeLessThanOrEqual(dimensions.documentClientWidth + 1);
  expect(dimensions.bodyScrollWidth).toBeLessThanOrEqual(dimensions.bodyClientWidth + 1);
}

test("paired desktop and phone preserve keyboard, touch, zoom, reduced-motion, and axe accessibility", async ({
  browser
}) => {
  const desktopContext = await browser.newContext({
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:3111",
    reducedMotion: "reduce"
  });
  const desktop = await desktopContext.newPage();
  const desktopFailures = observeBrowserFailures(desktop);
  const issue = await launchDesktopPairing(desktop);

  await expectNoSeriousOrCriticalViolations(desktop);
  await expect(
    desktop.getByText("Sample profile · Not medical care", { exact: true })
  ).toBeVisible();
  await expect(
    desktop.getByText(
      "Scan the code with your phone. It expires automatically and contains no patient details.",
      { exact: true }
    )
  ).toBeVisible();

  const phone = await openPhone(browser, issue.pairingLink);
  await expectPhoneReady(phone.page);
  await expectNoSeriousOrCriticalViolations(phone.page);
  await expect(
    phone.page.getByText("Sample profile · Not medical care", { exact: true })
  ).toBeVisible();

  await phone.page.keyboard.press("Tab");
  const focused = phone.page.locator(":focus");
  await expect(focused).toHaveText("Continue");
  const focusStyle = await focused.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      boxShadow: style.boxShadow
    };
  });
  expect(
    focusStyle.outlineStyle !== "none" && focusStyle.outlineWidth !== "0px"
      ? true
      : focusStyle.boxShadow !== "none"
  ).toBe(true);
  await focused.press("Enter");
  await expect(
    phone.page.getByRole("heading", { level: 1, name: "You stay in control" })
  ).toBeVisible();
  await expect(
    phone.page.getByText("You can stop at any time. No recording or image is saved.", {
      exact: true
    })
  ).toBeVisible();

  const consentButton = phone.page.getByRole("button", {
    name: "I understand and want to continue"
  });
  const consentBox = await consentButton.boundingBox();
  expect(consentBox).not.toBeNull();
  expect(consentBox!.height).toBeGreaterThanOrEqual(44);
  expect(consentBox!.width).toBeGreaterThanOrEqual(44);
  await consentButton.tap();
  await expect(
    phone.page.getByRole("heading", { level: 1, name: "Finger pulse check" })
  ).toBeVisible();
  const readyButton = phone.page.getByRole("button", { name: "I’m ready" });
  const readyBox = await readyButton.boundingBox();
  expect(readyBox).not.toBeNull();
  expect(readyBox!.height).toBeGreaterThanOrEqual(44);
  await readyButton.tap();
  await expect(
    phone.page.getByRole("heading", { level: 1, name: "Keep this page open" })
  ).toBeVisible();

  const progressAnimation = await phone.page
    .getByRole("progressbar", { name: "Finger pulse check" })
    .locator("span")
    .evaluate((element) => getComputedStyle(element).animationName);
  expect(progressAnimation).toBe("none");
  await expectNoSeriousOrCriticalViolations(phone.page);

  for (const width of WIDTHS) {
    await phone.page.setViewportSize({ width, height: width <= 414 ? 844 : 900 });
    await expectNoHorizontalOverflow(phone.page);
    await expect(
      phone.page.getByText("Sample profile · Not medical care", { exact: true })
    ).toBeVisible();
  }

  await phone.page.setViewportSize({ width: 1280, height: 900 });
  await phone.page.evaluate(() => document.documentElement.style.setProperty("zoom", "2"));
  await expectNoHorizontalOverflow(phone.page);
  await expect(
    phone.page.getByRole("heading", { level: 1, name: "Keep this page open" })
  ).toBeVisible();
  await phone.page.evaluate(() => document.documentElement.style.removeProperty("zoom"));

  await expectNoBrowserFailures(phone.failures);
  await expectNoBrowserFailures(desktopFailures);
  await phone.context.close();
  await desktopContext.close();
});
