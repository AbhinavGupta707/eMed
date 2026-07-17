import {
  MeasurementFactSchema,
  OpticalAssessmentResultSchema,
  type CaptureQuality,
  type OpticalAssessmentProvider,
  type OpticalAssessmentResult,
  type OpticalUnavailableReason
} from "@homerounds/contracts/assessment";
import { z } from "zod";

import {
  DefaultBrowserCapabilityProbe,
  DefaultCameraPermissionProbe,
  DefaultPageLifecycle,
  DefaultRearCameraController
} from "./browser";
import {
  analyzeDerivedSamples,
  DEFAULT_SIGNAL_THRESHOLDS,
  FINGER_PPG_ALGORITHM_VERSION,
  type SignalAnalysis,
  type SignalQualityThresholds
} from "./signal";
import { CameraOpenError, type CameraSession, type FingerPpgDependencies } from "./types";

const SignalQualityThresholdsSchema = z
  .object({
    minimumDurationMs: z.number().nonnegative(),
    minimumCadenceHz: z.number().positive(),
    maximumCadenceHz: z.number().positive(),
    maximumJitterRatio: z.number().nonnegative(),
    maximumDroppedFrameRatio: z.number().min(0).max(1),
    minimumCoverage: z.number().min(0).max(1),
    maximumSaturation: z.number().min(0).max(1),
    maximumMotion: z.number().min(0).max(1),
    minimumSignalStrength: z.number().nonnegative(),
    minimumBpm: z.number().positive(),
    maximumBpm: z.number().positive(),
    maximumEstimatorDifferenceBpm: z.number().nonnegative()
  })
  .superRefine((value, context) => {
    if (value.minimumCadenceHz >= value.maximumCadenceHz) {
      context.addIssue({
        code: "custom",
        message: "Minimum cadence must be below maximum cadence"
      });
    }
    if (value.minimumBpm >= value.maximumBpm) {
      context.addIssue({ code: "custom", message: "Minimum BPM must be below maximum BPM" });
    }
  });

const ProviderConfigSchema = z.object({
  captureDurationMs: z.number().int().positive().default(20_000),
  thresholds: SignalQualityThresholdsSchema.default(DEFAULT_SIGNAL_THRESHOLDS)
});

export interface FingerPpgProviderConfig {
  readonly captureDurationMs?: number;
  readonly thresholds?: SignalQualityThresholds;
}

export interface FingerPpgSignalProcessor {
  analyze(
    samples: Parameters<typeof analyzeDerivedSamples>[0],
    thresholds: SignalQualityThresholds
  ): SignalAnalysis;
}

export interface FingerPpgNormalizationInput {
  readonly assessmentSessionId: string;
  readonly analysis: SignalAnalysis;
  readonly observedAt: Date;
  readonly factId: string;
  readonly torchAvailable: boolean;
}

export interface FingerPpgMeasurementNormalizer {
  complete(input: FingerPpgNormalizationInput): OpticalAssessmentResult;
}

export interface FingerPpgProcessing {
  readonly signal: FingerPpgSignalProcessor;
  readonly normalizer: FingerPpgMeasurementNormalizer;
}

