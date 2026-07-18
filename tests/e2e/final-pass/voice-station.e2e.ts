import { expect, test } from "@playwright/test";

import {
  calmAnswers,
  expectNoBrowserFailures,
  monitorBrowserFailures,
  startRound,
  submitTypedReport
} from "../ai/support";
import {
  installSyntheticMicrophone,
  installVoiceStationRouteFixture
} from "../voice-agent/support";

test("current sustained-vowel station reports denial without a fact and preserves decline", async ({
  page
}) => {
  const failures = monitorBrowserFailures(page);
  const resultRequests: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      /\/api\/rounds\/[^/]+\/voice-biomarker$/.test(new URL(request.url()).pathname)
    ) {
      resultRequests.push(request.url());
    }
  });
  await installSyntheticMicrophone(page, "denied");
  await installVoiceStationRouteFixture(page);
  await startRound(page, "/round?scenario=maya-poor-quality");
  await submitTypedReport(
    page,
    { ...calmAnswers, weakness: "Moderate", palpitations: "Comes and goes" },
    "Identifier-free synthetic sustained-vowel denial fixture."
  );

  await page.getByRole("button", { name: "Continue to this check" }).click();
  await expect(
    page.getByRole("heading", { level: 2, name: "Sustained-vowel research signal" })
  ).toBeVisible();
  await expect(page.getByText("Research signal—not a diagnosis", { exact: true })).toBeVisible();
  await page.getByLabel(/I consent to one separate local sustained-vowel capture/i).check();
  await page.getByRole("button", { name: "Start 7-second capture" }).click();
  await expect(page.getByText(/Microphone permission was denied/i)).toBeVisible();
  expect(resultRequests).toEqual([]);
  await page.getByRole("button", { name: "Decline optional station" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "A pulse check is the most useful next step." })
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Your confirmed progress is still here", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Quality-gated finger pulse check" })
  ).toBeVisible();
  expectNoBrowserFailures(failures);
});
