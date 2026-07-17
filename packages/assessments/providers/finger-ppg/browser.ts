import { DerivedOpticalSampleSchema, type DerivedOpticalSample } from "./types";
import {
  CameraOpenError,
  type BrowserCapabilityProbe,
  type CameraPermissionProbe,
  type CameraSession,
  type DerivedSampleSource,
  type PageLifecycle,
  type RearCameraController,
  type TorchController
} from "./types";

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted === true) throw new DOMException("Capture cancelled", "AbortError");
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
      reject(new DOMException("Capture cancelled", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
  });
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new DOMException("Capture cancelled", "AbortError"));
  return new Promise((resolve, reject) => {
    const abort = (): void => {
      signal.removeEventListener("abort", abort);
      reject(new DOMException("Capture cancelled", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(error instanceof Error ? error : new Error("Frame extraction failed"));
      }
    );
  });
}

export class DefaultBrowserCapabilityProbe implements BrowserCapabilityProbe {
  public async inspect(signal?: AbortSignal): Promise<{
    secureContext: boolean;
    mediaDevices: boolean;
    rearCamera: boolean;
  }> {
    throwIfAborted(signal);
    const mediaDevices = typeof navigator !== "undefined" && navigator.mediaDevices !== undefined;
    let rearCamera = false;
    if (mediaDevices && typeof navigator.mediaDevices.enumerateDevices === "function") {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        throwIfAborted(signal);
        const videoInputs = devices.filter((device) => device.kind === "videoinput");
        const labelsVisible = videoInputs.some((device) => device.label.length > 0);
        rearCamera = labelsVisible
          ? videoInputs.some((device) => /rear|back|environment/i.test(device.label))
          : videoInputs.length > 0;
      } catch {
        rearCamera = false;
      }
    }
    return {
      secureContext: globalThis.isSecureContext === true,
      mediaDevices,
      rearCamera
    };
  }
}

export class DefaultCameraPermissionProbe implements CameraPermissionProbe {
  public async query(signal?: AbortSignal): Promise<"granted" | "prompt" | "denied" | "unknown"> {
    throwIfAborted(signal);
    if (typeof navigator === "undefined" || navigator.permissions === undefined) return "unknown";
    try {
      const result = await navigator.permissions.query({ name: "camera" as PermissionName });
      throwIfAborted(signal);
      return result.state;
    } catch {
      return "unknown";
    }
  }
}

interface WorkerResponse {
  readonly id: number;
  readonly sample?: unknown;
  readonly error?: "frame_extraction_failed";
}

class WorkerFrameExtractor {
  private readonly worker = new Worker(new URL("./frame-extractor.worker.ts", import.meta.url), {
    type: "module",
    name: "finger-ppg-derived-sample-extractor"
  });
  private nextId = 0;
  private readonly pending = new Map<
    number,
    { resolve: (sample: DerivedOpticalSample) => void; reject: (error: Error) => void }
  >();
  private disposed = false;

  public constructor() {
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>): void => {
      const pending = this.pending.get(event.data.id);
      if (pending === undefined) return;
      this.pending.delete(event.data.id);
      const parsed = DerivedOpticalSampleSchema.safeParse(event.data.sample);
      if (event.data.error !== undefined || !parsed.success) {
        pending.reject(new Error("Derived frame extraction failed"));
      } else {
        pending.resolve(parsed.data);
      }
    };
    this.worker.onerror = (): void =>
      this.disposeWithError(new Error("Frame extractor worker failed"));
  }

  public extract(bitmap: ImageBitmap, timestampMs: number): Promise<DerivedOpticalSample> {
    if (this.disposed) {
      bitmap.close();
      return Promise.reject(new Error("Frame extractor is disposed"));
    }
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, timestampMs, bitmap }, [bitmap]);
    });
  }

  public dispose(): void {
    this.disposeWithError(new Error("Frame extractor disposed"));
  }

  private disposeWithError(error: Error): void {
    if (this.disposed) return;
    this.disposed = true;
    this.worker.terminate();
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}

class BrowserDerivedSampleSource implements DerivedSampleSource {
  private readonly extractor = new WorkerFrameExtractor();
  private disposed = false;

  public constructor(private readonly video: HTMLVideoElement) {}

