import { describe, expect, it, vi } from "vitest";

import { StructuredAdaptiveSelectionProvider } from "./adaptive-selection";
import {
  FireworksChatCompletionsTransport,
  type FireworksFetch,
  type FireworksTransportDependencies,
  type FireworksTransportPolicy
} from "./fireworks-transport";
import { routeInferenceTask } from "./model-router";
import type { InferenceSleep, StructuredCompletionRequest } from "./structured-transport";
import { adaptiveInputFixture, selectionDecisionFixture } from "./test-fixtures";

const ATTEMPT_ID = "71f1b1b2-9e60-44d7-bb87-cdf5f96059d4";
const NOW = new Date("2026-07-17T09:00:00.000Z");

const request: StructuredCompletionRequest = {
  task: "adaptive_module_selection",
  modality: "text",
  contractVersion: "adaptive-selection.v1",
  messages: [
    { role: "system", content: "Return a bounded synthetic JSON decision." },
    { role: "user", content: "Use only the supplied synthetic candidates." }
  ],
  responseSchemaName: "adaptive_selection_decision",
  responseSchema: {
    type: "object",
    properties: { decision: { type: "string" } },
    required: ["decision"],
    additionalProperties: false
  }
};

const policy: FireworksTransportPolicy = {
  timeoutMs: 5_000,
  maxAttempts: 3,
  initialRetryDelayMs: 20,
  maxRetryDelayMs: 100,
  maxResponseBytes: 16_384
};

function pendingSleep(): InferenceSleep {
  return (_delayMs, signal) =>
    new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new DOMException("Cancelled", "AbortError"));
        return;
      }
      signal.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")), {
        once: true
      });
      void resolve;
    });
}

function retryAwareSleep(retryDelays: number[]): InferenceSleep {
  return (delayMs, signal) => {
    if (delayMs >= policy.timeoutMs) {
      return pendingSleep()(delayMs, signal);
    }
    retryDelays.push(delayMs);
    return Promise.resolve();
  };
}

function dependencies(
  fetch: FireworksFetch,
  sleep: InferenceSleep = pendingSleep()
): FireworksTransportDependencies {
  return {
    fetch,
    sleep,
    clock: { now: () => NOW },
    createId: () => ATTEMPT_ID
  };
}

