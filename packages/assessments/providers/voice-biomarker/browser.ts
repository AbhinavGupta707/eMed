import {
  MicrophoneOpenError,
  type CapturedPcm,
  type MicrophoneController,
  type MicrophonePermissionProbe,
  type MicrophoneSession,
  type PcmCaptureSource,
  type VoiceBrowserCapability,
  type VoiceBrowserCapabilityProbe,
  type VoicePageLifecycle
} from "./types";

const WORKLET_PROCESSOR_NAME = "homerounds-ephemeral-pcm-v1";
const WORKLET_MODULE_SOURCE = `
class HomeRoundsEphemeralPcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.pending = new Float32Array(2048);
    this.offset = 0;
    this.stopped = false;
    this.port.onmessage = (event) => {
      if (event.data && event.data.type === "dispose") {
        this.pending.fill(0);
        this.offset = 0;
        this.stopped = true;
      }
    };
  }

  process(inputs) {
    if (this.stopped) return false;
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;
    let inputOffset = 0;
    while (inputOffset < channel.length) {
      const available = this.pending.length - this.offset;
      const count = Math.min(available, channel.length - inputOffset);
      this.pending.set(channel.subarray(inputOffset, inputOffset + count), this.offset);
      this.offset += count;
      inputOffset += count;
      if (this.offset === this.pending.length) {
        const completed = this.pending;
        this.port.postMessage(completed, [completed.buffer]);
        this.pending = new Float32Array(2048);
        this.offset = 0;
      }
    }
    return true;
  }
}

registerProcessor("${WORKLET_PROCESSOR_NAME}", HomeRoundsEphemeralPcmProcessor);
`;

type AudioContextConstructor = new () => AudioContext;

type AudioGlobal = typeof globalThis & {
  readonly webkitAudioContext?: AudioContextConstructor;
};

function audioContextConstructor(): AudioContextConstructor | null {
  const scope = globalThis as AudioGlobal;
  if (typeof scope.AudioContext === "function") return scope.AudioContext;
  return typeof scope.webkitAudioContext === "function" ? scope.webkitAudioContext : null;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted === true) throw new DOMException("Voice capture cancelled", "AbortError");
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
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
      reject(new DOMException("Voice capture cancelled", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
  });
}

function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted)
    return Promise.reject(new DOMException("Voice capture cancelled", "AbortError"));
  return new Promise((resolve, reject) => {
    const abort = (): void => {
      signal.removeEventListener("abort", abort);
      reject(new DOMException("Voice capture cancelled", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    operation.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      }
    );
  });
}

function stopStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      // Continue stopping every track at the hardware cleanup boundary.
    }
  }
}

