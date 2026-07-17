import {
  AssessmentSessionDataSchema,
  ConfirmMedicationObservationDataSchema,
  ConfirmMedicationObservationRequestSchema,
  ClinicianMutationReceiptSchema,
  ClinicianMutationRequestSchema,
  ClinicianTaskDetailDataSchema,
  CreateRoundDataSchema,
  CreateRoundRequestSchema,
  ElevenLabsCredentialDataSchema,
  ExecuteActionDataSchema,
  ExecuteActionRequestSchema,
  QueueDataSchema,
  RoundDataSchema,
  StartAssessmentRequestSchema,
  SubmitAssessmentDataSchema,
  SubmitAssessmentRequestSchema,
  SubmitCaptureQualityDataSchema,
  SubmitCaptureQualityRequestSchema,
  SubmitFollowUpDataSchema,
  SubmitFollowUpRequestSchema,
  SubmitMedicationLabelImageDataSchema,
  SubmitMedicationLabelImageRequestSchema,
  SubmitReportDataSchema,
  SubmitReportRequestSchema,
  TransitionRoundRequestSchema
} from "@homerounds/api-client";
import { ActionServiceError } from "@homerounds/actions";
import {
  VitalLensPayloadMetadataSchema,
  VitalLensProxyResponseSchema
} from "@homerounds/assessments";
import { ClinicalSnapshotSchema } from "@homerounds/clinical-records";
import { ProtocolResultSchema } from "@homerounds/contracts";
import { z } from "zod";

import { ApiFault } from "./errors";
import { ClinicianServiceError } from "./clinician";
import { emptyInputReader, jsonBodyReader, serveApiRoute } from "./http";
import { OrchestrationError } from "./orchestration";
import type { VitalLensProxyServiceInput } from "./providers";
import type { ServerRuntime } from "./runtime";

const roundIdSchema = z.uuid();
const patientIdSchema = z.string().min(1).max(120);
const taskIdSchema = z.uuid();

async function serviceCall<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error: unknown) {
    if (error instanceof OrchestrationError) {
      switch (error.code) {
        case "round_not_found":
          throw new ApiFault(404, "not_found", "api.error.round_not_found");
        case "patient_mismatch":
        case "assessment_attestation_invalid":
        case "assessment_provider_mismatch":
          throw new ApiFault(403, "forbidden", "api.error.forbidden");
        case "stale_state":
          throw new ApiFault(409, "stale_state", "api.error.stale_state");
        case "snapshot_unavailable":
          throw new ApiFault(503, "unavailable", "api.error.snapshot_unavailable");
        case "round_conflict":
        case "measurement_conflict":
        case "invalid_state":
        case "invalid_transition":
        case "report_missing":
        case "medication_confirmation_required":
        case "medication_proposal_missing":
        case "medication_fact_conflict":
          throw new ApiFault(409, "conflict", `api.error.${error.code}`);
      }
    }
    if (error instanceof ActionServiceError) {
      switch (error.code) {
        case "round_not_found":
          throw new ApiFault(404, "not_found", "api.error.round_not_found");
        case "round_patient_mismatch":
          throw new ApiFault(403, "forbidden", "api.error.forbidden");
        case "stale_state":
          throw new ApiFault(409, "stale_state", "api.error.stale_state");
        case "invalid_round_state":
        case "idempotency_conflict":
          throw new ApiFault(409, "conflict", `api.error.${error.code}`);
        case "repository_commit_failed":
        case "failure_audit_failed":
          throw new ApiFault(503, "unavailable", "api.error.action_temporarily_unavailable");
      }
    }
    if (error instanceof ClinicianServiceError) {
      switch (error.code) {
        case "task_not_found":
        case "round_not_found":
          throw new ApiFault(404, "not_found", `api.error.${error.code}`);
        case "stale":
          throw new ApiFault(409, "stale_state", "api.error.clinician_task_stale");
        case "conflict":
          throw new ApiFault(409, "conflict", "api.error.clinician_task_conflict");
      }
    }
    throw error;
  }
}

function assertPatientScope(sessionPatientId: string | null, patientId: string): void {
  if (sessionPatientId !== patientId) {
    throw new ApiFault(403, "forbidden", "api.error.patient_scope");
  }
}

