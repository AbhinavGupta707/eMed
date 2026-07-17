import { describe, expect, it } from "vitest";

import {
  createDemoSessionAuthenticator,
  createSignedDemoSession,
  demoAccessSecretMatches,
  type DemoSession
} from "./identity";

const NOW = "2026-07-17T12:00:00.000Z";
const secret = "synthetic-demo-secret-value";
const session: DemoSession = {
  sessionId: "session-1",
  role: "patient",
  patientId: "synthetic-maya",
  expiresAt: "2026-07-17T13:00:00.000Z",
  dataClassification: "synthetic_demo"
};

describe("synthetic demo session boundary", () => {
  it("compares the operator access secret without a length-dependent comparison", () => {
    expect(demoAccessSecretMatches(secret, secret)).toBe(true);
    expect(demoAccessSecretMatches("wrong", secret)).toBe(false);
    expect(demoAccessSecretMatches(`${secret}-wrong`, secret)).toBe(false);
  });

  it("authenticates a signed, unexpired, synthetic-only cookie", async () => {
    const value = createSignedDemoSession(session, secret);
    const authenticator = createDemoSessionAuthenticator({
      appEnvironment: "demo",
      secret,
      now: () => NOW
    });
    const request = new Request("https://demo.example/api/rounds", {
      headers: { cookie: `homerounds_demo_session=${value}` }
    });

    await expect(authenticator.authenticate(request)).resolves.toEqual(session);
  });

  it("rejects tampering and expiry", async () => {
    const value = createSignedDemoSession(session, secret);
    const authenticator = createDemoSessionAuthenticator({
      appEnvironment: "demo",
      secret,
      now: () => "2026-07-17T14:00:00.000Z"
    });

    await expect(
      authenticator.authenticate(
        new Request("https://demo.example/api", {
          headers: { cookie: `homerounds_demo_session=${value.slice(0, -1)}x` }
        })
      )
    ).resolves.toBeNull();
    await expect(
      authenticator.authenticate(
        new Request("https://demo.example/api", {
          headers: { cookie: `homerounds_demo_session=${value}` }
        })
      )
    ).resolves.toBeNull();
  });

  it("permits an explicitly labelled loopback-only development seam without a secret", async () => {
    const authenticator = createDemoSessionAuthenticator({
      appEnvironment: "development",
      now: () => NOW
    });
    await expect(
      authenticator.authenticate(
        new Request("http://localhost:3000/api/clinician/queue", {
          headers: { "x-homerounds-demo-role": "clinician" }
        })
      )
    ).resolves.toMatchObject({
      role: "clinician",
      patientId: null,
      dataClassification: "synthetic_demo"
    });
    await expect(
      authenticator.authenticate(
        new Request("https://public.example/api", {
          headers: { "x-homerounds-demo-role": "clinician" }
        })
      )
    ).resolves.toBeNull();
  });
});
