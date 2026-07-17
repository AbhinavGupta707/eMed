import {
  MedicationLabelImageMetadataSchema,
  MedicationLabelProposalSchema,
  type MedicationLabelImageMetadata,
  type MedicationLabelObservation,
  type MedicationLabelProposal
} from "@homerounds/contracts/medication";
import {
  InferenceProviderFailureSchema,
  type InferenceProviderFailure
} from "@homerounds/contracts/inference";
import { z } from "zod";

export const MedicationLabelExtractionOutcomeSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("proposed"),
      proposal: MedicationLabelProposalSchema
    })
    .strict(),
  z
    .object({
      status: z.literal("failed"),
      failure: InferenceProviderFailureSchema
    })
    .strict()
]);

export type MedicationLabelExtractionOutcome = z.infer<
  typeof MedicationLabelExtractionOutcomeSchema
>;

export type MedicationLabelExtractionInput = Readonly<{
  roundId: string;
  stateVersion: number;
  metadata: unknown;
  bytes: Uint8Array;
  signal: AbortSignal;
}>;

export type MedicationLabelTransportRequest = Readonly<{
  roundId: string;
  stateVersion: number;
  metadata: MedicationLabelImageMetadata;
  bytes: Uint8Array;
  signal: AbortSignal;
}>;

export type MedicationLabelExtractionTransport = Readonly<{
  extract(request: MedicationLabelTransportRequest): Promise<unknown>;
}>;

export type MedicationLabelProviderAvailability =
  Readonly<{ available: true }> | Readonly<{ available: false; failure: InferenceProviderFailure }>;

export interface MedicationLabelProvider {
  readonly kind: "disabled" | "fake" | "fireworks";
  checkAvailability(signal?: AbortSignal): Promise<MedicationLabelProviderAvailability>;
  extract(input: MedicationLabelExtractionInput): Promise<MedicationLabelExtractionOutcome>;
}

export type FakeMedicationLabelFixture = Readonly<{
  observations: readonly MedicationLabelObservation[];
  missingInformation: readonly string[];
}>;

export const MedicationLabelExtractionRequestSchema = z
  .object({
    roundId: z.uuid(),
    stateVersion: z.number().int().nonnegative(),
    metadata: MedicationLabelImageMetadataSchema
  })
  .strict();

export type ValidatedMedicationLabelExtractionRequest = Readonly<{
  roundId: string;
  stateVersion: number;
  metadata: MedicationLabelImageMetadata;
  bytes: Uint8Array;
  signal: AbortSignal;
}>;

export type MedicationLabelProposalFactory = (
  input: ValidatedMedicationLabelExtractionRequest
) => MedicationLabelProposal;