  public async collect(input: {
    readonly durationMs: number;
    readonly signal: AbortSignal;
  }): Promise<readonly DerivedOpticalSample[]> {
    if (this.disposed) throw new Error("Sample source is disposed");
    const startedAt = performance.now();
    const samples: DerivedOpticalSample[] = [];
    while (performance.now() - startedAt < input.durationMs) {
      throwIfAborted(input.signal);
      await wait(1000 / 30, input.signal);
      const bitmap = await createImageBitmap(this.video);
      const sample = await abortable(
        this.extractor.extract(bitmap, performance.now() - startedAt),
        input.signal
      );
      samples.push(sample);
    }
    return samples;
  }

  public async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.extractor.dispose();
  }
}

class BrowserTorchController implements TorchController {
  private enabled = false;

  public constructor(
    private readonly track: MediaStreamTrack,
    public readonly available: boolean
  ) {}

  public async setEnabled(enabled: boolean): Promise<void> {
    if (!this.available) return;
    await this.track.applyConstraints({
      advanced: [{ torch: enabled } as MediaTrackConstraintSet]
    });
    this.enabled = enabled;
  }

  public async disableForCleanup(): Promise<void> {
    if (!this.enabled || this.track.readyState === "ended") return;
    try {
      await this.setEnabled(false);
    } catch {
      this.enabled = false;
    }
  }
}

class BrowserCameraSession implements CameraSession {
  private disposed = false;

  public constructor(
    public readonly source: DerivedSampleSource,
    public readonly torch: BrowserTorchController,
    private readonly stream: MediaStream,
    private readonly video: HTMLVideoElement
  ) {}

  public async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    try {
      await this.source.dispose();
    } catch {
      // Continue teardown: media tracks must stop even if worker disposal fails.
    }
    try {
      await this.torch.disableForCleanup();
    } catch {
      // Track stop below is the final hardware cleanup boundary.
    }
    for (const track of this.stream.getTracks()) {
      try {
        track.stop();
      } catch {
        // Continue stopping every track.
      }
    }
    try {
      this.video.pause();
      this.video.srcObject = null;
      this.video.remove();
    } catch {
      // Tracks are already stopped; detached element cleanup is best-effort.
    }
  }
}

function cameraError(error: unknown): CameraOpenError {
  if (
    error instanceof DOMException &&
    (error.name === "NotAllowedError" || error.name === "SecurityError")
  ) {
    return new CameraOpenError("permission_denied", "Rear-camera permission was denied");
  }
  if (
    error instanceof DOMException &&
    (error.name === "NotFoundError" || error.name === "OverconstrainedError")
  ) {
    return new CameraOpenError("unsupported_device", "A rear-facing camera is unavailable");
  }
  return new CameraOpenError("provider_unavailable", "The rear camera could not be started");
}

export class DefaultRearCameraController implements RearCameraController {
  public async open(signal: AbortSignal): Promise<CameraSession> {
    throwIfAborted(signal);
    if (typeof navigator === "undefined" || navigator.mediaDevices?.getUserMedia === undefined) {
      throw new CameraOpenError("unsupported_device", "Camera capture is unsupported");
    }
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { exact: "environment" },
          width: { ideal: 640 },
          height: { ideal: 480 }
        }
      });
      throwIfAborted(signal);
      const track = stream.getVideoTracks()[0];
      if (track === undefined)
        throw new CameraOpenError("unsupported_device", "No rear camera track was returned");
      const facingMode = track.getSettings().facingMode;
      if (facingMode !== undefined && facingMode !== "environment") {
        throw new CameraOpenError("unsupported_device", "The selected camera is not rear-facing");
      }
      const capabilities = track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean };
      const torch = new BrowserTorchController(track, capabilities.torch === true);
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play();
      return new BrowserCameraSession(new BrowserDerivedSampleSource(video), torch, stream, video);
    } catch (error) {
      for (const track of stream?.getTracks() ?? []) track.stop();
      if (error instanceof CameraOpenError) throw error;
      throw cameraError(error);
    }
  }
}

export class DefaultPageLifecycle implements PageLifecycle {
  public onInterrupted(listener: () => void): () => void {
    if (typeof window === "undefined" || typeof document === "undefined") return () => undefined;
    const pageHide = (): void => listener();
    const visibility = (): void => {
      if (document.visibilityState === "hidden") listener();
    };
    window.addEventListener("pagehide", pageHide);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("pagehide", pageHide);
      document.removeEventListener("visibilitychange", visibility);
    };
  }
}
