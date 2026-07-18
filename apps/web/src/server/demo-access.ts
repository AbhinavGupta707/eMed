import { z } from "zod";

import {
  createSignedDemoSession,
  demoAccessSecretMatches,
  demoSessionCookieHeader,
  type DemoSession
} from "./identity";
import type { ServerRuntime } from "./runtime";

const DemoAccessRequestSchema = z
  .object({
    accessCode: z.string().min(1).max(512),
    role: z.enum(["patient", "clinician"]),
    destination: z.string().min(1).max(1_024).optional()
  })
  .strict();

const PATIENT_DESTINATIONS = new Set([
  "/round?scenario=maya-happy-text",
  "/round?scenario=maya-poor-quality",
  "/round?scenario=maya-red-flag"
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 2_048;
const SESSION_SECONDS = 3_600;
const PUBLIC_SESSION_LIMIT = 30;

function response(status: number, body: Record<string, unknown>, correlationId: string): Response {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "x-correlation-id": correlationId
    }
  });
}

function safeClinicianDestination(candidate: string): string | null {
  let url: URL;
  try {
    url = new URL(candidate, "https://homerounds.invalid");
  } catch {
    return null;
  }
  if (
    url.origin !== "https://homerounds.invalid" ||
    url.pathname !== "/clinician" ||
    url.hash !== ""
  ) {
    return null;
  }
  const entries = [...url.searchParams.entries()];
  if (
    entries.length > 3 ||
    entries.some(([key, value]) => key !== "roundId" || !UUID.test(value))
  ) {
    return null;
  }
  return `${url.pathname}${url.search}`;
}

export function safeDemoDestination(
  role: "patient" | "clinician",
  candidate: string | undefined
): string {
  const fallback = role === "patient" ? "/round?scenario=maya-happy-text" : "/clinician";
  if (!candidate) return fallback;
  if (role === "patient") return PATIENT_DESTINATIONS.has(candidate) ? candidate : fallback;
  return safeClinicianDestination(candidate) ?? fallback;
}

export function publicDemoSessionHref(role: "patient" | "clinician", destination: string): string {
  const query = new URLSearchParams({
    role,
    next: safeDemoDestination(role, destination)
  });
  return `/api/demo/session?${query.toString()}`;
}

async function readRequest(request: Request): Promise<z.infer<typeof DemoAccessRequestSchema>> {
  if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") {
    throw new Error("unsupported_media_type");
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new Error("payload_too_large");
  }
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) throw new Error("payload_too_large");
  return DemoAccessRequestSchema.parse(JSON.parse(text) as unknown);
}

function requestKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const candidate = forwarded || request.headers.get("x-real-ip") || "unknown";
  return `demo-access:${candidate.replaceAll(/[^A-Za-z0-9.:_-]/g, "_").slice(0, 120)}`;
}

function issueSession(
  role: "patient" | "clinician",
  destination: string | undefined,
  runtime: ServerRuntime
): Readonly<{ expiresAt: string; redirectTo: string; signed: string }> {
  const signingSecret = runtime.environment.DEMO_ACCESS_SECRET;
  if (!signingSecret) throw new Error("demo_session_signing_unavailable");
  const issuedAt = Date.parse(runtime.hooks.now?.() ?? new Date().toISOString());
  const expiresAt = new Date(issuedAt + SESSION_SECONDS * 1_000).toISOString();
  const session: DemoSession = {
    sessionId: `browser-${role}-${runtime.hooks.createId?.() ?? globalThis.crypto.randomUUID()}`,
    role,
    patientId: role === "patient" ? "synthetic-maya" : null,
    expiresAt,
    dataClassification: "synthetic_demo"
  };
  return {
    expiresAt,
    redirectTo: safeDemoDestination(role, destination),
    signed: createSignedDemoSession(session, signingSecret)
  };
}

export async function handlePublicDemoAccess(
  request: Request,
  runtime: ServerRuntime
): Promise<Response> {
  const correlationId = runtime.hooks.createId?.() ?? globalThis.crypto.randomUUID();
  const environment = runtime.environment;
  if (environment.APP_ENV !== "demo" || !environment.DEMO_ACCESS_SECRET) {
    return response(404, { error: "not_found" }, correlationId);
  }

  const url = new URL(request.url);
  const roles = url.searchParams.getAll("role");
  const destinations = url.searchParams.getAll("next");
  const parsedRole = z.enum(["patient", "clinician"]).safeParse(roles[0]);
  if (!parsedRole.success || roles.length !== 1 || destinations.length > 1) {
    return response(400, { error: "invalid_request" }, correlationId);
  }

  const rateLimit = await runtime.hooks.rateLimiter.consume({
    key: requestKey(request),
    bucket: "public_demo_session_issue",
    limit: PUBLIC_SESSION_LIMIT,
    windowMs: 5 * 60_000
  });
  if (!rateLimit.allowed) {
    const limited = response(429, { error: "access_denied" }, correlationId);
    limited.headers.set("retry-after", String(rateLimit.retryAfterSeconds));
    return limited;
  }

  const issued = issueSession(parsedRole.data, destinations[0], runtime);
  const success = new Response(null, {
    status: 303,
    headers: {
      "cache-control": "no-store",
      location: new URL(issued.redirectTo, environment.APP_BASE_URL).toString(),
      "x-content-type-options": "nosniff",
      "x-correlation-id": correlationId
    }
  });
  success.headers.set("set-cookie", demoSessionCookieHeader(issued.signed, SESSION_SECONDS));
  return success;
}

export async function handleDemoAccess(
  request: Request,
  runtime: ServerRuntime
): Promise<Response> {
  const correlationId = runtime.hooks.createId?.() ?? globalThis.crypto.randomUUID();
  const environment = runtime.environment;
  if (environment.APP_ENV !== "demo" || !environment.DEMO_ACCESS_SECRET) {
    return response(404, { error: "not_found" }, correlationId);
  }
  if (request.headers.get("origin") !== new URL(environment.APP_BASE_URL).origin) {
    return response(403, { error: "access_denied" }, correlationId);
  }

  const rateLimit = await runtime.hooks.rateLimiter.consume({
    key: requestKey(request),
    bucket: "demo_session_issue",
    limit: 6,
    windowMs: 5 * 60_000
  });
  if (!rateLimit.allowed) {
    const limited = response(429, { error: "access_denied" }, correlationId);
    limited.headers.set("retry-after", String(rateLimit.retryAfterSeconds));
    return limited;
  }

  let input: z.infer<typeof DemoAccessRequestSchema>;
  try {
    input = await readRequest(request);
  } catch {
    return response(400, { error: "invalid_request" }, correlationId);
  }
  if (!demoAccessSecretMatches(input.accessCode, environment.DEMO_ACCESS_SECRET)) {
    return response(401, { error: "access_denied" }, correlationId);
  }

  const issued = issueSession(input.role, input.destination, runtime);
  const success = response(
    200,
    {
      data: {
        role: input.role,
        redirectTo: issued.redirectTo,
        expiresAt: issued.expiresAt
      }
    },
    correlationId
  );
  success.headers.set("set-cookie", demoSessionCookieHeader(issued.signed, SESSION_SECONDS));
  return success;
}
