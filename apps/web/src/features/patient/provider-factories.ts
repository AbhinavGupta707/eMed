"use client";

import {
  createFingerPpgProvider,
  createLocalVoiceBiomarkerProvider,
  createVitalLensAssessmentProvider,
  type OpticalAssessmentProvider,
  type OpticalProviderKind
} from "@homerounds/assessments";
import type { VoiceBiomarkerProvider } from "@homerounds/contracts";
import { SyntheticVoiceSessionProvider, type VoiceSessionProvider } from "@homerounds/voice";

import {
  ElevenLabsReactVoiceSessionProvider,
  createHomeRoundsVoiceCredentialFetcher
} from "../voice";

/** Resolves only the provider selected by the server for this round. */
export function createPatientOpticalProvider(kind: OpticalProviderKind): OpticalAssessmentProvider {
  switch (kind) {
    case "finger_ppg":
      return createFingerPpgProvider();
    case "vitallens":
      // The provider remains explicitly unavailable until integration supplies the
      // audited browser camera/payload gateway. It must never fall back to finger PPG.
      return createVitalLensAssessmentProvider({
        consent: {
          requestConsent: () => Promise.resolve({ granted: false })
        },
        camera: {
          checkCapability: () =>
            Promise.resolve({ available: false, reason: "unsupported_device" }),
          openFrontCamera: () => Promise.reject(new Error("VitalLens camera gateway unavailable"))
        },
        transport: {
          send: () => Promise.reject(new Error("VitalLens proxy gateway unavailable"))
        }
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
