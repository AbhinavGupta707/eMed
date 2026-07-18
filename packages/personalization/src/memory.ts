import { z } from "zod";

const MemoryOpaqueIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9._:-]+$/);

export const StructuredMemoryKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z][a-z0-9_]*$/);
export type StructuredMemoryKey = z.infer<typeof StructuredMemoryKeySchema>;

export const StructuredMemoryValueSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("code"),
      code: z
        .string()
        .trim()
        .min(1)
        .max(80)
        .regex(/^[a-z][a-z0-9_-]*$/)
    })
    .strict(),
  z.object({ kind: z.literal("boolean"), value: z.boolean() }).strict(),
  z.object({ kind: z.literal("short_text"), value: z.string().trim().min(1).max(160) }).strict()
]);
export type StructuredMemoryValue = z.infer<typeof StructuredMemoryValueSchema>;

export const StructuredMemorySourceSchema = z.discriminatedUnion("kind", [
  z
    .object({
      schemaVersion: z.literal("structured-memory-source.v1"),
      kind: z.literal("patient_confirmation"),
      sourceId: MemoryOpaqueIdSchema,
      confirmationId: z.uuid(),
      sourceTimestamp: z.iso.datetime(),
      recordedAt: z.iso.datetime(),
      structuredOnly: z.literal(true),
      transcriptStored: z.literal(false),
      rawMediaStored: z.literal(false),
      promptStored: z.literal(false),
      providerPayloadStored: z.literal(false)
    })
    .strict(),
  z
    .object({
      schemaVersion: z.literal("structured-memory-source.v1"),
      kind: z.literal("deterministic_workflow"),
      sourceId: MemoryOpaqueIdSchema,
      roundId: z.uuid(),
      sourceTimestamp: z.iso.datetime(),
      recordedAt: z.iso.datetime(),
      structuredOnly: z.literal(true),
      transcriptStored: z.literal(false),
      rawMediaStored: z.literal(false),
      promptStored: z.literal(false),
      providerPayloadStored: z.literal(false)
    })
    .strict()
]);
export type StructuredMemorySource = z.infer<typeof StructuredMemorySourceSchema>;

const StructuredMemoryDecisionSchema = z
  .object({
    status: z.enum(["declined", "withdrawn", "granted"]),
    policyVersion: MemoryOpaqueIdSchema,
    decisionId: z.uuid(),
    decidedAt: z.iso.datetime()
  })
  .strict();

export const StructuredMemoryConsentSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("not_requested") }).strict(),
  StructuredMemoryDecisionSchema
]);
export type StructuredMemoryConsent = z.infer<typeof StructuredMemoryConsentSchema>;

export const StructuredMemorySlotSchema = z
  .object({
    schemaVersion: z.literal("structured-memory-slot.v1"),
    memoryId: z.uuid(),
    key: StructuredMemoryKeySchema,
    memoryVersion: z.number().int().positive(),
    value: StructuredMemoryValueSchema,
    source: StructuredMemorySourceSchema,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    correctedFromVersion: z.number().int().positive().nullable(),
    lastMutationId: z.uuid()
  })
  .strict();
export type StructuredMemorySlot = z.infer<typeof StructuredMemorySlotSchema>;

export const StructuredMemoryOperationSchema = z
  .object({
    schemaVersion: z.literal("structured-memory-operation.v1"),
    operationVersion: z.number().int().min(2),
    mutationId: z.uuid(),
    mutationFingerprint: z
      .string()
      .length(32)
      .regex(/^[a-f0-9]{32}$/),
    kind: z.enum([
      "consent_granted",
      "consent_declined",
      "consent_withdrawn",
      "memory_set",
      "memory_corrected",
      "memory_deleted"
    ]),
    key: StructuredMemoryKeySchema.nullable(),
    memoryId: z.uuid().nullable(),
    resultingMemoryVersion: z.number().int().positive().nullable(),
    occurredAt: z.iso.datetime(),
    clearedSlotCount: z.number().int().nonnegative().max(24)
  })
  .strict();
