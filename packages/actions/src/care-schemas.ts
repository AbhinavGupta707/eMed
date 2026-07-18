import { z } from "zod";

export const SyntheticCareActionKindSchema = z.enum([
  "synthetic_appointment_request",
  "synthetic_refill_review_request",
  "synthetic_care_team_message"
]);

export type SyntheticCareActionKind = z.infer<typeof SyntheticCareActionKindSchema>;

export const SYNTHETIC_CARE_ACTION_ALLOWLIST = SyntheticCareActionKindSchema.options;

export const CareActionStatusSchema = z.enum([
  "pending_review",
  "approved",
  "contact_attempted",
  "completed",
  "failed",
  "unknown"
]);

export type CareActionStatus = z.infer<typeof CareActionStatusSchema>;

export const CareActionDetailsSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("synthetic_appointment_request"),
      preferredWindow: z.enum(["morning", "afternoon", "either", "unsure"]),
      confirmedSummary: z.string().trim().min(1).max(280)
    })
    .strict(),
  z
    .object({
      kind: z.literal("synthetic_refill_review_request"),
      medicationDisplay: z.string().trim().min(1).max(120),
      supplyState: z.enum(["running_low", "review_requested", "unsure"]),
      confirmedSummary: z.string().trim().min(1).max(280)
    })
    .strict(),
  z
    .object({
      kind: z.literal("synthetic_care_team_message"),
      topic: z.enum(["symptoms", "medication", "programme", "other", "unsure"]),
      confirmedSummary: z.string().trim().min(1).max(280)
    })
    .strict()
]);

export type CareActionDetails = z.infer<typeof CareActionDetailsSchema>;

export const CareActionEvidenceCardSchema = z
  .object({
    summary: z.string().trim().min(1).max(280),
    protocolId: z.string().min(1).max(120),
    protocolVersion: z.string().min(1).max(60),
    protocolOutcome: z.enum([
      "programme_review_requested",
      "abstain_for_review",
      "emergency_guidance"
    ]),
    sourceFactIds: z.array(z.string().min(1).max(160)).max(20),
    captureQuality: z.enum(["pass", "fail", "unknown"]),
    measurementState: z.enum(["accepted", "not_accepted", "unknown"]),
    redFlagGate: z.literal("clear"),
    generatedAt: z.iso.datetime(),
    rawTranscriptStored: z.literal(false),
    modelReasoningStored: z.literal(false),
    rawMediaStored: z.literal(false)
  })
  .strict();

export type CareActionEvidenceCard = z.infer<typeof CareActionEvidenceCardSchema>;

export const PatientCareActionConfirmationSchema = z
  .object({
    confirmed: z.literal(true),
    confirmedAt: z.iso.datetime(),
    confirmationKind: z.literal("explicit_patient_confirmation"),
    confirmationVersion: z.literal("care-action-confirmation-v1"),
    reviewedFields: z.array(z.string().min(1).max(80)).min(3).max(8),
    syntheticBoundaryAccepted: z.literal(true)
  })
  .strict();

export const CareActionPatientAuthorizationSchema = z
  .object({
    authorized: z.literal(true),
    actorKind: z.literal("patient"),
    actorId: z.string().min(1).max(120),
    patientId: z.string().min(1).max(120),
    scope: z.literal("synthetic_care_action:create")
  })
  .strict();

