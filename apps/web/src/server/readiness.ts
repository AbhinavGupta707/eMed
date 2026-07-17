import type { ServerRuntime } from "./runtime";

const PROBE_ROUND_ID = "00000000-0000-4000-8000-000000000000";

function readinessResponse(
  status: 200 | 503,
  body: { status: "ready" | "unavailable" },
  runtimeProfile: ServerRuntime["runtimeProfile"]
): Response {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "x-homerounds-runtime-profile": runtimeProfile
    }
  });
}

export async function handleReadiness(runtime: ServerRuntime): Promise<Response> {
  if (runtime.environment.APP_ENV === "demo" && runtime.runtimeProfile !== "postgres") {
    return readinessResponse(503, { status: "unavailable" }, runtime.runtimeProfile);
  }

  try {
    await runtime.repository.getRound(PROBE_ROUND_ID);
    return readinessResponse(200, { status: "ready" }, runtime.runtimeProfile);
  } catch {
    return readinessResponse(503, { status: "unavailable" }, runtime.runtimeProfile);
  }
}
