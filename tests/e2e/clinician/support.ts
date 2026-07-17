import { createHash } from "node:crypto";

import { expect, type APIRequestContext, type APIResponse, type TestInfo } from "@playwright/test";

export const LANE_ORIGIN = "http://127.0.0.1:3102";
export const FIXED_NOW = "2026-07-17T12:00:00.000Z";

export type Round = {
  id: string;
  state: string;
  stateVersion: number;
};

export type ClinicalTask = {
  id: string;
  roundId: string;
  patientId: string;
  status: "open" | "acknowledged" | "completed";
  updatedAt: string;
  idempotencyKey: string;
};

export type AuditEvent = {
  eventId: string;
  type: string;
  occurredAt: string;
  correlationId: string;
};

export type ProtocolResult = Record<string, unknown> & {
  outcome: string;
  missingFactKeys: string[];
};

export type ClinicianTaskDetail = {
  task: ClinicalTask;
  round: Round;
  report: Record<string, unknown> | null;
  measurement: Record<string, unknown> | null;
  captureQuality: {
    status: string;
    score: number;
    reasons: string[];
    metrics: Record<string, number>;
  } | null;
  protocolResult: ProtocolResult | null;
  timeline: AuditEvent[];
  note: {
    text: string;
    version: number;
    auditReference: string;
  } | null;
};

export type MutationBody = {
  kind: "save_note" | "acknowledge" | "record_contact" | "complete";
  expectedTaskUpdatedAt: string;
  operationKey: string;
  note: string | null;
};

export type MutationReceipt = {
  status: "persisted";
  kind: MutationBody["kind"];
  task: ClinicalTask;
  event: AuditEvent;
  operationKey: string;
  duplicateSuppressed: boolean;
  note: ClinicianTaskDetail["note"];
};

type AssessmentSession = {
  round: Round;
  assessmentSessionId: string;
  provider: "finger_ppg" | "vitallens";
  attestation: string;
};

type CaptureResult = {
  next: "retry" | "abstained_for_review";
  round: Round;
  protocolResult: ProtocolResult | null;
};

type ActionResult = {
  kind: "programme_task";
  created: boolean;
  task: ClinicalTask;
};

type JsonRecord = Record<string, unknown>;

function record(value: unknown, label: string): JsonRecord {
  expect(value, label).not.toBeNull();
  expect(typeof value, label).toBe("object");
  expect(Array.isArray(value), label).toBe(false);
  return value as JsonRecord;
}

async function responseJson(response: APIResponse): Promise<JsonRecord> {
  const text = await response.text();
  expect(response.status(), text).toBe(200);
  return record(JSON.parse(text) as unknown, "API response envelope");
}

function dataFrom<T>(envelope: JsonRecord): T {
  expect(envelope).toHaveProperty("data");
  return envelope.data as T;
}

function headers(role: "patient" | "clinician"): Record<string, string> {
  return {
    accept: "application/json",
    origin: LANE_ORIGIN,
    "x-homerounds-demo-role": role
  };
}

export async function postApi<T>(
  request: APIRequestContext,
  path: string,
  role: "patient" | "clinician",
  data: unknown
): Promise<T> {
  const response = await request.post(path, { data, headers: headers(role) });
  return dataFrom<T>(await responseJson(response));
}

export async function getApi<T>(
  request: APIRequestContext,
  path: string,
  role: "patient" | "clinician"
): Promise<T> {
  const response = await request.get(path, { headers: headers(role) });
  return dataFrom<T>(await responseJson(response));
}