function successResponse(content = '{"decision":"abstain"}'): Response {
  return new Response(
    JSON.stringify({
      choices: [{ finish_reason: "stop", message: { content } }],
      usage: { prompt_tokens: 120, completion_tokens: 24 }
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

function transport(
  fetch: FireworksFetch,
  sleep: InferenceSleep = pendingSleep(),
  overrides: Partial<FireworksTransportPolicy> = {}
) {
  return new FireworksChatCompletionsTransport({
    apiKey: "synthetic-test-key",
    dependencies: dependencies(fetch, sleep),
    policy: { ...policy, ...overrides }
  });
}

describe("allowlisted Fireworks model routing", () => {
  it("pins DeepSeek V4 Pro with reasoning disabled for text selection", async () => {
    let body: unknown;
    const fetch = vi.fn<FireworksFetch>(async (_input, init) => {
      body = JSON.parse(String(init.body));
      return successResponse();
    });

    const result = await transport(fetch).complete(request, new AbortController().signal);

    expect(result).toMatchObject({
      ok: true,
      provenance: {
        attemptId: ATTEMPT_ID,
        provider: "fireworks",
        task: "adaptive_module_selection",
        modelAlias: "deepseek-v4-pro-none",
        contractVersion: "adaptive-selection.v1",
        tokenUsage: { input: 120, output: 24 }
      }
    });
    expect(body).toMatchObject({
      model: "accounts/fireworks/models/deepseek-v4-pro",
      reasoning_effort: "none",
      temperature: 0,
      stream: false,
      response_format: { type: "json_schema" }
    });
    expect(JSON.stringify(body)).not.toContain("kimi-k2p6");
  });

  it("sends the frozen adaptive Zod schema in a Fireworks-compatible strict JSON request", async () => {
    let body: unknown;
    const decision = selectionDecisionFixture("followup.timing");
    const fetch = vi.fn<FireworksFetch>(async (_input, init) => {
      body = JSON.parse(String(init.body));
      return successResponse(JSON.stringify(decision));
    });
    const provider = new StructuredAdaptiveSelectionProvider(transport(fetch));

    await expect(
      provider.select(adaptiveInputFixture(), new AbortController().signal)
    ).resolves.toMatchObject({
      ok: true,
      envelope: { decision }
    });
    const serializedBody = JSON.stringify(body);
    expect(serializedBody).toContain('"type":"object"');
    expect(serializedBody).toContain('"anyOf"');
    expect(serializedBody).toContain('"additionalProperties":false');
    expect(serializedBody).not.toContain('"oneOf"');
    expect(serializedBody).toContain('"pattern"');
    expect(serializedBody).toContain('"maxLength"');
    expect(serializedBody).toContain('"maxItems"');
  });

  it("keeps Kimi K2.6 vision-only and rejects cross-task modalities", () => {
    expect(routeInferenceTask("medication_label_extraction", "vision")).toMatchObject({
      modelAlias: "kimi-k2p6-vision-none",
      providerModelId: "accounts/fireworks/models/kimi-k2p6",
      reasoningEffort: "none"
    });
    expect(routeInferenceTask("medication_label_extraction", "text")).toBeNull();
    expect(routeInferenceTask("adaptive_module_selection", "vision")).toBeNull();
  });

  it("refuses a nominal vision route when no image part is present", async () => {
    const fetch = vi.fn<FireworksFetch>();
    const textOnlyMedicationRequest: StructuredCompletionRequest = {
      ...request,
      task: "medication_label_extraction",
      modality: "vision",
      contractVersion: "medication-label.v1"
    };

    await expect(
      transport(fetch).complete(textOnlyMedicationRequest, new AbortController().signal)
    ).resolves.toEqual({
      ok: false,
      failure: { code: "contract_rejected", retryable: false, retryAfterMs: null }
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("bounded Fireworks failure handling", () => {
  it.each([401, 403])("redacts HTTP %s as non-retryable authentication failure", async (status) => {
    const fetch = vi.fn<FireworksFetch>(async () => new Response(null, { status }));

    await expect(transport(fetch).complete(request, new AbortController().signal)).resolves.toEqual(
      {
        ok: false,
        failure: { code: "authentication_failed", retryable: false, retryAfterMs: null }
      }
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retries HTTP 429 only within the fixed attempt budget", async () => {
    const retryDelays: number[] = [];
    const responses = [
      new Response(null, { status: 429, headers: { "retry-after": "10" } }),
      new Response(null, { status: 429, headers: { "retry-after": "0.01" } }),
      successResponse()
    ];
    const fetch = vi.fn<FireworksFetch>(async () => responses.shift() ?? successResponse());

    const result = await transport(fetch, retryAwareSleep(retryDelays)).complete(
      request,
      new AbortController().signal
    );

    expect(result).toMatchObject({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(retryDelays).toEqual([100, 10]);
  });

  it("retries a 5xx once and succeeds without exposing the provider body", async () => {
    const retryDelays: number[] = [];
    const responses = [
      new Response("sensitive provider detail", { status: 503 }),
      successResponse()
    ];
    const fetch = vi.fn<FireworksFetch>(async () => responses.shift() ?? successResponse());

    const result = await transport(fetch, retryAwareSleep(retryDelays)).complete(
      request,
      new AbortController().signal
    );

    expect(result).toMatchObject({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(retryDelays).toEqual([20]);
    expect(JSON.stringify(result)).not.toContain("sensitive provider detail");
  });

  it("returns a typed failure after retry exhaustion", async () => {
    const retryDelays: number[] = [];
    const fetch = vi.fn<FireworksFetch>(async () => new Response(null, { status: 502 }));

    await expect(
      transport(fetch, retryAwareSleep(retryDelays)).complete(request, new AbortController().signal)
    ).resolves.toEqual({
      ok: false,
      failure: { code: "provider_unavailable", retryable: true, retryAfterMs: null }
    });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(retryDelays).toEqual([20, 40]);
  });

  it("enforces a hard timeout and aborts the in-flight fetch", async () => {
    let requestSignal: AbortSignal | undefined;
    const fetch = vi.fn<FireworksFetch>(
      (_input, init) =>
        new Promise(() => {
          requestSignal = init.signal as AbortSignal;
        })
    );
    const immediateTimeout: InferenceSleep = async () => undefined;

    await expect(
      transport(fetch, immediateTimeout, { timeoutMs: 5 }).complete(
        request,
        new AbortController().signal
      )
    ).resolves.toEqual({
      ok: false,
      failure: { code: "timeout", retryable: false, retryAfterMs: null }
    });
    expect(requestSignal?.aborted).toBe(true);
  });

  it("propagates caller cancellation and aborts the in-flight fetch", async () => {
    let requestSignal: AbortSignal | undefined;
    const fetch = vi.fn<FireworksFetch>(
      (_input, init) =>
        new Promise(() => {
          requestSignal = init.signal as AbortSignal;
        })
    );
    const controller = new AbortController();

    const completion = transport(fetch).complete(request, controller.signal);
    controller.abort();

    await expect(completion).resolves.toEqual({
      ok: false,
      failure: { code: "cancelled", retryable: false, retryAfterMs: null }
    });
    expect(requestSignal?.aborted).toBe(true);
  });

  it("rejects malformed, partial, oversized, and length-truncated provider responses", async () => {
    const cases = [
      new Response("not-json", { status: 200 }),
      new Response(JSON.stringify({ choices: [] }), { status: 200 }),
      new Response("x".repeat(2_048), { status: 200 }),
      new Response(
        JSON.stringify({
          choices: [{ finish_reason: "length", message: { content: '{"partial":' } }]
        }),
        { status: 200 }
      )
    ];

    for (const response of cases) {
      const fetch = vi.fn<FireworksFetch>(async () => response);
      await expect(
        transport(fetch, pendingSleep(), { maxResponseBytes: 1_024, maxAttempts: 1 }).complete(
          request,
          new AbortController().signal
        )
      ).resolves.toEqual({
        ok: false,
        failure: { code: "malformed_response", retryable: false, retryAfterMs: null }
      });
    }
  });
});
