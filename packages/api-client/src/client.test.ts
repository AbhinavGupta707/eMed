import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { HomeRoundsApiClient, HomeRoundsApiError } from "./client";

const ROUND_ID = "137c9d4f-4dfc-4b95-a5ce-657ba00b29b4";
const round = {
  id: ROUND_ID,
  patientId: "synthetic-maya",
  state: "invited",
  stateVersion: 0,
  purpose: "Synthetic programme round",
  triggerId: "trigger-1",
  burdenSecondsRemaining: 90,
  protocolId: "cardiometabolic_demo",
  createdAt: "2026-07-17T12:00:00.000Z",
  updatedAt: "2026-07-17T12:00:00.000Z",
  closedAt: null
};

const meta = {
  correlationId: "correlation-1",
  runtimeProfile: "in_memory_demo_fallback"
};

describe("typed HomeRounds API client", () => {
  it("validates request and response envelopes", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toMatchObject({ patientId: "synthetic-maya" });
      return new Response(JSON.stringify({ data: { round, created: true }, meta }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });
    const client = new HomeRoundsApiClient({ baseUrl: "http://localhost:3000", fetcher });

    const result = await client.createRound({
      patientId: "synthetic-maya",
      triggerId: "trigger-1",
      purpose: "Synthetic programme round",
      protocolId: "cardiometabolic_demo",
      burdenSeconds: 90
    });

    expect(result).toEqual({ round, created: true });
  });

  it("throws a typed safe error envelope", async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              code: "stale_state",
              userMessageKey: "api.error.stale_state",
              correlationId: "correlation-2",
              issues: [],
              retryAfterSeconds: null
            }
          }),
          { status: 409, headers: { "content-type": "application/json" } }
        )
    );
    const client = new HomeRoundsApiClient({ baseUrl: "http://localhost:3000", fetcher });

    await expect(client.getRound(ROUND_ID)).rejects.toBeInstanceOf(HomeRoundsApiError);
    await expect(client.getRound(ROUND_ID)).rejects.toMatchObject({
      envelope: { error: { code: "stale_state", correlationId: "correlation-2" } }
    });
  });

  it("requires a caller-owned snapshot schema instead of duplicating the frozen boundary", async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            data: { snapshot: { patientId: "synthetic-maya", unsafeExtra: "rejected" } },
            meta
          }),
          { status: 200 }
        )
    );
    const client = new HomeRoundsApiClient({ baseUrl: "http://localhost:3000", fetcher });
    const snapshotSchema = z.object({ patientId: z.string() }).strict();

    await expect(client.getSnapshot("synthetic-maya", snapshotSchema)).rejects.toThrow();
  });

  it("rejects malformed success responses instead of silently falling back", async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ data: { round: { ...round, state: "invented" } }, meta }), {
          status: 200
        })
    );
    const client = new HomeRoundsApiClient({ baseUrl: "http://localhost:3000", fetcher });

    await expect(client.getRound(ROUND_ID)).rejects.toThrow();
  });
});
