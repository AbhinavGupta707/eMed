import { z } from "zod";

export const DerivedOpticalSampleSchema = z.object({
  timestampMs: z.number().finite().nonnegative(),
  meanRed: z.number().finite().min(0).max(255),
  meanGreen: z.number().finite().min(0).max(255),
  meanBlue: z.number().finite().min(0).max(255),
  meanIntensity: z.number().finite().min(0).max(255),
  saturation: z.number().finite().min(0).max(1),
  coverage: z.number().finite().min(0).max(1),
  motion: z.number().finite().min(0).max(1)
});

export type DerivedOpticalSample = z.infer<typeof DerivedOpticalSampleSchema>;

export type CameraPermissionState = "granted" | "prompt" | "denied" | "unknown";

export interface BrowserCapability {
  readonly secureContext: boolean;
  readonly mediaDevices: boolean;
  readonly rearCamera: boolean;
}

export interface BrowserCapabilityProbe {
  inspect(signal?: AbortSignal): Promise<BrowserCapability>;
}

export interface CameraPermissionProbe {
  query(signal?: AbortSignal): Promise<CameraPermissionState>;
}

export interface DerivedSampleSource {
  collect(input: {
    readonly durationMs: number;
    readonly signal: AbortSignal;
  }): Promise<readonly DerivedOpticalSample[]>;
  dispose(): Promise<void>;
}

export interface TorchController {
  readonly available: boolean;
  setEnabled(enabled: boolean): Promise<void>;
}

export interface CameraSession {
  readonly source: DerivedSampleSource;
  readonly torch: TorchController;
  dispose(): Promise<void>;
}

export type CameraOpenFailure = "permission_denied" | "unsupported_device" | "provider_unavailable";

export class CameraOpenError extends Error {
  public constructor(
    public readonly reason: CameraOpenFailure,
    message: string
  ) {
    super(message);
    this.name = "CameraOpenError";
  }
}

export interface RearCameraController {
  open(signal: AbortSignal): Promise<CameraSession>;
}

export interface PageLifecycle {
  onInterrupted(listener: () => void): () => void;
}

export interface FingerPpgDependencies {
  readonly capabilities: BrowserCapabilityProbe;
  readonly permission: CameraPermissionProbe;
  readonly camera: RearCameraController;
  readonly lifecycle: PageLifecycle;
  readonly now: () => Date;
  readonly randomUuid: () => string;
}