export type StructuredMemoryOperation = z.infer<typeof StructuredMemoryOperationSchema>;

export const StructuredMemoryStoreSchema = z
  .object({
    schemaVersion: z.literal("structured-memory-store.v1"),
    patientId: MemoryOpaqueIdSchema,
    dataClassification: z.literal("synthetic_demo"),
    storeVersion: z.number().int().positive(),
    consent: StructuredMemoryConsentSchema,
    slots: z.array(StructuredMemorySlotSchema).max(24),
    operations: z.array(StructuredMemoryOperationSchema).max(100),
    updatedAt: z.iso.datetime()
  })
  .strict()
  .superRefine((store, context) => {
    if (store.storeVersion !== store.operations.length + 1) {
      context.addIssue({
        code: "custom",
        path: ["storeVersion"],
        message: "memory store version must advance exactly once per retained operation"
      });
    }
    if (store.consent.status !== "granted" && store.slots.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["slots"],
        message: "memory values must be cleared when consent is not granted"
      });
    }
    const keys = new Set<string>();
    const memoryIds = new Set<string>();
    for (const [index, slot] of store.slots.entries()) {
      if (keys.has(slot.key)) {
        context.addIssue({
          code: "custom",
          path: ["slots", index, "key"],
          message: "active memory keys must be unique"
        });
      }
      if (memoryIds.has(slot.memoryId)) {
        context.addIssue({
          code: "custom",
          path: ["slots", index, "memoryId"],
          message: "active memory identifiers must be unique"
        });
      }
      keys.add(slot.key);
      memoryIds.add(slot.memoryId);
    }
    const mutationIds = new Set<string>();
    for (const [index, operation] of store.operations.entries()) {
      if (operation.operationVersion !== index + 2) {
        context.addIssue({
          code: "custom",
          path: ["operations", index, "operationVersion"],
          message: "memory operations must be retained in version order"
        });
      }
      if (mutationIds.has(operation.mutationId)) {
        context.addIssue({
          code: "custom",
          path: ["operations", index, "mutationId"],
          message: "memory mutation identifiers must be unique"
        });
      }
      mutationIds.add(operation.mutationId);
    }
  });
export type StructuredMemoryStore = z.infer<typeof StructuredMemoryStoreSchema>;

export const StructuredMemoryMutationSchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("set"),
      mutationId: z.uuid(),
      expectedStoreVersion: z.number().int().positive(),
      memoryId: z.uuid(),
      key: StructuredMemoryKeySchema,
      value: StructuredMemoryValueSchema,
      source: StructuredMemorySourceSchema,
      occurredAt: z.iso.datetime()
    })
    .strict(),
  z
    .object({
      operation: z.literal("correct"),
      mutationId: z.uuid(),
      expectedStoreVersion: z.number().int().positive(),
      memoryId: z.uuid(),
      key: StructuredMemoryKeySchema,
      expectedMemoryVersion: z.number().int().positive(),
      value: StructuredMemoryValueSchema,
      source: StructuredMemorySourceSchema,
      occurredAt: z.iso.datetime()
    })
    .strict(),
  z
    .object({
      operation: z.literal("delete"),
      mutationId: z.uuid(),
      expectedStoreVersion: z.number().int().positive(),
      memoryId: z.uuid(),
      key: StructuredMemoryKeySchema,
      expectedMemoryVersion: z.number().int().positive(),
      source: StructuredMemorySourceSchema,
      occurredAt: z.iso.datetime()
    })
    .strict()
]);
export type StructuredMemoryMutation = z.infer<typeof StructuredMemoryMutationSchema>;

