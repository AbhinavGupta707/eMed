import { describe, expect, it } from "vitest";

import {
  CareActionServiceError,
  InMemoryCareActionRepository,
  SYNTHETIC_CARE_ACTION_ALLOWLIST,
  SubmitCareActionInputSchema,
  SyntheticCareActionService,
  reconstructCareActionState,
  type CareActionAuthority,
  type SubmitCareActionInput
} from "../../../packages/actions/src/index";
import {
  AdaptiveSelectionService,
  FakeAdaptiveSelectionProvider
} from "../../../packages/inference/src/index";
import { adaptiveInputFixture } from "../../../packages/inference/src/test-fixtures";

const NOW = "2026-07-18T12:00:00.000Z";
const ROUND_ID = "83000000-0000-4000-8000-000000000001";
const PATIENT_ID = "synthetic-maya";

function ids(): () => string {
  let value = 1;
  return () => `83000000-0000-4000-8000-${String(value++).padStart(12, "0")}`;
}

function authority(overrides: Partial<CareActionAuthority> = {}): CareActionAuthority {
  return {
    roundId: ROUND_ID,
    patientId: PATIENT_ID,
    roundVersion: 9,
    roundState: "awaiting_clinician",
    redFlagGate: "clear",
    eligibleActions: [...SYNTHETIC_CARE_ACTION_ALLOWLIST],
    evidence: {
      summary: "The deterministic workflow requested review of confirmed structured evidence.",
      protocolId: "cardiometabolic_demo",
      protocolVersion: "1.0.0",
      protocolOutcome: "programme_review_requested",
      sourceFactIds: ["synthetic-confirmed-fact"],
      captureQuality: "pass",
      measurementState: "accepted",
      redFlagGate: "clear",
      generatedAt: NOW,
      rawTranscriptStored: false,
      modelReasoningStored: false,
      rawMediaStored: false
    },
    ...overrides
  };
}

