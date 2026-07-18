import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  createQualityReviewTask,
  deterministicUuid,
  getApi,
  mutateTask,
  queueForRound,
  testRunKey,
  type ClinicianTaskDetail,
  type MutationBody
} from "./support";

function monitorPage(page: Page): { consoleErrors: string[]; pageErrors: string[] } {
  const failures = { consoleErrors: [] as string[], pageErrors: [] as string[] };
  page.on("console", (message) => {
    if (message.type() === "error") failures.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => failures.pageErrors.push(String(error)));
  return failures;
}

async function confirmMutation(page: Page, button: Locator, successText: RegExp): Promise<void> {
  await button.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText(successText)).toBeVisible();
}

test("runs the persisted no-measurement clinician loop and propagates completion to the patient", async ({
  page,
  request
}, testInfo) => {
  const failures = monitorPage(page);
  const setup = await createQualityReviewTask(request, testRunKey(testInfo, "closed-loop"), {
    triggerId: "homerounds-demo:v1:maya-poor-quality",
    purpose: "Fictional cardiometabolic programme check-in — capture quality recovery"
  });
  const queue = await queueForRound(request, setup.round.id);
  expect(queue).toMatchObject({ scope: "requested_rounds", tasks: [{ id: setup.task.id }] });
  expect(queue.tasks).toHaveLength(1);
  expect(setup.duplicateAction.created).toBe(false);

  const response = await page.goto(`/clinician?roundId=${setup.round.id}`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Clinician cockpit" })).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Synthetic record synthetic-maya" })
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Evidence chain" })).toBeVisible();
  await expect(page.getByText("No numeric measurement accepted")).toBeVisible();
  await expect(page.getByText("Absent by contract")).toBeVisible();
  await expect(page.getByText("Weak signal", { exact: true })).toBeVisible();
  await expect(page.getByText("Abstain for review", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Duplicate request suppression is present in the returned audit history.")
  ).toBeVisible();
  await expect(page.getByText(/Reference: [0-9a-f-]{36}/).first()).toBeVisible();
  await expect(
    page.getByText(/Raw camera frames, face video, and raw voice audio are absent/)
  ).toBeVisible();

  const noteText = "Synthetic E2E note: evidence reviewed; no numeric measurement was accepted.";
  await page.getByLabel("Note draft").fill(noteText);
  await page.getByRole("button", { name: "Save note" }).click();
  const noteRequestPromise = page.waitForRequest(
    (candidate) =>
      candidate.method() === "POST" &&
      candidate.url().endsWith(`/api/clinician/tasks/${setup.task.id}`)
  );
  await page
    .getByRole("dialog", { name: "Persist clinician note?" })
    .getByRole("button", { name: "Confirm" })
    .click();
  const noteRequest = await noteRequestPromise;
  await expect(page.getByText("Note persisted and audit reference confirmed.")).toBeVisible();
  await expect(page.getByText(/Audit reference: [0-9a-f-]{36}/)).toBeVisible();

  const noteBody = noteRequest.postDataJSON() as MutationBody;
  expect(noteBody).toMatchObject({ kind: "save_note", note: noteText });
  const idempotentRetry = await mutateTask(request, setup.task.id, noteBody);
  expect(idempotentRetry).toMatchObject({
    kind: "save_note",
    operationKey: noteBody.operationKey,
    duplicateSuppressed: true,
    note: { text: noteText, version: 1 }
  });

  await confirmMutation(
    page,
    page.getByRole("button", { name: "Acknowledge" }),
    /Acknowledgement persisted and audit reference confirmed/
  );
  await confirmMutation(
    page,
    page.getByRole("button", { name: "Record contact" }),
    /Contact attempt persisted and audit reference confirmed/
  );
  await confirmMutation(
    page,
    page.getByRole("button", { name: "Complete task" }),
    /Completion persisted and audit reference confirmed/
  );

  await page.reload();
  await expect(
    page.getByRole("heading", { level: 2, name: "Synthetic record synthetic-maya" })
  ).toBeVisible();
  await expect(page.getByText("Current status").locator("..")).toContainText("Completed");
  await expect(page.getByLabel("Note draft")).toHaveValue(noteText);
  await expect(page.getByText("Clinician save note", { exact: true })).toBeVisible();
  await expect(page.getByText("Clinician acknowledge", { exact: true })).toBeVisible();
  await expect(page.getByText("Clinician record contact", { exact: true })).toBeVisible();
  await expect(page.getByText("Clinician complete", { exact: true })).toBeVisible();

  const finalDetail = await getApi<ClinicianTaskDetail>(
    request,
    `/api/clinician/tasks/${setup.task.id}`,
    "clinician"
  );
  expect(finalDetail).toMatchObject({
    task: { status: "completed" },
    round: { state: "abstained_for_review" },
    measurement: null,
    captureQuality: { status: "retry" },
    note: { text: noteText, version: 1 }
  });
  const initialEventIds = setup.initialDetail.timeline.map(({ eventId }) => eventId);
  const finalEventIds = finalDetail.timeline.map(({ eventId }) => eventId);
  expect(finalEventIds).toEqual(expect.arrayContaining(initialEventIds));
  expect(new Set(finalEventIds).size).toBe(finalEventIds.length);
  expect(finalDetail.timeline.map(({ type }) => type)).toEqual(
    expect.arrayContaining([
      "programme_task_created",
      "programme_task_duplicate_suppressed",
      "clinician_save_note",
      "clinician_acknowledge",
      "clinician_record_contact",
      "clinician_complete"
    ])
  );
  expect(JSON.stringify(finalDetail)).not.toMatch(
    /rawFrames|rawAudio|transcript|apiKey|authorizationHeader|Bearer|DATABASE_URL/i
  );

  await page.goto("/round?scenario=maya-poor-quality");
  await expect(page.getByRole("heading", { level: 1, name: "Review finished" })).toBeVisible();
  await expect(page.getByText("Completed in HomeRounds")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Review finished" })).toBeVisible();
  await expect(page.getByText("Completed in HomeRounds")).toBeVisible();

  expect(failures.consoleErrors).toEqual([]);
  expect(failures.pageErrors).toEqual([]);
});

test("rejects a stale cockpit write, restores the persisted task, and succeeds after reload", async ({
  page,
  request
}, testInfo) => {
  const failures = monitorPage(page);
  const setup = await createQualityReviewTask(request, testRunKey(testInfo, "stale"));
  await page.goto(`/clinician?roundId=${setup.round.id}`);
  await expect(
    page.getByRole("heading", { level: 2, name: "Synthetic record synthetic-maya" })
  ).toBeVisible();

  const external = await mutateTask(request, setup.task.id, {
    kind: "record_contact",
    expectedTaskUpdatedAt: setup.task.updatedAt,
    operationKey: `clinician:${setup.task.id}:external-contact:${testRunKey(testInfo, "external")}`,
    note: null
  });
  expect(external.task.updatedAt).not.toBe(setup.task.updatedAt);

  const staleResponse = await request.post(`/api/clinician/tasks/${setup.task.id}`, {
    data: {
      kind: "acknowledge",
      expectedTaskUpdatedAt: setup.task.updatedAt,
      operationKey: `clinician:${setup.task.id}:stale-ack:${testRunKey(testInfo, "stale-write")}`,
      note: null
    },
    headers: {
      accept: "application/json",
      origin: "http://127.0.0.1:3102",
      "x-homerounds-demo-role": "clinician"
    }
  });
  const staleBody = (await staleResponse.json()) as { error: { code: string } };
  expect(staleResponse.status()).toBe(409);
  expect(staleBody.error.code).toBe("stale_state");

  await page.getByRole("button", { name: "Reload clinician priority queue" }).click();
  await expect(
    page.getByRole("heading", { level: 2, name: "Synthetic record synthetic-maya" })
  ).toBeVisible();
  await confirmMutation(
    page,
    page.getByRole("button", { name: "Acknowledge" }),
    /Acknowledgement persisted and audit reference confirmed/
  );
  expect(failures.consoleErrors).toEqual([]);
  expect(failures.pageErrors).toEqual([]);
});

test("shows invalid and missing scoped data without inventing queue work", async ({
  page,
  request
}, testInfo) => {
  const failures = monitorPage(page);
  const missingRoundId = deterministicUuid("missing-round", testRunKey(testInfo, "missing"));
  const missingTaskId = deterministicUuid("missing-task", testRunKey(testInfo, "missing"));
  const params = new URLSearchParams();
  params.append("roundId", "not-a-uuid");
  params.append("roundId", missingRoundId);
  await page.goto(`/clinician?${params.toString()}`);
  await expect(page.getByRole("heading", { level: 1, name: "Clinician cockpit" })).toBeVisible();
  await expect(
    page.getByRole("alert").filter({ hasText: "1 invalid round reference was ignored" })
  ).toBeVisible();
  await expect(page.getByText("No queued tasks")).toBeVisible();
  await expect(page.getByText(/No work is inferred/)).toBeVisible();

  const missingResponse = await request.get(`/api/clinician/tasks/${missingTaskId}`, {
    headers: { accept: "application/json", "x-homerounds-demo-role": "clinician" }
  });
  const missingBody = (await missingResponse.json()) as {
    error: { code: string; correlationId: string };
  };
  expect(missingResponse.status()).toBe(404);
  expect(missingBody.error).toMatchObject({ code: "not_found" });
  expect(missingBody.error.correlationId).not.toHaveLength(0);

  expect(failures.consoleErrors).toEqual([]);
  expect(failures.pageErrors).toEqual([]);
});
