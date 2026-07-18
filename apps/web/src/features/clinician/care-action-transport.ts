import {
  CareActionMutationReceiptSchema,
  ClinicianCareActionMutationSchema,
  SyntheticCareActionSchema,
  type CareActionMutationReceipt,
  type ClinicianCareActionMutationKind,
  type SyntheticCareAction
} from "@homerounds/actions/care-schemas";
import { ApiErrorEnvelopeSchema, ApiSuccessEnvelopeSchema } from "@homerounds/api-client";
import { z } from "zod";

const CareActionListDataSchema = z
  .object({ actions: z.array(SyntheticCareActionSchema).max(20) })
  .strict();

export type CareActionTransportErrorCode =
  "offline" | "stale" | "conflict" | "unavailable" | "invalid_response" | "unknown";

export class CareActionTransportError extends Error {
  constructor(
    readonly code: CareActionTransportErrorCode,
    message: string
  ) {
    super(message);
    this.name = "CareActionTransportError";
  }
}

export type ClinicianCareActionTransport = {
  listRound(roundId: string): Promise<SyntheticCareAction[]>;
  mutate(input: {
    roundId: string;
    actionId: string;
    mutation: z.infer<typeof ClinicianCareActionMutationSchema>;
    expectedVersion: number;
    operationKey: string;
  }): Promise<CareActionMutationReceipt>;
};

function operationScope(kind: ClinicianCareActionMutationKind): string {
  return `clinician-${kind}`;
}

async function readEnvelope<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  const value: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = ApiErrorEnvelopeSchema.safeParse(value);
    const code = error.success ? error.data.error.code : null;
    if (code === "stale_state") {
      throw new CareActionTransportError("stale", "The care action changed after it was loaded.");
    }
    if (code === "conflict") {
      throw new CareActionTransportError(
        "conflict",
        "The care action update conflicts with its current state."
      );
    }
    if (code === "unavailable" || code === "rate_limited") {
      throw new CareActionTransportError("unavailable", "Care action persistence is unavailable.");
    }
    throw new CareActionTransportError("unknown", "The care action request was rejected.");
  }
  const parsed = ApiSuccessEnvelopeSchema(schema).safeParse(value);
  if (!parsed.success) {
    throw new CareActionTransportError(
      "invalid_response",
      "The care action response could not be verified."
    );
  }
  return parsed.data.data;
}

export function createBrowserCareActionTransport(
  fetcher: typeof fetch = fetch
): ClinicianCareActionTransport {
  const request = async (path: string, init?: RequestInit) => {
    try {
      const headers = new Headers(init?.headers);
      headers.set("x-homerounds-demo-role", "clinician");
      return await fetcher(path, { ...init, headers });
    } catch (error: unknown) {
      if (globalThis.navigator?.onLine === false) {
        throw new CareActionTransportError("offline", "The browser reports that it is offline.");
      }
      if (error instanceof CareActionTransportError) throw error;
      throw new CareActionTransportError("unknown", "The care action request failed.");
    }
  };
  return {
    async listRound(roundId) {
      const response = await request(`/api/rounds/${encodeURIComponent(roundId)}/actions/care`);
      return (await readEnvelope(response, CareActionListDataSchema)).actions;
    },
    async mutate(input) {
      const response = await request(
        `/api/rounds/${encodeURIComponent(input.roundId)}/actions/care/${encodeURIComponent(input.actionId)}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-correlation-id": `${operationScope(input.mutation.kind)}-${input.actionId}`
          },
          body: JSON.stringify({
            mutation: input.mutation,
            expectedVersion: input.expectedVersion,
            operationKey: input.operationKey
          })
        }
      );
      return readEnvelope(response, CareActionMutationReceiptSchema);
    }
  };
}

export function createEmptyCareActionTransport(): ClinicianCareActionTransport {
  return {
    listRound: async () => [],
    mutate: async () => {
      throw new CareActionTransportError(
        "unavailable",
        "No synthetic care action transport was supplied."
      );
    }
  };
}
