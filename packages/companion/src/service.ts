import { z } from "zod";

import { CompanionServiceError } from "./errors";
import type {
  CompanionClock,
  CompanionCryptoPort,
  CompanionIdSource,
  CompanionPairingRepository,
  CompanionRoundAuthorityPort,
  CompanionRoundAuthoritySnapshot
} from "./ports";
import { CompanionRoundAuthoritySnapshotSchema } from "./ports";
import {
  CompanionOperationRecordSchema,
  CompanionPairingRecordSchema,
  CompanionResultRecordSchema,
  CompanionSessionRecordSchema,
  type CompanionPairingRecord,
  type CompanionSessionRecord
} from "./records";
import {
  CompanionAcknowledgeRequestSchema,
  CompanionCreatePairingRequestSchema,
  CompanionDesktopSnapshotSchema,
  CompanionExchangeRequestSchema,
  CompanionPairingIssueSchema,
  CompanionPairingMutationRequestSchema,
  CompanionPairingTokenSchema,
  CompanionPhoneSnapshotSchema,
  CompanionResultReceiptSchema,
  CompanionSessionTokenSchema,
  CompanionStatusUpdateRequestSchema,
  CompanionTaskResultRequestSchema,
  type CompanionDesktopSnapshot,
  type CompanionPairingIssue,
  type CompanionPhoneSnapshot,
  type CompanionResultReceipt,
  type CompanionStatusUpdateRequest,
  type CompanionTaskPhase,
  type CompanionTaskResultRequest
} from "./schemas";

const CreatePairingInputSchema = CompanionCreatePairingRequestSchema.extend({
  patientId: z.string().min(1).max(120),
  createdBySessionId: z.string().min(1).max(120)
}).strict();

const PairingAccessInputSchema = z
  .object({ pairingId: z.uuid(), patientId: z.string().min(1).max(120) })
  .strict();

const CurrentPairingAccessInputSchema = z
  .object({ roundId: z.uuid(), patientId: z.string().min(1).max(120) })
  .strict();

const ExchangeInputSchema = CompanionExchangeRequestSchema.extend({
  deviceBinding: z.string().min(1).max(512)
}).strict();

const UpdateStatusInputSchema = CompanionStatusUpdateRequestSchema.extend({
  sessionToken: CompanionSessionTokenSchema
}).strict();

const SubmitResultInputSchema = z
  .object({
    sessionToken: CompanionSessionTokenSchema,
    result: CompanionTaskResultRequestSchema
  })
  .strict();

const PairingMutationInputSchema = CompanionPairingMutationRequestSchema.extend({
  pairingId: z.uuid(),
  patientId: z.string().min(1).max(120)
}).strict();

const AcknowledgeInputSchema = CompanionAcknowledgeRequestSchema.extend({
  pairingId: z.uuid(),
  patientId: z.string().min(1).max(120)
}).strict();

const PolicySchema = z
  .object({
    pairingTtlMs: z
      .number()
      .int()
      .min(30_000)
      .max(15 * 60_000),
    sessionTtlMs: z
      .number()
      .int()
      .min(60_000)
      .max(60 * 60_000),
    exchangeReplayMs: z.number().int().min(1_000).max(60_000)
  })
  .strict();

export type CompanionServicePolicy = z.infer<typeof PolicySchema>;

export type CompanionServiceDependencies = {
  repository: CompanionPairingRepository;
  authority: CompanionRoundAuthorityPort;
  clock: CompanionClock;
  ids: CompanionIdSource;
  crypto: CompanionCryptoPort;
  appBaseUrl: string;
  policy?: Partial<CompanionServicePolicy>;
};

export type CompanionExchangeResult = {
  sessionToken: string;
  snapshot: CompanionPhoneSnapshot;
  expiresAt: string;
  replayed: boolean;
};

const DEFAULT_POLICY: CompanionServicePolicy = {
  pairingTtlMs: 5 * 60_000,
  sessionTtlMs: 20 * 60_000,
  exchangeReplayMs: 30_000
};

const allowedPhaseTransitions: Readonly<Record<CompanionTaskPhase, readonly CompanionTaskPhase[]>> =
  {
    ready: ["permission", "guidance", "unavailable"],
    permission: ["guidance", "unavailable"],
    guidance: ["in_progress", "unavailable"],
    in_progress: ["retry", "unavailable"],
    retry: ["permission", "guidance", "in_progress", "unavailable"],
    unavailable: ["retry"],
    completed: [],
    desktop_acknowledged: []
  };