export const StructuredMemoryProjectionSchema = z
  .object({
    schemaVersion: z.literal("structured-memory-projection.v1"),
    patientId: MemoryOpaqueIdSchema,
    storeVersion: z.number().int().positive(),
    generatedAt: z.iso.datetime(),
    consentStatus: z.enum(["not_requested", "declined", "withdrawn", "granted"]),
    entries: z
      .array(
        z
          .object({
            memoryId: z.uuid(),
            key: StructuredMemoryKeySchema,
            memoryVersion: z.number().int().positive(),
            value: StructuredMemoryValueSchema,
            source: StructuredMemorySourceSchema,
            correctedFromVersion: z.number().int().positive().nullable(),
            updatedAt: z.iso.datetime(),
            serverEligibleForInference: z.literal(false)
          })
          .strict()
      )
      .max(12),
    recentDeletions: z
      .array(
        z
          .object({
            memoryId: z.uuid(),
            key: StructuredMemoryKeySchema,
            deletedMemoryVersion: z.number().int().positive(),
            deletedAt: z.iso.datetime()
          })
          .strict()
      )
      .max(12),
    authority: z
      .object({
        scope: z.literal("consented_structured_context_only"),
        clinicalInterpretation: z.literal("none"),
        workflowAuthority: z.literal(false),
        actionAuthority: z.literal(false)
      })
      .strict()
  })
  .strict();
export type StructuredMemoryProjection = z.infer<typeof StructuredMemoryProjectionSchema>;

const FNV_OFFSET_BASIS = 14_695_981_039_346_656_037n;
const FNV_PRIME = 1_099_511_628_211n;
const UINT64_MASK = 18_446_744_073_709_551_615n;

function canonicalStringify(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalStringify(entry)).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Readonly<Record<string, unknown>>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalStringify(record[key])}`)
      .join(",")}}`;
  }
  throw new Error("Unsupported value in structured memory fingerprint.");
}

function fnv1a(value: string, offset: bigint): string {
  let hash = offset;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = (hash * FNV_PRIME) & UINT64_MASK;
  }
  return hash.toString(16).padStart(16, "0");
}

function mutationFingerprint(value: unknown): string {
  const canonical = canonicalStringify(value);
  return `${fnv1a(`a\u001f${canonical}`, FNV_OFFSET_BASIS)}${fnv1a(
    `b\u001f${canonical}`,
    FNV_OFFSET_BASIS ^ 9_780_819_481_956_259_429n
  )}`;
}

export class StructuredMemoryConflictError extends Error {
  readonly code = "structured_memory_conflict";

  constructor(
    readonly reason:
      | "stale_store_version"
      | "consent_required"
      | "slot_exists"
      | "slot_not_found"
      | "stale_memory_version"
      | "memory_id_mismatch"
      | "duplicate_mutation_conflict"
  ) {
    super(`Structured memory update was rejected: ${reason}.`);
    this.name = "StructuredMemoryConflictError";
  }
}

const CreateStoreInputSchema = z
  .object({ patientId: MemoryOpaqueIdSchema, now: z.iso.datetime() })
  .strict();

export function createEmptyStructuredMemoryStore(inputValue: {
  patientId: string;
  now: string;
}): StructuredMemoryStore {
  const input = CreateStoreInputSchema.parse(inputValue);
  return StructuredMemoryStoreSchema.parse({
    schemaVersion: "structured-memory-store.v1",
    patientId: input.patientId,
    dataClassification: "synthetic_demo",
    storeVersion: 1,
    consent: { status: "not_requested" },
    slots: [],
    operations: [],
    updatedAt: input.now
  });
}

function appendOperation(
  store: StructuredMemoryStore,
  operation: Omit<StructuredMemoryOperation, "operationVersion">
): StructuredMemoryOperation[] {
  return [
    ...store.operations,
    StructuredMemoryOperationSchema.parse({
      ...operation,
      operationVersion: store.storeVersion + 1
    })
  ];
}

function replayedMutation(
  store: StructuredMemoryStore,
  mutationId: string,
  fingerprint: string
): boolean {
  const existing = store.operations.find((operation) => operation.mutationId === mutationId);
  if (!existing) return false;
  if (existing.mutationFingerprint !== fingerprint) {
    throw new StructuredMemoryConflictError("duplicate_mutation_conflict");
  }
  return true;
}