export function handleCreateRound(request: Request, runtime: ServerRuntime): Promise<Response> {
  return serveApiRoute<
    z.infer<typeof CreateRoundRequestSchema>,
    z.infer<typeof CreateRoundDataSchema>
  >(request, runtime.hooks, {
    method: "POST",
    roles: ["patient", "system"],
    mutation: true,
    rateLimit: { bucket: "round-create", limit: 10, windowMs: 60_000 },
    readInput: jsonBodyReader(CreateRoundRequestSchema),
    outputSchema: CreateRoundDataSchema,
    async handle(context, input) {
      if (context.session.role === "patient") {
        assertPatientScope(context.session.patientId, input.patientId);
      }
      return serviceCall(() =>
        runtime.orchestration.createRound({
          ...input,
          correlationId: context.correlationId
        })
      );
    }
  });
}

export function handleGetRound(
  request: Request,
  runtime: ServerRuntime,
  roundIdInput: string
): Promise<Response> {
  return serveApiRoute<undefined, z.infer<typeof RoundDataSchema>>(request, runtime.hooks, {
    method: "GET",
    roles: ["patient", "clinician", "system"],
    mutation: false,
    rateLimit: { bucket: "round-read", limit: 120, windowMs: 60_000 },
    readInput: emptyInputReader,
    outputSchema: RoundDataSchema,
    async handle(context) {
      const round = await serviceCall(() =>
        runtime.orchestration.getRound(roundIdSchema.parse(roundIdInput))
      );
      if (context.session.role === "patient") {
        assertPatientScope(context.session.patientId, round.patientId);
      }
      const [protocolResult, tasks, evidenceRoute] = await Promise.all([
        serviceCall(() => runtime.orchestration.getProtocolResult(round.id)),
        serviceCall(() => runtime.repository.listTasksForRound(round.id)),
        serviceCall(() => runtime.orchestration.getEvidenceRoute(round.id))
      ]);
      const task =
        tasks.toSorted(
          (left, right) =>
            right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id)
        )[0] ?? null;
      return { round, protocolResult, task, evidenceRoute };
    }
  });
}

export function handleTransitionRound(
  request: Request,
  runtime: ServerRuntime,
  roundIdInput: string
): Promise<Response> {
  return serveApiRoute<
    z.infer<typeof TransitionRoundRequestSchema>,
    z.infer<typeof RoundDataSchema>
  >(request, runtime.hooks, {
    method: "POST",
    roles: ["patient", "clinician", "system"],
    mutation: true,
    rateLimit: { bucket: "round-transition", limit: 60, windowMs: 60_000 },
    readInput: jsonBodyReader(TransitionRoundRequestSchema),
    outputSchema: RoundDataSchema,
    async handle(context, input) {
      const roundId = roundIdSchema.parse(roundIdInput);
      const round = await serviceCall(() => runtime.orchestration.getRound(roundId));
      if (context.session.role === "patient") {
        assertPatientScope(context.session.patientId, round.patientId);
      }
      const actorKind = context.session.role;
      const source =
        actorKind === "patient"
          ? ("patient_ui" as const)
          : actorKind === "clinician"
            ? ("clinician_ui" as const)
            : ("system" as const);
      return {
        round: await serviceCall(() =>
          runtime.orchestration.transition({
            roundId,
            patientId: context.session.role === "patient" ? context.session.patientId : null,
            to: input.to,
            expectedStateVersion: input.expectedStateVersion,
            actor: { kind: actorKind, id: context.session.sessionId },
            source,
            correlationId: context.correlationId
          })
        )
      };
    }
  });
}

export function handleSubmitReport(
  request: Request,
  runtime: ServerRuntime,
  roundIdInput: string
): Promise<Response> {
  return serveApiRoute<
    z.infer<typeof SubmitReportRequestSchema>,
    z.infer<typeof SubmitReportDataSchema>
  >(request, runtime.hooks, {
    method: "POST",
    roles: ["patient"],
    mutation: true,
    rateLimit: { bucket: "report-submit", limit: 20, windowMs: 60_000 },
    readInput: jsonBodyReader(SubmitReportRequestSchema),
    outputSchema: SubmitReportDataSchema,
    async handle(context, input) {
      const patientId = patientIdSchema.parse(context.session.patientId);
      return serviceCall(() =>
        runtime.orchestration.submitReport({
          roundId: roundIdSchema.parse(roundIdInput),
          patientId,
          report: input.report,
          expectedStateVersion: input.expectedStateVersion,
          actorId: context.session.sessionId,
          correlationId: context.correlationId,
          signal: request.signal
        })
      );
    }
  });
}

