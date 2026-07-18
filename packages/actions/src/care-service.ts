import {
  CareActionAuditEventSchema,
  CareActionAuthoritySchema,
  CareActionMutationReceiptSchema,
  CareActionSubmissionReceiptSchema,
  MutateCareActionInputSchema,
  SubmitCareActionInputSchema,
  SyntheticCareActionSchema,
  type CareActionAuditEvent,
  type CareActionAuditEventTypeSchema,
  type CareActionMutationReceipt,
  type CareActionStatus,
  type CareActionSubmissionReceipt,
  type ClinicianCareActionMutationKind,
  type MutateCareActionInput,
  type SubmitCareActionInput,
  type SyntheticCareAction
} from "./care-schemas";
import { deriveCareActionIdempotencyKey, deterministicCareActionId } from "./care-idempotency";
import { CareActionRepositoryError, type CareActionRepository } from "./care-repository";
import type { z } from "zod";

export type CareActionServiceErrorCode =
  | "round_not_found"
  | "patient_mismatch"
  | "stale_round"
  | "stale_action"
  | "red_flag_blocked"
  | "authority_unknown"
  | "action_not_allowed"
  | "action_not_found"
  | "unauthorized_role"
  | "unauthorized_patient"
  | "invalid_transition"
  | "operation_conflict";

export class CareActionServiceError extends Error {
  constructor(
    readonly code: CareActionServiceErrorCode,
    readonly retryable: boolean
  ) {
    super(`Synthetic care action rejected: ${code}`);
    this.name = "CareActionServiceError";
  }
}

export type SyntheticCareActionServiceDependencies = {
  repository: CareActionRepository;
  now?: () => string;
  createId?: () => string;
};

function eventTypeForMutation(
  kind: ClinicianCareActionMutationKind
): z.infer<typeof CareActionAuditEventTypeSchema> {
  switch (kind) {
    case "approve":
      return "approved";
    case "edit":
      return "edited";
    case "record_contact":
      return "contact_attempted";
    case "complete":
      return "completed";
    case "retry":
      return "retried";
  }
}

function nextStatus(
  action: SyntheticCareAction,
  kind: ClinicianCareActionMutationKind
): CareActionStatus {
  switch (kind) {
    case "approve":
      if (action.status !== "pending_review")
        throw new CareActionServiceError("invalid_transition", false);
      return "approved";
    case "edit":
      if (action.status !== "pending_review" && action.status !== "approved") {
        throw new CareActionServiceError("invalid_transition", false);
      }
      return action.status;
    case "record_contact":
      if (action.status !== "approved")
        throw new CareActionServiceError("invalid_transition", false);
      return "contact_attempted";
    case "complete":
      if (action.status !== "approved" && action.status !== "contact_attempted") {
        throw new CareActionServiceError("invalid_transition", false);
      }
      return "completed";
    case "retry":
      if (action.status !== "failed" || action.lastFailure?.retryable !== true) {
        throw new CareActionServiceError("invalid_transition", false);
      }
      return "pending_review";
  }
}

function mapRepositoryError(error: CareActionRepositoryError): CareActionServiceError {
  switch (error.code) {
    case "round_not_found":
      return new CareActionServiceError("round_not_found", false);
    case "stale_round":
      return new CareActionServiceError("stale_round", true);
    case "stale_action":
      return new CareActionServiceError("stale_action", true);
    case "operation_conflict":
      return new CareActionServiceError("operation_conflict", false);
  }
}

export class SyntheticCareActionService {
  readonly #repository: CareActionRepository;
  readonly #now: () => string;
  readonly #createId: () => string;

  constructor(dependencies: SyntheticCareActionServiceDependencies) {
    this.#repository = dependencies.repository;
    this.#now = dependencies.now ?? (() => new Date().toISOString());
    this.#createId = dependencies.createId ?? (() => globalThis.crypto.randomUUID());
  }

