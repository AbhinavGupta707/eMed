import { deflateSync } from "node:zlib";

import { TransportMedicationLabelProvider } from "@homerounds/assessments";
import {
  createRuntimeFireworksDependencies,
  FireworksChatCompletionsTransport
} from "@homerounds/inference";
import { expect, it } from "vitest";

import { StructuredMedicationLabelTransport } from "./medication";

const apiKey = process.env.FIREWORKS_API_KEY;
const liveEnabled = process.env.RUN_LIVE_FIREWORKS_VISION_TESTS === "true" && Boolean(apiKey);
const liveIt = liveEnabled ? it : it.skip;
const WIDTH = 320;
const HEIGHT = 320;

const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  G: ["01111", "10000", "10000", "10111", "10001", "10001", "01110"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"]
};

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.byteLength);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function syntheticMedicationLabelPng(): Uint8Array {
  const stride = 1 + WIDTH * 3;
  const pixels = Buffer.alloc(stride * HEIGHT, 255);
  for (let y = 0; y < HEIGHT; y += 1) pixels[y * stride] = 0;

  const setBlack = (x: number, y: number): void => {
    if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return;
    const offset = y * stride + 1 + x * 3;
    pixels[offset] = 0;
    pixels[offset + 1] = 0;
    pixels[offset + 2] = 0;
  };
  const drawText = (text: string, x: number, y: number, scale: number): void => {
    let cursor = x;
    for (const character of text) {
      const glyph = GLYPHS[character];
      if (glyph) {
        glyph.forEach((row, rowIndex) => {
          [...row].forEach((pixel, columnIndex) => {
            if (pixel !== "1") return;
            for (let dy = 0; dy < scale; dy += 1) {
              for (let dx = 0; dx < scale; dx += 1) {
                setBlack(cursor + columnIndex * scale + dx, y + rowIndex * scale + dy);
              }
            }
          });
        });
      }
      cursor += 6 * scale;
    }
  };

  drawText("SYNTHETIC", 25, 45, 5);
  drawText("TABLETS", 55, 115, 5);
  drawText("10 MG", 85, 195, 5);

  const header = Buffer.alloc(13);
  header.writeUInt32BE(WIDTH, 0);
  header.writeUInt32BE(HEIGHT, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(pixels)),
    pngChunk("IEND", new Uint8Array())
  ]);
}

liveIt(
  "passes three consecutive exact-contract Kimi medication-label vision extractions",
  async () => {
    const runtimeDependencies = createRuntimeFireworksDependencies();
    const redactedResponses: Array<{
      status: number;
      finishReason: string | null;
      choiceCount: number | null;
      contentLength: number | null;
      observationCount: number | null;
      duplicateFields: boolean | null;
      incompatibleStatusValuePairs: number | null;
      unexpectedTopLevelKeys: string[];
    }> = [];
    const provider = new TransportMedicationLabelProvider(
      new StructuredMedicationLabelTransport(
        new FireworksChatCompletionsTransport({
          apiKey,
          dependencies: {
            ...runtimeDependencies,
            fetch: async (input, init) => {
              const response = await runtimeDependencies.fetch(input, init);
              let finishReason: string | null = null;
              let choiceCount: number | null = null;
              let contentLength: number | null = null;
              let observationCount: number | null = null;
              let duplicateFields: boolean | null = null;
              let incompatibleStatusValuePairs: number | null = null;
              let unexpectedTopLevelKeys: string[] = [];
              try {
                const payload = (await response.clone().json()) as {
                  choices?: Array<{ finish_reason?: unknown; message?: { content?: unknown } }>;
                };
                choiceCount = Array.isArray(payload.choices) ? payload.choices.length : null;
                const choice = payload.choices?.[0];
                finishReason =
                  typeof choice?.finish_reason === "string" ? choice.finish_reason : null;
                contentLength =
                  typeof choice?.message?.content === "string"
                    ? choice.message.content.length
                    : null;
                if (typeof choice?.message?.content === "string") {
                  const draft = JSON.parse(choice.message.content) as {
                    observations?: Array<{ field?: unknown; status?: unknown; value?: unknown }>;
                  } & Record<string, unknown>;
                  unexpectedTopLevelKeys = Object.keys(draft).filter(
                    (key) => key !== "observations" && key !== "missingInformation"
                  );
                  if (Array.isArray(draft.observations)) {
                    observationCount = draft.observations.length;
                    const fields = draft.observations
                      .map(({ field }) => field)
                      .filter((field): field is string => typeof field === "string");
                    duplicateFields = new Set(fields).size !== fields.length;
                    incompatibleStatusValuePairs = draft.observations.filter(
                      ({ status, value }) =>
                        (status === "missing" && value !== null) ||
                        (status !== "missing" && typeof value !== "string")
                    ).length;
                  }
                }
              } catch {
                // The transport still returns a typed failure when metadata is unreadable.
              }
              redactedResponses.push({
                status: response.status,
                finishReason,
                choiceCount,
                contentLength,
                observationCount,
                duplicateFields,
                incompatibleStatusValuePairs,
                unexpectedTopLevelKeys
              });
              return response;
            }
          },
          policy: { timeoutMs: 60_000, maxAttempts: 1 }
        }),
        () => globalThis.crypto.randomUUID()
      )
    );

    for (let run = 0; run < 3; run += 1) {
      const bytes = syntheticMedicationLabelPng();
      const outcome = await provider.extract({
        roundId: "cc80d269-2f79-4328-a129-98cac85219e4",
        stateVersion: 2,
        metadata: {
          requestId: globalThis.crypto.randomUUID(),
          captureMode: "file_upload",
          mediaType: "image/png",
          byteLength: bytes.byteLength,
          width: WIDTH,
          height: HEIGHT,
          consentVersion: "homerounds-synthetic-vision-live-v1",
          consentGrantedAt: new Date().toISOString(),
          syntheticDataOnly: true,
          rawMediaRef: null
        },
        bytes,
        signal: new AbortController().signal
      });

      expect(
        outcome,
        `redacted Kimi result: ${JSON.stringify({ outcome, redactedResponses })}`
      ).toMatchObject({
        status: "proposed",
        proposal: {
          roundId: "cc80d269-2f79-4328-a129-98cac85219e4",
          stateVersion: 2,
          provenance: {
            provider: "fireworks",
            task: "medication_label_extraction",
            modelAlias: "kimi-k2p6-vision-none",
            contractVersion: "medication-label.v1"
          },
          rawMediaRef: null
        }
      });
      expect(bytes.every((byte) => byte === 0)).toBe(true);
      expect(JSON.stringify(outcome)).not.toMatch(
        /data:image|base64|raw provider|hidden reasoning/i
      );
    }
  },
  210_000
);