function decodeCanonicalBase64(value: string): Uint8Array {
  if (value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new ApiFault(400, "invalid_request", "api.error.invalid_medication_image");
  }
  const buffer = Buffer.from(value, "base64");
  if (buffer.toString("base64") !== value) {
    buffer.fill(0);
    throw new ApiFault(400, "invalid_request", "api.error.invalid_medication_image");
  }
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

export function handleSubmitMedicationLabelImage(
  request: Request,
  runtime: ServerRuntime,
  roundIdInput: string
): Promise<Response> {
  return serveApiRoute<
    z.infer<typeof SubmitMedicationLabelImageRequestSchema>,
    z.infer<typeof SubmitMedicationLabelImageDataSchema>
  >(request, runtime.hooks, {
    method: "POST",
    roles: ["patient"],
    mutation: true,
    rateLimit: { bucket: "medication-label-extract", limit: 8, windowMs: 60_000 },
    readInput: jsonBodyReader(SubmitMedicationLabelImageRequestSchema, 4_100_000),
    outputSchema: SubmitMedicationLabelImageDataSchema,
    async handle(context, input) {
      const roundId = roundIdSchema.parse(roundIdInput);
      const patientId = patientIdSchema.parse(context.session.patientId);
      const bytes = decodeCanonicalBase64(input.bytesBase64);
      try {
        const outcome = await runtime.medicationLabel.extract({
          roundId,
          stateVersion: input.expectedStateVersion,
          metadata: input.metadata,
          bytes,
          signal: request.signal
        });
        return {
          outcome: await serviceCall(() =>
            runtime.orchestration.recordMedicationLabelProposal({
              roundId,
              patientId,
              expectedStateVersion: input.expectedStateVersion,
              outcome,
              correlationId: context.correlationId
            })
          )
        };
      } finally {
        bytes.fill(0);
      }
    }
  });
}

export function handleConfirmMedicationObservation(
  request: Request,
  runtime: ServerRuntime,
  roundIdInput: string
): Promise<Response> {
  return serveApiRoute<
    z.infer<typeof ConfirmMedicationObservationRequestSchema>,
    z.infer<typeof ConfirmMedicationObservationDataSchema>
  >(request, runtime.hooks, {
    method: "POST",
    roles: ["patient"],
    mutation: true,
    rateLimit: { bucket: "medication-confirm", limit: 12, windowMs: 60_000 },
    readInput: jsonBodyReader(ConfirmMedicationObservationRequestSchema, 32_000),
    outputSchema: ConfirmMedicationObservationDataSchema,
    async handle(context, input) {
      return serviceCall(() =>
        runtime.orchestration.confirmMedicationObservation({
          roundId: roundIdSchema.parse(roundIdInput),
          patientId: patientIdSchema.parse(context.session.patientId),
          expectedStateVersion: input.expectedStateVersion,
          fact: input.fact,
          actorId: context.session.sessionId,
          correlationId: context.correlationId
        })
      );
    }
  });
}

export function handleStartAssessment(
  request: Request,
  runtime: ServerRuntime,
  roundIdInput: string
): Promise<Response> {
  return serveApiRoute<
    z.infer<typeof StartAssessmentRequestSchema>,
    z.infer<typeof AssessmentSessionDataSchema>
  >(request, runtime.hooks, {
    method: "POST",
    roles: ["patient"],
    mutation: true,
    rateLimit: { bucket: "assessment-start", limit: 10, windowMs: 60_000 },
    readInput: jsonBodyReader(StartAssessmentRequestSchema),
    outputSchema: AssessmentSessionDataSchema,
    async handle(context, input) {
      return serviceCall(() =>
        runtime.orchestration.startAssessment({
          roundId: roundIdSchema.parse(roundIdInput),
          patientId: patientIdSchema.parse(context.session.patientId),
          expectedStateVersion: input.expectedStateVersion,
          skipMedicationReview: input.skipMedicationReview === true,
          actorId: context.session.sessionId,
          correlationId: context.correlationId
        })
      );
    }
  });
}

export function handleSubmitAssessment(
  request: Request,
  runtime: ServerRuntime,
  roundIdInput: string
): Promise<Response> {
  return serveApiRoute<
    z.infer<typeof SubmitAssessmentRequestSchema>,
    z.infer<typeof SubmitAssessmentDataSchema>
  >(request, runtime.hooks, {
    method: "POST",
    roles: ["patient"],
    mutation: true,
    rateLimit: { bucket: "assessment-submit", limit: 20, windowMs: 60_000 },
    readInput: jsonBodyReader(SubmitAssessmentRequestSchema, 64_000),
    outputSchema: SubmitAssessmentDataSchema,
    async handle(context, input) {
      const result = await serviceCall(() =>
        runtime.orchestration.submitAssessment({
          roundId: roundIdSchema.parse(roundIdInput),
          patientId: patientIdSchema.parse(context.session.patientId),
          expectedStateVersion: input.expectedStateVersion,
          measurement: input.measurement,
          attestation: input.attestation,
          actorId: context.session.sessionId,
          correlationId: context.correlationId
        })
      );
      return {
        ...result,
        decision:
          result.decision.kind === "result"
            ? { kind: "result" as const, result: result.decision.result }
            : {
                kind: "follow_up_required" as const,
                protocolId: result.decision.protocolId,
                protocolVersion: result.decision.protocolVersion,
                matchedRuleIds: [...result.decision.matchedRuleIds],
                factIds: [...result.decision.factIds],
                question: result.decision.question,
                explanationKey: result.decision.explanationKey
              }
      };
    }
  });
}

export function handleSubmitCaptureQuality(
  request: Request,
  runtime: ServerRuntime,
  roundIdInput: string
): Promise<Response> {
  return serveApiRoute<
    z.infer<typeof SubmitCaptureQualityRequestSchema>,
    z.infer<typeof SubmitCaptureQualityDataSchema>
  >(request, runtime.hooks, {
    method: "POST",
    roles: ["patient"],
    mutation: true,
    rateLimit: { bucket: "assessment-quality", limit: 20, windowMs: 60_000 },
    readInput: jsonBodyReader(SubmitCaptureQualityRequestSchema, 32_000),
    outputSchema: SubmitCaptureQualityDataSchema,
    async handle(context, input) {
      return serviceCall(() =>
        runtime.orchestration.submitCaptureQuality({
          roundId: roundIdSchema.parse(roundIdInput),
          patientId: patientIdSchema.parse(context.session.patientId),
          expectedStateVersion: input.expectedStateVersion,
          assessmentSessionId: input.assessmentSessionId,
          provider: input.provider,
          quality: input.quality,
          attestation: input.attestation,
          actorId: context.session.sessionId,
          correlationId: context.correlationId
        })
      );
    }
  });
}

export function handleSubmitFollowUp(
  request: Request,
  runtime: ServerRuntime,
  roundIdInput: string
): Promise<Response> {
  return serveApiRoute<
    z.infer<typeof SubmitFollowUpRequestSchema>,
    z.infer<typeof SubmitFollowUpDataSchema>
  >(request, runtime.hooks, {
    method: "POST",
    roles: ["patient"],
    mutation: true,
    rateLimit: { bucket: "follow-up-submit", limit: 10, windowMs: 60_000 },
    readInput: jsonBodyReader(SubmitFollowUpRequestSchema),
    outputSchema: SubmitFollowUpDataSchema,
    async handle(context, input) {
      return serviceCall(() =>
        runtime.orchestration.submitFollowUp({
          roundId: roundIdSchema.parse(roundIdInput),
          patientId: patientIdSchema.parse(context.session.patientId),
          expectedStateVersion: input.expectedStateVersion,
          questionId: input.questionId,
          answer: input.answer,
          answeredAt: input.answeredAt,
          actorId: context.session.sessionId,
          correlationId: context.correlationId
        })
      );
    }
  });
}

export function handleExecuteAction(
  request: Request,
  runtime: ServerRuntime,
  roundIdInput: string
): Promise<Response> {
  return serveApiRoute<
    z.infer<typeof ExecuteActionRequestSchema>,
    z.infer<typeof ExecuteActionDataSchema>
  >(request, runtime.hooks, {
    method: "POST",
    roles: ["patient"],
    mutation: true,
    rateLimit: { bucket: "action-execute", limit: 10, windowMs: 60_000 },
    readInput: jsonBodyReader(ExecuteActionRequestSchema),
    outputSchema: ExecuteActionDataSchema,
    async handle(context, input) {
      const roundId = roundIdSchema.parse(roundIdInput);
      const patientId = patientIdSchema.parse(context.session.patientId);
      const protocolResult = ProtocolResultSchema.parse(input.protocolResult);
      await serviceCall(() => runtime.orchestration.assertProtocolResult(roundId, protocolResult));
      const actionType =
        protocolResult.outcome === "emergency_guidance"
          ? ("show_emergency_guidance" as const)
          : ("create_programme_task" as const);
      if (
        protocolResult.allowedActions.length !== 1 ||
        protocolResult.allowedActions[0] !== actionType
      ) {
        throw new ApiFault(409, "conflict", "api.error.protocol_action_mismatch");
      }
      const result = await serviceCall(() =>
        runtime.actions.execute({
          proposal: {
            actionType,
            roundId,
            patientId,
            protocolResult,
            proposedBy: "deterministic_protocol"
          },
          confirmation: {
            ...input.confirmation,
            confirmationKind: "explicit_patient_confirmation"
          },
          authorization: {
            authorized: true,
            actorKind: "patient",
            actorId: context.session.sessionId,
            scope:
              actionType === "create_programme_task"
                ? "programme_task:create"
                : "emergency_guidance:present"
          },
          expectedStateVersion: input.expectedStateVersion,
          correlationId: context.correlationId
        })
      );
      if (result.kind === "emergency_guidance") {
        return { kind: result.kind, message: result.message };
      }
      const round = await serviceCall(() => runtime.orchestration.getRound(roundId));
      if (round.state === "action_pending") {
        try {
          await serviceCall(() =>
            runtime.orchestration.transition({
              roundId,
              patientId,
              to: "awaiting_clinician",
              expectedStateVersion: round.stateVersion,
              actor: { kind: "system", id: "homerounds-action-orchestrator" },
              source: "system",
              correlationId: context.correlationId
            })
          );
        } catch (error: unknown) {
          const current = await serviceCall(() => runtime.orchestration.getRound(roundId));
          if (current.state !== "awaiting_clinician") throw error;
        }
      }
      return {
        kind: result.kind,
        created: result.created,
        task: result.task,
        message: result.message
      };
    }
  });
}

export function handleSnapshot(
  request: Request,
  runtime: ServerRuntime,
  patientIdInput: string
): Promise<Response> {
  const outputSchema = z.object({ snapshot: ClinicalSnapshotSchema }).strict();
  return serveApiRoute(request, runtime.hooks, {
    method: "GET",
    roles: ["patient", "clinician", "system"],
    mutation: false,
    rateLimit: { bucket: "snapshot-read", limit: 60, windowMs: 60_000 },
    readInput: emptyInputReader,
    outputSchema,
    async handle(context) {
      const patientId = patientIdSchema.parse(patientIdInput);
      if (context.session.role === "patient") {
        assertPatientScope(context.session.patientId, patientId);
      }
      return { snapshot: await serviceCall(() => runtime.snapshots.getOrCreate(patientId)) };
    }
  });
}

export function handleQueue(request: Request, runtime: ServerRuntime): Promise<Response> {
  return serveApiRoute(request, runtime.hooks, {
    method: "GET",
    roles: ["clinician", "system"],
    mutation: false,
    rateLimit: { bucket: "clinician-queue", limit: 120, windowMs: 60_000 },
    readInput: emptyInputReader,
    outputSchema: QueueDataSchema,
    async handle(context) {
      const roundIds = new URL(context.request.url).searchParams.getAll("roundId");
      return serviceCall(() => runtime.orchestration.listQueue(roundIds));
    }
  });
}

export function handleClinicianTaskDetail(
  request: Request,
  runtime: ServerRuntime,
  taskIdInput: string
): Promise<Response> {
  return serveApiRoute(request, runtime.hooks, {
    method: "GET",
    roles: ["clinician"],
    mutation: false,
    rateLimit: { bucket: "clinician-task-detail", limit: 120, windowMs: 60_000 },
    readInput: emptyInputReader,
    outputSchema: ClinicianTaskDetailDataSchema,
    handle: () => serviceCall(() => runtime.clinician.detail(taskIdSchema.parse(taskIdInput)))
  });
}

export function handleClinicianTaskMutation(
  request: Request,
  runtime: ServerRuntime,
  taskIdInput: string
): Promise<Response> {
  return serveApiRoute<
    z.infer<typeof ClinicianMutationRequestSchema>,
    z.infer<typeof ClinicianMutationReceiptSchema>
  >(request, runtime.hooks, {
    method: "POST",
    roles: ["clinician"],
    mutation: true,
    rateLimit: { bucket: "clinician-task-mutation", limit: 60, windowMs: 60_000 },
    readInput: jsonBodyReader(ClinicianMutationRequestSchema, 16_000),
    outputSchema: ClinicianMutationReceiptSchema,
    handle: (context, input) =>
      serviceCall(() =>
        runtime.clinician.mutate({
          ...input,
          taskId: taskIdSchema.parse(taskIdInput),
          actorId: context.session.sessionId,
          correlationId: context.correlationId
        })
      )
  });
}

export function handleElevenLabsCredential(
  request: Request,
  runtime: ServerRuntime
): Promise<Response> {
  return serveApiRoute(
    request,
    { ...runtime.hooks, runtimeProfile: "server_provider_boundary" },
    {
      method: "POST",
      roles: ["patient"],
      mutation: true,
      rateLimit: { bucket: "elevenlabs-session", limit: 5, windowMs: 60_000 },
      readInput: jsonBodyReader(z.object({}).strict(), 32),
      outputSchema: ElevenLabsCredentialDataSchema,
      handle: async () => runtime.elevenLabs.issue()
    }
  );
}

async function vitalLensInputReader(request: Request): Promise<VitalLensProxyServiceInput> {
  if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/octet-stream") {
    throw new ApiFault(415, "unsupported_media_type", "api.error.octet_stream_required");
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > 5_000_000) {
    throw new ApiFault(413, "payload_too_large", "api.error.payload_too_large");
  }
  const metadataHeader = request.headers.get("x-homerounds-payload-metadata");
  if (!metadataHeader || Buffer.byteLength(metadataHeader, "utf8") > 4_096) {
    throw new ApiFault(400, "invalid_request", "api.error.invalid_payload_metadata");
  }
  let metadata: unknown;
  try {
    metadata = JSON.parse(metadataHeader) as unknown;
  } catch {
    throw new ApiFault(400, "invalid_request", "api.error.invalid_payload_metadata");
  }
  const providerVersion = z
    .string()
    .min(1)
    .max(120)
    .parse(request.headers.get("x-homerounds-provider-version"));
  const requestId = z.uuid().parse(request.headers.get("x-homerounds-request-id"));
  const consentVersion = z
    .string()
    .min(1)
    .max(120)
    .parse(request.headers.get("x-homerounds-consent-version"));
  const consentGrantedAt = z.iso
    .datetime()
    .parse(request.headers.get("x-homerounds-consent-granted-at"));
  const parsedMetadata = VitalLensPayloadMetadataSchema.parse(metadata);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > 5_000_000) {
    bytes.fill(0);
    throw new ApiFault(413, "payload_too_large", "api.error.payload_too_large");
  }
  return {
    providerVersion,
    requestId,
    consentVersion,
    consentGrantedAt,
    metadata: parsedMetadata,
    bytes
  };
}

export function handleVitalLensProxy(request: Request, runtime: ServerRuntime): Promise<Response> {
  return serveApiRoute(
    request,
    { ...runtime.hooks, runtimeProfile: "server_provider_boundary" },
    {
      method: "POST",
      roles: ["patient"],
      mutation: true,
      rateLimit: { bucket: "vitallens-proxy", limit: 3, windowMs: 60_000 },
      readInput: vitalLensInputReader,
      outputSchema: VitalLensProxyResponseSchema,
      handle: async (_context, input) => runtime.vitalLens.infer(input)
    }
  );
}
