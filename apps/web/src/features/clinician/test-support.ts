import type { ClinicalTask, DomainEvent } from "@homerounds/contracts";

import {
  ClinicianMutationReceiptSchema,
  ClinicianTaskDetailSchema,
  availableResource,
  unavailableResource,
  type ClinicianMutationKind,
  type ClinicianMutationReceipt,
  type ClinicianTaskDetail
} from "./model";

export const ROUND_ID = "22222222-2222-4222-8222-222222222222";
export const TASK_ID = "11111111-1111-4111-8111-111111111111";
export const REPORT_ID = "33333333-3333-4333-8333-333333333333";
export const FACT_ID = "44444444-4444-4444-8444-444444444444";
export const SESSION_ID = "55555555-5555-4555-8555-555555555555";
export const NOW = "2026-07-17T09:30:00.000Z";

export function syntheticTask(overrides: Partial<ClinicalTask> = {}): ClinicalTask {
  return {
    id: TASK_ID,
    roundId: ROUND_ID,
    patientId: "synthetic-maya",
    idempotencyKey: `programme-task:${ROUND_ID}:v1`,
    type: "programme_review",
    ownerRole: "programme_clinician",
    priority: "priority",
    reasonKey: "programme_review_requested",
    status: "open",
    serviceWindowLabel: "Demo-only illustrative same-day window — no real response-time promise.",
    protocolId: "cardiometabolic-demo",
    createdAt: "2026-07-17T09:00:00.000Z",
    updatedAt: "2026-07-17T09:00:00.000Z",
    ...overrides
  };
}

function event(input: {
  eventId: string;
  type: string;
  occurredAt: string;
  source?: DomainEvent["source"];
  actor?: DomainEvent["actor"];
  correlationId: string;
}): DomainEvent {
  return {
    eventId: input.eventId,
    type: input.type,
    schemaVersion: 1,
    occurredAt: input.occurredAt,
    actor: input.actor ?? { kind: "system", id: "synthetic-service" },
    patientId: "synthetic-maya",
    roundId: ROUND_ID,
    correlationId: input.correlationId,
    source: input.source ?? "system",
    payload: {}
  };
}

