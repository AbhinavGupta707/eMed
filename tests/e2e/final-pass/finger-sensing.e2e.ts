import { expect, test } from "@playwright/test";

import {
  ApiSuccessEnvelopeSchema,
  RoundDataSchema
} from "../../../packages/api-client/src/schemas";
import {
  CompanionDesktopSnapshotSchema,
  CompanionResultReceiptSchema
} from "../../../packages/companion/src/index";
import { z } from "../../../packages/companion/node_modules/zod";
import {
  advancePhoneToProgress,
  browserCompanionRequest,
  collectCompanionTraffic,
  expectPhoneReady,
  launchDesktopPairing,
  openPhone,
  readPhoneApi,
  type CompanionTraffic
} from "../companion/support";
import { expectNoBrowserFailures, observeBrowserFailures } from "../patient/support";
import { validFingerCandidate } from "../sensing/support";

const ReceiptEnvelopeSchema = z
  .object({
    data: z.object({ receipt: CompanionResultReceiptSchema }).strict(),
    meta: z.object({ correlationId: z.string().min(1).max(120) }).strict()
  })
  .strict();
const DesktopEnvelopeSchema = z
  .object({
    data: z.object({ snapshot: CompanionDesktopSnapshotSchema }).strict(),
    meta: z.object({ correlationId: z.string().min(1).max(120) }).strict()
  })
  .strict();
const RoundEnvelopeSchema = ApiSuccessEnvelopeSchema(RoundDataSchema);

async function readAuthoritativeRound(
  page: Parameters<typeof browserCompanionRequest>[0],
  pairingId: string
) {
  const desktop = await browserCompanionRequest(page, `/api/companion/pairings/${pairingId}`);
  expect(desktop.status).toBe(200);
  const roundId = DesktopEnvelopeSchema.parse(desktop.body).data.snapshot.roundId;
  const response = await browserCompanionRequest(page, `/api/rounds/${roundId}`);
  expect(response.status).toBe(200);
  return RoundEnvelopeSchema.parse(response.body).data.round;
}

test("paired finger candidate is accepted once, replayed safely, and cold-resumed", async ({
  browser,
  page
}) => {
  const desktopFailures = observeBrowserFailures(page);
  const desktopTraffic: CompanionTraffic = [];
  const phoneTraffic: CompanionTraffic = [];
  collectCompanionTraffic(page, desktopTraffic);
  const issue = await launchDesktopPairing(page);
  const phone = await openPhone(browser, issue.pairingLink, phoneTraffic);
  await expectPhoneReady(phone.page);
  await advancePhoneToProgress(phone.page);
  const progress = await readPhoneApi(phone.page);
  const candidate = validFingerCandidate(progress, "7a000000-0000-4000-8000-000000000011");

  const submitted = await browserCompanionRequest(phone.page, "/api/companion/session/result", {
    method: "POST",
    body: candidate
  });
  expect(submitted.status).toBe(200);
  const receipt = ReceiptEnvelopeSchema.parse(submitted.body).data.receipt;
  expect(receipt.replayed).toBe(false);
  await expect(
    phone.page.getByRole("heading", { level: 1, name: "Checked and sent" })
  ).toBeVisible();
  await expect(page.getByText("Reading received", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/waiting for you to acknowledge it before this check-in continues/i)
  ).toBeVisible();

  const replay = await browserCompanionRequest(phone.page, "/api/companion/session/result", {
    method: "POST",
    body: candidate
  });
  expect(replay.status).toBe(200);
  expect(ReceiptEnvelopeSchema.parse(replay.body).data.receipt).toMatchObject({
    resultId: receipt.resultId,
    replayed: true
  });
  await phone.page.reload();
  await expect(
    phone.page.getByRole("heading", { level: 1, name: "Checked and sent" })
  ).toBeVisible();
  await page.getByRole("button", { name: "Mark result as received" }).click();
  await expect(
    phone.page.getByRole("heading", { level: 1, name: "Your computer received it" })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "Choose what happens next." })
  ).toBeVisible();
  const refreshed = await readAuthoritativeRound(page, issue.pairingId);
  expect(refreshed.state).toBe("action_pending");
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "Choose what happens next." })
  ).toBeVisible();
  expect(await readAuthoritativeRound(page, issue.pairingId)).toMatchObject({
    id: refreshed.id,
    state: "action_pending",
    stateVersion: refreshed.stateVersion
  });

  const traffic = [...desktopTraffic, ...phoneTraffic];
  expect(traffic.map(({ body }) => body).join("\n")).not.toMatch(
    /rawFrame|cameraFrames|rawAudio|audioBytes|pcm|transcript|providerKey|providerPayload|prompt/i
  );
  expect(JSON.stringify(candidate)).toContain('"rawMediaStored":false');
  await expectNoBrowserFailures(phone.failures);
  await expectNoBrowserFailures(desktopFailures);
  await phone.context.close();
});
