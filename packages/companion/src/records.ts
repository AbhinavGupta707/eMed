import { z } from "zod";

import {
  CompanionConsentRequirementSchema,
  CompanionConsentStateSchema,
  CompanionResultSummarySchema,
  CompanionSecureHashSchema,
  CompanionTaskBindingSchema,
  CompanionTaskKindSchema,
  CompanionTaskPhaseSchema,
  CompanionTaskResultRequestSchema
} from "./schemas";

export const CompanionPairingRecordSchema = z
  .object({
    pairingId: z.uuid(),
    tokenHash: CompanionSecureHashSchema,
    roundId: z.uuid(),
    ownerPatientId: z.string().min(1).max(120),
    role: z.literal("companion"),
    roundStateVersion: z.number().int().nonnegative(),
    allowedTaskKinds: z.array(CompanionTaskKindSchema).min(1).max(4),
    task: CompanionTaskBindingSchema,
    taskPhase: CompanionTaskPhaseSchema,
    consentRequirement: CompanionConsentRequirementSchema,
    status: z.enum(["pending", "active", "revoked", "completed"]),
    pairingVersion: z.number().int().positive(),
    issuedAt: z.iso.datetime(),
    tokenExpiresAt: z.iso.datetime(),
    exchangedAt: z.iso.datetime().nullable(),
    exchangeReplayUntil: z.iso.datetime().nullable(),
    exchangeKeyHash: CompanionSecureHashSchema.nullable(),
    deviceBindingHash: CompanionSecureHashSchema.nullable(),
    sessionId: z.uuid().nullable(),
    sessionExpiresAt: z.iso.datetime().nullable(),
    lastResult: CompanionResultSummarySchema.nullable(),
    desktopAcknowledgedAt: z.iso.datetime().nullable(),
    revokedAt: z.iso.datetime().nullable(),
    replacedByPairingId: z.uuid().nullable()
  })
  .strict()
  .superRefine((pairing, context) => {
    if (!pairing.allowedTaskKinds.includes(pairing.task.kind)) {
      context.addIssue({
        code: "custom",
        path: ["allowedTaskKinds"],
        message: "the selected task must remain inside the bound allowlist"
      });
    }
    if (new Set(pairing.allowedTaskKinds).size !== pairing.allowedTaskKinds.length) {
      context.addIssue({
        code: "custom",
        path: ["allowedTaskKinds"],
        message: "allowed task kinds must be unique"
      });
    }
  });

export type CompanionPairingRecord = z.infer<typeof CompanionPairingRecordSchema>;

export const CompanionSessionRecordSchema = z
  .object({
    sessionId: z.uuid(),
    sessionTokenHash: CompanionSecureHashSchema,
    pairingId: z.uuid(),
    roundId: z.uuid(),
    role: z.literal("companion"),
    roundStateVersion: z.number().int().nonnegative(),
    allowedTaskKinds: z.array(CompanionTaskKindSchema).min(1).max(4),
    task: CompanionTaskBindingSchema,
    taskPhase: CompanionTaskPhaseSchema,
    consentRequirement: CompanionConsentRequirementSchema,
    consentState: CompanionConsentStateSchema,
    sessionVersion: z.number().int().positive(),
    status: z.enum(["active", "revoked", "completed"]),
    createdAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    lastSeenAt: z.iso.datetime(),
    lastResult: CompanionResultSummarySchema.nullable(),
    revokedAt: z.iso.datetime().nullable()
  })
  .strict();

export type CompanionSessionRecord = z.infer<typeof CompanionSessionRecordSchema>;

export const CompanionResultRecordSchema = z
  .object({
    resultId: z.uuid(),
    pairingId: z.uuid(),
    sessionId: z.uuid(),
    roundId: z.uuid(),
    roundStateVersion: z.number().int().nonnegative(),
    task: CompanionTaskBindingSchema,
    result: CompanionTaskResultRequestSchema,
    receivedAt: z.iso.datetime(),
    validationStatus: z.literal("pending_deterministic_workflow")
  })
  .strict();

export type CompanionResultRecord = z.infer<typeof CompanionResultRecordSchema>;

export const CompanionOperationRecordSchema = z
  .object({
    operationId: z.uuid(),
    sessionId: z.uuid(),
    kind: z.enum(["status", "result", "acknowledgement"]),
    requestFingerprint: CompanionSecureHashSchema,
    committedSessionVersion: z.number().int().positive(),
    resultId: z.uuid().nullable(),
    occurredAt: z.iso.datetime()
  })
  .strict();

export type CompanionOperationRecord = z.infer<typeof CompanionOperationRecordSchema>;
