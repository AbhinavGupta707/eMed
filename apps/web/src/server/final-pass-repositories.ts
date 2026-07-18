import {
  CareActionAuditEventSchema,
  CareActionAuthoritySchema,
  CareActionMutationReceiptSchema,
  CareActionRepositoryError,
  CareActionSubmissionReceiptSchema,
  SyntheticCareActionSchema,
  type CareActionAuditEvent,
  type CareActionAuthority,
  type CareActionMutationReceipt,
  type CareActionRepository,
  type CareActionSubmissionReceipt,
  type CreateConfirmedCareActionInput,
  type PersistCareActionMutationInput,
  type SyntheticCareAction
} from "@homerounds/actions";
import {
  StructuredMemoryStoreSchema,
  type StructuredMemoryStore
} from "@homerounds/personalization";
import postgres from "postgres";
import { z } from "zod";

import {
  CommittedTriggerProposalSchema,
  TriggerProposalConflictError,
  type CommittedTriggerProposal,
  type TriggerProposalCommitResult,
  type TriggerProposalRepository
} from "./triggers/repository";

type Client = ReturnType<typeof postgres>;
type Transaction = postgres.TransactionSql;

const StoredRecordRowSchema = z.object({ record: z.unknown() }).passthrough();

function recordFrom<T>(rows: readonly unknown[], schema: z.ZodType<T>): T | null {
  const row = rows[0];
  return row ? schema.parse(StoredRecordRowSchema.parse(row).record) : null;
}

function databaseCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

export class PostgresTriggerProposalRepository implements TriggerProposalRepository {
  constructor(private readonly client: Client) {}

  async commit(recordValue: CommittedTriggerProposal): Promise<TriggerProposalCommitResult> {
    const record = CommittedTriggerProposalSchema.parse(recordValue);
    const { proposal } = record.evaluation;
    return this.client.begin(async (transaction) => {
      await transaction`
        select pg_advisory_xact_lock(hashtextextended(${proposal.idempotencyKey}, 0))
      `;
      const existing = recordFrom(
        await transaction`
          select record from proactive_trigger_proposals
          where idempotency_key = ${proposal.idempotencyKey} limit 1
        `,
        CommittedTriggerProposalSchema
      );
      if (existing) {
        if (
          existing.evaluation.proposal.proposalId !== proposal.proposalId ||
          existing.evaluation.proposal.triggerId !== proposal.triggerId ||
          existing.evaluation.patientId !== record.evaluation.patientId ||
          existing.evaluation.policyVersion !== record.evaluation.policyVersion
        ) {
          throw new TriggerProposalConflictError(proposal.idempotencyKey);
        }
        return { record: existing, replayed: true };
      }
      try {
        await transaction`
          insert into proactive_trigger_proposals (
            idempotency_key, patient_id, trigger_id, proposal_id, committed_at, record
          ) values (
            ${proposal.idempotencyKey}, ${proposal.patientId}, ${proposal.triggerId},
            ${proposal.proposalId}, ${record.committedAt}, ${json(record)}::text::jsonb
          )
        `;
      } catch (error: unknown) {
        if (databaseCode(error) === "23505") {
          throw new TriggerProposalConflictError(proposal.idempotencyKey);
        }
        throw error;
      }
      return { record, replayed: false };
    });
  }

  async getByIdempotencyKey(idempotencyKey: string): Promise<CommittedTriggerProposal | null> {
    return recordFrom(
      await this.client`
        select record from proactive_trigger_proposals
        where idempotency_key = ${idempotencyKey} limit 1
      `,
      CommittedTriggerProposalSchema
    );
  }
}

export class StructuredMemoryRepositoryConflictError extends Error {
  readonly code = "structured_memory_repository_conflict";

  constructor(readonly patientId: string) {
    super(`Structured memory changed concurrently for ${patientId}.`);
    this.name = "StructuredMemoryRepositoryConflictError";
  }
}

export interface StructuredMemoryRepository {
  getStore(patientId: string): Promise<StructuredMemoryStore | null>;
  saveStore(store: StructuredMemoryStore, expectedStoreVersion: number | null): Promise<void>;
}

export class InMemoryStructuredMemoryRepository implements StructuredMemoryRepository {
  readonly #stores = new Map<string, StructuredMemoryStore>();

  async getStore(patientId: string): Promise<StructuredMemoryStore | null> {
    const store = this.#stores.get(patientId);
    return store ? structuredClone(store) : null;
  }

  async saveStore(
    storeValue: StructuredMemoryStore,
    expectedStoreVersion: number | null
  ): Promise<void> {
    const store = StructuredMemoryStoreSchema.parse(storeValue);
    const current = this.#stores.get(store.patientId);
    if (expectedStoreVersion === null) {
      if (current && JSON.stringify(current) !== JSON.stringify(store)) {
        throw new StructuredMemoryRepositoryConflictError(store.patientId);
      }
    } else if (!current || current.storeVersion !== expectedStoreVersion) {
      throw new StructuredMemoryRepositoryConflictError(store.patientId);
    }
    this.#stores.set(store.patientId, structuredClone(store));
  }
}

