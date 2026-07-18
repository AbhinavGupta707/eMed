import {
  ApiErrorEnvelopeSchema,
  ApiSuccessEnvelopeSchema,
  RoundDataSchema
} from "@homerounds/api-client";
import { expect, test } from "@playwright/test";

import {
  calmAnswers,
  completeStructuredAnswers,
  confirmTypedNarrative,
  expectNoBrowserFailures,
  expectPersistedRoundContainsNoRawDraft,
  monitorBrowserFailures,
  profileUrls,
  scenarioUrl,
  startRound,
  submitConfirmedReport,
  submitSyntheticVoiceProposal,
  submitTypedReport,
  syntheticMedicationLabelPng
} from "./support";

test.describe.configure({ mode: "serial" });
const currentProfile = process.env.HOMEROUNDS_AI_PLAYWRIGHT_PROFILE;

test("an unseen deterministic-profile context accepts the pulse route across later versions", async ({
  page
}) => {
  test.skip(currentProfile !== "deterministic", "deterministic profile only");
  const pulseFailures = monitorBrowserFailures(page);
  const pulseStart = await startRound(
    page,
    scenarioUrl(profileUrls.deterministic, "maya-happy-text")
  );
  const pulseReport = await submitTypedReport(
    page,
    calmAnswers,
    "Identifier-free synthetic context for the pulse route."
  );
  expect(pulseReport.evidenceRoute.selectedModuleId).toBe("capture.finger_ppg.pulse");
  await expect(
    page.getByRole("heading", { level: 2, name: "Quality-gated finger pulse check" })
  ).toBeVisible();
  await expect(page.getByText("Selected — ready", { exact: true })).toBeVisible();
  await expect(page.getByText("What this can clarify", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Continue to this check" }).click();
  await page.getByRole("button", { name: "Continue on this computer" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "The selected camera check is unavailable" })
  ).toBeVisible();
  const advancedPulse = await expectPersistedRoundContainsNoRawDraft(
    page,
    profileUrls.deterministic,
    pulseStart.round.id,
    ["Identifier-free synthetic context for the pulse route."]
  );
  expect(advancedPulse.round.stateVersion).toBeGreaterThan(pulseReport.round.stateVersion);
  expect(advancedPulse.evidenceRoute?.selectedModuleId).toBe("capture.finger_ppg.pulse");
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "Your saved round needs a safe recovery step" })
  ).toBeVisible();
  await expect(
    page.getByText(
      "The persisted state was restored. Ephemeral camera, transcript, and decision data were not reused.",
      { exact: true }
    )
  ).toBeVisible();
  expectNoBrowserFailures(pulseFailures);
});

test("a different unseen medication-profile context requires image review, edit, and confirmation", async ({
  page
}) => {
  test.skip(currentProfile !== "medication", "medication profile only");
  const medicationPage = page;
  const medicationFailures = monitorBrowserFailures(page);
  const medicationStart = await startRound(
    medicationPage,
    scenarioUrl(profileUrls.medication, "maya-happy-text")
  );
  const medicationReport = await submitTypedReport(
    medicationPage,
    { ...calmAnswers, weakness: "Moderate", palpitations: "I’m not sure" },
    "Distinct identifier-free synthetic context for a medication review."
  );
  expect(medicationReport.evidenceRoute.selectedModuleId).toBe("medication.label.review");
  await expect(
    medicationPage.getByRole("heading", { level: 2, name: "Medication label review" })
  ).toBeVisible();
  await medicationPage.getByRole("button", { name: "Continue to this check" }).click();
  await expect(
    medicationPage.getByRole("heading", { level: 2, name: "Review what a medication label shows" })
  ).toBeVisible();

  await medicationPage
    .getByLabel(/I will use only a synthetic, identifier-free demo label/i)
    .check();
  const imageRequestBodies: string[] = [];
  medicationPage.on("request", (request) => {
    if (/\/medication\/label$/.test(new URL(request.url()).pathname)) {
      imageRequestBodies.push(request.postData() ?? "");
    }
  });
  const image = syntheticMedicationLabelPng();
  await medicationPage.getByTestId("medication-upload-input").setInputFiles({
    name: "identifier-free-synthetic-label.png",
    mimeType: "image/png",
    buffer: image
  });
  await expect(
    medicationPage.getByRole("heading", { level: 3, name: "Review the unconfirmed draft" })
  ).toBeVisible();
  await expect(medicationPage.getByAltText("Temporary medication label preview")).toHaveCount(0);
  expect(imageRequestBodies).toHaveLength(1);

  await medicationPage.reload();
  await expect(
    medicationPage.getByRole("heading", { level: 2, name: "Medication label review" })
  ).toBeVisible();
  await medicationPage.getByRole("button", { name: "Continue to this check" }).click();
  await expect(
    medicationPage.getByRole("heading", { level: 2, name: "Review what a medication label shows" })
  ).toBeVisible();
  await expect(
    medicationPage.getByRole("heading", { level: 3, name: "Review the unconfirmed draft" })
  ).toHaveCount(0);
  await expect(medicationPage.getByAltText("Temporary medication label preview")).toHaveCount(0);
  await expectPersistedRoundContainsNoRawDraft(
    medicationPage,
    profileUrls.medication,
    medicationStart.round.id,
    [
      image.toString("base64"),
      "Distinct identifier-free synthetic context for a medication review."
    ]
  );

  await medicationPage
    .getByLabel(/I will use only a synthetic, identifier-free demo label/i)
    .check();
  await medicationPage.getByTestId("medication-upload-input").setInputFiles({
    name: "identifier-free-synthetic-label.png",
    mimeType: "image/png",
    buffer: image
  });
  await expect(
    medicationPage.getByRole("heading", { level: 3, name: "Review the unconfirmed draft" })
  ).toBeVisible();
  await medicationPage.getByLabel("Your review").nth(0).selectOption("accepted");
  await medicationPage.getByLabel("Your review").nth(1).selectOption("corrected");
  await medicationPage.getByLabel("Corrected strength").fill("12 mg synthetic strength");
  await medicationPage.getByLabel("Your review").nth(2).selectOption("not_visible");
  await medicationPage
    .getByLabel(/I reviewed every item and confirm these observations only/i)
    .check();
  await medicationPage.getByRole("button", { name: "Confirm reviewed observations" }).click();
  await expect(
    medicationPage.getByRole("heading", {
      level: 1,
      name: "A pulse check is the most useful next step."
    })
  ).toBeVisible();
  const confirmedMedication = await expectPersistedRoundContainsNoRawDraft(
    medicationPage,
    profileUrls.medication,
    medicationStart.round.id,
    [image.toString("base64")]
  );
  expect(confirmedMedication.evidenceRoute).toMatchObject({
    selectedModuleId: "medication.label.review",
    medicationConfirmed: true,
    medicationSkipped: false
  });
  expectNoBrowserFailures(medicationFailures);
});

