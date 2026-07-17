import { describe, expect, it, vi } from "vitest";

import { DefaultMedicationCameraGateway } from "./browser-camera";

function streamHarness() {
  const stop = vi.fn();
  const stream = {
    getTracks: () => [{ stop }],
    getVideoTracks: () => [{ stop }]
  } as unknown as MediaStream;
  return { stream, stop };
}

describe("browser medication camera permission gateway", () => {
  it("reports unsupported camera APIs", async () => {
    vi.stubGlobal("navigator", {});

    await expect(
      new DefaultMedicationCameraGateway().requestAccess(new AbortController().signal)
    ).rejects.toMatchObject({ code: "unsupported_camera" });

    vi.unstubAllGlobals();
  });

  it("maps permission denial without exposing browser error detail", async () => {
    const getUserMedia = vi.fn(async () => {
      throw new DOMException("device-specific detail", "NotAllowedError");
    });
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });

    await expect(
      new DefaultMedicationCameraGateway().requestAccess(new AbortController().signal)
    ).rejects.toMatchObject({ code: "permission_denied" });

    vi.unstubAllGlobals();
  });

  it("requests video without audio and stops every permission-probe track", async () => {
    const { stream, stop } = streamHarness();
    const getUserMedia = vi.fn(async () => stream);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });

    await expect(
      new DefaultMedicationCameraGateway().requestAccess(new AbortController().signal)
    ).resolves.toBeUndefined();
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: { facingMode: { ideal: "environment" } }
    });
    expect(stop).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });

  it("stops a late stream after cancellation", async () => {
    const { stream, stop } = streamHarness();
    let resolveStream: ((value: MediaStream) => void) | undefined;
    const getUserMedia = vi.fn(
      () =>
        new Promise<MediaStream>((resolve) => {
          resolveStream = resolve;
        })
    );
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    const controller = new AbortController();
    const pending = new DefaultMedicationCameraGateway().requestAccess(controller.signal);

    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "cancelled" });
    resolveStream?.(stream);
    await vi.waitFor(() => expect(stop).toHaveBeenCalledTimes(1));

    vi.unstubAllGlobals();
  });
});
