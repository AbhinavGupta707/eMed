import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  calmAnswers,
  expectNoBrowserFailures,
  monitorBrowserFailures,
  type StructuredAnswers,
  type SyntheticScenario
} from "../../e2e/ai/support";

const plannedWidths = [320, 375, 414, 768, 1024, 1280, 1440, 1920] as const;

async function expectAxeSeriousAndCriticalClean(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((violation) =>
      ["serious", "critical"].includes(violation.impact ?? "")
    )
  ).toEqual([]);
}

async function activateWithKeyboard(locator: Locator, key: "Enter" | "Space"): Promise<void> {
  await locator.focus();
  await locator.page().keyboard.press(key);
}

async function chooseWithKeyboard(page: Page, legend: string, answer: string): Promise<void> {
  const input = page.getByRole("group", { name: legend }).getByLabel(answer, { exact: true });
  await activateWithKeyboard(input, "Space");
  await expect(input).toBeChecked();
}

async function answerWithKeyboard(page: Page, answers: StructuredAnswers): Promise<void> {
  await chooseWithKeyboard(page, "Are you having chest pain now?", answers.chestPain);
  await chooseWithKeyboard(
    page,
    "Are you severely short of breath now?",
    answers.severeBreathlessness
  );
  await chooseWithKeyboard(page, "Have you fainted?", answers.fainted);
  await chooseWithKeyboard(page, "How weak do you feel?", answers.weakness);
  await chooseWithKeyboard(
    page,
    "Are you noticing a racing, pounding, or fluttering feeling?",
    answers.palpitations
  );
}

test("adaptive route is keyboard operable, responsive, reduced-motion safe, named, and axe clean", async ({
  page
}, testInfo) => {
  const failures = monitorBrowserFailures(page);
  const scenario: SyntheticScenario = testInfo.project.name.includes("webkit")
    ? "maya-poor-quality"
    : "maya-happy-text";
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/round?scenario=${scenario}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Your two-minute check is ready" })
  ).toBeVisible();
  await expect(page.locator("main")).toHaveCount(1);
  await expectAxeSeriousAndCriticalClean(page);

  const consent = page.getByLabel(
    "I understand this is a synthetic demonstration, not clinically validated software, and not a medical service."
  );
  await activateWithKeyboard(consent, "Space");
  await expect(consent).toBeChecked();
  await activateWithKeyboard(page.getByRole("button", { name: "Start the check" }), "Enter");
  await expect(
    page.getByRole("heading", { level: 1, name: "Tell us what is happening now" })
  ).toBeVisible();

  await answerWithKeyboard(page, calmAnswers);
  const voiceButton = page.getByRole("button", { name: "Start voice" });
  await activateWithKeyboard(voiceButton, "Enter");
  const editor = page.getByRole("textbox", { name: "Your check-in text" });
  await expect(editor).toHaveValue("I have felt a little weak this morning.");
  await editor.fill("Keyboard-edited identifier-free synthetic check-in.");
  await activateWithKeyboard(page.getByRole("button", { name: "Confirm this text" }), "Enter");
  await expect(page.getByText("Confirmed", { exact: true })).toBeVisible();
  await activateWithKeyboard(page.getByRole("button", { name: "Confirm and continue" }), "Enter");

  await expect(page.getByRole("heading", { level: 2, name: "Round Map" })).toBeVisible();
  const evidenceModules = page.getByRole("list", { name: "Evidence modules" });
  await expect(evidenceModules).toBeVisible();
  await expect(
    evidenceModules.getByRole("button", { name: /^Completed — confirmed/ })
  ).toBeVisible();
  await expect(
    evidenceModules.getByRole("button", { name: /^Current — in progress/ })
  ).toBeVisible();
  await expect(page.getByText("Eligible selection accepted", { exact: true })).toBeVisible();
  await expect(page.getByText("AI uncertainty", { exact: true })).toBeVisible();
  await expectAxeSeriousAndCriticalClean(page);

  const medicationModule = page
    .getByRole("list", { name: "Evidence modules" })
    .getByRole("button")
    .filter({ hasText: "Medication label review" });
  await expect(medicationModule).toHaveCount(1);
  await activateWithKeyboard(medicationModule, "Enter");
  await expect(
    page.getByRole("heading", { level: 3, name: "Medication label review", exact: true })
  ).toBeVisible();
  const mapSection = page.getByRole("region", { name: "Round Map" });
  await expect(mapSection.getByRole("status")).toContainText(
    "Medication label review. Current — in progress."
  );
  await activateWithKeyboard(page.getByRole("button", { name: "Close details" }), "Enter");
  await expect(medicationModule).toBeFocused();
  await expect(mapSection.getByRole("status")).toContainText(
    "Module details closed. Focus returned to the Round Map."
  );

  const moduleTransitionSeconds = await medicationModule.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).transitionDuration)
  );
  expect(moduleTransitionSeconds).toBeLessThanOrEqual(0.001);
  const textConfirm = page.getByRole("button", { name: "Confirm text-entered observations" });
  const confirmTransitionSeconds = await textConfirm.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).transitionDuration)
  );
  expect(confirmTransitionSeconds).toBeLessThanOrEqual(0.001);

  await page.setViewportSize({ width: 320, height: 900 });
  const undersized = await page
    .locator("button, a[href], select, textarea, label:has(input:not([type=file]))")
    .evaluateAll((elements) =>
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
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            bounds.width > 0 &&
            bounds.height > 0
          );
        })
        .map((element) => {
          const bounds = element.getBoundingClientRect();
          return {
            label:
              element.getAttribute("aria-label") ?? element.textContent?.trim() ?? element.tagName,
            width: bounds.width,
            height: bounds.height
          };
        })
        .filter((target) => target.width < 44 || target.height < 44)
    );
  expect(undersized).toEqual([]);

  for (const width of plannedWidths) {
    await page.setViewportSize({ width, height: width >= 1024 ? 1080 : 900 });
    const geometry = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth
    }));
    expect(geometry.scrollWidth, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(
      geometry.clientWidth
    );
  }

  await activateWithKeyboard(
    page.getByRole("button", { name: "Skip label review and continue" }),
    "Enter"
  );
  await expect(
    page.getByRole("heading", { level: 1, name: "The selected camera check is unavailable" })
  ).toBeVisible();
  await expectAxeSeriousAndCriticalClean(page);
  expectNoBrowserFailures(failures);
});
