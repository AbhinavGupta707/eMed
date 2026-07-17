import {
  ApiErrorEnvelopeSchema,
  ApiSuccessEnvelopeSchema,
  AssessmentSessionDataSchema,
  ClinicianMutationReceiptSchema,
  CreateRoundDataSchema,
  ExecuteActionDataSchema,
  RoundDataSchema,
  SubmitCaptureQualityDataSchema,
  SubmitReportDataSchema
} from "../../packages/api-client/src/index";
import type { ZodType } from "../../packages/contracts/node_modules/zod";
import { describe, expect, it } from "vitest";

import { parseServerEnvironment } from "../../apps/web/src/env";
import {
  handleClinicianTaskMutation,
  handleCreateRound,
  handleExecuteAction,
  handleGetRound,
  handleStartAssessment,
  handleSubmitCaptureQuality,
  handleSubmitReport,
  handleTransitionRound
} from "../../apps/web/src/server/route-handlers";
import { createServerRuntime, type ServerRuntime } from "../../apps/web/src/server/runtime";

const NOW = "2026-07-17T12:00:00.000Z";
const TRANSCRIPT_CANARY = "TRANSCRIPT_PERSISTENCE_CANARY";
const ATTESTATION_SECRET_CANARY = "assessment-attestation-secret-value";

function monotonicClock(): () => string {
  let tick = Date.parse(NOW);
  return () => new Date(tick++).toISOString();
}

function idFactory(): () => string {
  let value = 1;
  return () => `60000000-0000-4000-8000-${String(value++).padStart(12, "0")}`;
}

