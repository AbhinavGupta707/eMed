import {
  InferenceProvenanceSchema,
  InferenceTaskSchema,
  SafeInferenceIdentifierSchema,
  type InferenceProviderFailure
} from "@homerounds/contracts/inference";
import { z } from "zod";

import { inferenceFailure } from "./failures";
import { routeInferenceTask } from "./model-router";
import {
  runtimeInferenceSleep,
  type InferenceClock,
  type InferenceSleep,
  type StructuredCompletionAttempt,
  type StructuredCompletionRequest,
  type StructuredCompletionTransport
} from "./structured-transport";

const FIREWORKS_CHAT_COMPLETIONS_URL = "https://api.fireworks.ai/inference/v1/chat/completions";
const MAX_REQUEST_BYTES = 8 * 1_024 * 1_024;

const FireworksMessageSchema = z
  .object({
    role: z.enum(["system", "user"]),
    content: z.union([
      z
        .string()
        .min(1)
        .max(64 * 1_024),
      z
        .array(
          z.discriminatedUnion("type", [
            z
              .object({
                type: z.literal("text"),
                text: z
                  .string()
                  .min(1)
                  .max(64 * 1_024)
              })
              .strict(),
            z
              .object({
                type: z.literal("image_url"),
                image_url: z
                  .object({
                    url: z
                      .string()
                      .min(1)
                      .max(7 * 1_024 * 1_024)
                  })
                  .strict()
              })
              .strict()
          ])
        )
        .min(1)
        .max(8)
    ])
  })
  .strict();

const FireworksMessagesSchema = z.array(FireworksMessageSchema).min(1).max(8);

const FireworksTransportPolicySchema = z
  .object({
    timeoutMs: z.number().int().positive().max(120_000),
    maxAttempts: z.number().int().min(1).max(4),
    initialRetryDelayMs: z.number().int().positive().max(60_000),
    maxRetryDelayMs: z.number().int().positive().max(60_000),
    maxResponseBytes: z.number().int().min(1_024).max(1_048_576)
  })
  .strict()
  .refine((value) => value.maxRetryDelayMs >= value.initialRetryDelayMs, {
    message: "maximum retry delay must be at least the initial retry delay"
  });

const FireworksResponseSchema = z
  .object({
    choices: z
      .array(
        z
          .object({
            finish_reason: z.string().min(1),
            message: z
              .object({
                content: z.string().min(1).max(32_768)
              })
              .passthrough()
          })
          .passthrough()
      )
      .length(1),
    usage: z
      .object({
        prompt_tokens: z.number().int().nonnegative(),
        completion_tokens: z.number().int().nonnegative()
      })
      .passthrough()
      .optional()
  })
  .passthrough();

const DEFAULT_POLICY = FireworksTransportPolicySchema.parse({
  timeoutMs: 12_000,
  maxAttempts: 3,
  initialRetryDelayMs: 200,
  maxRetryDelayMs: 2_000,
  maxResponseBytes: 64 * 1_024
});

export type FireworksFetch = (input: string, init: RequestInit) => Promise<Response>;

export type FireworksTransportDependencies = {
  readonly fetch: FireworksFetch;
  readonly clock: InferenceClock;
  readonly createId: () => string;
  readonly sleep: InferenceSleep;
};

export type FireworksTransportPolicy = z.infer<typeof FireworksTransportPolicySchema>;

type HttpAttempt =
  | {
      readonly ok: true;
      readonly content: string;
      readonly tokenUsage: { readonly input: number; readonly output: number } | null;
    }
  | {
      readonly ok: false;
      readonly failure: InferenceProviderFailure;
    };

type AttemptRaceResult =
  | { readonly kind: "completed"; readonly attempt: HttpAttempt }
  | { readonly kind: "cancelled" }
  | { readonly kind: "timeout" };

type RetryWaitResult =
  | { readonly kind: "waited" }
  | { readonly kind: "cancelled" }
  | { readonly kind: "timeout" }
  | { readonly kind: "failed" };

