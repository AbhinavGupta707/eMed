import type { InferenceProviderErrorCode } from "@homerounds/contracts/inference";

export type MedicationImageErrorCode =
  | "cancelled"
  | "dimensions_out_of_bounds"
  | "file_too_large"
  | "malformed_image"
  | "unsupported_type";

/** Message-safe client validation error. It never includes a file name, URL, or label content. */
export class MedicationImageError extends Error {
  readonly code: MedicationImageErrorCode;

  constructor(code: MedicationImageErrorCode) {
    super(`Medication image validation failed: ${code}`);
    this.name = "MedicationImageError";
    this.code = code;
  }

  toJSON(): { name: string; code: MedicationImageErrorCode } {
    return { name: this.name, code: this.code };
  }
}

export type MedicationCameraErrorCode =
  "camera_failure" | "cancelled" | "permission_denied" | "unsupported_camera";

/** Message-safe camera error. It deliberately excludes browser/provider error messages. */
export class MedicationCameraError extends Error {
  readonly code: MedicationCameraErrorCode;

  constructor(code: MedicationCameraErrorCode) {
    super(`Medication camera access failed: ${code}`);
    this.name = "MedicationCameraError";
    this.code = code;
  }

  toJSON(): { name: string; code: MedicationCameraErrorCode } {
    return { name: this.name, code: this.code };
  }
}

/** A bounded error for injected transports. Raw provider errors must not cross this boundary. */
export class MedicationLabelTransportError extends Error {
  readonly code: InferenceProviderErrorCode;
  readonly retryAfterMs: number | null;

  constructor(code: InferenceProviderErrorCode, retryAfterMs: number | null = null) {
    super(`Medication label transport failed: ${code}`);
    this.name = "MedicationLabelTransportError";
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }

  toJSON(): {
    name: string;
    code: InferenceProviderErrorCode;
    retryAfterMs: number | null;
  } {
    return { name: this.name, code: this.code, retryAfterMs: this.retryAfterMs };
  }
}
