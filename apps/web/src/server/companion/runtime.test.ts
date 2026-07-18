import { afterEach, describe, expect, it, vi } from "vitest";

import type { CompanionRouteRuntime } from "./runtime";

type CompanionGlobalScope = typeof globalThis & {
  __homeRoundsCompanionRouteRuntime?: CompanionRouteRuntime;
};

const scope = globalThis as CompanionGlobalScope;
const originalRuntime = scope.__homeRoundsCompanionRouteRuntime;

afterEach(() => {
  if (originalRuntime) {
    scope.__homeRoundsCompanionRouteRuntime = originalRuntime;
  } else {
    delete scope.__homeRoundsCompanionRouteRuntime;
  }
  vi.resetModules();
});

describe("companion route runtime", () => {
  it("preserves an installed runtime across route-module recompilation", async () => {
    const installed = { available: false } as CompanionRouteRuntime;
    const initialModule = await import("./runtime");
    initialModule.installCompanionRouteRuntimeForIntegration(installed);

    vi.resetModules();
    const recompiledModule = await import("./runtime");

    expect(recompiledModule.getCompanionRouteRuntime()).toBe(installed);
  }, 15_000);
});