test("synthetic voice proposals remain editable and medication confirmation has full parity", async ({
  page
}) => {
  test.skip(currentProfile !== "medication", "medication profile only");
  const failures = monitorBrowserFailures(page);
  const start = await startRound(page, scenarioUrl(profileUrls.medication, "maya-poor-quality"));
  await completeStructuredAnswers(page, {
    ...calmAnswers,
    weakness: "Moderate",
    palpitations: "Comes and goes"
  });
  const report = await submitSyntheticVoiceProposal(page);
  expect(report.evidenceRoute.selectedModuleId).toBe("medication.label.review");
  await expect(
    page.getByRole("heading", { level: 2, name: "Medication label review" })
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue to this check" }).click();

  await page.getByLabel("Product name").selectOption("corrected");
  await page.getByLabel("Product name text").fill("Unfinished synthetic tablet draft");
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 2, name: "Medication label review" })
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue to this check" }).click();
  await expect(page.getByLabel("Product name")).toHaveValue("");
  await expect(page.getByLabel("Product name text")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Your check-in text" })).toHaveCount(0);
  await expectPersistedRoundContainsNoRawDraft(page, profileUrls.medication, start.round.id, [
    "Synthetic voice-agent proposal for explicit patient review.",
    "Unfinished synthetic tablet draft"
  ]);

  await page.getByLabel("Product name").selectOption("corrected");
  await page.getByLabel("Product name text").fill("Confirmed synthetic tablet");
  await page.getByLabel("Strength").selectOption("not_visible");
  await page.getByLabel(/I reviewed and confirm these text-entered observations/i).check();
  await page.getByRole("button", { name: "Confirm text-entered observations" }).click();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "A pulse check is the most useful next step."
    })
  ).toBeVisible();
  const persisted = await expectPersistedRoundContainsNoRawDraft(
    page,
    profileUrls.medication,
    start.round.id,
    ["Synthetic voice-agent proposal for explicit patient review."]
  );
  expect(persisted.evidenceRoute?.medicationConfirmed).toBe(true);
  expectNoBrowserFailures(failures);
});

test("optional medication review can be explicitly skipped into the deterministic pulse route", async ({
  page
}) => {
  test.skip(currentProfile !== "medication", "medication profile only");
  const failures = monitorBrowserFailures(page);
  const start = await startRound(page, scenarioUrl(profileUrls.medication, "maya-red-flag"));
  await submitTypedReport(page, calmAnswers, "Synthetic skip-route context.");
  await expect(
    page.getByRole("heading", { level: 2, name: "Medication label review" })
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue to this check" }).click();
  await page.getByRole("button", { name: "Skip label review and continue" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "The selected camera check is unavailable" })
  ).toBeVisible();
  const persisted = await expectPersistedRoundContainsNoRawDraft(
    page,
    profileUrls.medication,
    start.round.id,
    ["Synthetic skip-route context."]
  );
  expect(persisted.evidenceRoute).toMatchObject({
    selectedModuleId: "medication.label.review",
    medicationConfirmed: false,
    medicationSkipped: true
  });
  expectNoBrowserFailures(failures);
});