export function syntheticDetail(
  input: {
    task?: ClinicalTask;
    outcome?: "programme_review_requested" | "emergency_guidance" | "abstain_for_review";
    missingFactKeys?: string[];
    snapshotIssues?: Array<{
      code: "missing" | "conflicting" | "stale";
      factKind: "condition" | "medication" | "observation" | "care_plan";
      resourceReference: string | null;
      detailKey: string;
    }>;
    capabilities?: "supported" | "unsupported";
  } = {}
): ClinicianTaskDetail {
  const task = input.task ?? syntheticTask();
  const capabilities = input.capabilities ?? "supported";
  return ClinicianTaskDetailSchema.parse({
    task,
    round: availableResource({
      id: task.roundId,
      patientId: task.patientId,
      state: input.outcome === "abstain_for_review" ? "abstained_for_review" : "awaiting_clinician",
      stateVersion: 8,
      purpose: "Review a synthetic change in the cardiometabolic programme.",
      triggerId: "trigger-synthetic-change-v1",
      burdenSecondsRemaining: 0,
      protocolId: task.protocolId,
      createdAt: "2026-07-17T08:55:00.000Z",
      updatedAt: NOW,
      closedAt: null
    }),
    snapshot: availableResource({
      patientId: task.patientId,
      asOf: "2026-07-17T08:50:00.000Z",
      source: "synthetic_fhir_r4_fixture",
      conditions: [],
      medications: [],
      observations: [
        {
          factId: "fhir-resting-heart-rate-trend",
          code: "resting-heart-rate",
          display: "Synthetic resting heart rate trend",
          status: "final",
          value: 82,
          unit: "bpm",
          valueStatus: "present",
          observedAt: "2026-07-16T08:00:00.000Z",
          freshness: "current",
          conflictsWith: [],
          provenance: {
            status: "present",
            targetReference: "Observation/synthetic-resting-heart-rate",
            recordedAt: "2026-07-16T08:00:00.000Z",
            sourceReference: "Bundle/synthetic-maya"
          }
        }
      ],
      carePlans: [
        {
          factId: "synthetic-care-plan",
          status: "active",
          categoryCode: "cardiometabolic",
          title: "Synthetic cardiometabolic programme",
          periodStart: "2026-06-01T00:00:00.000Z",
          periodEnd: null,
          provenance: {
            status: "present",
            targetReference: "CarePlan/synthetic-cardio",
            recordedAt: "2026-06-01T00:00:00.000Z",
            sourceReference: "Bundle/synthetic-maya"
          }
        }
      ],
      issues: input.snapshotIssues ?? []
    }),
    report: availableResource({
      reportId: REPORT_ID,
      roundId: task.roundId,
      weakness: "moderate",
      palpitations: "intermittent",
      redFlags: { chestPain: "no", severeBreathlessness: "no", fainted: "no" },
      inputMode: "voice_confirmed",
      confirmedAt: "2026-07-17T09:05:00.000Z"
    }),
    measurement:
      input.outcome === "abstain_for_review"
        ? unavailableResource(
            "missing",
            "not_recorded",
            "No quality-passing numeric measurement was accepted."
          )
        : availableResource({
            factId: FACT_ID,
            assessmentSessionId: SESSION_ID,
            provider: "finger_ppg",
            value: 84,
            unit: "bpm",
            observedAt: "2026-07-17T09:10:00.000Z",
            durationMs: 25_000,
            algorithmVersion: "finger-ppg-demo-v1",
            providerModelVersion: null,
            quality: {
              status: "pass",
              score: 0.91,
              reasons: [],
              metrics: { usableDurationMs: 25_000 }
            },
            rawMediaRef: null
          }),
    voiceBiomarkerFact: unavailableResource(
      "missing",
      "not_recorded",
      "No quality-passing research voice signal was accepted."
    ),
    captureQuality:
      input.outcome === "abstain_for_review"
        ? availableResource({
            status: "fail",
            score: 0.18,
            reasons: ["weak_signal", "motion"],
            metrics: { signalCoverage: 0.2 }
          })
        : unavailableResource(
            "missing",
            "not_recorded",
            "No non-passing capture-quality outcome was recorded."
          ),
    protocolResult: availableResource({
      protocolId: task.protocolId,
      protocolVersion: "1.0.0-demo",
      matchedRuleIds: ["review-synthetic-change"],
      factIds: [FACT_ID],
      outcome: input.outcome ?? "programme_review_requested",
      allowedActions: ["create_programme_task"],
      missingFactKeys: input.missingFactKeys ?? [],
      explanationKey: "synthetic_review_requested"
    }),
    timeline: availableResource([
      event({
        eventId: "66666666-6666-4666-8666-666666666666",
        type: "patient_report_confirmed",
        occurredAt: "2026-07-17T09:05:00.000Z",
        actor: { kind: "patient", id: "synthetic-maya" },
        source: "patient_ui",
        correlationId: "correlation-report-001"
      }),
      event({
        eventId: "77777777-7777-4777-8777-777777777777",
        type: "programme_task_created",
        occurredAt: "2026-07-17T09:15:00.000Z",
        correlationId: "correlation-action-001"
      })
    ]),
    note: availableResource({
      text: "Synthetic note draft already persisted.",
      version: 1,
      updatedAt: "2026-07-17T09:20:00.000Z",
      actorId: "synthetic-clinician",
      auditReference: "99999999-9999-4999-8999-999999999999"
    }),
    capabilities: {
      note: capabilities,
      acknowledge: capabilities,
      contact: capabilities,
      complete: capabilities
    }
  });
}

const receiptEventIds: Readonly<Record<ClinicianMutationKind, string>> = {
  save_note: "88888888-8888-4888-8888-888888888881",
  acknowledge: "88888888-8888-4888-8888-888888888882",
  record_contact: "88888888-8888-4888-8888-888888888883",
  complete: "88888888-8888-4888-8888-888888888884"
};

export function syntheticReceipt(input: {
  task: ClinicalTask;
  kind: ClinicianMutationKind;
  operationKey: string;
  note?: string;
  duplicateSuppressed?: boolean;
}): ClinicianMutationReceipt {
  const status =
    input.kind === "complete"
      ? "completed"
      : input.kind === "acknowledge"
        ? "acknowledged"
        : input.task.status;
  const task = syntheticTask({ ...input.task, status, updatedAt: NOW });
  return ClinicianMutationReceiptSchema.parse({
    status: "persisted",
    kind: input.kind,
    task,
    event: event({
      eventId: receiptEventIds[input.kind],
      type: `clinician_${input.kind}_persisted`,
      occurredAt: NOW,
      actor: { kind: "clinician", id: "synthetic-clinician" },
      source: "clinician_ui",
      correlationId: `correlation-${input.kind}`
    }),
    persistedAt: NOW,
    operationKey: input.operationKey,
    duplicateSuppressed: input.duplicateSuppressed ?? false,
    note:
      input.kind === "save_note"
        ? {
            text: input.note ?? "",
            version: 2,
            updatedAt: NOW,
            actorId: "synthetic-clinician",
            auditReference: receiptEventIds[input.kind]
          }
        : null
  });
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
