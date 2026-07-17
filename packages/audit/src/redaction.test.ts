import { describe, expect, it } from "vitest";

import { redactLogFields, safeLogEntry } from "./redaction";

describe("structured log redaction", () => {
  it("removes secrets, sensitive headers, transcripts, notes, audio and frames recursively", () => {
    const redacted = redactLogFields({
      status: "provider_unavailable",
      authorization: "Bearer private-value",
      nested: {
        apiKey: "private-key",
        transcript: "unbounded patient speech",
        note: "free text",
        rawFrames: [1, 2, 3],
        safeCode: "quota"
      },
      audio: new Uint8Array([1, 2, 3])
    });

    expect(redacted).toEqual({
      status: "provider_unavailable",
      authorization: "[REDACTED]",
      nested: {
        apiKey: "[REDACTED]",
        transcript: "[REDACTED]",
        note: "[REDACTED]",
        rawFrames: "[REDACTED]",
        safeCode: "quota"
      },
      audio: "[REDACTED]"
    });
    expect(JSON.stringify(redacted)).not.toContain("private-value");
    expect(JSON.stringify(redacted)).not.toContain("patient speech");
  });

  it("bounds circular and oversized values without throwing", () => {
    const circular: { self?: unknown; message: string } = { message: "x".repeat(500) };
    circular.self = circular;
    const entry = safeLogEntry({
      level: "error",
      event: "provider_request_failed",
      correlationId: "correlation-1",
      fields: circular
    });

    expect(entry.fields.self).toBe("[CIRCULAR]");
    expect(String(entry.fields.message).length).toBeLessThan(500);
  });
});
