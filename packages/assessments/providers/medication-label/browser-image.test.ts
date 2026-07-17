import { describe, expect, it, vi } from "vitest";

import { prepareMedicationLabelImage, type MedicationImageDecoder } from "./browser-image";
import { MedicationImageError } from "./errors";

const REQUEST_ID = "7fd16467-bfa6-4277-94b5-3673b34a6c4d";
const CONSENT_AT = "2026-07-17T09:00:00.000Z";

function imageBlob(type: "image/jpeg" | "image/png" | "image/webp" = "image/png"): Blob {
  const bytes =
    type === "image/jpeg"
      ? [0xff, 0xd8, 0xff, 1]
      : type === "image/webp"
        ? [0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]
        : [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4];
  return new Blob([new Uint8Array(bytes)], { type });
}

function decoder(dimensions: unknown = { width: 1_280, height: 720 }) {
  const instance: MedicationImageDecoder = {
    createPreviewUrl: vi.fn(() => "blob:ephemeral-medication-preview"),
    decodeDimensions: vi.fn(async () => dimensions),
    revokePreviewUrl: vi.fn()
  };
  return instance;
}

function prepareInput(
  file: Blob,
  imageDecoder: MedicationImageDecoder,
  signal = new AbortController().signal
) {
  return {
    file,
    captureMode: "file_upload" as const,
    consentVersion: "synthetic-demo-v1",
    consentGrantedAt: CONSENT_AT,
    requestId: REQUEST_ID,
    signal,
    decoder: imageDecoder
  };
}

describe("medication image preparation", () => {
  it.each(["image/jpeg", "image/png", "image/webp"] as const)(
    "accepts %s and returns an explicitly clearable ephemeral handle",
    async (mediaType) => {
      const imageDecoder = decoder();
      const prepared = await prepareMedicationLabelImage(
        prepareInput(imageBlob(mediaType), imageDecoder)
      );

      expect(prepared.metadata).toEqual(
        expect.objectContaining({
          mediaType,
          width: 1_280,
          height: 720,
          syntheticDataOnly: true,
          rawMediaRef: null
        })
      );
      expect(prepared.previewUrl).toBe("blob:ephemeral-medication-preview");
      expect([...prepared.bytes].some((value) => value !== 0)).toBe(true);

      prepared.clear();
      prepared.clear();
      expect([...prepared.bytes]).toEqual(new Array(prepared.bytes.byteLength).fill(0));
      expect(imageDecoder.revokePreviewUrl).toHaveBeenCalledTimes(1);
    }
  );

  it("rejects unsupported formats before creating a preview", async () => {
    const imageDecoder = decoder();

    await expect(
      prepareMedicationLabelImage(
        prepareInput(new Blob([new Uint8Array([1, 2, 3])], { type: "image/gif" }), imageDecoder)
      )
    ).rejects.toMatchObject({ code: "unsupported_type" });
    expect(imageDecoder.createPreviewUrl).not.toHaveBeenCalled();
  });

  it("rejects files over five megabytes before decoding", async () => {
    const imageDecoder = decoder();
    const oversized = new Blob([new Uint8Array(5_000_001)], { type: "image/png" });

    await expect(
      prepareMedicationLabelImage(prepareInput(oversized, imageDecoder))
    ).rejects.toMatchObject({ code: "file_too_large" });
    expect(imageDecoder.decodeDimensions).not.toHaveBeenCalled();
  });

  it("rejects MIME/signature mismatches as malformed", async () => {
    const imageDecoder = decoder();
    const mismatched = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 1])], {
      type: "image/png"
    });

    await expect(
      prepareMedicationLabelImage(prepareInput(mismatched, imageDecoder))
    ).rejects.toMatchObject({ code: "malformed_image" });
    expect(imageDecoder.createPreviewUrl).not.toHaveBeenCalled();
  });

  it.each([
    [319, 720],
    [1_280, 319],
    [8_193, 720],
    [1_280, 8_193]
  ])("rejects dimensions %d x %d and revokes the preview", async (width, height) => {
    const imageDecoder = decoder({ width, height });

    await expect(
      prepareMedicationLabelImage(prepareInput(imageBlob(), imageDecoder))
    ).rejects.toMatchObject({ code: "dimensions_out_of_bounds" });
    expect(imageDecoder.revokePreviewUrl).toHaveBeenCalledWith("blob:ephemeral-medication-preview");
  });

  it("maps malformed decoder results and revokes the preview", async () => {
    const imageDecoder = decoder({ width: "unknown", height: 720 });

    await expect(
      prepareMedicationLabelImage(prepareInput(imageBlob(), imageDecoder))
    ).rejects.toMatchObject({ code: "malformed_image" });
    expect(imageDecoder.revokePreviewUrl).toHaveBeenCalledTimes(1);
  });

  it("cancels dimension decoding and revokes the preview", async () => {
    const controller = new AbortController();
    const imageDecoder = decoder();
    vi.mocked(imageDecoder.decodeDimensions).mockImplementation(() => new Promise(() => undefined));
    const pending = prepareMedicationLabelImage(
      prepareInput(imageBlob(), imageDecoder, controller.signal)
    );

    await vi.waitFor(() => expect(imageDecoder.decodeDimensions).toHaveBeenCalled());
    controller.abort();

    await expect(pending).rejects.toBeInstanceOf(MedicationImageError);
    await expect(pending).rejects.toMatchObject({ code: "cancelled" });
    expect(imageDecoder.revokePreviewUrl).toHaveBeenCalledTimes(1);
  });
});
