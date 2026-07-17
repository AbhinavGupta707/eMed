import type { ClinicalTask } from "@homerounds/contracts";
import type { StatusChipVariant } from "@homerounds/ui";

import type { ClinicianMutationKind, ClinicianTaskDetail } from "./model";

export function readableToken(value: string): string {
  return value.replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
    timeZoneName: "short",
    year: "numeric"
  }).format(new Date(value));
}

export function taskStatusVariant(status: ClinicalTask["status"]): StatusChipVariant {
  if (status === "completed") return "complete";
  if (status === "acknowledged") return "information";
  return "attention";
}

export function taskPriorityVariant(priority: ClinicalTask["priority"]): StatusChipVariant {
  if (priority === "urgent_demo_only") return "action";
  if (priority === "priority") return "attention";
  return "neutral";
}

export function programmeLabel(detail: ClinicianTaskDetail): string {
  if (detail.snapshot.status !== "available") return "Programme context unavailable";
  const title = detail.snapshot.value.carePlans.find((carePlan) => carePlan.title)?.title;
  return title ?? "Programme title not returned";
}

export function pendingMutationLabel(kind: ClinicianMutationKind): string {
  const labels: Readonly<Record<ClinicianMutationKind, string>> = {
    save_note: "Saving — not yet persisted",
    acknowledge: "Acknowledging — not yet persisted",
    record_contact: "Recording contact — not yet persisted",
    complete: "Completing — not yet persisted"
  };
  return labels[kind];
}

export function mutationTitle(kind: ClinicianMutationKind): string {
  const labels: Readonly<Record<ClinicianMutationKind, string>> = {
    save_note: "Persist clinician note?",
    acknowledge: "Acknowledge this task?",
    record_contact: "Record a contact attempt?",
    complete: "Complete this task?"
  };
  return labels[kind];
}

export function mutationDescription(kind: ClinicianMutationKind): string {
  const labels: Readonly<Record<ClinicianMutationKind, string>> = {
    save_note: "The note is not saved until the transport returns a verified persistence receipt.",
    acknowledge:
      "The queue remains unconfirmed until acknowledgement persistence and audit references return.",
    record_contact:
      "This records a contact attempt only; it does not claim that contact succeeded or that care was delivered.",
    complete:
      "Completion uses a stable operation key, but the UI will show success only after persistence confirms it."
  };
  return labels[kind];
}