function requestMatchesRoute(request: StructuredCompletionRequest): boolean {
  const contractMatchesTask =
    (request.task === "adaptive_module_selection" &&
      request.contractVersion === "adaptive-selection.v1") ||
    (request.task === "medication_label_extraction" &&
      request.contractVersion === "medication-label.v1");
  if (!contractMatchesTask) {
    return false;
  }

  const messages = FireworksMessagesSchema.safeParse(request.messages);
  if (!messages.success) {
    return false;
  }

  if (request.modality === "text") {
    return messages.data.every(({ content }) => typeof content === "string");
  }
  return messages.data.some(
    ({ content }) => Array.isArray(content) && content.some((part) => part.type === "image_url")
  );
}

function clampDuration(durationMs: number): number {
  return Math.min(120_000, Math.max(0, Math.round(durationMs)));
}

function retryAfterMs(response: Response, clock: InferenceClock, maximum: number): number | null {
  const header = response.headers.get("retry-after");
  if (!header) {
    return null;
  }

  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(maximum, Math.max(1, Math.ceil(seconds * 1_000)));
  }

  const retryAt = Date.parse(header);
  if (!Number.isFinite(retryAt)) {
    return null;
  }
  return Math.min(maximum, Math.max(1, retryAt - clock.now().getTime()));
}

async function readBoundedText(response: Response, maximumBytes: number): Promise<string | null> {
  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";

  while (true) {
    const result = await reader.read();
    if (result.done) {
      text += decoder.decode();
      return text;
    }
    totalBytes += result.value.byteLength;
    if (totalBytes > maximumBytes) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(result.value, { stream: true });
  }
}

function statusFailure(
  response: Response,
  dependencies: FireworksTransportDependencies,
  maximumRetryDelayMs: number
): HttpAttempt {
  if (response.status === 401 || response.status === 403) {
    return { ok: false, failure: inferenceFailure("authentication_failed", false) };
  }
  if (response.status === 429) {
    return {
      ok: false,
      failure: inferenceFailure(
        "rate_limited",
        true,
        retryAfterMs(response, dependencies.clock, maximumRetryDelayMs)
      )
    };
  }
  if (response.status >= 500 && response.status <= 599) {
    return {
      ok: false,
      failure: inferenceFailure(
        "provider_unavailable",
        true,
        retryAfterMs(response, dependencies.clock, maximumRetryDelayMs)
      )
    };
  }
  if (response.status === 408) {
    return { ok: false, failure: inferenceFailure("timeout", false) };
  }
  return { ok: false, failure: inferenceFailure("contract_rejected", false) };
}

async function parseSuccessfulResponse(
  response: Response,
  maximumBytes: number
): Promise<HttpAttempt> {
  let text: string | null;
  try {
    text = await readBoundedText(response, maximumBytes);
  } catch {
    return { ok: false, failure: inferenceFailure("provider_unavailable", true) };
  }
  if (text === null) {
    return { ok: false, failure: inferenceFailure("malformed_response", false) };
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, failure: inferenceFailure("malformed_response", false) };
  }

  const parsed = FireworksResponseSchema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, failure: inferenceFailure("malformed_response", false) };
  }
  const choice = parsed.data.choices[0];
  if (!choice || choice.finish_reason !== "stop") {
    return { ok: false, failure: inferenceFailure("malformed_response", false) };
  }

  return {
    ok: true,
    content: choice.message.content,
    tokenUsage: parsed.data.usage
      ? {
          input: parsed.data.usage.prompt_tokens,
          output: parsed.data.usage.completion_tokens
        }
      : null
  };
}

async function performHttpAttempt(
  dependencies: FireworksTransportDependencies,
  apiKey: string,
  body: string,
  signal: AbortSignal,
  maximumBytes: number,
  maximumRetryDelayMs: number
): Promise<HttpAttempt> {
  let response: Response;
  try {
    response = await dependencies.fetch(FIREWORKS_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body,
      signal
    });
  } catch {
    return { ok: false, failure: inferenceFailure("provider_unavailable", true) };
  }

  if (!response.ok) {
    return statusFailure(response, dependencies, maximumRetryDelayMs);
  }
  return parseSuccessfulResponse(response, maximumBytes);
}

