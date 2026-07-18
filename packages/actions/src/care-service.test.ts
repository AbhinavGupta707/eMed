import { describe, expect, it } from "vitest";

import { InMemoryCareActionRepository } from "./care-repository";
import {
  ClinicianCareActionMutationKindSchema,
  MutateCareActionInputSchema,
  SubmitCareActionInputSchema,
  type CareActionAuthority,
  type CareActionDetails,
  type ClinicianCareActionMutationKind,
  type MutateCareActionInput,
  type SubmitCareActionInput
} from "./care-schemas";
import {
  CareActionServiceError,
  SyntheticCareActionService,
  reconstructCareActionState
} from "./care-service";

const ROUND_ID = "137c9d4f-4dfc-4b95-a5ce-657ba00b29b4";
const NOW = "2026-07-18T10:00:00.000Z";
const PATIENT_ID = "synthetic-maya";

function idFactory(): () => string {
  let value = 1;
  return () => `00000000-0000-4000-8000-${String(value++).padStart(12, "0")}`;
}

function authority(overrides: Partial<CareActionAuthority> = {}): CareActionAuthority {
  return {
    roundId: ROUND_ID,
    patientId: PATIENT_ID,
    roundVersion: 12,
    roundState: "awaiting_clinician",
    redFlagGate: "clear",
    eligibleActions: [
      "synthetic_appointment_request",
      "synthetic_refill_review_request",
      "synthetic_care_team_message"
    ],
    evidence: {
      summary: "Confirmed structured change is ready for synthetic review.",
      protocolId: "cardiometabolic_demo",
      protocolVersion: "1.0.0",
      protocolOutcome: "programme_review_requested",
      sourceFactIds: ["fact-confirmed-1"],
      captureQuality: "unknown",
      measurementState: "not_accepted",
      redFlagGate: "clear",
      generatedAt: NOW,
      rawTranscriptStored: false,
      modelReasoningStored: false,
      rawMediaStored: false
    },
    ...overrides
  };
}

const appointment: CareActionDetails = {
  kind: "synthetic_appointment_request",
  preferredWindow: "afternoon",
  confirmedSummary: "Request a synthetic programme review appointment."
};

function submitInput(
  details: CareActionDetails = appointment,
  overrides: Partial<SubmitCareActionInput> = {}
): SubmitCareActionInput {
  const kindFields: Record<CareActionDetails["kind"], string[]> = {
    synthetic_appointment_request: ["preferred_window"],
    synthetic_refill_review_request: ["medication_display", "supply_state"],
    synthetic_care_team_message: ["topic"]
  };
  return {
    roundId: ROUND_ID,
    patientId: PATIENT_ID,
    details,
    confirmation: {
      confirmed: true,
      confirmedAt: NOW,
      confirmationKind: "explicit_patient_confirmation",
      confirmationVersion: "care-action-confirmation-v1",
      reviewedFields: [
        "action_kind",
        "confirmed_summary",
        "synthetic_boundary",
        ...kindFields[details.kind]
      ],
      syntheticBoundaryAccepted: true
    },
    authorization: {
      authorized: true,
      actorKind: "patient",
      actorId: "synthetic-patient-session",
      patientId: PATIENT_ID,
      scope: "synthetic_care_action:create"
    },
    expectedRoundVersion: 12,
    operationKey: `patient-submit-${details.kind}`,
    correlationId: "correlation-submit-1",
    ...overrides
  };
}

function mutationInput(input: {
  actionId: string;
  version: number;
  patientId?: string;
  kind: ClinicianCareActionMutationKind;
  operationSuffix?: string;
}): MutateCareActionInput {
  const scope = {
    approve: "synthetic_care_action:approve",
    edit: "synthetic_care_action:edit",
    record_contact: "synthetic_care_action:contact",
    complete: "synthetic_care_action:complete",
    retry: "synthetic_care_action:retry"
  } as const;
  const mutation =
    input.kind === "edit"
      ? { kind: "edit" as const, clinicianSummary: "Edited confirmed synthetic summary." }
      : input.kind === "record_contact"
        ? {
            kind: "record_contact" as const,
            outcome: "attempted_synthetic_contact_no_external_delivery" as const
          }
        : input.kind === "complete"
          ? { kind: "complete" as const, completion: "synthetic_workflow_closed" as const }
          : { kind: input.kind as "approve" | "retry" };
  return MutateCareActionInputSchema.parse({
    actionId: input.actionId,
    mutation,
    authorization: {
      authorized: true,
      actorKind: "clinician",
      actorId: "synthetic-clinician-session",
      patientId: input.patientId ?? PATIENT_ID,
      scope: scope[input.kind]
    },
    expectedVersion: input.version,
    operationKey: `clinician-${input.kind}-${input.operationSuffix ?? input.version}`,
    correlationId: `correlation-${input.kind}`
  });
}

