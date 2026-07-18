import {
  CareActionAuditEventSchema,
  CareActionAuthoritySchema,
  CareActionMutationReceiptSchema,
  CareActionSubmissionReceiptSchema,
  SyntheticCareActionSchema,
  type CareActionAuditEvent,
  type CareActionAuthority,
  type CareActionMutationReceipt,
  type CareActionSubmissionReceipt,
  type SyntheticCareAction
} from "./care-schemas";

export class CareActionRepositoryError extends Error {
  constructor(
    readonly code: "round_not_found" | "stale_round" | "stale_action" | "operation_conflict"
  ) {
    super(`Care action repository rejected the operation: ${code}`);
    this.name = "CareActionRepositoryError";
  }
}

export type CreateConfirmedCareActionInput = {
  action: SyntheticCareAction;
  event: CareActionAuditEvent;
  duplicateEvent: CareActionAuditEvent;
  expectedRoundVersion: number;
};

export type PersistCareActionMutationInput = {
  previous: SyntheticCareAction;
  next: SyntheticCareAction;
  event: CareActionAuditEvent;
  operationKey: string;
};

export interface CareActionRepository {
  getAuthority(roundId: string): Promise<CareActionAuthority | null>;
  getAction(actionId: string): Promise<SyntheticCareAction | null>;
  getActionByIdempotencyKey(idempotencyKey: string): Promise<SyntheticCareAction | null>;
  listActionsForRound(roundId: string): Promise<SyntheticCareAction[]>;
  listAuditEvents(actionId: string): Promise<CareActionAuditEvent[]>;
  getMutationReceipt(operationKey: string): Promise<CareActionMutationReceipt | null>;
  createConfirmedAction(
    input: CreateConfirmedCareActionInput
  ): Promise<CareActionSubmissionReceipt>;
  persistMutation(input: PersistCareActionMutationInput): Promise<CareActionMutationReceipt>;
}

export class InMemoryCareActionRepository implements CareActionRepository {
  readonly #authorities = new Map<string, CareActionAuthority>();
  readonly #actions = new Map<string, SyntheticCareAction>();
  readonly #actionIdByIdempotencyKey = new Map<string, string>();
  readonly #events = new Map<string, CareActionAuditEvent[]>();
  readonly #mutationReceipts = new Map<string, CareActionMutationReceipt>();
  #writeQueue: Promise<void> = Promise.resolve();

  constructor(authorities: readonly CareActionAuthority[] = []) {
    for (const authority of authorities) this.setAuthority(authority);
  }

  setAuthority(authorityInput: CareActionAuthority): void {
    const authority = CareActionAuthoritySchema.parse(authorityInput);
    this.#authorities.set(authority.roundId, structuredClone(authority));
  }

  async getAuthority(roundId: string): Promise<CareActionAuthority | null> {
    const authority = this.#authorities.get(roundId);
    return authority ? structuredClone(authority) : null;
  }

  async getAction(actionId: string): Promise<SyntheticCareAction | null> {
    const action = this.#actions.get(actionId);
    return action ? structuredClone(action) : null;
  }

  async getActionByIdempotencyKey(idempotencyKey: string): Promise<SyntheticCareAction | null> {
    const actionId = this.#actionIdByIdempotencyKey.get(idempotencyKey);
    return actionId ? this.getAction(actionId) : null;
  }

  async listActionsForRound(roundId: string): Promise<SyntheticCareAction[]> {
    return [...this.#actions.values()]
      .filter((action) => action.roundId === roundId)
      .map((action) => structuredClone(action))
      .toSorted(
        (left, right) =>
          left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)
      );
  }

  async listAuditEvents(actionId: string): Promise<CareActionAuditEvent[]> {
    return (this.#events.get(actionId) ?? []).map((event) => structuredClone(event));
  }

  async getMutationReceipt(operationKey: string): Promise<CareActionMutationReceipt | null> {
    const receipt = this.#mutationReceipts.get(operationKey);
    return receipt ? structuredClone(receipt) : null;
  }

  async createConfirmedAction(
    input: CreateConfirmedCareActionInput
  ): Promise<CareActionSubmissionReceipt> {
    return this.#serial(async () => {
      const action = SyntheticCareActionSchema.parse(input.action);
      const authority = this.#authorities.get(action.roundId);
      if (!authority) throw new CareActionRepositoryError("round_not_found");
      if (authority.roundVersion !== input.expectedRoundVersion) {
        throw new CareActionRepositoryError("stale_round");
      }
      const existingId = this.#actionIdByIdempotencyKey.get(action.idempotencyKey);
      if (existingId) {
        const existing = this.#actions.get(existingId);
        if (!existing || existing.kind !== action.kind || existing.patientId !== action.patientId) {
          throw new CareActionRepositoryError("operation_conflict");
        }
        const duplicateEvent = CareActionAuditEventSchema.parse({
          ...input.duplicateEvent,
          actionId: existing.id,
          actionVersion: existing.version,
          status: existing.status
        });
        this.#events.set(existing.id, [...(this.#events.get(existing.id) ?? []), duplicateEvent]);
        return CareActionSubmissionReceiptSchema.parse({
          status: "persisted",
          created: false,
          action: existing,
          event: duplicateEvent,
          operationKey: duplicateEvent.operationKey,
          duplicateSuppressed: true
        });
      }
      const event = CareActionAuditEventSchema.parse(input.event);
      this.#actions.set(action.id, structuredClone(action));
      this.#actionIdByIdempotencyKey.set(action.idempotencyKey, action.id);
      this.#events.set(action.id, [event]);
      const receipt = CareActionSubmissionReceiptSchema.parse({
        status: "persisted",
        created: true,
        action,
        event,
        operationKey: event.operationKey,
        duplicateSuppressed: false
      });
      return receipt;
    });
  }

  async persistMutation(input: PersistCareActionMutationInput): Promise<CareActionMutationReceipt> {
    return this.#serial(async () => {
      const replay = this.#mutationReceipts.get(input.operationKey);
      if (replay) {
        return CareActionMutationReceiptSchema.parse({
          ...replay,
          duplicateSuppressed: true
        });
      }
      const previous = SyntheticCareActionSchema.parse(input.previous);
      const next = SyntheticCareActionSchema.parse(input.next);
      const current = this.#actions.get(previous.id);
      if (!current) throw new CareActionRepositoryError("operation_conflict");
      if (current.version !== previous.version || current.updatedAt !== previous.updatedAt) {
        throw new CareActionRepositoryError("stale_action");
      }
      if (next.id !== current.id || next.version !== current.version + 1) {
        throw new CareActionRepositoryError("operation_conflict");
      }
      const event = CareActionAuditEventSchema.parse(input.event);
      this.#actions.set(next.id, structuredClone(next));
      this.#events.set(next.id, [...(this.#events.get(next.id) ?? []), event]);
      const receipt = CareActionMutationReceiptSchema.parse({
        status: "persisted",
        action: next,
        event,
        operationKey: input.operationKey,
        duplicateSuppressed: false
      });
      this.#mutationReceipts.set(input.operationKey, receipt);
      return receipt;
    });
  }

  async #serial<T>(operation: () => Promise<T> | T): Promise<T> {
    const previous = this.#writeQueue;
    let release!: () => void;
    this.#writeQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}