async function runWithDeadline(
  dependencies: FireworksTransportDependencies,
  apiKey: string,
  body: string,
  externalSignal: AbortSignal,
  remainingMs: number,
  maximumBytes: number,
  maximumRetryDelayMs: number
): Promise<AttemptRaceResult> {
  if (externalSignal.aborted) {
    return { kind: "cancelled" };
  }

  const requestController = new AbortController();
  const timeoutController = new AbortController();
  let removeCancellationListener: () => void = () => undefined;

  const request = performHttpAttempt(
    dependencies,
    apiKey,
    body,
    requestController.signal,
    maximumBytes,
    maximumRetryDelayMs
  ).then((attempt): AttemptRaceResult => ({ kind: "completed", attempt }));
  const cancellation = new Promise<AttemptRaceResult>((resolve) => {
    const cancel = () => resolve({ kind: "cancelled" });
    externalSignal.addEventListener("abort", cancel, { once: true });
    removeCancellationListener = () => externalSignal.removeEventListener("abort", cancel);
    if (externalSignal.aborted) {
      cancel();
    }
  });
  const timeout = Promise.resolve()
    .then(() => dependencies.sleep(remainingMs, timeoutController.signal))
    .then(
      (): AttemptRaceResult => ({ kind: "timeout" }),
      (): AttemptRaceResult => ({ kind: "timeout" })
    );

  const result = await Promise.race([request, cancellation, timeout]);
  timeoutController.abort();
  removeCancellationListener();
  if (result.kind !== "completed") {
    requestController.abort();
  }
  return result;
}

async function waitForRetry(
  dependencies: FireworksTransportDependencies,
  delayMs: number,
  remainingMs: number,
  externalSignal: AbortSignal
): Promise<RetryWaitResult> {
  if (externalSignal.aborted) {
    return { kind: "cancelled" };
  }

  const delayController = new AbortController();
  const deadlineController = new AbortController();
  let removeCancellationListener: () => void = () => undefined;
  const delay = Promise.resolve()
    .then(() => dependencies.sleep(delayMs, delayController.signal))
    .then(
      (): RetryWaitResult => ({ kind: "waited" }),
      (): RetryWaitResult => ({ kind: "failed" })
    );
  const deadline = Promise.resolve()
    .then(() => dependencies.sleep(remainingMs, deadlineController.signal))
    .then(
      (): RetryWaitResult => ({ kind: "timeout" }),
      (): RetryWaitResult => ({ kind: "failed" })
    );
  const cancellation = new Promise<RetryWaitResult>((resolve) => {
    const cancel = () => resolve({ kind: "cancelled" });
    externalSignal.addEventListener("abort", cancel, { once: true });
    removeCancellationListener = () => externalSignal.removeEventListener("abort", cancel);
    if (externalSignal.aborted) {
      cancel();
    }
  });

  const result = await Promise.race([delay, deadline, cancellation]);
  delayController.abort();
  deadlineController.abort();
  removeCancellationListener();
  return result;
}

export class FireworksChatCompletionsTransport implements StructuredCompletionTransport {
  readonly #apiKey: string;
  readonly #dependencies: FireworksTransportDependencies;
  readonly #policy: FireworksTransportPolicy;

  public constructor(input: {
    readonly apiKey: string | null | undefined;
    readonly dependencies: FireworksTransportDependencies;
    readonly policy?: Partial<FireworksTransportPolicy>;
  }) {
    this.#apiKey = input.apiKey?.trim() ?? "";
    this.#dependencies = input.dependencies;
    this.#policy = FireworksTransportPolicySchema.parse({ ...DEFAULT_POLICY, ...input.policy });
  }

  async complete(
    request: StructuredCompletionRequest,
    signal: AbortSignal
  ): Promise<StructuredCompletionAttempt> {
    try {
      return await this.execute(request, signal);
    } catch {
      return { ok: false, failure: inferenceFailure("provider_unavailable", false) };
    }
  }

