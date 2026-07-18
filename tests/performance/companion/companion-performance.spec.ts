import { expect, test, type Page, type Request } from "@playwright/test";
import { CompanionResultReceiptSchema } from "../../../packages/companion/src/index";
import { z } from "../../../packages/companion/node_modules/zod";

import {
  advancePhoneToProgress,
  browserCompanionRequest,
  expectPhoneReady,
  launchDesktopPairing,
  openPhone,
  readPhoneApi,
  showUnavailablePhoneState,
  submitUnavailablePhoneResult
} from "../../e2e/companion/support";
import { expectNoBrowserFailures, observeBrowserFailures } from "../../e2e/patient/support";

const SOAK_MS = 15_500;
const MAX_SYNC_LATENCY_MS = 4_000;
const ReceiptEnvelopeSchema = z
  .object({
    data: z.object({ receipt: CompanionResultReceiptSchema }).strict(),
    meta: z.object({ correlationId: z.string().min(1).max(120) }).strict()
  })
  .strict();

type PollStats = {
  started: number;
  active: number;
  maxActive: number;
};

function observePolls(page: Page, matches: (request: Request) => boolean): PollStats {
  const stats: PollStats = { started: 0, active: 0, maxActive: 0 };
  page.on("request", (request) => {
    if (!matches(request)) return;
    stats.started += 1;
    stats.active += 1;
    stats.maxActive = Math.max(stats.maxActive, stats.active);
  });
  const complete = (request: Request) => {
    if (matches(request)) stats.active = Math.max(0, stats.active - 1);
  };
  page.on("requestfinished", complete);
  page.on("requestfailed", complete);
  return stats;
}

test("polling remains bounded through soak and synchronizes phone result to desktop", async ({
  browser,
  page
}) => {
  const desktopFailures = observeBrowserFailures(page);
  const issue = await launchDesktopPairing(page);
  const phone = await openPhone(browser, issue.pairingLink);
  await expectPhoneReady(phone.page);
  await advancePhoneToProgress(phone.page);

  const desktopPolls = observePolls(
    page,
    (request) =>
      request.method() === "GET" &&
      new URL(request.url()).pathname === `/api/companion/pairings/${issue.pairingId}`
  );
  const phonePolls = observePolls(
    phone.page,
    (request) =>
      request.method() === "GET" && new URL(request.url()).pathname === "/api/companion/session"
  );

  await phone.page.waitForTimeout(SOAK_MS);
  expect(desktopPolls.started).toBeGreaterThanOrEqual(7);
  expect(desktopPolls.started).toBeLessThanOrEqual(13);
  expect(phonePolls.started).toBeGreaterThanOrEqual(7);
  expect(phonePolls.started).toBeLessThanOrEqual(13);
  expect(desktopPolls.maxActive).toBeLessThanOrEqual(1);
  expect(phonePolls.maxActive).toBeLessThanOrEqual(1);

  const progress = await readPhoneApi(phone.page);
  const unavailable = await showUnavailablePhoneState(phone.page, progress);
  const syncStartedAt = performance.now();
  const submitted = await submitUnavailablePhoneResult(phone.page, unavailable);
  await expect(
    page.getByText(
      "The phone result was received and checked against the normal quality and workflow rules.",
      { exact: true }
    )
  ).toBeVisible({ timeout: MAX_SYNC_LATENCY_MS });
  const syncLatencyMs = performance.now() - syncStartedAt;
  expect(syncLatencyMs).toBeLessThanOrEqual(MAX_SYNC_LATENCY_MS);

  const replay = await browserCompanionRequest(phone.page, "/api/companion/session/result", {
    method: "POST",
    body: submitted.result
  });
  expect(replay.status).toBe(200);
  expect(ReceiptEnvelopeSchema.parse(replay.body).data.receipt).toMatchObject({
    resultId: submitted.receipt.resultId,
    replayed: true
  });

  await page.getByRole("button", { name: "Mark result as received" }).click();
  await expect(
    phone.page.getByRole("heading", { level: 1, name: "Your computer received it" })
  ).toBeVisible({ timeout: MAX_SYNC_LATENCY_MS });
  const countsAfterAcknowledgement = {
    desktop: desktopPolls.started,
    phone: phonePolls.started
  };
  await phone.page.waitForTimeout(4_000);
  expect(desktopPolls.started - countsAfterAcknowledgement.desktop).toBeLessThanOrEqual(1);
  expect(phonePolls.started - countsAfterAcknowledgement.phone).toBeLessThanOrEqual(1);

  await expectNoBrowserFailures(phone.failures);
  await expectNoBrowserFailures(desktopFailures);
  await phone.context.close();
});
