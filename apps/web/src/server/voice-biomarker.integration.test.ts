import {
  ApiSuccessEnvelopeSchema,
  AssessmentSessionDataSchema,
  CreateRoundDataSchema,
  RoundDataSchema,
  SkipVoiceBiomarkerDataSchema,
  SubmitReportDataSchema,
  SubmitVoiceBiomarkerDataSchema,
  VoiceBiomarkerSessionDataSchema
} from "@homerounds/api-client";
import { AdaptiveSelectionEnvelopeSchema } from "@homerounds/contracts";
import type { AdaptiveSelectionProvider } from "@homerounds/inference";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { parseServerEnvironment } from "../env";
import {
  handleCreateRound,
  handleGetRound,
  handleSkipVoiceBiomarker,
  handleStartAssessment,
  handleStartVoiceBiomarker,
  handleSubmitReport,
  handleSubmitVoiceBiomarker,
  handleTransitionRound
} from "./route-handlers";
import { createServerRuntime } from "./runtime";

const NOW = "2026-07-17T12:00:00.000Z";

function idFactory(): () => string {
  let value = 1;
  return () => `20000000-0000-4000-8000-${String(value++).padStart(12, "0")}`;
}

function voiceSelectingProvider(): AdaptiveSelectionProvider {
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
              "An optional local research voice signal may add bounded context before pulse capture.",
            uncertainty: "medium",
            missingInformation: ["Derived sustained-vowel features"]
          },
          provenance: {
            attemptId: "cebf19fb-aef8-4cb4-82c4-a51a43f15689",
            provider: "fake",
            task: "adaptive_module_selection",
            modelAlias: "fake-voice-route-v1",
            contractVersion: "adaptive-selection.v1",
            attemptedAt: NOW,
            durationMs: 1,
            tokenUsage: null
          }
        })
      };
    }
  };
}

function apiRequest(path: string, body: unknown, correlationId: string): Request {
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

async function success<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  expect(response.status, await response.clone().text()).toBe(200);
  return ApiSuccessEnvelopeSchema(schema).parse(await response.json()).data;
}

function voiceRuntime() {
  return createServerRuntime({
    environment: parseServerEnvironment({
      INFERENCE_PROVIDER: "fake",
      ADAPTIVE_SELECTION_ENABLED: "true",
      VOICE_BIOMARKER_ENABLED: "true"
    }),
    adaptiveSelectionProvider: voiceSelectingProvider(),
    now: () => NOW,
    createId: idFactory(),
    assessmentAttestationSecret: "assessment-attestation-secret-value"
  });
}