function isoAfter(now: string, milliseconds: number): string {
  return new Date(Date.parse(now) + milliseconds).toISOString();
}

function consentStateFor(pairing: CompanionPairingRecord) {
  return pairing.consentRequirement.kind === "none"
    ? ({ status: "not_required" } as const)
    : ({ status: "pending" } as const);
}

function sameTask(
  left: CompanionPairingRecord["task"],
  right: CompanionRoundAuthoritySnapshot["currentTask"]
): boolean {
  return right !== null && JSON.stringify(left) === JSON.stringify(right);
}

function assertOperationReplay(storedFingerprint: string, requestedFingerprint: string): void {
  if (storedFingerprint !== requestedFingerprint) {
    throw new CompanionServiceError("idempotency_conflict", false);
  }
}

export class CompanionService {
  readonly #repository: CompanionPairingRepository;
  readonly #authority: CompanionRoundAuthorityPort;
  readonly #clock: CompanionClock;
  readonly #ids: CompanionIdSource;
  readonly #crypto: CompanionCryptoPort;
  readonly #appBaseUrl: string;
  readonly #policy: CompanionServicePolicy;

  constructor(dependencies: CompanionServiceDependencies) {
    this.#repository = dependencies.repository;
    this.#authority = dependencies.authority;
    this.#clock = dependencies.clock;
    this.#ids = dependencies.ids;
    this.#crypto = dependencies.crypto;
    this.#appBaseUrl = z.url().parse(dependencies.appBaseUrl);
    this.#policy = PolicySchema.parse({ ...DEFAULT_POLICY, ...dependencies.policy });
  }

