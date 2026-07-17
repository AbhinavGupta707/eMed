import {
  ApiSuccessEnvelopeSchema,
  RoundDataSchema,
  SkipVoiceBiomarkerDataSchema,
  SubmitReportDataSchema,
  SubmitVoiceBiomarkerDataSchema,
  SubmitVoiceBiomarkerRequestSchema,
  VoiceBiomarkerSessionDataSchema
} from "@homerounds/api-client";
import { expect, type Page } from "@playwright/test";
import type { z } from "zod";

type RoundData = z.infer<typeof RoundDataSchema>;
type SubmitReportData = z.infer<typeof SubmitReportDataSchema>;
type EvidenceRoute = SubmitReportData["evidenceRoute"];

export const VOICE_FIXTURE_ORIGIN = "http://127.0.0.1:3141";
export const VOICE_FALLBACK_ORIGIN = "http://127.0.0.1:3142";

export type SyntheticScenario = "maya-happy-text" | "maya-poor-quality" | "maya-red-flag";

export type BrowserFailures = Readonly<{
  consoleErrors: string[];
  pageErrors: string[];
}>;

export type StructuredAnswers = Readonly<{
  chestPain: "Yes" | "No" | "I’m not sure";
  severeBreathlessness: "Yes" | "No" | "I’m not sure";
  fainted: "Yes" | "No" | "I’m not sure";
  weakness: "None" | "Mild" | "Moderate" | "Severe" | "I’m not sure";
  palpitations: "None" | "Comes and goes" | "Happening now" | "I’m not sure";
}>;

export const calmAnswers: StructuredAnswers = {
  chestPain: "No",
  severeBreathlessness: "No",
  fainted: "No",
  weakness: "Mild",
  palpitations: "None"
};

const SESSION_ID = "03ae3d42-4cb1-4f25-9ec1-4105938f70d1";
const FIXTURE_ATTESTATION = "voice-agent-browser-fixture-attestation-000000000000000000000000";
const FIXTURE_META = {
  correlationId: "voice-agent-browser-fixture",
  runtimeProfile: "server_provider_boundary" as const
};

export function scenarioUrl(origin: string, scenario: SyntheticScenario): string {
  return `${origin}/round?scenario=${scenario}`;
}

export function monitorBrowserFailures(page: Page): BrowserFailures {
  const failures = { consoleErrors: [] as string[], pageErrors: [] as string[] };
  page.on("console", (message) => {
    if (message.type() === "error") failures.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => failures.pageErrors.push(String(error)));
  return failures;
}

export function expectNoBrowserFailures(failures: BrowserFailures): void {
  expect(failures.consoleErrors).toEqual([]);
  expect(failures.pageErrors).toEqual([]);
}

export async function startRound(page: Page, url: string): Promise<RoundData> {
  const response = await page.goto(url);
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { level: 1, name: "Your two-minute check is ready" })
  ).toBeVisible();
  await page
    .getByLabel(
      "I understand this is a synthetic demonstration, not clinically validated software, and not a medical service."
    )
    .check();
  const transition = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === "POST" &&
      /\/api\/rounds\/[^/]+\/transition$/.test(new URL(candidate.url()).pathname)
  );
  await page.getByRole("button", { name: "Start the check" }).click();
  const transitionResponse = await transition;
  expect(transitionResponse.status()).toBe(200);
  const envelope = ApiSuccessEnvelopeSchema(RoundDataSchema).parse(await transitionResponse.json());
  await expect(
    page.getByRole("heading", { level: 1, name: "Tell us what is happening now" })
  ).toBeVisible();
  return envelope.data;
}

async function choose(page: Page, legend: string, answer: string): Promise<void> {
  await page.getByRole("group", { name: legend }).getByLabel(answer, { exact: true }).check();
}

export async function completeStructuredAnswers(
  page: Page,
  answers: StructuredAnswers
): Promise<void> {
  await choose(page, "Are you having chest pain now?", answers.chestPain);
  await choose(page, "Are you severely short of breath now?", answers.severeBreathlessness);
  await choose(page, "Have you fainted?", answers.fainted);
  await choose(page, "How weak do you feel?", answers.weakness);
  await choose(
    page,
    "Are you noticing a racing, pounding, or fluttering feeling?",
    answers.palpitations
  );
}

export async function confirmTypedNarrative(page: Page, narrative: string): Promise<void> {
  await page.getByRole("textbox", { name: "Your check-in text" }).fill(narrative);
  await page.getByRole("button", { name: "Confirm this text" }).click();
  await expect(page.getByRole("button", { name: "Text confirmed" })).toBeDisabled();
}

