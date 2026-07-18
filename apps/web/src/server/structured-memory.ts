import {
  StructuredMemoryDataSchema,
  StructuredMemoryUpdateRequestSchema
} from "@homerounds/api-client";
import {
  StructuredMemoryConflictError,
  applyStructuredMemoryMutation,
  createEmptyStructuredMemoryStore,
  projectStructuredMemory,
  setStructuredMemoryConsent
} from "@homerounds/personalization";
import { z } from "zod";

import { ApiFault } from "./errors";
import { emptyInputReader, jsonBodyReader, serveApiRoute } from "./http";
import {
  StructuredMemoryRepositoryConflictError,
  type StructuredMemoryRepository
} from "./final-pass-repositories";
import type { ServerRuntime } from "./runtime";

async function readOrCreateStore(
  repository: StructuredMemoryRepository,
  patientId: string,
  now: string
) {
  const current = await repository.getStore(patientId);
  if (current) return current;
  const created = createEmptyStructuredMemoryStore({ patientId, now });
  try {
    await repository.saveStore(created, null);
    return created;
  } catch (error: unknown) {
    if (!(error instanceof StructuredMemoryRepositoryConflictError)) throw error;
    const raced = await repository.getStore(patientId);
    if (!raced) throw error;
    return raced;
  }
}

function mapMemoryError(error: unknown): never {
  if (
    error instanceof StructuredMemoryConflictError ||
    error instanceof StructuredMemoryRepositoryConflictError
  ) {
    throw new ApiFault(409, "stale_state", "api.error.structured_memory_conflict");
  }
  throw error;
}

function patientIdFrom(contextPatientId: string | null): string {
  if (!contextPatientId) throw new ApiFault(403, "forbidden", "api.error.patient_scope");
  return z.string().min(1).max(120).parse(contextPatientId);
}

export function handleGetStructuredMemory(
  request: Request,
  runtime: ServerRuntime
): Promise<Response> {
  return serveApiRoute(request, runtime.hooks, {
    method: "GET",
    roles: ["patient"],
    mutation: false,
    rateLimit: { bucket: "structured-memory-read", limit: 60, windowMs: 60_000 },
    readInput: emptyInputReader,
    outputSchema: StructuredMemoryDataSchema,
    async handle(context) {
      const patientId = patientIdFrom(context.session.patientId);
      const now = runtime.hooks.now?.() ?? new Date().toISOString();
      const store =
        (await runtime.finalPass.structuredMemory.getStore(patientId)) ??
        createEmptyStructuredMemoryStore({ patientId, now });
      return { projection: projectStructuredMemory({ store, generatedAt: now }) };
    }
  });
}

export function handleUpdateStructuredMemory(
  request: Request,
  runtime: ServerRuntime
): Promise<Response> {
  return serveApiRoute<
    z.infer<typeof StructuredMemoryUpdateRequestSchema>,
    z.infer<typeof StructuredMemoryDataSchema>
  >(request, runtime.hooks, {
    method: "POST",
    roles: ["patient"],
    mutation: true,
    rateLimit: { bucket: "structured-memory-write", limit: 20, windowMs: 60_000 },
    readInput: jsonBodyReader(StructuredMemoryUpdateRequestSchema, 12_000),
    outputSchema: StructuredMemoryDataSchema,
    async handle(context, input) {
      const patientId = patientIdFrom(context.session.patientId);
      const now = runtime.hooks.now?.() ?? new Date().toISOString();
      const current = await readOrCreateStore(runtime.finalPass.structuredMemory, patientId, now);
      try {
        const next =
          input.kind === "consent"
            ? setStructuredMemoryConsent({
                store: current,
                consent: input.consent,
                expectedStoreVersion: input.expectedStoreVersion,
                mutationId: input.mutationId,
                now: input.occurredAt
              })
            : applyStructuredMemoryMutation(current, input.mutation);
        await runtime.finalPass.structuredMemory.saveStore(next, current.storeVersion);
        const generatedAt =
          runtime.hooks.now?.() ??
          (input.kind === "consent" ? input.occurredAt : input.mutation.occurredAt);
        return { projection: projectStructuredMemory({ store: next, generatedAt }) };
      } catch (error: unknown) {
        return mapMemoryError(error);
      }
    }
  });
}
