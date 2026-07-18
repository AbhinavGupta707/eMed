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
import { validFingerCandidate } from "./support";

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

test("a real paired finger candidate enters the deterministic workflow once and survives cold reload", async ({
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
  expect(progress).toMatchObject({
    task: { taskId: "capture.finger_ppg.pulse", kind: "finger_pulse" },
    taskPhase: "in_progress",
    lastResult: null
  });

  const candidate = validFingerCandidate(progress, "7a000000-0000-4000-8000-000000000001");
  const submitted = await browserCompanionRequest(phone.page, "/api/companion/session/result", {
    method: "POST",
    body: candidate
  });
  expect(submitted.status).toBe(200);
  const receipt = ReceiptEnvelopeSchema.parse(submitted.body).data.receipt;
  expect(receipt.replayed).toBe(false);

  await expect(phone.page.getByRole("heading", { level: 1, name: "Checked and sent" })).toBeVisible(
    { timeout: 10_000 }
  );
  await expect(
    page.getByText(
      "The phone result was received and checked against the normal quality and workflow rules.",
      { exact: true }
    )
  ).toBeVisible({ timeout: 10_000 });

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
  await expect(phone.page.getByRole("heading", { level: 1, name: "Checked and sent" })).toBeVisible(
    { timeout: 10_000 }
  );
  await page.getByRole("button", { name: "Mark result as received" }).click();
  await expect(
    phone.page.getByRole("heading", { level: 1, name: "Your computer received it" })
  ).toBeVisible({ timeout: 10_000 });
  await expect(
    page.getByRole("heading", { level: 1, name: "Choose what happens next." })
  ).toBeVisible({ timeout: 10_000 });
  const refreshedRound = await readAuthoritativeRound(page, issue.pairingId);
  expect(refreshedRound).toMatchObject({ state: "action_pending" });

  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "Choose what happens next." })
  ).toBeVisible({ timeout: 10_000 });
  expect(await readAuthoritativeRound(page, issue.pairingId)).toMatchObject({
    id: refreshedRound.id,
    state: "action_pending",
    stateVersion: refreshedRound.stateVersion
  });

  const traffic = [...desktopTraffic, ...phoneTraffic];
  expect(traffic.map(({ url }) => url).join("\n")).not.toMatch(/elevenlabs|fireworks|vitallens/i);
  expect(traffic.map(({ body }) => body).join("\n")).not.toMatch(
    /rawFrame|cameraFrames|rawAudio|audioBytes|pcm|transcript|providerKey|providerPayload|prompt/i
  );
  expect(JSON.stringify(candidate)).toMatch(/"rawMediaStored":false/);
  expect(JSON.stringify(candidate)).not.toMatch(
    /rawFrame|cameraFrames|rawAudio|audioBytes|pcm|transcript/i
  );
  await expectNoBrowserFailures(phone.failures);
  await expectNoBrowserFailures(desktopFailures);
  await phone.context.close();
});
