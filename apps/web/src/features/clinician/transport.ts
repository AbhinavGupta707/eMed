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
      const [roundResult, snapshotResult] = await Promise.allSettled([
        client.getRound(task.roundId),
        client.getSnapshot(task.patientId, ClinicalSnapshotSchema)
      ]);

      const round =
        roundResult.status === "fulfilled"
          ? availableResource(roundResult.value.round)
          : failedRead("Round context could not be read. Reload before relying on its state.");
      const snapshot =
        snapshotResult.status === "fulfilled"
          ? availableResource(snapshotResult.value.snapshot)
          : failedRead("Synthetic FHIR context could not be read from the current service.");

      return ClinicianTaskDetailSchema.parse({
        task,
        round,
        snapshot,
        report: unavailableResource(
          "unsupported",
          "current_api_unsupported",
          "The current API does not expose the patient-confirmed structured report to this route."
        ),
        measurement: unavailableResource(
          "unsupported",
          "current_api_unsupported",
          "The current API does not expose accepted measurement and quality detail to this route."
        ),
        protocolResult: unavailableResource(
          "unsupported",
          "current_api_unsupported",
          "The current API does not expose the deterministic decision result to this route."
        ),
        timeline: unavailableResource(
          "unsupported",
          "current_api_unsupported",
          "The current API does not expose the append-only event history to this route."
        ),
        note: unavailableResource(
          "unsupported",
          "current_api_unsupported",
          "Clinician notes are not exposed by the current API. Draft text remains local and unsaved."
        ),
        capabilities: {
          note: "unsupported",
          acknowledge: "unsupported",
          contact: "unsupported",
          complete: "unsupported"
        }
      });
    },

    async mutate(input) {
      const parsedInput = ClinicianMutationInputSchema.parse(input);
      throw new ClinicianTransportError(
        "unsupported",
        `The current API does not expose clinician mutation ${parsedInput.kind}.`
      );
    }
  };
}

export function parseMutationReceipt(value: unknown): ClinicianMutationReceipt {
  return ClinicianMutationReceiptSchema.parse(value);
}
