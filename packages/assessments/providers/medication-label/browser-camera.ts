import { MedicationCameraError } from "./errors";

export type MedicationCameraGateway = Readonly<{
  requestAccess(signal: AbortSignal): Promise<void>;
}>;

function mapCameraError(error: unknown, signal: AbortSignal): MedicationCameraError {
  if (signal.aborted) return new MedicationCameraError("cancelled");
  if (error instanceof DOMException) {
    switch (error.name) {
      case "AbortError":
        return new MedicationCameraError("cancelled");
      case "NotAllowedError":
      case "SecurityError":
        return new MedicationCameraError("permission_denied");
      case "NotFoundError":
      case "NotReadableError":
      case "NotSupportedError":
      case "OverconstrainedError":
        return new MedicationCameraError("unsupported_camera");
    }
  }
  return new MedicationCameraError("camera_failure");
}

function stopStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      // Continue stopping every track; raw frames are never read from this permission probe.
    }
  }
}

function abortableStream(
  operation: Promise<MediaStream>,
  signal: AbortSignal
): Promise<MediaStream> {
  const guardedOperation = operation.then((stream) => {
    if (signal.aborted) {
      stopStream(stream);
      throw new MedicationCameraError("cancelled");
    }
    return stream;
  });
  if (signal.aborted) return Promise.reject(new MedicationCameraError("cancelled"));
  return new Promise((resolve, reject) => {
    const abort = (): void => {
      signal.removeEventListener("abort", abort);
      reject(new MedicationCameraError("cancelled"));
    };
    signal.addEventListener("abort", abort, { once: true });
    guardedOperation.then(
      (stream) => {
        signal.removeEventListener("abort", abort);
        resolve(stream);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      }
    );
  });
}

export class DefaultMedicationCameraGateway implements MedicationCameraGateway {
  async requestAccess(signal: AbortSignal): Promise<void> {
    if (
      typeof navigator === "undefined" ||
      navigator.mediaDevices === undefined ||
      typeof navigator.mediaDevices.getUserMedia !== "function"
    ) {
      throw new MedicationCameraError("unsupported_camera");
    }

    let stream: MediaStream | undefined;
    try {
      stream = await abortableStream(
        navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" } }
        }),
        signal
      );
    } catch (error: unknown) {
      if (error instanceof MedicationCameraError) throw error;
      throw mapCameraError(error, signal);
    } finally {
      if (stream) stopStream(stream);
    }
  }
}