export const SubmitCareActionInputSchema = z
  .object({
    roundId: z.uuid(),
    patientId: z.string().min(1).max(120),
    details: CareActionDetailsSchema,
    confirmation: PatientCareActionConfirmationSchema,
    authorization: CareActionPatientAuthorizationSchema,
    expectedRoundVersion: z.number().int().nonnegative(),
    operationKey: z.string().min(16).max(200),
    correlationId: z.string().min(1).max(120)
  })
  .strict()
  .superRefine((input, context) => {
    if (input.authorization.patientId !== input.patientId) {
      context.addIssue({
        code: "custom",
        path: ["authorization", "patientId"],
        message: "patient authorization must match the requested synthetic patient"
      });
    }
    const required = ["action_kind", "confirmed_summary", "synthetic_boundary"];
    if (input.details.kind === "synthetic_appointment_request") required.push("preferred_window");
    if (input.details.kind === "synthetic_refill_review_request") {
      required.push("medication_display", "supply_state");
    }
    if (input.details.kind === "synthetic_care_team_message") required.push("topic");
    const reviewed = new Set(input.confirmation.reviewedFields);
    for (const field of required) {
      if (!reviewed.has(field)) {
        context.addIssue({
          code: "custom",
          path: ["confirmation", "reviewedFields"],
          message: `explicit confirmation must include ${field}`
        });
      }
    }
  });

export type SubmitCareActionInput = z.infer<typeof SubmitCareActionInputSchema>;

export const CareActionFailureSchema = z
  .object({
    code: z.enum(["persistence_unavailable", "temporary_conflict", "workflow_unavailable"]),
    retryable: z.boolean(),
    recordedAt: z.iso.datetime()
  })
  .strict();

export const SyntheticCareActionSchema = z
  .object({
    id: z.uuid(),
    roundId: z.uuid(),
    patientId: z.string().min(1).max(120),
    kind: SyntheticCareActionKindSchema,
    details: CareActionDetailsSchema,
    evidence: CareActionEvidenceCardSchema,
    idempotencyKey: z.string().min(24).max(100),
    patientConfirmationAt: z.iso.datetime(),
    status: CareActionStatusSchema,
    version: z.number().int().positive(),
    ownerId: z.string().min(1).max(120).nullable(),
    clinicianSummary: z.string().trim().max(280).nullable(),
    lastFailure: CareActionFailureSchema.nullable(),
    delivery: z.literal("synthetic_only_not_sent"),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime()
  })
  .strict()
  .superRefine((action, context) => {
    if (action.details.kind !== action.kind) {
      context.addIssue({
        code: "custom",
        path: ["details", "kind"],
        message: "details must match the allowlisted action kind"
      });
    }
    if (action.status === "failed" && action.lastFailure === null) {
      context.addIssue({
        code: "custom",
        path: ["lastFailure"],
        message: "failed actions require a safe failure classification"
      });
    }
    if (action.status !== "failed" && action.lastFailure !== null) {
      context.addIssue({
        code: "custom",
        path: ["lastFailure"],
        message: "only failed actions may carry a current failure classification"
      });
    }
  });

export type SyntheticCareAction = z.infer<typeof SyntheticCareActionSchema>;

export const CareActionAuthoritySchema = z
  .object({
    roundId: z.uuid(),
    patientId: z.string().min(1).max(120),
    roundVersion: z.number().int().nonnegative(),
    roundState: z.string().min(1).max(80),
    redFlagGate: z.enum(["clear", "stop", "unknown"]),
    eligibleActions: z.array(SyntheticCareActionKindSchema).max(3),
    evidence: CareActionEvidenceCardSchema.nullable()
  })
  .strict();

export type CareActionAuthority = z.infer<typeof CareActionAuthoritySchema>;

export const ClinicianCareActionMutationKindSchema = z.enum([
  "approve",
  "edit",
  "record_contact",
  "complete",
  "retry"
]);

export type ClinicianCareActionMutationKind = z.infer<typeof ClinicianCareActionMutationKindSchema>;

const ClinicianMutationAuthorizationSchema = z
  .object({
    authorized: z.literal(true),
    actorKind: z.literal("clinician"),
    actorId: z.string().min(1).max(120),
    patientId: z.string().min(1).max(120),
    scope: z.enum([
      "synthetic_care_action:approve",
      "synthetic_care_action:edit",
      "synthetic_care_action:contact",
      "synthetic_care_action:complete",
      "synthetic_care_action:retry"
    ])
  })
  .strict();

