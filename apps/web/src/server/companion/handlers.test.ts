import { InMemoryCompanionPairingRepository } from "@homerounds/companion";
import { describe, expect, it } from "vitest";

import { createDemoSessionAuthenticator } from "../identity";
import { InMemoryRateLimiter } from "../rate-limit";
import {
  handleCreateCompanionPairing,
  handleExchangeCompanionPairing,
  handleGetCompanionSession,
  handleSubmitCompanionResult
} from "./handlers";
import { createCompanionRouteRuntime } from "./runtime";

const NOW = "2026-07-18T12:00:00.000Z";
const ROUND_ID = "11111111-1111-4111-8111-111111111111";

function runtime(available = true) {
  let id = 0;
  return createCompanionRouteRuntime({
    repository: new InMemoryCompanionPairingRepository(),
    authority: {
      async read(roundId) {
        return roundId === ROUND_ID
          ? {
              roundId,
              patientId: "synthetic-maya",
              roundStateVersion: 4,
              pairable: true,
              currentTask: {
                taskId: "capture.finger_ppg.pulse",
                kind: "finger_pulse",
                taskVersion: 1
              },
              allowedTaskKinds: ["finger_pulse"],
              consentRequirement: {
                kind: "explicit_local_capture",
                version: "local-capture-v1"
              }
            }
          : null;
      }
    },
    authenticator: createDemoSessionAuthenticator({
      appEnvironment: "development",
      now: () => NOW
    }),
    rateLimiter: new InMemoryRateLimiter(() => Date.parse(NOW)),
    appOrigin: "http://localhost:3000",
    tokenHashSecret: "test-only-companion-secret-that-is-at-least-thirty-two-bytes",
    available,
    now: () => NOW,
    createId: () => `aaaaaaaa-aaaa-4aaa-8aaa-${String(++id).padStart(12, "0")}`
  });
}

function jsonRequest(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      "user-agent": "Synthetic Browser",
      "x-forwarded-for": "192.0.2.50",
      ...headers
    },
    body: JSON.stringify(body)
  });
}

async function paired(routeRuntime: ReturnType<typeof runtime>) {
  const created = await handleCreateCompanionPairing(
    jsonRequest("/api/companion/pairings", {
      roundId: ROUND_ID,
      expectedRoundStateVersion: 4
    }),
    routeRuntime
  );
  const createdBody = (await created.json()) as {
    data: { issue: { pairingLink: string; pairingId: string } };
  };
  const token = new URLSearchParams(new URL(createdBody.data.issue.pairingLink).hash.slice(1)).get(
    "pair"
  );
  if (!token) throw new Error("test pairing token missing");
  const exchanged = await handleExchangeCompanionPairing(
    jsonRequest("/api/companion/exchange", {
      token,
      exchangeIdempotencyKey: "22222222-2222-4222-8222-222222222222"
    }),
    routeRuntime
  );
  const cookie = exchanged.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error("test companion cookie missing");
  return { created, createdBody, token, exchanged, cookie };
}

describe("companion route boundary", () => {
  it("exchanges a fragment token for a scoped secure cookie without exposing bearer data", async () => {
    const routeRuntime = runtime();
    const result = await paired(routeRuntime);
    const exchangeText = await result.exchanged.text();

    expect(result.created.status).toBe(201);
    expect(result.exchanged.status).toBe(200);
    expect(result.exchanged.headers.get("set-cookie")).toMatch(
      /__Host-homerounds_companion=.*Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=1200; Priority=High/
    );
    expect(exchangeText).not.toContain(result.token);
    expect(exchangeText).not.toContain(ROUND_ID);
    expect(exchangeText).not.toContain("synthetic-maya");
    expect(exchangeText).not.toMatch(/secret|api.?key|database/i);
    expect(result.exchanged.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("supports ETag conditional polling without a long-held request", async () => {
    const routeRuntime = runtime();
    const result = await paired(routeRuntime);
    const first = await handleGetCompanionSession(
      new Request("http://localhost:3000/api/companion/session", {
        headers: { cookie: result.cookie }
      }),
      routeRuntime
    );
    const etag = first.headers.get("etag");
    expect(first.status).toBe(200);
    expect(etag).toBe('"companion-session-1"');

    const conditional = await handleGetCompanionSession(
      new Request("http://localhost:3000/api/companion/session", {
        headers: { cookie: result.cookie, "if-none-match": etag! }
      }),
      routeRuntime
    );
    expect(conditional.status).toBe(304);
    expect(await conditional.text()).toBe("");
  });

  it("rejects a clinician role and cross-origin pairing mutation", async () => {
    const clinician = await handleCreateCompanionPairing(
      jsonRequest(
        "/api/companion/pairings",
        { roundId: ROUND_ID, expectedRoundStateVersion: 4 },
        { "x-homerounds-demo-role": "clinician" }
      ),
      runtime()
    );
    expect(clinician.status).toBe(403);

    const crossOriginRequest = jsonRequest("/api/companion/pairings", {
      roundId: ROUND_ID,
      expectedRoundStateVersion: 4
    });
    crossOriginRequest.headers.set("origin", "https://attacker.example");
    const crossOrigin = await handleCreateCompanionPairing(crossOriginRequest, runtime());
    expect(crossOrigin.status).toBe(403);
  });

  it("rejects raw media and authority-like result fields at the route boundary", async () => {
    const routeRuntime = runtime();
    const result = await paired(routeRuntime);
    const response = await handleSubmitCompanionResult(
      jsonRequest(
        "/api/companion/session/result",
        {
          operationId: "44444444-4444-4444-8444-444444444444",
          expectedSessionVersion: 1,
          taskId: "capture.finger_ppg.pulse",
          taskKind: "finger_pulse",
          clientObservedAt: NOW,
          rawMediaStored: false,
          outcome: "derived_candidate",
          derived: {
            pulseBpm: 72,
            durationMs: 30_000,
            algorithmVersion: "local-v1",
            quality: { status: "unreviewed", score: 0.9, reasons: [] }
          },
          rawFrame: "data:image/jpeg;base64,not-real",
          urgency: "emergency",
          careAction: "contact_service"
        },
        { cookie: result.cookie }
      ),
      routeRuntime
    );
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain("rawFrame");
    expect(await routeRuntime.service.getPhoneSnapshot(result.cookie.split("=")[1]!)).toMatchObject(
      {
        sessionVersion: 1,
        taskPhase: "ready"
      }
    );
  });

  it("fails closed when the durable hosted integration has not been registered", async () => {
    const response = await handleCreateCompanionPairing(
      jsonRequest("/api/companion/pairings", {
        roundId: ROUND_ID,
        expectedRoundStateVersion: 4
      }),
      runtime(false)
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "integration_unavailable", retryable: true }
    });
  });
});
