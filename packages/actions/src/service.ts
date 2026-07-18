import {
  createActionFailedEvent,
  createEmergencyGuidancePresentedEvent,
  createProgrammeTaskCreatedEvent,
  createProgrammeTaskDuplicateEvent
} from "@homerounds/audit";
import { ClinicalTaskSchema, type ClinicalTask, type DomainEvent } from "@homerounds/contracts";
import type {
  ActionAttempt,
  HomeRoundsRepository,
  RecordFailedActionInput
} from "@homerounds/persistence";

import { deriveActionIdempotencyKey, deterministicActionUuid } from "./idempotency";
import { messageForProtocolResult, type PatientMessageTemplate } from "./messages";
import { ExecuteActionInputSchema, type ExecuteActionInput } from "./schemas";

export type ActionServiceErrorCode =
  | "round_not_found"
  | "round_patient_mismatch"
  | "stale_state"
  | "invalid_round_state"
  | "idempotency_conflict"
  | "repository_commit_failed"
  | "failure_audit_failed";

export class ActionServiceError extends Error {
  constructor(
    readonly code: ActionServiceErrorCode,
    readonly retryable: boolean
  ) {
    super(`Action service rejected the request: ${code}`);
    this.name = "ActionServiceError";
  }
}

const actionServiceErrorCodes = new Set<ActionServiceErrorCode>([
  "round_not_found",
  "round_patient_mismatch",
  "stale_state",
  "invalid_round_state",
  "idempotency_conflict",
  "repository_commit_failed",
  "failure_audit_failed"
]);

export function isActionServiceError(error: unknown): error is ActionServiceError {
  if (error instanceof ActionServiceError) return true;
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { name?: unknown; code?: unknown; retryable?: unknown };
  return (
    candidate.name === "ActionServiceError" &&
    typeof candidate.code === "string" &&
    actionServiceErrorCodes.has(candidate.code as ActionServiceErrorCode) &&
    typeof candidate.retryable === "boolean"
  );
}

export type ActionServiceDependencies<TSnapshot, TFact> = {
  repository: HomeRoundsRepository<TSnapshot, TFact>;
  now?: () => string;
  createId?: () => string;
};

export type ActionExecutionResult =
  | {
      kind: "programme_task";
      created: boolean;
      task: ClinicalTask;
      attempt: ActionAttempt;
      auditEvent: DomainEvent;
      message: PatientMessageTemplate;
    }
  | {
      kind: "emergency_guidance";
      auditEvent: DomainEvent;
      message: PatientMessageTemplate;
    };

function defaultNow(): string {
  return new Date().toISOString();
}

function defaultId(): string {
  return globalThis.crypto.randomUUID();
}

export class ActionService<TSnapshot, TFact> {
  readonly #repository: HomeRoundsRepository<TSnapshot, TFact>;
  readonly #now: () => string;
  readonly #createId: () => string;

  constructor(dependencies: ActionServiceDependencies<TSnapshot, TFact>) {
    this.#repository = dependencies.repository;
    this.#now = dependencies.now ?? defaultNow;
    this.#createId = dependencies.createId ?? defaultId;
  }

