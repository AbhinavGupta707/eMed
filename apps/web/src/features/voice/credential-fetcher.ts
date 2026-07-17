"use client";

import { ApiSuccessEnvelopeSchema, ElevenLabsCredentialDataSchema } from "@homerounds/api-client";

import {
  ElevenLabsSessionCredentialSchema,
  VoiceCredentialError,
  type VoiceCredentialFetcher
} from "./elevenlabs-adapter";

const CredentialEnvelopeSchema = ApiSuccessEnvelopeSchema(ElevenLabsCredentialDataSchema);

export type HomeRoundsVoiceCredentialFetcherOptions = Readonly<{
  endpoint?: string;
  fetcher?: typeof fetch;
}>;

export function createHomeRoundsVoiceCredentialFetcher(
  options: HomeRoundsVoiceCredentialFetcherOptions = {}
): VoiceCredentialFetcher {
  const endpoint = options.endpoint ?? "/api/providers/elevenlabs/session";
  const fetcher = options.fetcher ?? fetch;

  return async ({ signal }) => {
    let response: Response;
    try {
      response = await fetcher(endpoint, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: "{}",
        signal
      });
    } catch (error: unknown) {
      if (signal.aborted) throw error;
      throw new VoiceCredentialError("network");
    }

    if (!response.ok) {
      throw new VoiceCredentialError(response.status === 429 ? "quota" : "provider");
    }

    let rawEnvelope: unknown;
    try {
      rawEnvelope = await response.json();
    } catch {
      throw new VoiceCredentialError("provider");
    }
    const parsedEnvelope = CredentialEnvelopeSchema.safeParse(rawEnvelope);
    if (!parsedEnvelope.success) throw new VoiceCredentialError("provider");
    const envelope = parsedEnvelope.data;

    if (envelope.data.status === "unavailable") {
      const reason = envelope.data.reason;
      throw new VoiceCredentialError(
        reason === "disabled" || reason === "missing_configuration"
          ? "missing_configuration"
          : reason
      );
    }

    try {
      return ElevenLabsSessionCredentialSchema.parse({
        provider: "elevenlabs",
        connectionType: "webrtc",
        conversationToken: envelope.data.token,
        expiresAt: envelope.data.expiresAt
      });
    } catch {
      throw new VoiceCredentialError("provider");
    }
  };
}
