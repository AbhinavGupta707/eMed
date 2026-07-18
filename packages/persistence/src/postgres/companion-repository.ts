import {
  CompanionOperationRecordSchema,
  CompanionPairingRecordSchema,
  CompanionResultRecordSchema,
  CompanionServiceError,
  CompanionSessionRecordSchema,
  type CompanionExchangeCommit,
  type CompanionExchangeCommitResult,
  type CompanionOperationRecord,
  type CompanionPairingRecord,
  type CompanionPairingReplacementCommit,
  type CompanionPairingRepository,
  type CompanionResultRecord,
  type CompanionSessionMutationCommit,
  type CompanionSessionMutationCommitResult,
  type CompanionSessionRecord
} from "@homerounds/companion";
import postgres from "postgres";
import { z } from "zod";

type Client = ReturnType<typeof postgres>;

const StoredRecordRowSchema = z.object({ record: z.unknown() }).passthrough();

function recordFrom<T>(rows: readonly unknown[], schema: z.ZodType<T>): T | null {
  const row = rows[0];
  if (!row) return null;
  return schema.parse(StoredRecordRowSchema.parse(row).record);
}

function databaseCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

async function mapDatabaseConflict<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error: unknown) {
    if (["23503", "23505", "23514"].includes(databaseCode(error) ?? "")) {
      throw new CompanionServiceError("repository_conflict", true);
    }
    throw error;
  }
}

function recordJson(
  record:
    | CompanionPairingRecord
    | CompanionSessionRecord
    | CompanionResultRecord
    | CompanionOperationRecord
): string {
  return JSON.stringify(record);
}

export class PostgresCompanionPairingRepository implements CompanionPairingRepository {
  constructor(private readonly client: Client) {}

  async createPairing(pairingInput: CompanionPairingRecord): Promise<void> {
    const pairing = CompanionPairingRecordSchema.parse(pairingInput);
    await mapDatabaseConflict(async () => {
      await this.client`
        insert into companion_pairings (
          pairing_id, token_hash, round_id, status, pairing_version, session_id, issued_at, record
        ) values (
          ${pairing.pairingId}, ${pairing.tokenHash}, ${pairing.roundId}, ${pairing.status},
          ${pairing.pairingVersion}, ${pairing.sessionId}, ${pairing.issuedAt},
          ${recordJson(pairing)}::text::jsonb
        )
      `;
    });
  }

  async getPairing(pairingId: string): Promise<CompanionPairingRecord | null> {
    return recordFrom(
      await this
        .client`select record from companion_pairings where pairing_id = ${pairingId} limit 1`,
      CompanionPairingRecordSchema
    );
  }

  async getCurrentPairingForRound(roundId: string): Promise<CompanionPairingRecord | null> {
    return recordFrom(
      await this.client`
        select record from companion_pairings
        where round_id = ${roundId} and status <> 'revoked'
        order by issued_at desc, pairing_id desc limit 1
      `,
      CompanionPairingRecordSchema
    );
  }

  async getPairingByTokenHash(tokenHash: string): Promise<CompanionPairingRecord | null> {
    return recordFrom(
      await this
        .client`select record from companion_pairings where token_hash = ${tokenHash} limit 1`,
      CompanionPairingRecordSchema
    );
  }

