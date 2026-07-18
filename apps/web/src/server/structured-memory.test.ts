import { ApiSuccessEnvelopeSchema, StructuredMemoryDataSchema } from "@homerounds/api-client";
import { describe, expect, it } from "vitest";

import { parseServerEnvironment } from "../env";
import { createServerRuntime } from "./runtime";
import { handleGetStructuredMemory, handleUpdateStructuredMemory } from "./structured-memory";

const NOW = "2026-07-18T12:00:00.000Z";

function runtime() {
  return createServerRuntime({
    environment: parseServerEnvironment({
      APP_ENV: "development",
      APP_BASE_URL: "http://localhost:3000",
      PERSISTENCE_PROVIDER: "memory",
      DEMO_MODE: "true"
    }),
    now: () => NOW
  });
}

function request(method: "GET" | "POST", body?: unknown): Request {
  return new Request("http://localhost:3000/api/memory", {
    method,
    headers: {
      origin: "http://localhost:3000",
      "x-homerounds-demo-role": "patient",
      ...(body === undefined ? {} : { "content-type": "application/json" })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
}

async function projection(response: Response) {
  expect(response.status, await response.clone().text()).toBe(200);
  return ApiSuccessEnvelopeSchema(StructuredMemoryDataSchema).parse(await response.json()).data
    .projection;
}

describe("structured memory API boundary", () => {
  it("requires consent, persists a bounded value, corrects it, then deletes it", async () => {
    const server = runtime();
    const initial = await projection(await handleGetStructuredMemory(request("GET"), server));
    expect(initial).toMatchObject({ storeVersion: 1, consentStatus: "not_requested", entries: [] });

    const consented = await projection(
      await handleUpdateStructuredMemory(
        request("POST", {
          kind: "consent",
          expectedStoreVersion: 1,
          mutationId: "11111111-1111-4111-8111-111111111111",
          consent: {
            status: "granted",
            policyVersion: "structured-memory-consent-v1",
            decisionId: "22222222-2222-4222-8222-222222222222",
            decidedAt: NOW
          },
          occurredAt: NOW
        }),
        server
      )
    );
    expect(consented).toMatchObject({ storeVersion: 2, consentStatus: "granted" });

    const source = {
      schemaVersion: "structured-memory-source.v1",
      kind: "patient_confirmation",
      sourceId: "confirmed-device-choice",
      confirmationId: "88888888-8888-4888-8888-888888888888",
      sourceTimestamp: NOW,
      recordedAt: NOW,
      structuredOnly: true,
      transcriptStored: false,
      rawMediaStored: false,
      promptStored: false,
      providerPayloadStored: false
    } as const;
    const set = await projection(
      await handleUpdateStructuredMemory(
        request("POST", {
          kind: "mutate",
          mutation: {
            operation: "set",
            mutationId: "33333333-3333-4333-8333-333333333333",
            expectedStoreVersion: 2,
            memoryId: "44444444-4444-4444-8444-444444444444",
            key: "round_device",
            value: { kind: "code", code: "phone" },
            source,
            occurredAt: NOW
          }
        }),
        server
      )
    );
    expect(set.entries).toEqual([
      expect.objectContaining({ key: "round_device", value: { kind: "code", code: "phone" } })
    ]);

    const corrected = await projection(
      await handleUpdateStructuredMemory(
        request("POST", {
          kind: "mutate",
          mutation: {
            operation: "correct",
            mutationId: "99999999-9999-4999-8999-999999999999",
            expectedStoreVersion: 3,
            memoryId: "44444444-4444-4444-8444-444444444444",
            key: "round_device",
            expectedMemoryVersion: 1,
            value: { kind: "code", code: "desktop" },
            source,
            occurredAt: NOW
          }
        }),
        server
      )
    );
    expect(corrected.entries).toEqual([
      expect.objectContaining({
        key: "round_device",
        memoryVersion: 2,
        correctedFromVersion: 1,
        value: { kind: "code", code: "desktop" }
      })
    ]);

    const deleted = await projection(
      await handleUpdateStructuredMemory(
        request("POST", {
          kind: "mutate",
          mutation: {
            operation: "delete",
            mutationId: "55555555-5555-4555-8555-555555555555",
            expectedStoreVersion: 4,
            memoryId: "44444444-4444-4444-8444-444444444444",
            key: "round_device",
            expectedMemoryVersion: 2,
            source,
            occurredAt: NOW
          }
        }),
        server
      )
    );
    expect(deleted).toMatchObject({ storeVersion: 5, entries: [] });
    expect(deleted.recentDeletions).toHaveLength(1);
    expect(JSON.stringify(deleted)).not.toMatch(
      /raw(audio|video|frame)|providerPayload|modelReasoning/i
    );
  });

  it("rejects a stale mutation without changing the stored projection", async () => {
    const server = runtime();
    await handleGetStructuredMemory(request("GET"), server);
    const response = await handleUpdateStructuredMemory(
      request("POST", {
        kind: "consent",
        expectedStoreVersion: 9,
        mutationId: "66666666-6666-4666-8666-666666666666",
        consent: {
          status: "granted",
          policyVersion: "structured-memory-consent-v1",
          decisionId: "77777777-7777-4777-8777-777777777777",
          decidedAt: NOW
        },
        occurredAt: NOW
      }),
      server
    );
    expect(response.status).toBe(409);
    const unchanged = await projection(await handleGetStructuredMemory(request("GET"), server));
    expect(unchanged).toMatchObject({ storeVersion: 1, consentStatus: "not_requested" });
  });
});
