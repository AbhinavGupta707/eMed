import { InMemoryHomeRoundsRepository } from "@homerounds/persistence";
import { describe, expect, it, vi } from "vitest";

import { parseServerEnvironment } from "../env";
import { handleReadiness } from "./readiness";
import { createServerRuntime, type ServerRuntime } from "./runtime";

const environment = parseServerEnvironment({
  APP_ENV: "demo",
  APP_BASE_URL: "https://demo.example",
  DATABASE_URL: "postgresql://example.invalid/homerounds",
  DEMO_ACCESS_SECRET: "synthetic-hosted-demo-secret"
});

function repository(): ServerRuntime["repository"] {
  return new InMemoryHomeRoundsRepository();
}

describe("readiness boundary", () => {
  it("probes the repository and reports the durable hosted profile", async () => {
    const store = repository();
    const getRound = vi.spyOn(store, "getRound");
    const runtime = createServerRuntime({
      environment,
      repository: store,
      runtimeProfile: "postgres"
    });

    const response = await handleReadiness(runtime);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-homerounds-runtime-profile")).toBe("postgres");
    expect(await response.json()).toEqual({ status: "ready" });
    expect(getRound).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000000");
  });

  it("fails closed when hosted demo runtime is not PostgreSQL", async () => {
    const store = repository();
    const getRound = vi.spyOn(store, "getRound");
    const runtime = createServerRuntime({
      environment,
      repository: store,
      runtimeProfile: "in_memory_demo_fallback"
    });

    const response = await handleReadiness(runtime);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable" });
    expect(getRound).not.toHaveBeenCalled();
  });

  it("returns an opaque unavailable response when the repository probe fails", async () => {
    const store = repository();
    vi.spyOn(store, "getRound").mockRejectedValue(new Error("private database detail"));
    const runtime = createServerRuntime({
      environment,
      repository: store,
      runtimeProfile: "postgres"
    });

    const response = await handleReadiness(runtime);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable" });
  });
});
