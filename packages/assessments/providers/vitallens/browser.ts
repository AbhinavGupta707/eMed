import type {
  VitalLensCameraGateway,
  VitalLensCameraSession,
  VitalLensConsentGateway,
  VitalLensConsentRequest
} from "./contracts";
import { VitalLensCameraError } from "./errors";

export const VITALLENS_FRAME_WIDTH = 40;
export const VITALLENS_FRAME_HEIGHT = 40;
export const VITALLENS_TARGET_FRAMES_PER_SECOND = 15;
export const VITALLENS_MAX_FRAMES_PER_REQUEST = 900;
export const VITALLENS_MIN_FRAMES_PER_REQUEST = 16;
export const VITALLENS_MIN_CAPTURE_DURATION_MS = 5_000;

const FRAME_BYTE_LENGTH = VITALLENS_FRAME_WIDTH * VITALLENS_FRAME_HEIGHT * 3;
const FRAME_INTERVAL_MS = 1_000 / VITALLENS_TARGET_FRAMES_PER_SECOND;
const HAVE_CURRENT_DATA = 2;

export const VITALLENS_THIRD_PARTY_CONSENT_NOTICE =
  "Allow HomeRounds to use the front camera for this one VitalLens pulse estimate? " +
  "Cropped 40 by 40 pixel, silent frames will be sent through the HomeRounds server to " +
  "VitalLens (Rouast Labs, United States) for third-party processing. No audio is captured. " +
  "HomeRounds does not retain raw frames; Rouast says it deletes frames and estimates after " +
  "processing but retains usage and quality metadata. Declining produces no measurement.";

type CameraPermissionState = "granted" | "prompt" | "denied" | "unknown";

type SquareCrop = Readonly<{
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
}>;

type ConsentConfirmation = (notice: string) => boolean | Promise<boolean>;

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new VitalLensCameraError("cancelled");
}

function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const complete = (): void => {
      signal.removeEventListener("abort", abort);
      resolve();
    };
    const timer = globalThis.setTimeout(complete, milliseconds);
    const abort = (): void => {
      globalThis.clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(new VitalLensCameraError("cancelled"));
    };
    signal.addEventListener("abort", abort, { once: true });
  });
}

function permissionState(): Promise<CameraPermissionState> {
  if (typeof navigator === "undefined" || navigator.permissions === undefined) {
    return Promise.resolve("unknown");
  }
  return navigator.permissions
    .query({ name: "camera" as PermissionName })
    .then((permission) => permission.state)
    .catch(() => "unknown");
}

function stopTracks(stream: MediaStream | null): void {
  for (const track of stream?.getTracks() ?? []) {
    try {
      track.stop();
    } catch {
      // Continue stopping all tracks even if a browser track fails cleanup.
    }
  }
}

function normalizeCameraError(error: unknown): VitalLensCameraError {
  if (error instanceof VitalLensCameraError) return error;
  if (
    error instanceof DOMException &&
    (error.name === "NotAllowedError" || error.name === "SecurityError")
  ) {
    return new VitalLensCameraError("permission_denied");
  }
  if (
    error instanceof DOMException &&
    (error.name === "NotFoundError" || error.name === "OverconstrainedError")
  ) {
    return new VitalLensCameraError("unsupported_device");
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return new VitalLensCameraError("cancelled");
  }
  return new VitalLensCameraError("camera_failure");
}

function subscribeToPageInterruption(interrupt: () => void): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => undefined;
  }
  const pageHide = (): void => interrupt();
  const visibility = (): void => {
    if (document.visibilityState === "hidden") interrupt();
  };
  window.addEventListener("pagehide", pageHide);
  document.addEventListener("visibilitychange", visibility);
  return () => {
    window.removeEventListener("pagehide", pageHide);
    document.removeEventListener("visibilitychange", visibility);
  };
}

/** Returns the largest centered square. Positioning guidance keeps face and upper chest in it. */
export function centeredSquareCrop(width: number, height: number): SquareCrop {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new VitalLensCameraError("camera_failure");
  }
  const side = Math.min(width, height);
  return {
    sourceX: (width - side) / 2,
    sourceY: (height - side) / 2,
    sourceWidth: side,
    sourceHeight: side
  };
}

