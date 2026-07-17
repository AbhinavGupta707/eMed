import {
  VoiceBiomarkerAssessmentResultSchema,
  VoiceBiomarkerFactSchema,
  VoiceBiomarkerQualitySchema,
  type VoiceBiomarkerAssessmentResult,
  type VoiceBiomarkerProvider,
  type VoiceBiomarkerQuality,
  type VoiceBiomarkerUnavailableReason
} from "@homerounds/contracts";
import { z } from "zod";

import {
  DefaultMicrophoneController,
  DefaultMicrophonePermissionProbe,
  DefaultVoiceBrowserCapabilityProbe,
  DefaultVoicePageLifecycle
} from "./browser";
import {
  analyzeVoicePcm,
  DEFAULT_VOICE_SIGNAL_THRESHOLDS,
  VOICE_BIOMARKER_ALGORITHM_VERSION,
  VoiceSignalQualityThresholdsSchema,
  type VoiceSignalAnalysis,
  type VoiceSignalQualityThresholds
} from "./signal";
import {
  CapturedPcmSchema,
  MicrophoneOpenError,
  type CapturedPcm,
  type MicrophoneSession,
  type VoiceBiomarkerDependencies
} from "./types";

const FALLBACK_SAMPLE_RATE_HZ = 48_000;

const ProviderConfigSchema = z
  .object({
    captureDurationMs: z.number().int().min(6_000).max(8_000).default(7_000),
    thresholds: VoiceSignalQualityThresholdsSchema.default(DEFAULT_VOICE_SIGNAL_THRESHOLDS)
  })
  .strict();

const CaptureInputSchema = z
  .object({
    roundId: z.uuid(),
    assessmentSessionId: z.uuid(),
    signal: z.custom<AbortSignal>(
      (value) =>
        typeof value === "object" &&
        value !== null &&
        "aborted" in value &&
        "addEventListener" in value &&
        "removeEventListener" in value
    )
  })
  .strict();

export interface LocalVoiceBiomarkerProviderConfig {
  readonly captureDurationMs?: number;
  readonly thresholds?: VoiceSignalQualityThresholds;
}

export interface VoiceBiomarkerSignalProcessor {
  analyze(capture: CapturedPcm, thresholds: VoiceSignalQualityThresholds): VoiceSignalAnalysis;
}

export interface VoiceBiomarkerNormalizationInput {
  readonly roundId: string;
  readonly assessmentSessionId: string;
  readonly analysis: VoiceSignalAnalysis;
  readonly observedAt: Date;
  readonly factId: string;
}

export interface VoiceBiomarkerResultNormalizer {
  complete(input: VoiceBiomarkerNormalizationInput): VoiceBiomarkerAssessmentResult;
}

export interface VoiceBiomarkerProcessing {
  readonly signal: VoiceBiomarkerSignalProcessor;
  readonly normalizer: VoiceBiomarkerResultNormalizer;
}

function terminalQuality(
  reason: VoiceBiomarkerQuality["reasons"][number],
  sampleRateHz = FALLBACK_SAMPLE_RATE_HZ,
  durationMs = 0
): VoiceBiomarkerQuality & { status: "fail" } {
  return VoiceBiomarkerQualitySchema.extend({ status: z.literal("fail") }).parse({
    status: "fail",
    score: 0,
    reasons: [reason],
    metrics: {
      sampleRateHz,
      durationMs,
      clippingFraction: 0,
      voicedFraction: 0,
      estimatedSnrDb: null
    }
  });
}

function unavailable(reason: VoiceBiomarkerUnavailableReason): VoiceBiomarkerAssessmentResult {
  return VoiceBiomarkerAssessmentResultSchema.parse({
    status: "unavailable",
    provider: "local_voice_features",
    reason
  });
}

