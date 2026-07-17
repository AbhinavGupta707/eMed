import { z } from "zod";

import { ClinicalSnapshotSchema, type ClinicalSnapshot, type SnapshotIssue } from "./snapshot";

const BundleSchema = z
  .object({
    resourceType: z.literal("Bundle"),
    type: z.literal("collection"),
    meta: z
      .object({
        security: z.array(
          z.object({
            system: z.string().optional(),
            code: z.string().min(1)
          })
        )
      })
      .optional(),
    entry: z.array(z.object({ resource: z.unknown() }))
  })
  .passthrough();

const ReferenceSchema = z.object({ reference: z.string().min(1).max(240) }).passthrough();
const CodingSchema = z
  .object({ code: z.string().min(1).max(100), display: z.string().min(1).max(240).optional() })
  .passthrough();
const CodeableConceptSchema = z.object({ coding: z.array(CodingSchema).min(1) }).passthrough();

const PatientSchema = z
  .object({ resourceType: z.literal("Patient"), id: z.string().min(1) })
  .passthrough();
const ConditionSchema = z
  .object({
    resourceType: z.literal("Condition"),
    id: z.string().min(1),
    subject: ReferenceSchema,
    code: CodeableConceptSchema,
    clinicalStatus: CodeableConceptSchema.optional(),
    recordedDate: z.iso.datetime().optional()
  })
  .passthrough();
const MedicationStatementSchema = z
  .object({
    resourceType: z.literal("MedicationStatement"),
    id: z.string().min(1),
    subject: ReferenceSchema,
    status: z.string().min(1).optional(),
    medicationCodeableConcept: CodeableConceptSchema,
    effectiveDateTime: z.iso.datetime().optional()
  })
  .passthrough();
const ObservationSchema = z
  .object({
    resourceType: z.literal("Observation"),
    id: z.string().min(1),
    subject: ReferenceSchema,
    status: z.string().min(1).optional(),
    code: CodeableConceptSchema,
    effectiveDateTime: z.iso.datetime().optional(),
    valueQuantity: z
      .object({
        value: z.unknown().optional(),
        unit: z.string().min(1).optional(),
        code: z.string().min(1).optional()
      })
      .passthrough()
      .optional()
  })
  .passthrough();
const CarePlanSchema = z
  .object({
    resourceType: z.literal("CarePlan"),
    id: z.string().min(1),
    subject: ReferenceSchema,
    status: z.string().min(1).optional(),
    category: z.array(CodeableConceptSchema).optional(),
    title: z.string().min(1).max(240).optional(),
    period: z
      .object({ start: z.iso.datetime().optional(), end: z.iso.datetime().optional() })
      .optional()
  })
  .passthrough();
const ProvenanceSchema = z
  .object({
    resourceType: z.literal("Provenance"),
    id: z.string().min(1),
    target: z.array(ReferenceSchema).min(1),
    recorded: z.iso.datetime().optional(),
    agent: z.array(z.object({ who: ReferenceSchema.optional() }).passthrough()).optional()
  })
  .passthrough();

type SupportedKind = "condition" | "medication" | "observation" | "care_plan";

export const ClinicalRecordAdapterErrorSchema = z.discriminatedUnion("code", [
  z.object({ code: z.literal("invalid_request"), issues: z.array(z.string()) }),
  z.object({ code: z.literal("malformed_bundle"), issues: z.array(z.string()) }),
  z.object({ code: z.literal("not_synthetic"), message: z.string() }),
  z.object({
    code: z.literal("patient_mismatch"),
    expectedPatientId: z.string(),
    actualPatientId: z.string().nullable()
  }),
  z.object({ code: z.literal("source_failure"), message: z.string() })
]);

export type ClinicalRecordAdapterError = z.infer<typeof ClinicalRecordAdapterErrorSchema>;

export type ClinicalRecordResult =
  { ok: true; snapshot: ClinicalSnapshot } | { ok: false; error: ClinicalRecordAdapterError };

export type ClinicalRecordRequest = {
  patientId: string;
  asOf: string;
  observationFreshnessDays: number;
};

export type ClinicalRecordAdapter = {
  loadSnapshot(request: ClinicalRecordRequest): Promise<ClinicalRecordResult>;
};

export type FhirBundleSource = {
  loadBundle(patientId: string, signal?: AbortSignal): Promise<unknown>;
};

export class FhirBundleClinicalRecordAdapter implements ClinicalRecordAdapter {
  constructor(
    private readonly source: FhirBundleSource,
    private readonly signal?: AbortSignal
  ) {}

  async loadSnapshot(request: ClinicalRecordRequest): Promise<ClinicalRecordResult> {
    let bundle: unknown;
    try {
      bundle = await this.source.loadBundle(request.patientId, this.signal);
    } catch {
      return {
        ok: false,
        error: {
          code: "source_failure",
          message: "Clinical record source unavailable."
        }
      };
    }
    return normalizeFhirBundle(bundle, request);
  }
}

function zodIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`);
}

function referenceFor(resourceType: string, id: string): string {
  return `${resourceType}/${id}`;
}

function firstCoding(concept: z.infer<typeof CodeableConceptSchema>): {
  code: string;
  display: string | null;
} {
  const coding = concept.coding[0];
  if (!coding) throw new Error("CodeableConceptSchema guarantees at least one coding.");
  return { code: coding.code, display: coding.display ?? null };
}

function belongsToPatient(reference: string, patientId: string): boolean {
  return reference === `Patient/${patientId}`;
}

function issue(
  code: SnapshotIssue["code"],
  factKind: SnapshotIssue["factKind"],
  resourceReference: string | null,
  detailKey: string
): SnapshotIssue {
  return { code, factKind, resourceReference, detailKey };
}

function freshnessOf(
  observedAt: string | undefined,
  asOf: string,
  freshnessDays: number
): "current" | "stale" | "unknown" {
  if (!observedAt) return "unknown";
  const ageMs = Date.parse(asOf) - Date.parse(observedAt);
  if (ageMs < 0) return "unknown";
  return ageMs > freshnessDays * 86_400_000 ? "stale" : "current";
}

export function normalizeFhirBundle(
  input: unknown,
  request: ClinicalRecordRequest
): ClinicalRecordResult {
  const requestSchema = z.object({
    patientId: z.string().min(1).max(100),
    asOf: z.iso.datetime(),
    observationFreshnessDays: z.number().int().positive().max(3650)
  });
  const parsedRequest = requestSchema.safeParse(request);
  if (!parsedRequest.success) {
    return {
      ok: false,
      error: { code: "invalid_request", issues: zodIssues(parsedRequest.error) }
    };
  }

  const parsedBundle = BundleSchema.safeParse(input);
  if (!parsedBundle.success) {
    return {
      ok: false,
      error: { code: "malformed_bundle", issues: zodIssues(parsedBundle.error) }
    };
  }
  const bundle = parsedBundle.data;
  if (
    !bundle.meta?.security.some(
      (coding) =>
        coding.system === "https://homerounds.example/security" && coding.code === "DEMO-SYNTHETIC"
    )
  ) {
    return {
      ok: false,
      error: {
        code: "not_synthetic",
        message: "FHIR fixtures must carry the DEMO-SYNTHETIC security marker."
      }
    };
  }

  const patientIds = bundle.entry
    .map(({ resource }) => PatientSchema.safeParse(resource))
    .filter((result) => result.success)
    .map((result) => result.data.id);
  if (!patientIds.includes(parsedRequest.data.patientId)) {
    return {
      ok: false,
      error: {
        code: "patient_mismatch",
        expectedPatientId: parsedRequest.data.patientId,
        actualPatientId: patientIds[0] ?? null
      }
    };
  }

  const provenanceByTarget = new Map<
    string,
    { recordedAt: string | null; sourceReference: string | null }
  >();
  for (const { resource } of bundle.entry) {
    const parsed = ProvenanceSchema.safeParse(resource);
    if (!parsed.success) continue;
    const sourceReference = parsed.data.agent?.[0]?.who?.reference ?? null;
    for (const target of parsed.data.target) {
      provenanceByTarget.set(target.reference, {
        recordedAt: parsed.data.recorded ?? null,
        sourceReference
      });
    }
  }

  const issues: SnapshotIssue[] = [];
  const provenanceFor = (targetReference: string, kind: SupportedKind) => {
    const provenance = provenanceByTarget.get(targetReference);
    if (!provenance) {
      issues.push(
        issue("missing_provenance", "provenance", targetReference, `${kind}.provenance_missing`)
      );
      return {
        status: "missing" as const,
        targetReference,
        recordedAt: null,
        sourceReference: null
      };
    }
    return { status: "present" as const, targetReference, ...provenance };
  };

  const conditions: ClinicalSnapshot["conditions"] = [];
  const medications: ClinicalSnapshot["medications"] = [];
  const observations: ClinicalSnapshot["observations"] = [];
  const carePlans: ClinicalSnapshot["carePlans"] = [];

  for (const { resource } of bundle.entry) {
    const resourceType =
      typeof resource === "object" && resource !== null && "resourceType" in resource
        ? (resource as { resourceType?: unknown }).resourceType
        : undefined;

    if (resourceType === "Patient" || resourceType === "Provenance") continue;

    if (resourceType === "Condition") {
      const parsed = ConditionSchema.safeParse(resource);
      if (!parsed.success) {
        issues.push(issue("malformed_resource", "condition", null, "condition.malformed"));
        continue;
      }
      if (!belongsToPatient(parsed.data.subject.reference, parsedRequest.data.patientId)) continue;
      const coding = firstCoding(parsed.data.code);
      const target = referenceFor("Condition", parsed.data.id);
      conditions.push({
        factId: target,
        ...coding,
        clinicalStatus: parsed.data.clinicalStatus
          ? firstCoding(parsed.data.clinicalStatus).code
          : null,
        recordedAt: parsed.data.recordedDate ?? null,
        provenance: provenanceFor(target, "condition")
      });
      continue;
    }

    if (resourceType === "MedicationStatement") {
      const parsed = MedicationStatementSchema.safeParse(resource);
      if (!parsed.success) {
        issues.push(issue("malformed_resource", "medication", null, "medication.malformed"));
        continue;
      }
      if (!belongsToPatient(parsed.data.subject.reference, parsedRequest.data.patientId)) continue;
      const coding = firstCoding(parsed.data.medicationCodeableConcept);
      const target = referenceFor("MedicationStatement", parsed.data.id);
      medications.push({
        factId: target,
        ...coding,
        status: parsed.data.status ?? null,
        effectiveAt: parsed.data.effectiveDateTime ?? null,
        provenance: provenanceFor(target, "medication")
      });
      continue;
    }

    if (resourceType === "Observation") {
      const parsed = ObservationSchema.safeParse(resource);
      if (!parsed.success) {
        issues.push(issue("malformed_resource", "observation", null, "observation.malformed"));
        continue;
      }
      if (!belongsToPatient(parsed.data.subject.reference, parsedRequest.data.patientId)) continue;
      const coding = firstCoding(parsed.data.code);
      const target = referenceFor("Observation", parsed.data.id);
      const rawValue = parsed.data.valueQuantity?.value;
      const isFiniteNumber = typeof rawValue === "number" && Number.isFinite(rawValue);
      const valueStatus =
        rawValue === undefined ? "missing" : isFiniteNumber ? "present" : "malformed";
      const normalizedValue = isFiniteNumber ? rawValue : null;
      const freshness = freshnessOf(
        parsed.data.effectiveDateTime,
        parsedRequest.data.asOf,
        parsedRequest.data.observationFreshnessDays
      );
      if (freshness === "stale") {
        issues.push(issue("stale", "observation", target, "observation.stale"));
      }
      if (valueStatus !== "present") {
        issues.push(
          issue(
            valueStatus === "missing" ? "missing" : "malformed_resource",
            "observation",
            target,
            `observation.value_${valueStatus}`
          )
        );
      }
      observations.push({
        factId: target,
        ...coding,
        status: parsed.data.status ?? null,
        value: normalizedValue,
        unit: parsed.data.valueQuantity?.code ?? parsed.data.valueQuantity?.unit ?? null,
        valueStatus,
        observedAt: parsed.data.effectiveDateTime ?? null,
        freshness,
        conflictsWith: [],
        provenance: provenanceFor(target, "observation")
      });
      continue;
    }

    if (resourceType === "CarePlan") {
      const parsed = CarePlanSchema.safeParse(resource);
      if (!parsed.success) {
        issues.push(issue("malformed_resource", "care_plan", null, "care_plan.malformed"));
        continue;
      }
      if (!belongsToPatient(parsed.data.subject.reference, parsedRequest.data.patientId)) continue;
      const target = referenceFor("CarePlan", parsed.data.id);
      carePlans.push({
        factId: target,
        status: parsed.data.status ?? null,
        categoryCode: parsed.data.category?.[0] ? firstCoding(parsed.data.category[0]).code : null,
        title: parsed.data.title ?? null,
        periodStart: parsed.data.period?.start ?? null,
        periodEnd: parsed.data.period?.end ?? null,
        provenance: provenanceFor(target, "care_plan")
      });
      continue;
    }

    issues.push(issue("unsupported_resource", "unknown", null, "resource.unsupported_and_ignored"));
  }

  for (const observation of observations) {
    const conflicts = observations.filter(
      (candidate) =>
        candidate.factId !== observation.factId &&
        candidate.code === observation.code &&
        candidate.observedAt === observation.observedAt &&
        candidate.valueStatus === "present" &&
        observation.valueStatus === "present" &&
        candidate.value !== observation.value
    );
    observation.conflictsWith = conflicts.map((candidate) => candidate.factId).sort();
    if (observation.conflictsWith.length > 0) {
      issues.push(
        issue("conflicting", "observation", observation.factId, "observation.conflicting_values")
      );
    }
  }

  const factCollections: Array<[SupportedKind, readonly unknown[]]> = [
    ["condition", conditions],
    ["medication", medications],
    ["observation", observations],
    ["care_plan", carePlans]
  ];
  for (const [kind, facts] of factCollections) {
    if (facts.length === 0) issues.push(issue("missing", kind, null, `${kind}.missing`));
  }

  const snapshot = ClinicalSnapshotSchema.parse({
    patientId: parsedRequest.data.patientId,
    asOf: parsedRequest.data.asOf,
    source: "synthetic_fhir_r4_fixture",
    conditions,
    medications,
    observations,
    carePlans,
    issues
  });
  return { ok: true, snapshot };
}
