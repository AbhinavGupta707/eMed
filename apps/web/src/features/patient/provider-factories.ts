"use client";

import {
  BrowserVitalLensCameraGateway,
  BrowserVitalLensConsentGateway,
  VitalLensProxyResponseSchema,
  VitalLensTransportError,
  createFingerPpgProvider,
  createLocalVoiceBiomarkerProvider,
  createVitalLensAssessmentProvider,
  type OpticalAssessmentProvider,
  type OpticalProviderKind,
  type VitalLensConsentGateway,
  type VitalLensProviderConfiguration,
  type VitalLensProxyTransport
} from "@homerounds/assessments";
import { ApiSuccessEnvelopeSchema } from "@homerounds/api-client";
import type { VoiceBiomarkerProvider } from "@homerounds/contracts";
import { SyntheticVoiceSessionProvider, type VoiceSessionProvider } from "@homerounds/voice";

import {
  ElevenLabsReactVoiceSessionProvider,
  createHomeRoundsVoiceCredentialFetcher
} from "../voice";

const VITALLENS_PROXY_PATH = "/api/providers/vitallens/proxy";
const VITALLENS_PROVIDER_VERSION = "vitallens-2.0";
const VITALLENS_CONSENT_VERSION = "homerounds-vital-signs-demo-v1";
const VitalLensProxyEnvelopeSchema = ApiSuccessEnvelopeSchema(VitalLensProxyResponseSchema);

function currentBrowserOrigin(): string | undefined {
  return typeof window === "undefined" ? undefined : window.location.origin;
}

function vitalLensBrowserConfiguration(): VitalLensProviderConfiguration | undefined {
  const homeRoundsOrigin = currentBrowserOrigin();
  if (homeRoundsOrigin === undefined) return undefined;
  return {
    environment: process.env.NODE_ENV === "production" ? "production" : "development",
    homeRoundsOrigin,
    proxyPath: VITALLENS_PROXY_PATH,
    providerVersion: VITALLENS_PROVIDER_VERSION,
    consentVersion: VITALLENS_CONSENT_VERSION,
    captureDurationMs: 30_000,
    requestTimeoutMs: 20_000,
    maxPayloadBytes: 5_000_000
  };
}

export function createHomeRoundsVitalLensProxyTransport(
  fetcher: typeof fetch = fetch
): VitalLensProxyTransport {
  return {
    async send(request) {
      const browserOrigin = currentBrowserOrigin();
      let endpoint: URL;
      try {
        endpoint = new URL(request.endpoint);
      } catch {
        throw new VitalLensTransportError("provider_failure");
      }
      if (
        browserOrigin === undefined ||
        endpoint.origin !== browserOrigin ||
        endpoint.pathname !== VITALLENS_PROXY_PATH ||
        endpoint.search !== "" ||
        endpoint.hash !== ""
      ) {
        throw new VitalLensTransportError("provider_failure");
      }

      const body = Uint8Array.from(request.payload.bytes);
      try {
        const response = await fetcher(endpoint, {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: {
            "content-type": "application/octet-stream",
            "x-homerounds-provider-version": request.providerVersion,
            "x-homerounds-request-id": request.requestId,
            "x-homerounds-consent-version": request.consent.version,
            "x-homerounds-consent-granted-at": request.consent.grantedAt,
            "x-homerounds-payload-metadata": JSON.stringify(request.payload.metadata)
          },
          body,
          signal: request.signal
        });
        if (!response.ok) {
          throw new VitalLensTransportError(response.status === 429 ? "quota" : "provider_failure");
        }
        const envelope = VitalLensProxyEnvelopeSchema.safeParse(await response.json());
        if (!envelope.success) throw new VitalLensTransportError("provider_failure");
        return envelope.data.data;
      } catch (error: unknown) {
        if (request.signal.aborted) throw new VitalLensTransportError("cancelled");
        if (error instanceof VitalLensTransportError) throw error;
        if (error instanceof TypeError) throw new VitalLensTransportError("network_failure");
        throw new VitalLensTransportError("provider_failure");
      } finally {
        body.fill(0);
      }
    }
  };
}

/** Resolves only the provider selected by the server for this round. */
export function createPatientOpticalProvider(
  kind: OpticalProviderKind,
  options: Readonly<{ vitalLensConsent?: VitalLensConsentGateway }> = {}
): OpticalAssessmentProvider {
  switch (kind) {
    case "finger_ppg":
      return createFingerPpgProvider();
    case "vitallens":
      return createVitalLensAssessmentProvider({
        configuration: vitalLensBrowserConfiguration(),
        consent: options.vitalLensConsent ?? new BrowserVitalLensConsentGateway(),
        camera: new BrowserVitalLensCameraGateway(),
        transport: createHomeRoundsVitalLensProxyTransport()
      });
  }
}

export function createPatientVoiceProvider(): VoiceSessionProvider {
  const fixture = process.env.NEXT_PUBLIC_VOICE_TEST_FIXTURE;
  if (fixture !== undefined) {
    if (fixture !== "synthetic") {
      throw new Error("Unsupported browser voice test fixture.");
    }
    if (process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test") {
      throw new Error("The synthetic browser voice fixture is forbidden in production builds.");
    }
    return new SyntheticVoiceSessionProvider();
  }
  return new ElevenLabsReactVoiceSessionProvider({
    fetchCredential: createHomeRoundsVoiceCredentialFetcher()
  });
}

/** Creates the consent-gated, in-browser sustained-vowel provider. Raw PCM never leaves memory. */
export function createPatientVoiceBiomarkerProvider(): VoiceBiomarkerProvider {
  return createLocalVoiceBiomarkerProvider({ captureDurationMs: 7_000 });
}
