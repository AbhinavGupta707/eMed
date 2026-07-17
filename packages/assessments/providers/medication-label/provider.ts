import {
  MedicationLabelObservationSchema,
  MedicationLabelProposalSchema,
  type MedicationLabelProposal
} from "@homerounds/contracts/medication";
import {
  InferenceProviderFailureSchema,
  type InferenceProviderErrorCode,
  type InferenceProviderFailure
} from "@homerounds/contracts/inference";
import { z } from "zod";

import { MedicationLabelTransportError } from "./errors";
import { validateMedicationImageBoundary } from "./image-boundary";
import {
  MedicationLabelExtractionOutcomeSchema,
  MedicationLabelExtractionRequestSchema,
  type FakeMedicationLabelFixture,
  type MedicationLabelExtractionInput,
  type MedicationLabelExtractionOutcome,
  type MedicationLabelExtractionTransport,
  type MedicationLabelProvider,
  type MedicationLabelProviderAvailability,
  type ValidatedMedicationLabelExtractionRequest
} from "./types";

const RetryableProviderCodes = new Set<InferenceProviderErrorCode>([
  "timeout",
  "rate_limited",
  "provider_unavailable"
]);

const FakeFixtureSchema = z
  .object({
    observations: z.array(MedicationLabelObservationSchema).min(1).max(7),
    missingInformation: z.array(z.string().trim().min(1).max(120)).max(7)
  })
  .strict()
  .superRefine((fixture, context) => {
    const fields = fixture.observations.map(({ field }) => field);
    if (new Set(fields).size !== fields.length) {
      context.addIssue({
        code: "custom",
        path: ["observations"],
        message: "fake medication observation fields must be unique"
      });
    }
  });

function createDefaultId(): string {
  return globalThis.crypto.randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

function failure(
  code: InferenceProviderErrorCode,
  retryAfterMs: number | null = null
): InferenceProviderFailure {
  return InferenceProviderFailureSchema.parse({
    code,
    retryable: RetryableProviderCodes.has(code),
    retryAfterMs: code === "rate_limited" ? retryAfterMs : null
  });
}

function failed(
  code: InferenceProviderErrorCode,
  retryAfterMs: number | null = null
): MedicationLabelExtractionOutcome {
  return MedicationLabelExtractionOutcomeSchema.parse({
    status: "failed",
    failure: failure(code, retryAfterMs)
  });
}

function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new MedicationLabelTransportError("cancelled"));
  return new Promise<T>((resolve, reject) => {
    const abort = (): void => {
      signal.removeEventListener("abort", abort);
      reject(new MedicationLabelTransportError("cancelled"));
    };
    signal.addEventListener("abort", abort, { once: true });
    operation.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      }
    );
  });
}

function validateInput(
  input: MedicationLabelExtractionInput
): ValidatedMedicationLabelExtractionRequest | null {
  if (!(input.bytes instanceof Uint8Array)) return null;
  const request = MedicationLabelExtractionRequestSchema.safeParse({
    roundId: input.roundId,
    stateVersion: input.stateVersion,
    metadata: input.metadata
  });
  if (!request.success) return null;
  const metadata = validateMedicationImageBoundary({
    metadata: request.data.metadata,
    bytes: input.bytes
  });
  if (!metadata) return null;
  return { ...request.data, metadata, bytes: input.bytes, signal: input.signal };
}

function normalizeProposal(
  rawProposal: unknown,
  input: ValidatedMedicationLabelExtractionRequest,
  expectedProvider: "fake" | "fireworks"
): MedicationLabelProposal | null {
  const proposal = MedicationLabelProposalSchema.safeParse(rawProposal);
  if (!proposal.success) return null;
  if (
    proposal.data.roundId !== input.roundId ||
    proposal.data.stateVersion !== input.stateVersion ||
    proposal.data.provenance.provider !== expectedProvider
  ) {
    return null;
  }
  return proposal.data;
}

abstract class BaseMedicationLabelProvider implements MedicationLabelProvider {
  abstract readonly kind: "disabled" | "fake" | "fireworks";

  abstract checkAvailability(signal?: AbortSignal): Promise<MedicationLabelProviderAvailability>;

  async extract(input: MedicationLabelExtractionInput): Promise<MedicationLabelExtractionOutcome> {
    try {
      if (input.signal.aborted) return failed("cancelled");
      const request = validateInput(input);
      if (!request) return failed("contract_rejected");
      return await this.extractValidated(request);
    } finally {
      input.bytes.fill(0);
    }
  }

  protected abstract extractValidated(
    input: ValidatedMedicationLabelExtractionRequest
  ): Promise<MedicationLabelExtractionOutcome>;
}