  async createPairing(
    inputValue: z.input<typeof CreatePairingInputSchema>
  ): Promise<CompanionPairingIssue> {
    const input = CreatePairingInputSchema.parse(inputValue);
    const authority = await this.#readPairableAuthority(input.roundId);
    if (authority.patientId !== input.patientId) {
      throw new CompanionServiceError("forbidden", false);
    }
    if (authority.roundStateVersion !== input.expectedRoundStateVersion) {
      throw new CompanionServiceError("stale_version", true);
    }
    const task = authority.currentTask;
    if (!task || !authority.allowedTaskKinds.includes(task.kind)) {
      throw new CompanionServiceError("invalid_task", false);
    }
    if (await this.#repository.getCurrentPairingForRound(authority.roundId)) {
      throw new CompanionServiceError("repository_conflict", true);
    }
    const issuedAt = this.#clock.now();
    const token = CompanionPairingTokenSchema.parse(this.#crypto.issuePairingToken());
    const pairing = CompanionPairingRecordSchema.parse({
      pairingId: this.#ids.createId(),
      tokenHash: this.#crypto.hashToken("pairing", token),
      roundId: authority.roundId,
      ownerPatientId: authority.patientId,
      role: "companion",
      roundStateVersion: authority.roundStateVersion,
      allowedTaskKinds: authority.allowedTaskKinds,
      task,
      taskPhase: "ready",
      consentRequirement: authority.consentRequirement,
      status: "pending",
      pairingVersion: 1,
      issuedAt,
      tokenExpiresAt: isoAfter(issuedAt, this.#policy.pairingTtlMs),
      exchangedAt: null,
      exchangeReplayUntil: null,
      exchangeKeyHash: null,
      deviceBindingHash: null,
      sessionId: null,
      sessionExpiresAt: null,
      lastResult: null,
      desktopAcknowledgedAt: null,
      revokedAt: null,
      replacedByPairingId: null
    });
    await this.#repository.createPairing(pairing);
    return this.#issueFor(pairing, token);
  }

  async exchange(
    inputValue: z.input<typeof ExchangeInputSchema>
  ): Promise<CompanionExchangeResult> {
    const input = ExchangeInputSchema.parse(inputValue);
    const now = this.#clock.now();
    const tokenHash = this.#crypto.hashToken("pairing", input.token);
    const pairing = await this.#repository.getPairingByTokenHash(tokenHash);
    if (!pairing) throw new CompanionServiceError("token_invalid", false);
    if (Date.parse(pairing.tokenExpiresAt) <= Date.parse(now)) {
      throw new CompanionServiceError("token_expired", false);
    }
    await this.#assertPairingAuthority(pairing);

    const sessionId = this.#ids.createId();
    const candidateSessionToken = CompanionSessionTokenSchema.parse(
      this.#crypto.deriveSessionToken(sessionId)
    );
    const session = CompanionSessionRecordSchema.parse({
      sessionId,
      sessionTokenHash: this.#crypto.hashToken("session", candidateSessionToken),
      pairingId: pairing.pairingId,
      roundId: pairing.roundId,
      role: "companion",
      roundStateVersion: pairing.roundStateVersion,
      allowedTaskKinds: pairing.allowedTaskKinds,
      task: pairing.task,
      taskPhase: pairing.taskPhase,
      consentRequirement: pairing.consentRequirement,
      consentState: consentStateFor(pairing),
      sessionVersion: 1,
      status: "active",
      createdAt: now,
      expiresAt: isoAfter(now, this.#policy.sessionTtlMs),
      lastSeenAt: now,
      lastResult: null,
      revokedAt: null
    });
    const committed = await this.#repository.exchange({
      tokenHash,
      expectedPairingVersion: pairing.pairingVersion,
      exchangeKeyHash: this.#crypto.hashValue("exchange", input.exchangeIdempotencyKey),
      deviceBindingHash: this.#crypto.hashValue("device", input.deviceBinding),
      exchangedAt: now,
      exchangeReplayUntil: isoAfter(now, this.#policy.exchangeReplayMs),
      session
    });
    const sessionToken = CompanionSessionTokenSchema.parse(
      this.#crypto.deriveSessionToken(committed.session.sessionId)
    );
    if (this.#crypto.hashToken("session", sessionToken) !== committed.session.sessionTokenHash) {
      throw new CompanionServiceError("repository_conflict", false);
    }
    return {
      sessionToken,
      snapshot: this.#phoneSnapshot(committed.session, now),
      expiresAt: committed.session.expiresAt,
      replayed: committed.replayed
    };
  }

  async getPhoneSnapshot(sessionTokenValue: string): Promise<CompanionPhoneSnapshot> {
    const session = await this.#authenticateSession(sessionTokenValue);
    return this.#phoneSnapshot(session, this.#clock.now());
  }

  async updateStatus(
    inputValue: z.input<typeof UpdateStatusInputSchema>
  ): Promise<CompanionPhoneSnapshot> {
    const input = UpdateStatusInputSchema.parse(inputValue);
    const request = CompanionStatusUpdateRequestSchema.parse({
      operationId: input.operationId,
      expectedSessionVersion: input.expectedSessionVersion,
      taskId: input.taskId,
      taskKind: input.taskKind,
      phase: input.phase,
      ...(input.consent ? { consent: input.consent } : {})
    });
    const session = await this.#authenticateSession(input.sessionToken);
    const fingerprint = this.#crypto.fingerprint(request);
    const prior = await this.#repository.getOperation(session.sessionId, request.operationId);
    if (prior) {
      assertOperationReplay(prior.requestFingerprint, fingerprint);
      const replayedSession = await this.#requiredSession(session.sessionId);
      return this.#phoneSnapshot(replayedSession, this.#clock.now());
    }
    this.#assertTaskRequest(session, request.taskId, request.taskKind);
    if (session.sessionVersion !== request.expectedSessionVersion) {
      throw new CompanionServiceError("stale_version", true);
    }
    if (!allowedPhaseTransitions[session.taskPhase].includes(request.phase)) {
      throw new CompanionServiceError("invalid_transition", false);
    }
    const consentState = this.#nextConsentState(session, request);
    if (
      request.phase === "in_progress" &&
      session.consentRequirement.kind !== "none" &&
      consentState.status !== "granted"
    ) {
      throw new CompanionServiceError("invalid_transition", false);
    }
    const occurredAt = this.#clock.now();
    const nextSession = CompanionSessionRecordSchema.parse({
      ...session,
      taskPhase: request.phase,
      consentState,
      sessionVersion: session.sessionVersion + 1,
      lastSeenAt: occurredAt
    });
    const committed = await this.#repository.commitSessionMutation({
      expectedSessionVersion: session.sessionVersion,
      nextSession,
      operation: CompanionOperationRecordSchema.parse({
        operationId: request.operationId,
        sessionId: session.sessionId,
        kind: "status",
        requestFingerprint: fingerprint,
        committedSessionVersion: nextSession.sessionVersion,
        resultId: null,
        occurredAt
      }),
      result: null
    });
    return this.#phoneSnapshot(committed.session, occurredAt);
  }

