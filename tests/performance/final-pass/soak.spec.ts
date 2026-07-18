import { expect, test } from "@playwright/test";

import {
  advancePhoneToProgress,
  browserCompanionRequest,
  expectOnlyHandledRecoveryFailures,
  expectPhoneReady,
  numericMeasurement,
  openPhone,
  readPhoneApi,
  showUnavailablePhoneState,
  submitUnavailablePhoneResult
} from "../../e2e/companion/support";
import {
  calmReport,
  expectNoBrowserFailures,
  observeBrowserFailures,
  startRound,
  submitTextReport
} from "../../e2e/patient/support";

const soakMinutes = Number(process.env.HOMEROUNDS_SOAK_MINUTES ?? "30");
const soakMs = soakMinutes * 60_000;

async function launchSoakPairing(page: Parameters<typeof startRound>[0], cycle: number) {
  const triggerId = `final-pass-soak:v1:${cycle}-${Date.now()}`;
  await page.goto(`/round?scenario=maya-happy-text&triggerId=${encodeURIComponent(triggerId)}`);
  await startRound(page);
  await submitTextReport(page, calmReport, { proveNoKeyVoiceFallback: true });
  await page.getByRole("button", { name: "Continue to this check" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "A pulse check is the most useful next step." })
  ).toBeVisible();
  await page.getByRole("button", { name: "Use my phone" }).click();
  const link = page.getByRole("link", { name: "Open the secure link instead" });
  await expect(link).toBeVisible();
  const pairingLink = await link.getAttribute("href");
  if (!pairingLink) throw new Error("The soak pairing link was not issued.");
  return pairingLink;
}

test("desktop and iPhone-sized contexts remain bounded through the configured automated soak", async ({
  browser,
  page
}, testInfo) => {
  test.setTimeout(soakMs + 180_000);
  const desktopFailures = observeBrowserFailures(page);
  const startedAt = Date.now();
  let recoveries = 0;
  let reloads = 0;
  let checks = 0;
  let cycles = 0;
  while (Date.now() - startedAt < soakMs) {
    cycles += 1;
    const pairingLink = await launchSoakPairing(page, cycles);
    const phone = await openPhone(browser, pairingLink);
    await expectPhoneReady(phone.page);
    await advancePhoneToProgress(phone.page);
    await phone.page.waitForTimeout(Math.min(20_000, soakMs - (Date.now() - startedAt)));
    checks += 1;
    const snapshot = await readPhoneApi(phone.page);
    expect(snapshot).toMatchObject({ status: "active", taskPhase: "in_progress" });
    await expect(numericMeasurement(page)).toHaveCount(0);

    await phone.context.setOffline(true);
    await expect(
      phone.page.getByRole("heading", { level: 1, name: "Your progress is still here" })
    ).toBeVisible();
    await phone.context.setOffline(false);
    await phone.page.getByRole("button", { name: "Try connection again" }).tap();
    await expect(
      phone.page.getByRole("heading", { level: 1, name: "Finger pulse check" })
    ).toBeVisible();
    recoveries += 1;
    await phone.page.reload();
    await expectPhoneReady(phone.page);
    reloads += 1;

    const progress = await readPhoneApi(phone.page);
    const unavailable = await showUnavailablePhoneState(phone.page, progress);
    const submitted = await submitUnavailablePhoneResult(phone.page, unavailable);
    const replay = await browserCompanionRequest(phone.page, "/api/companion/session/result", {
      method: "POST",
      body: submitted.result
    });
    expect(replay.status).toBe(200);
    expect(replay.body).toMatchObject({ data: { receipt: { replayed: true } } });
    await page.getByRole("button", { name: "Mark result as received" }).click();
    await expect(
      phone.page.getByRole("heading", { level: 1, name: "Your computer received it" })
    ).toBeVisible();
    await expect(numericMeasurement(page)).toHaveCount(0);
    expectOnlyHandledRecoveryFailures(phone.failures);
    await phone.context.close();
  }

  const elapsedMs = Date.now() - startedAt;
  await testInfo.attach("soak-summary.json", {
    body: Buffer.from(
      JSON.stringify(
        { configuredMinutes: soakMinutes, elapsedMs, cycles, checks, recoveries, reloads },
        null,
        2
      )
    ),
    contentType: "application/json"
  });
  console.info(
    `FINAL_PASS_SOAK ${JSON.stringify({ configuredMinutes: soakMinutes, elapsedMs, cycles, checks, recoveries, reloads })}`
  );
  expect(elapsedMs).toBeGreaterThanOrEqual(soakMs);
  await expectNoBrowserFailures(desktopFailures);
});
