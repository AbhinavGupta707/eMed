import { z } from "zod";

const REDACTED = "[REDACTED]";
const MAX_DEPTH = 6;
const MAX_KEYS = 100;
const MAX_ARRAY = 50;
const MAX_STRING = 240;

const sensitiveKeyPattern =
  /(api[-_]?key|authorization|cookie|secret|token|password|transcript|free[-_]?text|note|audio|frame|video|image|bytes|raw[-_]?media|payload|header|database[-_]?url|patient[-_]?name)/i;

function redact(value: unknown, key: string, depth: number, seen: WeakSet<object>): unknown {
  if (sensitiveKeyPattern.test(key)) return REDACTED;
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") {
    return value.length <= MAX_STRING ? value : `${value.slice(0, MAX_STRING)}…`;
  }
  if (typeof value !== "object") return "[UNSERIALIZABLE]";
  if (depth >= MAX_DEPTH) return "[DEPTH_LIMIT]";
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY).map((entry) => redact(entry, "arrayEntry", depth + 1, seen));
  }

  const output: Record<string, unknown> = {};
  for (const [entryKey, entryValue] of Object.entries(value).slice(0, MAX_KEYS)) {
    output[entryKey] = redact(entryValue, entryKey, depth + 1, seen);
  }
  return output;
}

export function redactLogFields(fields: unknown): Readonly<Record<string, unknown>> {
  if (typeof fields !== "object" || fields === null || Array.isArray(fields)) return {};
  return z.record(z.string(), z.unknown()).parse(redact(fields, "fields", 0, new WeakSet()));
}

export const StructuredLogEntrySchema = z
  .object({
    level: z.enum(["info", "warn", "error"]),
    event: z.string().min(1).max(120),
    correlationId: z.string().min(1).max(120),
    fields: z.record(z.string(), z.unknown())
  })
  .strict();

export type StructuredLogEntry = z.infer<typeof StructuredLogEntrySchema>;

export type SafeStructuredLogger = {
  write(entry: StructuredLogEntry): void;
};

export function safeLogEntry(input: {
  level: StructuredLogEntry["level"];
  event: string;
  correlationId: string;
  fields?: unknown;
}): StructuredLogEntry {
  return StructuredLogEntrySchema.parse({
    level: input.level,
    event: input.event,
    correlationId: input.correlationId,
    fields: redactLogFields(input.fields ?? {})
  });
}

export const noOpLogger: SafeStructuredLogger = { write: () => undefined };