function getUserMediaAbortable(
  operation: Promise<MediaStream>,
  signal: AbortSignal
): Promise<MediaStream> {
  if (signal.aborted) {
    operation.then(stopStream, () => undefined);
    return Promise.reject(new DOMException("Voice capture cancelled", "AbortError"));
  }
  return new Promise((resolve, reject) => {
    let abandoned = false;
    const abort = (): void => {
      abandoned = true;
      signal.removeEventListener("abort", abort);
      reject(new DOMException("Voice capture cancelled", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    operation.then(
      (stream) => {
        signal.removeEventListener("abort", abort);
        if (abandoned || signal.aborted) {
          stopStream(stream);
          return;
        }
        resolve(stream);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        if (!abandoned) reject(error);
      }
    );
  });
}

function microphoneError(error: unknown): MicrophoneOpenError {
  if (
    error instanceof DOMException &&
    (error.name === "NotAllowedError" || error.name === "SecurityError")
  ) {
    return new MicrophoneOpenError("permission_denied", "Microphone permission was denied");
  }
  if (
    error instanceof DOMException &&
    (error.name === "NotFoundError" || error.name === "OverconstrainedError")
  ) {
    return new MicrophoneOpenError("unsupported_device", "A microphone is unavailable");
  }
  return new MicrophoneOpenError("microphone_unavailable", "The microphone could not be started");
}

function concatenateAndRelease(
  chunks: Float32Array[],
  sampleCount: number
): Float32Array<ArrayBuffer> {
  const samples = new Float32Array(sampleCount);
  let offset = 0;
  try {
    for (const chunk of chunks) {
      samples.set(chunk, offset);
      offset += chunk.length;
    }
    return samples;
  } catch (error) {
    samples.fill(0);
    throw error;
  } finally {
    for (const chunk of chunks) chunk.fill(0);
    chunks.length = 0;
  }
}

interface RecorderConnection {
  disconnect(): void;
}

class BrowserPcmCaptureSource implements PcmCaptureSource {
  private disposed = false;
  private used = false;
  private activeAbort: AbortController | null = null;
  private activeCleanup: Promise<void> | null = null;
  private resolveActiveCleanup: (() => void) | null = null;

  public constructor(
    private readonly context: AudioContext,
    private readonly mediaSource: MediaStreamAudioSourceNode
  ) {}

  public async collect(input: {
    readonly durationMs: number;
    readonly signal: AbortSignal;
  }): Promise<CapturedPcm> {
    if (this.disposed) throw new Error("PCM capture source is disposed");
    if (this.used) throw new Error("PCM capture source is single-use");
    this.used = true;
    const controller = new AbortController();
    this.activeAbort = controller;
    this.activeCleanup = new Promise((resolve) => {
      this.resolveActiveCleanup = resolve;
    });
    const abort = (): void => controller.abort();
    input.signal.addEventListener("abort", abort, { once: true });
    const chunks: Float32Array[] = [];
    let sampleCount = 0;
    let accepting = true;
    let connection: RecorderConnection | null = null;
    const maximumSamples = Math.ceil((this.context.sampleRate * input.durationMs) / 1000) + 4_096;
    const receive = (chunk: Float32Array): void => {
      if (!accepting || sampleCount + chunk.length > maximumSamples) {
        chunk.fill(0);
        if (sampleCount + chunk.length > maximumSamples) controller.abort();
        return;
      }
      chunks.push(chunk);
      sampleCount += chunk.length;
    };

    try {
      if (input.signal.aborted) controller.abort();
      throwIfAborted(controller.signal);
      await abortable(this.context.resume(), controller.signal);
      connection = await this.connectRecorder(receive, controller.signal);
      await wait(input.durationMs, controller.signal);
      accepting = false;
      connection.disconnect();
      connection = null;
      if (sampleCount === 0) throw new Error("Microphone returned no PCM samples");
      return {
        sampleRateHz: this.context.sampleRate,
        samples: concatenateAndRelease(chunks, sampleCount)
      };
    } finally {
      accepting = false;
      connection?.disconnect();
      for (const chunk of chunks) chunk.fill(0);
      chunks.length = 0;
      input.signal.removeEventListener("abort", abort);
      this.activeAbort = null;
      this.resolveActiveCleanup?.();
      this.resolveActiveCleanup = null;
      this.activeCleanup = null;
    }
  }

  public async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.activeAbort?.abort();
    await this.activeCleanup;
  }

  private async connectRecorder(
    receive: (chunk: Float32Array) => void,
    signal: AbortSignal
  ): Promise<RecorderConnection> {
    if (this.context.audioWorklet !== undefined && typeof AudioWorkletNode === "function") {
      return this.connectAudioWorklet(receive, signal);
    }
    return this.connectScriptProcessor(receive);
  }

  private async connectAudioWorklet(
    receive: (chunk: Float32Array) => void,
    signal: AbortSignal
  ): Promise<RecorderConnection> {
    const moduleBlob = new Blob([WORKLET_MODULE_SOURCE], { type: "text/javascript" });
    const moduleUrl = URL.createObjectURL(moduleBlob);
    try {
      await abortable(this.context.audioWorklet.addModule(moduleUrl), signal);
    } finally {
      URL.revokeObjectURL(moduleUrl);
    }
    throwIfAborted(signal);
    const recorder = new AudioWorkletNode(this.context, WORKLET_PROCESSOR_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1]
    });
    const silentOutput = this.context.createGain();
    silentOutput.gain.value = 0;
    recorder.port.onmessage = (event: MessageEvent<unknown>): void => {
      if (event.data instanceof Float32Array) receive(event.data);
    };
    this.mediaSource.connect(recorder);
    recorder.connect(silentOutput);
    silentOutput.connect(this.context.destination);
    let disconnected = false;
    return {
      disconnect: () => {
        if (disconnected) return;
        disconnected = true;
        recorder.port.onmessage = null;
        recorder.port.postMessage({ type: "dispose" });
        recorder.port.close();
        try {
          this.mediaSource.disconnect(recorder);
          recorder.disconnect();
          silentOutput.disconnect();
        } catch {
          // The context may already be closing; the worklet buffer was explicitly released.
        }
      }
    };
  }

  private connectScriptProcessor(receive: (chunk: Float32Array) => void): RecorderConnection {
    if (typeof this.context.createScriptProcessor !== "function") {
      throw new MicrophoneOpenError(
        "unsupported_device",
        "This browser has no supported Web Audio capture processor"
      );
    }
    const recorder = this.context.createScriptProcessor(2_048, 1, 1);
    const silentOutput = this.context.createGain();
    silentOutput.gain.value = 0;
    recorder.onaudioprocess = (event): void => {
      const channel = event.inputBuffer.getChannelData(0);
      receive(new Float32Array(channel));
    };
    this.mediaSource.connect(recorder);
    recorder.connect(silentOutput);
    silentOutput.connect(this.context.destination);
    let disconnected = false;
    return {
      disconnect: () => {
        if (disconnected) return;
        disconnected = true;
        recorder.onaudioprocess = null;
        try {
          this.mediaSource.disconnect(recorder);
          recorder.disconnect();
          silentOutput.disconnect();
        } catch {
          // The context may already be closing; owned chunks are released by collect().
        }
      }
    };
  }
}