export class PostgresStructuredMemoryRepository implements StructuredMemoryRepository {
  constructor(private readonly client: Client) {}

  async getStore(patientId: string): Promise<StructuredMemoryStore | null> {
    return recordFrom(
      await this.client`
        select record from structured_memory_stores where patient_id = ${patientId} limit 1
      `,
      StructuredMemoryStoreSchema
    );
  }

  async saveStore(
    storeValue: StructuredMemoryStore,
    expectedStoreVersion: number | null
  ): Promise<void> {
    const store = StructuredMemoryStoreSchema.parse(storeValue);
    if (expectedStoreVersion === null) {
      const inserted = await this.client`
        insert into structured_memory_stores (patient_id, store_version, updated_at, record)
        values (
          ${store.patientId}, ${store.storeVersion}, ${store.updatedAt},
          ${json(store)}::text::jsonb
        )
        on conflict (patient_id) do nothing
        returning record
      `;
      if (inserted.length > 0) return;
      const current = await this.getStore(store.patientId);
      if (current && JSON.stringify(current) === JSON.stringify(store)) return;
      throw new StructuredMemoryRepositoryConflictError(store.patientId);
    }
    const updated = await this.client`
      update structured_memory_stores set
        store_version = ${store.storeVersion}, updated_at = ${store.updatedAt},
        record = ${json(store)}::text::jsonb
      where patient_id = ${store.patientId} and store_version = ${expectedStoreVersion}
      returning record
    `;
    if (updated.length === 0) {
      throw new StructuredMemoryRepositoryConflictError(store.patientId);
    }
  }
}

export class PostgresCareActionRepository implements CareActionRepository {
  constructor(private readonly client: Client) {}

  async setAuthority(authorityValue: CareActionAuthority): Promise<void> {
    const authority = CareActionAuthoritySchema.parse(authorityValue);
    await this.client`
      insert into synthetic_care_action_authorities (
        round_id, patient_id, round_version, updated_at, record
      ) values (
        ${authority.roundId}, ${authority.patientId}, ${authority.roundVersion},
        ${authority.evidence?.generatedAt ?? new Date(0).toISOString()},
        ${json(authority)}::text::jsonb
      )
      on conflict (round_id) do update set
        patient_id = excluded.patient_id,
        round_version = excluded.round_version,
        updated_at = excluded.updated_at,
        record = excluded.record
      where excluded.round_version >= synthetic_care_action_authorities.round_version
    `;
  }

  async getAuthority(roundId: string): Promise<CareActionAuthority | null> {
    return recordFrom(
      await this.client`
        select record from synthetic_care_action_authorities where round_id = ${roundId} limit 1
      `,
      CareActionAuthoritySchema
    );
  }

  async getAction(actionId: string): Promise<SyntheticCareAction | null> {
    return recordFrom(
      await this
        .client`select record from synthetic_care_actions where action_id = ${actionId} limit 1`,
      SyntheticCareActionSchema
    );
  }

  async getActionByIdempotencyKey(idempotencyKey: string): Promise<SyntheticCareAction | null> {
    return recordFrom(
      await this.client`
        select record from synthetic_care_actions
        where idempotency_key = ${idempotencyKey} limit 1
      `,
      SyntheticCareActionSchema
    );
  }

  async listActionsForRound(roundId: string): Promise<SyntheticCareAction[]> {
    const rows = await this.client`
      select record from synthetic_care_actions
      where round_id = ${roundId} order by updated_at desc, action_id asc
    `;
    return rows.map((row) =>
      SyntheticCareActionSchema.parse(StoredRecordRowSchema.parse(row).record)
    );
  }

  async listAuditEvents(actionId: string): Promise<CareActionAuditEvent[]> {
    const rows = await this.client`
      select record from synthetic_care_action_events
      where action_id = ${actionId} order by occurred_at asc, event_id asc
    `;
    return rows.map((row) =>
      CareActionAuditEventSchema.parse(StoredRecordRowSchema.parse(row).record)
    );
  }

  async getMutationReceipt(operationKey: string): Promise<CareActionMutationReceipt | null> {
    return recordFrom(
      await this.client`
        select record from synthetic_care_action_mutations
        where operation_key = ${operationKey} limit 1
      `,
      CareActionMutationReceiptSchema
    );
  }

