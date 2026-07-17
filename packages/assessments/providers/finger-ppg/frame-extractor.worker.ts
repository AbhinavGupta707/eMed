import type { DerivedOpticalSample } from "./types";

interface ExtractionRequest {
  readonly id: number;
  readonly timestampMs: number;
  readonly bitmap: ImageBitmap;
}

interface ExtractionResponse {
  readonly id: number;
  readonly sample?: DerivedOpticalSample;
  readonly error?: "frame_extraction_failed";
}

interface WorkerScope {
  onmessage: ((event: MessageEvent<ExtractionRequest>) => void) | null;
  postMessage(message: ExtractionResponse): void;
}

const scope = self as unknown as WorkerScope;
const size = 48;
const canvas = new OffscreenCanvas(size, size);
const context = canvas.getContext("2d", { willReadFrequently: true });
let previousLuminance: Float32Array | null = null;

scope.onmessage = (event): void => {
  const { bitmap, id, timestampMs } = event.data;
  try {
    if (context === null) throw new Error("Canvas context unavailable");
    context.drawImage(bitmap, 0, 0, size, size);
    const pixels = context.getImageData(0, 0, size, size).data;
    const count = size * size;
    const luminance = new Float32Array(count);
    let red = 0;
    let green = 0;
    let blue = 0;
    let saturated = 0;
    let covered = 0;
    let motion = 0;
    for (let pixel = 0; pixel < count; pixel += 1) {
      const offset = pixel * 4;
      const r = pixels[offset] ?? 0;
      const g = pixels[offset + 1] ?? 0;
      const b = pixels[offset + 2] ?? 0;
      const intensity = (r + g + b) / 3;
      luminance[pixel] = intensity;
      red += r;
      green += g;
      blue += b;
      if (r >= 250 || g >= 250 || b >= 250) saturated += 1;
      if (r >= 60 && r > b * 1.1) covered += 1;
      if (previousLuminance !== null)
        motion += Math.abs(intensity - (previousLuminance[pixel] ?? intensity));
    }
    previousLuminance = luminance;
    const meanRed = red / count;
    const meanGreen = green / count;
    const meanBlue = blue / count;
    scope.postMessage({
      id,
      sample: {
        timestampMs,
        meanRed,
        meanGreen,
        meanBlue,
        meanIntensity: (meanRed + meanGreen + meanBlue) / 3,
        saturation: saturated / count,
        coverage: covered / count,
        motion: Math.min(1, motion / count / 255)
      }
    });
  } catch {
    scope.postMessage({ id, error: "frame_extraction_failed" });
  } finally {
    bitmap.close();
  }
};

export {};
