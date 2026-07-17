/** @jsxRuntime automatic */
/** @jsxImportSource react */
// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import type {
  ConfirmedMedicationObservationFact,
  MedicationLabelProposal
} from "@homerounds/contracts/medication";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DisabledMedicationLabelProvider,
  MedicationCameraError,
  MedicationImageError,
  type MedicationCameraGateway,
  type MedicationLabelExtractionOutcome,
  type MedicationLabelProvider,
  type PreparedMedicationLabelImage
} from "../../../../../packages/assessments/providers/medication-label";

import { MedicationLabelPanel } from "./medication-label-panel";

const ROUND_ID = "cc80d269-2f79-4328-a129-98cac85219e4";
const SECOND_ROUND_ID = "14df34c4-8204-4810-8113-37b63c963a91";
const REQUEST_ID = "7fd16467-bfa6-4277-94b5-3673b34a6c4d";
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

function successfulOutcome(): MedicationLabelExtractionOutcome {
  return { status: "proposed", proposal: proposal() };
}

function provider(
  extract: MedicationLabelProvider["extract"] = vi.fn(async () => successfulOutcome()),
  available = true
): MedicationLabelProvider {
  return {
    kind: "fake",
    checkAvailability: async () =>
      available
        ? { available: true as const }
        : {
            available: false as const,
            failure: {
              code: "provider_unavailable" as const,
              retryable: true,
              retryAfterMs: null
            }
          },
    extract
  };
}

function preparedImage(): PreparedMedicationLabelImage & { clear: ReturnType<typeof vi.fn> } {
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
  const clear = vi.fn(() => bytes.fill(0));
  return {
    bytes,
    metadata: {
      requestId: REQUEST_ID,
      captureMode: "file_upload",
      mediaType: "image/png",
      byteLength: bytes.byteLength,
      width: 1_280,
      height: 720,
      consentVersion: "synthetic-demo-v1",
      consentGrantedAt: NOW,
      syntheticDataOnly: true,
      rawMediaRef: null
    },
    previewUrl: "blob:ephemeral-medication-preview",
    clear
  };
}

function baseProps(overrides: Partial<React.ComponentProps<typeof MedicationLabelPanel>> = {}) {
  return {
    roundId: ROUND_ID,
    stateVersion: 3,
    consentVersion: "synthetic-demo-v1",
    provider: provider(),
    onConfirmed: vi.fn(async () => undefined),
    createId: () => FACT_ID,
    now: () => NOW,
    ...overrides
  };
}

async function enableImageConsent(): Promise<void> {
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Upload label image" })).toBeDisabled()
  );
  fireEvent.click(
    screen.getByLabelText(/I will use only a synthetic, identifier-free demo label/i)
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Upload label image" })).toBeEnabled()
  );
}

