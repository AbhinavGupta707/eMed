import type { VoiceBiomarkerUnavailableReason } from "@homerounds/contracts";
import { z } from "zod";

export const CapturedPcmSchema = z
  .object({
    sampleRateHz: z.number().int().min(8_000).max(192_000),
    samples: z.instanceof(Float32Array)
  })
  .strict()
  .superRefine((capture, context) => {
    if (capture.samples.length === 0 || capture.samples.length > 1_600_000) {
      context.addIssue({
        code: "custom",
        path: ["samples"],
        message: "PCM sample count is outside the bounded local-capture range"
      });
      return;
    }
    for (let index = 0; index < capture.samples.length; index += 1) {
      if (!Number.isFinite(capture.samples[index])) {
        context.addIssue({
          code: "custom",
          path: ["samples", index],
          message: "PCM samples must be finite"
        });
        return;
      }
    }
  });

export type CapturedPcm = z.infer<typeof CapturedPcmSchema>;

export type MicrophonePermissionState = "granted" | "prompt" | "denied" | "unknown";

export interface VoiceBrowserCapability {
  readonly secureContext: boolean;
  readonly mediaDevices: boolean;
  readonly webAudio: boolean;
  readonly audioWorklet: boolean;
  readonly scriptProcessorFallback: boolean;
}

export interface VoiceBrowserCapabilityProbe {
  inspect(signal?: AbortSignal): Promise<VoiceBrowserCapability>;
}

export interface MicrophonePermissionProbe {
  query(signal?: AbortSignal): Promise<MicrophonePermissionState>;
}

export interface PcmCaptureSource {
  collect(input: {
    readonly durationMs: number;
    readonly signal: AbortSignal;
  }): Promise<CapturedPcm>;
  dispose(): Promise<void>;
}

export interface MicrophoneSession {
  readonly sampleRateHz: number;
  readonly source: PcmCaptureSource;
  dispose(): Promise<void>;
}

export class MicrophoneOpenError extends Error {
  public constructor(
    public readonly reason: VoiceBiomarkerUnavailableReason,
    message: string
  ) {
    super(message);
    this.name = "MicrophoneOpenError";
  }
}

export interface MicrophoneController {
  open(signal: AbortSignal): Promise<MicrophoneSession>;
}

export interface VoicePageLifecycle {
  onInterrupted(listener: () => void): () => void;
}

export interface VoiceBiomarkerDependencies {
  readonly capabilities: VoiceBrowserCapabilityProbe;
  readonly permission: MicrophonePermissionProbe;
  readonly microphone: MicrophoneController;
  readonly lifecycle: VoicePageLifecycle;
  readonly now: () => Date;
  readonly randomUuid: () => string;
}