const SetConsentInputSchema = z
  .object({
    store: StructuredMemoryStoreSchema,
    consent: StructuredMemoryDecisionSchema,
    expectedStoreVersion: z.number().int().positive(),
    mutationId: z.uuid(),
    now: z.iso.datetime()
  })
  .strict();

export function setStructuredMemoryConsent(inputValue: {
  store: StructuredMemoryStore;
  consent: Exclude<StructuredMemoryConsent, { status: "not_requested" }>;
  expectedStoreVersion: number;
  mutationId: string;
  now: string;
}): StructuredMemoryStore {
  const input = SetConsentInputSchema.parse(inputValue);
  const fingerprint = mutationFingerprint({ consent: input.consent, now: input.now });
  if (replayedMutation(input.store, input.mutationId, fingerprint)) return input.store;
  if (input.store.storeVersion !== input.expectedStoreVersion) {
    throw new StructuredMemoryConflictError("stale_store_version");
  }
  const slots = input.consent.status === "granted" ? input.store.slots : [];
  const kind =
    input.consent.status === "granted"
      ? "consent_granted"
      : input.consent.status === "declined"
        ? "consent_declined"
        : "consent_withdrawn";
  const operations = appendOperation(input.store, {
    schemaVersion: "structured-memory-operation.v1",
    mutationId: input.mutationId,
    mutationFingerprint: fingerprint,
    kind,
    key: null,
    memoryId: null,
    resultingMemoryVersion: null,
    occurredAt: input.now,
    clearedSlotCount: input.store.slots.length - slots.length
  });
  return StructuredMemoryStoreSchema.parse({
    ...input.store,
    storeVersion: input.store.storeVersion + 1,
    consent: input.consent,
    slots,
    operations,
    updatedAt: input.now
  });
}

function nextMemoryVersion(store: StructuredMemoryStore, key: string): number {
  return (
    Math.max(
      0,
      ...store.operations
        .filter((operation) => operation.key === key)
        .flatMap((operation) =>
          operation.resultingMemoryVersion === null ? [] : [operation.resultingMemoryVersion]
        )
    ) + 1
  );
}