export class DisabledMedicationLabelProvider extends BaseMedicationLabelProvider {
  readonly kind = "disabled" as const;
  readonly #failure: InferenceProviderFailure;

  constructor(code: "missing_configuration" | "provider_unavailable" = "missing_configuration") {
    super();
    this.#failure = failure(code);
  }

  checkAvailability(signal?: AbortSignal): Promise<MedicationLabelProviderAvailability> {
    return Promise.resolve(
      signal?.aborted
        ? { available: false, failure: failure("cancelled") }
        : { available: false, failure: this.#failure }
    );
  }

  protected extractValidated(): Promise<MedicationLabelExtractionOutcome> {
    return Promise.resolve(
      MedicationLabelExtractionOutcomeSchema.parse({ status: "failed", failure: this.#failure })
    );
  }
}

export class FakeMedicationLabelProvider extends BaseMedicationLabelProvider {
  readonly kind = "fake" as const;
  readonly #fixture: z.infer<typeof FakeFixtureSchema>;
  readonly #createId: () => string;
  readonly #now: () => string;

  constructor(
    fixture: FakeMedicationLabelFixture,
    dependencies: Readonly<{ createId?: () => string; now?: () => string }> = {}
  ) {
    super();
    this.#fixture = FakeFixtureSchema.parse(fixture);
    this.#createId = dependencies.createId ?? createDefaultId;
    this.#now = dependencies.now ?? nowIso;
  }

  checkAvailability(signal?: AbortSignal): Promise<MedicationLabelProviderAvailability> {
    return Promise.resolve(
      signal?.aborted ? { available: false, failure: failure("cancelled") } : { available: true }
    );
  }

  protected extractValidated(
    input: ValidatedMedicationLabelExtractionRequest
  ): Promise<MedicationLabelExtractionOutcome> {
    if (input.signal.aborted) return Promise.resolve(failed("cancelled"));
    const attemptedAt = this.#now();
    const proposal = MedicationLabelProposalSchema.safeParse({
      contractVersion: "medication-label.v1",
      proposalId: this.#createId(),
      roundId: input.roundId,
      stateVersion: input.stateVersion,
      observations: this.#fixture.observations,
      missingInformation: this.#fixture.missingInformation,
      provenance: {
        attemptId: this.#createId(),
        provider: "fake",
        task: "medication_label_extraction",
        modelAlias: "synthetic.medication-label.fixture",
        contractVersion: "medication-label.v1",
        attemptedAt,
        durationMs: 0,
        tokenUsage: null
      },
      rawMediaRef: null
    });
    if (!proposal.success) return Promise.resolve(failed("contract_rejected"));
    return Promise.resolve(
      MedicationLabelExtractionOutcomeSchema.parse({
        status: "proposed",
        proposal: proposal.data
      })
    );
  }
}

export class TransportMedicationLabelProvider extends BaseMedicationLabelProvider {
  readonly kind = "fireworks" as const;
  readonly #transport: MedicationLabelExtractionTransport;

  constructor(transport: MedicationLabelExtractionTransport) {
    super();
    this.#transport = transport;
  }

  checkAvailability(signal?: AbortSignal): Promise<MedicationLabelProviderAvailability> {
    return Promise.resolve(
      signal?.aborted ? { available: false, failure: failure("cancelled") } : { available: true }
    );
  }

  protected async extractValidated(
    input: ValidatedMedicationLabelExtractionRequest
  ): Promise<MedicationLabelExtractionOutcome> {
    try {
      const rawProposal = await abortable(this.#transport.extract(input), input.signal);
      const proposal = normalizeProposal(rawProposal, input, "fireworks");
      if (!proposal) return failed("contract_rejected");
      return MedicationLabelExtractionOutcomeSchema.parse({ status: "proposed", proposal });
    } catch (error: unknown) {
      if (input.signal.aborted) return failed("cancelled");
      if (error instanceof MedicationLabelTransportError) {
        return failed(error.code, error.retryAfterMs);
      }
      return failed("provider_unavailable");
    }
  }
}

export function createDisabledMedicationLabelProvider(
  code: "missing_configuration" | "provider_unavailable" = "missing_configuration"
): MedicationLabelProvider {
  return new DisabledMedicationLabelProvider(code);
}

export function createFakeMedicationLabelProvider(
  fixture: FakeMedicationLabelFixture,
  dependencies: Readonly<{ createId?: () => string; now?: () => string }> = {}
): MedicationLabelProvider {
  return new FakeMedicationLabelProvider(fixture, dependencies);
}
