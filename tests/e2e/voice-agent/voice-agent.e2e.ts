import { SubmitReportRequestSchema } from "@homerounds/api-client";
import { expect, test } from "@playwright/test";

import {
  VOICE_FALLBACK_ORIGIN,
  VOICE_FIXTURE_ORIGIN,
  calmAnswers,
  confirmSyntheticVoiceNarrative,
  expectNoBrowserFailures,
  expectNoPersistedDraft,
  installSyntheticMicrophone,
  installVoiceStationRouteFixture,
  monitorBrowserFailures,
  scenarioUrl,
  startRound,
  submitTypedReport
} from "./support";

test.describe.configure({ mode: "serial" });

function isProfile(projectName: string, profile: "fallback" | "fixture"): boolean {
  return projectName.includes(profile);
}

test("keyless typed proposal stays editable and requires explicit review before routing", async ({
  page
}, testInfo) => {
  test.skip(!isProfile(testInfo.project.name, "fixture"), "synthetic voice fixture profile only");
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
  const start = await startRound(page, scenarioUrl(VOICE_FIXTURE_ORIGIN, "maya-happy-text"));
  await expect(page.getByRole("heading", { level: 2, name: "History and purpose" })).toBeVisible();
  await expect(page.getByText("Synthetic data only", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Source: bounded synthetic history summary", { exact: true })
  ).toBeVisible();
  const edited = "Edited identifier-free synthetic voice fixture for explicit confirmation.";
  await confirmSyntheticVoiceNarrative(page, edited);
  await expect(
    page.getByRole("heading", { level: 2, name: "Review every proposed field" })
  ).toBeVisible();
  await expect(page.getByText("Draft — not submitted", { exact: true })).toBeVisible();
  await expect(page.getByText("Review progress: 0 of 6 fields.", { exact: false })).toBeVisible();
  expect(reportRequests).toEqual([]);

  await page.getByLabel("Weakness", { exact: true }).selectOption("moderate");
  await page.getByLabel("Palpitations", { exact: true }).selectOption("intermittent");
  await page.getByLabel("Chest pain now", { exact: true }).selectOption("no");
  await page.getByLabel("Severe breathlessness now", { exact: true }).selectOption("no");
  await page.getByLabel("Fainted", { exact: true }).selectOption("no");
  await page.getByLabel("Patient note", { exact: true }).selectOption("remove");
  await expect(page.getByText("Review progress: 6 of 6 fields.", { exact: false })).toBeVisible();
  expect(reportRequests).toEqual([]);

  await page.getByLabel(/I reviewed every field and confirm these are my answers/i).check();
  const reportRequest = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      /\/api\/rounds\/[^/]+\/report$/.test(new URL(request.url()).pathname)
  );
  const reportResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /\/api\/rounds\/[^/]+\/report$/.test(new URL(response.url()).pathname)
  );
  await page.getByRole("button", { name: "Confirm reviewed report" }).click();
  const submitted = SubmitReportRequestSchema.parse((await reportRequest).postDataJSON());
  expect(submitted.report).toMatchObject({
    inputMode: "voice_confirmed",
    weakness: "moderate",
    palpitations: "intermittent",
    redFlags: {
      chestPain: "no",
      severeBreathlessness: "no",
      fainted: "no"
    }
  });
  expect(submitted.report).not.toHaveProperty("note");
  expect((await reportResponse).status()).toBe(200);
  expect(reportRequests).toHaveLength(1);
  await expect(
    page.getByRole("heading", { level: 3, name: "Quality-gated finger pulse check was selected" })
  ).toBeVisible();
  await expectNoPersistedDraft(page, VOICE_FIXTURE_ORIGIN, start.round.id, edited);

  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "Next, prepare a short camera pulse check" })
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Your check-in text" })).toHaveCount(0);
  expectNoBrowserFailures(failures);
});