function failedQuality(
  reason: CaptureQuality["reasons"][number],
  metrics: Record<string, number> = {}
): CaptureQuality & { status: "fail" } {
  return { status: "fail", score: 0, reasons: [reason], metrics };
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function unavailableReason(reason: CameraOpenError["reason"]): OpticalUnavailableReason {
  switch (reason) {
    case "permission_denied":
      return "permission_denied";
    case "unsupported_device":
      return "unsupported_device";
    case "provider_unavailable":
      return "provider_unavailable";
  }
}

function normalizeCompleted(input: FingerPpgNormalizationInput): OpticalAssessmentResult {
  if (input.analysis.quality.status !== "pass" || input.analysis.bpm === null) {
    throw new Error("Only passing signal analysis can be normalized as a measurement");
  }
  const measurement = MeasurementFactSchema.parse({
    factId: input.factId,
    assessmentSessionId: input.assessmentSessionId,
    provider: "finger_ppg",
    value: Math.round(input.analysis.bpm * 10) / 10,
    unit: "bpm",
    observedAt: input.observedAt.toISOString(),
    durationMs: input.analysis.durationMs,
    algorithmVersion: FINGER_PPG_ALGORITHM_VERSION,
    providerModelVersion: null,
    quality: {
      ...input.analysis.quality,
      metrics: {
        ...input.analysis.quality.metrics,
        torchAvailable: input.torchAvailable ? 1 : 0
      }
    },
    rawMediaRef: null
  });
  return OpticalAssessmentResultSchema.parse({ status: "completed", measurement });
}

const DEFAULT_PROCESSING: FingerPpgProcessing = {
  signal: { analyze: analyzeDerivedSamples },
  normalizer: { complete: normalizeCompleted }
};

export class FingerPpgProvider implements OpticalAssessmentProvider {
  public readonly kind = "finger_ppg" as const;
  private readonly config: Required<FingerPpgProviderConfig>;
  private disposed = false;
  private activeAbort: AbortController | null = null;
  private activeCleanup: Promise<void> | null = null;
  private resolveActiveCleanup: (() => void) | null = null;
  private disposal: Promise<void> | null = null;
  private readonly retryOffered = new Set<string>();

  public constructor(
    private readonly dependencies: FingerPpgDependencies,
    config: FingerPpgProviderConfig = {},
    private readonly processing: FingerPpgProcessing = DEFAULT_PROCESSING
  ) {
    this.config = ProviderConfigSchema.parse(config);
  }

  public async checkAvailability(
    signal?: AbortSignal
  ): Promise<
    | { available: true; capabilities: Readonly<Record<string, boolean>> }
    | { available: false; reason: OpticalUnavailableReason }
  > {
    if (this.disposed) return { available: false, reason: "provider_unavailable" };
    try {
      const capability = await this.dependencies.capabilities.inspect(signal);
      if (!capability.secureContext || !capability.mediaDevices || !capability.rearCamera) {
        return { available: false, reason: "unsupported_device" };
      }
      const permission = await this.dependencies.permission.query(signal);
      if (permission === "denied") return { available: false, reason: "permission_denied" };
      return {
        available: true,
        capabilities: {
          secureContext: capability.secureContext,
          camera: capability.mediaDevices,
          rearCamera: capability.rearCamera,
          permissionGranted: permission === "granted"
        }
      };
    } catch (error) {
      if (isAbort(error)) return { available: false, reason: "provider_unavailable" };
      return { available: false, reason: "provider_unavailable" };
    }
  }

  public async capture(input: {
    assessmentSessionId: string;
    signal: AbortSignal;
  }): Promise<OpticalAssessmentResult> {
    if (this.disposed)
      return { status: "unavailable", provider: this.kind, reason: "provider_unavailable" };
    if (!z.string().uuid().safeParse(input.assessmentSessionId).success) {
      return {
        status: "failed",
        quality: failedQuality("provider_quality_failed", { invalidSessionId: 1 })
      };
    }
    if (this.activeAbort !== null) {
      return {
        status: "failed",
        quality: failedQuality("provider_quality_failed", { captureAlreadyActive: 1 })
      };
    }

    const controller = new AbortController();
    this.activeAbort = controller;
    this.activeCleanup = new Promise((resolve) => {
      this.resolveActiveCleanup = resolve;
    });
    const abort = (): void => controller.abort();
    input.signal.addEventListener("abort", abort, { once: true });
    const unsubscribeLifecycle = this.dependencies.lifecycle.onInterrupted(abort);
    let cameraSession: CameraSession | null = null;

    try {
      if (input.signal.aborted) controller.abort();
      const availability = await this.checkAvailability(controller.signal);
      if (controller.signal.aborted) throw new DOMException("Capture cancelled", "AbortError");
      if (!availability.available) {
        this.retryOffered.delete(input.assessmentSessionId);
        return { status: "unavailable", provider: this.kind, reason: availability.reason };
      }

      cameraSession = await this.dependencies.camera.open(controller.signal);
      if (cameraSession.torch.available) {
        try {
          await cameraSession.torch.setEnabled(true);
        } catch {
          // Torch is an optional enhancement. Capture remains quality-gated without it.
        }
      }
      const samples = await cameraSession.source.collect({
        durationMs: this.config.captureDurationMs,
        signal: controller.signal
      });
      const analysis = this.processing.signal.analyze(samples, this.config.thresholds);
      if (analysis.quality.status === "pass") {
        this.retryOffered.delete(input.assessmentSessionId);
        return OpticalAssessmentResultSchema.parse(
          this.processing.normalizer.complete({
            assessmentSessionId: input.assessmentSessionId,
            analysis,
            observedAt: this.dependencies.now(),
            factId: this.dependencies.randomUuid(),
            torchAvailable: cameraSession.torch.available
          })
        );
      }
      if (analysis.quality.status === "fail") {
        this.retryOffered.delete(input.assessmentSessionId);
        return OpticalAssessmentResultSchema.parse({ status: "failed", quality: analysis.quality });
      }
      if (!this.retryOffered.has(input.assessmentSessionId)) {
        this.retryOffered.add(input.assessmentSessionId);
        return OpticalAssessmentResultSchema.parse({ status: "retry", quality: analysis.quality });
      }
      this.retryOffered.delete(input.assessmentSessionId);
      return OpticalAssessmentResultSchema.parse({
        status: "failed",
        quality: { ...analysis.quality, status: "fail" }
      });
    } catch (error) {
      this.retryOffered.delete(input.assessmentSessionId);
      if (isAbort(error) || controller.signal.aborted) {
        return { status: "failed", quality: failedQuality("cancelled") };
      }
      if (error instanceof CameraOpenError) {
        return {
          status: "unavailable",
          provider: this.kind,
          reason: unavailableReason(error.reason)
        };
      }
      return { status: "failed", quality: failedQuality("provider_quality_failed") };
    } finally {
      input.signal.removeEventListener("abort", abort);
      unsubscribeLifecycle();
      try {
        await cameraSession?.dispose();
      } catch {
        // Cleanup is best-effort at this point; capture has already produced a typed outcome.
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

export function createFingerPpgProvider(config: FingerPpgProviderConfig = {}): FingerPpgProvider {
  return new FingerPpgProvider(
    {
      capabilities: new DefaultBrowserCapabilityProbe(),
      permission: new DefaultCameraPermissionProbe(),
      camera: new DefaultRearCameraController(),
      lifecycle: new DefaultPageLifecycle(),
      now: () => new Date(),
      randomUuid: () => crypto.randomUUID()
    },
    config
  );
}
