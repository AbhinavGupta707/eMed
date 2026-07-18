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
    page.getByRole("heading", { level: 2, name: "Quality-gated finger pulse check" })
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue to this check" }).click();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "A pulse check is the most useful next step."
    })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Use the labelled sample reading" })).toHaveCount(
    0
  );

  await page.getByRole("button", { name: "Continue on this computer" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: /Your device is ready for the/i })
  ).toBeVisible();
  await page
    .getByLabel(
      "I agree to use the camera for this check and understand that a reading is not guaranteed."
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
  await expect(page.getByRole("button", { name: "Use the labelled sample reading" })).toBeVisible();
  expect(networkPayloads.join("\n")).not.toMatch(/raw(?:_|-)?frame|audio|transcript/i);

  await page.getByRole("button", { name: "Use the labelled sample reading" }).click();
  await expect(page.getByText("Labelled sample reading used", { exact: true })).toBeVisible();
  await expect(page.getByText(/not a live or medically validated reading/i)).toBeVisible();

  const followUp = page.getByRole("heading", {
    level: 1,
    name: "One more question."
  });
  if (await followUp.isVisible()) {
    await page.getByRole("group", { name: "Your answer" }).getByLabel("No").check();
    await page.getByRole("button", { name: "Confirm this answer" }).click();
  }

  await expect(
    page.getByRole("heading", { level: 1, name: "Choose what happens next." })
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "Choose what happens next." })
  ).toBeVisible();
  await confirmProgrammeTask(page);

  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "Care-team review message saved" })
  ).toBeVisible();
  await expect(
    page.getByText("Waiting for HomeRounds review", { exact: true }).first()
  ).toBeVisible();
  await expect(page.getByText("Sample profile · Not medical care", { exact: true })).toBeVisible();
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
  await expect(
    page.getByRole("heading", { level: 2, name: "Quality-gated finger pulse check" })
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue to this check" }).click();
  await page.getByRole("button", { name: "Continue on this computer" }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: "The selected camera check is unavailable" })
  ).toBeVisible();
  await expect(
    page.getByText("This camera check is not supported here", { exact: true })
  ).toBeVisible();
  await expect(numericMeasurement(page)).toHaveCount(0);

  await page.getByRole("button", { name: "End check-in" }).click();
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

  await expect(page.getByRole("heading", { level: 1, name: "Stop this check-in." })).toBeVisible();
  await expect(
    page.getByText("Your required safety answers ended the ordinary flow before any camera check.")
  ).toBeVisible();
  await expect(
    page.getByText("HomeRounds cannot assess an emergency", { exact: true })
  ).toBeVisible();
  expect(assessmentRequests).toEqual([]);
  await expect(page.getByRole("button", { name: "Continue on this computer" })).toHaveCount(0);
  await expect(numericMeasurement(page)).toHaveCount(0);

  await page
    .getByLabel("I understand this is general guidance and no emergency service is connected.")
    .check();
  await page.getByRole("button", { name: "Confirm guidance shown" }).click();
  await expect(
    page.getByText(/No diagnosis was made and no real clinical service was contacted/i)
  ).toBeVisible();
  expect(assessmentRequests).toEqual([]);
  await expectNoBrowserFailures(failures);
});

test("structured memory is consented, corrected, restored, and deleted by the patient", async ({
  page
}) => {
  const failures = observeBrowserFailures(page);
  await page.goto("/memory");
  await expect(
    page.getByRole("heading", { level: 1, name: "What HomeRounds remembers" })
  ).toBeVisible();
  await page.getByRole("button", { name: "Allow structured memory" }).click();
  await expect(
    page.getByRole("heading", { level: 2, name: "Device for supported checks" })
  ).toBeVisible();
  await page.getByRole("button", { name: "Remember phone" }).click();
  await expect(page.getByText(/currently remembered: phone/i)).toBeVisible();

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
