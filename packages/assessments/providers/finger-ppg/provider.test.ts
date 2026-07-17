import { describe, expect, it, vi } from "vitest";

import { syntheticDerivedSignal } from "./fixtures";
import { FingerPpgProvider } from "./provider";
import type {
  CameraSession,
  DerivedOpticalSample,
  FingerPpgDependencies,
  PageLifecycle
} from "./types";

const assessmentSessionId = "45906cff-34ea-4a86-a0c0-05967adb20c4";
const factId = "13369361-df18-4b88-9b0f-3632b896a57f";

interface FakeOptions {
  readonly samples?: readonly DerivedOpticalSample[];
  readonly permission?: "granted" | "prompt" | "denied" | "unknown";
  readonly torchAvailable?: boolean;
  readonly collect?: (signal: AbortSignal) => Promise<readonly DerivedOpticalSample[]>;
}

function createFakeDependencies(options: FakeOptions = {}): {
  dependencies: FingerPpgDependencies;
  open: ReturnType<typeof vi.fn>;
  sourceDispose: ReturnType<typeof vi.fn>;
  sessionDispose: ReturnType<typeof vi.fn>;
  setTorch: ReturnType<typeof vi.fn>;
  interrupt: () => void;
} {
  let interruption: (() => void) | null = null;
  const lifecycle: PageLifecycle = {
    onInterrupted(listener) {
      interruption = listener;
      return () => {
        interruption = null;
      };
    }
  };
  const sourceDispose = vi.fn(async () => undefined);
  const setTorch = vi.fn(async () => undefined);
  const sessionDispose = vi.fn(async () => {
    await sourceDispose();
  });
  const makeSession = (): CameraSession => ({
    source: {
      collect: ({ signal }) =>
        options.collect?.(signal) ?? Promise.resolve(options.samples ?? syntheticDerivedSignal()),
      dispose: sourceDispose
    },
    torch: { available: options.torchAvailable ?? true, setEnabled: setTorch },
    dispose: sessionDispose
  });
  const open = vi.fn(async () => makeSession());
  return {
    dependencies: {
      capabilities: {
        inspect: async () => ({ secureContext: true, mediaDevices: true, rearCamera: true })
      },
      permission: { query: async () => options.permission ?? "granted" },
      camera: { open },
      lifecycle,
      now: () => new Date("2026-07-17T09:00:00.000Z"),
      randomUuid: () => factId
    },
    open,
    sourceDispose,
    sessionDispose,
    setTorch,
    interrupt: () => interruption?.()
  };
}