test("optional local station reports microphone denial honestly and persists an explicit decline", async ({
  page
}, testInfo) => {
  test.skip(!isProfile(testInfo.project.name, "fixture"), "synthetic voice fixture profile only");
  const failures = monitorBrowserFailures(page);
  const submittedVoiceResults: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      /\/api\/rounds\/[^/]+\/voice-biomarker$/.test(new URL(request.url()).pathname)
    ) {
      submittedVoiceResults.push(request.url());
    }
  });
  await installSyntheticMicrophone(page, "denied");
  await installVoiceStationRouteFixture(page);
  await startRound(page, scenarioUrl(VOICE_FIXTURE_ORIGIN, "maya-poor-quality"));
  await submitTypedReport(
    page,
    { ...calmAnswers, palpitations: "Comes and goes" },
    "Synthetic local-station permission-denial fixture."
  );

  await expect(
    page.getByRole("heading", { level: 2, name: "Sustained-vowel research signal" })
  ).toBeVisible();
  await expect(page.getByText("Research signal—not a diagnosis", { exact: true })).toBeVisible();
  await page.getByLabel(/I consent to one separate local sustained-vowel capture/i).check();
  await page.getByRole("button", { name: "Start 7-second capture" }).click();
  await expect(
    page.getByText(/Microphone permission was denied\. Change the browser permission/i)
  ).toBeVisible();
  expect(submittedVoiceResults).toEqual([]);
  await page.getByRole("button", { name: "Decline optional station" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Next, prepare a short camera pulse check" })
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "Next, prepare a short camera pulse check" })
  ).toBeVisible();
  expectNoBrowserFailures(failures);
});

test("deterministic silent audio offers one retry, then fails without a fact and can be declined", async ({
  page
}, testInfo) => {
  test.skip(!isProfile(testInfo.project.name, "fixture"), "synthetic voice fixture profile only");
  test.slow();
  const failures = monitorBrowserFailures(page);
  const submittedVoiceResults: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      /\/api\/rounds\/[^/]+\/voice-biomarker$/.test(new URL(request.url()).pathname)
    ) {
      submittedVoiceResults.push(request.url());
    }
  });
  await installSyntheticMicrophone(page, "silence");
  await installVoiceStationRouteFixture(page);
  await startRound(page, scenarioUrl(VOICE_FIXTURE_ORIGIN, "maya-red-flag"));
  await submitTypedReport(
    page,
    { ...calmAnswers, weakness: "Moderate" },
    "Synthetic silent-audio retry fixture."
  );
  await page.getByLabel(/I consent to one separate local sustained-vowel capture/i).check();
  await page.getByRole("button", { name: "Start 7-second capture" }).click();
  await expect(
    page.getByRole("heading", { level: 3, name: "Retry the quality check" })
  ).toBeVisible({
    timeout: 12_000
  });
  await expect(page.getByText("No feature fact or measurement was created.")).toBeVisible();
  await page.getByRole("button", { name: "Try capture again" }).click();
  await expect(page.getByRole("heading", { level: 3, name: "Quality check failed" })).toBeVisible({
    timeout: 12_000
  });
  await expect(page.getByText("No feature fact or measurement was created.")).toBeVisible();
  expect(submittedVoiceResults).toEqual([]);
  await page.getByRole("button", { name: "Decline optional station" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Next, prepare a short camera pulse check" })
  ).toBeVisible();
  expectNoBrowserFailures(failures);
});

test("disabled live provider keeps complete text parity without a key", async ({
  page
}, testInfo) => {
  test.skip(
    !isProfile(testInfo.project.name, "fallback"),
    "disabled-provider fallback profile only"
  );
  const failures = monitorBrowserFailures(page);
  const start = await startRound(page, scenarioUrl(VOICE_FALLBACK_ORIGIN, "maya-happy-text"));
  await page.getByRole("button", { name: "Start voice" }).click();
  await expect(
    page.getByText("Voice is not configured. You can complete this step with text.", {
      exact: true
    })
  ).toBeVisible();
  const narrative = "Identifier-free text fallback with the same structured confirmation path.";
  const report = await submitTypedReport(page, calmAnswers, narrative);
  expect(report.selectedModuleId).toBe("capture.finger_ppg.pulse");
  await expectNoPersistedDraft(page, VOICE_FALLBACK_ORIGIN, start.round.id, narrative);
  expectNoBrowserFailures(failures);
});