function uploadSyntheticFile(): void {
  const file = new File([new Uint8Array([1, 2, 3])], "synthetic-label.png", {
    type: "image/png"
  });
  fireEvent.change(screen.getByTestId("medication-upload-input"), {
    target: { files: [file] }
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("medication label panel", () => {
  it("keeps a complete keyless text path with no model provenance", async () => {
    const onConfirmed = vi.fn(async (fact: ConfirmedMedicationObservationFact) => {
      void fact;
    });
    render(
      createElement(
        MedicationLabelPanel,
        baseProps({
          provider: new DisabledMedicationLabelProvider(),
          onConfirmed
        })
      )
    );

    await waitFor(() => expect(screen.getByText(/Image extraction: unavailable/i)).toBeVisible());
    expect(
      screen.getByText(/This path does not use an image or claim AI\/model provenance/i)
    ).toBeVisible();

    fireEvent.change(screen.getByLabelText("Product name"), {
      target: { value: "corrected" }
    });
    fireEvent.change(screen.getByLabelText("Product name text"), {
      target: { value: "Typed synthetic tablet" }
    });
    fireEvent.change(screen.getByLabelText("Strength shown on the label"), {
      target: { value: "not_visible" }
    });

    expect(onConfirmed).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Confirm text-entered observations" })
    ).toBeDisabled();
    fireEvent.click(
      screen.getByLabelText(/I reviewed and confirm these text-entered observations/i)
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm text-entered observations" }));

    expect(onConfirmed).toHaveBeenCalledTimes(1);
    const fact = onConfirmed.mock.calls[0]?.[0];
    expect(fact).toMatchObject({
      factId: FACT_ID,
      source: "text_entry",
      proposalId: null,
      explicitlyConfirmed: true,
      rawMediaRef: null,
      reviewItems: [
        {
          field: "product_name",
          disposition: "corrected",
          reviewedValue: "Typed synthetic tablet"
        },
        { field: "strength", disposition: "not_visible", reviewedValue: null }
      ]
    });
    expect(JSON.stringify(fact)).not.toMatch(/provider|model|provenance|attempt/i);
  });

  it("requires consent, extraction review dispositions, and explicit confirmation", async () => {
    const handle = preparedImage();
    const prepareImage = vi.fn(async () => handle);
    const onConfirmed = vi.fn(async () => undefined);
    render(createElement(MedicationLabelPanel, baseProps({ prepareImage, onConfirmed })));

    expect(screen.getByRole("button", { name: "Take label photo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Upload label image" })).toBeDisabled();
    await enableImageConsent();
    uploadSyntheticFile();

    expect(
      await screen.findByRole("heading", { name: "Review the unconfirmed draft" })
    ).toBeVisible();
    expect(handle.clear).toHaveBeenCalledTimes(1);
    expect(screen.queryByAltText("Temporary medication label preview")).not.toBeInTheDocument();
    expect(onConfirmed).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Confirm reviewed observations" })).toBeDisabled();

    const dispositions = screen.getAllByLabelText("Your review");
    fireEvent.change(dispositions[0]!, { target: { value: "accepted" } });
    fireEvent.change(dispositions[1]!, { target: { value: "corrected" } });
    fireEvent.change(screen.getByLabelText("Corrected strength shown on the label"), {
      target: { value: "5 mg synthetic strength" }
    });
    fireEvent.change(dispositions[2]!, { target: { value: "not_visible" } });

    expect(onConfirmed).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText(/I reviewed every item and confirm these observations/i));
    fireEvent.click(screen.getByRole("button", { name: "Confirm reviewed observations" }));

    expect(onConfirmed).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "image_review",
        proposalId: PROPOSAL_ID,
        explicitlyConfirmed: true,
        rawMediaRef: null,
        reviewItems: [
          { field: "product_name", disposition: "accepted", reviewedValue: "Demo tablet" },
          {
            field: "strength",
            disposition: "corrected",
            reviewedValue: "5 mg synthetic strength"
          },
          { field: "expiry", disposition: "not_visible", reviewedValue: null }
        ]
      })
    );
    await waitFor(() => expect(screen.queryByText("Demo tablet")).not.toBeInTheDocument());
    expect(screen.getByRole("status")).toHaveTextContent(/did not diagnose, advise dosing/i);
  });

  it("waits for durable text acceptance and suppresses duplicate confirmation", async () => {
    let resolveConfirmation: (() => void) | undefined;
    const confirmation = new Promise<void>((resolve) => {
      resolveConfirmation = resolve;
    });
    const onConfirmed = vi.fn(() => confirmation);
    render(createElement(MedicationLabelPanel, baseProps({ onConfirmed })));

    fireEvent.change(screen.getByLabelText("Product name"), {
      target: { value: "corrected" }
    });
    fireEvent.change(screen.getByLabelText("Product name text"), {
      target: { value: "Typed synthetic tablet" }
    });
    fireEvent.click(
      screen.getByLabelText(/I reviewed and confirm these text-entered observations/i)
    );
    const confirmButton = screen.getByRole("button", {
      name: "Confirm text-entered observations"
    });

    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);

    expect(onConfirmed).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Confirming observations…" })).toBeDisabled();
    expect(screen.getByLabelText("Product name text")).toHaveValue("Typed synthetic tablet");
    expect(screen.getByRole("status")).toHaveTextContent(/Handing off the confirmed observations/i);

    resolveConfirmation?.();

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        /Text-entered medication observations confirmed without model provenance/i
      )
    );
    expect(onConfirmed).toHaveBeenCalledTimes(1);
  });

  it("keeps the exact image review retryable after asynchronous rejection", async () => {
    const handle = preparedImage();
    const onConfirmed = vi.fn(async () => {
      throw new Error("synthetic persistence rejection");
    });
    render(
      createElement(
        MedicationLabelPanel,
        baseProps({
          prepareImage: vi.fn(async () => handle),
          onConfirmed
        })
      )
    );
    await enableImageConsent();
    uploadSyntheticFile();
    await screen.findByRole("heading", { name: "Review the unconfirmed draft" });
    const dispositions = screen.getAllByLabelText("Your review");
    fireEvent.change(dispositions[0]!, { target: { value: "accepted" } });
    fireEvent.change(dispositions[1]!, { target: { value: "corrected" } });
    fireEvent.change(screen.getByLabelText("Corrected strength shown on the label"), {
      target: { value: "5 mg synthetic strength" }
    });
    fireEvent.change(dispositions[2]!, { target: { value: "not_visible" } });
    fireEvent.click(screen.getByLabelText(/I reviewed every item and confirm these observations/i));

    fireEvent.click(screen.getByRole("button", { name: "Confirm reviewed observations" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/was not accepted.*review is unchanged/i)
    );
    expect(onConfirmed).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "Product name" }).parentElement).toHaveTextContent(
      "Demo tablet"
    );
    expect(screen.getByLabelText("Corrected strength shown on the label")).toHaveValue(
      "5 mg synthetic strength"
    );
    expect(
      screen.getByLabelText(/I reviewed every item and confirm these observations/i)
    ).toBeChecked();
    expect(screen.getByRole("button", { name: "Confirm reviewed observations" })).toBeEnabled();
  });

  it("shows and clears the ephemeral preview when extraction is cancelled", async () => {
    let resolveExtraction: ((outcome: MedicationLabelExtractionOutcome) => void) | undefined;
    let extractionSignal: AbortSignal | undefined;
    const extract = vi.fn(
      (input: Parameters<MedicationLabelProvider["extract"]>[0]) =>
        new Promise<MedicationLabelExtractionOutcome>((resolve) => {
          extractionSignal = input.signal;
          resolveExtraction = resolve;
        })
    );
    const handle = preparedImage();
    render(
      createElement(
        MedicationLabelPanel,
        baseProps({
          provider: provider(extract),
          prepareImage: vi.fn(async () => handle)
        })
      )
    );
    await enableImageConsent();
    uploadSyntheticFile();

    expect(await screen.findByAltText("Temporary medication label preview")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Cancel and clear image" }));

    expect(extractionSignal?.aborted).toBe(true);
    expect(handle.clear).toHaveBeenCalled();
    expect(screen.queryByAltText("Temporary medication label preview")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/Temporary image data was cleared/i);
    resolveExtraction?.({
      status: "failed",
      failure: { code: "cancelled", retryable: false, retryAfterMs: null }
    });
  });

  it.each([
    ["permission_denied", /Camera access was denied/i],
    ["unsupported_camera", /Camera capture is not supported/i]
  ] as const)("provides accessible %s camera recovery", async (code, message) => {
    const camera: MedicationCameraGateway = {
      requestAccess: vi.fn(async () => {
        throw new MedicationCameraError(code);
      })
    };
    render(createElement(MedicationLabelPanel, baseProps({ camera })));
    await enableImageConsent();

    fireEvent.click(screen.getByRole("button", { name: "Take label photo" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(message));
    expect(document.activeElement).toBe(screen.getByRole("alert"));
    expect(screen.getByRole("group", { name: "Option 2: complete text entry" })).toBeEnabled();
  });

  it("recovers from malformed images without calling the provider", async () => {
    const labelProvider = provider();
    render(
      createElement(
        MedicationLabelPanel,
        baseProps({
          provider: labelProvider,
          prepareImage: vi.fn(async () => {
            throw new MedicationImageError("malformed_image");
          })
        })
      )
    );
    await enableImageConsent();
    uploadSyntheticFile();

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/could not be read safely/i)
    );
    expect(labelProvider.extract).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Product name")).toBeEnabled();
  });

  it("clears a pending image when the round scope changes", async () => {
    const handle = preparedImage();
    let extractionSignal: AbortSignal | undefined;
    const extract = vi.fn(
      (input: Parameters<MedicationLabelProvider["extract"]>[0]) =>
        new Promise<MedicationLabelExtractionOutcome>(() => {
          extractionSignal = input.signal;
        })
    );
    const componentProps = baseProps({
      provider: provider(extract),
      prepareImage: vi.fn(async () => handle)
    });
    const { rerender } = render(createElement(MedicationLabelPanel, componentProps));
    await enableImageConsent();
    uploadSyntheticFile();
    await screen.findByAltText("Temporary medication label preview");

    rerender(createElement(MedicationLabelPanel, { ...componentProps, roundId: SECOND_ROUND_ID }));

    expect(extractionSignal?.aborted).toBe(true);
    expect(handle.clear).toHaveBeenCalled();
    expect(screen.queryByAltText("Temporary medication label preview")).not.toBeInTheDocument();
    expect(
      screen.getByLabelText(/I will use only a synthetic, identifier-free demo label/i)
    ).not.toBeChecked();
  });

  it("retains persistent safety copy and named keyboard/touch controls", async () => {
    render(createElement(MedicationLabelPanel, baseProps()));

    expect(
      screen.getByText(/use only a synthetic demo label with no person’s name/i)
    ).toBeVisible();
    expect(
      screen.getByText(/cannot diagnose, give dosing advice, or change a medication/i)
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Take label photo" })).toHaveAttribute(
      "type",
      "button"
    );
    expect(screen.getByRole("button", { name: "Upload label image" })).toHaveAttribute(
      "type",
      "button"
    );
    expect(screen.getByTestId("medication-upload-input")).toHaveAttribute(
      "accept",
      "image/jpeg,image/png,image/webp"
    );
    expect(screen.getByText(/maximum 5 MB; 320–8,192 pixels/i)).toBeVisible();
  });
});