  async exchange(commit: CompanionExchangeCommit): Promise<CompanionExchangeCommitResult> {
    return mapDatabaseConflict(() =>
      this.client.begin(async (transaction) => {
        const current = recordFrom(
          await transaction`
            select record from companion_pairings where token_hash = ${commit.tokenHash} for update
          `,
          CompanionPairingRecordSchema
        );
        if (!current) throw new CompanionServiceError("token_invalid", false);
        if (current.status === "active") {
          const replayAllowed =
            current.exchangeKeyHash === commit.exchangeKeyHash &&
            current.deviceBindingHash === commit.deviceBindingHash &&
            current.exchangeReplayUntil !== null &&
            Date.parse(commit.exchangedAt) <= Date.parse(current.exchangeReplayUntil);
          const existingSession = current.sessionId
            ? recordFrom(
                await transaction`
                  select record from companion_sessions where session_id = ${current.sessionId} limit 1
                `,
                CompanionSessionRecordSchema
              )
            : null;
          if (!replayAllowed || !existingSession) {
            throw new CompanionServiceError("token_used", false);
          }
          return { pairing: current, session: existingSession, replayed: true };
        }
        if (current.status === "revoked" || current.status === "completed") {
          throw new CompanionServiceError("revoked", false);
        }
        if (current.pairingVersion !== commit.expectedPairingVersion) {
          throw new CompanionServiceError("stale_version", true);
        }
        const session = CompanionSessionRecordSchema.parse(commit.session);
        if (session.pairingId !== current.pairingId || session.roundId !== current.roundId) {
          throw new CompanionServiceError("repository_conflict", false);
        }
        await transaction`
          insert into companion_sessions (
            session_id, session_token_hash, pairing_id, round_id, status, session_version,
            expires_at, record
          ) values (
            ${session.sessionId}, ${session.sessionTokenHash}, ${session.pairingId},
            ${session.roundId}, ${session.status}, ${session.sessionVersion}, ${session.expiresAt},
            ${recordJson(session)}::text::jsonb
          )
        `;
        const pairing = CompanionPairingRecordSchema.parse({
          ...current,
          status: "active",
          pairingVersion: current.pairingVersion + 1,
          exchangedAt: commit.exchangedAt,
          exchangeReplayUntil: commit.exchangeReplayUntil,
          exchangeKeyHash: commit.exchangeKeyHash,
          deviceBindingHash: commit.deviceBindingHash,
          sessionId: session.sessionId,
          sessionExpiresAt: session.expiresAt
        });
        const updated = await transaction`
          update companion_pairings set
            status = ${pairing.status}, pairing_version = ${pairing.pairingVersion},
            session_id = ${pairing.sessionId}, record = ${recordJson(pairing)}::text::jsonb
          where pairing_id = ${pairing.pairingId}
            and pairing_version = ${commit.expectedPairingVersion} and status = 'pending'
          returning record
        `;
        if (!recordFrom(updated, CompanionPairingRecordSchema)) {
          throw new CompanionServiceError("stale_version", true);
        }
        return { pairing, session, replayed: false };
      })
    );
  }

  async getSession(sessionId: string): Promise<CompanionSessionRecord | null> {
    return recordFrom(
      await this
        .client`select record from companion_sessions where session_id = ${sessionId} limit 1`,
      CompanionSessionRecordSchema
    );
  }

  async getSessionByTokenHash(tokenHash: string): Promise<CompanionSessionRecord | null> {
    return recordFrom(
      await this.client`
        select record from companion_sessions where session_token_hash = ${tokenHash} limit 1
      `,
      CompanionSessionRecordSchema
    );
  }

  async getOperation(
    sessionId: string,
    operationId: string
  ): Promise<CompanionOperationRecord | null> {
    return recordFrom(
      await this.client`
        select record from companion_operations
        where session_id = ${sessionId} and operation_id = ${operationId} limit 1
      `,
      CompanionOperationRecordSchema
    );
  }

  async getResult(resultId: string): Promise<CompanionResultRecord | null> {
    return recordFrom(
      await this.client`select record from companion_results where result_id = ${resultId} limit 1`,
      CompanionResultRecordSchema
    );
  }

