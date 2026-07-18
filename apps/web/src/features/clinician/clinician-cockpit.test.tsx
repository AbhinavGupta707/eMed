/** @jsxRuntime automatic */
/** @jsxImportSource react */
// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { ClinicianCockpit } from "./clinician-cockpit";
import { clinicianOperationKey } from "./controller";
import type { ClinicianMutationInput, ClinicianTaskDetail } from "./model";
import {
  ROUND_ID,
  TASK_ID,
  deferred,
  syntheticDetail,
  syntheticReceipt,
  syntheticTask
} from "./test-support";
import { ClinicianTransportError, type ClinicianTransport } from "./transport";

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

function createTransport(
  input: {
    tasks?: ReturnType<typeof syntheticTask>[];
    detail?: (task: ReturnType<typeof syntheticTask>) => ClinicianTaskDetail;
    listQueue?: ClinicianTransport["listQueue"];
    mutate?: ClinicianTransport["mutate"];
  } = {}
): ClinicianTransport {
  const tasks = input.tasks ?? [syntheticTask()];
  return {
    listQueue: input.listQueue ?? (() => Promise.resolve(tasks)),
    loadTaskDetail: (task) => Promise.resolve(input.detail?.(task) ?? syntheticDetail({ task })),
    mutate:
      input.mutate ??
      (() => Promise.reject(new ClinicianTransportError("unsupported", "Not supported.")))
  };
}

function renderCockpit(transport: ClinicianTransport) {
  return render(createElement(ClinicianCockpit, { roundIds: [ROUND_ID], transport }));
}

async function waitForSelectedTask(patientId = "synthetic-maya") {
  return screen.findByRole(
    "heading",
    {
      level: 2,
      name: `Synthetic record ${patientId}`
    },
    { timeout: 3_000 }
  );
}

