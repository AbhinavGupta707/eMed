import {
  ApiSuccessEnvelopeSchema,
  CreateRoundDataSchema,
  RoundDataSchema,
  SubmitReportDataSchema
} from "../../../packages/api-client/src/index";
import { AdaptiveSelectionEnvelopeSchema } from "../../../packages/contracts/src/index";
import type { AdaptiveSelectionProvider } from "../../../packages/inference/src/index";
import type { ZodType } from "../../../packages/contracts/node_modules/zod";

import { parseServerEnvironment } from "../../../apps/web/src/env";
import {
  handleCreateRound,
  handleSubmitReport,
  handleTransitionRound
} from "../../../apps/web/src/server/route-handlers";
import {
  createServerRuntime,
  type ServerRuntime,
  type ServerRuntimeOverrides
} from "../../../apps/web/src/server/runtime";

import { AI_TEST_NOW } from "../../ai/fixtures";

export function monotonicClock(): () => string {
  let tick = Date.parse(AI_TEST_NOW);
  return () => new Date(tick++).toISOString();
}

export function idFactory(): () => string {
  let value = 1;
  return () => `77000000-0000-4000-8000-${String(value++).padStart(12, "0")}`;
}

export function apiRequest(
  path: string,
  body: unknown,
  correlationId: string,
  options: {
    role?: "patient" | "clinician";
    headers?: Record<string, string>;
  } = {}
): Request {
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      "x-correlation-id": correlationId,
      "x-homerounds-demo-role": options.role ?? "patient",
      ...options.headers
    },
    body: JSON.stringify(body)
  });
}

export async function success<T>(response: Response, schema: ZodType<T>): Promise<T> {
  if (response.status !== 200) {
    throw new Error(`Expected HTTP 200, received ${response.status}: ${await response.text()}`);
  }
  return ApiSuccessEnvelopeSchema(schema).parse(await response.json()).data;
}

export function createKeylessRuntime(
  overrides: ServerRuntimeOverrides = {},
  environmentOverrides: Record<string, string | undefined> = {}
): ServerRuntime {
  return createServerRuntime({
    environment: parseServerEnvironment({
      PERSISTENCE_PROVIDER: "memory",
      ...environmentOverrides
    }),
    now: monotonicClock(),
    createId: idFactory(),
    assessmentAttestationSecret: "synthetic-assessment-attestation-secret",
    ...overrides
  });
}

export function medicationSelectingProvider(): AdaptiveSelectionProvider {
  return {
    async select(input) {
      return {
        ok: true,
        envelope: AdaptiveSelectionEnvelopeSchema.parse({
          roundId: input.roundId,
          stateVersion: input.stateVersion,
          decision: {
            decision: "select",
            candidateModuleId: "medication.label.review",
            evidenceReferenceIds: ["patient.report"],
            rationale: "A bounded synthetic label review may resolve one evidence gap.",
            uncertainty: "medium",
            missingInformation: ["Visible synthetic label fields"]
          },
          provenance: {
            attemptId: "77000000-0000-4000-8000-000000000090",
            provider: "fake",
            task: "adaptive_module_selection",
            modelAlias: "fake-medication-route-v1",
            contractVersion: "adaptive-selection.v1",
            attemptedAt: AI_TEST_NOW,
            durationMs: 1,
            tokenUsage: null
          }
        })
      };
    }
  };
}

export async function createCollectingRound(runtime: ServerRuntime, triggerId: string) {
  const created = await success(
    await handleCreateRound(
      apiRequest(
        "/api/rounds",
        {
          patientId: "synthetic-maya",
          triggerId,
          purpose: "Synthetic adversarial AI boundary evaluation",
          protocolId: "cardiometabolic_demo",
          burdenSeconds: 120
        },
        `${triggerId}-create`
      ),
      runtime
    ),
    CreateRoundDataSchema
  );
  const screened = await success(
    await handleTransitionRound(
      apiRequest(
        `/api/rounds/${created.round.id}/transition`,
        { to: "red_flag_screen", expectedStateVersion: created.round.stateVersion },
        `${triggerId}-screen`
      ),
      runtime,
      created.round.id
    ),
    RoundDataSchema
  );
  const collecting = await success(
    await handleTransitionRound(
      apiRequest(
        `/api/rounds/${created.round.id}/transition`,
        { to: "collecting_report", expectedStateVersion: screened.round.stateVersion },
        `${triggerId}-collecting`
      ),
      runtime,
      created.round.id
    ),
    RoundDataSchema
  );
  return { roundId: created.round.id, collecting: collecting.round };
}

export async function submitReport(input: {
  runtime: ServerRuntime;
  roundId: string;
  stateVersion: number;
  reportId: string;
  correlationId: string;
  note?: string;
  redFlags?: {
    chestPain: "yes" | "no" | "unsure";
    severeBreathlessness: "yes" | "no" | "unsure";
    fainted: "yes" | "no" | "unsure";
  };
}) {
  return success(
    await handleSubmitReport(
      apiRequest(
        `/api/rounds/${input.roundId}/report`,
        {
          report: {
            reportId: input.reportId,
            roundId: input.roundId,
            weakness: "mild",
            palpitations: "unknown",
            redFlags: input.redFlags ?? {
              chestPain: "no",
              severeBreathlessness: "no",
              fainted: "no"
            },
            ...(input.note ? { note: input.note } : {}),
            inputMode: input.note ? "voice_confirmed" : "text",
            confirmedAt: AI_TEST_NOW
          },
          expectedStateVersion: input.stateVersion
        },
        input.correlationId
      ),
      input.runtime,
      input.roundId
    ),
    SubmitReportDataSchema
  );
}
