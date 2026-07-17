import { z } from "zod";

const nullableText = z.string().min(1).max(240).nullable();
const nullableDateTime = z.iso.datetime().nullable();

export const NormalizedProvenanceSchema = z.object({
  status: z.enum(["present", "missing"]),
  targetReference: z.string().min(1),
  recordedAt: nullableDateTime,
  sourceReference: nullableText
});

export const NormalizedConditionSchema = z.object({
  factId: z.string().min(1),
  code: z.string().min(1),
  display: nullableText,
  clinicalStatus: nullableText,
  recordedAt: nullableDateTime,
  provenance: NormalizedProvenanceSchema
});

export const NormalizedMedicationSchema = z.object({
  factId: z.string().min(1),
  code: z.string().min(1),
  display: nullableText,
  status: nullableText,
  effectiveAt: nullableDateTime,
  provenance: NormalizedProvenanceSchema
});

export const NormalizedObservationSchema = z.object({
  factId: z.string().min(1),
  code: z.string().min(1),
  display: nullableText,
  status: nullableText,
  value: z.number().finite().nullable(),
  unit: nullableText,
  valueStatus: z.enum(["present", "missing", "malformed"]),
  observedAt: nullableDateTime,
  freshness: z.enum(["current", "stale", "unknown"]),
  conflictsWith: z.array(z.string().min(1)),
  provenance: NormalizedProvenanceSchema
});

export const NormalizedCarePlanSchema = z.object({
  factId: z.string().min(1),
  status: nullableText,
  categoryCode: nullableText,
  title: nullableText,
  periodStart: nullableDateTime,
  periodEnd: nullableDateTime,
  provenance: NormalizedProvenanceSchema
});

export const SnapshotIssueSchema = z.object({
  code: z.enum([
    "missing",
    "conflicting",
    "stale",
    "malformed_resource",
    "unsupported_resource",
    "missing_provenance"
  ]),
  factKind: z.enum([
    "condition",
    "medication",
    "observation",
    "care_plan",
    "provenance",
    "unknown"
  ]),
  resourceReference: nullableText,
  detailKey: z.string().min(1)
});

export const ClinicalSnapshotSchema = z.object({
  patientId: z.string().min(1),
  asOf: z.iso.datetime(),
  source: z.literal("synthetic_fhir_r4_fixture"),
  conditions: z.array(NormalizedConditionSchema),
  medications: z.array(NormalizedMedicationSchema),
  observations: z.array(NormalizedObservationSchema),
  carePlans: z.array(NormalizedCarePlanSchema),
  issues: z.array(SnapshotIssueSchema)
});

export type ClinicalSnapshot = z.infer<typeof ClinicalSnapshotSchema>;
export type SnapshotIssue = z.infer<typeof SnapshotIssueSchema>;