  async submitResult(
    inputValue: z.input<typeof SubmitResultInputSchema>
  ): Promise<CompanionResultReceipt> {
    const input = SubmitResultInputSchema.parse(inputValue);
    const resultRequest = CompanionTaskResultRequestSchema.parse(input.result);
    const session = await this.#authenticateSession(input.sessionToken);
    const fingerprint = this.#crypto.fingerprint(resultRequest);
    const prior = await this.#repository.getOperation(session.sessionId, resultRequest.operationId);
    if (prior) {
      assertOperationReplay(prior.requestFingerprint, fingerprint);
      if (!prior.resultId) throw new CompanionServiceError("repository_conflict", true);
      const priorResult = await this.#repository.getResult(prior.resultId);
      if (!priorResult) throw new CompanionServiceError("repository_conflict", true);
      return CompanionResultReceiptSchema.parse({
        resultId: priorResult.resultId,
        sessionVersion: prior.committedSessionVersion,
        status: "received_for_workflow_validation",
        receivedAt: priorResult.receivedAt,
        replayed: true
      });
    }
    this.#assertTaskRequest(session, resultRequest.taskId, resultRequest.taskKind);
    if (session.sessionVersion !== resultRequest.expectedSessionVersion) {
      throw new CompanionServiceError("stale_version", true);
    }
    this.#assertResultPhase(session, resultRequest);
    this.#assertResultConsent(session, resultRequest);
    const receivedAt = this.#clock.now();
    this.#assertBoundedClientTime(session, resultRequest.clientObservedAt, receivedAt);
    const resultId = this.#ids.createId();
    const resultSummary = {
      resultId,
      outcome: resultRequest.outcome,
      receivedAt
    } as const;
    const nextSession = CompanionSessionRecordSchema.parse({
      ...session,
      taskPhase: "completed",
      sessionVersion: session.sessionVersion + 1,
      lastSeenAt: receivedAt,
      lastResult: resultSummary
    });
    const result = CompanionResultRecordSchema.parse({
      resultId,
      pairingId: session.pairingId,
      sessionId: session.sessionId,
      roundId: session.roundId,
      roundStateVersion: session.roundStateVersion,
      task: session.task,
      result: resultRequest,
      receivedAt,
      validationStatus: "pending_deterministic_workflow"
    });
    const committed = await this.#repository.commitSessionMutation({
      expectedSessionVersion: session.sessionVersion,
      nextSession,
      operation: CompanionOperationRecordSchema.parse({
        operationId: resultRequest.operationId,
        sessionId: session.sessionId,
        kind: "result",
        requestFingerprint: fingerprint,
        committedSessionVersion: nextSession.sessionVersion,
        resultId,
        occurredAt: receivedAt
      }),
      result
    });
    return CompanionResultReceiptSchema.parse({
      resultId,
      sessionVersion: committed.session.sessionVersion,
      status: "received_for_workflow_validation",
      receivedAt,
      replayed: committed.replayed
    });
  }

  async getDesktopSnapshot(
    inputValue: z.input<typeof PairingAccessInputSchema>
  ): Promise<CompanionDesktopSnapshot> {
    const input = PairingAccessInputSchema.parse(inputValue);
    const pairing = await this.#requiredPairing(input.pairingId);
    this.#assertOwner(pairing, input.patientId);
    const authority = await this.#authority.read(pairing.roundId);
    const authorityCurrent =
      authority !== null &&
      authority.patientId === pairing.ownerPatientId &&
      authority.roundStateVersion === pairing.roundStateVersion &&
      sameTask(pairing.task, authority.currentTask);
    return this.#desktopSnapshot(pairing, this.#clock.now(), !authorityCurrent);
  }

  async getCurrentDesktopSnapshot(
    inputValue: z.input<typeof CurrentPairingAccessInputSchema>
  ): Promise<CompanionDesktopSnapshot | null> {
    const input = CurrentPairingAccessInputSchema.parse(inputValue);
    const pairing = await this.#repository.getCurrentPairingForRound(input.roundId);
    if (!pairing) return null;
    this.#assertOwner(pairing, input.patientId);
    const authority = await this.#authority.read(pairing.roundId);
    const authorityCurrent =
      authority !== null &&
      authority.patientId === pairing.ownerPatientId &&
      authority.roundStateVersion === pairing.roundStateVersion &&
      sameTask(pairing.task, authority.currentTask);
    return this.#desktopSnapshot(pairing, this.#clock.now(), !authorityCurrent);
  }

  async revokePairing(
    inputValue: z.input<typeof PairingMutationInputSchema>
  ): Promise<CompanionDesktopSnapshot> {
    const input = PairingMutationInputSchema.parse(inputValue);
    const pairing = await this.#requiredPairing(input.pairingId);
    this.#assertOwner(pairing, input.patientId);
    if (pairing.status === "revoked") {
      return this.#desktopSnapshot(pairing, this.#clock.now(), true);
    }
    const revoked = await this.#repository.revokePairing({
      pairingId: pairing.pairingId,
      expectedPairingVersion: input.expectedPairingVersion,
      revokedAt: this.#clock.now()
    });
    return this.#desktopSnapshot(revoked, this.#clock.now(), true);
  }

  async reissuePairing(
    inputValue: z.input<typeof PairingMutationInputSchema>
  ): Promise<CompanionPairingIssue> {
    const input = PairingMutationInputSchema.parse(inputValue);
    const prior = await this.#requiredPairing(input.pairingId);
    this.#assertOwner(prior, input.patientId);
    if (prior.status === "completed" || prior.lastResult !== null) {
      throw new CompanionServiceError("invalid_transition", false);
    }
    const authority = await this.#readPairableAuthority(prior.roundId);
    if (authority.patientId !== input.patientId || !authority.currentTask) {
      throw new CompanionServiceError("forbidden", false);
    }
    const now = this.#clock.now();
    const token = CompanionPairingTokenSchema.parse(this.#crypto.issuePairingToken());
    const replacement = CompanionPairingRecordSchema.parse({
      pairingId: this.#ids.createId(),
      tokenHash: this.#crypto.hashToken("pairing", token),
      roundId: authority.roundId,
      ownerPatientId: authority.patientId,
      role: "companion",
      roundStateVersion: authority.roundStateVersion,
      allowedTaskKinds: authority.allowedTaskKinds,
      task: authority.currentTask,
      taskPhase: "ready",
      consentRequirement: authority.consentRequirement,
      status: "pending",
      pairingVersion: 1,
      issuedAt: now,
      tokenExpiresAt: isoAfter(now, this.#policy.pairingTtlMs),
      exchangedAt: null,
      exchangeReplayUntil: null,
      exchangeKeyHash: null,
      deviceBindingHash: null,
      sessionId: null,
      sessionExpiresAt: null,
      lastResult: null,
      desktopAcknowledgedAt: null,
      revokedAt: null,
      replacedByPairingId: null
    });
    await this.#repository.replacePairing({
      priorPairingId: prior.pairingId,
      expectedPairingVersion: input.expectedPairingVersion,
      revokedAt: now,
      replacement
    });
    return this.#issueFor(replacement, token);
  }

  async acknowledgeResult(
    inputValue: z.input<typeof AcknowledgeInputSchema>
  ): Promise<CompanionDesktopSnapshot> {
    const input = AcknowledgeInputSchema.parse(inputValue);
    const pairing = await this.#requiredPairing(input.pairingId);
    this.#assertOwner(pairing, input.patientId);
    if (
      !pairing.sessionId ||
      !pairing.lastResult ||
      pairing.lastResult.resultId !== input.resultId
    ) {
      throw new CompanionServiceError("invalid_task", false);
    }
    await this.#assertPairingAuthority(pairing);
    const session = await this.#requiredSession(pairing.sessionId);
    const requestFingerprint = this.#crypto.fingerprint({
      operationId: input.operationId,
      pairingId: pairing.pairingId,
      resultId: input.resultId
    });
    const prior = await this.#repository.getOperation(session.sessionId, input.operationId);
    if (prior) {
      assertOperationReplay(prior.requestFingerprint, requestFingerprint);
      return this.#desktopSnapshot(
        await this.#requiredPairing(pairing.pairingId),
        this.#clock.now(),
        false
      );
    }
    if (pairing.pairingVersion !== input.expectedPairingVersion) {
      throw new CompanionServiceError("stale_version", true);
    }
    if (session.taskPhase !== "completed") {
      throw new CompanionServiceError("invalid_transition", false);
    }
    const occurredAt = this.#clock.now();
    const nextSession = CompanionSessionRecordSchema.parse({
      ...session,
      taskPhase: "desktop_acknowledged",
      status: "completed",
      sessionVersion: session.sessionVersion + 1,
      lastSeenAt: occurredAt
    });
    await this.#repository.commitSessionMutation({
      expectedSessionVersion: session.sessionVersion,
      nextSession,
      operation: CompanionOperationRecordSchema.parse({
        operationId: input.operationId,
        sessionId: session.sessionId,
        kind: "acknowledgement",
        requestFingerprint,
        committedSessionVersion: nextSession.sessionVersion,
        resultId: input.resultId,
        occurredAt
      }),
      result: null
    });
    return this.#desktopSnapshot(await this.#requiredPairing(pairing.pairingId), occurredAt, false);
  }

  async #readPairableAuthority(roundId: string): Promise<CompanionRoundAuthoritySnapshot> {
    const authorityValue = await this.#authority.read(roundId);
    if (!authorityValue) throw new CompanionServiceError("pairing_not_found", false);
    const authority = CompanionRoundAuthoritySnapshotSchema.parse(authorityValue);
    if (!authority.pairable || !authority.currentTask) {
      throw new CompanionServiceError("invalid_task", false);
    }
    return authority;
  }

  async #assertPairingAuthority(pairing: CompanionPairingRecord): Promise<void> {
    const authorityValue = await this.#authority.read(pairing.roundId);
    if (!authorityValue) throw new CompanionServiceError("authority_changed", false);
    const authority = CompanionRoundAuthoritySnapshotSchema.parse(authorityValue);
    if (
      !authority.pairable ||
      authority.patientId !== pairing.ownerPatientId ||
      authority.roundStateVersion !== pairing.roundStateVersion ||
      !sameTask(pairing.task, authority.currentTask) ||
      !pairing.allowedTaskKinds.every((kind) => authority.allowedTaskKinds.includes(kind))
    ) {
      throw new CompanionServiceError("authority_changed", false);
    }
  }

  async #authenticateSession(sessionTokenValue: string): Promise<CompanionSessionRecord> {
    const sessionToken = CompanionSessionTokenSchema.parse(sessionTokenValue);
    const session = await this.#repository.getSessionByTokenHash(
      this.#crypto.hashToken("session", sessionToken)
    );
    if (!session) throw new CompanionServiceError("session_unauthorized", false);
    if (session.status === "revoked") throw new CompanionServiceError("revoked", false);
    if (Date.parse(session.expiresAt) <= Date.parse(this.#clock.now())) {
      throw new CompanionServiceError("session_expired", false);
    }
    const pairing = await this.#requiredPairing(session.pairingId);
    await this.#assertPairingAuthority(pairing);
    return session;
  }

  #assertTaskRequest(session: CompanionSessionRecord, taskId: string, taskKind: string): void {
    if (
      taskId !== session.task.taskId ||
      taskKind !== session.task.kind ||
      !session.allowedTaskKinds.includes(session.task.kind)
    ) {
      throw new CompanionServiceError("invalid_task", false);
    }
  }

  #nextConsentState(
    session: CompanionSessionRecord,
    request: CompanionStatusUpdateRequest
  ): CompanionSessionRecord["consentState"] {
    if (!request.consent) return session.consentState;
    if (
      session.consentRequirement.kind === "none" ||
      session.consentRequirement.version !== request.consent.version ||
      session.taskPhase !== "permission" ||
      request.phase !== "guidance"
    ) {
      throw new CompanionServiceError("invalid_transition", false);
    }
    this.#assertBoundedClientTime(session, request.consent.grantedAt, this.#clock.now());
    return {
      status: "granted",
      version: request.consent.version,
      grantedAt: request.consent.grantedAt
    };
  }

  #assertResultPhase(session: CompanionSessionRecord, result: CompanionTaskResultRequest): void {
    if (result.outcome === "derived_candidate" || result.outcome === "quality_rejected") {
      if (session.taskPhase !== "in_progress") {
        throw new CompanionServiceError("invalid_transition", false);
      }
      return;
    }
    if (
      !["ready", "permission", "guidance", "in_progress", "retry", "unavailable"].includes(
        session.taskPhase
      )
    ) {
      throw new CompanionServiceError("invalid_transition", false);
    }
  }

  #assertResultConsent(session: CompanionSessionRecord, result: CompanionTaskResultRequest): void {
    if (
      result.outcome === "derived_candidate" &&
      session.consentRequirement.kind !== "none" &&
      session.consentState.status !== "granted"
    ) {
      throw new CompanionServiceError("invalid_transition", false);
    }
    if (
      result.taskKind === "face_pulse" &&
      result.outcome === "derived_candidate" &&
      (session.consentState.status !== "granted" ||
        result.derived.consentGrantedAt !== session.consentState.grantedAt)
    ) {
      throw new CompanionServiceError("invalid_transition", false);
    }
  }

  #assertBoundedClientTime(
    session: CompanionSessionRecord,
    clientTime: string,
    serverTime: string
  ): void {
    const parsedClientTime = Date.parse(clientTime);
    if (
      parsedClientTime < Date.parse(session.createdAt) ||
      parsedClientTime > Date.parse(session.expiresAt) ||
      parsedClientTime > Date.parse(serverTime) + 5 * 60_000
    ) {
      throw new CompanionServiceError("invalid_task", false);
    }
  }

  #issueFor(pairing: CompanionPairingRecord, token: string): CompanionPairingIssue {
    const link = new URL("/companion", this.#appBaseUrl);
    link.hash = new URLSearchParams({ pair: token }).toString();
    return CompanionPairingIssueSchema.parse({
      pairingId: pairing.pairingId,
      pairingVersion: pairing.pairingVersion,
      pairingLink: link.toString(),
      tokenExpiresAt: pairing.tokenExpiresAt,
      task: pairing.task
    });
  }

  #phoneSnapshot(session: CompanionSessionRecord, now: string): CompanionPhoneSnapshot {
    const expired = Date.parse(session.expiresAt) <= Date.parse(now);
    return CompanionPhoneSnapshotSchema.parse({
      sessionVersion: session.sessionVersion,
      status: expired ? "expired" : session.status === "revoked" ? "revoked" : "active",
      expiresAt: session.expiresAt,
      task: session.task,
      taskPhase: session.taskPhase,
      consentRequirement: session.consentRequirement,
      consentState: session.consentState,
      lastResult: session.lastResult,
      reissueRequired: expired || session.status === "revoked"
    });
  }

  #desktopSnapshot(
    pairing: CompanionPairingRecord,
    now: string,
    authorityChanged: boolean
  ): CompanionDesktopSnapshot {
    const tokenExpired = Date.parse(pairing.tokenExpiresAt) <= Date.parse(now);
    const sessionExpired =
      pairing.sessionExpiresAt !== null && Date.parse(pairing.sessionExpiresAt) <= Date.parse(now);
    const expired = tokenExpired && pairing.status === "pending" ? true : sessionExpired;
    const status = expired ? "expired" : pairing.status;
    const connection =
      status === "revoked"
        ? "revoked"
        : status === "expired"
          ? "expired"
          : pairing.taskPhase === "desktop_acknowledged"
            ? "desktop_acknowledged"
            : pairing.lastResult
              ? "result_received"
              : pairing.status === "active"
                ? "phone_connected"
                : "waiting_for_phone";
    return CompanionDesktopSnapshotSchema.parse({
      pairingId: pairing.pairingId,
      roundId: pairing.roundId,
      roundStateVersion: pairing.roundStateVersion,
      pairingVersion: pairing.pairingVersion,
      status,
      connection,
      tokenExpiresAt: pairing.tokenExpiresAt,
      sessionExpiresAt: pairing.sessionExpiresAt,
      task: pairing.task,
      taskPhase: pairing.taskPhase,
      lastResult: pairing.lastResult,
      reissueRequired: authorityChanged || status === "expired" || status === "revoked"
    });
  }

  async #requiredPairing(pairingId: string): Promise<CompanionPairingRecord> {
    const pairing = await this.#repository.getPairing(pairingId);
    if (!pairing) throw new CompanionServiceError("pairing_not_found", false);
    return pairing;
  }

  async #requiredSession(sessionId: string): Promise<CompanionSessionRecord> {
    const session = await this.#repository.getSession(sessionId);
    if (!session) throw new CompanionServiceError("session_unauthorized", false);
    return session;
  }

  #assertOwner(pairing: CompanionPairingRecord, patientId: string): void {
    if (pairing.ownerPatientId !== patientId) {
      throw new CompanionServiceError("forbidden", false);
    }
  }
}
