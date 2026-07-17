import {
  InferenceProvenanceSchema,
  type InferenceProviderFailure,
  type InferenceProvenance,
  type InferenceTask
} from "@homerounds/contracts/inference";

import { inferenceFailure } from "./failures";
import type { InferenceModality } from "./model-router";

export type InferenceClock = {
  now(): Date;
};

export type InferenceSleep = (delayMs: number, signal: AbortSignal) => Promise<void>;

export type InferenceTextContentPart = {
  readonly type: "text";
  readonly text: string;
};

export type InferenceImageContentPart = {
  readonly type: "image_url";
  readonly image_url: {
    readonly url: string;
  };
};

export type StructuredCompletionMessage = {
  readonly role: "system" | "user";
  readonly content: string | readonly (InferenceTextContentPart | InferenceImageContentPart)[];
};

export type StructuredCompletionRequest = {
  readonly task: InferenceTask;
  readonly modality: InferenceModality;
  readonly contractVersion: "adaptive-selection.v1" | "medication-label.v1";
  readonly messages: readonly StructuredCompletionMessage[];
  readonly responseSchemaName: string;
  readonly responseSchema: object;
};

export type StructuredCompletionAttempt =
  | {
      readonly ok: true;
      readonly content: string;
      readonly provenance: InferenceProvenance;
    }
  | {
      readonly ok: false;
      readonly failure: InferenceProviderFailure;
    };

export type StructuredCompletionTransport = {
  complete(
    request: StructuredCompletionRequest,
    signal: AbortSignal
  ): Promise<StructuredCompletionAttempt>;
};

export class DisabledStructuredCompletionTransport implements StructuredCompletionTransport {
  async complete(
    _request: StructuredCompletionRequest,
    signal: AbortSignal
  ): Promise<StructuredCompletionAttempt> {
    return {
      ok: false,
      failure: inferenceFailure(signal.aborted ? "cancelled" : "missing_configuration", false)
    };
  }
}

export class FakeStructuredCompletionTransport implements StructuredCompletionTransport {
  public constructor(
    private readonly dependencies: {
      readonly createId: () => string;
      readonly clock: InferenceClock;
      readonly respond: (request: StructuredCompletionRequest) => string;
    }
  ) {}

  async complete(
    request: StructuredCompletionRequest,
    signal: AbortSignal
  ): Promise<StructuredCompletionAttempt> {
    if (signal.aborted) {
      return { ok: false, failure: inferenceFailure("cancelled", false) };
    }

    const attemptedAt = this.dependencies.clock.now();
    let content: string;
    try {
      content = this.dependencies.respond(request);
    } catch {
      return { ok: false, failure: inferenceFailure("provider_unavailable", false) };
    }

    if (signal.aborted) {
      return { ok: false, failure: inferenceFailure("cancelled", false) };
    }

    try {
      const provenance = InferenceProvenanceSchema.safeParse({
        attemptId: this.dependencies.createId(),
        provider: "fake",
        task: request.task,
        modelAlias: `fake-${request.task}`,
        contractVersion: request.contractVersion,
        attemptedAt: attemptedAt.toISOString(),
        durationMs: Math.max(0, this.dependencies.clock.now().getTime() - attemptedAt.getTime()),
        tokenUsage: null
      });
      if (!provenance.success) {
        return { ok: false, failure: inferenceFailure("contract_rejected", false) };
      }
      return { ok: true, content, provenance: provenance.data };
    } catch {
      return { ok: false, failure: inferenceFailure("contract_rejected", false) };
    }
  }
}

export function runtimeInferenceSleep(delayMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Cancelled", "AbortError"));
      return;
    }

    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve();
    }, delayMs);
    const cancel = () => {
      clearTimeout(timeout);
      reject(new DOMException("Cancelled", "AbortError"));
    };
    signal.addEventListener("abort", cancel, { once: true });
  });
}
