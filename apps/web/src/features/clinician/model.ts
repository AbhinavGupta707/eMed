import { ClinicalSnapshotSchema } from "@homerounds/clinical-records";
import {
  CaptureQualitySchema,
  ClinicalTaskSchema,
  DomainEventSchema,
  MeasurementFactSchema,
  PatientReportSchema,
  ProtocolResultSchema,
  RoundSchema
} from "@homerounds/contracts";
import { z } from "zod";

const ResourceStateReasonSchema = z.enum([
  "not_recorded",
  "not_returned",
  "current_api_unsupported",
  "read_failed"
]);

export type ResourceState<T> =
  | { status: "available"; value: T }
  | {
      status: "missing" | "unsupported" | "unavailable";
      reason: z.infer<typeof ResourceStateReasonSchema>;
      explanation: string;
    };

function resourceStateSchema<T extends z.ZodType>(valueSchema: T) {
  return z.discriminatedUnion("status", [
    z.object({ status: z.literal("available"), value: valueSchema }).strict(),
    z
      .object({
        status: z.literal("missing"),
        reason: ResourceStateReasonSchema,
        explanation: z.string().min(1).max(280)
      })
      .strict(),
    z
      .object({
        status: z.literal("unsupported"),
        reason: ResourceStateReasonSchema,
        explanation: z.string().min(1).max(280)
      })
      .strict(),
    z
      .object({
        status: z.literal("unavailable"),
        reason: ResourceStateReasonSchema,
        explanation: z.string().min(1).max(280)
      })
      .strict()
  ]);
}

export function availableResource<T>(value: T): ResourceState<T> {
  return { status: "available", value };
}

export function unavailableResource(
  status: "missing" | "unsupported" | "unavailable",
  reason: z.infer<typeof ResourceStateReasonSchema>,
  explanation: string
): ResourceState<never> {
  return { status, reason, explanation };
}

export const ClinicianNoteSchema = z
  .object({
    text: z.string().trim().max(2_000),
    version: z.number().int().nonnegative(),
    updatedAt: z.iso.datetime(),
    actorId: z.string().min(1).max(120),
    auditReference: z.string().min(1).max(160)
  })
  .strict();

export type ClinicianNote = z.infer<typeof ClinicianNoteSchema>;

export const ClinicianCapabilitySchema = z.enum(["supported", "unsupported"]);

export const ClinicianTaskDetailSchema = z
  .object({
    task: ClinicalTaskSchema.strict(),
    round: resourceStateSchema(RoundSchema.strict()),
    snapshot: resourceStateSchema(ClinicalSnapshotSchema.strict()),
    report: resourceStateSchema(PatientReportSchema.strict()),
    measurement: resourceStateSchema(MeasurementFactSchema.strict()),
    captureQuality: resourceStateSchema(CaptureQualitySchema.strict()),
    protocolResult: resourceStateSchema(ProtocolResultSchema.strict()),
    timeline: resourceStateSchema(z.array(DomainEventSchema.strict()).max(500)),
    note: resourceStateSchema(ClinicianNoteSchema),
    capabilities: z
      .object({
        note: ClinicianCapabilitySchema,
        acknowledge: ClinicianCapabilitySchema,
        contact: ClinicianCapabilitySchema,
        complete: ClinicianCapabilitySchema
      })
      .strict()
  })
  .strict();

export type ClinicianTaskDetail = z.infer<typeof ClinicianTaskDetailSchema>;

export const ClinicianMutationKindSchema = z.enum([
  "save_note",
  "acknowledge",
  "record_contact",
  "complete"
]);

export type ClinicianMutationKind = z.infer<typeof ClinicianMutationKindSchema>;

export const ClinicianMutationInputSchema = z
  .object({
    kind: ClinicianMutationKindSchema,
    taskId: z.uuid(),
    expectedTaskUpdatedAt: z.iso.datetime(),
    operationKey: z.string().min(16).max(200),
    note: z.string().trim().max(2_000).nullable()
  })
  .strict()
  .superRefine((input, context) => {
    if (input.kind === "save_note" && input.note === null) {
      context.addIssue({
        code: "custom",
        path: ["note"],
        message: "A note value is required for save_note."
      });
    }
    if (input.kind !== "save_note" && input.note !== null) {
      context.addIssue({
        code: "custom",
        path: ["note"],
        message: "Only save_note accepts note content."
      });
    }
  });

export type ClinicianMutationInput = z.infer<typeof ClinicianMutationInputSchema>;

export const ClinicianMutationReceiptSchema = z
  .object({
    status: z.literal("persisted"),
    kind: ClinicianMutationKindSchema,
    task: ClinicalTaskSchema.strict(),
    event: DomainEventSchema.strict(),
    persistedAt: z.iso.datetime(),
    operationKey: z.string().min(16).max(200),
    duplicateSuppressed: z.boolean(),
    note: ClinicianNoteSchema.nullable()
  })
  .strict();

export type ClinicianMutationReceipt = z.infer<typeof ClinicianMutationReceiptSchema>;

export const ClinicianQueueSchema = z.array(ClinicalTaskSchema.strict()).max(500);

export type ClinicianQueue = z.infer<typeof ClinicianQueueSchema>;

export const ClinicianDensitySchema = z.enum(["comfortable", "compact"]);
export type ClinicianDensity = z.infer<typeof ClinicianDensitySchema>;

export const ClinicianTransportErrorCodeSchema = z.enum([
  "offline",
  "conflict",
  "stale",
  "unsupported",
  "unavailable",
  "invalid_response",
  "unknown"
]);

export type ClinicianTransportErrorCode = z.infer<typeof ClinicianTransportErrorCodeSchema>;
