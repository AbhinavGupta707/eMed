import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "../../packages/contracts/node_modules/zod";
import { describe, expect, it } from "vitest";

import mappingFixture from "./traceability.v1.json";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../", import.meta.url));

const TraceabilitySchema = z
  .object({
    schemaVersion: z.literal(1),
    lane: z.literal("4C"),
    baseCommit: z.string().regex(/^[0-9a-f]{40}$/),
    controls: z
      .array(
        z
          .object({
            controlId: z.string().regex(/^4C-[A-Z0-9-]+$/),
            requirementIds: z.array(z.string().regex(/^HR-[A-Z][0-9]{2}$/)).min(1),
            claim: z.string().min(1).max(240),
            evidence: z
              .object({
                testFile: z
                  .string()
                  .regex(/^tests\/(unit|contract|integration)\/[A-Za-z0-9._/-]+$/),
                testName: z.string().min(1).max(240)
              })
              .strict()
          })
          .strict()
      )
      .min(1)
  })
  .strict();

const requiredControls = [
  "4C-PROTOCOL-MUTATION",
  "4C-PROTOCOL-EDGE",
  "4C-PROTOCOL-REPLAY",
  "4C-API-STRICT",
  "4C-API-BACKWARD-COMPATIBILITY",
  "4C-PATIENT-SCOPE",
  "4C-ROLE",
  "4C-ORIGIN",
  "4C-RATE-LIMIT",
  "4C-MODEL-AUTHORITY",
  "4C-VOICE-AUTHORITY",
  "4C-QUALITY-RETRY",
  "4C-NO-MEASUREMENT-ON-FAILURE",
  "4C-ACTION-IDEMPOTENCY",
  "4C-OPTIMISTIC-CONCURRENCY",
  "4C-TASK-RESUME-PROJECTION",
  "4C-TRANSACTION-ROLLBACK",
  "4C-APPEND-ONLY-AUDIT",
  "4C-NO-SENSITIVE-PERSISTENCE",
  "4C-DEMO-RESET-SCOPE"
] as const;

describe("Checkpoint 4C machine-readable traceability", () => {
  it("maps every requested adversarial control exactly once", () => {
    const mapping = TraceabilitySchema.parse(mappingFixture);
    const ids = mapping.controls.map(({ controlId }) => controlId);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.toSorted()).toEqual([...requiredControls].toSorted());
  });

  it("points every evidence row to an existing exact test name", async () => {
    const mapping = TraceabilitySchema.parse(mappingFixture);

    for (const { evidence } of mapping.controls) {
      const source = await readFile(path.join(REPOSITORY_ROOT, evidence.testFile), "utf8");
      expect(source, `${evidence.testFile} must contain ${evidence.testName}`).toContain(
        `"${evidence.testName}"`
      );
    }
  });

  it("uses requirement identifiers present in the frozen requirements plan", async () => {
    const mapping = TraceabilitySchema.parse(mappingFixture);
    const requirements = await readFile(
      path.join(REPOSITORY_ROOT, "planning/03_REQUIREMENTS_AND_TEST_PLAN.md"),
      "utf8"
    );

    for (const requirementId of new Set(
      mapping.controls.flatMap(({ requirementIds }) => requirementIds)
    )) {
      expect(requirements).toContain(`| ${requirementId} |`);
    }
  });
});