  private async execute(
    request: StructuredCompletionRequest,
    signal: AbortSignal
  ): Promise<StructuredCompletionAttempt> {
    if (!this.#apiKey) {
      return { ok: false, failure: inferenceFailure("missing_configuration", false) };
    }
    if (signal.aborted) {
      return { ok: false, failure: inferenceFailure("cancelled", false) };
    }

    const task = InferenceTaskSchema.safeParse(request.task);
    const schemaName = SafeInferenceIdentifierSchema.safeParse(request.responseSchemaName);
    if (!task.success || !schemaName.success || !requestMatchesRoute(request)) {
      return { ok: false, failure: inferenceFailure("contract_rejected", false) };
    }
    const route = routeInferenceTask(task.data, request.modality);
    if (!route) {
      return { ok: false, failure: inferenceFailure("contract_rejected", false) };
    }

    const attemptedAt = this.#dependencies.clock.now();
    const deadlineMs = attemptedAt.getTime() + this.#policy.timeoutMs;
    const attemptId = this.#dependencies.createId();
    let body: string;
    try {
      body = JSON.stringify({
        model: route.providerModelId,
        messages: request.messages,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: schemaName.data,
            schema: request.responseSchema
          }
        },
        reasoning_effort: route.reasoningEffort,
        max_tokens: route.maxOutputTokens,
        temperature: 0,
        stream: false
      });
      if (new TextEncoder().encode(body).byteLength > MAX_REQUEST_BYTES) {
        return { ok: false, failure: inferenceFailure("contract_rejected", false) };
      }
    } catch {
      return { ok: false, failure: inferenceFailure("contract_rejected", false) };
    }

    let latestFailure: InferenceProviderFailure = inferenceFailure("provider_unavailable", false);
    for (let attemptNumber = 1; attemptNumber <= this.#policy.maxAttempts; attemptNumber += 1) {
      const remainingMs = deadlineMs - this.#dependencies.clock.now().getTime();
      if (remainingMs <= 0) {
        return { ok: false, failure: inferenceFailure("timeout", false) };
      }

      const result = await runWithDeadline(
        this.#dependencies,
        this.#apiKey,
        body,
        signal,
        remainingMs,
        this.#policy.maxResponseBytes,
        this.#policy.maxRetryDelayMs
      );
      if (result.kind === "cancelled") {
        return { ok: false, failure: inferenceFailure("cancelled", false) };
      }
      if (result.kind === "timeout") {
        return { ok: false, failure: inferenceFailure("timeout", false) };
      }
      if (result.attempt.ok) {
        const provenance = InferenceProvenanceSchema.safeParse({
          attemptId,
          provider: "fireworks",
          task: route.task,
          modelAlias: route.modelAlias,
          contractVersion: request.contractVersion,
          attemptedAt: attemptedAt.toISOString(),
          durationMs: clampDuration(
            this.#dependencies.clock.now().getTime() - attemptedAt.getTime()
          ),
          tokenUsage: result.attempt.tokenUsage
        });
        if (!provenance.success) {
          return { ok: false, failure: inferenceFailure("contract_rejected", false) };
        }
        return {
          ok: true,
          content: result.attempt.content,
          provenance: provenance.data
        };
      }

      latestFailure = result.attempt.failure;
      if (!latestFailure.retryable || attemptNumber === this.#policy.maxAttempts) {
        return { ok: false, failure: latestFailure };
      }

      const exponentialDelay = Math.min(
        this.#policy.maxRetryDelayMs,
        this.#policy.initialRetryDelayMs * 2 ** (attemptNumber - 1)
      );
      const delayMs = latestFailure.retryAfterMs ?? exponentialDelay;
      const timeBeforeDeadline = deadlineMs - this.#dependencies.clock.now().getTime();
      if (timeBeforeDeadline <= delayMs) {
        return { ok: false, failure: inferenceFailure("timeout", false) };
      }
      const retryWait = await waitForRetry(this.#dependencies, delayMs, timeBeforeDeadline, signal);
      if (retryWait.kind === "cancelled") {
        return { ok: false, failure: inferenceFailure("cancelled", false) };
      }
      if (retryWait.kind === "timeout") {
        return { ok: false, failure: inferenceFailure("timeout", false) };
      }
      if (retryWait.kind === "failed") {
        return {
          ok: false,
          failure: inferenceFailure("provider_unavailable", false)
        };
      }
    }

    return { ok: false, failure: latestFailure };
  }
}

export function createRuntimeFireworksDependencies(): FireworksTransportDependencies {
  return {
    fetch: (input, init) => globalThis.fetch(input, init),
    clock: { now: () => new Date() },
    createId: () => globalThis.crypto.randomUUID(),
    sleep: runtimeInferenceSleep
  };
}
