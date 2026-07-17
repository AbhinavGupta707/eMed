import { ClinicalTaskSchema, type ClinicalTask } from "@homerounds/contracts";

import {
  ClinicianMutationInputSchema,
  type ClinicianMutationInput,
  type ClinicianMutationKind,
  type ClinicianTransportErrorCode
} from "./model";

const priorityRank: Readonly<Record<ClinicalTask["priority"], number>> = {
  urgent_demo_only: 0,
  priority: 1,
  routine: 2
};

const statusRank: Readonly<Record<ClinicalTask["status"], number>> = {
  open: 0,
  acknowledged: 1,
  completed: 2
};

export function orderClinicianQueue(tasksInput: readonly ClinicalTask[]): ClinicalTask[] {
  const tasks = tasksInput.map((task) => ClinicalTaskSchema.parse(task));
  return tasks.toSorted(
    (left, right) =>
      statusRank[left.status] - statusRank[right.status] ||
      priorityRank[left.priority] - priorityRank[right.priority] ||
      left.createdAt.localeCompare(right.createdAt) ||
      left.id.localeCompare(right.id)
  );
}

export function clinicianOperationKey(
  taskId: string,
  kind: ClinicianMutationKind,
  expectedTaskUpdatedAt: string
): string {
  return `clinician:${taskId}:${kind}:${expectedTaskUpdatedAt}`;
}

export function createMutationInput(input: {
  task: ClinicalTask;
  kind: ClinicianMutationKind;
  note?: string;
}): ClinicianMutationInput {
  return ClinicianMutationInputSchema.parse({
    kind: input.kind,
    taskId: input.task.id,
    expectedTaskUpdatedAt: input.task.updatedAt,
    operationKey: clinicianOperationKey(input.task.id, input.kind, input.task.updatedAt),
    note: input.kind === "save_note" ? (input.note ?? "") : null
  });
}

export function optimisticallyApplyTaskMutation(
  taskInput: ClinicalTask,
  kind: ClinicianMutationKind
): ClinicalTask {
  const task = ClinicalTaskSchema.parse(taskInput);
  if (kind === "acknowledge" && task.status === "open") {
    return ClinicalTaskSchema.parse({ ...task, status: "acknowledged" });
  }
  if (kind === "complete" && task.status !== "completed") {
    return ClinicalTaskSchema.parse({ ...task, status: "completed" });
  }
  return task;
}

export type MutationNotice = {
  tone: "success" | "error";
  message: string;
};

export function mutationErrorNotice(code: ClinicianTransportErrorCode): MutationNotice {
  switch (code) {
    case "offline":
      return {
        tone: "error",
        message:
          "The update was not persisted because the connection is offline. Your view was restored."
      };
    case "conflict":
      return {
        tone: "error",
        message:
          "The update conflicts with a newer task change. Reload the task before trying again."
      };
    case "stale":
      return {
        tone: "error",
        message: "This task changed after it was loaded. The optimistic update was rolled back."
      };
    case "unsupported":
      return {
        tone: "error",
        message: "The current API does not support this clinician update. Nothing was persisted."
      };
    case "unavailable":
      return {
        tone: "error",
        message: "The persistence service is unavailable. Nothing was recorded."
      };
    case "invalid_response":
      return {
        tone: "error",
        message:
          "The server response could not be verified, so no success is shown. Reload before retrying."
      };
    case "unknown":
      return {
        tone: "error",
        message: "The update could not be confirmed. Nothing is shown as persisted."
      };
  }
}

export function mutationSuccessNotice(input: {
  kind: ClinicianMutationKind;
  duplicateSuppressed: boolean;
}): MutationNotice {
  if (input.duplicateSuppressed) {
    return {
      tone: "success",
      message:
        "The server confirmed this update was already persisted; no duplicate work was created."
    };
  }

  const labels: Readonly<Record<ClinicianMutationKind, string>> = {
    save_note: "Note persisted and audit reference confirmed.",
    acknowledge: "Acknowledgement persisted and audit reference confirmed.",
    record_contact: "Contact attempt persisted and audit reference confirmed.",
    complete: "Completion persisted and audit reference confirmed."
  };
  return { tone: "success", message: labels[input.kind] };
}
