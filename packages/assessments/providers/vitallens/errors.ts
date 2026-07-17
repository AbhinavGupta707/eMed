export type VitalLensTransportErrorCode =
  "timeout" | "quota" | "provider_failure" | "network_failure" | "cancelled";

/** A deliberately message-safe error for the injected proxy transport boundary. */
export class VitalLensTransportError extends Error {
  readonly code: VitalLensTransportErrorCode;

  constructor(code: VitalLensTransportErrorCode) {
    super(`VitalLens proxy transport failed: ${code}`);
    this.name = "VitalLensTransportError";
    this.code = code;
  }

  toJSON(): { name: string; code: VitalLensTransportErrorCode } {
    return { name: this.name, code: this.code };
  }
}

export type VitalLensCameraErrorCode =
  "permission_denied" | "unsupported_device" | "cancelled" | "camera_failure";

/** A deliberately message-safe error for browser camera implementations. */
export class VitalLensCameraError extends Error {
  readonly code: VitalLensCameraErrorCode;

  constructor(code: VitalLensCameraErrorCode) {
    super(`VitalLens camera failed: ${code}`);
    this.name = "VitalLensCameraError";
    this.code = code;
  }

  toJSON(): { name: string; code: VitalLensCameraErrorCode } {
    return { name: this.name, code: this.code };
  }
}
