import {
  ConfirmedMedicationObservationFactSchema,
  MedicationLabelProposalSchema,
  MedicationReviewItemSchema,
  type ConfirmedMedicationObservationFact,
  type MedicationReviewItem
} from "@homerounds/contracts/medication";

type ConfirmationDependencies = Readonly<{
  createId?: () => string;
  now?: () => string;
}>;

type SharedConfirmationInput = Readonly<{
  roundId: string;
  stateVersion: number;
  reviewItems: unknown;
  explicitlyConfirmed: boolean;
}> &
  ConfirmationDependencies;

export type ImageMedicationConfirmationInput = SharedConfirmationInput &
  Readonly<{
    source: "image_review";
    proposal: unknown;
  }>;

export type TextMedicationConfirmationInput = SharedConfirmationInput &
  Readonly<{
    source: "text_entry";
  }>;

function defaultId(): string {
  return globalThis.crypto.randomUUID();
}

function defaultNow(): string {
  return new Date().toISOString();
}

function parseReviewItems(reviewItems: unknown): MedicationReviewItem[] | null {
  const parsed = MedicationReviewItemSchema.array().min(1).max(7).safeParse(reviewItems);
  return parsed.success ? parsed.data : null;
}

export function createConfirmedMedicationObservationFact(
  input: ImageMedicationConfirmationInput | TextMedicationConfirmationInput
): ConfirmedMedicationObservationFact | null {
  if (input.explicitlyConfirmed !== true) return null;
  const reviewItems = parseReviewItems(input.reviewItems);
  if (!reviewItems) return null;

  let proposalId: string | null = null;
  if (input.source === "image_review") {
    const proposal = MedicationLabelProposalSchema.safeParse(input.proposal);
    if (!proposal.success) return null;
    if (
      proposal.data.roundId !== input.roundId ||
      proposal.data.stateVersion !== input.stateVersion
    ) {
      return null;
    }

    const observations = new Map(
      proposal.data.observations.map((observation) => [observation.field, observation] as const)
    );
    if (observations.size !== reviewItems.length) return null;
    for (const item of reviewItems) {
      const observation = observations.get(item.field);
      if (!observation) return null;
      if (item.disposition === "accepted" && item.reviewedValue !== observation.value) return null;
    }
    proposalId = proposal.data.proposalId;
  }

  const fact = ConfirmedMedicationObservationFactSchema.safeParse({
    factId: (input.createId ?? defaultId)(),
    roundId: input.roundId,
    proposalId,
    stateVersion: input.stateVersion,
    source: input.source,
    reviewItems,
    explicitlyConfirmed: true,
    confirmedAt: (input.now ?? defaultNow)(),
    rawMediaRef: null
  });
  return fact.success ? fact.data : null;
}
