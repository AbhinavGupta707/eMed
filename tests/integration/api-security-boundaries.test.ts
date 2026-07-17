import {
  ApiErrorEnvelopeSchema,
  ApiSuccessEnvelopeSchema,
  CreateRoundDataSchema,
  ElevenLabsCredentialDataSchema
} from "../../packages/api-client/src/index";
import { describe, expect, it } from "vitest";

import { parseServerEnvironment } from "../../apps/web/src/env";
import {
  handleCreateRound,
  handleElevenLabsCredential,
  handleQueue
} from "../../apps/web/src/server/route-handlers";
import { createServerRuntime } from "../../apps/web/src/server/runtime";

const NOW = "2026-07-17T12:00:00.000Z";

function idFactory(): () => string {
  let value = 1;
  return () => `50000000-0000-4000-8000-${String(value++).padStart(12, "0")}`;
}

function request(
  path: string,
  options: {
    method?: "GET" | "POST";
    body?: unknown;
    role?: "patient" | "clinician";
    origin?: string;
    correlationId?: string;
  } = {}
): Request {
  const method = options.method ?? "POST";
  const headers = new Headers({
    "x-correlation-id": options.correlationId ?? "security-boundary",
    "x-homerounds-demo-role": options.role ?? "patient"
  });
  if (method === "POST") {
    headers.set("content-type", "application/json");
    headers.set("origin", options.origin ?? "http://localhost:3000");
  }
  return new Request(`http://localhost:3000${path}`, {
    method,
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) })
  });
}

function createRoundBody(triggerId: string, patientId = "synthetic-maya") {
  return {
    patientId,
    triggerId,
    purpose: "Synthetic API security boundary fixture",
    protocolId: "cardiometabolic_demo",
    burdenSeconds: 90
  };
}

async function errorCode(response: Response): Promise<string> {
  return ApiErrorEnvelopeSchema.parse(await response.json()).error.code;
}

describe("repository-backed API security boundaries", () => {
  it("enforces patient scope before creating work", async () => {
    const runtime = createServerRuntime({
      environment: parseServerEnvironment({}),
      now: () => NOW,
      createId: idFactory()
    });
    const response = await handleCreateRound(
      request("/api/rounds", {
        body: createRoundBody("homerounds-test:foreign-patient", "synthetic-aisha")
      }),
      runtime
    );

    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe("forbidden");
  });

  it("enforces patient and clinician role separation", async () => {
    const runtime = createServerRuntime({
      environment: parseServerEnvironment({}),
      now: () => NOW,
      createId: idFactory()
    });
    const patientQueue = await handleQueue(
      request("/api/clinician/queue?roundId=50000000-0000-4000-8000-000000000001", {
        method: "GET",
        role: "patient"
      }),
      runtime
    );
    const clinicianCreate = await handleCreateRound(
      request("/api/rounds", {
        role: "clinician",
        body: createRoundBody("homerounds-test:clinician-create")
      }),
      runtime
    );

    expect(patientQueue.status).toBe(403);
    expect(await errorCode(patientQueue)).toBe("forbidden");
    expect(clinicianCreate.status).toBe(403);
    expect(await errorCode(clinicianCreate)).toBe("forbidden");
  });

  it("rejects foreign origins before mutation", async () => {
    const runtime = createServerRuntime({
      environment: parseServerEnvironment({}),
      now: () => NOW,
      createId: idFactory()
    });
    const body = createRoundBody("homerounds-test:origin-rejection");
    const rejected = await handleCreateRound(
      request("/api/rounds", {
        origin: "https://attacker.invalid",
        correlationId: "foreign-origin",
        body
      }),
      runtime
    );
    expect(rejected.status).toBe(403);
    expect(await errorCode(rejected)).toBe("origin_rejected");

    const accepted = await handleCreateRound(
      request("/api/rounds", { correlationId: "same-origin", body }),
      runtime
    );
    expect(accepted.status).toBe(200);
    expect(
      ApiSuccessEnvelopeSchema(CreateRoundDataSchema).parse(await accepted.json()).data.created
    ).toBe(true);
  });

  it("rate-limits repeated voice credential requests per session", async () => {
    const runtime = createServerRuntime({
      environment: parseServerEnvironment({}),
      now: () => NOW,
      createId: idFactory()
    });
    const responses: Response[] = [];
    for (let index = 0; index < 6; index += 1) {
      responses.push(
        await handleElevenLabsCredential(
          request("/api/providers/elevenlabs/session", {
            body: {},
            correlationId: `voice-rate-${index}`
          }),
          runtime
        )
      );
    }

    for (const response of responses.slice(0, 5)) {
      expect(response.status).toBe(200);
      expect(
        ApiSuccessEnvelopeSchema(ElevenLabsCredentialDataSchema).parse(await response.json()).data
      ).toEqual({ status: "unavailable", reason: "disabled" });
    }
    const limited = responses[5];
    if (!limited) throw new Error("Expected the sixth rate-limited response.");
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    expect(await errorCode(limited)).toBe("rate_limited");
  });
});
