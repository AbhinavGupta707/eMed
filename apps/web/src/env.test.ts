import { describe, expect, it } from "vitest";

import { parseServerEnvironment } from "./env";

describe("server environment safety profile", () => {
  it("starts in a complete no-key development profile", () => {
    const environment = parseServerEnvironment({});

    expect(environment.VOICE_PROVIDER).toBe("disabled");
    expect(environment.OPTICAL_ASSESSMENT_PROVIDER).toBe("finger_ppg");
    expect(environment.STORE_RAW_MEDIA).toBe(false);
  });

  it("rejects ElevenLabs selection without server credentials", () => {
    expect(() => parseServerEnvironment({ VOICE_PROVIDER: "elevenlabs" })).toThrow();
  });

  it("rejects VitalLens release selection without its proxy and key", () => {
    expect(() => parseServerEnvironment({ OPTICAL_ASSESSMENT_PROVIDER: "vitallens" })).toThrow();
  });

  it("rejects raw-media storage in every profile", () => {
    expect(() => parseServerEnvironment({ STORE_RAW_MEDIA: "true" })).toThrow();
  });

  it("rejects demo or fixture behavior in production", () => {
    expect(() => parseServerEnvironment({ APP_ENV: "production" })).toThrow();
    expect(() =>
      parseServerEnvironment({
        APP_ENV: "production",
        DEMO_MODE: "false",
        FHIR_PROVIDER: "fixture"
      })
    ).toThrow();
  });
});