/** Copies browser RGBA pixels into the provider's exact RGB24 byte order. */
export function rgbaToRgb24(rgba: Uint8ClampedArray): Uint8Array {
  const expectedRgbaLength = VITALLENS_FRAME_WIDTH * VITALLENS_FRAME_HEIGHT * 4;
  if (rgba.byteLength !== expectedRgbaLength) {
    throw new VitalLensCameraError("camera_failure");
  }
  const rgb = new Uint8Array(FRAME_BYTE_LENGTH);
  for (let source = 0, target = 0; source < rgba.byteLength; source += 4, target += 3) {
    rgb[target] = rgba[source] ?? 0;
    rgb[target + 1] = rgba[source + 1] ?? 0;
    rgb[target + 2] = rgba[source + 2] ?? 0;
  }
  return rgb;
}

export class BrowserVitalLensConsentGateway implements VitalLensConsentGateway {
  constructor(
    private readonly confirmProcessing: ConsentConfirmation = (notice) =>
      typeof globalThis.confirm === "function" && globalThis.confirm(notice),
    private readonly now: () => string = () => new Date().toISOString()
  ) {}

  async requestConsent(input: VitalLensConsentRequest): Promise<unknown> {
    throwIfAborted(input.signal);
    const granted = await this.confirmProcessing(VITALLENS_THIRD_PARTY_CONSENT_NOTICE);
    throwIfAborted(input.signal);
    if (!granted) return { granted: false };
    return {
      granted: true,
      consentVersion: input.consentVersion,
      grantedAt: this.now()
    };
  }
}

class BrowserVitalLensCameraSession implements VitalLensCameraSession {
  readonly #payloads = new Set<Uint8Array>();
  #stopped = false;

  constructor(
    private readonly stream: MediaStream,
    private readonly video: HTMLVideoElement,
    private readonly canvas: HTMLCanvasElement,
    private readonly context: CanvasRenderingContext2D
  ) {}

