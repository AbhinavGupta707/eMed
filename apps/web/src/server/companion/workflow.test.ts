import { FINGER_PPG_ALGORITHM_VERSION } from "@homerounds/assessments";
import { CompanionResultRecordSchema } from "@homerounds/companion";
import { describe, expect, it } from "vitest";

import { parseServerEnvironment } from "../../env";
import { createServerRuntime } from "../runtime";
import { CompanionWorkflowProcessor } from "./workflow";

const NOW = "2026-07-18T08:00:00.000Z";
const PATIENT_ID = "synthetic-maya";

function ids(): () => string {
  let next = 1;
  return () => `91000000-0000-4000-8000-${String(next++).padStart(12, "0")}`;
}

async function selectedFingerRound(runtime: ReturnType<typeof createServerRuntime>) {
  const created = await runtime.orchestration.createRound({
    patientId: PATIENT_ID,
    triggerId: "companion-workflow-finger",
    purpose: "Synthetic phone sensing workflow test",
    protocolId: "cardiometabolic_demo",
    burdenSeconds: 120,
    correlationId: "companion-create"
  });
  const screened = await runtime.orchestration.transition({
    roundId: created.round.id,
    patientId: PATIENT_ID,
    to: "red_flag_screen",
    expectedStateVersion: created.round.stateVersion,
    actor: { kind: "patient", id: "test-patient" },
    source: "patient_ui",
    correlationId: "companion-screen"
  });
  const collecting = await runtime.orchestration.transition({
    roundId: screened.id,
    patientId: PATIENT_ID,
    to: "collecting_report",
    expectedStateVersion: screened.stateVersion,
    actor: { kind: "patient", id: "test-patient" },
    source: "patient_ui",
    correlationId: "companion-collect"
  });
  const selected = await runtime.orchestration.submitReport({
    roundId: collecting.id,
    patientId: PATIENT_ID,
    report: {
      reportId: "92000000-0000-4000-8000-000000000001",
      roundId: collecting.id,
      weakness: "absent",
      palpitations: "absent",
      redFlags: { chestPain: "no", severeBreathlessness: "no", fainted: "no" },
      inputMode: "text",
      confirmedAt: NOW
    },
    expectedStateVersion: collecting.stateVersion,
    actorId: "test-patient",
    correlationId: "companion-report"
  });
  expect(selected.selectedModuleId).toBe("capture.finger_ppg.pulse");
  return selected.round;
}

