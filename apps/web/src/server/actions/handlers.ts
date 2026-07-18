import {
  CareActionAuditEventSchema,
  CareActionDetailsSchema,
  CareActionMutationReceiptSchema,
  CareActionServiceError,
  CareActionSubmissionReceiptSchema,
  ClinicianCareActionMutationSchema,
  PatientCareActionConfirmationSchema,
  SyntheticCareActionSchema,
  type ClinicianCareActionMutationKind
} from "@homerounds/actions";
import { z } from "zod";

import { ApiFault } from "../errors";
import { emptyInputReader, jsonBodyReader, serveApiRoute } from "../http";
import type { CareActionHandlerRuntime } from "./runtime";

const RoundIdSchema = z.uuid();
const ActionIdSchema = z.uuid();
const PatientIdSchema = z.string().min(1).max(120);

export const SubmitCareActionRequestSchema = z
  .object({
    details: CareActionDetailsSchema,
    confirmation: PatientCareActionConfirmationSchema,
    expectedRoundVersion: z.number().int().nonnegative(),
    operationKey: z.string().min(16).max(200)
  })
  .strict();

export const MutateCareActionRequestSchema = z
  .object({
    mutation: ClinicianCareActionMutationSchema,
    expectedVersion: z.number().int().positive(),
    operationKey: z.string().min(16).max(200)
  })
  .strict();

export const CareActionListDataSchema = z
  .object({ actions: z.array(SyntheticCareActionSchema).max(20) })
  .strict();

export const CareActionDetailDataSchema = z
  .object({
    action: SyntheticCareActionSchema,
    audit: z.array(CareActionAuditEventSchema).max(100)
  })
  .strict();

function assertDurableAvailability(runtime: CareActionHandlerRuntime): void {
  if (runtime.persistence === "durable_unavailable") {
    throw new ApiFault(503, "unavailable", "api.error.care_action_persistence_unavailable");
  }
}

function assertPatientScope(sessionPatientId: string | null, patientId: string): void {
  if (sessionPatientId !== patientId) {
    throw new ApiFault(403, "forbidden", "api.error.patient_scope");
  }
}

function scopeForMutation(kind: ClinicianCareActionMutationKind) {
  const scopes = {
    approve: "synthetic_care_action:approve",
    edit: "synthetic_care_action:edit",
    record_contact: "synthetic_care_action:contact",
    complete: "synthetic_care_action:complete",
    retry: "synthetic_care_action:retry"
  } as const;
  return scopes[kind];
}

async function serviceCall<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error: unknown) {
    if (!(error instanceof CareActionServiceError)) throw error;
    switch (error.code) {
      case "round_not_found":
      case "action_not_found":
        throw new ApiFault(404, "not_found", `api.error.${error.code}`);
      case "patient_mismatch":
      case "unauthorized_role":
      case "unauthorized_patient":
        throw new ApiFault(403, "forbidden", "api.error.forbidden");
      case "stale_round":
      case "stale_action":
        throw new ApiFault(409, "stale_state", `api.error.${error.code}`);
      case "red_flag_blocked":
      case "authority_unknown":
      case "action_not_allowed":
      case "invalid_transition":
      case "operation_conflict":
        throw new ApiFault(409, "conflict", `api.error.${error.code}`);
    }
  }
}

export function handleListCareActions(
  request: Request,
  runtime: CareActionHandlerRuntime,
  roundIdInput: string
): Promise<Response> {
  return serveApiRoute(request, runtime.hooks, {
    method: "GET",
    roles: ["patient", "clinician"],
    mutation: false,
    rateLimit: { bucket: "care-action-list", limit: 120, windowMs: 60_000 },
    readInput: emptyInputReader,
    outputSchema: CareActionListDataSchema,
    async handle(context) {
      assertDurableAvailability(runtime);
      const roundId = RoundIdSchema.parse(roundIdInput);
      const authority = await runtime.prepareAuthority(roundId);
      if (!authority) throw new ApiFault(404, "not_found", "api.error.round_not_found");
      if (context.session.role === "patient") {
        assertPatientScope(context.session.patientId, authority.patientId);
      }
      return { actions: await serviceCall(() => runtime.service.listRound(roundId)) };
    }
  });
}

