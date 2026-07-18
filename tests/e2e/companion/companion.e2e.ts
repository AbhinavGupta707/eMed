import { expect, test } from "@playwright/test";

import {
  advancePhoneToProgress,
  collectCompanionTraffic,
  expectOnlyHandledRecoveryFailures,
  expectPhoneReady,
  launchDesktopPairing,
  numericMeasurement,
  openPhone,
  readPhoneApi,
  restoreDesktopCompanion,
  revokeAndReissueDesktopPairing,
  showUnavailablePhoneState,
  submitUnavailablePhoneResult,
  type CompanionTraffic
} from "./support";
import { expectNoBrowserFailures, observeBrowserFailures } from "../patient/support";

test("real QR handoff safely reissues, resumes, synchronizes, and acknowledges a non-measurement", async ({
  browser,
  page
}) => {
  const desktopFailures = observeBrowserFailures(page);
  const desktopTraffic: CompanionTraffic = [];
  collectCompanionTraffic(page, desktopTraffic);

  const original = await launchDesktopPairing(page);
  const replacement = await revokeAndReissueDesktopPairing(page, original);

  const oldPhone = await openPhone(browser, original.pairingLink);
  await expect(
    oldPhone.page.getByRole("heading", { level: 1, name: "This phone link has expired" })
  ).toBeVisible({ timeout: 10_000 });
  await expect(oldPhone.page.getByRole("status")).toContainText(
    "No result was sent from this link."
  );
  expectOnlyHandledRecoveryFailures(oldPhone.failures);
  await oldPhone.context.close();

  const phoneTraffic: CompanionTraffic = [];
  const phone = await openPhone(browser, replacement.pairingLink, phoneTraffic);
  await expectPhoneReady(phone.page);
  await expect(
    page.getByText("Your phone is connected. Continue with the guidance shown there.", {
      exact: true
    })
  ).toBeVisible({ timeout: 5_000 });
  await advancePhoneToProgress(phone.page);

  await phone.page.reload();
  await expect(
    phone.page.getByRole("heading", { level: 1, name: "Keep this page open" })
  ).toBeVisible({ timeout: 10_000 });
  await phone.context.setOffline(true);
  await expect(
    phone.page.getByRole("heading", { level: 1, name: "Your progress is still here" })
  ).toBeVisible({ timeout: 5_000 });
  await phone.context.setOffline(false);
  await phone.page.getByRole("button", { name: "Try connection again" }).tap();
  await expect(
    phone.page.getByRole("heading", { level: 1, name: "Keep this page open" })
  ).toBeVisible({ timeout: 5_000 });

  await phone.page.close();
  expectOnlyHandledRecoveryFailures(phone.failures);
  const resumedPhone = await phone.context.newPage();
  const resumedPhoneFailures = observeBrowserFailures(resumedPhone);
  collectCompanionTraffic(resumedPhone, phoneTraffic);
  await resumedPhone.goto("/companion");
  await expect(
    resumedPhone.getByRole("heading", { level: 1, name: "Keep this page open" })
  ).toBeVisible({ timeout: 10_000 });

  await restoreDesktopCompanion(page);
  const progress = await readPhoneApi(resumedPhone);
  expect(progress).toMatchObject({ taskPhase: "in_progress", lastResult: null });
  const unavailable = await showUnavailablePhoneState(resumedPhone, progress);
  expect(unavailable).toMatchObject({ taskPhase: "unavailable", lastResult: null });
  await expect(numericMeasurement(page)).toHaveCount(0);

  const submitted = await submitUnavailablePhoneResult(resumedPhone, unavailable);
  await expect(resumedPhone.getByRole("heading", { level: 1, name: "Sent securely" })).toBeVisible({
    timeout: 5_000
  });
  await expect(
    page.getByText(
      "The phone result was received and is waiting for the normal quality and workflow checks.",
      { exact: true }
    )
  ).toBeVisible({ timeout: 5_000 });
  await expect(numericMeasurement(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Mark result as received" }).click();
  await expect(
    resumedPhone.getByRole("heading", { level: 1, name: "Your computer received it" })
  ).toBeVisible({ timeout: 5_000 });
  await expect(
    page.getByText(
      "The result was received. HomeRounds has not accepted it as a measurement automatically.",
      { exact: true }
    )
  ).toBeVisible();
  await expect(numericMeasurement(page)).toHaveCount(0);

  const reusedPhone = await openPhone(browser, replacement.pairingLink);
  await expect(
    reusedPhone.page.getByRole("heading", { level: 1, name: "This phone link has expired" })
  ).toBeVisible({ timeout: 10_000 });
  expectOnlyHandledRecoveryFailures(reusedPhone.failures);
  await reusedPhone.context.close();

  expect(phoneTraffic.map(({ url }) => url).join("\n")).not.toMatch(/cpt1_|cst1_/);
  expect(
    phoneTraffic
      .filter(({ url }) => new URL(url).pathname !== "/api/companion/exchange")
      .map(({ body }) => body)
      .join("\n")
  ).not.toContain(new URLSearchParams(new URL(replacement.pairingLink).hash.slice(1)).get("pair")!);
  expect(phoneTraffic.map(({ body }) => body).join("\n")).not.toMatch(
    /rawFrame|cameraFrames|rawAudio|audioBytes|transcript|apiKey|databaseUrl|hiddenReasoning/i
  );
  expect(JSON.stringify(submitted.result)).not.toMatch(/pulseBpm|derived|qualityAccepted/i);
  expect([...desktopTraffic, ...phoneTraffic].map(({ url }) => url).join("\n")).not.toMatch(
    /elevenlabs|fireworks|vitallens/i
  );
  expect(
    await resumedPhone.evaluate(() => ({
      cookie: document.cookie,
      local: Object.values(localStorage),
      session: Object.values(sessionStorage)
    }))
  ).not.toMatchObject({ cookie: expect.stringContaining("homerounds_companion") });
  expect(
    JSON.stringify(
      await resumedPhone.evaluate(() => ({
        local: Object.values(localStorage),
        session: Object.values(sessionStorage)
      }))
    )
  ).not.toMatch(/cpt1_|cst1_/);

  await expectNoBrowserFailures(resumedPhoneFailures);
  await expectNoBrowserFailures(desktopFailures);
  await phone.context.close();
});