function submission(overrides: Partial<SubmitCareActionInput> = {}): SubmitCareActionInput {
  return {
    roundId: ROUND_ID,
    patientId: PATIENT_ID,
    details: {
      kind: "synthetic_appointment_request",
      preferredWindow: "afternoon",
      confirmedSummary: "Request a synthetic programme review appointment."
    },
    confirmation: {
      confirmed: true,
      confirmedAt: NOW,
      confirmationKind: "explicit_patient_confirmation",
      confirmationVersion: "care-action-confirmation-v1",
      reviewedFields: [
        "action_kind",
        "confirmed_summary",
        "synthetic_boundary",
        "preferred_window"
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
    expectedRoundVersion: 9,
    operationKey: "final-pass-patient-submit",
    correlationId: "final-pass-care-action",
    ...overrides
  };
}

function harness(authorityValue = authority()) {
  const repository = new InMemoryCareActionRepository([authorityValue]);
  return {
    repository,
    service: new SyntheticCareActionService({ repository, now: () => NOW, createId: ids() })
  };
}

function clinicianMutation(input: {
  actionId: string;
  version: number;
  kind: "approve" | "record_contact" | "complete" | "retry";
  operationKey: string;
}) {
  const scopes = {
    approve: "synthetic_care_action:approve",
    record_contact: "synthetic_care_action:contact",
    complete: "synthetic_care_action:complete",
    retry: "synthetic_care_action:retry"
  } as const;
  const mutation =
    input.kind === "record_contact"
      ? {
          kind: "record_contact" as const,
          outcome: "attempted_synthetic_contact_no_external_delivery" as const
        }
      : input.kind === "complete"
        ? { kind: "complete" as const, completion: "synthetic_workflow_closed" as const }
        : { kind: input.kind };
  return {
    actionId: input.actionId,
    mutation,
    authorization: {
      authorized: true as const,
      actorKind: "clinician" as const,
      actorId: "synthetic-clinician-session",
      patientId: PATIENT_ID,
      scope: scopes[input.kind]
    },
    expectedVersion: input.version,
    operationKey: input.operationKey,
    correlationId: `final-pass-${input.kind}`
  };
}

describe("final-pass action allowlist and concurrency", () => {
  it("admits exactly three synthetic-only actions and rejects tampering before persistence", async () => {
    expect(SYNTHETIC_CARE_ACTION_ALLOWLIST).toEqual([
      "synthetic_appointment_request",
      "synthetic_refill_review_request",
      "synthetic_care_team_message"
    ]);
    expect(
      SubmitCareActionInputSchema.safeParse({
        ...submission(),
        details: {
          kind: "send_to_real_pharmacy",
          confirmedSummary: "Send this outside HomeRounds."
        }
      }).success
    ).toBe(false);
    expect(
      SubmitCareActionInputSchema.safeParse({
        ...submission(),
        confirmation: { ...submission().confirmation, syntheticBoundaryAccepted: false }
      }).success
    ).toBe(false);
    expect(
      SubmitCareActionInputSchema.safeParse({
        ...submission(),
        authorization: { ...submission().authorization, actorKind: "clinician" }
      }).success
    ).toBe(false);

    const { repository, service } = harness();
    await expect(service.submit(submission({ expectedRoundVersion: 8 }))).rejects.toMatchObject({
      code: "stale_round"
    });
    await expect(repository.listActionsForRound(ROUND_ID)).resolves.toEqual([]);
  });

  it("blocks red flags and unknown authority without a false action or service claim", async () => {
    for (const blocked of [
      authority({ redFlagGate: "stop", eligibleActions: [], evidence: null }),
      authority({ redFlagGate: "unknown", eligibleActions: [], evidence: null })
    ]) {
      const { repository, service } = harness(blocked);
      await expect(service.submit(submission())).rejects.toBeInstanceOf(CareActionServiceError);
      await expect(repository.listActionsForRound(ROUND_ID)).resolves.toEqual([]);
    }
  });

  it("suppresses concurrent submissions and reconstructs audited clinician ownership/completion", async () => {
    const { repository, service } = harness();
    const [first, second, third] = await Promise.all([
      service.submit(submission()),
      service.submit(submission({ operationKey: "final-pass-patient-submit-retry-a" })),
      service.submit(submission({ operationKey: "final-pass-patient-submit-retry-b" }))
    ]);
    expect(new Set([first.action.id, second.action.id, third.action.id])).toHaveLength(1);
    expect([first.created, second.created, third.created].filter(Boolean)).toHaveLength(1);
    expect(first.action.delivery).toBe("synthetic_only_not_sent");
    await expect(repository.listActionsForRound(ROUND_ID)).resolves.toHaveLength(1);

    const approved = await service.mutate(
      clinicianMutation({
        actionId: first.action.id,
        version: 1,
        kind: "approve",
        operationKey: "final-pass-clinician-approve"
      })
    );
    const contacted = await service.mutate(
      clinicianMutation({
        actionId: first.action.id,
        version: approved.action.version,
        kind: "record_contact",
        operationKey: "final-pass-clinician-contact"
      })
    );
    const completed = await service.mutate(
      clinicianMutation({
        actionId: first.action.id,
        version: contacted.action.version,
        kind: "complete",
        operationKey: "final-pass-clinician-complete"
      })
    );
    expect(completed.action).toMatchObject({
      status: "completed",
      ownerId: "synthetic-clinician-session",
      delivery: "synthetic_only_not_sent"
    });

    const audit = await service.audit(first.action.id);
    expect(audit.map(({ type }) => type)).toEqual([
      "submitted",
      "duplicate_suppressed",
      "duplicate_suppressed",
      "approved",
      "contact_attempted",
      "completed"
    ]);
    expect(reconstructCareActionState(audit)).toMatchObject({ status: "completed", version: 4 });
    expect(audit).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rawTranscriptStored: false,
          modelReasoningStored: false,
          providerPayloadStored: false,
          rawMediaStored: false
        })
      ])
    );

    const stale = service.mutate(
      clinicianMutation({
        actionId: first.action.id,
        version: 3,
        kind: "complete",
        operationKey: "final-pass-stale-complete"
      })
    );
    await expect(stale).rejects.toMatchObject({ code: "stale_action" });
  });

  it("records an internal failure, retries only when allowed, and never implies external delivery", async () => {
    const { service } = harness();
    const submitted = await service.submit(submission());
    const failed = await service.recordFailure({
      actionId: submitted.action.id,
      expectedVersion: 1,
      code: "workflow_unavailable",
      retryable: true,
      operationKey: "final-pass-record-failure",
      correlationId: "final-pass-failure"
    });
    expect(failed.action).toMatchObject({
      status: "failed",
      delivery: "synthetic_only_not_sent",
      lastFailure: { code: "workflow_unavailable", retryable: true }
    });
    const retried = await service.mutate(
      clinicianMutation({
        actionId: submitted.action.id,
        version: failed.action.version,
        kind: "retry",
        operationKey: "final-pass-retry"
      })
    );
    expect(retried.action).toMatchObject({
      status: "pending_review",
      delivery: "synthetic_only_not_sent",
      lastFailure: null
    });
  });
});

describe("final-pass AI abstention and failure authority", () => {
  async function outcome(profile: "abstain" | "failure", redFlagGate: "clear" | "blocked") {
    const input = adaptiveInputFixture({ redFlagGate });
    const provider = new FakeAdaptiveSelectionProvider({
      createId: () => "83000000-0000-4000-8000-000000000099",
      now: () => NOW,
      profile
    });
    const service = new AdaptiveSelectionService({
      provider,
      readAuthorityState: async () => ({
        roundId: input.roundId,
        stateVersion: input.stateVersion,
        syntheticDataOnly: true,
        redFlagGate
      })
    });
    return service.select(input, new AbortController().signal);
  }

  it("falls back on abstention and provider failure while retaining deterministic authority", async () => {
    await expect(outcome("abstain", "clear")).resolves.toMatchObject({
      status: "accepted",
      envelope: {
        decision: { decision: "abstain", candidateModuleId: null },
        provenance: { provider: "fake", task: "adaptive_module_selection" }
      }
    });
    await expect(outcome("failure", "clear")).resolves.toMatchObject({
      status: "fallback",
      reason: "provider_failure",
      selectedModuleId: "pulse.local",
      failure: { code: "provider_unavailable" }
    });
  });

  it("does not invoke model authority after a red-flag hard stop", async () => {
    await expect(outcome("failure", "blocked")).resolves.toMatchObject({
      status: "fallback",
      reason: "red_flag_gate_not_clear",
      selectedModuleId: "pulse.local",
      failure: null
    });
  });
});
