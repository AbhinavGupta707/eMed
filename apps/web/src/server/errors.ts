import { ApiErrorCodeSchema } from "@homerounds/api-client";
import { z } from "zod";

export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

export class ApiFault extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    readonly userMessageKey: string,
    readonly issues: readonly string[] = [],
    readonly retryAfterSeconds: number | null = null
  ) {
    super(`API request failed: ${code}`);
    this.name = "ApiFault";
  }
}

const ApiFaultShapeSchema = z
  .object({
    name: z.literal("ApiFault"),
    status: z.number().int().min(400).max(599),
    code: ApiErrorCodeSchema,
    userMessageKey: z.string().min(1).max(120),
    issues: z.array(z.string().max(240)).max(20),
    retryAfterSeconds: z.number().int().positive().nullable()
  })
  .passthrough();

export function isApiFault(error: unknown): error is ApiFault {
  return error instanceof ApiFault || ApiFaultShapeSchema.safeParse(error).success;
}
