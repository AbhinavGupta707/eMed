import { CompanionServiceError } from "./errors";
import type {
  CompanionExchangeCommit,
  CompanionExchangeCommitResult,
  CompanionPairingReplacementCommit,
  CompanionPairingRepository,
  CompanionSessionMutationCommit,
  CompanionSessionMutationCommitResult
} from "./ports";
import {
  CompanionOperationRecordSchema,
  CompanionPairingRecordSchema,
  CompanionResultRecordSchema,
  CompanionSessionRecordSchema,
  type CompanionOperationRecord,
  type CompanionPairingRecord,
  type CompanionResultRecord,
  type CompanionSessionRecord
} from "./records";

export class InMemoryCompanionPairingRepository implements CompanionPairingRepository {
  readonly #pairings = new Map<string, CompanionPairingRecord>();
  readonly #pairingIdByTokenHash = new Map<string, string>();
  readonly #sessions = new Map<string, CompanionSessionRecord>();
  readonly #sessionIdByTokenHash = new Map<string, string>();
  readonly #operations = new Map<string, CompanionOperationRecord>();
  readonly #results = new Map<string, CompanionResultRecord>();

  async createPairing(pairingInput: CompanionPairingRecord): Promise<void> {
    const pairing = CompanionPairingRecordSchema.parse(pairingInput);
    const currentForRound = [...this.#pairings.values()].find(
      (candidate) => candidate.roundId === pairing.roundId && candidate.status !== "revoked"
    );
    if (
      currentForRound ||
      this.#pairings.has(pairing.pairingId) ||
      this.#pairingIdByTokenHash.has(pairing.tokenHash)
    ) {
      throw new CompanionServiceError("repository_conflict", true);
    }
    this.#pairings.set(pairing.pairingId, structuredClone(pairing));
    this.#pairingIdByTokenHash.set(pairing.tokenHash, pairing.pairingId);
  }

  async getPairing(pairingId: string): Promise<CompanionPairingRecord | null> {
    const pairing = this.#pairings.get(pairingId);
    return pairing ? structuredClone(pairing) : null;
  }

