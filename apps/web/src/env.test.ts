import { describe, expect, it } from "vitest";

import { parseServerEnvironment } from "./env";

describe("server environment safety profile", () => {
  it("starts in a complete no-key development profile", () => {
    const environment = parseServerEnvironment({});

    expect(environment.VOICE_PROVIDER).toBe("disabled");
    expect(environment.INFERENCE_PROVIDER).toBe("disabled");
    expect(environment.ADAPTIVE_SELECTION_ENABLED).toBe(false);
    expect(environment.MEDICATION_LABEL_AI_ENABLED).toBe(false);
    expect(environment.OPTICAL_ASSESSMENT_PROVIDER).toBe("finger_ppg");
    expect(environment.STORE_RAW_MEDIA).toBe(false);
  });

  it("rejects ElevenLabs selection without server credentials", () => {
    expect(() => parseServerEnvironment({ VOICE_PROVIDER: "elevenlabs" })).toThrow();
  });

  it("rejects VitalLens release selection without its proxy and key", () => {
    expect(() => parseServerEnvironment({ OPTICAL_ASSESSMENT_PROVIDER: "vitallens" })).toThrow();
  });

  it("rejects Fireworks selection without a server-only credential", () => {
    expect(() => parseServerEnvironment({ INFERENCE_PROVIDER: "fireworks" })).toThrow();
  });

  it("allows keyless fake inference but rejects enabled AI with no provider", () => {
    expect(
      parseServerEnvironment({
        INFERENCE_PROVIDER: "fake",
        ADAPTIVE_SELECTION_ENABLED: "true",
        MEDICATION_LABEL_AI_ENABLED: "true"
      }).INFERENCE_PROVIDER
    ).toBe("fake");
    expect(() => parseServerEnvironment({ ADAPTIVE_SELECTION_ENABLED: "true" })).toThrow();
    expect(() => parseServerEnvironment({ MEDICATION_LABEL_AI_ENABLED: "true" })).toThrow();
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

  it("fails closed when hosted demo persistence or access control is absent", () => {
    expect(() => parseServerEnvironment({ APP_ENV: "demo" })).toThrow();
    expect(() =>
      parseServerEnvironment({
        APP_ENV: "demo",
        DATABASE_URL: "postgresql://example.invalid/homerounds"
      })
    ).toThrow();
    expect(() =>
      parseServerEnvironment({
        APP_ENV: "demo",
        DEMO_ACCESS_SECRET: "synthetic-demo-secret"
      })
    ).toThrow();

    expect(
      parseServerEnvironment({
        APP_ENV: "demo",
        APP_BASE_URL: "https://demo.example",
        DATABASE_URL: "postgresql://example.invalid/homerounds",
        DEMO_ACCESS_SECRET: "synthetic-demo-secret"
      }).APP_ENV
    ).toBe("demo");
  });
});
