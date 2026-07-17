import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DefaultMicrophoneController,
  DefaultMicrophonePermissionProbe,
  DefaultVoiceBrowserCapabilityProbe
} from "./browser";
import { MicrophoneOpenError } from "./types";

class ScriptProcessorAudioContextStub {
  public createScriptProcessor(): void {}
}

function stubScriptProcessorAudioContext(): void {
  vi.stubGlobal("AudioContext", ScriptProcessorAudioContextStub as unknown as typeof AudioContext);
  vi.stubGlobal("AudioWorkletNode", undefined);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("voice browser microphone boundary", () => {
  it("recognizes the ScriptProcessor Safari compatibility path without AudioWorklet", async () => {
    stubScriptProcessorAudioContext();
    vi.stubGlobal("isSecureContext", true);
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn() }
    });

    await expect(new DefaultVoiceBrowserCapabilityProbe().inspect()).resolves.toEqual({
      secureContext: true,
      mediaDevices: true,
      webAudio: true,
      audioWorklet: false,
      scriptProcessorFallback: true
    });
  });

  it("reports unsupported capability when Web Audio is absent", async () => {
    vi.stubGlobal("AudioContext", undefined);
    vi.stubGlobal("webkitAudioContext", undefined);
    vi.stubGlobal("AudioWorkletNode", undefined);
    vi.stubGlobal("isSecureContext", true);
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn() }
    });

    await expect(new DefaultVoiceBrowserCapabilityProbe().inspect()).resolves.toMatchObject({
      mediaDevices: true,
      webAudio: false,
      audioWorklet: false,
      scriptProcessorFallback: false
    });
  });

  it("preserves Safari's unknown permission state and lets getUserMedia own the prompt", async () => {
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn() } });

    await expect(new DefaultMicrophonePermissionProbe().query()).resolves.toBe("unknown");
  });

  it("returns a denied permission state when the browser exposes it", async () => {
    const query = vi.fn(async () => ({ state: "denied" }));
    vi.stubGlobal("navigator", {
      permissions: { query },
      mediaDevices: { getUserMedia: vi.fn() }
    });

    await expect(new DefaultMicrophonePermissionProbe().query()).resolves.toBe("denied");
    expect(query).toHaveBeenCalledWith({ name: "microphone" });
  });

  it("maps getUserMedia denial and requests unprocessed mono audio", async () => {
    stubScriptProcessorAudioContext();
    const getUserMedia = vi.fn(() => Promise.reject(new DOMException("denied", "NotAllowedError")));
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });

    const error = await new DefaultMicrophoneController()
      .open(new AbortController().signal)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(MicrophoneOpenError);
    expect(error).toMatchObject({ reason: "permission_denied" });
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: {
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      },
      video: false
    });
  });

  it("maps a missing microphone track to the frozen unsupported reason", async () => {
    stubScriptProcessorAudioContext();
    const getUserMedia = vi.fn(() => Promise.reject(new DOMException("missing", "NotFoundError")));
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });

    const error = await new DefaultMicrophoneController()
      .open(new AbortController().signal)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(MicrophoneOpenError);
    expect(error).toMatchObject({ reason: "unsupported_device" });
  });

  it("stops a late microphone stream when cancellation wins the permission race", async () => {
    stubScriptProcessorAudioContext();
    let resolveStream: (stream: MediaStream) => void = () => undefined;
    const pendingStream = new Promise<MediaStream>((resolve) => {
      resolveStream = resolve;
    });
    const getUserMedia = vi.fn(() => pendingStream);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    const stop = vi.fn();
    const stream = {
      getTracks: () => [{ stop }],
      getAudioTracks: () => [{ stop }]
    } as unknown as MediaStream;
    const controller = new AbortController();
    const opening = new DefaultMicrophoneController().open(controller.signal);

    controller.abort();
    resolveStream(stream);

    await expect(opening).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(stop).toHaveBeenCalledOnce());
  });

  it("rejects unsupported microphone capture before requesting media", async () => {
    vi.stubGlobal("AudioContext", undefined);
    vi.stubGlobal("webkitAudioContext", undefined);
    const getUserMedia = vi.fn();
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });

    const error = await new DefaultMicrophoneController()
      .open(new AbortController().signal)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(MicrophoneOpenError);
    expect(error).toMatchObject({ reason: "unsupported_device" });
    expect(getUserMedia).not.toHaveBeenCalled();
  });
});
