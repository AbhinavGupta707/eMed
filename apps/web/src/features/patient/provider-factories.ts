"use client";

import {
  createFingerPpgProvider,
  createVitalLensAssessmentProvider,
  type OpticalAssessmentProvider,
  type OpticalProviderKind
} from "@homerounds/assessments";
import type { VoiceSessionProvider } from "@homerounds/voice";

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
  return new ElevenLabsReactVoiceSessionProvider({
    fetchCredential: createHomeRoundsVoiceCredentialFetcher()
  });
}
