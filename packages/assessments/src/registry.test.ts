import type {
  OpticalAssessmentProvider,
  OpticalAssessmentResult,
  OpticalProviderKind
} from "@homerounds/contracts/assessment";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_RELEASE_OPTICAL_PROVIDER,
  OpticalProviderRegistrationError,
  resolveReleaseOpticalProvider
} from "./registry";

function fixtureProvider(kind: OpticalProviderKind): OpticalAssessmentProvider {
  return {
    kind,
    checkAvailability: async () => ({ available: true, capabilities: {} }),
    capture: async (): Promise<OpticalAssessmentResult> => ({
      status: "unavailable",
      provider: kind,
      reason: "provider_unavailable"
    }),
    dispose: async () => undefined
  };
}

describe("release optical provider registry", () => {
  it("defaults release configuration to local finger PPG", () => {
    expect(DEFAULT_RELEASE_OPTICAL_PROVIDER).toBe("finger_ppg");
  });

  it.each(["finger_ppg", "vitallens"] as const)(
    "returns only the explicitly selected %s provider",
    (selected) => {
      const finger = fixtureProvider("finger_ppg");
      const vitalLens = fixtureProvider("vitallens");

      expect(
        resolveReleaseOpticalProvider({
          selected,
          providers: { finger_ppg: finger, vitallens: vitalLens }
        })
      ).toBe(selected === "finger_ppg" ? finger : vitalLens);
    }
  );

  it("fails closed instead of silently switching provider", () => {
    const finger = fixtureProvider("finger_ppg");

    expect(() =>
      resolveReleaseOpticalProvider({
        selected: "vitallens",
        providers: { finger_ppg: finger }
      })
    ).toThrow(OpticalProviderRegistrationError);
  });

  it("rejects a provider registered under the wrong provenance key", () => {
    expect(() =>
      resolveReleaseOpticalProvider({
        selected: "finger_ppg",
        providers: { finger_ppg: fixtureProvider("vitallens") }
      })
    ).toThrow(OpticalProviderRegistrationError);
  });
});