describe("FingerPpgProvider", () => {
  it("normalizes a passing capture and exposes no raw media or samples", async () => {
    const fake = createFakeDependencies();
    const provider = new FingerPpgProvider(fake.dependencies);

    const result = await provider.capture({
      assessmentSessionId,
      signal: new AbortController().signal
    });

    expect(result.status).toBe("completed");
    if (result.status !== "completed") throw new Error("Expected completed result");
    expect(result.measurement.value).toBeCloseTo(72, 0);
    expect(result.measurement.rawMediaRef).toBeNull();
    expect(result.measurement.quality.status).toBe("pass");
    expect(result.measurement.quality.metrics.torchAvailable).toBe(1);
    expect(result.measurement).not.toHaveProperty("frames");
    expect(result.measurement).not.toHaveProperty("samples");
    expect(JSON.stringify(result)).not.toMatch(/data:image|base64|blob:/i);
    expect(fake.setTorch).toHaveBeenCalledWith(true);
    expect(fake.sessionDispose).toHaveBeenCalledOnce();
  });

  it("offers exactly one retry and then fails the same session", async () => {
    const fake = createFakeDependencies({ samples: syntheticDerivedSignal({ amplitude: 0.01 }) });
    const provider = new FingerPpgProvider(fake.dependencies);

    const first = await provider.capture({
      assessmentSessionId,
      signal: new AbortController().signal
    });
    const second = await provider.capture({
      assessmentSessionId,
      signal: new AbortController().signal
    });

    expect(first.status).toBe("retry");
    expect(second.status).toBe("failed");
    if (second.status === "failed") expect(second.quality.reasons).toContain("weak_signal");
    expect(fake.open).toHaveBeenCalledTimes(2);
  });

  it("continues safely when torch is absent", async () => {
    const fake = createFakeDependencies({ torchAvailable: false });
    const provider = new FingerPpgProvider(fake.dependencies);

    const result = await provider.capture({
      assessmentSessionId,
      signal: new AbortController().signal
    });

    expect(result.status).toBe("completed");
    if (result.status === "completed")
      expect(result.measurement.quality.metrics.torchAvailable).toBe(0);
    expect(fake.setTorch).not.toHaveBeenCalled();
  });

  it("returns typed unavailable without opening the camera after permission denial", async () => {
    const fake = createFakeDependencies({ permission: "denied" });
    const provider = new FingerPpgProvider(fake.dependencies);

    await expect(provider.checkAvailability()).resolves.toEqual({
      available: false,
      reason: "permission_denied"
    });
    await expect(
      provider.capture({ assessmentSessionId, signal: new AbortController().signal })
    ).resolves.toEqual({
      status: "unavailable",
      provider: "finger_ppg",
      reason: "permission_denied"
    });
    expect(fake.open).not.toHaveBeenCalled();
  });

  it("cancels on page lifecycle interruption and cleans up", async () => {
    const fake = createFakeDependencies({
      collect: (signal) =>
        new Promise((_, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("cancelled", "AbortError")),
            {
              once: true
            }
          );
        })
    });
    const provider = new FingerPpgProvider(fake.dependencies);
    const capture = provider.capture({ assessmentSessionId, signal: new AbortController().signal });
    await vi.waitFor(() => expect(fake.open).toHaveBeenCalledOnce());

    fake.interrupt();
    const result = await capture;

    expect(result.status).toBe("failed");
    if (result.status === "failed") expect(result.quality.reasons).toEqual(["cancelled"]);
    expect(fake.sessionDispose).toHaveBeenCalledOnce();
    expect(fake.sourceDispose).toHaveBeenCalledOnce();
  });

  it("honours the caller AbortSignal and cleans up", async () => {
    const fake = createFakeDependencies({
      collect: (signal) =>
        new Promise((_, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("cancelled", "AbortError")),
            {
              once: true
            }
          );
        })
    });
    const provider = new FingerPpgProvider(fake.dependencies);
    const controller = new AbortController();
    const capture = provider.capture({ assessmentSessionId, signal: controller.signal });
    await vi.waitFor(() => expect(fake.open).toHaveBeenCalledOnce());

    controller.abort();
    const result = await capture;

    expect(result.status).toBe("failed");
    if (result.status === "failed") expect(result.quality.reasons).toEqual(["cancelled"]);
    expect(fake.sessionDispose).toHaveBeenCalledOnce();
  });

  it("rejects insecure contexts before camera access", async () => {
    const fake = createFakeDependencies();
    const dependencies: FingerPpgDependencies = {
      ...fake.dependencies,
      capabilities: {
        inspect: async () => ({ secureContext: false, mediaDevices: true, rearCamera: true })
      }
    };
    const provider = new FingerPpgProvider(dependencies);

    await expect(provider.checkAvailability()).resolves.toEqual({
      available: false,
      reason: "unsupported_device"
    });
    expect(fake.open).not.toHaveBeenCalled();
  });

  it("aborts active work on dispose and makes repeated disposal safe", async () => {
    const fake = createFakeDependencies({
      collect: (signal) =>
        new Promise((_, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("cancelled", "AbortError")),
            {
              once: true
            }
          );
        })
    });
    const provider = new FingerPpgProvider(fake.dependencies);
    const capture = provider.capture({ assessmentSessionId, signal: new AbortController().signal });
    await vi.waitFor(() => expect(fake.open).toHaveBeenCalledOnce());

    await Promise.all([provider.dispose(), provider.dispose()]);
    await provider.dispose();

    const result = await capture;
    expect(result.status).toBe("failed");
    expect(fake.sessionDispose).toHaveBeenCalledOnce();
    await expect(
      provider.capture({ assessmentSessionId, signal: new AbortController().signal })
    ).resolves.toEqual({
      status: "unavailable",
      provider: "finger_ppg",
      reason: "provider_unavailable"
    });
  });

  it("rejects concurrent starts without disturbing the active capture", async () => {
    let release: (samples: readonly DerivedOpticalSample[]) => void = () => undefined;
    const fake = createFakeDependencies({
      collect: () =>
        new Promise((resolve) => {
          release = resolve;
        })
    });
    const provider = new FingerPpgProvider(fake.dependencies);
    const first = provider.capture({ assessmentSessionId, signal: new AbortController().signal });
    await vi.waitFor(() => expect(fake.open).toHaveBeenCalledOnce());

    const second = await provider.capture({
      assessmentSessionId,
      signal: new AbortController().signal
    });
    expect(second.status).toBe("failed");
    if (second.status === "failed") expect(second.quality.metrics.captureAlreadyActive).toBe(1);
    release(syntheticDerivedSignal());
    await expect(first).resolves.toMatchObject({ status: "completed" });
  });

  it("cleans up when capture quality fails terminally", async () => {
    const fake = createFakeDependencies({ samples: syntheticDerivedSignal({ bpm: 235 }) });
    const provider = new FingerPpgProvider(fake.dependencies);

    const result = await provider.capture({
      assessmentSessionId,
      signal: new AbortController().signal
    });

    expect(result.status).toBe("failed");
    expect(fake.sessionDispose).toHaveBeenCalledOnce();
  });
});