describe("companion deterministic workflow processor", () => {
  it("accepts a registered quality-consistent finger result exactly once and records its baseline", async () => {
    const runtime = createServerRuntime({
      environment: parseServerEnvironment({
        VOICE_BIOMARKER_ENABLED: "true",
        MEDICATION_LABEL_AI_ENABLED: "true",
        INFERENCE_PROVIDER: "fake"
      }),
      now: () => NOW,
      createId: ids(),
      assessmentAttestationSecret: "companion-workflow-attestation-secret-value"
    });
    const round = await selectedFingerRound(runtime);
    const record = CompanionResultRecordSchema.parse({
      resultId: "93000000-0000-4000-8000-000000000001",
      pairingId: "93000000-0000-4000-8000-000000000002",
      sessionId: "93000000-0000-4000-8000-000000000003",
      roundId: round.id,
      roundStateVersion: round.stateVersion,
      task: {
        taskId: "capture.finger_ppg.pulse",
        kind: "finger_pulse",
        taskVersion: round.stateVersion
      },
      result: {
        operationId: "93000000-0000-4000-8000-000000000004",
        expectedSessionVersion: 4,
        taskId: "capture.finger_ppg.pulse",
        taskKind: "finger_pulse",
        clientObservedAt: NOW,
        rawMediaStored: false,
        outcome: "derived_candidate",
        derived: {
          pulseBpm: 72,
          durationMs: 15_000,
          algorithmVersion: FINGER_PPG_ALGORITHM_VERSION,
          quality: {
            status: "unreviewed",
            score: 0.9,
            reasons: [],
            metrics: {
              durationMs: 15_000,
              sampleCount: 451,
              cadenceHz: 30,
              jitterRatio: 0.01,
              droppedFrameRatio: 0.01,
              coverage: 0.9,
              saturation: 0.05,
              motion: 0.05,
              signalStrength: 0.01,
              spectralBpm: 72,
              autocorrelationBpm: 72,
              estimatorDifferenceBpm: 0,
              torchAvailable: 1
            }
          }
        }
      },
      receivedAt: NOW,
      validationStatus: "pending_deterministic_workflow"
    });
    const processor = new CompanionWorkflowProcessor(runtime);

    await processor.process({
      record,
      ownerPatientId: PATIENT_ID,
      device: { deviceClass: "phone", platform: "ios" }
    });
    await processor.process({
      record,
      ownerPatientId: PATIENT_ID,
      device: { deviceClass: "phone", platform: "ios" }
    });

    await expect(runtime.repository.listMeasurementFacts(round.id)).resolves.toHaveLength(1);
    expect((await runtime.orchestration.getRound(round.id)).state).toBe("action_pending");
    await runtime.ensureBaselinesReady();
    const pulse = (await runtime.baselines.listPatientSeries(PATIENT_ID)).find(
      ({ context }) =>
        context.provider === "finger_ppg" &&
        context.algorithmVersion.status === "known" &&
        context.algorithmVersion.value === FINGER_PPG_ALGORITHM_VERSION
    );
    expect(pulse).toMatchObject({ seriesVersion: 4, samples: [{}, {}, {}, {}] });
  });

  it("rejects a forged local result whose pulse conflicts with its derived metrics", async () => {
    const runtime = createServerRuntime({
      environment: parseServerEnvironment({}),
      now: () => NOW,
      createId: ids(),
      assessmentAttestationSecret: "companion-workflow-attestation-secret-value"
    });
    const round = await selectedFingerRound(runtime);
    const valid = CompanionResultRecordSchema.parse({
      resultId: "94000000-0000-4000-8000-000000000001",
      pairingId: "94000000-0000-4000-8000-000000000002",
      sessionId: "94000000-0000-4000-8000-000000000003",
      roundId: round.id,
      roundStateVersion: round.stateVersion,
      task: {
        taskId: "capture.finger_ppg.pulse",
        kind: "finger_pulse",
        taskVersion: round.stateVersion
      },
      result: {
        operationId: "94000000-0000-4000-8000-000000000004",
        expectedSessionVersion: 4,
        taskId: "capture.finger_ppg.pulse",
        taskKind: "finger_pulse",
        clientObservedAt: NOW,
        rawMediaStored: false,
        outcome: "derived_candidate",
        derived: {
          pulseBpm: 190,
          durationMs: 15_000,
          algorithmVersion: FINGER_PPG_ALGORITHM_VERSION,
          quality: {
            status: "unreviewed",
            score: 0.9,
            reasons: [],
            metrics: {
              durationMs: 15_000,
              sampleCount: 451,
              cadenceHz: 30,
              jitterRatio: 0.01,
              droppedFrameRatio: 0.01,
              coverage: 0.9,
              saturation: 0.05,
              motion: 0.05,
              signalStrength: 0.01,
              spectralBpm: 72,
              autocorrelationBpm: 72,
              estimatorDifferenceBpm: 0,
              torchAvailable: 1
            }
          }
        }
      },
      receivedAt: NOW,
      validationStatus: "pending_deterministic_workflow"
    });

    await expect(
      new CompanionWorkflowProcessor(runtime).process({
        record: valid,
        ownerPatientId: PATIENT_ID,
        device: { deviceClass: "phone", platform: "ios" }
      })
    ).rejects.toThrow("inconsistent");
    await expect(runtime.repository.listMeasurementFacts(round.id)).resolves.toHaveLength(0);
    expect((await runtime.orchestration.getRound(round.id)).state).toBe("assessment_selected");
  });
});