export function deterministicUuid(...parts: string[]): string {
  const bytes = createHash("sha256").update(parts.join("\u001f")).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function testRunKey(testInfo: TestInfo, suffix: string): string {
  return createHash("sha256")
    .update(
      [
        testInfo.project.name,
        ...testInfo.titlePath,
        testInfo.retry,
        testInfo.repeatEachIndex,
        suffix
      ]
        .map(String)
        .join("\u001f")
    )
    .digest("hex")
    .slice(0, 16);
}

export type QualityReviewSetup = {
  round: Round;
  task: ClinicalTask;
  protocolResult: ProtocolResult;
  firstAction: ActionResult;
  duplicateAction: ActionResult;
  initialDetail: ClinicianTaskDetail;
};

export async function createQualityReviewTask(
  request: APIRequestContext,
  runKey: string,
  options: { triggerId?: string; purpose?: string } = {}
): Promise<QualityReviewSetup> {
  const created = await postApi<{ round: Round; created: boolean }>(
    request,
    "/api/rounds",
    "patient",
    {
      patientId: "synthetic-maya",
      triggerId: options.triggerId ?? `homerounds-e2e:v1:clinician-${runKey}`,
      purpose: options.purpose ?? "Synthetic clinician black-box evidence round",
      protocolId: "cardiometabolic_demo",
      burdenSeconds: 90
    }
  );
  expect(created.created).toBe(true);

  const screened = await postApi<{ round: Round }>(
    request,
    `/api/rounds/${created.round.id}/transition`,
    "patient",
    { to: "red_flag_screen", expectedStateVersion: created.round.stateVersion }
  );
  const collecting = await postApi<{ round: Round }>(
    request,
    `/api/rounds/${created.round.id}/transition`,
    "patient",
    { to: "collecting_report", expectedStateVersion: screened.round.stateVersion }
  );
  const report = await postApi<{ round: Round }>(
    request,
    `/api/rounds/${created.round.id}/report`,
    "patient",
    {
      report: {
        reportId: deterministicUuid("clinician-e2e-report", runKey),
        roundId: created.round.id,
        weakness: "moderate",
        palpitations: "unknown",
        redFlags: { chestPain: "no", severeBreathlessness: "no", fainted: "no" },
        inputMode: "text",
        confirmedAt: FIXED_NOW
      },
      expectedStateVersion: collecting.round.stateVersion
    }
  );
  const firstSession = await postApi<AssessmentSession>(
    request,
    `/api/rounds/${created.round.id}/assessments/session`,
    "patient",
    { expectedStateVersion: report.round.stateVersion }
  );
  const retry = await postApi<CaptureResult>(
    request,
    `/api/rounds/${created.round.id}/assessments/quality`,
    "patient",
    {
      expectedStateVersion: firstSession.round.stateVersion,
      assessmentSessionId: firstSession.assessmentSessionId,
      provider: firstSession.provider,
      attestation: firstSession.attestation,
      quality: {
        status: "retry",
        score: 0.3,
        reasons: ["weak_signal", "motion"],
        metrics: { signalCoverage: 0.4 }
      }
    }
  );
  expect(retry).toMatchObject({ next: "retry", round: { state: "capture_retry" } });

  const secondSession = await postApi<AssessmentSession>(
    request,
    `/api/rounds/${created.round.id}/assessments/session`,
    "patient",
    { expectedStateVersion: retry.round.stateVersion }
  );
  const failed = await postApi<CaptureResult>(
    request,
    `/api/rounds/${created.round.id}/assessments/quality`,
    "patient",
    {
      expectedStateVersion: secondSession.round.stateVersion,
      assessmentSessionId: secondSession.assessmentSessionId,
      provider: secondSession.provider,
      attestation: secondSession.attestation,
      quality: {
        status: "retry",
        score: 0.1,
        reasons: ["weak_signal"],
        metrics: { signalCoverage: 0.2 }
      }
    }
  );
  expect(failed).toMatchObject({
    next: "abstained_for_review",
    round: { state: "abstained_for_review" },
    protocolResult: { outcome: "abstain_for_review", missingFactKeys: ["pulse_bpm"] }
  });
  expect(failed.protocolResult).not.toBeNull();
  const protocolResult = failed.protocolResult as ProtocolResult;
  const actionBody = {
    expectedStateVersion: failed.round.stateVersion,
    protocolResult,
    confirmation: { confirmed: true, confirmedAt: FIXED_NOW }
  };
  const firstAction = await postApi<ActionResult>(
    request,
    `/api/rounds/${created.round.id}/actions`,
    "patient",
    actionBody
  );
  const duplicateAction = await postApi<ActionResult>(
    request,
    `/api/rounds/${created.round.id}/actions`,
    "patient",
    actionBody
  );
  expect(firstAction).toMatchObject({ kind: "programme_task", created: true });
  expect(duplicateAction).toMatchObject({
    kind: "programme_task",
    created: false,
    task: { id: firstAction.task.id }
  });

  const initialDetail = await getApi<ClinicianTaskDetail>(
    request,
    `/api/clinician/tasks/${firstAction.task.id}`,
    "clinician"
  );
  expect(initialDetail.measurement).toBeNull();
  expect(initialDetail.captureQuality).toMatchObject({
    status: "retry",
    reasons: ["weak_signal"]
  });

  return {
    round: failed.round,
    task: firstAction.task,
    protocolResult,
    firstAction,
    duplicateAction,
    initialDetail
  };
}

export async function mutateTask(
  request: APIRequestContext,
  taskId: string,
  body: MutationBody
): Promise<MutationReceipt> {
  return postApi<MutationReceipt>(request, `/api/clinician/tasks/${taskId}`, "clinician", body);
}

export async function queueForRound(
  request: APIRequestContext,
  roundId: string
): Promise<{ tasks: ClinicalTask[]; scope: string }> {
  return getApi(
    request,
    `/api/clinician/queue?roundId=${encodeURIComponent(roundId)}`,
    "clinician"
  );
}