describe("clinician cockpit", () => {
  it("orders the queue and renders selected context, evidence provenance, and audit references", async () => {
    const routine = syntheticTask({
      id: "10000000-0000-4000-8000-000000000001",
      patientId: "synthetic-routine",
      priority: "routine"
    });
    const urgent = syntheticTask({
      id: "10000000-0000-4000-8000-000000000002",
      patientId: "synthetic-urgent",
      priority: "urgent_demo_only",
      createdAt: "2026-07-17T09:10:00.000Z"
    });
    const earlierUrgent = syntheticTask({
      id: "10000000-0000-4000-8000-000000000003",
      patientId: "synthetic-urgent-first",
      priority: "urgent_demo_only",
      createdAt: "2026-07-17T09:05:00.000Z"
    });
    renderCockpit(createTransport({ tasks: [routine, urgent, earlierUrgent] }));

    await waitForSelectedTask("synthetic-urgent-first");
    const queue = screen.getByRole("navigation", { name: "Clinician priority queue" });
    const taskButtons = within(queue)
      .getAllByRole("button")
      .filter((button) => button.textContent?.includes("Synthetic record"));
    expect(taskButtons.map((button) => button.textContent)).toEqual([
      expect.stringContaining("synthetic-urgent-first"),
      expect.stringContaining("synthetic-urgent"),
      expect.stringContaining("synthetic-routine")
    ]);

    expect(screen.getByRole("heading", { level: 1, name: "Clinician cockpit" })).toBeVisible();
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getByText("Synthetic cardiometabolic programme")).toBeVisible();
    expect(screen.getByText("trigger-synthetic-change-v1")).toBeVisible();
    expect(screen.getByText("84 bpm")).toBeVisible();
    expect(screen.getByText(/rawMediaRef is null/i)).toBeVisible();
    expect(screen.getByText(/Correlation: correlation-action-001/)).toBeVisible();
    expect(screen.getByText(/Reference: 77777777/i)).toBeVisible();
    expect(screen.getAllByText(/Not clinically validated/i).length).toBeGreaterThan(0);
  });

  it("shows loading and empty states without inventing queue work", async () => {
    const queue = deferred<ReturnType<typeof syntheticTask>[]>();
    renderCockpit(createTransport({ listQueue: () => queue.promise }));

    expect(screen.getByText("Loading priority queue")).toBeVisible();
    await act(async () => queue.resolve([]));
    expect(await screen.findByText("No queued tasks")).toBeVisible();
    expect(screen.getByText(/No work is inferred/i)).toBeVisible();
  });

  it("shows a queue error and retries through the same injected transport", async () => {
    let attempt = 0;
    const listQueue = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) throw new ClinicianTransportError("unavailable", "Unavailable.");
      return [];
    });
    renderCockpit(createTransport({ listQueue }));

    expect(await screen.findByText("Queue unavailable")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("No queued tasks")).toBeVisible();
    expect(listQueue).toHaveBeenCalledTimes(2);
  });

  it("surfaces abstention, deterministic missing facts, and source issues without inference", async () => {
    renderCockpit(
      createTransport({
        detail: (task) =>
          syntheticDetail({
            task,
            outcome: "abstain_for_review",
            missingFactKeys: ["hydration_status"],
            snapshotIssues: [
              {
                code: "stale",
                factKind: "observation",
                resourceReference: "Observation/synthetic-old-activity",
                detailKey: "activity_observation_stale"
              }
            ]
          })
      })
    );

    await waitForSelectedTask();
    expect(screen.getAllByText("Abstained").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/hydration_status/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Stale: activity_observation_stale/i)).toBeVisible();
    expect(screen.getByText(/deterministic workflow abstained/i)).toBeVisible();
    expect(screen.getByText("No numeric measurement accepted")).toBeVisible();
    expect(screen.getByText(/weak signal, motion/i)).toBeVisible();
  });

  it("keeps a note local until persistence and then shows the returned audit reference", async () => {
    const persistence = deferred<ReturnType<typeof syntheticReceipt>>();
    let mutationInput: ClinicianMutationInput | undefined;
    const mutate = vi.fn((input: ClinicianMutationInput) => {
      mutationInput = input;
      return persistence.promise;
    });
    renderCockpit(createTransport({ mutate }));
    await waitForSelectedTask();

    fireEvent.change(screen.getByLabelText("Note draft"), {
      target: { value: "Synthetic follow-up note draft." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    expect(screen.getByRole("dialog", { name: "Persist clinician note?" })).toBeVisible();
    expect(screen.queryByText("Persistence confirmed")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(screen.getAllByText("Saving — not yet persisted").length).toBeGreaterThan(0);
    expect(screen.queryByText("Persistence confirmed")).not.toBeInTheDocument();
    await waitFor(() => expect(mutationInput).toBeDefined());
    await act(async () =>
      persistence.resolve(
        syntheticReceipt({
          task: syntheticTask(),
          kind: "save_note",
          operationKey: mutationInput?.operationKey ?? "missing-operation-key",
          note: mutationInput?.note ?? ""
        })
      )
    );

    expect(await screen.findByText("Persistence confirmed")).toBeVisible();
    expect(screen.getAllByText(/88888888-8888-4888-8888-888888888881/).length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Note draft")).toHaveValue("Synthetic follow-up note draft.");
  });

  it("rolls back an optimistic completion when persistence reports offline", async () => {
    const persistence = deferred<ReturnType<typeof syntheticReceipt>>();
    renderCockpit(createTransport({ mutate: () => persistence.promise }));
    await waitForSelectedTask();

    fireEvent.click(screen.getByRole("button", { name: "Complete task" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(screen.getAllByText("Completing — not yet persisted").length).toBeGreaterThan(0);
    expect(screen.queryByText("Persistence confirmed")).not.toBeInTheDocument();

    await act(async () =>
      persistence.reject(new ClinicianTransportError("offline", "Synthetic offline failure."))
    );
    expect(await screen.findByText("Not persisted")).toBeVisible();
    expect(screen.getByText("Current status").parentElement).toHaveTextContent("Open");
    expect(screen.getByText(/view was restored/i)).toBeVisible();
  });

  it("uses a stable completion key and reports server-confirmed duplicate suppression", async () => {
    let mutationInput: ClinicianMutationInput | undefined;
    const mutate = vi.fn(async (input: ClinicianMutationInput) => {
      mutationInput = input;
      return syntheticReceipt({
        task: syntheticTask(),
        kind: "complete",
        operationKey: input.operationKey,
        duplicateSuppressed: true
      });
    });
    renderCockpit(createTransport({ mutate }));
    await waitForSelectedTask();

    fireEvent.click(screen.getByRole("button", { name: "Complete task" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(await screen.findByText(/no duplicate work was created/i)).toBeVisible();
    expect(mutationInput?.operationKey).toBe(
      clinicianOperationKey(TASK_ID, "complete", syntheticTask().updatedAt)
    );
    expect(screen.getByRole("button", { name: "Complete task" })).toBeDisabled();
  });

  it("disables unsupported clinician writes and labels the missing API contract", async () => {
    renderCockpit(
      createTransport({
        detail: (task) => syntheticDetail({ task, capabilities: "unsupported" })
      })
    );
    await waitForSelectedTask();

    expect(screen.getByLabelText("Note draft")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save note" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Acknowledge" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Record contact" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Complete task" })).toBeDisabled();
    expect(screen.getByText(/does not simulate a write/i)).toBeVisible();
  });
});