export async function confirmSyntheticVoiceNarrative(
  page: Page,
  editedNarrative: string
): Promise<number> {
  const startedAt = performance.now();
  await page.getByRole("button", { name: "Start voice" }).click();
  const editor = page.getByRole("textbox", { name: "Your check-in text" });
  await expect(editor).toHaveValue("I have felt a little weak this morning.");
  const connectedMs = performance.now() - startedAt;
  await expect(page.getByText("Ready for your confirmation", { exact: true })).toBeVisible();
  await editor.fill(editedNarrative);
  await page.getByRole("button", { name: "Confirm this text" }).click();
  await expect(page.getByRole("button", { name: "Text confirmed" })).toBeDisabled();
  return connectedMs;
}

export async function submitConfirmedReport(page: Page): Promise<SubmitReportData> {
  const report = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === "POST" &&
      /\/api\/rounds\/[^/]+\/report$/.test(new URL(candidate.url()).pathname)
  );
  await page.getByRole("button", { name: "Confirm and continue" }).click();
  const response = await report;
  expect(response.status()).toBe(200);
  return ApiSuccessEnvelopeSchema(SubmitReportDataSchema).parse(await response.json()).data;
}

export async function submitTypedReport(
  page: Page,
  answers: StructuredAnswers,
  narrative: string
): Promise<SubmitReportData> {
  await completeStructuredAnswers(page, answers);
  await confirmTypedNarrative(page, narrative);
  return submitConfirmedReport(page);
}

export async function expectNoPersistedDraft(
  page: Page,
  origin: string,
  roundId: string,
  forbiddenText: string
): Promise<void> {
  const response = await page.request.get(`${origin}/api/rounds/${roundId}`);
  expect(response.status()).toBe(200);
  const envelope = ApiSuccessEnvelopeSchema(RoundDataSchema).parse(await response.json());
  const persisted = JSON.stringify(envelope.data);
  expect(persisted).not.toContain(forbiddenText);
  expect(persisted).not.toMatch(/data:image|raw(?:_|-)?(?:image|audio|frame)|transcript/i);
}

function selectVoiceRoute(report: SubmitReportData): SubmitReportData {
  const voiceCandidate = report.evidenceRoute.candidates.find(
    (candidate) =>
      candidate.id === "voice.local.baseline" && candidate.availability.status === "available"
  );
  if (!voiceCandidate) throw new Error("The server did not expose the enabled voice candidate.");
  const selection = report.evidenceRoute.selection;
  if (selection?.status !== "accepted" || selection.envelope.decision.decision !== "select") {
    throw new Error("The keyless fake selection did not return a patchable accepted decision.");
  }
  return SubmitReportDataSchema.parse({
    ...report,
    selectedModuleId: voiceCandidate.id,
    evidenceRoute: {
      ...report.evidenceRoute,
      selectedModuleId: voiceCandidate.id,
      selection: {
        ...selection,
        envelope: {
          ...selection.envelope,
          decision: {
            ...selection.envelope.decision,
            candidateModuleId: voiceCandidate.id,
            rationale:
              "A schema-valid browser fixture selected the optional local research station."
          }
        }
      }
    }
  });
}

/**
 * Selects the already registered voice candidate at the browser network boundary.
 * Every synthetic envelope is parsed through the frozen API schema before delivery.
 */