  async getCurrentPairingForRound(roundId: string): Promise<CompanionPairingRecord | null> {
    const pairing = [...this.#pairings.values()]
      .filter((candidate) => candidate.roundId === roundId && candidate.status !== "revoked")
      .toSorted(
        (left, right) =>
          right.issuedAt.localeCompare(left.issuedAt) ||
          right.pairingId.localeCompare(left.pairingId)
      )[0];
    return pairing ? structuredClone(pairing) : null;
  }

  async getPairingByTokenHash(tokenHash: string): Promise<CompanionPairingRecord | null> {
    const pairingId = this.#pairingIdByTokenHash.get(tokenHash);
    return pairingId ? this.getPairing(pairingId) : null;
  }

  async exchange(commit: CompanionExchangeCommit): Promise<CompanionExchangeCommitResult> {
    const pairingId = this.#pairingIdByTokenHash.get(commit.tokenHash);
    const current = pairingId ? this.#pairings.get(pairingId) : undefined;
    if (!current) throw new CompanionServiceError("token_invalid", false);

    if (current.status === "active") {
      const replayAllowed =
        current.exchangeKeyHash === commit.exchangeKeyHash &&
        current.deviceBindingHash === commit.deviceBindingHash &&
        current.exchangeReplayUntil !== null &&
        Date.parse(commit.exchangedAt) <= Date.parse(current.exchangeReplayUntil);
      const existingSession = current.sessionId ? this.#sessions.get(current.sessionId) : undefined;
      if (!replayAllowed || !existingSession) {
        throw new CompanionServiceError("token_used", false);
      }
      return {
        pairing: structuredClone(current),
        session: structuredClone(existingSession),
        replayed: true
      };
    }
    if (current.status === "revoked" || current.status === "completed") {
      throw new CompanionServiceError("revoked", false);
    }
    if (current.pairingVersion !== commit.expectedPairingVersion) {
      throw new CompanionServiceError("stale_version", true);
    }

    const session = CompanionSessionRecordSchema.parse(commit.session);
    if (
      session.pairingId !== current.pairingId ||
      session.roundId !== current.roundId ||
      this.#sessions.has(session.sessionId) ||
      this.#sessionIdByTokenHash.has(session.sessionTokenHash)
    ) {
      throw new CompanionServiceError("repository_conflict", true);
    }
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
    this.#sessions.set(session.sessionId, structuredClone(session));
    this.#sessionIdByTokenHash.set(session.sessionTokenHash, session.sessionId);
    this.#pairings.set(pairing.pairingId, structuredClone(pairing));
    return {
      pairing: structuredClone(pairing),
      session: structuredClone(session),
      replayed: false
    };
  }

  async getSession(sessionId: string): Promise<CompanionSessionRecord | null> {
    const session = this.#sessions.get(sessionId);
    return session ? structuredClone(session) : null;
  }

  async getSessionByTokenHash(tokenHash: string): Promise<CompanionSessionRecord | null> {
    const sessionId = this.#sessionIdByTokenHash.get(tokenHash);
    return sessionId ? this.getSession(sessionId) : null;
  }

  async getOperation(
    sessionId: string,
    operationId: string
  ): Promise<CompanionOperationRecord | null> {
    const operation = this.#operations.get(`${sessionId}\u001f${operationId}`);
    return operation ? structuredClone(operation) : null;
  }

  async getResult(resultId: string): Promise<CompanionResultRecord | null> {
    const result = this.#results.get(resultId);
    return result ? structuredClone(result) : null;
  }

  async commitSessionMutation(
    commit: CompanionSessionMutationCommit
  ): Promise<CompanionSessionMutationCommitResult> {
    const nextSession = CompanionSessionRecordSchema.parse(commit.nextSession);
    const operation = CompanionOperationRecordSchema.parse(commit.operation);
    const result = commit.result ? CompanionResultRecordSchema.parse(commit.result) : null;
    const operationKey = `${nextSession.sessionId}\u001f${operation.operationId}`;
    const existingOperation = this.#operations.get(operationKey);
    if (existingOperation) {
      if (existingOperation.requestFingerprint !== operation.requestFingerprint) {
        throw new CompanionServiceError("idempotency_conflict", false);
      }
      const existingSession = this.#sessions.get(nextSession.sessionId);
      const existingResult = existingOperation.resultId
        ? this.#results.get(existingOperation.resultId)
        : undefined;
      if (!existingSession) throw new CompanionServiceError("repository_conflict", true);
      return {
        session: structuredClone(existingSession),
        operation: structuredClone(existingOperation),
        result: existingResult ? structuredClone(existingResult) : null,
        replayed: true
      };
    }

    const current = this.#sessions.get(nextSession.sessionId);
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
    const pairing = this.#pairings.get(current.pairingId);
    if (!pairing || pairing.status !== "active") {
      throw new CompanionServiceError("revoked", false);
    }
    if (result) {
      if (
        result.sessionId !== current.sessionId ||
        result.pairingId !== current.pairingId ||
        operation.resultId !== result.resultId ||
        this.#results.has(result.resultId)
      ) {
        throw new CompanionServiceError("repository_conflict", false);
      }
      this.#results.set(result.resultId, structuredClone(result));
    }
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
    this.#sessions.set(nextSession.sessionId, structuredClone(nextSession));
    this.#operations.set(operationKey, structuredClone(operation));
    this.#pairings.set(pairing.pairingId, structuredClone(nextPairing));
    return {
      session: structuredClone(nextSession),
      operation: structuredClone(operation),
      result: result ? structuredClone(result) : null,
      replayed: false
    };
  }

  async revokePairing(input: {
    pairingId: string;
    expectedPairingVersion: number;
    revokedAt: string;
  }): Promise<CompanionPairingRecord> {
    const current = this.#pairings.get(input.pairingId);
    if (!current) throw new CompanionServiceError("pairing_not_found", false);
    if (current.pairingVersion !== input.expectedPairingVersion) {
      throw new CompanionServiceError("stale_version", true);
    }
    if (current.status === "revoked") return structuredClone(current);
    const revoked = CompanionPairingRecordSchema.parse({
      ...current,
      status: "revoked",
      pairingVersion: current.pairingVersion + 1,
      revokedAt: input.revokedAt
    });
    if (current.sessionId) {
      const session = this.#sessions.get(current.sessionId);
      if (session) {
        this.#sessions.set(
          session.sessionId,
          CompanionSessionRecordSchema.parse({
            ...session,
            status: "revoked",
            sessionVersion: session.sessionVersion + 1,
            revokedAt: input.revokedAt,
            lastSeenAt: input.revokedAt
          })
        );
      }
    }
    this.#pairings.set(revoked.pairingId, structuredClone(revoked));
    return structuredClone(revoked);
  }

  async replacePairing(commit: CompanionPairingReplacementCommit): Promise<CompanionPairingRecord> {
    const current = this.#pairings.get(commit.priorPairingId);
    if (!current) throw new CompanionServiceError("pairing_not_found", false);
    if (current.pairingVersion !== commit.expectedPairingVersion) {
      throw new CompanionServiceError("stale_version", true);
    }
    const replacement = CompanionPairingRecordSchema.parse(commit.replacement);
    if (
      replacement.roundId !== current.roundId ||
      replacement.ownerPatientId !== current.ownerPatientId ||
      this.#pairings.has(replacement.pairingId) ||
      this.#pairingIdByTokenHash.has(replacement.tokenHash)
    ) {
      throw new CompanionServiceError("repository_conflict", false);
    }
    await this.revokePairing({
      pairingId: current.pairingId,
      expectedPairingVersion: current.pairingVersion,
      revokedAt: commit.revokedAt
    });
    const revoked = this.#pairings.get(current.pairingId);
    if (!revoked) throw new CompanionServiceError("repository_conflict", true);
    this.#pairings.set(
      revoked.pairingId,
      CompanionPairingRecordSchema.parse({
        ...revoked,
        replacedByPairingId: replacement.pairingId
      })
    );
    this.#pairings.set(replacement.pairingId, structuredClone(replacement));
    this.#pairingIdByTokenHash.set(replacement.tokenHash, replacement.pairingId);
    return structuredClone(replacement);
  }
}
