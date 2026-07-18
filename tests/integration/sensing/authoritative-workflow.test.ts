import { describe, expect, it } from "vitest";

import { AdaptiveSelectionEnvelopeSchema } from "../../../packages/contracts/src/index";
import type { AdaptiveSelectionProvider } from "../../../packages/inference/src/index";
import { CompanionResultRecordSchema } from "../../../packages/companion/src/index";
import { parseServerEnvironment } from "../../../apps/web/src/env";
import { createServerRuntime } from "../../../apps/web/src/server/runtime";
import { CompanionWorkflowProcessor } from "../../../apps/web/src/server/companion/workflow";
import {
  SENSING_NOW,
  SENSING_PATIENT_ID,
  faceRecord,
  fingerRecord,
  registeredAlgorithms,
  voiceRecord
} from "../../contract/sensing/fixtures";

type Runtime = ReturnType<typeof createServerRuntime>;
type FingerMutation = Readonly<{
  pulseBpm?: number;
  algorithmVersion?: string;
  metrics?: Readonly<Record<string, number>>;
}>;
type VoiceMetricMutation = Readonly<{
  estimatedSnrDb?: number;
  clippingFraction?: number;
  durationMs?: number;
}>;

const FINGER_FAILURES: ReadonlyArray<readonly [string, FingerMutation]> = [
  ["BPM tampering", { pulseBpm: 190 }],
  ["algorithm tampering", { algorithmVersion: "finger_ppg_hr_v999" }],
  ["motion", { metrics: { motion: 0.9 } }],
  ["coverage", { metrics: { coverage: 0.2 } }],
  ["cadence", { metrics: { cadenceHz: 10 } }],
  ["jitter", { metrics: { jitterRatio: 0.5 } }],
  ["saturation", { metrics: { saturation: 0.8 } }],
  ["signal", { metrics: { signalStrength: 0.0001 } }],
  ["estimator disagreement", { metrics: { estimatorDifferenceBpm: 30 } }]
];

const VOICE_FAILURES: ReadonlyArray<readonly [string, VoiceMetricMutation]> = [
  ["noise", { estimatedSnrDb: 5 }],
  ["clipping", { clippingFraction: 0.08 }],
  ["short duration", { durationMs: 5_500 }]
];

function ids(namespace = "78000000"): () => string {
  let next = 1;
  return () => `${namespace}-0000-4000-8000-${String(next++).padStart(12, "0")}`;
}

function selectingProvider(moduleId: "voice.local.baseline"): AdaptiveSelectionProvider {
  return {
    async select(input) {
      return {
        ok: true,
        envelope: AdaptiveSelectionEnvelopeSchema.parse({
          roundId: input.roundId,
          stateVersion: input.stateVersion,
          decision: {
            decision: "select",
            candidateModuleId: moduleId,
            evidenceReferenceIds: [],
            rationale: "The fixture selected one already eligible local research signal.",
            uncertainty: "low",
            missingInformation: []
          },
          provenance: {
            attemptId: "78000000-0000-4000-8000-000000000099",
            provider: "fake",
            task: "adaptive_module_selection",
            modelAlias: "fixture-voice-selection-v1",
            contractVersion: "adaptive-selection.v1",
            attemptedAt: SENSING_NOW,
            durationMs: 0,
            tokenUsage: null
          }
        })
      };
    }
  };
}

function runtimeFor(kind: "finger" | "face" | "voice"): Runtime {
  return createServerRuntime({
    environment: parseServerEnvironment(
      kind === "face"
        ? {
            OPTICAL_ASSESSMENT_PROVIDER: "vitallens",
            VITALLENS_API_KEY: "fixture-placeholder-not-a-live-credential",
            VITALLENS_PROXY_ENABLED: "true"
          }
        : kind === "voice"
          ? {
              INFERENCE_PROVIDER: "fake",
              ADAPTIVE_SELECTION_ENABLED: "true",
              VOICE_BIOMARKER_ENABLED: "true"
            }
          : {}
    ),
    ...(kind === "voice"
      ? { adaptiveSelectionProvider: selectingProvider("voice.local.baseline") }
      : {}),
    now: () => SENSING_NOW,
    createId: ids(kind === "finger" ? "78100000" : kind === "face" ? "78200000" : "78300000"),
    assessmentAttestationSecret: "fixture-assessment-attestation-secret-value"
  });
}

