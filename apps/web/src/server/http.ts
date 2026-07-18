import {
  ApiErrorEnvelopeSchema,
  ApiSuccessEnvelopeSchema,
  type ApiMetaSchema
} from "@homerounds/api-client";
import { noOpLogger, safeLogEntry, type SafeStructuredLogger } from "@homerounds/audit";
import { z } from "zod";

import { ApiFault, isApiFault } from "./errors";
import type { DemoSession, DemoSessionAuthenticator } from "./identity";
import type { RateLimiter } from "./rate-limit";

export type RuntimeProfile = z.infer<typeof ApiMetaSchema>["runtimeProfile"];

export type ApiRouteHooks = {
  authenticator: DemoSessionAuthenticator;
  rateLimiter: RateLimiter;
  appOrigin: string;
  runtimeProfile: RuntimeProfile;
  logger?: SafeStructuredLogger;
  createId?: () => string;
  now?: () => string;
};

export type ApiRequestContext = {
  request: Request;
  session: DemoSession;
  correlationId: string;
  now: string;
};

type RouteConfiguration<TInput, TOutput> = {
  method: "GET" | "POST";
  roles: readonly DemoSession["role"][];
  mutation: boolean;
  rateLimit: { bucket: string; limit: number; windowMs: number };
  readInput: (request: Request) => Promise<TInput>;
  outputSchema: z.ZodType<TOutput>;
  handle: (context: ApiRequestContext, input: TInput) => Promise<TOutput>;
};

const correlationIdSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9._:-]+$/);

function zodIssues(error: z.ZodError): string[] {
  return error.issues.slice(0, 20).map((issue) => {
    const path = issue.path.length === 0 ? "root" : issue.path.join(".");
    return `${path}: ${issue.message}`.slice(0, 240);
  });
}

function statusFor(error: unknown): ApiFault {
  if (isApiFault(error)) return error;
  if (error instanceof z.ZodError) {
    return new ApiFault(400, "invalid_request", "api.error.invalid_request", zodIssues(error));
  }
  return new ApiFault(500, "internal_error", "api.error.internal_error");
}

function responseHeaders(correlationId: string, runtimeProfile: RuntimeProfile): Headers {
  return new Headers({
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "x-correlation-id": correlationId,
    "x-content-type-options": "nosniff",
    "x-homerounds-runtime-profile": runtimeProfile
  });
}

export function jsonBodyReader<TSchema extends z.ZodTypeAny>(schema: TSchema, maxBytes = 32_768) {
  return async (request: Request): Promise<z.infer<TSchema>> => {
    const contentType = request.headers.get("content-type")?.split(";")[0]?.trim();
    if (contentType !== "application/json") {
      throw new ApiFault(415, "unsupported_media_type", "api.error.application_json_required");
    }
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      throw new ApiFault(413, "payload_too_large", "api.error.payload_too_large");
    }
    const text = await request.text();
    if (Buffer.byteLength(text, "utf8") > maxBytes) {
      throw new ApiFault(413, "payload_too_large", "api.error.payload_too_large");
    }
    let body: unknown;
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      throw new ApiFault(400, "invalid_request", "api.error.invalid_json");
    }
    return schema.parse(body);
  };
}

export const emptyInputReader = async (): Promise<undefined> => undefined;

export async function serveApiRoute<TInput, TOutput>(
  request: Request,
  hooks: ApiRouteHooks,
  configuration: RouteConfiguration<TInput, TOutput>
): Promise<Response> {
  const createId = hooks.createId ?? (() => globalThis.crypto.randomUUID());
  const correlationId =
    correlationIdSchema.safeParse(request.headers.get("x-correlation-id")).data ?? createId();
  const logger = hooks.logger ?? noOpLogger;
  const headers = responseHeaders(correlationId, hooks.runtimeProfile);

  try {
    if (request.method !== configuration.method) {
      headers.set("allow", configuration.method);
      throw new ApiFault(405, "method_not_allowed", "api.error.method_not_allowed");
    }
    if (configuration.mutation) {
      const origin = request.headers.get("origin");
      if (origin !== new URL(hooks.appOrigin).origin) {
        throw new ApiFault(403, "origin_rejected", "api.error.origin_rejected");
      }
    }
    const session = await hooks.authenticator.authenticate(request);
    if (!session) throw new ApiFault(401, "unauthorized", "api.error.unauthorized");
    if (!configuration.roles.includes(session.role)) {
      throw new ApiFault(403, "forbidden", "api.error.forbidden");
    }
    const rateLimit = await hooks.rateLimiter.consume({
      key: session.sessionId,
      ...configuration.rateLimit
    });
    if (!rateLimit.allowed) {
      headers.set("retry-after", String(rateLimit.retryAfterSeconds));
      throw new ApiFault(
        429,
        "rate_limited",
        "api.error.rate_limited",
        [],
        rateLimit.retryAfterSeconds
      );
    }
    const input = await configuration.readInput(request);
    const output = configuration.outputSchema.parse(
      await configuration.handle(
        {
          request,
          session,
          correlationId,
          now: (hooks.now ?? (() => new Date().toISOString()))()
        },
        input
      )
    );
    const envelope = ApiSuccessEnvelopeSchema(configuration.outputSchema).parse({
      data: output,
      meta: { correlationId, runtimeProfile: hooks.runtimeProfile }
    });
    return new Response(JSON.stringify(envelope), { status: 200, headers });
  } catch (error: unknown) {
    const fault = statusFor(error);
    logger.write(
      safeLogEntry({
        level: fault.status >= 500 ? "error" : "warn",
        event: "api_request_rejected",
        correlationId,
        fields: { code: fault.code, status: fault.status, issues: fault.issues }
      })
    );
    const envelope = ApiErrorEnvelopeSchema.parse({
      error: {
        code: fault.code,
        userMessageKey: fault.userMessageKey,
        correlationId,
        issues: [...fault.issues],
        retryAfterSeconds: fault.retryAfterSeconds
      }
    });
    return new Response(JSON.stringify(envelope), { status: fault.status, headers });
  }
}