function request(
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

async function success<T>(response: Response, schema: ZodType<T>): Promise<T> {
  expect(response.status, await response.clone().text()).toBe(200);
  return ApiSuccessEnvelopeSchema(schema).parse(await response.json()).data;
}

async function startPoorQualityRound(runtime: ServerRuntime) {
  const created = await success(
    await handleCreateRound(
      request(
        "/api/rounds",
        {
          patientId: "synthetic-maya",
          triggerId: "homerounds-test:quality-action-resume",
          purpose: "Synthetic quality, action, and resume evidence",
          protocolId: "cardiometabolic_demo",
          burdenSeconds: 90
        },
        "quality-create"
      ),
      runtime
    ),
    CreateRoundDataSchema
  );
  const roundId = created.round.id;
  const screened = await success(
    await handleTransitionRound(
      request(
        `/api/rounds/${roundId}/transition`,
        { to: "red_flag_screen", expectedStateVersion: created.round.stateVersion },
        "quality-screen"
      ),
      runtime,
      roundId
    ),
    RoundDataSchema
  );
  const collecting = await success(
    await handleTransitionRound(
      request(
        `/api/rounds/${roundId}/transition`,
        { to: "collecting_report", expectedStateVersion: screened.round.stateVersion },
        "quality-collect"
      ),
      runtime,
      roundId
    ),
    RoundDataSchema
  );
  const reported = await success(
    await handleSubmitReport(
      request(
        `/api/rounds/${roundId}/report`,
        {
          report: {
            reportId: "60000000-0000-4000-8000-000000000090",
            roundId,
            weakness: "moderate",
            palpitations: "unknown",
            redFlags: { chestPain: "no", severeBreathlessness: "no", fainted: "no" },
            note: TRANSCRIPT_CANARY,
            inputMode: "voice_confirmed",
            confirmedAt: NOW
          },
          expectedStateVersion: collecting.round.stateVersion
        },
        "quality-report"
      ),
      runtime,
      roundId
    ),
    SubmitReportDataSchema
  );
  const session = await success(
    await handleStartAssessment(
      request(
        `/api/rounds/${roundId}/assessments/session`,
        { expectedStateVersion: reported.round.stateVersion },
        "quality-session-1"
      ),
      runtime,
      roundId
    ),
    AssessmentSessionDataSchema
  );
  return { roundId, session };
}

describe("quality failure to resumed task integration", () => {
  it("enforces one quality retry, no measurement, idempotent action, optimistic completion, and resume projection", async () => {
    const runtime = createServerRuntime({
      environment: parseServerEnvironment({}),
      now: monotonicClock(),
      createId: idFactory(),
      assessmentAttestationSecret: ATTESTATION_SECRET_CANARY
    });
    const { roundId, session: firstSession } = await startPoorQualityRound(runtime);

    const retry = await success(
      await handleSubmitCaptureQuality(
        request(
          `/api/rounds/${roundId}/assessments/quality`,
          {
            expectedStateVersion: firstSession.round.stateVersion,
            assessmentSessionId: firstSession.assessmentSessionId,
            provider: firstSession.provider,
            attestation: firstSession.attestation,
            quality: {
              status: "retry",
              score: 0.3,
              reasons: ["weak_signal", "motion"],
              metrics: { coverage: 0.4 }
            }
          },
          "quality-retry"
        ),
        runtime,
        roundId
      ),
      SubmitCaptureQualityDataSchema
    );
    expect(retry).toMatchObject({ next: "retry", round: { state: "capture_retry" } });

    const secondSession = await success(
      await handleStartAssessment(
        request(
          `/api/rounds/${roundId}/assessments/session`,
          { expectedStateVersion: retry.round.stateVersion },
          "quality-session-2"
        ),
        runtime,
        roundId
      ),
      AssessmentSessionDataSchema
    );
    const terminal = await success(
      await handleSubmitCaptureQuality(
        request(
          `/api/rounds/${roundId}/assessments/quality`,
          {
            expectedStateVersion: secondSession.round.stateVersion,
            assessmentSessionId: secondSession.assessmentSessionId,
            provider: secondSession.provider,
            attestation: secondSession.attestation,
            quality: {
              status: "retry",
              score: 0.1,
              reasons: ["weak_signal"],
              metrics: { coverage: 0.2 }
            }
          },
          "quality-terminal"
        ),
        runtime,
        roundId
      ),
      SubmitCaptureQualityDataSchema
    );
    expect(terminal).toMatchObject({
      next: "abstained_for_review",
      round: { state: "abstained_for_review" },
      protocolResult: {
        outcome: "abstain_for_review",
        missingFactKeys: ["pulse_bpm"]
      }
    });
    expect(await runtime.repository.listMeasurementFacts(roundId)).toHaveLength(0);

    const thirdSession = await handleStartAssessment(
      request(
        `/api/rounds/${roundId}/assessments/session`,
        { expectedStateVersion: terminal.round.stateVersion },
        "quality-session-3-rejected"
      ),
      runtime,
      roundId
    );
    expect(thirdSession.status).toBe(409);
    expect(ApiErrorEnvelopeSchema.parse(await thirdSession.json()).error.code).toBe("conflict");

    const qualityEvents = (await runtime.repository.listAuditEvents(roundId)).filter(
      ({ type }) => type === "capture_quality_rejected"
    );
    expect(qualityEvents).toHaveLength(2);
    for (const event of qualityEvents) {
      expect(event.payload).toMatchObject({ rawMediaStored: false });
      expect(event.payload).not.toHaveProperty("rawMediaRef");
      expect(event.payload).not.toHaveProperty("frames");
    }
    const preActionAudit = JSON.stringify(await runtime.repository.listAuditEvents(roundId));
    expect(preActionAudit).not.toContain(TRANSCRIPT_CANARY);
    expect(preActionAudit).not.toContain(ATTESTATION_SECRET_CANARY);

    if (terminal.next !== "abstained_for_review") {
      throw new Error("Expected a terminal abstention result.");
    }
    const actionBody = {
      expectedStateVersion: terminal.round.stateVersion,
      protocolResult: terminal.protocolResult,
      confirmation: { confirmed: true, confirmedAt: NOW }
    };
    const actionResponses = await Promise.all(
      ["action-concurrent-a", "action-concurrent-b"].map((correlationId) =>
        handleExecuteAction(
          request(`/api/rounds/${roundId}/actions`, actionBody, correlationId),
          runtime,
          roundId
        )
      )
    );
    const actions = await Promise.all(
      actionResponses.map((response) => success(response, ExecuteActionDataSchema))
    );
    expect(
      actions.map((action) => (action.kind === "programme_task" ? action.created : null)).toSorted()
    ).toEqual([false, true]);
    const taskActions = actions.filter((action) => action.kind === "programme_task");
    expect(taskActions).toHaveLength(2);
    const task = taskActions[0]?.task;
    if (!task) throw new Error("Expected the idempotent programme task.");
    expect(new Set(taskActions.map((action) => action.task.id))).toEqual(new Set([task.id]));
    expect(await runtime.repository.listTasksForRound(roundId)).toHaveLength(1);
    expect(await runtime.repository.listActionAttempts(task.idempotencyKey)).toHaveLength(2);

    const completionResponses = await Promise.all(
      ["optimistic-complete-a", "optimistic-complete-b"].map((suffix) =>
        handleClinicianTaskMutation(
          request(
            `/api/clinician/tasks/${task.id}`,
            {
              kind: "complete",
              expectedTaskUpdatedAt: task.updatedAt,
              operationKey: `clinician:${task.id}:${suffix}`,
              note: null
            },
            `clinician-${suffix}`,
            "clinician"
          ),
          runtime,
          task.id
        )
      )
    );
    expect(completionResponses.map(({ status }) => status).toSorted()).toEqual([200, 409]);
    const successfulCompletion = completionResponses.find(({ status }) => status === 200);
    const staleCompletion = completionResponses.find(({ status }) => status === 409);
    if (!successfulCompletion || !staleCompletion) {
      throw new Error("Expected one successful and one stale clinician completion.");
    }
    expect(
      ApiSuccessEnvelopeSchema(ClinicianMutationReceiptSchema).parse(
        await successfulCompletion.json()
      ).data.task.status
    ).toBe("completed");
    expect(ApiErrorEnvelopeSchema.parse(await staleCompletion.json()).error.code).toBe(
      "stale_state"
    );

    const resumed = await success(
      await handleGetRound(
        new Request(`http://localhost:3000/api/rounds/${roundId}`),
        runtime,
        roundId
      ),
      RoundDataSchema
    );
    expect(resumed).toMatchObject({
      round: { state: "abstained_for_review" },
      task: { id: task.id, status: "completed" }
    });
  });
});