async function selectRound(runtime: Runtime, expectedModuleId: string) {
  const created = await runtime.orchestration.createRound({
    patientId: SENSING_PATIENT_ID,
    triggerId: `sensing-${expectedModuleId}`,
    purpose: "Synthetic sensing integration verification",
    protocolId: "cardiometabolic_demo",
    burdenSeconds: 120,
    correlationId: "sensing-create"
  });
  const screened = await runtime.orchestration.transition({
    roundId: created.round.id,
    patientId: SENSING_PATIENT_ID,
    to: "red_flag_screen",
    expectedStateVersion: created.round.stateVersion,
    actor: { kind: "patient", id: "fixture-patient" },
    source: "patient_ui",
    correlationId: "sensing-screen"
  });
  const collecting = await runtime.orchestration.transition({
    roundId: screened.id,
    patientId: SENSING_PATIENT_ID,
    to: "collecting_report",
    expectedStateVersion: screened.stateVersion,
    actor: { kind: "patient", id: "fixture-patient" },
    source: "patient_ui",
    correlationId: "sensing-collect"
  });
  const selected = await runtime.orchestration.submitReport({
    roundId: collecting.id,
    patientId: SENSING_PATIENT_ID,
    report: {
      reportId: "78400000-0000-4000-8000-000000000001",
      roundId: collecting.id,
      weakness: expectedModuleId === "voice.local.baseline" ? "mild" : "absent",
      palpitations: expectedModuleId === "voice.local.baseline" ? "unknown" : "absent",
      redFlags: { chestPain: "no", severeBreathlessness: "no", fainted: "no" },
      inputMode: "text",
      confirmedAt: SENSING_NOW
    },
    expectedStateVersion: collecting.stateVersion,
    actorId: "fixture-patient",
    correlationId: "sensing-report"
  });
  expect(selected.selectedModuleId).toBe(expectedModuleId);
  return selected.round;
}

