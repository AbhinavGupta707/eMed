import {
  RoundDataSchema,
  SubmitVoiceBiomarkerDataSchema,
  VoiceBiomarkerSessionDataSchema
} from "../../../packages/api-client/src/index";
import {
  LocalVoiceBiomarkerProvider,
  type MicrophoneSession,
  type VoiceBiomarkerDependencies
} from "../../../packages/assessments/providers/voice-biomarker/index";
import { referenceVoiceSignal } from "../../../packages/assessments/providers/voice-biomarker/fixtures";
import { describe, expect, it, vi } from "vitest";

import {
  handleGetRound,
  handleStartVoiceBiomarker,
  handleSubmitVoiceBiomarker
} from "../../../apps/web/src/server/route-handlers";

import {
  createCollectingVoiceRound,
  createVoiceAgentRuntime,
  submitVoiceAgentReport,
  voiceAgentApiRequest,
  voiceAgentSuccess,
  voiceSelectingProvider
} from "./support";

const TRANSCRIPT_CANARY =
  "RAW_TRANSCRIPT_CANARY: provider wording must never become persisted workflow authority.";

describe("derived voice evidence persistence privacy", () => {
  it("carries an actual local analysis through the server while disposing PCM and persisting no transcript", async () => {
    const pcm = referenceVoiceSignal("clean_stable");
    const sourceDispose = vi.fn(async () => undefined);
    const sessionDispose = vi.fn(async () => sourceDispose());
    const dependencies: VoiceBiomarkerDependencies = {
      capabilities: {
        inspect: async () => ({
          secureContext: true,
          mediaDevices: true,
          webAudio: true,
          audioWorklet: true,
          scriptProcessorFallback: true
        })
      },
      permission: { query: async () => "granted" },
      microphone: {
        open: async (): Promise<MicrophoneSession> => ({
          sampleRateHz: pcm.sampleRateHz,
          source: {
            collect: async () => pcm,
            dispose: sourceDispose
          },
          dispose: sessionDispose
        })
      },
      lifecycle: { onInterrupted: () => () => undefined },
      now: () => new Date("2026-07-17T20:05:00.000Z"),
      randomUuid: () => "89200000-0000-4000-8000-000000000001"
    };
    const localProvider = new LocalVoiceBiomarkerProvider(dependencies);
    const runtime = createVoiceAgentRuntime({
      adaptiveSelectionProvider: voiceSelectingProvider(),
      adaptiveSelectionEnabled: true,
      voiceBiomarkerEnabled: true
    });
    const { roundId, round } = await createCollectingVoiceRound(runtime, "voice-derived-privacy");
    const report = await submitVoiceAgentReport({
      runtime,
      roundId,
      expectedStateVersion: round.stateVersion,
      reportId: "89200000-0000-4000-8000-000000000002",
      inputMode: "voice_confirmed",
      correlationId: "voice-derived-privacy-report",
      note: TRANSCRIPT_CANARY
    });
    expect(report.selectedModuleId).toBe("voice.local.baseline");

    const session = await voiceAgentSuccess(
      await handleStartVoiceBiomarker(
        voiceAgentApiRequest(
          `/api/rounds/${roundId}/voice-biomarker/session`,
          { expectedStateVersion: report.round.stateVersion },
          "voice-derived-privacy-start"
        ),
        runtime,
        roundId
      ),
      VoiceBiomarkerSessionDataSchema
    );
    const localResult = await localProvider.capture({
      roundId,
      assessmentSessionId: session.assessmentSessionId,
      signal: new AbortController().signal
    });
    expect(localResult.status).toBe("completed");
    if (localResult.status !== "completed") throw new Error("Expected a passing synthetic signal.");
    expect(pcm.samples.every((sample) => sample === 0)).toBe(true);
    expect(sessionDispose).toHaveBeenCalledOnce();
    expect(sourceDispose).toHaveBeenCalledOnce();

    const submitted = await voiceAgentSuccess(
      await handleSubmitVoiceBiomarker(
        voiceAgentApiRequest(
          `/api/rounds/${roundId}/voice-biomarker`,
          {
            expectedStateVersion: report.round.stateVersion,
            result: localResult,
            attestation: session.attestation
          },
          "voice-derived-privacy-submit"
        ),
        runtime,
        roundId
      ),
      SubmitVoiceBiomarkerDataSchema
    );
    expect(submitted).toMatchObject({
      result: {
        status: "completed",
        fact: {
          provider: "local_voice_features",
          researchOnly: true,
          rawMediaRef: null,
          quality: { status: "pass", reasons: [] }
        }
      },
      evidenceRoute: { voiceBiomarkerCompleted: true, voiceBiomarkerSkipped: false }
    });

    const facts = await runtime.repository.listVoiceBiomarkerFacts(roundId);
    const events = await runtime.repository.listAuditEvents(roundId);
    const resumed = await voiceAgentSuccess(
      await handleGetRound(
        new Request(`http://localhost:3000/api/rounds/${roundId}`),
        runtime,
        roundId
      ),
      RoundDataSchema
    );
    expect(facts).toHaveLength(1);
    expect(facts[0]?.fact).toEqual(localResult.fact);
    expect(resumed.voiceBiomarkerFact).toEqual(localResult.fact);
    expect(events.find(({ type }) => type === "patient_report_confirmed")?.payload).toMatchObject({
      freeTextStored: false
    });
    expect(
      events.find(({ type }) => type === "adaptive_evidence_route_selected")?.payload
    ).toMatchObject({
      deterministicAuthorityRetained: true,
      promptStored: false,
      providerPayloadStored: false
    });
    expect(events.find(({ type }) => type === "voice_biomarker_accepted")?.payload).toMatchObject({
      provider: "local_voice_features",
      researchOnly: true,
      rawMediaStored: false
    });

    const persistedProjection = JSON.stringify({ facts, events, resumed });
    expect(persistedProjection).not.toContain(TRANSCRIPT_CANARY);
    expect(persistedProjection).not.toMatch(
      /"(?:rawAudio|audioBytes|audioData|transcript|pcm|samples|providerPayload|hiddenReasoning)"\s*:/i
    );
    expect(persistedProjection).not.toMatch(/data:audio|blob:|RIFF|WAVE/i);
  });
});
