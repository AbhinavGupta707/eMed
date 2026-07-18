import {
  ApiSuccessEnvelopeSchema,
  AssessmentSessionDataSchema,
  ConfirmMedicationObservationDataSchema,
  ClinicianMutationReceiptSchema,
  ClinicianTaskDetailDataSchema,
  CreateRoundDataSchema,
  ElevenLabsCredentialDataSchema,
  ExecuteActionDataSchema,
  QueueDataSchema,
  RoundDataSchema,
  SubmitAssessmentDataSchema,
  SubmitCaptureQualityDataSchema,
  SubmitFollowUpDataSchema,
  SubmitMedicationLabelImageDataSchema,
  SubmitReportDataSchema
} from "@homerounds/api-client";
import { createConfirmedMedicationObservationFact } from "@homerounds/assessments";
import { AdaptiveSelectionEnvelopeSchema } from "@homerounds/contracts";
import type { AdaptiveSelectionProvider } from "@homerounds/inference";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { parseServerEnvironment } from "../env";
import {
  handleClinicianTaskDetail,
  handleClinicianTaskMutation,
  handleCreateRound,
  handleConfirmMedicationObservation,
  handleElevenLabsCredential,
  handleExecuteAction,
  handleGetRound,
  handleQueue,
  handleStartAssessment,
  handleSubmitAssessment,
  handleSubmitCaptureQuality,
  handleSubmitFollowUp,
  handleSubmitMedicationLabelImage,
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

function medicationSelectingProvider(): AdaptiveSelectionProvider {
  return {
    async select(input) {
      return {
        ok: true,
        envelope: AdaptiveSelectionEnvelopeSchema.parse({
          roundId: input.roundId,
          stateVersion: input.stateVersion,
          decision: {
            decision: "select",
            candidateModuleId: "medication.label.review",
            evidenceReferenceIds: ["patient.report"],
            rationale:
              "A synthetic medication-label review may resolve the confirmed uncertainty before the pulse check.",
            uncertainty: "medium",
            missingInformation: ["Visible synthetic label fields"]
          },
          provenance: {
            attemptId: "8e0c2e47-5d75-4e1f-a157-4016e728ac59",
            provider: "fake",
            task: "adaptive_module_selection",
            modelAlias: "fake-medication-route-v1",
            contractVersion: "adaptive-selection.v1",
            attemptedAt: NOW,
            durationMs: 1,
            tokenUsage: null
          }
        })
      };
    }
  };
}

async function createCollectingRound(
  runtime: ReturnType<typeof createServerRuntime>,
  triggerId: string
) {
  const created = await success(
    await handleCreateRound(
      apiRequest(
        "/api/rounds",
        {
          patientId: "synthetic-maya",
          triggerId,
          purpose: "Synthetic adaptive medication check",
          protocolId: "cardiometabolic_demo",
          burdenSeconds: 120
        },
        `${triggerId}-create`
      ),
      runtime
    ),
    CreateRoundDataSchema
  );
  const screen = await success(
    await handleTransitionRound(
      apiRequest(
        `/api/rounds/${created.round.id}/transition`,
        { to: "red_flag_screen", expectedStateVersion: created.round.stateVersion },
        `${triggerId}-screen`
      ),
      runtime,
      created.round.id
    ),
    RoundDataSchema
  );
  const collecting = await success(
    await handleTransitionRound(
      apiRequest(
        `/api/rounds/${created.round.id}/transition`,
        { to: "collecting_report", expectedStateVersion: screen.round.stateVersion },
        `${triggerId}-collecting`
      ),
      runtime,
      created.round.id
    ),
    RoundDataSchema
  );
  return { roundId: created.round.id, collecting: collecting.round };
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
    expect(report.evidenceRoute).toMatchObject({
      selection: { status: "fallback", reason: "disabled" },
      selectedModuleId: "capture.finger_ppg.pulse",
      medicationConfirmed: false,
      medicationSkipped: false
    });

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

    const resumable = await success(
      await handleGetRound(
        new Request(`http://localhost:3000/api/rounds/${roundId}`),
        runtime,
        roundId
      ),
      RoundDataSchema
    );
    expect(resumable.protocolResult).toEqual(assessed.decision.result);
    expect(firstAction).toMatchObject({
      kind: "programme_task",
      created: true,
      message: { demoOnly: true, diagnosticClaim: false }
    });
    if (firstAction.kind !== "programme_task") return;
    expect(firstAction.task.serviceWindowLabel).toMatch(/Illustrative review/i);

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

    const detailRequest = new Request(
      `http://localhost:3000/api/clinician/tasks/${firstAction.task.id}`,
      { headers: { "x-homerounds-demo-role": "clinician" } }
    );
    const initialDetail = await success(
      await handleClinicianTaskDetail(detailRequest, runtime, firstAction.task.id),
      ClinicianTaskDetailDataSchema
    );
    expect(initialDetail).toMatchObject({
      report: { weakness: "absent" },
      measurement: { value: 72, quality: { status: "pass" } },
      protocolResult: { outcome: "programme_review_requested" },
      note: null,
      capabilities: { note: true, acknowledge: true, contact: true, complete: true }
    });
    expect(initialDetail.timeline.length).toBeGreaterThan(0);

    const noteBody = {
      kind: "save_note",
      expectedTaskUpdatedAt: firstAction.task.updatedAt,
      operationKey: `clinician:${firstAction.task.id}:save-note:0001`,
      note: "Synthetic demo note: reviewed the structured evidence."
    };
    const note = await success(
      await handleClinicianTaskMutation(
        apiRequest(
          `/api/clinician/tasks/${firstAction.task.id}`,
          noteBody,
          "correlation-clinician-note",
          "clinician"
        ),
        runtime,
        firstAction.task.id
      ),
      ClinicianMutationReceiptSchema
    );
    expect(note).toMatchObject({
      status: "persisted",
      kind: "save_note",
      duplicateSuppressed: false,
      note: { text: noteBody.note, version: 1 }
    });
    const duplicateNote = await success(
      await handleClinicianTaskMutation(
        apiRequest(
          `/api/clinician/tasks/${firstAction.task.id}`,
          noteBody,
          "correlation-clinician-note-retry",
          "clinician"
        ),
        runtime,
        firstAction.task.id
      ),
      ClinicianMutationReceiptSchema
    );
    expect(duplicateNote.duplicateSuppressed).toBe(true);

    const acknowledged = await success(
      await handleClinicianTaskMutation(
        apiRequest(
          `/api/clinician/tasks/${firstAction.task.id}`,
          {
            kind: "acknowledge",
            expectedTaskUpdatedAt: note.task.updatedAt,
            operationKey: `clinician:${firstAction.task.id}:acknowledge:0001`,
            note: null
          },
          "correlation-clinician-ack",
          "clinician"
        ),
        runtime,
        firstAction.task.id
      ),
      ClinicianMutationReceiptSchema
    );
    expect(acknowledged.task.status).toBe("acknowledged");

    const contacted = await success(
      await handleClinicianTaskMutation(
        apiRequest(
          `/api/clinician/tasks/${firstAction.task.id}`,
          {
            kind: "record_contact",
            expectedTaskUpdatedAt: acknowledged.task.updatedAt,
            operationKey: `clinician:${firstAction.task.id}:contact:0001`,
            note: null
          },
          "correlation-clinician-contact",
          "clinician"
        ),
        runtime,
        firstAction.task.id
      ),
      ClinicianMutationReceiptSchema
    );
    expect(contacted.task.status).toBe("acknowledged");

    const completed = await success(
      await handleClinicianTaskMutation(
        apiRequest(
          `/api/clinician/tasks/${firstAction.task.id}`,
          {
            kind: "complete",
            expectedTaskUpdatedAt: contacted.task.updatedAt,
            operationKey: `clinician:${firstAction.task.id}:complete:0001`,
            note: null
          },
          "correlation-clinician-complete",
          "clinician"
        ),
        runtime,
        firstAction.task.id
      ),
      ClinicianMutationReceiptSchema
    );
    expect(completed.task.status).toBe("completed");
    expect((await runtime.orchestration.getRound(roundId)).state).toBe("outcome_ready");

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
    const finalDetail = await success(
      await handleClinicianTaskDetail(detailRequest, runtime, firstAction.task.id),
      ClinicianTaskDetailDataSchema
    );
    expect(finalDetail).toMatchObject({
      task: { status: "completed" },
      round: { state: "outcome_ready" },
      note: { version: 1, text: noteBody.note }
    });
    expect(finalDetail.timeline.map(({ type }) => type)).toEqual(
      expect.arrayContaining([
        "clinician_save_note",
        "clinician_acknowledge",
        "clinician_record_contact",
        "clinician_complete"
      ])
    );
  });

  it("runs an adaptive medication proposal through explicit review, durable confirmation, and idempotent resume", async () => {
    const runtime = createServerRuntime({
      environment: parseServerEnvironment({
        INFERENCE_PROVIDER: "fake",
        ADAPTIVE_SELECTION_ENABLED: "true",
        MEDICATION_LABEL_AI_ENABLED: "true"
      }),
      adaptiveSelectionProvider: medicationSelectingProvider(),
      now: () => NOW,
      createId: idFactory(),
      assessmentAttestationSecret: "assessment-attestation-secret-value"
    });
    const { roundId, collecting } = await createCollectingRound(
      runtime,
      "trigger-adaptive-medication-confirm"
    );
    const privateNarrative = "synthetic-private-narrative-never-persist";
    const report = await success(
      await handleSubmitReport(
        apiRequest(
          `/api/rounds/${roundId}/report`,
          {
            report: {
              reportId: "f1690ba4-d4f4-4da0-8fac-3c5fb3ab7bd4",
              roundId,
              weakness: "mild",
              palpitations: "unknown",
              redFlags: { chestPain: "no", severeBreathlessness: "no", fainted: "no" },
              note: privateNarrative,
              inputMode: "text",
              confirmedAt: NOW
            },
            expectedStateVersion: collecting.stateVersion
          },
          "adaptive-medication-report"
        ),
        runtime,
        roundId
      ),
      SubmitReportDataSchema
    );
    expect(report.evidenceRoute).toMatchObject({
      selection: {
        status: "accepted",
        envelope: { decision: { candidateModuleId: "medication.label.review" } }
      },
      selectedModuleId: "medication.label.review",
      medicationConfirmed: false,
      medicationSkipped: false
    });

    const blocked = await handleStartAssessment(
      apiRequest(
        `/api/rounds/${roundId}/assessments/session`,
        { expectedStateVersion: report.round.stateVersion },
        "adaptive-medication-blocked"
      ),
      runtime,
      roundId
    );
    expect(blocked.status).toBe(409);

    const imageBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02, 0x03, 0x04
    ]);
    const bytesBase64 = Buffer.from(imageBytes).toString("base64");
    const extraction = await success(
      await handleSubmitMedicationLabelImage(
        apiRequest(
          `/api/rounds/${roundId}/medication/label`,
          {
            expectedStateVersion: report.round.stateVersion,
            metadata: {
              requestId: "fd45b87c-3894-4e18-a978-e5779b982988",
              captureMode: "file_upload",
              mediaType: "image/png",
              byteLength: imageBytes.byteLength,
              width: 640,
              height: 640,
              consentVersion: "synthetic-demo-v1",
              consentGrantedAt: NOW,
              syntheticDataOnly: true,
              rawMediaRef: null
            },
            bytesBase64
          },
          "adaptive-medication-extract"
        ),
        runtime,
        roundId
      ),
      SubmitMedicationLabelImageDataSchema
    );
    expect(extraction.outcome.status).toBe("proposed");
    if (extraction.outcome.status !== "proposed") return;

    const reviewItems = extraction.outcome.proposal.observations.map((observation) =>
      observation.value === null
        ? { field: observation.field, disposition: "not_visible" as const, reviewedValue: null }
        : {
            field: observation.field,
            disposition: "accepted" as const,
            reviewedValue: observation.value
          }
    );
    const fact = createConfirmedMedicationObservationFact({
      source: "image_review",
      proposal: extraction.outcome.proposal,
      roundId,
      stateVersion: report.round.stateVersion,
      reviewItems,
      explicitlyConfirmed: true,
      createId: () => "536be42b-63a5-4ee1-9a89-ea087591b165",
      now: () => NOW
    });
    expect(fact).not.toBeNull();
    if (!fact) return;
    const confirmationBody = {
      expectedStateVersion: report.round.stateVersion,
      fact
    };
    const confirmed = await success(
      await handleConfirmMedicationObservation(
        apiRequest(
          `/api/rounds/${roundId}/medication/confirmation`,
          confirmationBody,
          "adaptive-medication-confirm"
        ),
        runtime,
        roundId
      ),
      ConfirmMedicationObservationDataSchema
    );
    expect(confirmed).toMatchObject({ persisted: true, duplicateSuppressed: false });
    const duplicate = await success(
      await handleConfirmMedicationObservation(
        apiRequest(
          `/api/rounds/${roundId}/medication/confirmation`,
          confirmationBody,
          "adaptive-medication-confirm-retry"
        ),
        runtime,
        roundId
      ),
      ConfirmMedicationObservationDataSchema
    );
    expect(duplicate.duplicateSuppressed).toBe(true);

    const resumed = await success(
      await handleGetRound(
        new Request(`http://localhost:3000/api/rounds/${roundId}`),
        runtime,
        roundId
      ),
      RoundDataSchema
    );
    expect(resumed.evidenceRoute).toMatchObject({
      selectedModuleId: "medication.label.review",
      medicationConfirmed: true,
      medicationSkipped: false
    });
    await success(
      await handleStartAssessment(
        apiRequest(
          `/api/rounds/${roundId}/assessments/session`,
          { expectedStateVersion: report.round.stateVersion },
          "adaptive-medication-assessment"
        ),
        runtime,
        roundId
      ),
      AssessmentSessionDataSchema
    );

    const events = await runtime.repository.listAuditEvents(roundId);
    expect(events.filter(({ type }) => type === "medication_label_proposed")).toHaveLength(1);
    expect(events.filter(({ type }) => type === "medication_observation_confirmed")).toHaveLength(
      1
    );
    const persisted = JSON.stringify(events);
    expect(persisted).not.toContain(bytesBase64);
    expect(persisted).not.toContain(privateNarrative);
    expect(persisted).not.toMatch(/data:image|chain.of.thought/i);
    expect(events.find(({ type }) => type === "medication_label_proposed")?.payload).toMatchObject({
      rawMediaStored: false,
      providerPayloadStored: false
    });
  });

  it("atomically records an optional medication-review skip before the quality-gated pulse path", async () => {
    const runtime = createServerRuntime({
      environment: parseServerEnvironment({
        INFERENCE_PROVIDER: "fake",
        ADAPTIVE_SELECTION_ENABLED: "true",
        MEDICATION_LABEL_AI_ENABLED: "true"
      }),
      adaptiveSelectionProvider: medicationSelectingProvider(),
      now: () => NOW,
      createId: idFactory(),
      assessmentAttestationSecret: "assessment-attestation-secret-value"
    });
    const { roundId, collecting } = await createCollectingRound(
      runtime,
      "trigger-adaptive-medication-skip"
    );
    const report = await success(
      await handleSubmitReport(
        apiRequest(
          `/api/rounds/${roundId}/report`,
          {
            report: {
              reportId: "671d9b87-e18e-4b4d-aeb2-3216e1cf1f1f",
              roundId,
              weakness: "mild",
              palpitations: "unknown",
              redFlags: { chestPain: "no", severeBreathlessness: "no", fainted: "no" },
              inputMode: "text",
              confirmedAt: NOW
            },
            expectedStateVersion: collecting.stateVersion
          },
          "adaptive-medication-skip-report"
        ),
        runtime,
        roundId
      ),
      SubmitReportDataSchema
    );
    const assessment = await success(
      await handleStartAssessment(
        apiRequest(
          `/api/rounds/${roundId}/assessments/session`,
          { expectedStateVersion: report.round.stateVersion, skipMedicationReview: true },
          "adaptive-medication-skip-assessment"
        ),
        runtime,
        roundId
      ),
      AssessmentSessionDataSchema
    );
    expect(assessment.round.state).toBe("capturing");
    const route = await runtime.orchestration.getEvidenceRoute(roundId);
    expect(route).toMatchObject({ medicationConfirmed: false, medicationSkipped: true });
    const events = await runtime.repository.listAuditEvents(roundId);
    expect(events.filter(({ type }) => type === "medication_review_skipped")).toHaveLength(1);
    expect(events.filter(({ type }) => type === "medication_label_proposed")).toHaveLength(0);
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

  it("persists rejected capture quality, retries once, and creates review without a measurement", async () => {
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
            triggerId: "trigger-quality-failure",
            purpose: "Synthetic poor-quality path",
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
    const screen = await success(
      await handleTransitionRound(
        apiRequest(
          `/api/rounds/${roundId}/transition`,
          { to: "red_flag_screen", expectedStateVersion: 0 },
          "quality-screen"
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
          "quality-collect"
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
              reportId: "4dc826ac-22aa-49b8-a584-243498430c6f",
              roundId,
              weakness: "moderate",
              palpitations: "unknown",
              redFlags: { chestPain: "no", severeBreathlessness: "no", fainted: "no" },
              inputMode: "text",
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
    const firstSession = await success(
      await handleStartAssessment(
        apiRequest(
          `/api/rounds/${roundId}/assessments/session`,
          { expectedStateVersion: report.round.stateVersion },
          "quality-session-1"
        ),
        runtime,
        roundId
      ),
      AssessmentSessionDataSchema
    );
    const retry = await success(
      await handleSubmitCaptureQuality(
        apiRequest(
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
        apiRequest(
          `/api/rounds/${roundId}/assessments/session`,
          { expectedStateVersion: retry.round.stateVersion },
          "quality-session-2"
        ),
        runtime,
        roundId
      ),
      AssessmentSessionDataSchema
    );
    const failed = await success(
      await handleSubmitCaptureQuality(
        apiRequest(
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
          "quality-fail"
        ),
        runtime,
        roundId
      ),
      SubmitCaptureQualityDataSchema
    );
    expect(failed).toMatchObject({
      next: "abstained_for_review",
      round: { state: "abstained_for_review" },
      protocolResult: {
        outcome: "abstain_for_review",
        missingFactKeys: ["pulse_bpm"]
      }
    });
    expect(await runtime.repository.listMeasurementFacts(roundId)).toHaveLength(0);
    expect(
      (await runtime.repository.listAuditEvents(roundId)).filter(
        ({ type }) => type === "capture_quality_rejected"
      )
    ).toHaveLength(2);
    if (!failed.protocolResult) return;
    const action = await success(
      await handleExecuteAction(
        apiRequest(
          `/api/rounds/${roundId}/actions`,
          {
            expectedStateVersion: failed.round.stateVersion,
            protocolResult: failed.protocolResult,
            confirmation: { confirmed: true, confirmedAt: NOW }
          },
          "quality-action"
        ),
        runtime,
        roundId
      ),
      ExecuteActionDataSchema
    );
    expect(action).toMatchObject({ kind: "programme_task", created: true });
    if (action.kind !== "programme_task") return;

    const resumedOpen = await success(
      await handleGetRound(
        new Request(`http://localhost:3000/api/rounds/${roundId}`),
        runtime,
        roundId
      ),
      RoundDataSchema
    );
    expect(resumedOpen.task).toMatchObject({ id: action.task.id, status: "open" });

    await success(
      await handleClinicianTaskMutation(
        apiRequest(
          `/api/clinician/tasks/${action.task.id}`,
          {
            kind: "complete",
            expectedTaskUpdatedAt: action.task.updatedAt,
            operationKey: `clinician:${action.task.id}:complete:quality-path`,
            note: null
          },
          "quality-clinician-complete",
          "clinician"
        ),
        runtime,
        action.task.id
      ),
      ClinicianMutationReceiptSchema
    );
    const resumedCompleted = await success(
      await handleGetRound(
        new Request(`http://localhost:3000/api/rounds/${roundId}`),
        runtime,
        roundId
      ),
      RoundDataSchema
    );
    expect(resumedCompleted).toMatchObject({
      round: { state: "abstained_for_review" },
      task: { id: action.task.id, status: "completed" }
    });
  });

  it("accepts exactly one structured follow-up and persists the resulting action-ready state", async () => {
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
            triggerId: "trigger-follow-up",
            purpose: "Synthetic bounded follow-up path",
            protocolId: "cardiometabolic_demo",
            burdenSeconds: 90
          },
          "follow-up-create"
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
          "follow-up-screen"
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
          "follow-up-collect"
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
              reportId: "8ebfa0b4-3d57-443d-bbd7-139ea20d83ed",
              roundId,
              weakness: "moderate",
              palpitations: "absent",
              redFlags: { chestPain: "no", severeBreathlessness: "no", fainted: "no" },
              inputMode: "text",
              confirmedAt: NOW
            },
            expectedStateVersion: collecting.round.stateVersion
          },
          "follow-up-report"
        ),
        runtime,
        roundId
      ),
      SubmitReportDataSchema
    );
    const assessment = await success(
      await handleStartAssessment(
        apiRequest(
          `/api/rounds/${roundId}/assessments/session`,
          { expectedStateVersion: report.round.stateVersion },
          "follow-up-session"
        ),
        runtime,
        roundId
      ),
      AssessmentSessionDataSchema
    );
    const assessed = await success(
      await handleSubmitAssessment(
        apiRequest(
          `/api/rounds/${roundId}/assessments`,
          {
            expectedStateVersion: assessment.round.stateVersion,
            measurement: {
              factId: "f202953a-d11f-4601-b442-3a8a5cfb795a",
              assessmentSessionId: assessment.assessmentSessionId,
              provider: assessment.provider,
              value: 72,
              unit: "bpm",
              observedAt: NOW,
              durationMs: 30_000,
              algorithmVersion: "finger_ppg_local_v1",
              providerModelVersion: null,
              quality: { status: "pass", score: 0.94, reasons: [], metrics: {} },
              rawMediaRef: null
            },
            attestation: assessment.attestation
          },
          "follow-up-assessment"
        ),
        runtime,
        roundId
      ),
      SubmitAssessmentDataSchema
    );
    expect(assessed).toMatchObject({
      round: { state: "follow_up_selected" },
      decision: { kind: "follow_up_required" }
    });
    if (assessed.decision.kind !== "follow_up_required") return;
    const followedUp = await success(
      await handleSubmitFollowUp(
        apiRequest(
          `/api/rounds/${roundId}/follow-up`,
          {
            expectedStateVersion: assessed.round.stateVersion,
            questionId: assessed.decision.question.id,
            answer: "no",
            answeredAt: NOW
          },
          "follow-up-answer"
        ),
        runtime,
        roundId
      ),
      SubmitFollowUpDataSchema
    );
    expect(followedUp).toMatchObject({
      round: { state: "action_pending" },
      protocolResult: {
        outcome: "programme_review_requested",
        matchedRuleIds: ["follow_up_answer_no"]
      }
    });
    expect(
      (await runtime.repository.listAuditEvents(roundId)).filter(
        ({ type }) => type === "follow_up_answered"
      )
    ).toHaveLength(1);
    await expect(
      runtime.orchestration.assertProtocolResult(roundId, followedUp.protocolResult)
    ).resolves.toBeUndefined();
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
