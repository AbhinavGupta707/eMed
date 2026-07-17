import type { MedicationLabelProposal } from "@homerounds/contracts/medication";
import { describe, expect, it } from "vitest";

import { createConfirmedMedicationObservationFact } from "./confirmation";

const ROUND_ID = "cc80d269-2f79-4328-a129-98cac85219e4";
const PROPOSAL_ID = "fb99983d-cc81-454e-9c92-f8e99e0891de";
const ATTEMPT_ID = "2ca00a52-523d-42fb-91e1-f708bfa6f532";
const FACT_ID = "dcfce5d5-b681-4593-81af-806256e9e352";
const NOW = "2026-07-17T09:00:00.000Z";

function proposal(): MedicationLabelProposal {
  return {
    contractVersion: "medication-label.v1",
    proposalId: PROPOSAL_ID,
    roundId: ROUND_ID,
    stateVersion: 3,
    observations: [
      { field: "product_name", status: "detected", value: "Demo tablet", confidence: 0.9 },
      { field: "strength", status: "uncertain", value: "5 mg", confidence: 0.5 },
      { field: "expiry", status: "missing", value: null, confidence: null }
    ],
    missingInformation: ["Expiry is not visible"],
    provenance: {
      attemptId: ATTEMPT_ID,
      provider: "fake",
      task: "medication_label_extraction",
      modelAlias: "synthetic.medication-label.fixture",
      contractVersion: "medication-label.v1",
      attemptedAt: NOW,
      durationMs: 0,
      tokenUsage: null
    },
    rawMediaRef: null
  };
}

const reviewed = [
  { field: "product_name", disposition: "accepted", reviewedValue: "Demo tablet" },
  { field: "strength", disposition: "corrected", reviewedValue: "5 mg demo strength" },
  { field: "expiry", disposition: "not_visible", reviewedValue: null }
] as const;

describe("medication confirmation compiler", () => {
  it("never turns an unconfirmed image proposal into a fact", () => {
    expect(
      createConfirmedMedicationObservationFact({
        source: "image_review",
        proposal: proposal(),
        roundId: ROUND_ID,
        stateVersion: 3,
        reviewItems: reviewed,
        explicitlyConfirmed: false,
        createId: () => FACT_ID,
        now: () => NOW
      })
    ).toBeNull();
  });

  it("creates a bounded image-review fact only after every observation is reviewed", () => {
    expect(
      createConfirmedMedicationObservationFact({
        source: "image_review",
        proposal: proposal(),
        roundId: ROUND_ID,
        stateVersion: 3,
        reviewItems: reviewed,
        explicitlyConfirmed: true,
        createId: () => FACT_ID,
        now: () => NOW
      })
    ).toEqual({
      factId: FACT_ID,
      roundId: ROUND_ID,
      proposalId: PROPOSAL_ID,
      stateVersion: 3,
      source: "image_review",
      reviewItems: reviewed,
      explicitlyConfirmed: true,
      confirmedAt: NOW,
      rawMediaRef: null
    });
  });

  it("rejects partial review, stale state, and a changed accepted value", () => {
    const base = {
      source: "image_review" as const,
      proposal: proposal(),
      roundId: ROUND_ID,
      stateVersion: 3,
      explicitlyConfirmed: true,
      createId: () => FACT_ID,
      now: () => NOW
    };

    expect(
      createConfirmedMedicationObservationFact({ ...base, reviewItems: reviewed.slice(0, 2) })
    ).toBeNull();
    expect(
      createConfirmedMedicationObservationFact({ ...base, stateVersion: 4, reviewItems: reviewed })
    ).toBeNull();
    expect(
      createConfirmedMedicationObservationFact({
        ...base,
        reviewItems: [
          { field: "product_name", disposition: "accepted", reviewedValue: "Changed value" },
          reviewed[1],
          reviewed[2]
        ]
      })
    ).toBeNull();
  });

  it("creates text-entry facts with no proposal or model provenance", () => {
    const fact = createConfirmedMedicationObservationFact({
      source: "text_entry",
      roundId: ROUND_ID,
      stateVersion: 3,
      reviewItems: [
        { field: "product_name", disposition: "corrected", reviewedValue: "Typed demo tablet" },
        { field: "strength", disposition: "not_visible", reviewedValue: null }
      ],
      explicitlyConfirmed: true,
      createId: () => FACT_ID,
      now: () => NOW
    });

    expect(fact).toMatchObject({
      source: "text_entry",
      proposalId: null,
      explicitlyConfirmed: true,
      rawMediaRef: null
    });
    expect(JSON.stringify(fact)).not.toMatch(/provider|model|provenance|attempt/i);
  });
});
