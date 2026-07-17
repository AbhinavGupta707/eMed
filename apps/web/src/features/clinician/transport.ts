import { HomeRoundsApiClient, HomeRoundsApiError } from "@homerounds/api-client";
import { ClinicalSnapshotSchema } from "@homerounds/clinical-records";
import type { ClinicalTask } from "@homerounds/contracts";
import { z } from "zod";

import {
  ClinicianMutationInputSchema,
  ClinicianMutationReceiptSchema,
  ClinicianQueueSchema,
  ClinicianTaskDetailSchema,
  type ClinicianMutationInput,
  type ClinicianMutationReceipt,
  type ClinicianQueue,
  type ClinicianTaskDetail,
  type ClinicianTransportErrorCode,
  availableResource,
  unavailableResource
} from "./model";

export class ClinicianTransportError extends Error {
  constructor(
    readonly code: ClinicianTransportErrorCode,
    message: string,
    readonly correlationId: string | null = null
  ) {
    super(message);
    this.name = "ClinicianTransportError";
  }
}

export type ClinicianTransport = {
  listQueue(): Promise<ClinicianQueue>;
  loadTaskDetail(task: ClinicalTask): Promise<ClinicianTaskDetail>;
  mutate(input: ClinicianMutationInput): Promise<ClinicianMutationReceipt>;
};

function transportError(error: unknown, isOnline: () => boolean): ClinicianTransportError {
  if (error instanceof ClinicianTransportError) return error;
  if (error instanceof HomeRoundsApiError) {
    const { code, correlationId } = error.envelope.error;
    const mappedCode: ClinicianTransportErrorCode =
      code === "conflict"
        ? "conflict"
        : code === "stale_state"
          ? "stale"
          : code === "unavailable" || code === "rate_limited"
            ? "unavailable"
            : "unknown";
    return new ClinicianTransportError(mappedCode, error.message, correlationId);
  }
  if (!isOnline()) {
    return new ClinicianTransportError("offline", "The browser reports that it is offline.");
  }
  if (error instanceof z.ZodError) {
    return new ClinicianTransportError(
      "invalid_response",
      "The response did not match the cockpit schema."
    );
  }
  return new ClinicianTransportError("unknown", "The clinician transport failed unexpectedly.");
}

function failedRead(explanation: string) {
  return unavailableResource("unavailable", "read_failed", explanation);
}

function optionalResource<T>(value: T | null, explanation: string) {
  return value === null
    ? unavailableResource("missing", "not_recorded", explanation)
    : availableResource(value);
}

export function createDevelopmentClinicianFetcher(fetcher: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set("x-homerounds-demo-role", "clinician");
    return fetcher(input, { ...init, headers });
  };
}

export function createBrowserClinicianTransport(roundIds: readonly string[]): ClinicianTransport {
  let current: ClinicianTransport | undefined;
  const resolve = () => {
    if (current) return current;
    if (!globalThis.location) {
      throw new ClinicianTransportError(
        "unavailable",
        "The browser origin is unavailable before client hydration."
      );
    }
    current = createApiClinicianTransport({
      baseUrl: globalThis.location.origin,
      roundIds,
      fetcher: createDevelopmentClinicianFetcher()
    });
    return current;
  };
  return {
    listQueue: () => resolve().listQueue(),
    loadTaskDetail: (task) => resolve().loadTaskDetail(task),
    mutate: (input) => resolve().mutate(input)
  };
}

export function createApiClinicianTransport(options: {
  baseUrl: string;
  roundIds: readonly string[];
  fetcher?: typeof fetch;
  isOnline?: () => boolean;
}): ClinicianTransport {
  const roundIds = z.array(z.uuid()).max(50).parse(options.roundIds);
  const isOnline = options.isOnline ?? (() => globalThis.navigator?.onLine !== false);
  const client = new HomeRoundsApiClient({
    baseUrl: options.baseUrl,
    ...(options.fetcher ? { fetcher: options.fetcher } : {})
  });

  return {
    async listQueue() {
      if (roundIds.length === 0) return [];
      try {
        const response = await client.getQueue(roundIds);
        return ClinicianQueueSchema.parse(response.tasks);
      } catch (error: unknown) {
        throw transportError(error, isOnline);
      }
    },

    async loadTaskDetail(taskInput) {
      const task = ClinicianQueueSchema.element.parse(taskInput);
      const [detailResult, snapshotResult] = await Promise.allSettled([
        client.getClinicianTask(task.id),
        client.getSnapshot(task.patientId, ClinicalSnapshotSchema)
      ]);
      if (detailResult.status === "rejected") {
        throw transportError(detailResult.reason, isOnline);
      }
      const detail = detailResult.value;
      if (detail.task.id !== task.id || detail.task.roundId !== task.roundId) {
        throw new ClinicianTransportError(
          "invalid_response",
          "The returned task detail did not match the selected queue task."
        );
      }
      const snapshot =
        snapshotResult.status === "fulfilled"
          ? availableResource(snapshotResult.value.snapshot)
          : failedRead("Synthetic FHIR context could not be read from the current service.");

      return ClinicianTaskDetailSchema.parse({
        task: detail.task,
        round: availableResource(detail.round),
        snapshot,
        report: optionalResource(
          detail.report,
          "No patient-confirmed structured report was recorded for this round."
        ),
        measurement: optionalResource(
          detail.measurement,
          "No quality-passing numeric measurement was accepted for this round."
        ),
        captureQuality: optionalResource(
          detail.captureQuality,
          "No non-passing capture-quality outcome was recorded for this round."
        ),
        protocolResult: optionalResource(
          detail.protocolResult,
          "No deterministic protocol result was recorded for this round."
        ),
        timeline: availableResource(detail.timeline),
        note: optionalResource(detail.note, "No clinician note has been recorded for this task."),
        capabilities: {
          note: detail.capabilities.note ? "supported" : "unsupported",
          acknowledge: detail.capabilities.acknowledge ? "supported" : "unsupported",
          contact: detail.capabilities.contact ? "supported" : "unsupported",
          complete: detail.capabilities.complete ? "supported" : "unsupported"
        }
      });
    },

    async mutate(input) {
      const parsedInput = ClinicianMutationInputSchema.parse(input);
      try {
        return ClinicianMutationReceiptSchema.parse(
          await client.mutateClinicianTask(parsedInput.taskId, {
            kind: parsedInput.kind,
            expectedTaskUpdatedAt: parsedInput.expectedTaskUpdatedAt,
            operationKey: parsedInput.operationKey,
            note: parsedInput.note
          })
        );
      } catch (error: unknown) {
        throw transportError(error, isOnline);
      }
    }
  };
}

export function parseMutationReceipt(value: unknown): ClinicianMutationReceipt {
  return ClinicianMutationReceiptSchema.parse(value);
}
