import { readFile } from "node:fs/promises";

import { normalizeFhirBundle } from "@homerounds/clinical-records";
import {
  MeasurementFactSchema,
  type OpticalAssessmentProvider,
  type OpticalAssessmentResult,
  type OpticalProviderKind,
  PatientReportSchema
} from "@homerounds/contracts";
import { planNextModule } from "@homerounds/planner";
import { evaluateProtocol } from "@homerounds/protocols";
import { describe, expect, it } from "vitest";

import { resolveReleaseOpticalProvider } from "./registry";

const NOW = "2026-07-17T12:00:00.000Z";
const ROUND_ID = "137c9d4f-4dfc-4b95-a5ce-657ba00b29b4";
const REPORT_ID = "1d8163f3-22f5-4f99-850b-827ce2a05277";
const SESSION_ID = "f7d4aa87-4da3-4bd4-a496-5a3c2e528bcc";

async function jsonFixture(path: string): Promise<unknown> {
  return JSON.parse(await readFile(new URL(path, import.meta.url), "utf8")) as unknown;
}

function completedProvider(kind: OpticalProviderKind): OpticalAssessmentProvider {
  return {
    kind,
    checkAvailability: async () => ({
      available: true,
      capabilities: { camera: true }
    }),
    capture: async ({ assessmentSessionId }): Promise<OpticalAssessmentResult> => ({
      status: "completed",
      measurement: MeasurementFactSchema.parse({
        factId:
          kind === "finger_ppg"
            ? "cf542d34-59f4-4ea7-abd4-fe93c94e13a8"
            : "46a75b88-d73d-4885-82c4-c290336c9db4",
        assessmentSessionId,
        provider: kind,
        value: 72,
        unit: "bpm",
        observedAt: NOW,
        durationMs: 30_000,
        algorithmVersion: kind === "finger_ppg" ? "finger_ppg_local_v1" : "vitallens_face_rppg_v1",
        providerModelVersion: kind === "vitallens" ? "fixture-model-v1" : null,
        quality: { status: "pass", score: 0.94, reasons: [], metrics: {} },
        rawMediaRef: null
      })
    }),
    dispose: async () => undefined
  };
}

describe("Checkpoint 1 snapshot to deterministic protocol integration", () => {
  it.each(["finger_ppg", "vitallens"] as const)(
    "normalizes the %s fixture through one provider-neutral workflow",
    async (selected) => {
      const snapshotResult = normalizeFhirBundle(
        await jsonFixture("../../../data/fhir/maya-bundle.json"),
        {
          patientId: "synthetic-maya",
          asOf: NOW,
          observationFreshnessDays: 30
        }
      );
      expect(snapshotResult.ok).toBe(true);
      if (!snapshotResult.ok) return;

      const triggered = snapshotResult.snapshot.conditions.some(
        ({ code, clinicalStatus }) => code === "44054006" && clinicalStatus === "active"
      );
      expect(triggered).toBe(true);

      const plan = planNextModule({
        neededFactKeys: ["pulse_bpm"],
        burdenSecondsRemaining: 90,
        followUpQuestionsAsked: 0,
        candidates: [
          {
            id: "capture.current.pulse",
            kind: "pulse_capture",
            producesFactKey: "pulse_bpm",
            available: true,
            estimatedBurdenSeconds: 30,
            scoring: { informationGain: 90, reliability: 85, burdenCost: 15 }
          }
        ]
      });
      expect(plan.selected?.id).toBe("capture.current.pulse");

      const provider = resolveReleaseOpticalProvider({
        selected,
        providers: {
          finger_ppg: completedProvider("finger_ppg"),
          vitallens: completedProvider("vitallens")
        }
      });
      const assessment = await provider.capture({
        assessmentSessionId: SESSION_ID,
        signal: new AbortController().signal
      });
      expect(assessment.status).toBe("completed");
      if (assessment.status !== "completed") return;
      expect(assessment.measurement.provider).toBe(selected);
      expect(assessment.measurement.rawMediaRef).toBeNull();

      const report = PatientReportSchema.parse({
        reportId: REPORT_ID,
        roundId: ROUND_ID,
        weakness: "absent",
        palpitations: "absent",
        redFlags: { chestPain: "no", severeBreathlessness: "no", fainted: "no" },
        inputMode: "text",
        confirmedAt: NOW
      });
      const protocol = await jsonFixture("../../../data/protocols/cardiometabolic-demo.v1.json");
      const input = {
        now: NOW,
        report,
        measurement: { status: "present" as const, fact: assessment.measurement },
        followUp: { status: "not_asked" as const },
        followUpQuestionsAsked: 0
      };

      const first = evaluateProtocol(protocol, input);
      const second = evaluateProtocol(protocol, input);
      expect(second).toEqual(first);
      expect(first).toMatchObject({
        kind: "result",
        result: {
          outcome: "programme_review_requested",
          allowedActions: ["create_programme_task"],
          matchedRuleIds: ["illustrative_normal_pulse"]
        }
      });
      expect(JSON.stringify(first)).not.toMatch(/raw|frame|byte/i);
    }
  );

  it("keeps quality failure out of measurement facts and abstains for review", async () => {
    const protocol = await jsonFixture("../../../data/protocols/cardiometabolic-demo.v1.json");
    const report = PatientReportSchema.parse({
      reportId: REPORT_ID,
      roundId: ROUND_ID,
      weakness: "absent",
      palpitations: "absent",
      redFlags: { chestPain: "no", severeBreathlessness: "no", fainted: "no" },
      inputMode: "text",
      confirmedAt: NOW
    });
    const quality = {
      status: "fail" as const,
      score: 0.12,
      reasons: ["motion" as const],
      metrics: { motion: 0.91 }
    };

    const decision = evaluateProtocol(protocol, {
      now: NOW,
      report,
      measurement: { status: "quality_failed", quality },
      followUp: { status: "not_asked" },
      followUpQuestionsAsked: 0
    });

    expect(decision).toMatchObject({
      kind: "result",
      result: {
        outcome: "abstain_for_review",
        missingFactKeys: ["pulse_bpm"],
        factIds: [REPORT_ID]
      }
    });
    expect(JSON.stringify(decision)).not.toContain("rawMediaRef");
  });
});
