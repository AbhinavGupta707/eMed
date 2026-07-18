import { createHash } from "node:crypto";

import { CareActionDetailsSchema, type CareActionDetails } from "./care-schemas";

function stableDetails(detailsInput: CareActionDetails): readonly string[] {
  const details = CareActionDetailsSchema.parse(detailsInput);
  switch (details.kind) {
    case "synthetic_appointment_request":
      return [details.kind, details.preferredWindow, details.confirmedSummary];
    case "synthetic_refill_review_request":
      return [
        details.kind,
        details.medicationDisplay,
        details.supplyState,
        details.confirmedSummary
      ];
    case "synthetic_care_team_message":
      return [details.kind, details.topic, details.confirmedSummary];
  }
}

export function deriveCareActionIdempotencyKey(input: {
  roundId: string;
  patientId: string;
  details: CareActionDetails;
}): string {
  const parts = [
    "homerounds-synthetic-care-action-v1",
    input.roundId,
    input.patientId,
    ...stableDetails(input.details)
  ];
  const digest = createHash("sha256").update(parts.join("\u001f")).digest("hex");
  return `care:v1:${digest}`;
}

export function deterministicCareActionId(idempotencyKey: string): string {
  const bytes = createHash("sha256")
    .update(`synthetic-care-action\u001f${idempotencyKey}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
