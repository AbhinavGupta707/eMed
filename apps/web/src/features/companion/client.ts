import { z } from "zod";

import {
  CompanionAcknowledgeRequestSchema,
  CompanionCreatePairingRequestSchema,
  CompanionDesktopSnapshotSchema,
  CompanionExchangeRequestSchema,
  CompanionPairingIssueSchema,
  CompanionPairingMutationRequestSchema,
  CompanionPhoneSnapshotSchema,
  CompanionStatusUpdateRequestSchema,
  type CompanionDesktopSnapshot,
  type CompanionPairingIssue,
  type CompanionPhoneSnapshot,
  type CompanionStatusUpdateRequest
} from "@homerounds/companion/schemas";

const SnapshotEnvelopeSchema = z
  .object({
    data: z.object({ snapshot: CompanionPhoneSnapshotSchema }).strict(),
    meta: z.object({ correlationId: z.string().min(1).max(120) }).strict()
  })
  .strict();

const ExchangeEnvelopeSchema = z
  .object({
    data: z.object({ snapshot: CompanionPhoneSnapshotSchema, replayed: z.boolean() }).strict(),
    meta: z.object({ correlationId: z.string().min(1).max(120) }).strict()
  })
  .strict();

const PairingIssueEnvelopeSchema = z
  .object({
    data: z.object({ issue: CompanionPairingIssueSchema }).strict(),
    meta: z.object({ correlationId: z.string().min(1).max(120) }).strict()
  })
  .strict();

const DesktopSnapshotEnvelopeSchema = z
  .object({
    data: z.object({ snapshot: CompanionDesktopSnapshotSchema }).strict(),
    meta: z.object({ correlationId: z.string().min(1).max(120) }).strict()
  })
  .strict();

const CurrentDesktopSnapshotEnvelopeSchema = z
  .object({
    data: z.object({ snapshot: CompanionDesktopSnapshotSchema.nullable() }).strict(),
    meta: z.object({ correlationId: z.string().min(1).max(120) }).strict()
  })
  .strict();

const ErrorEnvelopeSchema = z
  .object({
    error: z
      .object({
        code: z.string().min(1).max(80),
        userMessageKey: z.string().min(1).max(160),
        correlationId: z.string().min(1).max(120),
        retryable: z.boolean()
      })
      .strict()
  })
  .strict();

export class CompanionClientError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly retryable: boolean
  ) {
    super(`Companion request failed: ${code}`);
    this.name = "CompanionClientError";
  }
}

async function companionPost<T>(
  path: string,
  body: unknown,
  schema: z.ZodType<T>,
  signal: AbortSignal
): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal
  });
  if (!response.ok) throw await parsedError(response);
  return schema.parse(await response.json());
}

async function parsedError(response: Response): Promise<CompanionClientError> {
  try {
    const parsed = ErrorEnvelopeSchema.parse(await response.json());
    return new CompanionClientError(parsed.error.code, response.status, parsed.error.retryable);
  } catch {
    return new CompanionClientError("network_response_invalid", response.status, true);
  }
}

export async function exchangeCompanion(
  token: string,
  exchangeIdempotencyKey: string,
  signal: AbortSignal
): Promise<CompanionPhoneSnapshot> {
  const body = CompanionExchangeRequestSchema.parse({ token, exchangeIdempotencyKey });
  const response = await fetch("/api/companion/exchange", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal
  });
  if (!response.ok) throw await parsedError(response);
  return ExchangeEnvelopeSchema.parse(await response.json()).data.snapshot;
}

export async function readCompanionSession(
  etag: string | null,
  signal: AbortSignal
): Promise<{ snapshot: CompanionPhoneSnapshot | null; etag: string | null }> {
  const headers = new Headers();
  if (etag) headers.set("if-none-match", etag);
  const response = await fetch("/api/companion/session", {
    credentials: "same-origin",
    cache: "no-store",
    headers,
    signal
  });
  if (response.status === 304) return { snapshot: null, etag };
  if (!response.ok) throw await parsedError(response);
  return {
    snapshot: SnapshotEnvelopeSchema.parse(await response.json()).data.snapshot,
    etag: response.headers.get("etag")
  };
}

