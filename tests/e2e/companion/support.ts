import { devices, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import {
  CompanionDesktopSnapshotSchema,
  CompanionPairingIssueSchema,
  CompanionPhoneSnapshotSchema,
  CompanionResultReceiptSchema,
  type CompanionPairingIssue,
  type CompanionPhoneSnapshot
} from "../../../packages/companion/src/index";
import { z } from "../../../packages/companion/node_modules/zod";

import {
  calmReport,
  numericMeasurement,
  observeBrowserFailures,
  startRound,
  submitTextReport
} from "../patient/support";

const CorrelationSchema = z.object({ correlationId: z.string().min(1).max(120) }).strict();
const IssueEnvelopeSchema = z
  .object({
    data: z.object({ issue: CompanionPairingIssueSchema }).strict(),
    meta: CorrelationSchema
  })
  .strict();
const PhoneEnvelopeSchema = z
  .object({
    data: z.object({ snapshot: CompanionPhoneSnapshotSchema }).strict(),
    meta: CorrelationSchema
  })
  .strict();
const DesktopEnvelopeSchema = z
  .object({
    data: z.object({ snapshot: CompanionDesktopSnapshotSchema }).strict(),
    meta: CorrelationSchema
  })
  .strict();
const ReceiptEnvelopeSchema = z
  .object({
    data: z.object({ receipt: CompanionResultReceiptSchema }).strict(),
    meta: CorrelationSchema
  })
  .strict();

export type BrowserFailures = ReturnType<typeof observeBrowserFailures>;
export type CompanionTraffic = Array<{ url: string; method: string; body: string }>;

export async function browserCompanionRequest(
  page: Page,
  path: string,
  input: Readonly<{ method?: "GET" | "POST"; body?: unknown }> = {}
): Promise<{ status: number; body: unknown }> {
  return page.evaluate(
    async ({ requestPath, method, requestBody }) => {
      const response = await fetch(requestPath, {
        method,
        credentials: "same-origin",
        cache: "no-store",
        ...(requestBody === undefined
          ? {}
          : {
              headers: { "content-type": "application/json" },
              body: JSON.stringify(requestBody)
            })
      });
      return { status: response.status, body: (await response.json()) as unknown };
    },
    {
      requestPath: path,
      method: input.method ?? "GET",
      requestBody: input.body
    }
  );
}

export function expectOnlyHandledRecoveryFailures(failures: BrowserFailures): void {
  expect(failures.pageErrors).toEqual([]);
  expect(
    failures.consoleErrors.filter(
      (message) =>
        !/Failed to load resource: the server responded with a status of 410 (?:\(Gone\)|\(\))/.test(
          message
        ) && !/ERR_INTERNET_DISCONNECTED/.test(message)
    )
  ).toEqual([]);
}

export function collectCompanionTraffic(page: Page, traffic: CompanionTraffic): void {
  page.on("request", (request) => {
    const url = request.url();
    if (new URL(url).pathname.startsWith("/api/companion")) {
      traffic.push({ url, method: request.method(), body: request.postData() ?? "" });
    }
  });
}

export async function launchDesktopPairing(
  page: Page,
  options: Readonly<{ proveNoKeyVoiceFallback?: boolean }> = {
    proveNoKeyVoiceFallback: true
  }
): Promise<CompanionPairingIssue> {
  const response = await page.goto("/round?scenario=maya-happy-text");
  expect(response?.status()).toBe(200);
  await startRound(page);
  await submitTextReport(page, calmReport, options);
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

  const issueResponse = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === "POST" &&
      new URL(candidate.url()).pathname === "/api/companion/pairings"
  );
  await page.getByRole("button", { name: "Use my phone" }).click();
  const issued = await issueResponse;
  expect(issued.status()).toBe(201);
  const issue = IssueEnvelopeSchema.parse(await issued.json()).data.issue;
  await expect(
    page.getByRole("img", { name: "QR code for the short-lived HomeRounds phone link" })
  ).toBeVisible();
  const fallback = page.getByRole("link", { name: "Open the secure link instead" });
  await expect(fallback).toHaveAttribute("href", issue.pairingLink);
  return issue;
}

