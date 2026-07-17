import { z } from "zod";
import { describe, expect, it } from "vitest";

import { createDemoSessionAuthenticator } from "./identity";
import { jsonBodyReader, serveApiRoute, type ApiRouteHooks } from "./http";
import { InMemoryRateLimiter } from "./rate-limit";

const NOW = "2026-07-17T12:00:00.000Z";

function hooks(): ApiRouteHooks {
  return {
    authenticator: createDemoSessionAuthenticator({
      appEnvironment: "development",
      now: () => NOW
    }),
    rateLimiter: new InMemoryRateLimiter(() => Date.parse(NOW)),
    appOrigin: "http://localhost:3000",
    runtimeProfile: "in_memory_demo_fallback",
    createId: () => "correlation-generated",
    now: () => NOW
  };
}

const inputSchema = z.object({ value: z.string().max(20) }).strict();
const outputSchema = z.object({ accepted: z.boolean() }).strict();

function request(origin = "http://localhost:3000") {
  return new Request("http://localhost:3000/api/test", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ value: "safe" })
  });
}

describe("API boundary hooks", () => {
  it("rejects cross-origin mutation before executing the handler", async () => {
    let called = false;
    const response = await serveApiRoute<z.infer<typeof inputSchema>, z.infer<typeof outputSchema>>(
      request("https://attacker.example"),
      hooks(),
      {
        method: "POST",
        roles: ["patient"],
        mutation: true,
        rateLimit: { bucket: "test", limit: 1, windowMs: 60_000 },
        readInput: jsonBodyReader(inputSchema),
        outputSchema,
        async handle() {
          called = true;
          return { accepted: true };
        }
      }
    );

    expect(response.status).toBe(403);
    expect(called).toBe(false);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "origin_rejected" } });
  });

  it("returns a stable rate-limit error and retry header", async () => {
    const routeHooks = hooks();
    const configuration = {
      method: "POST" as const,
      roles: ["patient"] as const,
      mutation: true,
      rateLimit: { bucket: "test", limit: 1, windowMs: 60_000 },
      readInput: jsonBodyReader(inputSchema),
      outputSchema,
      handle: async () => ({ accepted: true })
    };
    const first = await serveApiRoute(request(), routeHooks, configuration);
    const second = await serveApiRoute(request(), routeHooks, configuration);

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(second.headers.get("retry-after")).toBe("60");
    await expect(second.json()).resolves.toMatchObject({ error: { code: "rate_limited" } });
  });

  it("rejects unknown schema fields and preserves a safe correlation id", async () => {
    const malformed = new Request("http://localhost:3000/api/test", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        "x-correlation-id": "safe-correlation-1"
      },
      body: JSON.stringify({ value: "safe", action: "invented" })
    });
    const response = await serveApiRoute<z.infer<typeof inputSchema>, z.infer<typeof outputSchema>>(
      malformed,
      hooks(),
      {
        method: "POST",
        roles: ["patient"],
        mutation: true,
        rateLimit: { bucket: "test", limit: 1, windowMs: 60_000 },
        readInput: jsonBodyReader(inputSchema),
        outputSchema,
        handle: async () => ({ accepted: true })
      }
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("x-correlation-id")).toBe("safe-correlation-1");
  });
});
