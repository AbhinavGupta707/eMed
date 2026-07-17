import {
  ApiSuccessEnvelopeSchema,
  AssessmentSessionDataSchema,
  CreateRoundDataSchema,
  ElevenLabsCredentialDataSchema,
  ExecuteActionDataSchema,
  QueueDataSchema,
  RoundDataSchema,
  SubmitAssessmentDataSchema,
  SubmitReportDataSchema
} from "@homerounds/api-client";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { parseServerEnvironment } from "../env";
import {
  handleCreateRound,
  handleElevenLabsCredential,
  handleExecuteAction,
  handleQueue,
  handleStartAssessment,
  handleSubmitAssessment,
  handleSubmitReport,
  handleTransitionRound
} from "./route-handlers";
import { createServerRuntime } from "./runtime";

const NOW = "2026-07-17T12:00:00.000Z";

function idFactory(): () => string {
  let value = 1;
  return () => `10000000-0000-4000-8000-${String(value++).padStart(12, "0")}`;
}

function apiRequest(
  path: string,
  body: unknown,
  correlationId: string,
  role: "patient" | "clinician" = "patient"
): Request {
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      "x-correlation-id": correlationId,
      "x-homerounds-demo-role": role
    },
    body: JSON.stringify(body)
  });
}

async function success<T>(response: Response, dataSchema: z.ZodType<T>): Promise<T> {
  expect(response.status, await response.clone().text()).toBe(200);
  return ApiSuccessEnvelopeSchema(dataSchema).parse(await response.json()).data;
}