export function handleSubmitCareAction(
  request: Request,
  runtime: CareActionHandlerRuntime,
  roundIdInput: string
): Promise<Response> {
  return serveApiRoute<
    z.infer<typeof SubmitCareActionRequestSchema>,
    z.infer<typeof CareActionSubmissionReceiptSchema>
  >(request, runtime.hooks, {
    method: "POST",
    roles: ["patient"],
    mutation: true,
    rateLimit: { bucket: "care-action-submit", limit: 10, windowMs: 60_000 },
    readInput: jsonBodyReader(SubmitCareActionRequestSchema, 8_000),
    outputSchema: CareActionSubmissionReceiptSchema,
    async handle(context, input) {
      assertDurableAvailability(runtime);
      const roundId = RoundIdSchema.parse(roundIdInput);
      const authority = await runtime.prepareAuthority(roundId);
      if (!authority) throw new ApiFault(404, "not_found", "api.error.round_not_found");
      const patientId = PatientIdSchema.parse(context.session.patientId);
      assertPatientScope(patientId, authority.patientId);
      return serviceCall(() =>
        runtime.service.submit({
          roundId,
          patientId,
          details: input.details,
          confirmation: input.confirmation,
          authorization: {
            authorized: true,
            actorKind: "patient",
            actorId: context.session.sessionId,
            patientId,
            scope: "synthetic_care_action:create"
          },
          expectedRoundVersion: input.expectedRoundVersion,
          operationKey: input.operationKey,
          correlationId: context.correlationId
        })
      );
    }
  });
}

export function handleGetCareAction(
  request: Request,
  runtime: CareActionHandlerRuntime,
  roundIdInput: string,
  actionIdInput: string
): Promise<Response> {
  return serveApiRoute(request, runtime.hooks, {
    method: "GET",
    roles: ["patient", "clinician"],
    mutation: false,
    rateLimit: { bucket: "care-action-detail", limit: 120, windowMs: 60_000 },
    readInput: emptyInputReader,
    outputSchema: CareActionDetailDataSchema,
    async handle(context) {
      assertDurableAvailability(runtime);
      const roundId = RoundIdSchema.parse(roundIdInput);
      const actionId = ActionIdSchema.parse(actionIdInput);
      const action = await serviceCall(() => runtime.service.get(actionId));
      if (!action || action.roundId !== roundId) {
        throw new ApiFault(404, "not_found", "api.error.action_not_found");
      }
      if (context.session.role === "patient") {
        assertPatientScope(context.session.patientId, action.patientId);
      }
      const audit = await serviceCall(() => runtime.service.audit(action.id));
      return { action, audit };
    }
  });
}

export function handleMutateCareAction(
  request: Request,
  runtime: CareActionHandlerRuntime,
  roundIdInput: string,
  actionIdInput: string
): Promise<Response> {
  return serveApiRoute<
    z.infer<typeof MutateCareActionRequestSchema>,
    z.infer<typeof CareActionMutationReceiptSchema>
  >(request, runtime.hooks, {
    method: "POST",
    roles: ["clinician"],
    mutation: true,
    rateLimit: { bucket: "care-action-mutation", limit: 60, windowMs: 60_000 },
    readInput: jsonBodyReader(MutateCareActionRequestSchema, 4_000),
    outputSchema: CareActionMutationReceiptSchema,
    async handle(context, input) {
      assertDurableAvailability(runtime);
      const roundId = RoundIdSchema.parse(roundIdInput);
      const actionId = ActionIdSchema.parse(actionIdInput);
      const action = await serviceCall(() => runtime.service.get(actionId));
      if (!action || action.roundId !== roundId) {
        throw new ApiFault(404, "not_found", "api.error.action_not_found");
      }
      return serviceCall(() =>
        runtime.service.mutate({
          actionId,
          mutation: input.mutation,
          authorization: {
            authorized: true,
            actorKind: "clinician",
            actorId: context.session.sessionId,
            patientId: action.patientId,
            scope: scopeForMutation(input.mutation.kind)
          },
          expectedVersion: input.expectedVersion,
          operationKey: input.operationKey,
          correlationId: context.correlationId
        })
      );
    }
  });
}