describe("authoritative companion sensing workflow", () => {
  it("ingests one registered finger result idempotently and refreshes the authoritative round", async () => {
    const runtime = runtimeFor("finger");
    const round = await selectRound(runtime, "capture.finger_ppg.pulse");
    const record = fingerRecord({
      roundId: round.id,
      roundStateVersion: round.stateVersion,
      resultId: "78500000-0000-4000-8000-000000000001"
    });
    const processor = new CompanionWorkflowProcessor(runtime);

    await processor.process({
      record,
      ownerPatientId: SENSING_PATIENT_ID,
      device: { deviceClass: "phone", platform: "ios" }
    });
    await processor.process({
      record,
      ownerPatientId: SENSING_PATIENT_ID,
      device: { deviceClass: "phone", platform: "ios" }
    });

    const measurements = await runtime.repository.listMeasurementFacts(round.id);
    expect(measurements).toHaveLength(1);
    expect(measurements[0]?.fact).toMatchObject({
      provider: "finger_ppg",
      algorithmVersion: registeredAlgorithms.finger,
      value: 72,
      rawMediaRef: null
    });
    expect((await runtime.orchestration.getRound(round.id)).state).toBe("action_pending");
    await runtime.ensureBaselinesReady();
    expect(
      (await runtime.baselines.listPatientSeries(SENSING_PATIENT_ID)).find(
        ({ context }) => context.provider === "finger_ppg"
      )
    ).toMatchObject({
      context: {
        algorithmVersion: { status: "known", value: registeredAlgorithms.finger },
        device: { deviceClass: "phone", platform: "ios", captureSurface: "rear_camera" }
      }
    });
  });

  it("ingests a consented face result with exact provider/device/version separation", async () => {
    const runtime = runtimeFor("face");
    const round = await selectRound(runtime, "capture.vitallens.pulse");
    const record = faceRecord({
      roundId: round.id,
      roundStateVersion: round.stateVersion,
      resultId: "78500000-0000-4000-8000-000000000002"
    });

    await new CompanionWorkflowProcessor(runtime).process({
      record,
      ownerPatientId: SENSING_PATIENT_ID,
      device: { deviceClass: "phone", platform: "android" }
    });

    expect((await runtime.repository.listMeasurementFacts(round.id))[0]?.fact).toMatchObject({
      provider: "vitallens",
      algorithmVersion: registeredAlgorithms.face,
      providerModelVersion: "vitallens-model-4.2",
      rawMediaRef: null
    });
    await runtime.ensureBaselinesReady();
    expect(
      (await runtime.baselines.listPatientSeries(SENSING_PATIENT_ID)).find(
        ({ context }) =>
          context.provider === "vitallens" &&
          context.providerVersion.status === "known" &&
          context.providerVersion.value === "vitallens-model-4.2" &&
          context.device.platform === "android"
      )
    ).toMatchObject({
      context: {
        providerVersion: { status: "known", value: "vitallens-model-4.2" },
        algorithmVersion: { status: "known", value: registeredAlgorithms.face },
        device: { platform: "android", captureSurface: "front_camera" }
      },
      samples: [{ provenance: { rawMediaStored: false, transcriptStored: false } }]
    });
  });

  it("ingests a local research-only voice result and stores no PCM or transcript", async () => {
    const runtime = runtimeFor("voice");
    const round = await selectRound(runtime, "voice.local.baseline");
    const record = voiceRecord({
      roundId: round.id,
      roundStateVersion: round.stateVersion,
      resultId: "78500000-0000-4000-8000-000000000003"
    });
    const processor = new CompanionWorkflowProcessor(runtime);

    await processor.process({
      record,
      ownerPatientId: SENSING_PATIENT_ID,
      device: { deviceClass: "phone", platform: "ios" }
    });
    await processor.process({
      record,
      ownerPatientId: SENSING_PATIENT_ID,
      device: { deviceClass: "phone", platform: "ios" }
    });

    const facts = await runtime.repository.listVoiceBiomarkerFacts(round.id);
    expect(facts).toHaveLength(1);
    expect(facts[0]?.fact).toMatchObject({
      provider: "local_voice_features",
      algorithmVersion: registeredAlgorithms.voice,
      researchOnly: true,
      rawMediaRef: null
    });
    expect((await runtime.orchestration.getEvidenceRoute(round.id)).voiceBiomarkerCompleted).toBe(
      true
    );
    const events = await runtime.repository.listAuditEvents(round.id);
    const series = await runtime.baselines.listPatientSeries(SENSING_PATIENT_ID);
    const persisted = JSON.stringify({ facts, events, series });
    expect(persisted).not.toMatch(
      /"(?:rawAudio|audioBytes|pcm|transcript|providerPayload|prompt)"\s*:/i
    );
    expect(series.flatMap((entry) => entry.samples)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provenance: expect.objectContaining({ rawMediaStored: false, transcriptStored: false })
        })
      ])
    );
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          payload: expect.objectContaining({ rawMediaStored: false })
        })
      ])
    );
  });

  it.each(FINGER_FAILURES)(
    "rejects cross-device finger %s with no numeric measurement",
    async (_name, mutation) => {
      const runtime = runtimeFor("finger");
      const round = await selectRound(runtime, "capture.finger_ppg.pulse");
      const base = fingerRecord({
        roundId: round.id,
        roundStateVersion: round.stateVersion,
        resultId: "78600000-0000-4000-8000-000000000001"
      });
      if (base.result.outcome !== "derived_candidate" || base.result.taskKind !== "finger_pulse") {
        throw new Error("Expected a finger candidate fixture.");
      }
      const record = CompanionResultRecordSchema.parse({
        ...base,
        result: {
          ...base.result,
          derived: {
            ...base.result.derived,
            ...(mutation.pulseBpm === undefined ? {} : { pulseBpm: mutation.pulseBpm }),
            ...(mutation.algorithmVersion === undefined
              ? {}
              : { algorithmVersion: mutation.algorithmVersion }),
            quality: {
              ...base.result.derived.quality,
              metrics: { ...base.result.derived.quality.metrics, ...mutation.metrics }
            }
          }
        }
      });

      await expect(
        new CompanionWorkflowProcessor(runtime).process({
          record,
          ownerPatientId: SENSING_PATIENT_ID,
          device: { deviceClass: "phone", platform: "ios" }
        })
      ).rejects.toThrow();
      await expect(runtime.repository.listMeasurementFacts(round.id)).resolves.toHaveLength(0);
      expect((await runtime.orchestration.getRound(round.id)).state).toBe("assessment_selected");
    }
  );

  it.each([
    ["face absent", { confidence: 0.92, faceDetected: 0 }],
    ["low face confidence", { confidence: 0.5, faceDetected: 1 }]
  ])("rejects %s without a face-derived measurement", async (_name, mutation) => {
    const runtime = runtimeFor("face");
    const round = await selectRound(runtime, "capture.vitallens.pulse");
    const record = faceRecord({
      roundId: round.id,
      roundStateVersion: round.stateVersion,
      resultId: "78600000-0000-4000-8000-000000000002",
      ...mutation
    });
    await expect(
      new CompanionWorkflowProcessor(runtime).process({
        record,
        ownerPatientId: SENSING_PATIENT_ID,
        device: { deviceClass: "phone", platform: "ios" }
      })
    ).rejects.toThrow();
    await expect(runtime.repository.listMeasurementFacts(round.id)).resolves.toHaveLength(0);
  });

  it.each(VOICE_FAILURES)(
    "rejects voice %s without a persisted derived fact",
    async (_name, metricMutation) => {
      const runtime = runtimeFor("voice");
      const round = await selectRound(runtime, "voice.local.baseline");
      const base = voiceRecord({
        roundId: round.id,
        roundStateVersion: round.stateVersion,
        resultId: "78600000-0000-4000-8000-000000000003"
      });
      if (base.result.outcome !== "derived_candidate" || base.result.taskKind !== "voice_signal") {
        throw new Error("Expected a voice candidate fixture.");
      }
      const durationMs = metricMutation.durationMs ?? base.result.derived.durationMs;
      const record = CompanionResultRecordSchema.parse({
        ...base,
        result: {
          ...base.result,
          derived: {
            ...base.result.derived,
            durationMs,
            features: { ...base.result.derived.features, phonationDurationMs: durationMs },
            quality: {
              ...base.result.derived.quality,
              metrics: { ...base.result.derived.quality.metrics, ...metricMutation, durationMs }
            }
          }
        }
      });
      await expect(
        new CompanionWorkflowProcessor(runtime).process({
          record,
          ownerPatientId: SENSING_PATIENT_ID,
          device: { deviceClass: "phone", platform: "ios" }
        })
      ).rejects.toThrow();
      await expect(runtime.repository.listVoiceBiomarkerFacts(round.id)).resolves.toHaveLength(0);
    }
  );

  it("rejects stale round, task, and owner bindings before workflow mutation", async () => {
    for (const kind of ["stale", "task", "owner"] as const) {
      const runtime = runtimeFor("finger");
      const round = await selectRound(runtime, "capture.finger_ppg.pulse");
      const base = fingerRecord({
        roundId: round.id,
        roundStateVersion: round.stateVersion,
        resultId: "78600000-0000-4000-8000-000000000004"
      });
      const record =
        kind === "stale"
          ? CompanionResultRecordSchema.parse({
              ...base,
              roundStateVersion: base.roundStateVersion + 1
            })
          : kind === "task"
            ? CompanionResultRecordSchema.parse({
                ...base,
                result: { ...base.result, taskId: "capture.vitallens.pulse" }
              })
            : base;
      await expect(
        new CompanionWorkflowProcessor(runtime).process({
          record,
          ownerPatientId: kind === "owner" ? "synthetic-other-owner" : SENSING_PATIENT_ID,
          device: { deviceClass: "phone", platform: "ios" }
        })
      ).rejects.toThrow();
      await expect(runtime.repository.listMeasurementFacts(round.id)).resolves.toHaveLength(0);
    }
  });
});
