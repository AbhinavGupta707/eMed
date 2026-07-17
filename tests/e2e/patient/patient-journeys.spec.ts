import { expect, test } from "@playwright/test";

import {
  calmReport,
  confirmProgrammeTask,
  expectNoBrowserFailures,
  installCameraState,
  numericMeasurement,
  observeBrowserFailures,
  startRound,
  submitTextReport
} from "./support";

test("text path uses no-key fallback and recorded evidence only after explicit failed capture", async ({
  page
}) => {
  const failures = observeBrowserFailures(page);
  await installCameraState(page, "weak-signal");

  const networkPayloads: string[] = [];
  let collectCaptureTraffic = false;
  page.on("request", (request) => {
    if (collectCaptureTraffic) networkPayloads.push(request.postData() ?? "");
  });

  const response = await page.goto("/round?scenario=maya-happy-text");
  expect(response?.status()).toBe(200);
  await startRound(page);
  await submitTextReport(page, calmReport, { proveNoKeyVoiceFallback: true });

  await expect(
    page.getByRole("heading", { level: 1, name: "Next, prepare a short camera pulse check" })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Use labelled recorded demo capture" })
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Check this device" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: /Your device is ready for the/i })
  ).toBeVisible();
  await page
    .getByLabel(
      "I consent to this synthetic-demo camera check and understand that no result is guaranteed."
    )
    .check();

  collectCaptureTraffic = true;
  const qualitySubmission = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === "POST" &&
      /\/api\/rounds\/[^/]+\/assessments\/quality$/.test(new URL(candidate.url()).pathname)
  );
  await page.getByRole("button", { name: "Start camera check" }).click();
  const qualityResponse = await qualitySubmission;
  collectCaptureTraffic = false;
  expect(qualityResponse.status()).toBe(200);
  expect(await qualityResponse.json()).toMatchObject({
    data: { next: "retry", round: { state: "capture_retry" } }
  });

  await expect(numericMeasurement(page)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Use labelled recorded demo capture" })
  ).toBeVisible();
  expect(networkPayloads.join("\n")).not.toMatch(/raw(?:_|-)?frame|audio|transcript/i);

  await page.getByRole("button", { name: "Use labelled recorded demo capture" }).click();
  await expect(
    page.getByText("Recorded synthetic valid capture — demo recovery only", { exact: true })
  ).toBeVisible();
  await expect(page.getByText(/not physical-device or medical-validation evidence/i)).toBeVisible();

  const followUp = page.getByRole("heading", {
    level: 1,
    name: "One more structured question"
  });
  if (await followUp.isVisible()) {
    await page.getByRole("group", { name: "Your answer" }).getByLabel("No").check();
    await page.getByRole("button", { name: "Confirm this answer" }).click();
  }

  await expect(
    page.getByRole("heading", { level: 1, name: "Confirm the next demo step" })
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "Confirm the next demo step" })
  ).toBeVisible();
  await confirmProgrammeTask(page);

  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "Programme review requested" })
  ).toBeVisible();
  await expect(page.getByText("Saved synthetic task restored", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Synthetic demonstration — not clinically validated", { exact: true })
  ).toBeVisible();
  await expectNoBrowserFailures(failures);
});

test("unsupported camera creates no number and cancellation persists safely", async ({ page }) => {
  const failures = observeBrowserFailures(page);
  await installCameraState(page, "unsupported");

  await page.goto("/round?scenario=maya-poor-quality");
  await startRound(page);
  await submitTextReport(page, {
    ...calmReport,
    weakness: "Moderate",
    palpitations: "I’m not sure"
  });
  await page.getByRole("button", { name: "Check this device" }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: "The selected camera check is unavailable" })
  ).toBeVisible();
  await expect(
    page.getByText("This camera check is not supported here", { exact: true })
  ).toBeVisible();
  await expect(numericMeasurement(page)).toHaveCount(0);

  await page.getByRole("button", { name: "Cancel round" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "This round was cancelled" })
  ).toBeVisible();
  await expect(page.getByText("Camera and microphone stopped", { exact: true })).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "This round was cancelled" })
  ).toBeVisible();
  await expect(numericMeasurement(page)).toHaveCount(0);
  await expectNoBrowserFailures(failures);
});

test("patient-confirmed red flag hard-stops before assessment", async ({ page }) => {
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

  await expect(page.getByRole("heading", { level: 1, name: "Stop this demo round" })).toBeVisible();
  await expect(
    page.getByText("The deterministic safety gate ended the ordinary flow before any camera check.")
  ).toBeVisible();
  await expect(
    page.getByText("This prototype cannot assess an emergency", { exact: true })
  ).toBeVisible();
  expect(assessmentRequests).toEqual([]);
  await expect(page.getByRole("button", { name: "Check this device" })).toHaveCount(0);
  await expect(numericMeasurement(page)).toHaveCount(0);

  await page.getByLabel("I understand this is generic synthetic-demo guidance.").check();
  await page.getByRole("button", { name: "Confirm guidance shown" }).click();
  await expect(
    page.getByText(/No diagnosis was made and no real clinical service was contacted/i)
  ).toBeVisible();
  expect(assessmentRequests).toEqual([]);
  await expectNoBrowserFailures(failures);
});