describe("repository-backed server API orchestration", () => {
  it("runs a deterministic synthetic round through one idempotent audited task", async () => {
    const runtime = createServerRuntime({
      environment: parseServerEnvironment({}),
      now: () => NOW,
      createId: idFactory(),
      assessmentAttestationSecret: "assessment-attestation-secret-value"
    });

    const created = await success(
      await handleCreateRound(
        apiRequest(
          "/api/rounds",
          {
            patientId: "synthetic-maya",
            triggerId: "trigger-api-1",
            purpose: "Synthetic programme check-in",
            protocolId: "cardiometabolic_demo",
            burdenSeconds: 90
          },
          "correlation-create"
        ),
        runtime
      ),
      CreateRoundDataSchema
    );
    expect(created.created).toBe(true);
    const roundId = created.round.id;

    const redFlagScreen = await success(
      await handleTransitionRound(
        apiRequest(
          `/api/rounds/${roundId}/transition`,
          { to: "red_flag_screen", expectedStateVersion: 0 },
          "correlation-transition-1"
        ),
        runtime,
        roundId
      ),
      RoundDataSchema
    );
    const collecting = await success(
      await handleTransitionRound(
        apiRequest(
          `/api/rounds/${roundId}/transition`,
          { to: "collecting_report", expectedStateVersion: redFlagScreen.round.stateVersion },
          "correlation-transition-2"
        ),
        runtime,
        roundId
      ),
      RoundDataSchema
    );

    const reportId = "1d8163f3-22f5-4f99-850b-827ce2a05277";
    const report = await success(
      await handleSubmitReport(
        apiRequest(
          `/api/rounds/${roundId}/report`,
          {
            report: {
              reportId,
              roundId,
              weakness: "absent",
              palpitations: "absent",
              redFlags: { chestPain: "no", severeBreathlessness: "no", fainted: "no" },
              inputMode: "text",
              confirmedAt: NOW
            },
            expectedStateVersion: collecting.round.stateVersion
          },
          "correlation-report"
        ),
        runtime,
        roundId
      ),
      SubmitReportDataSchema
    );
    expect(report).toMatchObject({ next: "assessment_selected", protocolResult: null });

    const assessment = await success(
      await handleStartAssessment(
        apiRequest(
          `/api/rounds/${roundId}/assessments/session`,
          { expectedStateVersion: report.round.stateVersion },
          "correlation-assessment-start"
        ),
        runtime,
        roundId
      ),
      AssessmentSessionDataSchema
    );
    const measurement = {
      factId: "cf542d34-59f4-4ea7-abd4-fe93c94e13a8",
      assessmentSessionId: assessment.assessmentSessionId,
      provider: assessment.provider,
      value: 72,
      unit: "bpm" as const,
      observedAt: NOW,
      durationMs: 30_000,
      algorithmVersion: "finger_ppg_local_v1",
      providerModelVersion: null,
      quality: { status: "pass" as const, score: 0.94, reasons: [], metrics: {} },
      rawMediaRef: null
    };
    const assessed = await success(
      await handleSubmitAssessment(
        apiRequest(
          `/api/rounds/${roundId}/assessments`,
          {
            expectedStateVersion: assessment.round.stateVersion,
            measurement,
            attestation: assessment.attestation
          },
          "correlation-assessment-submit"
        ),
        runtime,
        roundId
      ),
      SubmitAssessmentDataSchema
    );
    expect(assessed.round.state).toBe("action_pending");
    expect(assessed.decision).toMatchObject({
      kind: "result",
      result: {
        outcome: "programme_review_requested",
        allowedActions: ["create_programme_task"]
      }
    });
    if (assessed.decision.kind !== "result") return;

    const replayedAssessment = await success(
      await handleSubmitAssessment(
        apiRequest(
          `/api/rounds/${roundId}/assessments`,
          {
            expectedStateVersion: assessment.round.stateVersion,
            measurement,
            attestation: assessment.attestation
          },
          "correlation-assessment-replay"
        ),
        runtime,
        roundId
      ),
      SubmitAssessmentDataSchema
    );
    expect(replayedAssessment.round).toEqual(assessed.round);
    expect(await runtime.repository.listMeasurementFacts(roundId)).toHaveLength(1);
    expect(
      (await runtime.repository.listAuditEvents(roundId)).filter(
        ({ type }) => type === "measurement_accepted"
      )
    ).toHaveLength(1);

    const actionBody = {
      expectedStateVersion: assessed.round.stateVersion,
      protocolResult: assessed.decision.result,
      confirmation: { confirmed: true, confirmedAt: NOW }
    };
    const firstAction = await success(
      await handleExecuteAction(
        apiRequest(`/api/rounds/${roundId}/actions`, actionBody, "correlation-action-1"),
        runtime,
        roundId
      ),
      ExecuteActionDataSchema
    );
    expect(firstAction).toMatchObject({
      kind: "programme_task",
      created: true,
      message: { demoOnly: true, diagnosticClaim: false }
    });
    if (firstAction.kind !== "programme_task") return;
    expect(firstAction.task.serviceWindowLabel).toMatch(/Demo-only/i);

    const duplicate = await success(
      await handleExecuteAction(
        apiRequest(`/api/rounds/${roundId}/actions`, actionBody, "correlation-action-2"),
        runtime,
        roundId
      ),
      ExecuteActionDataSchema
    );
    expect(duplicate).toMatchObject({ kind: "programme_task", created: false });

    const queueRequest = new Request(
      `http://localhost:3000/api/clinician/queue?roundId=${roundId}`,
      { headers: { "x-homerounds-demo-role": "clinician" } }
    );
    const queue = await success(await handleQueue(queueRequest, runtime), QueueDataSchema);
    expect(queue.tasks).toHaveLength(1);
    expect(queue.tasks[0]?.id).toBe(firstAction.task.id);
    expect(queue.scope).toBe("requested_rounds");

    const attempts = await runtime.repository.listActionAttempts(firstAction.task.idempotencyKey);
    expect(attempts.map(({ outcome }) => outcome)).toEqual(["created", "duplicate"]);
    const events = await runtime.repository.listAuditEvents(roundId);
    expect(events.map(({ type }) => type)).toEqual(
      expect.arrayContaining([
        "round_created",
        "patient_report_confirmed",
        "measurement_accepted",
        "programme_task_created",
        "programme_task_duplicate_suppressed"
      ])
    );
    expect(JSON.stringify(events)).not.toMatch(
      /transcript|rawFrames|apiKey|authorizationHeader|Bearer/i
    );
    expect((await runtime.orchestration.getRound(roundId)).state).toBe("awaiting_clinician");
  });

  it("returns typed no-key voice unavailability through the authenticated route", async () => {
    const runtime = createServerRuntime({
      environment: parseServerEnvironment({}),
      now: () => NOW,
      assessmentAttestationSecret: "assessment-attestation-secret-value"
    });
    const response = await handleElevenLabsCredential(
      apiRequest("/api/providers/elevenlabs/session", {}, "correlation-elevenlabs"),
      runtime
    );
    const result = await success(response, ElevenLabsCredentialDataSchema);
    expect(result).toEqual({ status: "unavailable", reason: "disabled" });
    expect(response.headers.get("x-homerounds-runtime-profile")).toBe("server_provider_boundary");
  });

  it("routes a confirmed synthetic red flag through deterministic guidance without measurement", async () => {
    const runtime = createServerRuntime({
      environment: parseServerEnvironment({}),
      now: () => NOW,
      createId: idFactory(),
      assessmentAttestationSecret: "assessment-attestation-secret-value"
    });
    const created = await success(
      await handleCreateRound(
        apiRequest(
          "/api/rounds",
          {
            patientId: "synthetic-maya",
            triggerId: "trigger-red-flag",
            purpose: "Synthetic red-flag gate",
            protocolId: "cardiometabolic_demo",
            burdenSeconds: 90
          },
          "correlation-red-create"
        ),
        runtime
      ),
      CreateRoundDataSchema
    );
    const roundId = created.round.id;
    const screen = await success(
      await handleTransitionRound(
        apiRequest(
          `/api/rounds/${roundId}/transition`,
          { to: "red_flag_screen", expectedStateVersion: 0 },
          "correlation-red-screen"
        ),
        runtime,
        roundId
      ),
      RoundDataSchema
    );
    const collecting = await success(
      await handleTransitionRound(
        apiRequest(
          `/api/rounds/${roundId}/transition`,
          { to: "collecting_report", expectedStateVersion: screen.round.stateVersion },
          "correlation-red-collect"
        ),
        runtime,
        roundId
      ),
      RoundDataSchema
    );
    const report = await success(
      await handleSubmitReport(
        apiRequest(
          `/api/rounds/${roundId}/report`,
          {
            report: {
              reportId: "6df1c796-6cf7-4edf-a98c-26e768615ef8",
              roundId,
              weakness: "unknown",
              palpitations: "unknown",
              redFlags: { chestPain: "yes", severeBreathlessness: "no", fainted: "no" },
              inputMode: "text",
              confirmedAt: NOW
            },
            expectedStateVersion: collecting.round.stateVersion
          },
          "correlation-red-report"
        ),
        runtime,
        roundId
      ),
      SubmitReportDataSchema
    );
    expect(report).toMatchObject({
      next: "emergency_closed",
      round: { state: "emergency_closed" },
      protocolResult: {
        outcome: "emergency_guidance",
        allowedActions: ["show_emergency_guidance"]
      }
    });
    expect(await runtime.repository.listMeasurementFacts(roundId)).toHaveLength(0);
    if (!report.protocolResult) return;
    const action = await success(
      await handleExecuteAction(
        apiRequest(
          `/api/rounds/${roundId}/actions`,
          {
            expectedStateVersion: report.round.stateVersion,
            protocolResult: report.protocolResult,
            confirmation: { confirmed: true, confirmedAt: NOW }
          },
          "correlation-red-guidance"
        ),
        runtime,
        roundId
      ),
      ExecuteActionDataSchema
    );
    expect(action).toMatchObject({
      kind: "emergency_guidance",
      message: { demoOnly: true, diagnosticClaim: false }
    });
    expect(await runtime.repository.listTasksForRound(roundId)).toHaveLength(0);
    expect((await runtime.repository.listAuditEvents(roundId)).map(({ type }) => type)).toContain(
      "emergency_guidance_presented"
    );
  });
});
