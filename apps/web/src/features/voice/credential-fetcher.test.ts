import { describe, expect, it, vi } from "vitest";

import { createHomeRoundsVoiceCredentialFetcher } from "./credential-fetcher";
import { VoiceCredentialError } from "./elevenlabs-adapter";

const ROUND_ID = "cc80d269-2f79-4328-a129-98cac85219e4";

function request(signal = new AbortController().signal) {
  return { roundId: ROUND_ID, phase: "patient_report" as const, signal };
}

function apiResponse(data: unknown, status = 200): Response {
  return new Response(
    JSON.stringify({
      data,
      meta: {
        correlationId: "correlation-voice-test",
        runtimeProfile: "server_provider_boundary"
      }
    }),
    { status, headers: { "content-type": "application/json" } }
  );
}

describe("HomeRounds voice credential fetcher", () => {
  it("maps the server-only credential envelope into the narrow WebRTC client contract", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      apiResponse({
        status: "available",
        token: "short-lived-conversation-token",
        agentId: "agent_synthetic",
        expiresAt: "2026-07-17T10:00:00.000Z",
        maxSessionSeconds: 120
      })
    );
    const signal = new AbortController().signal;
    const credential = await createHomeRoundsVoiceCredentialFetcher({ fetcher })(request(signal));

    expect(credential).toEqual({
      provider: "elevenlabs",
      connectionType: "webrtc",
      conversationToken: "short-lived-conversation-token",
      expiresAt: "2026-07-17T10:00:00.000Z"
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/providers/elevenlabs/session",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        cache: "no-store",
        body: "{}",
        signal
      })
    );
    expect(JSON.stringify(fetcher.mock.calls)).not.toContain("agent_synthetic");
  });

  it.each(["disabled", "missing_configuration"] as const)(
    "keeps text available when the hosted provider is %s",
    async (reason) => {
      const credential = createHomeRoundsVoiceCredentialFetcher({
        fetcher: vi.fn(async () => apiResponse({ status: "unavailable", reason }))
      });

      await expect(credential(request())).rejects.toMatchObject({
        name: "VoiceCredentialError",
        code: "missing_configuration"
      });
    }
  );

  it("normalizes rate limits, malformed envelopes, and network failures", async () => {
    const quota = createHomeRoundsVoiceCredentialFetcher({
      fetcher: vi.fn(async () => new Response(null, { status: 429 }))
    });
    const malformed = createHomeRoundsVoiceCredentialFetcher({
      fetcher: vi.fn(async () => apiResponse({ status: "available", token: "exposed" }))
    });
    const network = createHomeRoundsVoiceCredentialFetcher({
      fetcher: vi.fn(async () => {
        throw new TypeError("sensitive network detail");
      })
    });

    await expect(quota(request())).rejects.toMatchObject({ code: "quota" });
    await expect(malformed(request())).rejects.toMatchObject({ code: "provider" });
    await expect(network(request())).rejects.toMatchObject({ code: "network" });
  });

  it("does not replace caller cancellation with a provider-facing error", async () => {
    const controller = new AbortController();
    controller.abort();
    const abortError = new DOMException("The operation was aborted", "AbortError");
    const credential = createHomeRoundsVoiceCredentialFetcher({
      fetcher: vi.fn(async () => {
        throw abortError;
      })
    });

    await expect(credential(request(controller.signal))).rejects.toBe(abortError);
    expect(abortError).not.toBeInstanceOf(VoiceCredentialError);
  });
});
