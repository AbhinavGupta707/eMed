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
  await activateWithKeyboard(
    page.getByRole("button", { name: "Continue to conversation" }),
    "Enter"
  );
  await expect(
    page.getByRole("heading", { level: 1, name: "Tell me what’s changed." })
  ).toBeVisible();
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
  const isIphoneWebKit = testInfo.project.name.includes("webkit");
  const scenario: SyntheticScenario = isIphoneWebKit ? "maya-poor-quality" : "maya-happy-text";
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/round?scenario=${scenario}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Ready when you are, Maya." })
  ).toBeVisible();
  await expect(page.locator("main")).toHaveCount(1);
  await expectAxeSeriousAndCriticalClean(page);

  const consent = page.getByLabel(
    "I understand this check does not diagnose a condition or contact a medical service."
  );
  await activateWithKeyboard(consent, "Space");
  await expect(consent).toBeChecked();
  const startTransition = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === "POST" &&
      /\/api\/rounds\/[^/]+\/transition$/.test(new URL(candidate.url()).pathname)
  );
  await activateWithKeyboard(page.getByRole("button", { name: "Start my check-in" }), "Enter");
  expect((await startTransition).status()).toBe(200);
  await expect(
    page.getByRole("heading", { level: 1, name: "Three questions before we talk." })
  ).toBeVisible();

  await answerWithKeyboard(page, calmAnswers);
  const voiceButton = page.getByRole("button", { name: "Start voice" });
  await activateWithKeyboard(voiceButton, "Enter");
  await expect(
    page.getByRole("heading", { level: 2, name: "Let’s make sure I understood." })
  ).toBeVisible();
  await page.getByLabel("Weakness", { exact: true }).selectOption("moderate");
  await page.getByLabel("Palpitations", { exact: true }).selectOption("intermittent");
  await page.getByLabel("Chest pain now", { exact: true }).selectOption("no");
  await page.getByLabel("Severe breathlessness now", { exact: true }).selectOption("no");
  await page.getByLabel("Fainted", { exact: true }).selectOption("no");
  await page.getByLabel("Anything else", { exact: true }).selectOption("remove");
  const proposalConfirmation = page.getByLabel(
    /I reviewed every field and confirm these are my answers/i
  );
  await activateWithKeyboard(proposalConfirmation, "Space");
  await expect(proposalConfirmation).toBeChecked();
  await activateWithKeyboard(
    page.getByRole("button", { name: "Confirm reviewed report" }),
    "Enter"
  );

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Medication label review is the most useful next step."
    })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Medication label review" })
  ).toBeVisible();
  await expect(page.getByText("Current — in progress", { exact: true })).toBeVisible();
  await expect(page.getByText("What this can clarify", { exact: true })).toBeVisible();
  await expectAxeSeriousAndCriticalClean(page);

  const continueRecommendation = page.getByRole("button", { name: "Continue to this check" });
  const moduleTransitionSeconds = await continueRecommendation.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).transitionDuration)
  );
  expect(moduleTransitionSeconds).toBeLessThanOrEqual(0.001);
  await activateWithKeyboard(continueRecommendation, "Enter");
  await expect(
    page.getByRole("heading", { level: 2, name: "Review what a medication label shows" })
  ).toBeVisible();
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
  if (isIphoneWebKit) {
    await expect(
      page.getByRole("heading", { level: 1, name: /Your device is ready for the/i })
    ).toBeVisible();
  } else {
    await expect(
      page.getByRole("heading", { level: 1, name: "The selected camera check is unavailable" })
    ).toBeVisible();
  }
  await expectAxeSeriousAndCriticalClean(page);
  expectNoBrowserFailures(failures);
});