export async function updateCompanionStatus(
  inputValue: CompanionStatusUpdateRequest,
  signal: AbortSignal
): Promise<CompanionPhoneSnapshot> {
  const input = CompanionStatusUpdateRequestSchema.parse(inputValue);
  const response = await fetch("/api/companion/session/status", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    signal
  });
  if (!response.ok) throw await parsedError(response);
  return SnapshotEnvelopeSchema.parse(await response.json()).data.snapshot;
}

export async function createCompanionPairing(
  inputValue: z.input<typeof CompanionCreatePairingRequestSchema>,
  signal: AbortSignal
): Promise<CompanionPairingIssue> {
  const input = CompanionCreatePairingRequestSchema.parse(inputValue);
  const envelope = await companionPost(
    "/api/companion/pairings",
    input,
    PairingIssueEnvelopeSchema,
    signal
  );
  return envelope.data.issue;
}

export async function readCompanionPairing(
  pairingIdValue: string,
  etag: string | null,
  signal: AbortSignal
): Promise<{ snapshot: CompanionDesktopSnapshot | null; etag: string | null }> {
  const pairingId = z.uuid().parse(pairingIdValue);
  const headers = new Headers();
  if (etag) headers.set("if-none-match", etag);
  const response = await fetch(`/api/companion/pairings/${pairingId}`, {
    credentials: "same-origin",
    cache: "no-store",
    headers,
    signal
  });
  if (response.status === 304) return { snapshot: null, etag };
  if (!response.ok) throw await parsedError(response);
  return {
    snapshot: DesktopSnapshotEnvelopeSchema.parse(await response.json()).data.snapshot,
    etag: response.headers.get("etag")
  };
}

export async function readCurrentCompanionPairing(
  roundIdValue: string,
  signal: AbortSignal
): Promise<CompanionDesktopSnapshot | null> {
  const roundId = z.uuid().parse(roundIdValue);
  const response = await fetch(`/api/companion/pairings?${new URLSearchParams({ roundId })}`, {
    credentials: "same-origin",
    cache: "no-store",
    signal
  });
  if (!response.ok) throw await parsedError(response);
  return CurrentDesktopSnapshotEnvelopeSchema.parse(await response.json()).data.snapshot;
}

export async function reissueCompanionPairing(
  pairingIdValue: string,
  inputValue: z.input<typeof CompanionPairingMutationRequestSchema>,
  signal: AbortSignal
): Promise<CompanionPairingIssue> {
  const pairingId = z.uuid().parse(pairingIdValue);
  const input = CompanionPairingMutationRequestSchema.parse(inputValue);
  const envelope = await companionPost(
    `/api/companion/pairings/${pairingId}/reissue`,
    input,
    PairingIssueEnvelopeSchema,
    signal
  );
  return envelope.data.issue;
}

export async function revokeCompanionPairing(
  pairingIdValue: string,
  inputValue: z.input<typeof CompanionPairingMutationRequestSchema>,
  signal: AbortSignal
): Promise<CompanionDesktopSnapshot> {
  const pairingId = z.uuid().parse(pairingIdValue);
  const input = CompanionPairingMutationRequestSchema.parse(inputValue);
  const envelope = await companionPost(
    `/api/companion/pairings/${pairingId}/revoke`,
    input,
    DesktopSnapshotEnvelopeSchema,
    signal
  );
  return envelope.data.snapshot;
}

export async function acknowledgeCompanionResult(
  pairingIdValue: string,
  inputValue: z.input<typeof CompanionAcknowledgeRequestSchema>,
  signal: AbortSignal
): Promise<CompanionDesktopSnapshot> {
  const pairingId = z.uuid().parse(pairingIdValue);
  const input = CompanionAcknowledgeRequestSchema.parse(inputValue);
  const envelope = await companionPost(
    `/api/companion/pairings/${pairingId}/acknowledge`,
    input,
    DesktopSnapshotEnvelopeSchema,
    signal
  );
  return envelope.data.snapshot;
}