export const ClinicianCareActionMutationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("approve") }).strict(),
  z
    .object({
      kind: z.literal("edit"),
      clinicianSummary: z.string().trim().min(1).max(280)
    })
    .strict(),
  z
    .object({
      kind: z.literal("record_contact"),
      outcome: z.literal("attempted_synthetic_contact_no_external_delivery")
    })
    .strict(),
  z
    .object({
      kind: z.literal("complete"),
      completion: z.literal("synthetic_workflow_closed")
    })
    .strict(),
  z.object({ kind: z.literal("retry") }).strict()
]);

export const MutateCareActionInputSchema = z
  .object({
    actionId: z.uuid(),
    mutation: ClinicianCareActionMutationSchema,
    authorization: ClinicianMutationAuthorizationSchema,
    expectedVersion: z.number().int().positive(),
    operationKey: z.string().min(16).max(200),
    correlationId: z.string().min(1).max(120)
  })
  .strict()
  .superRefine((input, context) => {
    const requiredScope: Record<
      ClinicianCareActionMutationKind,
      z.infer<typeof ClinicianMutationAuthorizationSchema>["scope"]
    > = {
      approve: "synthetic_care_action:approve",
      edit: "synthetic_care_action:edit",
      record_contact: "synthetic_care_action:contact",
      complete: "synthetic_care_action:complete",
      retry: "synthetic_care_action:retry"
    };
    if (input.authorization.scope !== requiredScope[input.mutation.kind]) {
      context.addIssue({
        code: "custom",
        path: ["authorization", "scope"],
        message: `mutation requires ${requiredScope[input.mutation.kind]}`
      });
    }
  });

export type MutateCareActionInput = z.infer<typeof MutateCareActionInputSchema>;

export const CareActionAuditEventTypeSchema = z.enum([
  "submitted",
  "duplicate_suppressed",
  "approved",
  "edited",
  "contact_attempted",
  "completed",
  "failed",
  "retried"
]);

export const CareActionAuditEventSchema = z
  .object({
    eventId: z.uuid(),
    actionId: z.uuid(),
    roundId: z.uuid(),
    patientId: z.string().min(1).max(120),
    type: CareActionAuditEventTypeSchema,
    actionKind: SyntheticCareActionKindSchema,
    status: CareActionStatusSchema,
    actionVersion: z.number().int().positive(),
    actor: z
      .object({
        kind: z.enum(["patient", "clinician", "system"]),
        id: z.string().min(1).max(120)
      })
      .strict(),
    operationKey: z.string().min(16).max(200),
    correlationId: z.string().min(1).max(120),
    occurredAt: z.iso.datetime(),
    summaryKey: z.string().min(1).max(120),
    rawTranscriptStored: z.literal(false),
    modelReasoningStored: z.literal(false),
    providerPayloadStored: z.literal(false),
    rawMediaStored: z.literal(false)
  })
  .strict();

export type CareActionAuditEvent = z.infer<typeof CareActionAuditEventSchema>;

export const CareActionMutationReceiptSchema = z
  .object({
    status: z.literal("persisted"),
    action: SyntheticCareActionSchema,
    event: CareActionAuditEventSchema,
    operationKey: z.string().min(16).max(200),
    duplicateSuppressed: z.boolean()
  })
  .strict();

export type CareActionMutationReceipt = z.infer<typeof CareActionMutationReceiptSchema>;

export const CareActionSubmissionReceiptSchema = z
  .object({
    status: z.literal("persisted"),
    created: z.boolean(),
    action: SyntheticCareActionSchema,
    event: CareActionAuditEventSchema,
    operationKey: z.string().min(16).max(200),
    duplicateSuppressed: z.boolean()
  })
  .strict();

export type CareActionSubmissionReceipt = z.infer<typeof CareActionSubmissionReceiptSchema>;