function failed(
  reason: VoiceBiomarkerQuality["reasons"][number],
  sampleRateHz = FALLBACK_SAMPLE_RATE_HZ,
  durationMs = 0
): VoiceBiomarkerAssessmentResult {
  return VoiceBiomarkerAssessmentResultSchema.parse({
    status: "failed",
    quality: terminalQuality(reason, sampleRateHz, durationMs)
  });
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function normalizeCompleted(
  input: VoiceBiomarkerNormalizationInput
): VoiceBiomarkerAssessmentResult {
  if (input.analysis.quality.status !== "pass" || input.analysis.features === null) {
    throw new Error("Only passing voice analysis can be normalized as a fact");
  }
  const fact = VoiceBiomarkerFactSchema.parse({
    factId: input.factId,
    roundId: input.roundId,
    assessmentSessionId: input.assessmentSessionId,
    provider: "local_voice_features",
    observedAt: input.observedAt.toISOString(),
    durationMs: input.analysis.quality.metrics.durationMs,
    algorithmVersion: VOICE_BIOMARKER_ALGORITHM_VERSION,
    features: input.analysis.features,
    quality: input.analysis.quality,
    researchOnly: true,
    rawMediaRef: null
  });
  return VoiceBiomarkerAssessmentResultSchema.parse({ status: "completed", fact });
}

const DEFAULT_PROCESSING: VoiceBiomarkerProcessing = {
  signal: { analyze: analyzeVoicePcm },
  normalizer: { complete: normalizeCompleted }
};

export class LocalVoiceBiomarkerProvider implements VoiceBiomarkerProvider {
  public readonly kind = "local_voice_features" as const;
  private readonly config: z.infer<typeof ProviderConfigSchema>;
  private disposed = false;
  private activeAbort: AbortController | null = null;
  private activeCleanup: Promise<void> | null = null;
  private resolveActiveCleanup: (() => void) | null = null;
  private disposal: Promise<void> | null = null;
  private readonly retryOffered = new Set<string>();

  public constructor(
    private readonly dependencies: VoiceBiomarkerDependencies,
    config: LocalVoiceBiomarkerProviderConfig = {},
    private readonly processing: VoiceBiomarkerProcessing = DEFAULT_PROCESSING
  ) {
    this.config = ProviderConfigSchema.parse(config);
  }

  public async checkAvailability(
    signal?: AbortSignal
  ): Promise<
    | { available: true; capabilities: Readonly<Record<string, boolean>> }
    | { available: false; reason: VoiceBiomarkerUnavailableReason }
  > {
    if (this.disposed) return { available: false, reason: "microphone_unavailable" };
    try {
      const capability = await this.dependencies.capabilities.inspect(signal);
      if (!capability.secureContext || !capability.mediaDevices || !capability.webAudio) {
        return { available: false, reason: "unsupported_device" };
      }
      const permission = await this.dependencies.permission.query(signal);
      if (permission === "denied") return { available: false, reason: "permission_denied" };
      return {
        available: true,
        capabilities: {
          secureContext: capability.secureContext,
          microphone: capability.mediaDevices,
          webAudio: capability.webAudio,
          audioWorklet: capability.audioWorklet,
          scriptProcessorFallback: capability.scriptProcessorFallback,
          permissionGranted: permission === "granted"
        }
      };
    } catch {
      return { available: false, reason: "microphone_unavailable" };
    }
  }

  public async capture(input: {
    roundId: string;
    assessmentSessionId: string;
    signal: AbortSignal;
  }): Promise<VoiceBiomarkerAssessmentResult> {
    const request = CaptureInputSchema.safeParse(input);
    if (!request.success) return unavailable("microphone_unavailable");
    if (this.disposed) return unavailable("microphone_unavailable");
    if (request.data.signal.aborted) return failed("cancelled");
    if (this.activeAbort !== null) return unavailable("microphone_unavailable");

    const controller = new AbortController();
    this.activeAbort = controller;
    this.activeCleanup = new Promise((resolve) => {
      this.resolveActiveCleanup = resolve;
    });
    const abort = (): void => controller.abort();
    request.data.signal.addEventListener("abort", abort, { once: true });
    const unsubscribeLifecycle = this.dependencies.lifecycle.onInterrupted(abort);
    let session: MicrophoneSession | null = null;
    let ownedPcm: Float32Array | null = null;
    let sampleRateHz = FALLBACK_SAMPLE_RATE_HZ;
    let durationMs = 0;

    try {
      const availability = await this.checkAvailability(controller.signal);
      if (controller.signal.aborted)
        throw new DOMException("Voice capture cancelled", "AbortError");
      if (!availability.available) {
        this.retryOffered.delete(request.data.assessmentSessionId);
        return unavailable(availability.reason);
      }

      session = await this.dependencies.microphone.open(controller.signal);
      sampleRateHz = session.sampleRateHz;
      const rawCapture = await session.source.collect({
        durationMs: this.config.captureDurationMs,
        signal: controller.signal
      });
      if (rawCapture.samples instanceof Float32Array) ownedPcm = rawCapture.samples;
      if (controller.signal.aborted)
        throw new DOMException("Voice capture cancelled", "AbortError");
      const capture = CapturedPcmSchema.parse(rawCapture);
      durationMs = Math.round((capture.samples.length * 1000) / capture.sampleRateHz);
      const analysis = this.processing.signal.analyze(capture, this.config.thresholds);

      switch (analysis.quality.status) {
        case "pass": {
          this.retryOffered.delete(request.data.assessmentSessionId);
          return VoiceBiomarkerAssessmentResultSchema.parse(
            this.processing.normalizer.complete({
              roundId: request.data.roundId,
              assessmentSessionId: request.data.assessmentSessionId,
              analysis,
              observedAt: this.dependencies.now(),
              factId: this.dependencies.randomUuid()
            })
          );
        }
        case "fail": {
          this.retryOffered.delete(request.data.assessmentSessionId);
          return VoiceBiomarkerAssessmentResultSchema.parse({
            status: "failed",
            quality: analysis.quality
          });
        }
        case "retry": {
          if (!this.retryOffered.has(request.data.assessmentSessionId)) {
            this.retryOffered.add(request.data.assessmentSessionId);
            return VoiceBiomarkerAssessmentResultSchema.parse({
              status: "retry",
              quality: analysis.quality
            });
          }
          this.retryOffered.delete(request.data.assessmentSessionId);
          return VoiceBiomarkerAssessmentResultSchema.parse({
            status: "failed",
            quality: VoiceBiomarkerQualitySchema.parse({
              ...analysis.quality,
              status: "fail",
              score: Math.min(0.49, analysis.quality.score)
            })
          });
        }
      }
      return unavailable("microphone_unavailable");
    } catch (error) {
      this.retryOffered.delete(request.data.assessmentSessionId);
      if (isAbort(error) || controller.signal.aborted) {
        return failed("cancelled", sampleRateHz, durationMs);
      }
      if (error instanceof MicrophoneOpenError) return unavailable(error.reason);
      return unavailable("microphone_unavailable");
    } finally {
      ownedPcm?.fill(0);
      request.data.signal.removeEventListener("abort", abort);
      unsubscribeLifecycle();
      try {
        await session?.dispose();
      } catch {
        // PCM is already zeroed; media teardown is best-effort after a typed result exists.
      }
      this.activeAbort = null;
      this.resolveActiveCleanup?.();
      this.resolveActiveCleanup = null;
      this.activeCleanup = null;
    }
  }

  public async dispose(): Promise<void> {
    if (this.disposal !== null) return this.disposal;
    this.disposed = true;
    this.activeAbort?.abort();
    this.disposal = (async () => {
      await this.activeCleanup;
      this.retryOffered.clear();
    })();
    return this.disposal;
  }
}

export function createLocalVoiceBiomarkerProvider(
  config: LocalVoiceBiomarkerProviderConfig = {}
): LocalVoiceBiomarkerProvider {
  return new LocalVoiceBiomarkerProvider(
    {
      capabilities: new DefaultVoiceBrowserCapabilityProbe(),
      permission: new DefaultMicrophonePermissionProbe(),
      microphone: new DefaultMicrophoneController(),
      lifecycle: new DefaultVoicePageLifecycle(),
      now: () => new Date(),
      randomUuid: () => crypto.randomUUID()
    },
    config
  );
}
