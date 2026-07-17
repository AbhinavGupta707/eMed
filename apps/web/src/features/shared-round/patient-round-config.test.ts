import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  PatientScenarioIdSchema,
  SYNTHETIC_MAYA_SCENARIOS,
  patientRoundConfigForScenario
} from "./patient-round-config";

describe("patient demo scenario configuration", () => {
  it("matches the authoritative demo bundle exactly", () => {
    const bundle = JSON.parse(
      readFileSync(new URL("../../../../../data/demo/scenarios.v1.json", import.meta.url), "utf8")
    ) as {
      protocolId: string;
      scenarios: Array<{
        id: string;
        patientId: string;
        triggerId: string;
        purpose: string;
        burdenSeconds: number;
      }>;
    };

    for (const scenario of bundle.scenarios) {
      const id = PatientScenarioIdSchema.parse(scenario.id);
      expect(SYNTHETIC_MAYA_SCENARIOS[id]).toEqual({
        patientId: scenario.patientId,
        triggerId: scenario.triggerId,
        purpose: scenario.purpose,
        protocolId: bundle.protocolId,
        burdenSeconds: scenario.burdenSeconds
      });
    }
  });

  it("fails unknown scenario selectors safely to the happy text story", () => {
    expect(patientRoundConfigForScenario("unknown")).toBe(
      SYNTHETIC_MAYA_SCENARIOS["maya-happy-text"]
    );
  });
});
