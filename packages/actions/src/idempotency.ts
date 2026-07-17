import { createHash } from "node:crypto";

import { ProtocolResultSchema } from "@homerounds/contracts";
import { z } from "zod";

import { AllowedActionSchema, type AllowedAction } from "./schemas";

const IdempotencyInputSchema = z
  .object({
    roundId: z.uuid(),
    patientId: z.string().min(1).max(120),
    actionType: AllowedActionSchema,
    protocolResult: ProtocolResultSchema.strict()
  })
  .strict();

export type ActionIdempotencyInput = {
  roundId: string;
  patientId: string;
  actionType: AllowedAction;
  protocolResult: z.infer<typeof ProtocolResultSchema>;
};

function canonicalParts(inputValue: ActionIdempotencyInput): readonly string[] {
  const input = IdempotencyInputSchema.parse(inputValue);
  return [
    "homerounds-action-v1",
    input.roundId,
    input.patientId,
    input.actionType,
    input.protocolResult.protocolId,
    input.protocolResult.protocolVersion,
    input.protocolResult.outcome,
    [...input.protocolResult.matchedRuleIds].sort().join(","),
    [...input.protocolResult.factIds].sort().join(","),
    [...input.protocolResult.allowedActions].sort().join(","),
    [...input.protocolResult.missingFactKeys].sort().join(","),
    input.protocolResult.explanationKey
  ];
}

export function deriveActionIdempotencyKey(input: ActionIdempotencyInput): string {
  const digest = createHash("sha256").update(canonicalParts(input).join("\u001f")).digest("hex");
  return `action:v1:${digest}`;
}

export function deterministicActionUuid(idempotencyKey: string): string {
  const bytes = createHash("sha256").update(`task\u001f${idempotencyKey}`).digest().subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
