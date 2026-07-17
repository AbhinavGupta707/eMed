import type { ApiErrorCodeSchema } from "@homerounds/api-client";
import type { z } from "zod";

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