  async createConfirmedAction(
    input: CreateConfirmedCareActionInput
  ): Promise<CareActionSubmissionReceipt> {
    const action = SyntheticCareActionSchema.parse(input.action);
    const event = CareActionAuditEventSchema.parse(input.event);
    return this.client.begin(async (transaction) => {
      await transaction`select pg_advisory_xact_lock(hashtextextended(${action.roundId}, 0))`;
      const authority = recordFrom(
        await transaction`
          select record from synthetic_care_action_authorities
          where round_id = ${action.roundId} for update
        `,
        CareActionAuthoritySchema
      );
      if (!authority) throw new CareActionRepositoryError("round_not_found");
      if (authority.roundVersion !== input.expectedRoundVersion) {
        throw new CareActionRepositoryError("stale_round");
      }
      const existing = recordFrom(
        await transaction`
          select record from synthetic_care_actions
          where idempotency_key = ${action.idempotencyKey} limit 1
        `,
        SyntheticCareActionSchema
      );
      if (existing) {
        if (existing.kind !== action.kind || existing.patientId !== action.patientId) {
          throw new CareActionRepositoryError("operation_conflict");
        }
        const duplicateEvent = CareActionAuditEventSchema.parse({
          ...input.duplicateEvent,
          actionId: existing.id,
          actionVersion: existing.version,
          status: existing.status
        });
        await this.insertEvent(transaction, duplicateEvent);
        return CareActionSubmissionReceiptSchema.parse({
          status: "persisted",
          created: false,
          action: existing,
          event: duplicateEvent,
          operationKey: duplicateEvent.operationKey,
          duplicateSuppressed: true
        });
      }
      await transaction`
        insert into synthetic_care_actions (
          action_id, round_id, patient_id, idempotency_key, kind, status,
          action_version, updated_at, record
        ) values (
          ${action.id}, ${action.roundId}, ${action.patientId}, ${action.idempotencyKey},
          ${action.kind}, ${action.status}, ${action.version}, ${action.updatedAt},
          ${json(action)}::text::jsonb
        )
      `;
      await this.insertEvent(transaction, event);
      return CareActionSubmissionReceiptSchema.parse({
        status: "persisted",
        created: true,
        action,
        event,
        operationKey: event.operationKey,
        duplicateSuppressed: false
      });
    });
  }

  async persistMutation(input: PersistCareActionMutationInput): Promise<CareActionMutationReceipt> {
    const previous = SyntheticCareActionSchema.parse(input.previous);
    const next = SyntheticCareActionSchema.parse(input.next);
    const event = CareActionAuditEventSchema.parse(input.event);
    return this.client.begin(async (transaction) => {
      await transaction`select pg_advisory_xact_lock(hashtextextended(${previous.id}, 0))`;
      const replay = recordFrom(
        await transaction`
          select record from synthetic_care_action_mutations
          where operation_key = ${input.operationKey} limit 1
        `,
        CareActionMutationReceiptSchema
      );
      if (replay) {
        return CareActionMutationReceiptSchema.parse({ ...replay, duplicateSuppressed: true });
      }
      const current = recordFrom(
        await transaction`
          select record from synthetic_care_actions
          where action_id = ${previous.id} for update
        `,
        SyntheticCareActionSchema
      );
      if (!current) throw new CareActionRepositoryError("operation_conflict");
      if (current.version !== previous.version || current.updatedAt !== previous.updatedAt) {
        throw new CareActionRepositoryError("stale_action");
      }
      if (next.id !== current.id || next.version !== current.version + 1) {
        throw new CareActionRepositoryError("operation_conflict");
      }
      const updated = await transaction`
        update synthetic_care_actions set
          status = ${next.status}, action_version = ${next.version},
          updated_at = ${next.updatedAt}, record = ${json(next)}::text::jsonb
        where action_id = ${next.id} and action_version = ${current.version}
        returning action_id
      `;
      if (updated.length === 0) throw new CareActionRepositoryError("stale_action");
      await this.insertEvent(transaction, event);
      const receipt = CareActionMutationReceiptSchema.parse({
        status: "persisted",
        action: next,
        event,
        operationKey: input.operationKey,
        duplicateSuppressed: false
      });
      await transaction`
        insert into synthetic_care_action_mutations (
          operation_key, action_id, committed_at, record
        ) values (
          ${input.operationKey}, ${next.id}, ${event.occurredAt}, ${json(receipt)}::text::jsonb
        )
      `;
      return receipt;
    });
  }

  private async insertEvent(transaction: Transaction, event: CareActionAuditEvent): Promise<void> {
    await transaction`
      insert into synthetic_care_action_events (
        event_id, action_id, round_id, operation_key, occurred_at, record
      ) values (
        ${event.eventId}, ${event.actionId}, ${event.roundId}, ${event.operationKey},
        ${event.occurredAt}, ${json(event)}::text::jsonb
      )
    `;
  }
}

export type FinalPassPostgresRepositories = {
  triggerProposals: PostgresTriggerProposalRepository;
  structuredMemory: PostgresStructuredMemoryRepository;
  careActions: PostgresCareActionRepository;
  close(): Promise<void>;
};

export function connectFinalPassPostgresRepositories(
  databaseUrl: string
): FinalPassPostgresRepositories {
  z.string().url().parse(databaseUrl);
  const client = postgres(databaseUrl, {
    max: 4,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: true
  });
  return {
    triggerProposals: new PostgresTriggerProposalRepository(client),
    structuredMemory: new PostgresStructuredMemoryRepository(client),
    careActions: new PostgresCareActionRepository(client),
    close: async () => client.end({ timeout: 5 })
  };
}
