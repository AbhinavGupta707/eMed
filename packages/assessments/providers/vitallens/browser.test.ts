import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BrowserVitalLensCameraGateway,
  BrowserVitalLensConsentGateway,
  VITALLENS_FRAME_HEIGHT,
  VITALLENS_FRAME_WIDTH,
  VITALLENS_THIRD_PARTY_CONSENT_NOTICE,
  centeredSquareCrop,
  rgbaToRgb24
} from "./browser";
import { VitalLensPayloadMetadataSchema, type VitalLensConsentRequest } from "./contracts";

const consentRequest = (signal = new AbortController().signal): VitalLensConsentRequest => ({
  provider: "vitallens",
  consentVersion: "consent-v1",
  dataFlow: "cropped_downsampled_frames_via_homerounds_proxy",
  signal
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("VitalLens browser preprocessing", () => {
  it("center-crops landscape and portrait input without padding", () => {
    expect(centeredSquareCrop(1_280, 720)).toEqual({
      sourceX: 280,
      sourceY: 0,
      sourceWidth: 720,
      sourceHeight: 720
    });
    expect(centeredSquareCrop(720, 1_280)).toEqual({
      sourceX: 0,
      sourceY: 280,
      sourceWidth: 720,
      sourceHeight: 720
    });
  });

  it("converts exact 40 by 40 RGBA frames to RGB24 in channel order", () => {
    const rgba = new Uint8ClampedArray(VITALLENS_FRAME_WIDTH * VITALLENS_FRAME_HEIGHT * 4);
    rgba.set([12, 34, 56, 255, 78, 90, 123, 1]);

    const rgb = rgbaToRgb24(rgba);

    expect(rgb.byteLength).toBe(VITALLENS_FRAME_WIDTH * VITALLENS_FRAME_HEIGHT * 3);
    expect([...rgb.slice(0, 6)]).toEqual([12, 34, 56, 78, 90, 123]);
  });
});

describe("VitalLens browser consent and permission lifecycle", () => {
  it("requires an explicit third-party processing confirmation", async () => {
    const confirm = vi.fn(() => true);
    const gateway = new BrowserVitalLensConsentGateway(confirm, () => "2026-07-18T08:00:00.000Z");

    await expect(gateway.requestConsent(consentRequest())).resolves.toEqual({
      granted: true,
      consentVersion: "consent-v1",
      grantedAt: "2026-07-18T08:00:00.000Z"
    });
    expect(confirm).toHaveBeenCalledWith(VITALLENS_THIRD_PARTY_CONSENT_NOTICE);
    expect(VITALLENS_THIRD_PARTY_CONSENT_NOTICE).toMatch(
      /VitalLens.*third-party processing.*No audio.*does not retain raw frames.*quality metadata.*no measurement/i
    );
  });

  it("returns denial without opening or retaining camera state", async () => {
    const gateway = new BrowserVitalLensConsentGateway(() => false);
    await expect(gateway.requestConsent(consentRequest())).resolves.toEqual({ granted: false });
  });

  it("reports insecure, denied, and prompt permission states without prompting", async () => {
    const gateway = new BrowserVitalLensCameraGateway();
    vi.stubGlobal("isSecureContext", false);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn() } });
    await expect(gateway.checkCapability(new AbortController().signal)).resolves.toEqual({
      available: false,
      reason: "unsupported_device"
    });

    vi.stubGlobal("isSecureContext", true);
    const query = vi.fn(async () => ({ state: "denied" as PermissionState }));
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn() },
      permissions: { query }
    });
    await expect(gateway.checkCapability(new AbortController().signal)).resolves.toEqual({
      available: false,
      reason: "permission_denied"
    });

    query.mockResolvedValue({ state: "prompt" as PermissionState });
    await expect(gateway.checkCapability(new AbortController().signal)).resolves.toEqual({
      available: true,
      frontCamera: true,
      permissionState: "prompt"
    });
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });
});

describe("VitalLens browser camera session", () => {
  it("creates only bounded RGB24 payload bytes and clears camera state on stop", async () => {
    vi.useFakeTimers();
    const stop = vi.fn();
    const stream = {
      getTracks: () => [{ stop }],
      getVideoTracks: () => [
        {
          stop,
          getSettings: () => ({ facingMode: "user" })
        }
      ]
    } as unknown as MediaStream;
    const video = {
      muted: false,
      playsInline: false,
      srcObject: null,
      readyState: 2,
      videoWidth: 640,
      videoHeight: 480,
      play: vi.fn(async () => undefined),
      pause: vi.fn(),
      remove: vi.fn()
    } as unknown as HTMLVideoElement;
    const rgba = new Uint8ClampedArray(VITALLENS_FRAME_WIDTH * VITALLENS_FRAME_HEIGHT * 4);
    rgba.fill(64);
    const context = {
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: rgba.slice() })),
      clearRect: vi.fn()
    } as unknown as CanvasRenderingContext2D;
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context)
    } as unknown as HTMLCanvasElement;
    const windowEvents = new EventTarget();
    const documentEvents = new EventTarget();
    let visibilityState: DocumentVisibilityState = "visible";
    vi.stubGlobal("isSecureContext", true);
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn(async () => stream) },
      permissions: { query: vi.fn(async () => ({ state: "granted" as PermissionState })) }
    });
    vi.stubGlobal("window", windowEvents);
    vi.stubGlobal("document", {
      get visibilityState() {
        return visibilityState;
      },
      createElement: vi.fn((tag: string) => (tag === "video" ? video : canvas)),
      addEventListener: documentEvents.addEventListener.bind(documentEvents),
      removeEventListener: documentEvents.removeEventListener.bind(documentEvents)
    });

    const session = await new BrowserVitalLensCameraGateway().openFrontCamera(
      new AbortController().signal
    );
    const pending = session.createInferencePayload({
      maxDurationMs: 5_100,
      maxPayloadBytes: 5_000_000,
      signal: new AbortController().signal
    });
    await vi.runAllTimersAsync();
    const payload = await pending;

    const metadata = VitalLensPayloadMetadataSchema.parse(payload.metadata);
    expect(metadata).toMatchObject({
      contentType: "application/octet-stream",
      byteLength: 77 * 40 * 40 * 3,
      frameCount: 77,
      width: 40,
      height: 40,
      audioIncluded: false
    });
    expect(metadata.durationMs).toBeGreaterThanOrEqual(5_000);
    expect(metadata.durationMs).toBeLessThanOrEqual(5_100);
    expect(payload.bytes.byteLength).toBe(369_600);
    expect(context.drawImage).toHaveBeenCalledTimes(77);

    const interrupted = session.createInferencePayload({
      maxDurationMs: 5_100,
      maxPayloadBytes: 5_000_000,
      signal: new AbortController().signal
    });
    const interruption = expect(interrupted).rejects.toMatchObject({ code: "cancelled" });
    visibilityState = "hidden";
    documentEvents.dispatchEvent(new Event("visibilitychange"));
    await interruption;

    await session.stop();
    expect(payload.bytes.every((value) => value === 0)).toBe(true);
    expect(stop).toHaveBeenCalled();
    expect(video.srcObject).toBeNull();
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
  });
});