  async createInferencePayload(input: {
    maxDurationMs: number;
    maxPayloadBytes: number;
    signal: AbortSignal;
  }): Promise<{ bytes: Uint8Array; metadata: unknown }> {
    if (this.#stopped) throw new VitalLensCameraError("camera_failure");
    throwIfAborted(input.signal);
    const frameLimit = Math.min(
      VITALLENS_MAX_FRAMES_PER_REQUEST,
      Math.floor(input.maxPayloadBytes / FRAME_BYTE_LENGTH),
      Math.ceil((input.maxDurationMs / 1_000) * VITALLENS_TARGET_FRAMES_PER_SECOND)
    );
    if (
      input.maxDurationMs < VITALLENS_MIN_CAPTURE_DURATION_MS ||
      frameLimit < VITALLENS_MIN_FRAMES_PER_REQUEST
    ) {
      throw new VitalLensCameraError("camera_failure");
    }

    const controller = new AbortController();
    const cancel = (): void => controller.abort();
    input.signal.addEventListener("abort", cancel, { once: true });
    const unsubscribe = subscribeToPageInterruption(cancel);
    const frames: Uint8Array[] = [];
    const startedAt = performance.now();

    try {
      while (performance.now() - startedAt < input.maxDurationMs && frames.length < frameLimit) {
        await wait(FRAME_INTERVAL_MS, controller.signal);
        throwIfAborted(controller.signal);
        if (this.video.readyState < HAVE_CURRENT_DATA) continue;
        const crop = centeredSquareCrop(this.video.videoWidth, this.video.videoHeight);
        this.context.drawImage(
          this.video,
          crop.sourceX,
          crop.sourceY,
          crop.sourceWidth,
          crop.sourceHeight,
          0,
          0,
          VITALLENS_FRAME_WIDTH,
          VITALLENS_FRAME_HEIGHT
        );
        const image = this.context.getImageData(
          0,
          0,
          VITALLENS_FRAME_WIDTH,
          VITALLENS_FRAME_HEIGHT
        );
        try {
          frames.push(rgbaToRgb24(image.data));
        } finally {
          image.data.fill(0);
        }
      }

      const durationMs = Math.min(
        input.maxDurationMs,
        Math.max(1, Math.round(performance.now() - startedAt))
      );
      if (
        frames.length < VITALLENS_MIN_FRAMES_PER_REQUEST ||
        durationMs < VITALLENS_MIN_CAPTURE_DURATION_MS
      ) {
        throw new VitalLensCameraError("camera_failure");
      }
      const bytes = new Uint8Array(frames.length * FRAME_BYTE_LENGTH);
      frames.forEach((frame, index) => bytes.set(frame, index * FRAME_BYTE_LENGTH));
      this.#payloads.add(bytes);
      return {
        bytes,
        metadata: {
          contentType: "application/octet-stream",
          byteLength: bytes.byteLength,
          durationMs,
          frameCount: frames.length,
          width: VITALLENS_FRAME_WIDTH,
          height: VITALLENS_FRAME_HEIGHT,
          audioIncluded: false
        }
      };
    } catch (error: unknown) {
      if (controller.signal.aborted || input.signal.aborted) {
        throw new VitalLensCameraError("cancelled");
      }
      throw normalizeCameraError(error);
    } finally {
      input.signal.removeEventListener("abort", cancel);
      unsubscribe();
      for (const frame of frames) frame.fill(0);
      this.context.clearRect(0, 0, VITALLENS_FRAME_WIDTH, VITALLENS_FRAME_HEIGHT);
    }
  }

  async stop(): Promise<void> {
    if (this.#stopped) return;
    this.#stopped = true;
    for (const payload of this.#payloads) payload.fill(0);
    this.#payloads.clear();
    stopTracks(this.stream);
    try {
      this.video.pause();
      this.video.srcObject = null;
      this.video.remove();
    } catch {
      // Media tracks are already stopped; detached element cleanup is best-effort.
    }
    this.context.clearRect(0, 0, VITALLENS_FRAME_WIDTH, VITALLENS_FRAME_HEIGHT);
    this.canvas.width = 0;
    this.canvas.height = 0;
  }
}

export class BrowserVitalLensCameraGateway implements VitalLensCameraGateway {
  async checkCapability(signal: AbortSignal): Promise<unknown> {
    throwIfAborted(signal);
    if (
      globalThis.isSecureContext !== true ||
      typeof navigator === "undefined" ||
      navigator.mediaDevices?.getUserMedia === undefined
    ) {
      return { available: false, reason: "unsupported_device" };
    }
    const permission = await permissionState();
    throwIfAborted(signal);
    if (permission === "denied") return { available: false, reason: "permission_denied" };
    return { available: true, frontCamera: true, permissionState: permission };
  }

  async openFrontCamera(signal: AbortSignal): Promise<VitalLensCameraSession> {
    throwIfAborted(signal);
    if (
      globalThis.isSecureContext !== true ||
      typeof navigator === "undefined" ||
      navigator.mediaDevices?.getUserMedia === undefined ||
      typeof document === "undefined"
    ) {
      throw new VitalLensCameraError("unsupported_device");
    }
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "user" },
          width: { ideal: 640 },
          height: { ideal: 640 }
        }
      });
      throwIfAborted(signal);
      const track = stream.getVideoTracks()[0];
      if (track === undefined || track.getSettings().facingMode === "environment") {
        throw new VitalLensCameraError("unsupported_device");
      }
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play();
      throwIfAborted(signal);

      const canvas = document.createElement("canvas");
      canvas.width = VITALLENS_FRAME_WIDTH;
      canvas.height = VITALLENS_FRAME_HEIGHT;
      const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
      if (context === null) throw new VitalLensCameraError("unsupported_device");
      return new BrowserVitalLensCameraSession(stream, video, canvas, context);
    } catch (error: unknown) {
      stopTracks(stream);
      throw normalizeCameraError(error);
    }
  }
}