export function applyStructuredMemoryMutation(
  storeValue: StructuredMemoryStore,
  mutationValue: StructuredMemoryMutation
): StructuredMemoryStore {
  const store = StructuredMemoryStoreSchema.parse(storeValue);
  const mutation = StructuredMemoryMutationSchema.parse(mutationValue);
  const fingerprint = mutationFingerprint(mutation);
  if (replayedMutation(store, mutation.mutationId, fingerprint)) return store;
  if (store.storeVersion !== mutation.expectedStoreVersion) {
    throw new StructuredMemoryConflictError("stale_store_version");
  }
  if (store.consent.status !== "granted") {
    throw new StructuredMemoryConflictError("consent_required");
  }
  const existing = store.slots.find((slot) => slot.key === mutation.key);
  let slots: StructuredMemorySlot[];
  let resultingMemoryVersion: number;
  let operationKind: StructuredMemoryOperation["kind"];
  if (mutation.operation === "set") {
    if (existing) throw new StructuredMemoryConflictError("slot_exists");
    resultingMemoryVersion = nextMemoryVersion(store, mutation.key);
    slots = [
      ...store.slots,
      StructuredMemorySlotSchema.parse({
        schemaVersion: "structured-memory-slot.v1",
        memoryId: mutation.memoryId,
        key: mutation.key,
        memoryVersion: resultingMemoryVersion,
        value: mutation.value,
        source: mutation.source,
        createdAt: mutation.occurredAt,
        updatedAt: mutation.occurredAt,
        correctedFromVersion: null,
        lastMutationId: mutation.mutationId
      })
    ].sort((left, right) => left.key.localeCompare(right.key));
    operationKind = "memory_set";
  } else {
    if (!existing) throw new StructuredMemoryConflictError("slot_not_found");
    if (existing.memoryId !== mutation.memoryId) {
      throw new StructuredMemoryConflictError("memory_id_mismatch");
    }
    if (existing.memoryVersion !== mutation.expectedMemoryVersion) {
      throw new StructuredMemoryConflictError("stale_memory_version");
    }
    resultingMemoryVersion = existing.memoryVersion + 1;
    if (mutation.operation === "delete") {
      slots = store.slots.filter((slot) => slot.key !== mutation.key);
      operationKind = "memory_deleted";
    } else {
      slots = store.slots
        .map((slot) =>
          slot.key === mutation.key
            ? StructuredMemorySlotSchema.parse({
                ...slot,
                memoryVersion: resultingMemoryVersion,
                value: mutation.value,
                source: mutation.source,
                updatedAt: mutation.occurredAt,
                correctedFromVersion: existing.memoryVersion,
                lastMutationId: mutation.mutationId
              })
            : slot
        )
        .sort((left, right) => left.key.localeCompare(right.key));
      operationKind = "memory_corrected";
    }
  }
  const operations = appendOperation(store, {
    schemaVersion: "structured-memory-operation.v1",
    mutationId: mutation.mutationId,
    mutationFingerprint: fingerprint,
    kind: operationKind,
    key: mutation.key,
    memoryId: mutation.memoryId,
    resultingMemoryVersion,
    occurredAt: mutation.occurredAt,
    clearedSlotCount: 0
  });
  return StructuredMemoryStoreSchema.parse({
    ...store,
    storeVersion: store.storeVersion + 1,
    slots,
    operations,
    updatedAt: mutation.occurredAt
  });
}

const ProjectMemoryInputSchema = z
  .object({
    store: StructuredMemoryStoreSchema,
    generatedAt: z.iso.datetime(),
    entryLimit: z.number().int().min(0).max(12).default(12),
    deletionLimit: z.number().int().min(0).max(12).default(12)
  })
  .strict();

export function projectStructuredMemory(inputValue: {
  store: StructuredMemoryStore;
  generatedAt: string;
  entryLimit?: number;
  deletionLimit?: number;
}): StructuredMemoryProjection {
  const input = ProjectMemoryInputSchema.parse(inputValue);
  const consentGranted = input.store.consent.status === "granted";
  const entries = consentGranted
    ? input.store.slots.slice(0, input.entryLimit).map((slot) => ({
        memoryId: slot.memoryId,
        key: slot.key,
        memoryVersion: slot.memoryVersion,
        value: slot.value,
        source: slot.source,
        correctedFromVersion: slot.correctedFromVersion,
        updatedAt: slot.updatedAt,
        serverEligibleForInference: false as const
      }))
    : [];
  const recentDeletions = consentGranted
    ? input.store.operations
        .filter(
          (
            operation
          ): operation is StructuredMemoryOperation & {
            memoryId: string;
            key: string;
            resultingMemoryVersion: number;
          } =>
            operation.kind === "memory_deleted" &&
            operation.memoryId !== null &&
            operation.key !== null &&
            operation.resultingMemoryVersion !== null
        )
        .slice(-input.deletionLimit)
        .reverse()
        .map((operation) => ({
          memoryId: operation.memoryId,
          key: operation.key,
          deletedMemoryVersion: operation.resultingMemoryVersion,
          deletedAt: operation.occurredAt
        }))
    : [];
  return StructuredMemoryProjectionSchema.parse({
    schemaVersion: "structured-memory-projection.v1",
    patientId: input.store.patientId,
    storeVersion: input.store.storeVersion,
    generatedAt: input.generatedAt,
    consentStatus: input.store.consent.status,
    entries,
    recentDeletions,
    authority: {
      scope: "consented_structured_context_only",
      clinicalInterpretation: "none",
      workflowAuthority: false,
      actionAuthority: false
    }
  });
}