export async function installVoiceStationRouteFixture(page: Page): Promise<void> {
  let fixtureRound: SubmitReportData["round"] | null = null;
  let fixtureRoute: EvidenceRoute | null = null;

  await page.route(/\/api\/rounds\/[^/]+\/report$/, async (route) => {
    const upstream = await route.fetch();
    const envelope = ApiSuccessEnvelopeSchema(SubmitReportDataSchema).parse(await upstream.json());
    const selected = selectVoiceRoute(envelope.data);
    fixtureRound = selected.round;
    fixtureRoute = selected.evidenceRoute;
    await route.fulfill({
      response: upstream,
      json: ApiSuccessEnvelopeSchema(SubmitReportDataSchema).parse({
        ...envelope,
        data: selected
      })
    });
  });

  await page.route(/\/api\/rounds\/[^/]+\/voice-biomarker\/session$/, async (route) => {
    if (!fixtureRound) throw new Error("Voice session requested before report selection.");
    const data = VoiceBiomarkerSessionDataSchema.parse({
      round: fixtureRound,
      assessmentSessionId: SESSION_ID,
      provider: "local_voice_features",
      attestation: FIXTURE_ATTESTATION,
      expiresAt: "2099-01-01T00:00:00.000Z"
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      json: ApiSuccessEnvelopeSchema(VoiceBiomarkerSessionDataSchema).parse({
        data,
        meta: FIXTURE_META
      })
    });
  });

  await page.route(/\/api\/rounds\/[^/]+\/voice-biomarker\/skip$/, async (route) => {
    if (!fixtureRound || !fixtureRoute) throw new Error("Voice skip requested before selection.");
    fixtureRoute = { ...fixtureRoute, voiceBiomarkerSkipped: true };
    const data = SkipVoiceBiomarkerDataSchema.parse({
      round: fixtureRound,
      evidenceRoute: fixtureRoute
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      json: ApiSuccessEnvelopeSchema(SkipVoiceBiomarkerDataSchema).parse({
        data,
        meta: FIXTURE_META
      })
    });
  });

  await page.route(/\/api\/rounds\/[^/]+\/voice-biomarker$/, async (route) => {
    if (!fixtureRound || !fixtureRoute) throw new Error("Voice result requested before selection.");
    const request = SubmitVoiceBiomarkerRequestSchema.parse(route.request().postDataJSON());
    fixtureRoute = { ...fixtureRoute, voiceBiomarkerCompleted: true };
    const data = SubmitVoiceBiomarkerDataSchema.parse({
      round: fixtureRound,
      result: request.result,
      evidenceRoute: fixtureRoute
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      json: ApiSuccessEnvelopeSchema(SubmitVoiceBiomarkerDataSchema).parse({
        data,
        meta: FIXTURE_META
      })
    });
  });

  await page.route(/\/api\/rounds\/[^/]+$/, async (route) => {
    const upstream = await route.fetch();
    if (!fixtureRoute) {
      await route.fulfill({ response: upstream });
      return;
    }
    const envelope = ApiSuccessEnvelopeSchema(RoundDataSchema).parse(await upstream.json());
    await route.fulfill({
      response: upstream,
      json: ApiSuccessEnvelopeSchema(RoundDataSchema).parse({
        ...envelope,
        data: { ...envelope.data, evidenceRoute: fixtureRoute }
      })
    });
  });
}

export async function installSyntheticMicrophone(
  page: Page,
  mode: "denied" | "silence" | "tone"
): Promise<void> {
  await page.addInitScript((fixtureMode) => {
    const permission = {
      state: fixtureMode === "denied" ? "prompt" : "granted",
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      onchange: null
    };
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: { query: () => Promise.resolve(permission) }
    });

    if (fixtureMode === "denied") {
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {
          getUserMedia: () =>
            Promise.reject(new DOMException("Synthetic permission denial", "NotAllowedError"))
        }
      });
      return;
    }

    const fakeTrack = { stop: () => undefined };
    const fakeStream = {
      getTracks: () => [fakeTrack],
      getAudioTracks: () => [fakeTrack]
    };
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: () => Promise.resolve(fakeStream) }
    });

    class SyntheticAudioContext {
      readonly sampleRate = 48_000;
      readonly destination = {};

      resume(): Promise<void> {
        return Promise.resolve();
      }

      close(): Promise<void> {
        return Promise.resolve();
      }

      createMediaStreamSource() {
        return { connect: () => undefined, disconnect: () => undefined };
      }

      createGain() {
        return { gain: { value: 1 }, connect: () => undefined, disconnect: () => undefined };
      }

      createScriptProcessor() {
        let interval: ReturnType<typeof setInterval> | null = null;
        let sampleOffset = 0;
        const processor = {
          onaudioprocess: null as ((event: unknown) => void) | null,
          connect: () => {
            interval = setInterval(() => {
              const samples = new Float32Array(2_048);
              if (fixtureMode === "tone") {
                for (let index = 0; index < samples.length; index += 1) {
                  samples[index] =
                    0.2 * Math.sin((2 * Math.PI * 220 * (sampleOffset + index)) / 48_000);
                }
              }
              sampleOffset += samples.length;
              processor.onaudioprocess?.({
                inputBuffer: { getChannelData: () => samples }
              });
            }, 43);
          },
          disconnect: () => {
            if (interval !== null) clearInterval(interval);
            interval = null;
          }
        };
        return processor;
      }
    }

    Object.defineProperty(globalThis, "AudioContext", {
      configurable: true,
      value: SyntheticAudioContext
    });
    Object.defineProperty(globalThis, "webkitAudioContext", {
      configurable: true,
      value: SyntheticAudioContext
    });
  }, mode);
}
