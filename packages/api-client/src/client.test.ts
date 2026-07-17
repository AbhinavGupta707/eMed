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

const voiceRoute = {
  selection: {
    status: "fallback" as const,
    selectedModuleId: "voice.local.baseline",
    reason: "provider_failure" as const,
    patientRationale: "The safe local route remains available.",
    failure: null
  },
  candidates: [
    {
      id: "voice.local.baseline",
      kind: "voice_biomarker" as const,
      label: "Optional research voice signal",
      description: "A local sustained-vowel signal; not a diagnosis.",
      producesFactKeys: ["voice_biomarker_observation" as const],
      availability: { status: "available" as const },
      estimatedBurdenSeconds: 20,
      deterministicRank: 1
    }
  ],
  selectedModuleId: "voice.local.baseline",
  medicationConfirmed: false,
  medicationSkipped: false,
  voiceBiomarkerCompleted: false,
  voiceBiomarkerSkipped: false
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

  it("uses the typed start, submit, and skip boundaries for optional voice evidence", async () => {
    const selectedRound = { ...round, state: "assessment_selected", stateVersion: 3 };
    const session = {
      round: selectedRound,
      assessmentSessionId: "f5422011-c60c-4de3-9d5b-0e1757af3526",
      provider: "local_voice_features",
      attestation: "a".repeat(32),
      expiresAt: "2026-07-17T12:05:00.000Z"
    };
    const retryResult = {
      status: "retry" as const,
      quality: {
        status: "retry" as const,
        score: 0.4,
        reasons: ["excessive_noise" as const],
        metrics: {
          sampleRateHz: 48_000,
          durationMs: 8_000,
          clippingFraction: 0.001,
          voicedFraction: 0.5,
          estimatedSnrDb: 7
        }
      }
    };
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      const path = new URL(String(url)).pathname;
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      if (path.endsWith("/session")) {
        expect(body).toEqual({ expectedStateVersion: 3 });
        return new Response(JSON.stringify({ data: session, meta }), { status: 200 });
      }
      if (path.endsWith("/skip")) {
        expect(body).toEqual({ expectedStateVersion: 3, reason: "patient_declined" });
        return new Response(
          JSON.stringify({
            data: {
              round: selectedRound,
              evidenceRoute: { ...voiceRoute, voiceBiomarkerSkipped: true }
            },
            meta
          }),
          { status: 200 }
        );
      }
      expect(path).toBe(`/api/rounds/${ROUND_ID}/voice-biomarker`);
      expect(body).toEqual({
        expectedStateVersion: 3,
        result: retryResult,
        attestation: session.attestation
      });
      return new Response(
        JSON.stringify({
          data: { round: selectedRound, result: retryResult, evidenceRoute: voiceRoute },
          meta
        }),
        { status: 200 }
      );
    });
    const client = new HomeRoundsApiClient({ baseUrl: "http://localhost:3000", fetcher });

    await expect(
      client.startVoiceBiomarker(ROUND_ID, { expectedStateVersion: 3 })
    ).resolves.toEqual(session);
    await expect(
      client.submitVoiceBiomarker(ROUND_ID, {
        expectedStateVersion: 3,
        result: retryResult,
        attestation: session.attestation
      })
    ).resolves.toMatchObject({ result: retryResult });
    await expect(
      client.skipVoiceBiomarker(ROUND_ID, {
        expectedStateVersion: 3,
        reason: "patient_declined"
      })
    ).resolves.toMatchObject({ evidenceRoute: { voiceBiomarkerSkipped: true } });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
