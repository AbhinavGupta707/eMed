import { z } from "zod";

import { CompanionServiceError } from "../../../../../packages/companion/src/index";
import type { DemoSession } from "../identity";
import type { CompanionRouteRuntime } from "./runtime";

const CORRELATION_ID = /^[A-Za-z0-9._:-]{1,120}$/;
const COOKIE_NAME = "__Host-homerounds_companion";

export class CompanionHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly retryable = false,
    readonly retryAfterSeconds: number | null = null
  ) {
    super(`Companion HTTP request rejected: ${code}`);
    this.name = "CompanionHttpError";
  }
}

function statusForServiceError(error: CompanionServiceError): number {
  switch (error.code) {
    case "pairing_not_found":
      return 404;
    case "token_invalid":
    case "session_unauthorized":
      return 401;
    case "forbidden":
    case "invalid_task":
      return 403;
    case "token_expired":
    case "session_expired":
    case "revoked":
    case "authority_changed":
      return 410;
    case "token_used":
    case "stale_version":
    case "invalid_transition":
    case "idempotency_conflict":
    case "repository_conflict":
      return 409;
  }
}

function headers(correlationId: string): Headers {
  return new Headers({
    "cache-control": "no-store, private",
    "content-type": "application/json; charset=utf-8",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-correlation-id": correlationId
  });
}

export function successResponse(data: unknown, correlationId: string, status = 200): Response {
  return new Response(JSON.stringify({ data, meta: { correlationId } }), {
    status,
    headers: headers(correlationId)
  });
}

function errorResponse(error: unknown, correlationId: string): Response {
  const mapped =
    error instanceof CompanionHttpError
      ? error
      : error instanceof CompanionServiceError
        ? new CompanionHttpError(statusForServiceError(error), error.code, error.retryable)
        : error instanceof z.ZodError
          ? new CompanionHttpError(400, "invalid_request")
          : new CompanionHttpError(500, "internal_error", true);
  const response = new Response(
    JSON.stringify({
      error: {
        code: mapped.code,
        userMessageKey: `companion.error.${mapped.code}`,
        correlationId,
        retryable: mapped.retryable
      }
    }),
    { status: mapped.status, headers: headers(correlationId) }
  );
  if (mapped.retryAfterSeconds !== null) {
    response.headers.set("retry-after", String(mapped.retryAfterSeconds));
  }
  return response;
}

export async function companionBoundary(
  request: Request,
  runtime: CompanionRouteRuntime,
  operation: (correlationId: string) => Promise<Response>
): Promise<Response> {
  const supplied = request.headers.get("x-correlation-id");
  const correlationId = supplied && CORRELATION_ID.test(supplied) ? supplied : runtime.createId();
  try {
    if (!runtime.available) throw new CompanionHttpError(503, "integration_unavailable", true);
    return await operation(correlationId);
  } catch (error: unknown) {
    return errorResponse(error, correlationId);
  }
}

export function assertMethod(request: Request, method: "GET" | "POST"): void {
  if (request.method !== method) throw new CompanionHttpError(405, "method_not_allowed");
}

export function assertMutationOrigin(request: Request, appOrigin: string): void {
  if (request.headers.get("origin") !== new URL(appOrigin).origin) {
    throw new CompanionHttpError(403, "origin_rejected");
  }
}

export async function readJson<TSchema extends z.ZodType>(
  request: Request,
  schema: TSchema,
  maxBytes = 32_768
): Promise<z.infer<TSchema>> {
  if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") {
    throw new CompanionHttpError(415, "unsupported_media_type");
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new CompanionHttpError(413, "payload_too_large");
  }
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    throw new CompanionHttpError(413, "payload_too_large");
  }
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new CompanionHttpError(400, "invalid_request");
  }
  return schema.parse(value);
}

export async function requirePatientSession(
  request: Request,
  runtime: CompanionRouteRuntime
): Promise<DemoSession & { role: "patient"; patientId: string }> {
  const session = await runtime.authenticator.authenticate(request);
  if (!session) throw new CompanionHttpError(401, "unauthorized");
  if (session.role !== "patient" || !session.patientId) {
    throw new CompanionHttpError(403, "forbidden");
  }
  return { ...session, role: "patient", patientId: session.patientId };
}

export async function consumeRateLimit(
  runtime: CompanionRouteRuntime,
  input: { key: string; bucket: string; limit: number; windowMs?: number }
): Promise<void> {
  const result = await runtime.rateLimiter.consume({
    key: input.key,
    bucket: input.bucket,
    limit: input.limit,
    windowMs: input.windowMs ?? 60_000
  });
  if (!result.allowed) {
    throw new CompanionHttpError(429, "rate_limited", true, result.retryAfterSeconds);
  }
}

export function sourceRateKey(request: Request, runtime: CompanionRouteRuntime): string {
  const source =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  return runtime.rateKey(source.slice(0, 160));
}

export function deviceBinding(request: Request): string {
  return [
    request.headers.get("user-agent") ?? "unknown-agent",
    request.headers.get("sec-ch-ua-platform") ?? "unknown-platform"
  ]
    .join("\u001f")
    .slice(0, 512);
}

export function companionCookie(request: Request): string | null {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === COOKIE_NAME) return value.join("=");
  }
  return null;
}

export function companionCookieHeader(value: string, expiresAt: string, now: string): string {
  const maxAge = Math.max(1, Math.floor((Date.parse(expiresAt) - Date.parse(now)) / 1_000));
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}; Priority=High`;
}
