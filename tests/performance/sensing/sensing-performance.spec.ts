import { expect, test, type Page, type Request } from "@playwright/test";

import {
  advancePhoneToProgress,
  browserCompanionRequest,
  expectPhoneReady,
  launchDesktopPairing,
  openPhone,
  readPhoneApi
} from "../../e2e/companion/support";
import { expectNoBrowserFailures, observeBrowserFailures } from "../../e2e/patient/support";
import { validFingerCandidate } from "../../e2e/sensing/support";

const SOAK_MS = 10_000;
const MAX_WORKFLOW_SYNC_MS = 4_000;

type RequestStats = { started: number; active: number; maxActive: number; bodies: string[] };

function observe(page: Page, matches: (request: Request) => boolean): RequestStats {
  const stats: RequestStats = { started: 0, active: 0, maxActive: 0, bodies: [] };
  page.on("request", (request) => {
    if (!matches(request)) return;
    stats.started += 1;
    stats.active += 1;
    stats.maxActive = Math.max(stats.maxActive, stats.active);
    stats.bodies.push(request.postData() ?? "");
  });
  const finish = (request: Request) => {
    if (matches(request)) stats.active = Math.max(0, stats.active - 1);
  };
  page.on("requestfinished", finish);
  page.on("requestfailed", finish);
  return stats;
}

test("sensing sync and capture-state polling remain bounded without media retention", async ({
  browser,
  page
}) => {
  const desktopFailures = observeBrowserFailures(page);
  const issue = await launchDesktopPairing(page);
  const phone = await openPhone(browser, issue.pairingLink);
  await expectPhoneReady(phone.page);
  await advancePhoneToProgress(phone.page);

  const desktopPolls = observe(
    page,
    (request) =>
      request.method() === "GET" &&
      new URL(request.url()).pathname === `/api/companion/pairings/${issue.pairingId}`
  );
  const phonePolls = observe(
    phone.page,
    (request) =>
      request.method() === "GET" && new URL(request.url()).pathname === "/api/companion/session"
  );
  const resultPosts = observe(
    phone.page,
    (request) =>
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/companion/session/result"
  );

  await phone.page.waitForTimeout(SOAK_MS);
  expect(desktopPolls.started).toBeGreaterThanOrEqual(4);
  expect(desktopPolls.started).toBeLessThanOrEqual(9);
  expect(phonePolls.started).toBeGreaterThanOrEqual(4);
  expect(phonePolls.started).toBeLessThanOrEqual(9);
  expect(desktopPolls.maxActive).toBeLessThanOrEqual(1);
  expect(phonePolls.maxActive).toBeLessThanOrEqual(1);

  const snapshot = await readPhoneApi(phone.page);
  const candidate = validFingerCandidate(snapshot, "7b000000-0000-4000-8000-000000000001");
  const startedAt = performance.now();
  const submitted = await browserCompanionRequest(phone.page, "/api/companion/session/result", {
    method: "POST",
    body: candidate
  });
  expect(submitted.status).toBe(200);
  await expect(
    page.getByText(
      "The phone result was received and checked against the normal quality and workflow rules.",
      { exact: true }
    )
  ).toBeVisible({ timeout: MAX_WORKFLOW_SYNC_MS });
  expect(performance.now() - startedAt).toBeLessThanOrEqual(MAX_WORKFLOW_SYNC_MS);
  expect(resultPosts.started).toBe(1);
  expect(resultPosts.maxActive).toBeLessThanOrEqual(1);
  expect(resultPosts.bodies.join("\n")).not.toMatch(
    /rawFrame|cameraFrames|rawAudio|audioBytes|pcm|transcript|providerKey|providerPayload|prompt/i
  );

  await page.getByRole("button", { name: "Mark result as received" }).click();
  await expect(
    phone.page.getByRole("heading", { level: 1, name: "Your computer received it" })
  ).toBeVisible({ timeout: MAX_WORKFLOW_SYNC_MS });
  const afterAcknowledgement = {
    desktop: desktopPolls.started,
    phone: phonePolls.started
  };
  await phone.page.waitForTimeout(4_000);
  expect(desktopPolls.started - afterAcknowledgement.desktop).toBeLessThanOrEqual(1);
  expect(phonePolls.started - afterAcknowledgement.phone).toBeLessThanOrEqual(1);

  await expectNoBrowserFailures(phone.failures);
  await expectNoBrowserFailures(desktopFailures);
  await phone.context.close();
});