export async function revokeAndReissueDesktopPairing(
  page: Page,
  issue: CompanionPairingIssue
): Promise<CompanionPairingIssue> {
  const revoked = await browserCompanionRequest(
    page,
    `/api/companion/pairings/${issue.pairingId}/revoke`,
    {
      method: "POST",
      body: {
        operationId: "11111111-2222-4333-8444-555555555555",
        expectedPairingVersion: issue.pairingVersion
      }
    }
  );
  const revokedBody = revoked.body as {
    data?: unknown;
    error?: { code?: string; correlationId?: string };
  };
  expect(
    revoked.status,
    `Companion revoke failed: ${revokedBody.error?.code ?? "unknown"} (${revokedBody.error?.correlationId ?? "no-correlation"})`
  ).toBe(200);
  expect(DesktopEnvelopeSchema.parse(revokedBody).data.snapshot).toMatchObject({
    connection: "revoked",
    reissueRequired: true
  });
  await expect(page.getByRole("button", { name: "Create a new code" })).toBeVisible({
    timeout: 5_000
  });

  const reissueResponse = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === "POST" &&
      new URL(candidate.url()).pathname === `/api/companion/pairings/${issue.pairingId}/reissue`
  );
  await page.getByRole("button", { name: "Create a new code" }).click();
  const reissued = await reissueResponse;
  expect(reissued.status()).toBe(201);
  const replacement = IssueEnvelopeSchema.parse(await reissued.json()).data.issue;
  expect(replacement.pairingId).not.toBe(issue.pairingId);
  expect(replacement.pairingLink).not.toBe(issue.pairingLink);
  await expect(page.getByRole("link", { name: "Open the secure link instead" })).toHaveAttribute(
    "href",
    replacement.pairingLink
  );
  return replacement;
}

export async function openPhone(
  browser: Browser,
  pairingLink: string,
  traffic: CompanionTraffic = []
): Promise<{
  context: BrowserContext;
  page: Page;
  failures: BrowserFailures;
}> {
  const context = await browser.newContext({
    ...devices["iPhone 12"],
    baseURL: new URL(pairingLink).origin,
    ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET
      ? {
          extraHTTPHeaders: {
            "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET
          }
        }
      : {}),
    reducedMotion: "reduce"
  });
  const page = await context.newPage();
  const failures = observeBrowserFailures(page);
  collectCompanionTraffic(page, traffic);
  const response = await page.goto(pairingLink);
  expect(response?.status()).toBe(200);
  return { context, page, failures };
}

export async function expectPhoneReady(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { level: 1, name: "Finger pulse check" })).toBeVisible({
    timeout: 10_000
  });
  expect(new URL(page.url()).hash).toBe("");
  expect(new URL(page.url()).pathname).toBe("/companion");
  expect(await page.evaluate(() => document.cookie)).not.toContain("homerounds_companion");
  await expect(page.getByRole("status")).toContainText("Connected securely to your computer");
}

export async function advancePhoneToProgress(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Continue" }).tap();
  await expect(page.getByRole("heading", { level: 1, name: "You stay in control" })).toBeVisible();
  await expect(page.getByText("No recording or image is saved.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "I understand and want to continue" }).tap();
  await expect(page.getByRole("heading", { level: 1, name: "Finger pulse check" })).toBeVisible();
  await page.getByRole("button", { name: "I’m ready" }).tap();
  await expect(page.getByRole("heading", { level: 1, name: "Finger pulse check" })).toBeVisible();
  await expect(page.getByText("Selected for this round", { exact: true })).toBeVisible();
}

export async function readPhoneApi(page: Page): Promise<CompanionPhoneSnapshot> {
  const response = await browserCompanionRequest(page, "/api/companion/session");
  expect(response.status).toBe(200);
  return PhoneEnvelopeSchema.parse(response.body).data.snapshot;
}

export async function showUnavailablePhoneState(
  page: Page,
  snapshot: CompanionPhoneSnapshot
): Promise<CompanionPhoneSnapshot> {
  const response = await browserCompanionRequest(page, "/api/companion/session/status", {
    method: "POST",
    body: {
      operationId: crypto.randomUUID(),
      expectedSessionVersion: snapshot.sessionVersion,
      taskId: snapshot.task.taskId,
      taskKind: snapshot.task.kind,
      phase: "unavailable"
    }
  });
  expect(response.status).toBe(200);
  const next = PhoneEnvelopeSchema.parse(response.body).data.snapshot;
  await expect(
    page.getByRole("heading", { level: 1, name: "This check isn’t available here" })
  ).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText("No result was sent", { exact: true })).toBeVisible();
  return next;
}

export async function submitUnavailablePhoneResult(
  page: Page,
  snapshot: CompanionPhoneSnapshot,
  operationId = crypto.randomUUID()
) {
  const result = {
    operationId,
    expectedSessionVersion: snapshot.sessionVersion,
    taskId: snapshot.task.taskId,
    taskKind: snapshot.task.kind,
    clientObservedAt: new Date().toISOString(),
    rawMediaStored: false as const,
    outcome: "unavailable" as const,
    reason: "unsupported_device" as const
  };
  const response = await browserCompanionRequest(page, "/api/companion/session/result", {
    method: "POST",
    body: result
  });
  expect(response.status).toBe(200);
  const receipt = ReceiptEnvelopeSchema.parse(response.body).data.receipt;
  return { receipt, result };
}

export async function restoreDesktopCompanion(page: Page): Promise<void> {
  await page.reload();
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
  await page.getByRole("button", { name: "Use my phone" }).click();
  await expect(
    page.getByText("Your phone is connected. Continue with the guidance shown there.", {
      exact: true
    })
  ).toBeVisible({ timeout: 5_000 });
}

export { numericMeasurement };
