import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  FhirBundleClinicalRecordAdapter,
  normalizeFhirBundle,
  type FhirBundleSource
} from "./adapter";

const request = {
  patientId: "synthetic-maya",
  asOf: "2026-07-17T12:00:00.000Z",
  observationFreshnessDays: 30
} as const;

async function fixture(name: string): Promise<unknown> {
  const url = new URL(`../../../data/fhir/${name}`, import.meta.url);
  return JSON.parse(await readFile(url, "utf8")) as unknown;
}

describe("narrow synthetic FHIR R4 adapter", () => {
  it("normalizes only the bounded round snapshot fields with provenance", async () => {
    const result = normalizeFhirBundle(await fixture("maya-bundle.json"), request);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot).toMatchObject({
      patientId: "synthetic-maya",
      source: "synthetic_fhir_r4_fixture",
      conditions: [
        {
          factId: "Condition/condition-t2d-demo",
          code: "44054006",
          clinicalStatus: "active",
          provenance: { status: "present" }
        }
      ],
      medications: [
        {
          factId: "MedicationStatement/medication-metformin-demo",
          code: "109081006",
          status: "active",
          provenance: { status: "present" }
        }
      ],
      carePlans: [{ factId: "CarePlan/care-plan-demo", status: "active" }]
    });
    expect(result.snapshot.observations).toHaveLength(2);
    expect(result.snapshot.observations.every((value) => value.freshness === "current")).toBe(true);
    expect(result.snapshot.issues).toEqual([]);
    expect(JSON.stringify(result.snapshot)).not.toContain("name");
    expect(JSON.stringify(result.snapshot)).not.toContain("identifier");
  });

  it("preserves missing categories as explicit issues without inventing facts", async () => {
    const result = normalizeFhirBundle(await fixture("maya-missing.json"), request);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.conditions).toEqual([]);
    expect(result.snapshot.medications).toEqual([]);
    expect(result.snapshot.observations).toEqual([]);
    expect(result.snapshot.carePlans).toEqual([]);
    expect(result.snapshot.issues.filter((value) => value.code === "missing")).toHaveLength(4);
  });

  it("marks same-time, same-code observations with different values as conflicting", async () => {
    const result = normalizeFhirBundle(await fixture("maya-conflicting.json"), request);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.observations).toHaveLength(2);
    expect(result.snapshot.observations[0]?.conflictsWith).toEqual([
      "Observation/pulse-conflict-b"
    ]);
    expect(result.snapshot.observations[1]?.conflictsWith).toEqual([
      "Observation/pulse-conflict-a"
    ]);
    expect(result.snapshot.issues.filter((value) => value.code === "conflicting")).toHaveLength(2);
  });

  it("marks old observations stale using the caller-provided window", async () => {
    const result = normalizeFhirBundle(await fixture("maya-stale.json"), request);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.observations[0]?.freshness).toBe("stale");
    expect(result.snapshot.issues).toContainEqual({
      code: "stale",
      factKind: "observation",
      resourceReference: "Observation/pulse-stale-demo",
      detailKey: "observation.stale"
    });
  });

  it("retains malformed values as unknown and reports unsupported resources", async () => {
    const result = normalizeFhirBundle(await fixture("maya-malformed-unknown.json"), request);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.observations[0]).toMatchObject({
      value: null,
      valueStatus: "malformed"
    });
    expect(result.snapshot.issues.map((value) => value.code)).toEqual(
      expect.arrayContaining(["malformed_resource", "unsupported_resource", "missing_provenance"])
    );
  });

  it("rejects bundles without the explicit synthetic-data marker", async () => {
    const bundle = (await fixture("maya-missing.json")) as {
      meta?: { security?: unknown[] };
    };
    delete bundle.meta;

    expect(normalizeFhirBundle(bundle, request)).toEqual({
      ok: false,
      error: {
        code: "not_synthetic",
        message: "FHIR fixtures must carry the DEMO-SYNTHETIC security marker."
      }
    });
  });

  it("returns typed malformed and patient-mismatch failures", async () => {
    const malformed = normalizeFhirBundle({ resourceType: "Bundle" }, request);
    expect(malformed.ok).toBe(false);
    if (!malformed.ok) expect(malformed.error.code).toBe("malformed_bundle");

    const mismatch = normalizeFhirBundle(await fixture("maya-missing.json"), {
      ...request,
      patientId: "synthetic-someone-else"
    });
    expect(mismatch).toEqual({
      ok: false,
      error: {
        code: "patient_mismatch",
        expectedPatientId: "synthetic-someone-else",
        actualPatientId: "synthetic-maya"
      }
    });

    const invalidRequest = normalizeFhirBundle(await fixture("maya-missing.json"), {
      ...request,
      observationFreshnessDays: 0
    });
    expect(invalidRequest.ok).toBe(false);
    if (!invalidRequest.ok) expect(invalidRequest.error.code).toBe("invalid_request");
  });

  it("contains source exceptions behind a typed adapter failure", async () => {
    const source: FhirBundleSource = {
      loadBundle: () => Promise.reject(new Error("fixture source unavailable"))
    };
    const adapter = new FhirBundleClinicalRecordAdapter(source);

    await expect(adapter.loadSnapshot(request)).resolves.toEqual({
      ok: false,
      error: { code: "source_failure", message: "Clinical record source unavailable." }
    });
  });
});