function setup(authorityValue = authority()) {
  const repository = new InMemoryCareActionRepository([authorityValue]);
  const service = new SyntheticCareActionService({
    repository,
    now: () => NOW,
    createId: idFactory()
  });
  return { repository, service };
}

describe("synthetic care action authority and lifecycle", () => {
  it("admits exactly the three synthetic action kinds and rejects tampering or incomplete confirmation", () => {
    expect(ClinicianCareActionMutationKindSchema.options).toEqual([
      "approve",
      "edit",
      "record_contact",
      "complete",
      "retry"
    ]);
    expect(
      SubmitCareActionInputSchema.safeParse({
        ...submitInput(),
        details: { ...appointment, kind: "send_to_real_clinic" }
      }).success
    ).toBe(false);
    const validMutation = mutationInput({
      actionId: "20000000-0000-4000-8000-000000000001",
      version: 1,
      kind: "approve"
    });
    expect(
      MutateCareActionInputSchema.safeParse({
        ...validMutation,
        authorization: { ...validMutation.authorization, actorKind: "patient" }
      }).success
    ).toBe(false);
    expect(
      SubmitCareActionInputSchema.safeParse({
        ...submitInput(),
        confirmation: { ...submitInput().confirmation, reviewedFields: ["action_kind"] }
      }).success
    ).toBe(false);
  });

  it.each([
    appointment,
    {
      kind: "synthetic_refill_review_request" as const,
      medicationDisplay: "Synthetic Demo Tablets 10 mg",
      supplyState: "running_low" as const,
      confirmedSummary: "Request a synthetic refill review."
    },
    {
      kind: "synthetic_care_team_message" as const,
      topic: "programme" as const,
      confirmedSummary: "Ask the synthetic programme team to review the confirmed change."
    }
  ])("creates an audit-ready %s without any external-delivery claim", async (details) => {
    const { service } = setup();
    const receipt = await service.submit(submitInput(details));

    expect(receipt).toMatchObject({
      status: "persisted",
      created: true,
      duplicateSuppressed: false,
      action: {
        kind: details.kind,
        status: "pending_review",
        delivery: "synthetic_only_not_sent"
      }
    });
    expect(receipt.action.evidence).toMatchObject({
      rawTranscriptStored: false,
      modelReasoningStored: false,
      rawMediaStored: false
    });
  });

  it("blocks action submission when red-flag authority is stop, unknown, or not allowlisted", async () => {
    const stopped = setup(
      authority({ redFlagGate: "stop", evidence: null, eligibleActions: [] })
    ).service;
    await expect(stopped.submit(submitInput())).rejects.toMatchObject({
      code: "red_flag_blocked"
    });

    const unknown = setup(
      authority({ redFlagGate: "unknown", evidence: null, eligibleActions: [] })
    ).service;
    await expect(unknown.submit(submitInput())).rejects.toMatchObject({
      code: "authority_unknown"
    });

    const notAllowed = setup(authority({ eligibleActions: [] })).service;
    await expect(notAllowed.submit(submitInput())).rejects.toMatchObject({
      code: "action_not_allowed"
    });
  });

  it("suppresses sequential and concurrent duplicate submissions", async () => {
    const { repository, service } = setup();
    const first = await service.submit(submitInput());
    const second = await service.submit(
      submitInput(appointment, { operationKey: "patient-submit-retry-0001" })
    );
    const concurrent = await Promise.all([
      service.submit(submitInput(appointment, { operationKey: "patient-submit-concurrent-a" })),
      service.submit(submitInput(appointment, { operationKey: "patient-submit-concurrent-b" }))
    ]);

    expect(first.created).toBe(true);
    expect(second).toMatchObject({ created: false, duplicateSuppressed: true });
    expect(concurrent.every((receipt) => receipt.created === false)).toBe(true);
    expect(await repository.listActionsForRound(ROUND_ID)).toHaveLength(1);
    expect((await repository.listAuditEvents(first.action.id)).map(({ type }) => type)).toEqual([
      "submitted",
      "duplicate_suppressed",
      "duplicate_suppressed",
      "duplicate_suppressed"
    ]);
  });

  it("rejects stale round, unauthorized patient, wrong role, and stale clinician versions", async () => {
    const { service } = setup();
    await expect(
      service.submit(submitInput(appointment, { expectedRoundVersion: 11 }))
    ).rejects.toMatchObject({ code: "stale_round", retryable: true });
    expect(
      SubmitCareActionInputSchema.safeParse({
        ...submitInput(),
        authorization: { ...submitInput().authorization, actorKind: "clinician" }
      }).success
    ).toBe(false);
    expect(
      SubmitCareActionInputSchema.safeParse({
        ...submitInput(),
        authorization: { ...submitInput().authorization, patientId: "synthetic-other" }
      }).success
    ).toBe(false);

    const submitted = await service.submit(submitInput());
    await expect(
      service.mutate(
        mutationInput({
          actionId: submitted.action.id,
          version: submitted.action.version,
          patientId: "synthetic-other",
          kind: "approve"
        })
      )
    ).rejects.toMatchObject({ code: "unauthorized_patient" });
    await expect(
      service.mutate(mutationInput({ actionId: submitted.action.id, version: 99, kind: "approve" }))
    ).rejects.toMatchObject({ code: "stale_action", retryable: true });
  });

  it("allows only one of two concurrent writes at the same version", async () => {
    const { service } = setup();
    const submitted = await service.submit(submitInput());
    const results = await Promise.allSettled([
      service.mutate(
        mutationInput({
          actionId: submitted.action.id,
          version: 1,
          kind: "approve",
          operationSuffix: "parallel-a"
        })
      ),
      service.mutate(
        mutationInput({
          actionId: submitted.action.id,
          version: 1,
          kind: "approve",
          operationSuffix: "parallel-b"
        })
      )
    ]);

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(({ status }) => status === "rejected");
    expect(rejected).toMatchObject({
      status: "rejected",
      reason: expect.objectContaining({ code: "stale_action" })
    });
  });

  it("records a safe failure, retries it idempotently, and reconstructs completion", async () => {
    const { repository, service } = setup();
    const submitted = await service.submit(submitInput());
    const failed = await service.recordFailure({
      actionId: submitted.action.id,
      expectedVersion: 1,
      code: "workflow_unavailable",
      retryable: true,
      operationKey: "system-failure-operation-1",
      correlationId: "correlation-failure"
    });
    expect(failed.action).toMatchObject({
      status: "failed",
      lastFailure: { code: "workflow_unavailable", retryable: true }
    });

    const retryInput = mutationInput({
      actionId: submitted.action.id,
      version: failed.action.version,
      kind: "retry"
    });
    const retried = await service.mutate(retryInput);
    const duplicateRetry = await service.mutate(retryInput);
    expect(retried.action).toMatchObject({ status: "pending_review", lastFailure: null });
    expect(duplicateRetry.duplicateSuppressed).toBe(true);

    const approved = await service.mutate(
      mutationInput({ actionId: submitted.action.id, version: 3, kind: "approve" })
    );
    const edited = await service.mutate(
      mutationInput({ actionId: submitted.action.id, version: 4, kind: "edit" })
    );
    const contacted = await service.mutate(
      mutationInput({ actionId: submitted.action.id, version: 5, kind: "record_contact" })
    );
    const completed = await service.mutate(
      mutationInput({ actionId: submitted.action.id, version: 6, kind: "complete" })
    );

    expect(approved.action.status).toBe("approved");
    expect(edited.action.clinicianSummary).toBe("Edited confirmed synthetic summary.");
    expect(contacted.action.status).toBe("contact_attempted");
    expect(completed.action).toMatchObject({ status: "completed", version: 7 });
    expect(
      reconstructCareActionState(await repository.listAuditEvents(submitted.action.id))
    ).toEqual({ status: "completed", version: 7, lastEventAt: NOW });
  });

  it("reconstructs unsupported or incomplete event histories as safely unknown", async () => {
    const { repository, service } = setup();
    const submitted = await service.submit(submitInput());
    const [created] = await repository.listAuditEvents(submitted.action.id);
    expect(created).toBeDefined();
    if (!created) throw new CareActionServiceError("operation_conflict", false);
    expect(
      reconstructCareActionState([{ ...created, type: "completed", status: "completed" }])
    ).toEqual({ status: "unknown", version: null, lastEventAt: null });
  });
});