  async submit(inputValue: SubmitCareActionInput): Promise<CareActionSubmissionReceipt> {
    const input = SubmitCareActionInputSchema.parse(inputValue);
    const authorityValue = await this.#repository.getAuthority(input.roundId);
    if (!authorityValue) throw new CareActionServiceError("round_not_found", false);
    const authority = CareActionAuthoritySchema.parse(authorityValue);
    if (authority.patientId !== input.patientId) {
      throw new CareActionServiceError("patient_mismatch", false);
    }
    if (authority.roundVersion !== input.expectedRoundVersion) {
      throw new CareActionServiceError("stale_round", true);
    }
    if (authority.redFlagGate === "stop") {
      throw new CareActionServiceError("red_flag_blocked", false);
    }
    if (authority.redFlagGate === "unknown" || authority.evidence === null) {
      throw new CareActionServiceError("authority_unknown", false);
    }
    if (!authority.eligibleActions.includes(input.details.kind)) {
      throw new CareActionServiceError("action_not_allowed", false);
    }

    const idempotencyKey = deriveCareActionIdempotencyKey(input);
    const occurredAt = this.#now();
    const action = SyntheticCareActionSchema.parse({
      id: deterministicCareActionId(idempotencyKey),
      roundId: input.roundId,
      patientId: input.patientId,
      kind: input.details.kind,
      details: input.details,
      evidence: authority.evidence,
      idempotencyKey,
      patientConfirmationAt: input.confirmation.confirmedAt,
      status: "pending_review",
      version: 1,
      ownerId: null,
      clinicianSummary: null,
      lastFailure: null,
      delivery: "synthetic_only_not_sent",
      createdAt: occurredAt,
      updatedAt: occurredAt
    });
    const baseEvent = {
      eventId: this.#createId(),
      actionId: action.id,
      roundId: action.roundId,
      patientId: action.patientId,
      actionKind: action.kind,
      status: action.status,
      actionVersion: action.version,
      actor: { kind: "patient" as const, id: input.authorization.actorId },
      operationKey: input.operationKey,
      correlationId: input.correlationId,
      occurredAt,
      rawTranscriptStored: false as const,
      modelReasoningStored: false as const,
      providerPayloadStored: false as const,
      rawMediaStored: false as const
    };
    try {
      return CareActionSubmissionReceiptSchema.parse(
        await this.#repository.createConfirmedAction({
          action,
          expectedRoundVersion: input.expectedRoundVersion,
          event: CareActionAuditEventSchema.parse({
            ...baseEvent,
            type: "submitted",
            summaryKey: "synthetic_care_action.submitted"
          }),
          duplicateEvent: CareActionAuditEventSchema.parse({
            ...baseEvent,
            eventId: this.#createId(),
            type: "duplicate_suppressed",
            summaryKey: "synthetic_care_action.duplicate_suppressed"
          })
        })
      );
    } catch (error: unknown) {
      if (error instanceof CareActionRepositoryError) throw mapRepositoryError(error);
      throw error;
    }
  }

  async get(actionId: string): Promise<SyntheticCareAction | null> {
    const action = await this.#repository.getAction(actionId);
    return action ? SyntheticCareActionSchema.parse(action) : null;
  }

  async listRound(roundId: string): Promise<SyntheticCareAction[]> {
    return Promise.all(
      (await this.#repository.listActionsForRound(roundId)).map((action) =>
        SyntheticCareActionSchema.parse(action)
      )
    );
  }

  async audit(actionId: string): Promise<CareActionAuditEvent[]> {
    return Promise.all(
      (await this.#repository.listAuditEvents(actionId)).map((event) =>
        CareActionAuditEventSchema.parse(event)
      )
    );
  }

  async mutate(inputValue: MutateCareActionInput): Promise<CareActionMutationReceipt> {
    const input = MutateCareActionInputSchema.parse(inputValue);
    const replay = await this.#repository.getMutationReceipt(input.operationKey);
    if (replay)
      return CareActionMutationReceiptSchema.parse({ ...replay, duplicateSuppressed: true });
    const actionValue = await this.#repository.getAction(input.actionId);
    if (!actionValue) throw new CareActionServiceError("action_not_found", false);
    const action = SyntheticCareActionSchema.parse(actionValue);
    if (input.authorization.actorKind !== "clinician") {
      throw new CareActionServiceError("unauthorized_role", false);
    }
    if (input.authorization.patientId !== action.patientId) {
      throw new CareActionServiceError("unauthorized_patient", false);
    }
    if (input.expectedVersion !== action.version) {
      throw new CareActionServiceError("stale_action", true);
    }
    const status = nextStatus(action, input.mutation.kind);
    const occurredAt = this.#now();
    const next = SyntheticCareActionSchema.parse({
      ...action,
      status,
      version: action.version + 1,
      ownerId: input.authorization.actorId,
      clinicianSummary:
        input.mutation.kind === "edit" ? input.mutation.clinicianSummary : action.clinicianSummary,
      lastFailure: null,
      updatedAt: occurredAt
    });
    const event = CareActionAuditEventSchema.parse({
      eventId: this.#createId(),
      actionId: action.id,
      roundId: action.roundId,
      patientId: action.patientId,
      type: eventTypeForMutation(input.mutation.kind),
      actionKind: action.kind,
      status: next.status,
      actionVersion: next.version,
      actor: { kind: "clinician", id: input.authorization.actorId },
      operationKey: input.operationKey,
      correlationId: input.correlationId,
      occurredAt,
      summaryKey: `synthetic_care_action.${eventTypeForMutation(input.mutation.kind)}`,
      rawTranscriptStored: false,
      modelReasoningStored: false,
      providerPayloadStored: false,
      rawMediaStored: false
    });
    try {
      return CareActionMutationReceiptSchema.parse(
        await this.#repository.persistMutation({
          previous: action,
          next,
          event,
          operationKey: input.operationKey
        })
      );
    } catch (error: unknown) {
      if (error instanceof CareActionRepositoryError) throw mapRepositoryError(error);
      throw error;
    }
  }

  async recordFailure(input: {
    actionId: string;
    expectedVersion: number;
    code: "persistence_unavailable" | "temporary_conflict" | "workflow_unavailable";
    retryable: boolean;
    operationKey: string;
    correlationId: string;
  }): Promise<CareActionMutationReceipt> {
    const replay = await this.#repository.getMutationReceipt(input.operationKey);
    if (replay)
      return CareActionMutationReceiptSchema.parse({ ...replay, duplicateSuppressed: true });
    const actionValue = await this.#repository.getAction(input.actionId);
    if (!actionValue) throw new CareActionServiceError("action_not_found", false);
    const action = SyntheticCareActionSchema.parse(actionValue);
    if (action.version !== input.expectedVersion) {
      throw new CareActionServiceError("stale_action", true);
    }
    if (action.status === "completed")
      throw new CareActionServiceError("invalid_transition", false);
    const occurredAt = this.#now();
    const next = SyntheticCareActionSchema.parse({
      ...action,
      status: "failed",
      version: action.version + 1,
      lastFailure: { code: input.code, retryable: input.retryable, recordedAt: occurredAt },
      updatedAt: occurredAt
    });
    const event = CareActionAuditEventSchema.parse({
      eventId: this.#createId(),
      actionId: action.id,
      roundId: action.roundId,
      patientId: action.patientId,
      type: "failed",
      actionKind: action.kind,
      status: "failed",
      actionVersion: next.version,
      actor: { kind: "system", id: "homerounds-care-action-service" },
      operationKey: input.operationKey,
      correlationId: input.correlationId,
      occurredAt,
      summaryKey: `synthetic_care_action.failed.${input.code}`,
      rawTranscriptStored: false,
      modelReasoningStored: false,
      providerPayloadStored: false,
      rawMediaStored: false
    });
    try {
      return await this.#repository.persistMutation({
        previous: action,
        next,
        event,
        operationKey: input.operationKey
      });
    } catch (error: unknown) {
      if (error instanceof CareActionRepositoryError) throw mapRepositoryError(error);
      throw error;
    }
  }
}

