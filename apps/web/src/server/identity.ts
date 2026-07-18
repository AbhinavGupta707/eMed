import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

export const DemoSessionSchema = z
  .object({
    sessionId: z.string().min(1).max(120),
    role: z.enum(["patient", "clinician", "system"]),
    patientId: z.string().min(1).max(120).nullable(),
    expiresAt: z.iso.datetime(),
    dataClassification: z.literal("synthetic_demo")
  })
  .strict()
  .superRefine((session, context) => {
    if (session.role === "patient" && session.patientId === null) {
      context.addIssue({
        code: "custom",
        path: ["patientId"],
        message: "patient sessions require a synthetic patient id"
      });
    }
  });

export type DemoSession = z.infer<typeof DemoSessionSchema>;

export const DEMO_SESSION_COOKIE_NAME = "homerounds_demo_session";
const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

function sign(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export function demoAccessSecretMatches(candidate: string, secret: string): boolean {
  const candidateDigest = createHmac("sha256", secret).update(candidate).digest("base64url");
  const expectedDigest = createHmac("sha256", secret).update(secret).digest("base64url");
  return safeEqual(candidateDigest, expectedDigest);
}

function cookieValue(request: Request, name: string): string | undefined {
  const cookie = request.headers.get("cookie");
  if (!cookie) return undefined;
  for (const part of cookie.split(";")) {
    const [key, ...valueParts] = part.trim().split("=");
    if (key === name) return valueParts.join("=");
  }
  return undefined;
}

export function createSignedDemoSession(sessionInput: DemoSession, secret: string): string {
  const session = DemoSessionSchema.parse(sessionInput);
  z.string().min(16).parse(secret);
  const encoded = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  return `${encoded}.${sign(encoded, secret)}`;
}

export type DemoSessionAuthenticator = {
  authenticate(request: Request): Promise<DemoSession | null>;
};

export function createDemoSessionAuthenticator(config: {
  appEnvironment: "development" | "demo" | "production";
  secret?: string;
  now?: () => string;
}): DemoSessionAuthenticator {
  const now = config.now ?? (() => new Date().toISOString());
  const secret = config.secret;
  return {
    async authenticate(request) {
      const signedCookie = cookieValue(request, DEMO_SESSION_COOKIE_NAME);
      if (signedCookie && secret) {
        const [encoded, signature, ...rest] = signedCookie.split(".");
        if (
          encoded &&
          signature &&
          rest.length === 0 &&
          safeEqual(signature, sign(encoded, secret))
        ) {
          try {
            const decoded = JSON.parse(
              Buffer.from(encoded, "base64url").toString("utf8")
            ) as unknown;
            const session = DemoSessionSchema.parse(decoded);
            if (Date.parse(session.expiresAt) > Date.parse(now())) return session;
          } catch {
            return null;
          }
        }
        return null;
      }

      const url = new URL(request.url);
      if (config.appEnvironment !== "development" || secret || !loopbackHosts.has(url.hostname)) {
        return null;
      }

      const requestedRole = request.headers.get("x-homerounds-demo-role") ?? "patient";
      const parsedRole = z.enum(["patient", "clinician"]).safeParse(requestedRole);
      if (!parsedRole.success) return null;
      return DemoSessionSchema.parse({
        sessionId: `development-${parsedRole.data}`,
        role: parsedRole.data,
        patientId: parsedRole.data === "patient" ? "synthetic-maya" : null,
        expiresAt: new Date(Date.parse(now()) + 3_600_000).toISOString(),
        dataClassification: "synthetic_demo"
      });
    }
  };
}

export function demoSessionCookieHeader(value: string, maxAgeSeconds = 3_600): string {
  return `${DEMO_SESSION_COOKIE_NAME}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${z.number().int().positive().parse(maxAgeSeconds)}`;
}