  async commitSessionMutation(
    commit: CompanionSessionMutationCommit
  ): Promise<CompanionSessionMutationCommitResult> {
    const nextSession = CompanionSessionRecordSchema.parse(commit.nextSession);
    const operation = CompanionOperationRecordSchema.parse(commit.operation);
    const result = commit.result ? CompanionResultRecordSchema.parse(commit.result) : null;
    return mapDatabaseConflict(() =>
      this.client.begin(async (transaction) => {
        await transaction`
          select pg_advisory_xact_lock(hashtextextended(${nextSession.sessionId}, 0))
        `;
        const existingOperation = recordFrom(
          await transaction`
            select record from companion_operations
            where session_id = ${nextSession.sessionId}
              and operation_id = ${operation.operationId} limit 1
          `,
          CompanionOperationRecordSchema
        );
        if (existingOperation) {
          if (existingOperation.requestFingerprint !== operation.requestFingerprint) {
            throw new CompanionServiceError("idempotency_conflict", false);
          }
          const existingSession = recordFrom(
            await transaction`
              select record from companion_sessions where session_id = ${nextSession.sessionId} limit 1
            `,
            CompanionSessionRecordSchema
          );
          if (!existingSession) throw new CompanionServiceError("repository_conflict", true);
          const existingResult = existingOperation.resultId
            ? recordFrom(
                await transaction`
                  select record from companion_results
                  where result_id = ${existingOperation.resultId} limit 1
                `,
                CompanionResultRecordSchema
              )
            : null;
          return {
            session: existingSession,
            operation: existingOperation,
            result: existingResult,
            replayed: true
          };
        }
        const current = recordFrom(
          await transaction`
            select record from companion_sessions
            where session_id = ${nextSession.sessionId} for update
          `,
          CompanionSessionRecordSchema
        );
        if (!current || current.sessionVersion !== commit.expectedSessionVersion) {
          throw new CompanionServiceError("stale_version", true);
        }
        if (
          nextSession.sessionVersion !== current.sessionVersion + 1 ||
          nextSession.pairingId !== current.pairingId ||
          nextSession.roundId !== current.roundId ||
          operation.sessionId !== current.sessionId ||
          operation.committedSessionVersion !== nextSession.sessionVersion
        ) {
          throw new CompanionServiceError("repository_conflict", false);
        }
        const pairing = recordFrom(
          await transaction`
            select record from companion_pairings
            where pairing_id = ${current.pairingId} for update
          `,
          CompanionPairingRecordSchema
        );
        if (!pairing || pairing.status !== "active") {
          throw new CompanionServiceError("revoked", false);
        }
        if (result) {
          if (
            result.sessionId !== current.sessionId ||
            result.pairingId !== current.pairingId ||
            operation.resultId !== result.resultId
          ) {
            throw new CompanionServiceError("repository_conflict", false);
          }
          await transaction`
            insert into companion_results (
              result_id, pairing_id, session_id, round_id, received_at, validation_status, record
            ) values (
              ${result.resultId}, ${result.pairingId}, ${result.sessionId}, ${result.roundId},
              ${result.receivedAt}, ${result.validationStatus}, ${recordJson(result)}::text::jsonb
            )
          `;
        }
        await transaction`
          update companion_sessions set
            status = ${nextSession.status}, session_version = ${nextSession.sessionVersion},
            expires_at = ${nextSession.expiresAt}, record = ${recordJson(nextSession)}::text::jsonb
          where session_id = ${nextSession.sessionId}
            and session_version = ${commit.expectedSessionVersion}
        `;
        await transaction`
          insert into companion_operations (
            session_id, operation_id, kind, request_fingerprint, committed_session_version,
            result_id, occurred_at, record
          ) values (
            ${operation.sessionId}, ${operation.operationId}, ${operation.kind},
            ${operation.requestFingerprint}, ${operation.committedSessionVersion},
            ${operation.resultId}, ${operation.occurredAt}, ${recordJson(operation)}::text::jsonb
          )
        `;
        const nextPairing = CompanionPairingRecordSchema.parse({
          ...pairing,
          pairingVersion: pairing.pairingVersion + 1,
          taskPhase: nextSession.taskPhase,
          lastResult: nextSession.lastResult,
          status: nextSession.status === "completed" ? "completed" : pairing.status,
          desktopAcknowledgedAt:
            nextSession.taskPhase === "desktop_acknowledged"
              ? operation.occurredAt
              : pairing.desktopAcknowledgedAt
        });
        await transaction`
          update companion_pairings set
            status = ${nextPairing.status}, pairing_version = ${nextPairing.pairingVersion},
            record = ${recordJson(nextPairing)}::text::jsonb
          where pairing_id = ${nextPairing.pairingId}
        `;
        return { session: nextSession, operation, result, replayed: false };
      })
    );
  }

