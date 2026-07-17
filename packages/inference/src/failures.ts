import {
  InferenceProviderFailureSchema,
  type InferenceProviderErrorCode,
  type InferenceProviderFailure
} from "@homerounds/contracts/inference";

export function inferenceFailure(
  code: InferenceProviderErrorCode,
  retryable: boolean,
  retryAfterMs: number | null = null
): InferenceProviderFailure {
  return InferenceProviderFailureSchema.parse({ code, retryable, retryAfterMs });
}
