"use client";

import { ApiSuccessEnvelopeSchema, ElevenLabsCredentialDataSchema } from "@homerounds/api-client";
import { VoiceServerLocationSchema, type VoiceServerLocation } from "@homerounds/contracts/voice";

import {
  ElevenLabsSessionCredentialSchema,
  VoiceCredentialError,
  type VoiceCredentialFetcher
} from "./elevenlabs-adapter";

const CredentialEnvelopeSchema = ApiSuccessEnvelopeSchema(ElevenLabsCredentialDataSchema);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Checkpoint integration owns the shared API schema update. Until that merge,
 * accept exactly its frozen `serverLocation` addition while retaining the
 * current envelope schema for every other field.
 */
function parseCredentialEnvelope(rawEnvelope: unknown): Readonly<{
  envelope: ReturnType<typeof CredentialEnvelopeSchema.parse>;
  serverLocation?: VoiceServerLocation;
}> | null {
  const rawData = isRecord(rawEnvelope) && isRecord(rawEnvelope.data) ? rawEnvelope.data : null;
  const location = VoiceServerLocationSchema.safeParse(rawData?.serverLocation);
  const direct = CredentialEnvelopeSchema.safeParse(rawEnvelope);
  if (direct.success) {
    return {
      envelope: direct.data,
      ...(location.success ? { serverLocation: location.data } : {})
    };
  }
  if (!rawData || !location.success) return null;

  const dataWithoutLocation = { ...rawData };
  delete dataWithoutLocation.serverLocation;
  const compatible = CredentialEnvelopeSchema.safeParse({
    ...(isRecord(rawEnvelope) ? rawEnvelope : {}),
    data: dataWithoutLocation
  });
  if (!compatible.success) return null;
  return { envelope: compatible.data, serverLocation: location.data };
}

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
    const parsedEnvelope = parseCredentialEnvelope(rawEnvelope);
    if (!parsedEnvelope) throw new VoiceCredentialError("provider");
    const { envelope } = parsedEnvelope;

    if (envelope.data.status === "unavailable") {
      const reason = envelope.data.reason;
      throw new VoiceCredentialError(
        reason === "disabled" || reason === "missing_configuration"
          ? "missing_configuration"
          : reason
      );
    }

    if (!parsedEnvelope.serverLocation) throw new VoiceCredentialError("provider");

    try {
      return ElevenLabsSessionCredentialSchema.parse({
        provider: "elevenlabs",
        connectionType: "webrtc",
        conversationToken: envelope.data.token,
        expiresAt: envelope.data.expiresAt,
        serverLocation: parsedEnvelope.serverLocation
      });
    } catch {
      throw new VoiceCredentialError("provider");
    }
  };
}
