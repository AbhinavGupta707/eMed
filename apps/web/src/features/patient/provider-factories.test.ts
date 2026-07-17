import { SyntheticVoiceSessionProvider } from "@homerounds/voice";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createPatientVoiceProvider } from "./provider-factories";

describe("patient provider factories", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("enables the keyless synthetic voice fixture only in development or tests", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("NEXT_PUBLIC_VOICE_TEST_FIXTURE", "synthetic");

    expect(createPatientVoiceProvider()).toBeInstanceOf(SyntheticVoiceSessionProvider);
  });

  it("rejects synthetic or unknown fixture controls in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_VOICE_TEST_FIXTURE", "synthetic");
    expect(() => createPatientVoiceProvider()).toThrow(/forbidden/i);

    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("NEXT_PUBLIC_VOICE_TEST_FIXTURE", "unknown");
    expect(() => createPatientVoiceProvider()).toThrow(/unsupported/i);
  });
});
