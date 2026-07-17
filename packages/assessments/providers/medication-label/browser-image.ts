import { MedicationLabelImageMetadataSchema } from "@homerounds/contracts/medication";
import { z } from "zod";

import { MedicationImageError } from "./errors";
import {
  MEDICATION_LABEL_MAX_BYTES,
  MEDICATION_LABEL_MAX_DIMENSION,
  MEDICATION_LABEL_MEDIA_TYPES,
  MEDICATION_LABEL_MIN_DIMENSION,
  hasExpectedMedicationImageSignature
} from "./image-boundary";

const SupportedMediaTypeSchema = z.enum(MEDICATION_LABEL_MEDIA_TYPES);
const DecodedDimensionsSchema = z
  .object({
    width: z.number().int().positive(),
    height: z.number().int().positive()
  })
  .strict();

export type MedicationImageDecoder = Readonly<{
  createPreviewUrl(file: Blob): string;
  decodeDimensions(previewUrl: string, signal: AbortSignal): Promise<unknown>;
  revokePreviewUrl(previewUrl: string): void;
}>;

export type PreparedMedicationLabelImage = Readonly<{
  bytes: Uint8Array;
  metadata: z.infer<typeof MedicationLabelImageMetadataSchema>;
  previewUrl: string;
  clear(): void;
}>;

export type PrepareMedicationLabelImageInput = Readonly<{
  file: Blob;
  captureMode: "camera" | "file_upload";
  consentVersion: string;
  consentGrantedAt: string;
  requestId: string;
  signal: AbortSignal;
  decoder?: MedicationImageDecoder;
}>;

function abortError(): MedicationImageError {
  return new MedicationImageError("cancelled");
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError();
}

function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    const abort = (): void => {
      signal.removeEventListener("abort", abort);
      reject(abortError());
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

export class DefaultMedicationImageDecoder implements MedicationImageDecoder {
  createPreviewUrl(file: Blob): string {
    return URL.createObjectURL(file);
  }

  decodeDimensions(previewUrl: string, signal: AbortSignal): Promise<unknown> {
    if (signal.aborted) return Promise.reject(abortError());
    return new Promise((resolve, reject) => {
      const image = new Image();
      const cleanup = (): void => {
        signal.removeEventListener("abort", abort);
        image.onload = null;
        image.onerror = null;
      };
      const abort = (): void => {
        cleanup();
        image.src = "";
        reject(abortError());
      };
      image.onload = (): void => {
        const dimensions = { width: image.naturalWidth, height: image.naturalHeight };
        cleanup();
        resolve(dimensions);
      };
      image.onerror = (): void => {
        cleanup();
        reject(new MedicationImageError("malformed_image"));
      };
      signal.addEventListener("abort", abort, { once: true });
      image.src = previewUrl;
    });
  }

  revokePreviewUrl(previewUrl: string): void {
    URL.revokeObjectURL(previewUrl);
  }
}

const defaultDecoder = new DefaultMedicationImageDecoder();

export async function prepareMedicationLabelImage(
  input: PrepareMedicationLabelImageInput
): Promise<PreparedMedicationLabelImage> {
  const decoder = input.decoder ?? defaultDecoder;
  let bytes: Uint8Array | undefined;
  let previewUrl: string | undefined;
  let prepared = false;

  try {
    throwIfAborted(input.signal);
    const mediaType = SupportedMediaTypeSchema.safeParse(input.file.type);
    if (!mediaType.success) throw new MedicationImageError("unsupported_type");
    if (input.file.size <= 0) throw new MedicationImageError("malformed_image");
    if (input.file.size > MEDICATION_LABEL_MAX_BYTES) {
      throw new MedicationImageError("file_too_large");
    }

    const arrayBuffer = await abortable(input.file.arrayBuffer(), input.signal);
    bytes = new Uint8Array(arrayBuffer);
    throwIfAborted(input.signal);
    if (
      bytes.byteLength !== input.file.size ||
      !hasExpectedMedicationImageSignature(bytes, mediaType.data)
    ) {
      throw new MedicationImageError("malformed_image");
    }

    previewUrl = decoder.createPreviewUrl(input.file);
    const dimensions = DecodedDimensionsSchema.safeParse(
      await abortable(decoder.decodeDimensions(previewUrl, input.signal), input.signal)
    );
    if (!dimensions.success) throw new MedicationImageError("malformed_image");
    if (
      dimensions.data.width < MEDICATION_LABEL_MIN_DIMENSION ||
      dimensions.data.height < MEDICATION_LABEL_MIN_DIMENSION ||
      dimensions.data.width > MEDICATION_LABEL_MAX_DIMENSION ||
      dimensions.data.height > MEDICATION_LABEL_MAX_DIMENSION
    ) {
      throw new MedicationImageError("dimensions_out_of_bounds");
    }

    const metadata = MedicationLabelImageMetadataSchema.safeParse({
      requestId: input.requestId,
      captureMode: input.captureMode,
      mediaType: mediaType.data,
      byteLength: bytes.byteLength,
      width: dimensions.data.width,
      height: dimensions.data.height,
      consentVersion: input.consentVersion,
      consentGrantedAt: input.consentGrantedAt,
      syntheticDataOnly: true,
      rawMediaRef: null
    });
    if (!metadata.success) throw new MedicationImageError("malformed_image");

    let cleared = false;
    const ownedBytes = bytes;
    const ownedPreviewUrl = previewUrl;
    prepared = true;
    return {
      bytes: ownedBytes,
      metadata: metadata.data,
      previewUrl: ownedPreviewUrl,
      clear: () => {
        if (cleared) return;
        cleared = true;
        ownedBytes.fill(0);
        decoder.revokePreviewUrl(ownedPreviewUrl);
      }
    };
  } catch (error: unknown) {
    if (input.signal.aborted) throw abortError();
    if (error instanceof MedicationImageError) throw error;
    throw new MedicationImageError("malformed_image");
  } finally {
    if (!prepared) {
      bytes?.fill(0);
      if (previewUrl) decoder.revokePreviewUrl(previewUrl);
    }
  }
}
