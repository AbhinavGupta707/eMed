import {
  ApiSuccessEnvelopeSchema,
  RoundDataSchema,
  SubmitReportDataSchema
} from "@homerounds/api-client";
import { expect, type APIResponse, type Page } from "@playwright/test";
import { deflateSync } from "node:zlib";
import type { z } from "zod";

type RoundData = z.infer<typeof RoundDataSchema>;

export const profileUrls = {
  abstain: "http://127.0.0.1:3113",
  deterministic: "http://127.0.0.1:3111",
  failure: "http://127.0.0.1:3114",
  medication: "http://127.0.0.1:3112",
  slow: "http://127.0.0.1:3115"
} as const;

export type SyntheticScenario = "maya-happy-text" | "maya-poor-quality" | "maya-red-flag";

export type StructuredAnswers = Readonly<{
  chestPain: "Yes" | "No" | "I’m not sure";
  severeBreathlessness: "Yes" | "No" | "I’m not sure";
  fainted: "Yes" | "No" | "I’m not sure";
  weakness: "None" | "Mild" | "Moderate" | "Severe" | "I’m not sure";
  palpitations: "None" | "Comes and goes" | "Happening now" | "I’m not sure";
}>;

export const calmAnswers: StructuredAnswers = {
  chestPain: "No",
  severeBreathlessness: "No",
  fainted: "No",
  weakness: "Mild",
  palpitations: "None"
};

export function scenarioUrl(baseUrl: string, scenario: SyntheticScenario): string {
  return `${baseUrl}/round?scenario=${scenario}`;
}

export function monitorBrowserFailures(page: Page): {
  consoleErrors: string[];
  pageErrors: string[];
} {
  const failures = { consoleErrors: [] as string[], pageErrors: [] as string[] };
  page.on("console", (message) => {
    if (message.type() === "error") failures.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => failures.pageErrors.push(String(error)));
  return failures;
}

export function expectNoBrowserFailures(failures: {
  consoleErrors: string[];
  pageErrors: string[];
}): void {
  expect(failures.consoleErrors).toEqual([]);
  expect(failures.pageErrors).toEqual([]);
}

function parseRoundResponse(response: APIResponse): Promise<RoundData> {
  return response
    .json()
    .then((value: unknown) => ApiSuccessEnvelopeSchema(RoundDataSchema).parse(value).data);
}

export async function startRound(page: Page, url: string): Promise<RoundData> {
  const response = await page.goto(url);
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { level: 1, name: "Ready when you are, Maya." })
  ).toBeVisible();
  await page
    .getByLabel(
      "I understand this check does not diagnose a condition or contact a medical service."
    )
    .check();
  const transitionResponse = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === "POST" &&
      /\/api\/rounds\/[^/]+\/transition$/.test(new URL(candidate.url()).pathname)
  );
  await page.getByRole("button", { name: "Start my check-in" }).click();
  const round = await parseRoundResponse(await transitionResponse);
  await expect(
    page.getByRole("heading", { level: 1, name: "Three questions before we talk." })
  ).toBeVisible();
  return round;
}

async function choose(page: Page, legend: string, answer: string): Promise<void> {
  await page.getByRole("group", { name: legend }).getByLabel(answer, { exact: true }).check();
}

export async function completeStructuredAnswers(
  page: Page,
  answers: StructuredAnswers
): Promise<void> {
  await choose(page, "Are you having chest pain now?", answers.chestPain);
  await choose(page, "Are you severely short of breath now?", answers.severeBreathlessness);
  await choose(page, "Have you fainted?", answers.fainted);
  await page.getByRole("button", { name: "Continue to conversation" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Tell me what’s changed." })
  ).toBeVisible();
  await choose(page, "How weak do you feel?", answers.weakness);
  await choose(
    page,
    "Are you noticing a racing, pounding, or fluttering feeling?",
    answers.palpitations
  );
}

export async function confirmTypedNarrative(page: Page, narrative: string): Promise<void> {
  await page.getByRole("textbox", { name: "Your check-in text" }).fill(narrative);
  await page.getByRole("button", { name: "Confirm this text" }).click();
  await expect(page.getByRole("button", { name: "Text confirmed" })).toBeDisabled();
}

export async function submitSyntheticVoiceProposal(page: Page) {
  await page.getByRole("button", { name: "Start voice" }).click();
  await expect(
    page.getByRole("heading", { level: 2, name: "Let’s make sure I understood." })
  ).toBeVisible();
  await page.getByLabel("Weakness", { exact: true }).selectOption("moderate");
  await page.getByLabel("Palpitations", { exact: true }).selectOption("intermittent");
  await page.getByLabel("Chest pain now", { exact: true }).selectOption("no");
  await page.getByLabel("Severe breathlessness now", { exact: true }).selectOption("no");
  await page.getByLabel("Fainted", { exact: true }).selectOption("no");
  await page.getByLabel("Anything else", { exact: true }).selectOption("remove");
  await page.getByLabel(/I reviewed every field and confirm these are my answers/i).check();
  const reportResponse = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === "POST" &&
      /\/api\/rounds\/[^/]+\/report$/.test(new URL(candidate.url()).pathname)
  );
  await page.getByRole("button", { name: "Confirm reviewed report" }).click();
  const response = await reportResponse;
  expect(response.status()).toBe(200);
  return ApiSuccessEnvelopeSchema(SubmitReportDataSchema).parse(await response.json()).data;
}

export async function submitConfirmedReport(page: Page) {
  await page.getByRole("button", { name: "Review my report" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Let’s make sure I understood." })
  ).toBeVisible();
  await page.getByLabel("I reviewed every field and confirm these are my answers.").check();
  const reportResponse = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === "POST" &&
      /\/api\/rounds\/[^/]+\/report$/.test(new URL(candidate.url()).pathname)
  );
  await page.getByRole("button", { name: "Confirm and continue" }).click();
  const response = await reportResponse;
  expect(response.status()).toBe(200);
  return ApiSuccessEnvelopeSchema(SubmitReportDataSchema).parse(await response.json()).data;
}

export async function submitTypedReport(page: Page, answers: StructuredAnswers, narrative: string) {
  await completeStructuredAnswers(page, answers);
  await confirmTypedNarrative(page, narrative);
  return submitConfirmedReport(page);
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, checksum]);
}

/** Creates a valid, identifier-free 320px PNG entirely in test memory. */
export function syntheticMedicationLabelPng(): Buffer {
  const width = 320;
  const height = 320;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const row = Buffer.alloc(1 + width * 4, 0xff);
  row[0] = 0;
  const pixels = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(pixels)),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

export async function expectPersistedRoundContainsNoRawDraft(
  page: Page,
  baseUrl: string,
  roundId: string,
  forbiddenText: readonly string[] = []
): Promise<RoundData> {
  const response = await page.request.get(`${baseUrl}/api/rounds/${roundId}`);
  expect(response.status()).toBe(200);
  const data = await parseRoundResponse(response);
  const persisted = JSON.stringify(data);
  expect(persisted).not.toMatch(
    /data:image|raw(?:_|-)?(?:image|audio|frame)|transcript|providerPayload/i
  );
  for (const forbidden of forbiddenText) expect(persisted).not.toContain(forbidden);
  return data;
}