class BrowserMicrophoneSession implements MicrophoneSession {
  public readonly source: BrowserPcmCaptureSource;
  private disposed = false;

  public constructor(
    public readonly sampleRateHz: number,
    private readonly context: AudioContext,
    private readonly mediaSource: MediaStreamAudioSourceNode,
    private readonly stream: MediaStream
  ) {
    this.source = new BrowserPcmCaptureSource(context, mediaSource);
  }

  public async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    try {
      await this.source.dispose();
    } finally {
      try {
        this.mediaSource.disconnect();
      } catch {
        // Continue teardown: tracks and the audio context still need to close.
      }
      stopStream(this.stream);
      try {
        await this.context.close();
      } catch {
        // Tracks are already stopped; closing a previously closed context is harmless.
      }
    }
  }
}

export class DefaultVoiceBrowserCapabilityProbe implements VoiceBrowserCapabilityProbe {
  public async inspect(signal?: AbortSignal): Promise<VoiceBrowserCapability> {
    throwIfAborted(signal);
    const constructor = audioContextConstructor();
    const mediaDevices =
      typeof navigator !== "undefined" &&
      navigator.mediaDevices !== undefined &&
      typeof navigator.mediaDevices.getUserMedia === "function";
    const audioWorklet = typeof AudioWorkletNode === "function";
    const scriptProcessorFallback =
      constructor !== null && typeof constructor.prototype.createScriptProcessor === "function";
    return {
      secureContext: globalThis.isSecureContext === true,
      mediaDevices,
      webAudio: constructor !== null && (audioWorklet || scriptProcessorFallback),
      audioWorklet,
      scriptProcessorFallback
    };
  }
}

export class DefaultMicrophonePermissionProbe implements MicrophonePermissionProbe {
  public async query(signal?: AbortSignal): Promise<"granted" | "prompt" | "denied" | "unknown"> {
    throwIfAborted(signal);
    if (typeof navigator === "undefined" || navigator.permissions === undefined) return "unknown";
    try {
      const result = await navigator.permissions.query({ name: "microphone" as PermissionName });
      throwIfAborted(signal);
      return result.state;
    } catch (error) {
      if (isAbort(error)) throw error;
      // Safari versions without microphone permission-query support still prompt via getUserMedia.
      return "unknown";
    }
  }
}

export class DefaultMicrophoneController implements MicrophoneController {
  public async open(signal: AbortSignal): Promise<MicrophoneSession> {
    throwIfAborted(signal);
    const Constructor = audioContextConstructor();
    if (
      Constructor === null ||
      typeof navigator === "undefined" ||
      navigator.mediaDevices?.getUserMedia === undefined
    ) {
      throw new MicrophoneOpenError("unsupported_device", "Microphone capture is unsupported");
    }
    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;
    try {
      stream = await getUserMediaAbortable(
        navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
          },
          video: false
        }),
        signal
      );
      throwIfAborted(signal);
      if (stream.getAudioTracks()[0] === undefined) {
        throw new MicrophoneOpenError("unsupported_device", "No microphone track was returned");
      }
      context = new Constructor();
      if (
        !Number.isFinite(context.sampleRate) ||
        context.sampleRate < 8_000 ||
        context.sampleRate > 192_000
      ) {
        throw new MicrophoneOpenError(
          "unsupported_device",
          "The microphone sample rate is unsupported"
        );
      }
      const mediaSource = context.createMediaStreamSource(stream);
      return new BrowserMicrophoneSession(context.sampleRate, context, mediaSource, stream);
    } catch (error) {
      if (stream !== null) stopStream(stream);
      if (context !== null) {
        try {
          await context.close();
        } catch {
          // The hardware track has already stopped.
        }
      }
      if (isAbort(error)) throw error;
      if (error instanceof MicrophoneOpenError) throw error;
      throw microphoneError(error);
    }
  }
}

export class DefaultVoicePageLifecycle implements VoicePageLifecycle {
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
