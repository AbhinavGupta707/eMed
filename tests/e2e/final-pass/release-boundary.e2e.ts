import { expect, test } from "@playwright/test";

import {
  calmAnswers,
  completeStructuredAnswers,
  confirmTypedNarrative,
  expectNoBrowserFailures as expectNoAiBrowserFailures,
  monitorBrowserFailures,
  startRound as startAiRound,
  submitConfirmedReport
} from "../ai/support";
import {
  advancePhoneToProgress,
  expectOnlyHandledRecoveryFailures,
  expectPhoneReady,
  launchDesktopPairing,
  openPhone,
  readPhoneApi,
  revokeAndReissueDesktopPairing,
  showUnavailablePhoneState,
  submitUnavailablePhoneResult
} from "../companion/support";
import {
  expectNoBrowserFailures,
  numericMeasurement,
  observeBrowserFailures,
  startRound,
  submitTextReport
} from "../patient/support";

test.describe.configure({ mode: "serial" });

test("ordinary patient entry is proactive, bounded, and free of engineering labels", async ({
  page
}, testInfo) => {
  expect(testInfo.project.name).toBe("emulated-windows-chrome");
  const failures = observeBrowserFailures(page);
  await page.goto("/");
  await expect(page.getByText("A check-in is ready", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Continue invited check-in" })).toBeVisible();
  await expect(page.getByText("Synthetic sample profile · Not medical care")).toBeVisible();

  const mainText = await page.locator("main").innerText();
  expect(mainText).not.toMatch(/\b(?:demo|cache|deterministic)\b/i);
  expect(await page.evaluate(() => navigator.userAgent)).toContain("Windows NT 10.0");
  await expectNoBrowserFailures(failures);
});

test("complete text path remains available when the live voice provider is disabled", async ({
  page
}) => {
  const failures = monitorBrowserFailures(page);
  const reportRequests: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      /\/api\/rounds\/[^/]+\/report$/.test(new URL(request.url()).pathname)
    ) {
      reportRequests.push(request.url());
    }
  });

  await startAiRound(page, "/round?scenario=maya-poor-quality");
  await completeStructuredAnswers(page, {
    ...calmAnswers,
    weakness: "Moderate",
    palpitations: "Comes and goes"
  });
  await page.getByRole("button", { name: "Start voice" }).click();
  await expect(
    page.getByText("Voice is not configured. You can complete this step with text.", {
      exact: true
    })
  ).toBeVisible();
  expect(reportRequests).toEqual([]);
  await confirmTypedNarrative(page, "Identifier-free synthetic final-pass text path.");
  await submitConfirmedReport(page);
  await expect(
    page.getByRole("heading", { level: 2, name: "Quality-gated finger pulse check" })
  ).toBeVisible();
  expect(reportRequests).toHaveLength(1);
  expectNoAiBrowserFailures(failures);
});

test("patient-confirmed red flag is a hard stop with no sensing or service claim", async ({
  page
}) => {
  const failures = observeBrowserFailures(page);
  const assessmentRequests: string[] = [];
  page.on("request", (request) => {
    if (/\/api\/rounds\/[^/]+\/assessments(?:\/|$)/.test(new URL(request.url()).pathname)) {
      assessmentRequests.push(request.url());
    }
  });

  await page.goto("/round?scenario=maya-red-flag");
  await startRound(page);
  await submitTextReport(page, {
    chestPain: "Yes",
    severeBreathlessness: "No",
    fainted: "No",
    weakness: "Severe",
    palpitations: "Happening now"
  });
  await expect(page.getByRole("heading", { level: 1, name: "Stop this check-in." })).toBeVisible();
  await expect(
    page.getByText("HomeRounds cannot assess an emergency", { exact: true })
  ).toBeVisible();
  await expect(numericMeasurement(page)).toHaveCount(0);
  expect(assessmentRequests).toEqual([]);
  await page
    .getByLabel("I understand this is general guidance and no emergency service is connected.")
    .check();
  await page.getByRole("button", { name: "Confirm guidance shown" }).click();
  await expect(page.getByText(/no real clinical service was contacted/i)).toBeVisible();
  await expectNoBrowserFailures(failures);
});

test("separate desktop and iPhone-sized contexts recover, reject replay, and create no number", async ({
  browser,
  page
}) => {
  const desktopFailures = observeBrowserFailures(page);
  const original = await launchDesktopPairing(page, { proveNoKeyVoiceFallback: false });
  const replacement = await revokeAndReissueDesktopPairing(page, original);

  const expiredPhone = await openPhone(browser, original.pairingLink);
  await expect(
    expiredPhone.page.getByRole("heading", { level: 1, name: "This phone link has expired" })
  ).toBeVisible();
  expectOnlyHandledRecoveryFailures(expiredPhone.failures);
  await expiredPhone.context.close();

  const phone = await openPhone(browser, replacement.pairingLink);
  await expectPhoneReady(phone.page);
  expect(await phone.page.evaluate(() => navigator.userAgent)).toMatch(/iPhone/);
  await advancePhoneToProgress(phone.page);
  await phone.context.setOffline(true);
  await expect(
    phone.page.getByRole("heading", { level: 1, name: "Your progress is still here" })
  ).toBeVisible();
  await phone.context.setOffline(false);
  await phone.page.getByRole("button", { name: "Try connection again" }).tap();
  await expect(
    phone.page.getByRole("heading", { level: 1, name: "Finger pulse check" })
  ).toBeVisible();

  const progress = await readPhoneApi(phone.page);
  const unavailable = await showUnavailablePhoneState(phone.page, progress);
  const submitted = await submitUnavailablePhoneResult(phone.page, unavailable);
  await expect(numericMeasurement(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Mark result as received" }).click();
  await expect(
    phone.page.getByRole("heading", { level: 1, name: "Your computer received it" })
  ).toBeVisible();

  const replay = await phone.page.evaluate(async (body) => {
    const response = await fetch("/api/companion/session/result", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    return { status: response.status, body: (await response.json()) as unknown };
  }, submitted.result);
  expect(replay.status).toBe(200);
  expect(replay.body).toMatchObject({ data: { receipt: { replayed: true } } });
  await expect(numericMeasurement(page)).toHaveCount(0);

  const consumed = await openPhone(browser, replacement.pairingLink);
  await expect(
    consumed.page.getByRole("heading", { level: 1, name: "This phone link has expired" })
  ).toBeVisible();
  expectOnlyHandledRecoveryFailures(consumed.failures);
  await consumed.context.close();
  expectOnlyHandledRecoveryFailures(phone.failures);
  await expectNoBrowserFailures(desktopFailures);
  await phone.context.close();
});

test("memory consent, correction, deletion, and withdrawal survive cold reloads", async ({
  page
}) => {
  const failures = observeBrowserFailures(page);
  await page.goto("/memory");
  await page.getByRole("button", { name: "Allow structured memory" }).click();
  await page.getByRole("button", { name: "Remember phone" }).click();
  await page.reload();
  await expect(page.getByText(/currently remembered: phone/i)).toBeVisible();
  await page.getByRole("button", { name: "Use this computer instead" }).click();
  await expect(page.getByText(/currently remembered: this computer/i)).toBeVisible();
  await page.getByRole("button", { name: "Forget this choice" }).click();
  await expect(
    page.getByText("No device choice is remembered yet.", { exact: true })
  ).toBeVisible();
  await page.getByRole("button", { name: /Withdraw permission/i }).click();
  await expect(page.getByRole("button", { name: "Allow structured memory" })).toBeVisible();
  await expectNoBrowserFailures(failures);
});
