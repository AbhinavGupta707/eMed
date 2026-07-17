import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const plannedWidths = [320, 375, 414, 768, 1024, 1280, 1440, 1920] as const;

test("style guide is accessible and its recovery controls work", async ({ page }) => {
  const consoleFailures: string[] = [];
  const pageFailures: string[] = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) consoleFailures.push(message.text());
  });
  page.on("pageerror", (error) => pageFailures.push(String(error)));

  const response = await page.goto("/styleguide");
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { level: 1, name: "A calm system for careful follow-up" })
  ).toBeVisible();
  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.locator('section[aria-label$="shell example"]')).toHaveCount(2);

  const initialAxe = await new AxeBuilder({ page }).analyze();
  expect(initialAxe.violations).toEqual([]);

  const transcript = page.getByRole("textbox", { name: "Transcript" });
  await transcript.fill("I felt steady during this synthetic check-in.");
  await page.getByRole("button", { name: "Confirm transcript" }).click();
  await expect(page.getByText("Transcript confirmed.", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Open dialog" }).click();
  const dialog = page.getByRole("dialog", { name: "Synthetic review dialog" });
  await expect(dialog).toBeVisible();
  const openDialogAxe = await new AxeBuilder({ page }).analyze();
  expect(openDialogAxe.violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: "Open drawer" }).click();
  const drawer = page.getByRole("dialog", { name: "Synthetic evidence drawer" });
  await expect(drawer).toBeVisible();
  await expect(drawer).toHaveClass(/hr-dialog--drawer/);
  await drawer.getByRole("button", { name: "Close" }).click();
  await expect(drawer).toBeHidden();

  expect(consoleFailures).toEqual([]);
  expect(pageFailures).toEqual([]);
});

test("style guide has no horizontal overflow across the planned width matrix", async ({ page }) => {
  await page.goto("/styleguide");

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
});
