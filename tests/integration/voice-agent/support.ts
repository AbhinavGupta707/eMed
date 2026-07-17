import {
  ApiSuccessEnvelopeSchema,
  CreateRoundDataSchema,
  RoundDataSchema,
  SubmitReportDataSchema
} from "../../../packages/api-client/src/index";
import {
  AdaptiveSelectionEnvelopeSchema,
  type PatientReport
} from "../../../packages/contracts/src/index";
import type { AdaptiveSelectionProvider } from "../../../packages/inference/src/index";
import type { ZodType } from "../../../packages/contracts/node_modules/zod";

import { parseServerEnvironment } from "../../../apps/web/src/env";
import {
  handleCreateRound,
  handleSubmitReport,
  handleTransitionRound
} from "../../../apps/web/src/server/route-handlers";
import { createServerRuntime, type ServerRuntime } from "../../../apps/web/src/server/runtime";

import { VOICE_TEST_NOW } from "../../ai/voice-agent/fixtures";

export function voiceAgentApiRequest(path: string, body: unknown, correlationId: string): Request {
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      "x-correlation-id": correlationId,
      "x-homerounds-demo-role": "patient"
    },
    body: JSON.stringify(body)
  });
}

export async function voiceAgentSuccess<T>(response: Response, schema: ZodType<T>): Promise<T> {
  if (response.status !== 200) {
    throw new Error(`Expected HTTP 200, received ${response.status}: ${await response.text()}`);
  }
  return ApiSuccessEnvelopeSchema(schema).parse(await response.json()).data;
}

function deterministicIds(): () => string {
  let value = 1;
  return () => `89000000-0000-4000-8000-${String(value++).padStart(12, "0")}`;
}

function monotonicNow(): () => string {
  let value = Date.parse(VOICE_TEST_NOW);
  return () => new Date(value++).toISOString();
}

export function createVoiceAgentRuntime(
  input: {
    adaptiveSelectionProvider?: AdaptiveSelectionProvider;
    adaptiveSelectionEnabled?: boolean;
    voiceBiomarkerEnabled?: boolean;
  } = {}
): ServerRuntime {
  const adaptiveSelectionEnabled = input.adaptiveSelectionEnabled ?? false;
  return createServerRuntime({
    environment: parseServerEnvironment({
      APP_ENV: "development",
      PERSISTENCE_PROVIDER: "memory",
      VOICE_PROVIDER: "disabled",
      INFERENCE_PROVIDER: adaptiveSelectionEnabled ? "fake" : "disabled",
      ADAPTIVE_SELECTION_ENABLED: String(adaptiveSelectionEnabled),
      VOICE_BIOMARKER_ENABLED: String(input.voiceBiomarkerEnabled ?? true)
    }),
    ...(input.adaptiveSelectionProvider
      ? { adaptiveSelectionProvider: input.adaptiveSelectionProvider }
      : {}),
    now: monotonicNow(),
    createId: deterministicIds(),
    assessmentAttestationSecret: "synthetic-voice-assessment-attestation-secret"
  });
}

export function voiceSelectingProvider(): AdaptiveSelectionProvider {
  return {
    async select(input) {
      return {
        ok: true,
        envelope: AdaptiveSelectionEnvelopeSchema.parse({
          roundId: input.roundId,
          stateVersion: input.stateVersion,
          decision: {
            decision: "select",
            candidateModuleId: "voice.local.baseline",
            evidenceReferenceIds: ["patient.report"],
            rationale:
              "The optional research voice signal addresses the bounded synthetic evidence gap.",
            uncertainty: "medium",
            missingInformation: []
          },
          provenance: {
            attemptId: "89000000-0000-4000-8000-000000000090",
            provider: "fireworks",
            task: "adaptive_module_selection",
            modelAlias: "deepseek-v4-pro-none",
            contractVersion: "adaptive-selection.v1",
            attemptedAt: VOICE_TEST_NOW,
            durationMs: 2,
            tokenUsage: null
          }
        })
      };
    }
  };
}

export async function createCollectingVoiceRound(runtime: ServerRuntime, triggerId: string) {
  const created = await voiceAgentSuccess(
    await handleCreateRound(
      voiceAgentApiRequest(
        "/api/rounds",
        {
          patientId: "synthetic-maya",
          triggerId,
          purpose: "Synthetic voice-agent verification round",
          protocolId: "cardiometabolic_demo",
          burdenSeconds: 120
        },
        `${triggerId}-create`
      ),
      runtime
    ),
    CreateRoundDataSchema
  );
  const screened = await voiceAgentSuccess(
    await handleTransitionRound(
      voiceAgentApiRequest(
        `/api/rounds/${created.round.id}/transition`,
        { to: "red_flag_screen", expectedStateVersion: created.round.stateVersion },
        `${triggerId}-screen`
      ),
      runtime,
      created.round.id
    ),
    RoundDataSchema
  );
  const collecting = await voiceAgentSuccess(
    await handleTransitionRound(
      voiceAgentApiRequest(
        `/api/rounds/${created.round.id}/transition`,
        { to: "collecting_report", expectedStateVersion: screened.round.stateVersion },
        `${triggerId}-collect`
      ),
      runtime,
      created.round.id
    ),
    RoundDataSchema
  );
  return { roundId: created.round.id, round: collecting.round };
}

export function submitVoiceAgentReportResponse(input: {
  runtime: ServerRuntime;
  roundId: string;
  expectedStateVersion: number;
  reportId: string;
  inputMode: PatientReport["inputMode"];
  correlationId: string;
  note?: string;
  redFlags?: PatientReport["redFlags"];
}) {
  return handleSubmitReport(
    voiceAgentApiRequest(
      `/api/rounds/${input.roundId}/report`,
      {
        report: {
          reportId: input.reportId,
          roundId: input.roundId,
          weakness: "mild",
          palpitations: "intermittent",
          redFlags: input.redFlags ?? {
            chestPain: "no",
            severeBreathlessness: "no",
            fainted: "no"
          },
          ...(input.note ? { note: input.note } : {}),
          inputMode: input.inputMode,
          confirmedAt: VOICE_TEST_NOW
        },
        expectedStateVersion: input.expectedStateVersion
      },
      input.correlationId
    ),
    input.runtime,
    input.roundId
  );
}

export async function submitVoiceAgentReport(
  input: Parameters<typeof submitVoiceAgentReportResponse>[0]
) {
  return voiceAgentSuccess(await submitVoiceAgentReportResponse(input), SubmitReportDataSchema);
}