async function createVoiceRound(runtime: ReturnType<typeof voiceRuntime>, triggerId: string) {
  const created = await success(
    await handleCreateRound(
      apiRequest(
        "/api/rounds",
        {
          patientId: "synthetic-maya",
          triggerId,
          purpose: "Synthetic voice-led check-in",
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
        `${triggerId}-collect`
      ),
      runtime,
      created.round.id
    ),
    RoundDataSchema
  );
  const report = await success(
    await handleSubmitReport(
      apiRequest(
        `/api/rounds/${created.round.id}/report`,
        {
          report: {
            reportId: "641a9724-6afe-4c14-9a29-f6b5f96448f1",
            roundId: created.round.id,
            weakness: "mild",
            palpitations: "unknown",
            redFlags: { chestPain: "no", severeBreathlessness: "no", fainted: "no" },
            inputMode: "voice_confirmed",
            confirmedAt: NOW
          },
          expectedStateVersion: collecting.round.stateVersion
        },
        `${triggerId}-report`
      ),
      runtime,
      created.round.id
    ),
    SubmitReportDataSchema
  );
  expect(report.evidenceRoute).toMatchObject({
    selection: {
      status: "accepted",
      envelope: { decision: { candidateModuleId: "voice.local.baseline" } }
    },
    selectedModuleId: "voice.local.baseline",
    voiceBiomarkerCompleted: false,
    voiceBiomarkerSkipped: false
  });
  return { roundId: created.round.id, report };
}

describe("voice biomarker server boundary", () => {
  it("quality-gates, persists, resumes, and idempotently replays derived voice evidence", async () => {
    const runtime = voiceRuntime();
    const { roundId, report } = await createVoiceRound(runtime, "voice-complete");

    const blockedPulse = await handleStartAssessment(
      apiRequest(
        `/api/rounds/${roundId}/assessments/session`,
        { expectedStateVersion: report.round.stateVersion },
        "voice-pulse-blocked"
      ),
      runtime,
      roundId
    );
    expect(blockedPulse.status).toBe(409);

    const retrySession = await success(
      await handleStartVoiceBiomarker(
        apiRequest(
          `/api/rounds/${roundId}/voice-biomarker/session`,
          { expectedStateVersion: report.round.stateVersion },
          "voice-start-retry"
        ),
        runtime,
        roundId
      ),
      VoiceBiomarkerSessionDataSchema
    );
    const retried = await success(
      await handleSubmitVoiceBiomarker(
        apiRequest(
          `/api/rounds/${roundId}/voice-biomarker`,
          {
            expectedStateVersion: report.round.stateVersion,
            result: {
              status: "retry",
              quality: {
                status: "retry",
                score: 0.35,
                reasons: ["excessive_noise"],
                metrics: {
                  sampleRateHz: 48_000,
                  durationMs: 8_000,
                  clippingFraction: 0.002,
                  voicedFraction: 0.41,
                  estimatedSnrDb: 6
                }
              }
            },
            attestation: retrySession.attestation
          },
          "voice-submit-retry"
        ),
        runtime,
        roundId
      ),
      SubmitVoiceBiomarkerDataSchema
    );
    expect(retried).toMatchObject({
      result: { status: "retry" },
      evidenceRoute: { voiceBiomarkerCompleted: false, voiceBiomarkerSkipped: false }
    });
    expect(await runtime.repository.listVoiceBiomarkerFacts(roundId)).toHaveLength(0);

    const completedSession = await success(
      await handleStartVoiceBiomarker(
        apiRequest(
          `/api/rounds/${roundId}/voice-biomarker/session`,
          { expectedStateVersion: report.round.stateVersion },
          "voice-start-complete"
        ),
        runtime,
        roundId
      ),
      VoiceBiomarkerSessionDataSchema
    );
    const completedBody = {
      expectedStateVersion: report.round.stateVersion,
      result: {
        status: "completed" as const,
        fact: {
          factId: "c6bc0048-b58b-4e4c-987b-ea7726bc71cd",
          roundId,
          assessmentSessionId: completedSession.assessmentSessionId,
          provider: "local_voice_features" as const,
          observedAt: NOW,
          durationMs: 8_000,
          algorithmVersion: "local-voice-features.v1",
          features: {
            medianFundamentalFrequencyHz: 182,
            pitchVariabilitySemitones: 1.4,
            jitterPercent: 1.1,
            shimmerPercent: 3.2,
            harmonicToNoiseRatioDb: 18.5,
            phonationDurationMs: 8_000
          },
          quality: {
            status: "pass" as const,
            score: 0.91,
            reasons: [],
            metrics: {
              sampleRateHz: 48_000,
              durationMs: 8_000,
              clippingFraction: 0.002,
              voicedFraction: 0.88,
              estimatedSnrDb: 24
            }
          },
          researchOnly: true as const,
          rawMediaRef: null
        }
      },
      attestation: completedSession.attestation
    };
    const completed = await success(
      await handleSubmitVoiceBiomarker(
        apiRequest(
          `/api/rounds/${roundId}/voice-biomarker`,
          completedBody,
          "voice-submit-complete"
        ),
        runtime,
        roundId
      ),
      SubmitVoiceBiomarkerDataSchema
    );
    expect(completed.evidenceRoute.voiceBiomarkerCompleted).toBe(true);

    const replay = await success(
      await handleSubmitVoiceBiomarker(
        apiRequest(`/api/rounds/${roundId}/voice-biomarker`, completedBody, "voice-submit-replay"),
        runtime,
        roundId
      ),
      SubmitVoiceBiomarkerDataSchema
    );
    expect(replay.result).toEqual(completed.result);
    expect(await runtime.repository.listVoiceBiomarkerFacts(roundId)).toHaveLength(1);

    const resumed = await success(
      await handleGetRound(
        new Request(`http://localhost:3000/api/rounds/${roundId}`),
        runtime,
        roundId
      ),
      RoundDataSchema
    );
    expect(resumed.voiceBiomarkerFact).toEqual(completedBody.result.fact);
    const pulseSession = await success(
      await handleStartAssessment(
        apiRequest(
          `/api/rounds/${roundId}/assessments/session`,
          { expectedStateVersion: report.round.stateVersion },
          "voice-pulse-resumed"
        ),
        runtime,
        roundId
      ),
      AssessmentSessionDataSchema
    );
    expect(pulseSession.round.state).toBe("capturing");

    const events = await runtime.repository.listAuditEvents(roundId);
    expect(events.filter(({ type }) => type === "voice_biomarker_quality_rejected")).toHaveLength(
      1
    );
    expect(events.filter(({ type }) => type === "voice_biomarker_accepted")).toHaveLength(1);
    const serialized = JSON.stringify(events);
    expect(serialized).not.toMatch(/rawAudio|audioBytes|transcript|data:audio/i);
    expect(serialized).toContain('"rawMediaStored":false');
  });

  it("allows an explicit decline without inventing a voice measurement", async () => {
    const runtime = voiceRuntime();
    const { roundId, report } = await createVoiceRound(runtime, "voice-skip");
    const skipped = await success(
      await handleSkipVoiceBiomarker(
        apiRequest(
          `/api/rounds/${roundId}/voice-biomarker/skip`,
          { expectedStateVersion: report.round.stateVersion, reason: "patient_declined" },
          "voice-skip-submit"
        ),
        runtime,
        roundId
      ),
      SkipVoiceBiomarkerDataSchema
    );
    expect(skipped.evidenceRoute).toMatchObject({
      voiceBiomarkerCompleted: false,
      voiceBiomarkerSkipped: true
    });
    expect(await runtime.repository.listVoiceBiomarkerFacts(roundId)).toHaveLength(0);
    const pulseSession = await success(
      await handleStartAssessment(
        apiRequest(
          `/api/rounds/${roundId}/assessments/session`,
          { expectedStateVersion: report.round.stateVersion },
          "voice-skip-pulse"
        ),
        runtime,
        roundId
      ),
      AssessmentSessionDataSchema
    );
    expect(pulseSession.round.state).toBe("capturing");
    const events = await runtime.repository.listAuditEvents(roundId);
    expect(events.filter(({ type }) => type === "voice_biomarker_skipped")).toHaveLength(1);
    expect(JSON.stringify(events)).not.toMatch(/rawAudio|audioBytes|transcript|data:audio/i);
  });
});