  async execute(inputValue: ExecuteActionInput): Promise<ActionExecutionResult> {
    const input = ExecuteActionInputSchema.parse(inputValue);
    const round = await this.#repository.getRound(input.proposal.roundId);
    if (!round) throw new ActionServiceError("round_not_found", false);
    if (round.patientId !== input.proposal.patientId) {
      throw new ActionServiceError("round_patient_mismatch", false);
    }
    const actionType = input.proposal.actionType;
    const idempotencyKey = deriveActionIdempotencyKey({
      roundId: round.id,
      patientId: round.patientId,
      actionType,
      protocolResult: input.proposal.protocolResult
    });
    const existingTask =
      actionType === "create_programme_task"
        ? await this.#repository.getTaskByIdempotencyKey(idempotencyKey)
        : null;
    const replayAfterTransition =
      actionType === "create_programme_task" &&
      round.state === "awaiting_clinician" &&
      existingTask !== null;
    if (round.stateVersion !== input.expectedStateVersion && !replayAfterTransition) {
      throw new ActionServiceError("stale_state", true);
    }

    const allowedState =
      actionType === "create_programme_task"
        ? round.state === "action_pending" ||
          round.state === "awaiting_clinician" ||
          round.state === "abstained_for_review"
        : round.state === "protocol_decided" || round.state === "emergency_closed";
    if (!allowedState) throw new ActionServiceError("invalid_round_state", false);
    const message = messageForProtocolResult(input.proposal.protocolResult);

    if (actionType === "show_emergency_guidance") {
      const auditEvent = createEmergencyGuidancePresentedEvent({
        eventId: this.#createId(),
        occurredAt: this.#now(),
        actor: { kind: input.authorization.actorKind, id: input.authorization.actorId },
        patientId: round.patientId,
        roundId: round.id,
        correlationId: input.correlationId,
        source: input.authorization.actorKind === "patient" ? "patient_ui" : "system",
        idempotencyKey,
        protocolResult: input.proposal.protocolResult,
        messageTemplateId: message.templateId
      });
      await this.#repository.appendAuditEvent(auditEvent);
      return { kind: "emergency_guidance", auditEvent, message };
    }

    const occurredAt = this.#now();
    const task = ClinicalTaskSchema.parse({
      id: deterministicActionUuid(idempotencyKey),
      roundId: round.id,
      patientId: round.patientId,
      idempotencyKey,
      type: "programme_review",
      ownerRole: "programme_clinician",
      priority:
        input.proposal.protocolResult.outcome === "abstain_for_review" ? "routine" : "priority",
      reasonKey: input.proposal.protocolResult.explanationKey,
      status: "open",
      serviceWindowLabel:
        message.serviceWindowLabel ?? "Illustrative review window; no response is promised.",
      protocolId: input.proposal.protocolResult.protocolId,
      createdAt: occurredAt,
      updatedAt: occurredAt
    });
    const attempt = {
      id: this.#createId(),
      roundId: round.id,
      idempotencyKey,
      actionType: "create_programme_task" as const,
      occurredAt,
      correlationId: input.correlationId
    };
    const eventInput = {
      eventId: this.#createId(),
      occurredAt,
      actor: { kind: "system" as const, id: "homerounds-action-executor" },
      patientId: round.patientId,
      roundId: round.id,
      correlationId: input.correlationId,
      source: "system" as const,
      idempotencyKey,
      taskId: task.id,
      protocolResult: input.proposal.protocolResult,
      messageTemplateId: message.templateId
    };

    try {
      const committed = await this.#repository.commitAction({
        task,
        attempt,
        createdEvent: createProgrammeTaskCreatedEvent(eventInput),
        duplicateEvent: createProgrammeTaskDuplicateEvent(eventInput)
      });
      if (
        committed.task.roundId !== task.roundId ||
        committed.task.patientId !== task.patientId ||
        committed.task.protocolId !== task.protocolId ||
        committed.task.type !== task.type
      ) {
        throw new ActionServiceError("idempotency_conflict", false);
      }
      return {
        kind: "programme_task",
        created: committed.created,
        task: committed.task,
        attempt: committed.attempt,
        auditEvent: committed.auditEvent,
        message
      };
    } catch (error: unknown) {
      if (error instanceof ActionServiceError) throw error;
      await this.#recordFailure({
        attempt,
        errorCode: "repository_commit_failed",
        failureEvent: createActionFailedEvent({
          eventId: this.#createId(),
          occurredAt,
          actor: { kind: "system", id: "homerounds-action-executor" },
          patientId: round.patientId,
          roundId: round.id,
          correlationId: input.correlationId,
          source: "system",
          actionType: "create_programme_task",
          idempotencyKey,
          errorCode: "repository_commit_failed",
          retryable: true
        })
      });
      throw new ActionServiceError("repository_commit_failed", true);
    }
  }

  async #recordFailure(input: RecordFailedActionInput): Promise<void> {
    try {
      await this.#repository.recordFailedAction(input);
    } catch {
      throw new ActionServiceError("failure_audit_failed", true);
    }
  }
}