  async revokePairing(input: {
    pairingId: string;
    expectedPairingVersion: number;
    revokedAt: string;
  }): Promise<CompanionPairingRecord> {
    return mapDatabaseConflict(() =>
      this.client.begin(async (transaction) => {
        const current = recordFrom(
          await transaction`
            select record from companion_pairings where pairing_id = ${input.pairingId} for update
          `,
          CompanionPairingRecordSchema
        );
        if (!current) throw new CompanionServiceError("pairing_not_found", false);
        if (current.pairingVersion !== input.expectedPairingVersion) {
          throw new CompanionServiceError("stale_version", true);
        }
        if (current.status === "revoked") return current;
        const revoked = CompanionPairingRecordSchema.parse({
          ...current,
          status: "revoked",
          pairingVersion: current.pairingVersion + 1,
          revokedAt: input.revokedAt
        });
        if (current.sessionId) {
          const session = recordFrom(
            await transaction`
              select record from companion_sessions where session_id = ${current.sessionId} for update
            `,
            CompanionSessionRecordSchema
          );
          if (session) {
            const revokedSession = CompanionSessionRecordSchema.parse({
              ...session,
              status: "revoked",
              sessionVersion: session.sessionVersion + 1,
              revokedAt: input.revokedAt,
              lastSeenAt: input.revokedAt
            });
            await transaction`
              update companion_sessions set
                status = ${revokedSession.status},
                session_version = ${revokedSession.sessionVersion},
                record = ${recordJson(revokedSession)}::text::jsonb
              where session_id = ${revokedSession.sessionId}
            `;
          }
        }
        await transaction`
          update companion_pairings set
            status = ${revoked.status}, pairing_version = ${revoked.pairingVersion},
            record = ${recordJson(revoked)}::text::jsonb
          where pairing_id = ${revoked.pairingId}
        `;
        return revoked;
      })
    );
  }

  async replacePairing(commit: CompanionPairingReplacementCommit): Promise<CompanionPairingRecord> {
    const replacement = CompanionPairingRecordSchema.parse(commit.replacement);
    return mapDatabaseConflict(() =>
      this.client.begin(async (transaction) => {
        const current = recordFrom(
          await transaction`
            select record from companion_pairings
            where pairing_id = ${commit.priorPairingId} for update
          `,
          CompanionPairingRecordSchema
        );
        if (!current) throw new CompanionServiceError("pairing_not_found", false);
        if (current.pairingVersion !== commit.expectedPairingVersion) {
          throw new CompanionServiceError("stale_version", true);
        }
        if (
          replacement.roundId !== current.roundId ||
          replacement.ownerPatientId !== current.ownerPatientId
        ) {
          throw new CompanionServiceError("repository_conflict", false);
        }
        const revoked = CompanionPairingRecordSchema.parse({
          ...current,
          status: "revoked",
          pairingVersion: current.pairingVersion + 1,
          revokedAt: commit.revokedAt,
          replacedByPairingId: replacement.pairingId
        });
        if (current.sessionId) {
          const session = recordFrom(
            await transaction`
              select record from companion_sessions where session_id = ${current.sessionId} for update
            `,
            CompanionSessionRecordSchema
          );
          if (session) {
            const revokedSession = CompanionSessionRecordSchema.parse({
              ...session,
              status: "revoked",
              sessionVersion: session.sessionVersion + 1,
              revokedAt: commit.revokedAt,
              lastSeenAt: commit.revokedAt
            });
            await transaction`
              update companion_sessions set
                status = ${revokedSession.status},
                session_version = ${revokedSession.sessionVersion},
                record = ${recordJson(revokedSession)}::text::jsonb
              where session_id = ${revokedSession.sessionId}
            `;
          }
        }
        await transaction`
          update companion_pairings set
            status = ${revoked.status}, pairing_version = ${revoked.pairingVersion},
            record = ${recordJson(revoked)}::text::jsonb
          where pairing_id = ${revoked.pairingId}
        `;
        await transaction`
          insert into companion_pairings (
            pairing_id, token_hash, round_id, status, pairing_version, session_id, issued_at, record
          ) values (
            ${replacement.pairingId}, ${replacement.tokenHash}, ${replacement.roundId},
            ${replacement.status}, ${replacement.pairingVersion}, ${replacement.sessionId},
            ${replacement.issuedAt}, ${recordJson(replacement)}::text::jsonb
          )
        `;
        return replacement;
      })
    );
  }
}

export type PostgresCompanionRepositoryConnection = {
  repository: PostgresCompanionPairingRepository;
  close: () => Promise<void>;
};

export function connectPostgresCompanionRepository(
  databaseUrl: string
): PostgresCompanionRepositoryConnection {
  z.string().url().parse(databaseUrl);
  const client = postgres(databaseUrl, {
    max: 3,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: true
  });
  return {
    repository: new PostgresCompanionPairingRepository(client),
    close: async () => client.end({ timeout: 5 })
  };
}
