import { InMemoryHomeRoundsRepository } from "@homerounds/persistence";
import { describe, expect, it } from "vitest";

import { parseServerEnvironment } from "../env";
import {
  handleDemoAccess,
  handlePublicDemoAccess,
  publicDemoSessionHref,
  safeDemoDestination
} from "./demo-access";
import { createServerRuntime } from "./runtime";

const NOW = "2026-07-17T12:00:00.000Z";
const SECRET = "synthetic-hosted-demo-secret";

function runtime() {
  let id = 0;
  return createServerRuntime({
    environment: parseServerEnvironment({
      APP_ENV: "demo",
      APP_BASE_URL: "https://demo.example",
      DATABASE_URL: "postgresql://example.invalid/homerounds",
      DEMO_ACCESS_SECRET: SECRET
    }),
    repository: new InMemoryHomeRoundsRepository(),
    runtimeProfile: "postgres",
    now: () => NOW,
    createId: () => `synthetic-session-${++id}`
  });
}

function request(body: unknown, origin = "https://demo.example"): Request {
  return new Request("https://demo.example/api/demo/session", {
    method: "POST",
    headers: { "content-type": "application/json", origin, "x-forwarded-for": "192.0.2.1" },
    body: JSON.stringify(body)
  });
}

describe("hosted demo access boundary", () => {
  it("starts a frictionless role-scoped guest session without exposing the signing secret", async () => {
    const server = runtime();
    const response = await handlePublicDemoAccess(
      new Request(
        "https://demo.example/api/demo/session?role=patient&next=%2Fround%3Fscenario%3Dmaya-happy-text",
        { headers: { "x-forwarded-for": "192.0.2.1" } }
      ),
      server
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://demo.example/round?scenario=maya-happy-text"
    );
    expect(response.headers.get("set-cookie")).toMatch(
      /HttpOnly; Secure; SameSite=Strict; Max-Age=3600/
    );
    expect(JSON.stringify([...response.headers.entries()])).not.toContain(SECRET);
  });

  it("keeps repeated judge entry frictionless", async () => {
    const server = runtime();
    const responses = await Promise.all(
      Array.from({ length: 40 }, () =>
        handlePublicDemoAccess(
          new Request(
            "https://demo.example/api/demo/session?role=patient&next=%2Fshowcase%2Fheart",
            { headers: { "x-forwarded-for": "192.0.2.10" } }
          ),
          server
        )
      )
    );

    expect(responses.every((response) => response.status === 303)).toBe(true);
  });

  it("rejects malformed public-session roles and keeps destinations role-scoped", async () => {
    const server = runtime();
    const malformed = await handlePublicDemoAccess(
      new Request("https://demo.example/api/demo/session?role=admin"),
      server
    );
    expect(malformed.status).toBe(400);
    expect(malformed.headers.get("set-cookie")).toBeNull();

    const crossRole = await handlePublicDemoAccess(
      new Request(
        "https://demo.example/api/demo/session?role=patient&next=https%3A%2F%2Fattacker.example",
        { headers: { "x-forwarded-for": "192.0.2.2" } }
      ),
      server
    );
    expect(crossRole.status).toBe(303);
    expect(crossRole.headers.get("location")).toBe(
      "https://demo.example/round?scenario=maya-happy-text"
    );
  });

  it("issues a bounded signed patient cookie and a safe relative destination", async () => {
    const server = runtime();
    const response = await handleDemoAccess(
      request({
        accessCode: SECRET,
        role: "patient",
        destination: "/round?scenario=maya-poor-quality"
      }),
      server
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: {
        role: "patient",
        redirectTo: "/round?scenario=maya-poor-quality",
        expiresAt: "2026-07-17T13:00:00.000Z"
      }
    });
    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toMatch(/HttpOnly; Secure; SameSite=Strict; Max-Age=3600/);
    const cookie = setCookie?.split(";")[0];
    expect(cookie).toBeTruthy();
    await expect(
      server.hooks.authenticator.authenticate(
        new Request("https://demo.example/api/rounds", { headers: { cookie: cookie! } })
      )
    ).resolves.toMatchObject({
      role: "patient",
      patientId: "synthetic-maya",
      dataClassification: "synthetic_demo"
    });
  });

  it("returns the same generic denial for a wrong access code and rejects another origin", async () => {
    const server = runtime();
    const wrongCode = await handleDemoAccess(
      request({ accessCode: "wrong", role: "clinician" }),
      server
    );
    expect(wrongCode.status).toBe(401);
    expect(await wrongCode.json()).toEqual({ error: "access_denied" });
    expect(wrongCode.headers.get("set-cookie")).toBeNull();

    const wrongOrigin = await handleDemoAccess(
      request({ accessCode: SECRET, role: "clinician" }, "https://attacker.example"),
      server
    );
    expect(wrongOrigin.status).toBe(403);
    expect(await wrongOrigin.json()).toEqual({ error: "access_denied" });
  });

  it("never turns a supplied destination into an open or cross-role redirect", () => {
    expect(publicDemoSessionHref("patient", "https://attacker.example")).toBe(
      "/api/demo/session?role=patient&next=%2Fround%3Fscenario%3Dmaya-happy-text"
    );
    expect(safeDemoDestination("patient", "https://attacker.example")).toBe(
      "/round?scenario=maya-happy-text"
    );
    expect(safeDemoDestination("patient", "/clinician")).toBe("/round?scenario=maya-happy-text");
    expect(safeDemoDestination("patient", "/showcase/copd")).toBe("/showcase/copd");
    expect(safeDemoDestination("patient", "/showcase/heart")).toBe("/showcase/heart");
    expect(safeDemoDestination("patient", "/showcase/glp1")).toBe("/showcase/glp1");
    expect(safeDemoDestination("patient", "/showcase/copd/phone")).toBe(
      "/round?scenario=maya-happy-text"
    );
    expect(
      safeDemoDestination("clinician", "/clinician?roundId=14df34c4-8204-4810-8113-37b63c963a91")
    ).toBe("/clinician?roundId=14df34c4-8204-4810-8113-37b63c963a91");
    expect(safeDemoDestination("clinician", "//attacker.example/clinician")).toBe("/clinician");
    expect(safeDemoDestination("clinician", "/clinician?role=system")).toBe("/clinician");
  });
});
