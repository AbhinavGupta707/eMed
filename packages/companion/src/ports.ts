import { z } from "zod";

import type {
  CompanionOperationRecord,
  CompanionPairingRecord,
  CompanionResultRecord,
  CompanionSessionRecord
} from "./records";
import {
  CompanionConsentRequirementSchema,
  CompanionTaskBindingSchema,
  CompanionTaskKindSchema
} from "./schemas";

export const CompanionRoundAuthoritySnapshotSchema = z
  .object({
    roundId: z.uuid(),
    patientId: z.string().min(1).max(120),
    roundStateVersion: z.number().int().nonnegative(),
    pairable: z.boolean(),
    currentTask: CompanionTaskBindingSchema.nullable(),
    allowedTaskKinds: z.array(CompanionTaskKindSchema).min(1).max(4),
    consentRequirement: CompanionConsentRequirementSchema
  })
  .strict();

export type CompanionRoundAuthoritySnapshot = z.infer<typeof CompanionRoundAuthoritySnapshotSchema>;

export type CompanionRoundAuthorityPort = {
  read(roundId: string): Promise<CompanionRoundAuthoritySnapshot | null>;
};

export type CompanionClock = { now(): string };

export type CompanionIdSource = { createId(): string };

export type CompanionCryptoPort = {
  issuePairingToken(): string;
  deriveSessionToken(sessionId: string): string;
  hashToken(purpose: "pairing" | "session", token: string): string;
  hashValue(purpose: "exchange" | "device", value: string): string;
  fingerprint(value: unknown): string;
};

export type CompanionExchangeCommit = {
  tokenHash: string;
  expectedPairingVersion: number;
  exchangeKeyHash: string;
  deviceBindingHash: string;
  exchangedAt: string;
  exchangeReplayUntil: string;
  session: CompanionSessionRecord;
};

export type CompanionExchangeCommitResult = {
  pairing: CompanionPairingRecord;
  session: CompanionSessionRecord;
  replayed: boolean;
};

export type CompanionSessionMutationCommit = {
  expectedSessionVersion: number;
  nextSession: CompanionSessionRecord;
  operation: CompanionOperationRecord;
  result: CompanionResultRecord | null;
};

export type CompanionSessionMutationCommitResult = {
  session: CompanionSessionRecord;
  operation: CompanionOperationRecord;
  result: CompanionResultRecord | null;
  replayed: boolean;
};

export type CompanionPairingReplacementCommit = {
  priorPairingId: string;
  expectedPairingVersion: number;
  revokedAt: string;
  replacement: CompanionPairingRecord;
};

export type CompanionPairingRepository = {
  createPairing(pairing: CompanionPairingRecord): Promise<void>;
  getPairing(pairingId: string): Promise<CompanionPairingRecord | null>;
  getCurrentPairingForRound(roundId: string): Promise<CompanionPairingRecord | null>;
  getPairingByTokenHash(tokenHash: string): Promise<CompanionPairingRecord | null>;
  exchange(commit: CompanionExchangeCommit): Promise<CompanionExchangeCommitResult>;
  getSession(sessionId: string): Promise<CompanionSessionRecord | null>;
  getSessionByTokenHash(tokenHash: string): Promise<CompanionSessionRecord | null>;
  getOperation(sessionId: string, operationId: string): Promise<CompanionOperationRecord | null>;
  getResult(resultId: string): Promise<CompanionResultRecord | null>;
  commitSessionMutation(
    commit: CompanionSessionMutationCommit
  ): Promise<CompanionSessionMutationCommitResult>;
  revokePairing(input: {
    pairingId: string;
    expectedPairingVersion: number;
    revokedAt: string;
  }): Promise<CompanionPairingRecord>;
  replacePairing(commit: CompanionPairingReplacementCommit): Promise<CompanionPairingRecord>;
};