test("AI abstention preserves the complete deterministic fallback", async ({ page }) => {
  test.skip(currentProfile !== "abstain", "abstain profile only");
  const abstainFailures = monitorBrowserFailures(page);
  await startRound(page, scenarioUrl(profileUrls.abstain, "maya-happy-text"));
  const abstained = await submitTypedReport(page, calmAnswers, "Synthetic abstention context.");
  expect(abstained.evidenceRoute.selectedModuleId).toBe("capture.finger_ppg.pulse");
  await expect(
    page.getByRole("heading", { level: 1, name: "Your usual next step is still available" })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Quality-gated finger pulse check" })
  ).toBeVisible();
  await expect(page.getByText("Usual route continues", { exact: true })).toBeVisible();
  expectNoBrowserFailures(abstainFailures);
});

test("provider failure preserves the complete deterministic fallback", async ({ page }) => {
  test.skip(currentProfile !== "failure", "failure profile only");
  const failureFailures = monitorBrowserFailures(page);
  await startRound(page, scenarioUrl(profileUrls.failure, "maya-happy-text"));
  const failed = await submitTypedReport(
    page,
    { ...calmAnswers, weakness: "I’m not sure" },
    "Synthetic provider-failure context."
  );
  expect(failed.evidenceRoute.selectedModuleId).toBe("capture.finger_ppg.pulse");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "A personalised recommendation is unavailable"
    })
  ).toBeVisible();
  await expect(page.getByText("Usual route available", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Quality-gated finger pulse check" })
  ).toBeVisible();
  expectNoBrowserFailures(failureFailures);
});

test("stale browser state reloads safely before the slow provider completes a retry", async ({
  page
}) => {
  test.skip(currentProfile !== "slow", "slow profile only");
  const failures = monitorBrowserFailures(page);
  const started = await startRound(page, scenarioUrl(profileUrls.slow, "maya-happy-text"));
  await completeStructuredAnswers(page, calmAnswers);
  await confirmTypedNarrative(page, "Synthetic stale-state recovery context.");

  const externalTransition = await page.request.post(
    `${profileUrls.slow}/api/rounds/${started.round.id}/transition`,
    {
      headers: { origin: profileUrls.slow },
      data: {
        to: "collecting_report",
        expectedStateVersion: started.round.stateVersion
      }
    }
  );
  expect(externalTransition.status()).toBe(200);
  const externallyAdvanced = ApiSuccessEnvelopeSchema(RoundDataSchema).parse(
    await externalTransition.json()
  ).data;
  expect(externallyAdvanced.round.state).toBe("collecting_report");

  const staleTransition = await page.request.post(
    `${profileUrls.slow}/api/rounds/${started.round.id}/transition`,
    {
      headers: { origin: profileUrls.slow },
      data: {
        to: "collecting_report",
        expectedStateVersion: started.round.stateVersion
      }
    }
  );
  expect(staleTransition.status()).toBe(409);
  expect(ApiErrorEnvelopeSchema.parse(await staleTransition.json()).error.code).toBe("stale_state");

  await page.getByRole("button", { name: "Review my report" }).click();
  await page.getByLabel("I reviewed every field and confirm these are my answers.").check();
  const staleTransitionResponse = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === "POST" &&
      /\/api\/rounds\/[^/]+\/transition$/.test(new URL(candidate.url()).pathname)
  );
  const automaticRecoveryRead = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === "GET" &&
      new URL(candidate.url()).pathname === `/api/rounds/${started.round.id}`
  );
  await page.getByRole("button", { name: "Confirm and continue" }).click();
  expect((await staleTransitionResponse).status()).toBe(409);
  await automaticRecoveryRead;
  await expect
    .poll(() => failures.consoleErrors.some((message) => message.includes("409 (Conflict)")))
    .toBe(true);
  const expectedConflict = failures.consoleErrors.findIndex((message) =>
    message.includes("409 (Conflict)")
  );
  failures.consoleErrors.splice(expectedConflict, 1);
  await expect(page.getByText("This round changed elsewhere", { exact: true })).toBeVisible();

  const retryStarted = Date.now();
  const reportResponse = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === "POST" &&
      /\/api\/rounds\/[^/]+\/report$/.test(new URL(candidate.url()).pathname)
  );
  await page.getByRole("button", { name: "Confirm and continue" }).click();
  await expect(page.getByRole("button", { name: /Checking answers/i })).toBeDisabled();
  const response = await reportResponse;
  expect(response.status()).toBe(200);
  expect(Date.now() - retryStarted).toBeGreaterThanOrEqual(1_000);
  await expect(
    page.getByRole("heading", { level: 2, name: "Quality-gated finger pulse check" })
  ).toBeVisible();
  await expectPersistedRoundContainsNoRawDraft(page, profileUrls.slow, started.round.id, [
    "Synthetic stale-state recovery context."
  ]);
  expectNoBrowserFailures(failures);
});
