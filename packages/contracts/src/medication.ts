import { z } from "zod";

import { InferenceProvenanceSchema } from "./inference";

export const MedicationLabelImageMetadataSchema = z
  .object({
    requestId: z.uuid(),
    captureMode: z.enum(["camera", "file_upload"]),
    mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    byteLength: z.number().int().positive().max(5_000_000),
    width: z.number().int().min(320).max(8_192),
    height: z.number().int().min(320).max(8_192),
    consentVersion: z.string().min(1).max(40),
    consentGrantedAt: z.iso.datetime(),
    syntheticDataOnly: z.literal(true),
    rawMediaRef: z.null()
  })
  .strict();
export type MedicationLabelImageMetadata = z.infer<typeof MedicationLabelImageMetadataSchema>;

export const MedicationLabelFieldSchema = z.enum([
  "product_name",
  "active_ingredient",
  "strength",
  "dose_form",
  "directions",
  "expiry",
  "batch_number"
]);
export type MedicationLabelField = z.infer<typeof MedicationLabelFieldSchema>;

export const MedicationLabelObservationSchema = z
  .object({
    field: MedicationLabelFieldSchema,
    status: z.enum(["detected", "uncertain", "missing"]),
    value: z.string().trim().min(1).max(240).nullable(),
    confidence: z.number().min(0).max(1).nullable()
  })
  .strict()
  .superRefine((observation, context) => {
    if (observation.status === "missing" && observation.value !== null) {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: "missing observations cannot contain a value"
      });
    }
    if (observation.status !== "missing" && observation.value === null) {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: "detected or uncertain observations require a value"
      });
    }
  });
export type MedicationLabelObservation = z.infer<typeof MedicationLabelObservationSchema>;

export const MedicationLabelProposalSchema = z
  .object({
    contractVersion: z.literal("medication-label.v1"),
    proposalId: z.uuid(),
    roundId: z.uuid(),
    stateVersion: z.number().int().nonnegative(),
    observations: z.array(MedicationLabelObservationSchema).min(1).max(7),
    missingInformation: z.array(z.string().trim().min(1).max(120)).max(7),
    provenance: InferenceProvenanceSchema,
    rawMediaRef: z.null()
  })
  .strict()
  .superRefine((proposal, context) => {
    const fields = proposal.observations.map(({ field }) => field);
    if (new Set(fields).size !== fields.length) {
      context.addIssue({
        code: "custom",
        path: ["observations"],
        message: "medication observation fields must be unique"
      });
    }
    if (proposal.provenance.task !== "medication_label_extraction") {
      context.addIssue({
        code: "custom",
        path: ["provenance", "task"],
        message: "medication proposals require medication extraction provenance"
      });
    }
  });
export type MedicationLabelProposal = z.infer<typeof MedicationLabelProposalSchema>;

export const MedicationReviewItemSchema = z
  .object({
    field: MedicationLabelFieldSchema,
    disposition: z.enum(["accepted", "corrected", "not_visible"]),
    reviewedValue: z.string().trim().min(1).max(240).nullable()
  })
  .strict()
  .superRefine((item, context) => {
    if (item.disposition === "not_visible" && item.reviewedValue !== null) {
      context.addIssue({
        code: "custom",
        path: ["reviewedValue"],
        message: "not-visible fields cannot contain a reviewed value"
      });
    }
    if (item.disposition !== "not_visible" && item.reviewedValue === null) {
      context.addIssue({
        code: "custom",
        path: ["reviewedValue"],
        message: "accepted or corrected fields require a reviewed value"
      });
    }
  });
export type MedicationReviewItem = z.infer<typeof MedicationReviewItemSchema>;

export const ConfirmedMedicationObservationFactSchema = z
  .object({
    factId: z.uuid(),
    roundId: z.uuid(),
    proposalId: z.uuid().nullable(),
    stateVersion: z.number().int().nonnegative(),
    source: z.enum(["image_review", "text_entry"]),
    reviewItems: z.array(MedicationReviewItemSchema).min(1).max(7),
    explicitlyConfirmed: z.literal(true),
    confirmedAt: z.iso.datetime(),
    rawMediaRef: z.null()
  })
  .strict()
  .superRefine((fact, context) => {
    const fields = fact.reviewItems.map(({ field }) => field);
    if (new Set(fields).size !== fields.length) {
      context.addIssue({
        code: "custom",
        path: ["reviewItems"],
        message: "reviewed medication fields must be unique"
      });
    }
    if (fact.source === "image_review" && fact.proposalId === null) {
      context.addIssue({
        code: "custom",
        path: ["proposalId"],
        message: "image review requires a source proposal"
      });
    }
    if (fact.source === "text_entry" && fact.proposalId !== null) {
      context.addIssue({
        code: "custom",
        path: ["proposalId"],
        message: "text entry cannot claim a model proposal"
      });
    }
  });
export type ConfirmedMedicationObservationFact = z.infer<
  typeof ConfirmedMedicationObservationFactSchema
>;
