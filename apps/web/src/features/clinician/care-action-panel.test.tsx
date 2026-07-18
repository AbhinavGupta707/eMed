/** @jsxRuntime automatic */
/** @jsxImportSource react */
// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import {
  CareActionAuditEventSchema,
  CareActionMutationReceiptSchema,
  SyntheticCareActionSchema,
  type ClinicianCareActionMutationKind,
  type SyntheticCareAction
} from "@homerounds/actions";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { CareActionPanel } from "./care-action-panel";
import {
  CareActionTransportError,
  type ClinicianCareActionTransport
} from "./care-action-transport";

const ROUND_ID = "137c9d4f-4dfc-4b95-a5ce-657ba00b29b4";
const ACTION_ID = "20000000-0000-4000-8000-000000000001";
const NOW = "2026-07-18T10:00:00.000Z";

beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = true;
    }
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = false;
      this.dispatchEvent(new Event("close"));
    }
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function action(overrides: Partial<SyntheticCareAction> = {}): SyntheticCareAction {
  return SyntheticCareActionSchema.parse({
    id: ACTION_ID,
    roundId: ROUND_ID,
    patientId: "synthetic-maya",
    kind: "synthetic_appointment_request",
    details: {
      kind: "synthetic_appointment_request",
      preferredWindow: "afternoon",
      confirmedSummary: "Request a synthetic programme review appointment."
    },
    evidence: {
      summary: "Confirmed structured change is ready for synthetic review.",
      protocolId: "cardiometabolic_demo",
      protocolVersion: "1.0.0",
      protocolOutcome: "programme_review_requested",
      sourceFactIds: ["fact-confirmed-1"],
      captureQuality: "fail",
      measurementState: "not_accepted",
      redFlagGate: "clear",
      generatedAt: NOW,
      rawTranscriptStored: false,
      modelReasoningStored: false,
      rawMediaStored: false
    },
    idempotencyKey: "care:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    patientConfirmationAt: NOW,
    status: "pending_review",
    version: 1,
    ownerId: null,
    clinicianSummary: null,
    lastFailure: null,
    delivery: "synthetic_only_not_sent",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides
  });
}

function statusFor(kind: ClinicianCareActionMutationKind, previous: SyntheticCareAction) {
  if (kind === "approve") return "approved" as const;
  if (kind === "record_contact") return "contact_attempted" as const;
  if (kind === "complete") return "completed" as const;
  if (kind === "retry") return "pending_review" as const;
  return previous.status;
}

function statefulTransport() {
  let current = action();
  let eventNumber = 1;
  const mutate = vi.fn<ClinicianCareActionTransport["mutate"]>(async (input) => {
    const kind = input.mutation.kind;
    current = SyntheticCareActionSchema.parse({
      ...current,
      status: statusFor(kind, current),
      version: current.version + 1,
      ownerId: "synthetic-clinician",
      clinicianSummary:
        kind === "edit" ? input.mutation.clinicianSummary : current.clinicianSummary,
      lastFailure: null,
      updatedAt: NOW
    });
    const eventType = {
      approve: "approved",
      edit: "edited",
      record_contact: "contact_attempted",
      complete: "completed",
      retry: "retried"
    } as const;
    const event = CareActionAuditEventSchema.parse({
      eventId: `30000000-0000-4000-8000-${String(eventNumber++).padStart(12, "0")}`,
      actionId: current.id,
      roundId: current.roundId,
      patientId: current.patientId,
      type: eventType[kind],
      actionKind: current.kind,
      status: current.status,
      actionVersion: current.version,
      actor: { kind: "clinician", id: "synthetic-clinician" },
      operationKey: input.operationKey,
      correlationId: `correlation-${kind}`,
      occurredAt: NOW,
      summaryKey: `synthetic_care_action.${eventType[kind]}`,
      rawTranscriptStored: false,
      modelReasoningStored: false,
      providerPayloadStored: false,
      rawMediaStored: false
    });
    return CareActionMutationReceiptSchema.parse({
      status: "persisted",
      action: current,
      event,
      operationKey: input.operationKey,
      duplicateSuppressed: false
    });
  });
  return {
    transport: {
      listRound: async () => [current],
      mutate
    } satisfies ClinicianCareActionTransport,
    mutate
  };
}

async function confirm(buttonName: string) {
  fireEvent.click(screen.getByRole("button", { name: buttonName }));
  const dialog = await screen.findByRole("dialog");
  expect(dialog).toHaveTextContent(/Nothing is sent|persist only|attempted synthetic|no external/i);
  fireEvent.click(screen.getByRole("button", { name: "Confirm persisted update" }));
  await screen.findByText("Persistence confirmed");
}

describe("clinician synthetic care action completion", () => {
  it("renders a concise evidence card and an explicit no-external-delivery boundary", async () => {
    const { transport } = statefulTransport();
    render(<CareActionPanel roundId={ROUND_ID} transport={transport} />);

    expect(await screen.findByText("Concise evidence card")).toBeVisible();
    expect(screen.getByText("Not accepted")).toBeVisible();
    expect(screen.getByText(/not sent to a real clinic, pharmacy, calendar/i)).toBeVisible();
    expect(screen.getByText(/Raw transcript, model reasoning, provider payload/i)).toBeVisible();
    expect(screen.getByText(/Request a synthetic programme review appointment/i)).toBeVisible();
  });

  it("persists edit, approve, contact-attempt, and completion receipts in order", async () => {
    const { transport, mutate } = statefulTransport();
    render(<CareActionPanel roundId={ROUND_ID} transport={transport} />);
    await screen.findByText("Concise evidence card");

    fireEvent.change(screen.getByLabelText("Clinician summary"), {
      target: { value: "Edited concise synthetic evidence." }
    });
    await confirm("Save edit");
    expect(screen.getByLabelText("Clinician summary")).toHaveValue(
      "Edited concise synthetic evidence."
    );

    await confirm("Approve");
    expect(screen.getAllByText("Approved").length).toBeGreaterThan(0);
    await confirm("Record contact attempt");
    expect(screen.getAllByText("Contact attempted").length).toBeGreaterThan(0);
    await confirm("Complete action");
    expect(screen.getAllByText("Completed").length).toBeGreaterThan(0);

    expect(mutate.mock.calls.map(([input]) => input.mutation.kind)).toEqual([
      "edit",
      "approve",
      "record_contact",
      "complete"
    ]);
    expect(mutate.mock.calls.map(([input]) => input.expectedVersion)).toEqual([1, 2, 3, 4]);
    expect(screen.getByRole("button", { name: "Complete action" })).toBeDisabled();
  });

  it("restores the persisted view and requests reload after a stale write", async () => {
    const initial = action();
    const transport: ClinicianCareActionTransport = {
      listRound: async () => [initial],
      mutate: async () => {
        throw new CareActionTransportError("stale", "Injected stale version.");
      }
    };
    render(<CareActionPanel roundId={ROUND_ID} transport={transport} />);
    await screen.findByText("Concise evidence card");

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm persisted update" }));

    expect(await screen.findByText("Not persisted")).toBeVisible();
    expect(screen.getByText(/changed elsewhere.*Reload/i)).toBeVisible();
    expect(screen.getAllByText("Pending review").length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled());
  });
});
