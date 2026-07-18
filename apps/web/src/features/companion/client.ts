import { z } from "zod";

import {
  CompanionExchangeRequestSchema,
  CompanionPhoneSnapshotSchema,
  CompanionStatusUpdateRequestSchema,
  type CompanionPhoneSnapshot,
  type CompanionStatusUpdateRequest
} from "../../../../../packages/companion/src/schemas";

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
