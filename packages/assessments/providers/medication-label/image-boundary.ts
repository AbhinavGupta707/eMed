import {
  MedicationLabelImageMetadataSchema,
  type MedicationLabelImageMetadata
} from "@homerounds/contracts/medication";

// A 3 MB binary image expands to roughly 4 MB as JSON base64. This leaves a
// deliberate envelope below Vercel's 4.5 MB Function request-body limit.
export const MEDICATION_LABEL_MAX_BYTES = 3_000_000;
export const MEDICATION_LABEL_MIN_DIMENSION = 320;
export const MEDICATION_LABEL_MAX_DIMENSION = 8_192;
export const MEDICATION_LABEL_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

function hasBytes(bytes: Uint8Array, expected: readonly number[], offset = 0): boolean {
  if (bytes.byteLength < offset + expected.length) return false;
  return expected.every((value, index) => bytes[offset + index] === value);
}

export function hasExpectedMedicationImageSignature(
  bytes: Uint8Array,
  mediaType: MedicationLabelImageMetadata["mediaType"]
): boolean {
  switch (mediaType) {
    case "image/jpeg":
      return hasBytes(bytes, [0xff, 0xd8, 0xff]);
    case "image/png":
      return hasBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/webp":
      return (
        hasBytes(bytes, [0x52, 0x49, 0x46, 0x46]) && hasBytes(bytes, [0x57, 0x45, 0x42, 0x50], 8)
      );
  }
}

export function validateMedicationImageBoundary(input: {
  metadata: unknown;
  bytes: Uint8Array;
}): MedicationLabelImageMetadata | null {
  const metadata = MedicationLabelImageMetadataSchema.safeParse(input.metadata);
  if (!metadata.success) return null;
  if (metadata.data.byteLength !== input.bytes.byteLength) return null;
  if (!hasExpectedMedicationImageSignature(input.bytes, metadata.data.mediaType)) return null;
  return metadata.data;
}