export type ReconstructedCareActionState = {
  status: CareActionStatus;
  version: number | null;
  lastEventAt: string | null;
};

export function reconstructCareActionState(
  eventsInput: readonly CareActionAuditEvent[]
): ReconstructedCareActionState {
  const events = eventsInput
    .map((event) => CareActionAuditEventSchema.parse(event))
    .toSorted(
      (left, right) =>
        left.actionVersion - right.actionVersion ||
        left.occurredAt.localeCompare(right.occurredAt) ||
        left.eventId.localeCompare(right.eventId)
    );
  let status: CareActionStatus = "unknown";
  let version: number | null = null;
  let lastEventAt: string | null = null;
  for (const event of events) {
    if (event.type === "duplicate_suppressed") {
      if (version === null || event.actionVersion !== version || event.status !== status) {
        return { status: "unknown", version: null, lastEventAt: null };
      }
      continue;
    }
    if (version === null && event.type !== "submitted") {
      return { status: "unknown", version: null, lastEventAt: null };
    }
    if (version !== null && event.actionVersion !== version + 1) {
      return { status: "unknown", version: null, lastEventAt: null };
    }
    let expectedStatus: CareActionStatus;
    switch (event.type) {
      case "submitted":
        if (version !== null || event.actionVersion !== 1) {
          return { status: "unknown", version: null, lastEventAt: null };
        }
        expectedStatus = "pending_review";
        break;
      case "approved":
        if (status !== "pending_review") {
          return { status: "unknown", version: null, lastEventAt: null };
        }
        expectedStatus = "approved";
        break;
      case "edited":
        if (status !== "pending_review" && status !== "approved") {
          return { status: "unknown", version: null, lastEventAt: null };
        }
        expectedStatus = status;
        break;
      case "contact_attempted":
        if (status !== "approved") {
          return { status: "unknown", version: null, lastEventAt: null };
        }
        expectedStatus = "contact_attempted";
        break;
      case "completed":
        if (status !== "approved" && status !== "contact_attempted") {
          return { status: "unknown", version: null, lastEventAt: null };
        }
        expectedStatus = "completed";
        break;
      case "failed":
        if (status === "unknown" || status === "completed") {
          return { status: "unknown", version: null, lastEventAt: null };
        }
        expectedStatus = "failed";
        break;
      case "retried":
        if (status !== "failed") {
          return { status: "unknown", version: null, lastEventAt: null };
        }
        expectedStatus = "pending_review";
        break;
    }
    if (event.status !== expectedStatus) {
      return { status: "unknown", version: null, lastEventAt: null };
    }
    status = expectedStatus;
    version = event.actionVersion;
    lastEventAt = event.occurredAt;
  }
  return { status, version, lastEventAt };
}
