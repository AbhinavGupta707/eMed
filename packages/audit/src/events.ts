import {
  AdaptiveSelectionOutcomeSchema,
  CaptureQualitySchema,
  ConfirmedMedicationObservationFactSchema,
  DomainEventSchema,
  EvidenceModuleCandidateSchema,
  MedicationLabelProposalSchema,
  ProtocolResultSchema,
  SafeInferenceIdentifierSchema,
  RoundStateSchema,
  VoiceBiomarkerQualitySchema,
  type DomainEvent,
  type ProtocolResult,
  type RoundState
} from "@homerounds/contracts";
import { z } from "zod";

export const AuditActorSchema = z
  .object({
    kind: z.enum(["patient", "clinician", "system", "voice_provider"]),
    id: z.string().min(1).max(120)
  })
  .strict();

export type AuditActor = z.infer<typeof AuditActorSchema>;

const EventBaseInputSchema = z
  .object({
    eventId: z.uuid(),
    occurredAt: z.iso.datetime(),
    actor: AuditActorSchema,
    patientId: z.string().min(1).max(120),
    roundId: z.uuid(),
    correlationId: z.string().min(1).max(120),
    source: z.enum(["patient_ui", "clinician_ui", "system", "voice_provider"])
  })
  .strict();

export type EventBaseInput = z.infer<typeof EventBaseInputSchema>;

const SafeActionPayloadSchema = z
  .object({
    actionType: z.enum(["create_programme_task", "show_emergency_guidance"]),
    idempotencyKey: z.string().min(16).max(200),
    protocolId: z.string().min(1).max(120),
    protocolVersion: z.string().min(1).max(120),
    matchedRuleIds: z.array(z.string().min(1).max(120)).max(64),
    factIds: z.array(z.string().min(1).max(160)).max(64),
    outcome: ProtocolResultSchema.shape.outcome,
    allowedActions: ProtocolResultSchema.shape.allowedActions,
    missingFactKeys: ProtocolResultSchema.shape.missingFactKeys,
    explanationKey: ProtocolResultSchema.shape.explanationKey,
    messageTemplateId: z.string().min(1).max(120)
  })
  .strict();

export const ProgrammeTaskCreatedPayloadSchema = SafeActionPayloadSchema.extend({
  actionType: z.literal("create_programme_task"),
  taskId: z.uuid(),
  confirmationRecorded: z.literal(true),
  authorizationScope: z.literal("programme_task:create")
}).strict();

export const ProgrammeTaskDuplicatePayloadSchema = ProgrammeTaskCreatedPayloadSchema.omit({
  confirmationRecorded: true
}).extend({
  existingTaskId: z.uuid()
});

export const ActionAttemptFailedPayloadSchema = z
  .object({
    actionType: z.enum(["create_programme_task", "show_emergency_guidance"]),
    idempotencyKey: z.string().min(16).max(200),
    errorCode: z.string().min(1).max(120),
    retryable: z.boolean()
  })
  .strict();

export const EmergencyGuidancePresentedPayloadSchema = SafeActionPayloadSchema.extend({
  actionType: z.literal("show_emergency_guidance"),
  confirmationRecorded: z.literal(true),
  authorizationScope: z.literal("emergency_guidance:present")
}).strict();

export const PatientReportConfirmedPayloadSchema = z
  .object({
    reportId: z.uuid(),
    weakness: z.enum(["absent", "mild", "moderate", "severe", "unknown"]),
    palpitations: z.enum(["absent", "intermittent", "current", "unknown"]),
    redFlags: z
      .object({
        chestPain: z.enum(["yes", "no", "unsure"]),
        severeBreathlessness: z.enum(["yes", "no", "unsure"]),
        fainted: z.enum(["yes", "no", "unsure"])
      })
      .strict(),
    inputMode: z.enum(["text", "voice_confirmed"]),
    confirmedAt: z.iso.datetime(),
    freeTextStored: z.literal(false)
  })
  .strict();

export const MeasurementAcceptedPayloadSchema = z
  .object({
    factId: z.uuid(),
    assessmentSessionId: z.uuid(),
    provider: z.enum(["finger_ppg", "vitallens"]),
    unit: z.literal("bpm"),
    qualityStatus: z.literal("pass"),
    rawMediaStored: z.literal(false)
  })
  .strict();

export const CaptureQualityRejectedPayloadSchema = z
  .object({
    assessmentSessionId: z.uuid(),
    provider: z.enum(["finger_ppg", "vitallens"]),
    quality: CaptureQualitySchema.strict().refine(({ status }) => status !== "pass", {
      message: "a rejected capture cannot have passing quality"
    }),
    rawMediaStored: z.literal(false)
  })
  .strict();

export const FollowUpAnsweredPayloadSchema = z
  .object({
    questionId: z.string().min(1).max(80),
    answer: z.enum(["yes", "no", "unsure"]),
    answeredAt: z.iso.datetime()
  })
  .strict();

export const AdaptiveEvidenceRouteSelectedPayloadSchema = z
  .object({
    selection: AdaptiveSelectionOutcomeSchema,
    candidates: z.array(EvidenceModuleCandidateSchema).min(1).max(8),
    selectedModuleId: SafeInferenceIdentifierSchema,
    deterministicAuthorityRetained: z.literal(true),
    promptStored: z.literal(false),
    providerPayloadStored: z.literal(false)
  })
  .strict()
  .superRefine((payload, context) => {
    const selected = payload.candidates.find(({ id }) => id === payload.selectedModuleId);
    if (!selected || selected.availability.status !== "available") {
      context.addIssue({
        code: "custom",
        path: ["selectedModuleId"],
        message: "selected evidence module must be an available server candidate"
      });
    }
    if (
      payload.selection.status === "fallback" &&
      payload.selection.selectedModuleId !== payload.selectedModuleId
    ) {
      context.addIssue({
        code: "custom",
        path: ["selectedModuleId"],
        message: "fallback route must use the validated deterministic selection"
      });
    }
    if (
      payload.selection.status === "accepted" &&
      payload.selection.envelope.decision.decision === "select" &&
      payload.selection.envelope.decision.candidateModuleId !== payload.selectedModuleId
    ) {
      context.addIssue({
        code: "custom",
        path: ["selectedModuleId"],
        message: "accepted route must match the validated model proposal"
      });
    }
  });

export const MedicationLabelProposedPayloadSchema = z
  .object({
    proposal: MedicationLabelProposalSchema,
    explicitlyConfirmed: z.literal(false),
    rawMediaStored: z.literal(false),
    providerPayloadStored: z.literal(false)
  })
  .strict();

export const MedicationObservationConfirmedPayloadSchema = z
  .object({
    fact: ConfirmedMedicationObservationFactSchema,
    proposalVerified: z.boolean(),
    rawMediaStored: z.literal(false)
  })
  .strict();

export const MedicationReviewSkippedPayloadSchema = z
  .object({
    reason: z.enum(["patient_declined", "session_timeout"]),
    deterministicAuthorityRetained: z.literal(true),
    rawMediaStored: z.literal(false)
  })
  .strict();

export const VoiceBiomarkerAcceptedPayloadSchema = z
  .object({
    factId: z.uuid(),
    assessmentSessionId: z.uuid(),
    provider: z.literal("local_voice_features"),
    qualityStatus: z.literal("pass"),
    researchOnly: z.literal(true),
    rawMediaStored: z.literal(false)
  })
  .strict();

export const VoiceBiomarkerQualityRejectedPayloadSchema = z
  .object({
    assessmentSessionId: z.uuid(),
    quality: VoiceBiomarkerQualitySchema.refine(({ status }) => status !== "pass", {
      message: "a rejected voice capture cannot have passing quality"
    }),
    researchOnly: z.literal(true),
    rawMediaStored: z.literal(false)
  })
  .strict();

export const VoiceBiomarkerSkippedPayloadSchema = z
  .object({
    reason: z.enum(["patient_declined", "unsupported_device", "permission_denied"]),
    deterministicAuthorityRetained: z.literal(true),
    rawMediaStored: z.literal(false)
  })
  .strict();

export const ClinicianMutationPayloadSchema = z
  .object({
    kind: z.enum(["save_note", "acknowledge", "record_contact", "complete"]),
    taskId: z.uuid(),
    operationKey: z.string().min(16).max(200),
    beforeStatus: z.enum(["open", "acknowledged", "completed"]),
    afterStatus: z.enum(["open", "acknowledged", "completed"]),
    noteText: z.string().trim().max(2_000).nullable(),
    noteVersion: z.number().int().positive().nullable(),
    previousNoteVersion: z.number().int().nonnegative().nullable(),
    syntheticDataOnly: z.literal(true)
  })
  .strict();

export const RoundStateChangedAuditEventSchema = DomainEventSchema.extend({
  type: z.literal("round_state_changed"),
  payload: z
    .object({
      before: RoundStateSchema,
      after: RoundStateSchema,
      beforeVersion: z.number().int().nonnegative(),
      afterVersion: z.number().int().positive()
    })
    .strict()
});

function event(
  baseInput: EventBaseInput,
  type: string,
  payload: Record<string, unknown>
): DomainEvent {
  const base = EventBaseInputSchema.parse({
    eventId: baseInput.eventId,
    occurredAt: baseInput.occurredAt,
    actor: baseInput.actor,
    patientId: baseInput.patientId,
    roundId: baseInput.roundId,
    correlationId: baseInput.correlationId,
    source: baseInput.source
  });
  return DomainEventSchema.parse({
    ...base,
    type,
    schemaVersion: 1,
    payload
  });
}

type ActionEventInput = EventBaseInput & {
  readonly idempotencyKey: string;
  readonly taskId: string;
  readonly protocolResult: ProtocolResult;
  readonly messageTemplateId: string;
};

function safeActionPayload(input: ActionEventInput): z.infer<typeof SafeActionPayloadSchema> {
  const protocolResult = ProtocolResultSchema.parse(input.protocolResult);
  return SafeActionPayloadSchema.parse({
    actionType: "create_programme_task",
    idempotencyKey: input.idempotencyKey,
    protocolId: protocolResult.protocolId,
    protocolVersion: protocolResult.protocolVersion,
    matchedRuleIds: [...protocolResult.matchedRuleIds].sort(),
    factIds: [...protocolResult.factIds].sort(),
    outcome: protocolResult.outcome,
    allowedActions: [...protocolResult.allowedActions],
    missingFactKeys: [...protocolResult.missingFactKeys],
    explanationKey: protocolResult.explanationKey,
    messageTemplateId: input.messageTemplateId
  });
}

export function createProgrammeTaskCreatedEvent(input: ActionEventInput): DomainEvent {
  return event(
    input,
    "programme_task_created",
    ProgrammeTaskCreatedPayloadSchema.parse({
      ...safeActionPayload(input),
      taskId: input.taskId,
      confirmationRecorded: true,
      authorizationScope: "programme_task:create"
    })
  );
}

export function createProgrammeTaskDuplicateEvent(input: ActionEventInput): DomainEvent {
  return event(
    input,
    "programme_task_duplicate_suppressed",
    ProgrammeTaskDuplicatePayloadSchema.parse({
      ...safeActionPayload(input),
      taskId: input.taskId,
      existingTaskId: input.taskId,
      authorizationScope: "programme_task:create"
    })
  );
}

export function createActionFailedEvent(
  input: EventBaseInput & z.infer<typeof ActionAttemptFailedPayloadSchema>
): DomainEvent {
  return event(
    input,
    "action_attempt_failed",
    ActionAttemptFailedPayloadSchema.parse({
      actionType: input.actionType,
      idempotencyKey: input.idempotencyKey,
      errorCode: input.errorCode,
      retryable: input.retryable
    })
  );
}

export function createEmergencyGuidancePresentedEvent(
  input: EventBaseInput & {
    readonly idempotencyKey: string;
    readonly protocolResult: ProtocolResult;
    readonly messageTemplateId: string;
  }
): DomainEvent {
  const protocolResult = ProtocolResultSchema.parse(input.protocolResult);
  return event(
    input,
    "emergency_guidance_presented",
    EmergencyGuidancePresentedPayloadSchema.parse({
      actionType: "show_emergency_guidance",
      idempotencyKey: input.idempotencyKey,
      protocolId: protocolResult.protocolId,
      protocolVersion: protocolResult.protocolVersion,
      matchedRuleIds: [...protocolResult.matchedRuleIds].sort(),
      factIds: [...protocolResult.factIds].sort(),
      outcome: protocolResult.outcome,
      allowedActions: [...protocolResult.allowedActions],
      missingFactKeys: [...protocolResult.missingFactKeys],
      explanationKey: protocolResult.explanationKey,
      messageTemplateId: input.messageTemplateId,
      confirmationRecorded: true,
      authorizationScope: "emergency_guidance:present"
    })
  );
}

export function createPatientReportConfirmedEvent(
  input: EventBaseInput & z.infer<typeof PatientReportConfirmedPayloadSchema>
): DomainEvent {
  return event(
    input,
    "patient_report_confirmed",
    PatientReportConfirmedPayloadSchema.parse({
      reportId: input.reportId,
      weakness: input.weakness,
      palpitations: input.palpitations,
      redFlags: input.redFlags,
      inputMode: input.inputMode,
      confirmedAt: input.confirmedAt,
      freeTextStored: input.freeTextStored
    })
  );
}

export function createMeasurementAcceptedEvent(
  input: EventBaseInput & z.infer<typeof MeasurementAcceptedPayloadSchema>
): DomainEvent {
  return event(
    input,
    "measurement_accepted",
    MeasurementAcceptedPayloadSchema.parse({
      factId: input.factId,
      assessmentSessionId: input.assessmentSessionId,
      provider: input.provider,
      unit: input.unit,
      qualityStatus: input.qualityStatus,
      rawMediaStored: input.rawMediaStored
    })
  );
}

export function createCaptureQualityRejectedEvent(
  input: EventBaseInput & z.infer<typeof CaptureQualityRejectedPayloadSchema>
): DomainEvent {
  return event(
    input,
    "capture_quality_rejected",
    CaptureQualityRejectedPayloadSchema.parse({
      assessmentSessionId: input.assessmentSessionId,
      provider: input.provider,
      quality: input.quality,
      rawMediaStored: input.rawMediaStored
    })
  );
}

export function createFollowUpAnsweredEvent(
  input: EventBaseInput & z.infer<typeof FollowUpAnsweredPayloadSchema>
): DomainEvent {
  return event(
    input,
    "follow_up_answered",
    FollowUpAnsweredPayloadSchema.parse({
      questionId: input.questionId,
      answer: input.answer,
      answeredAt: input.answeredAt
    })
  );
}

export function createAdaptiveEvidenceRouteSelectedEvent(
  input: EventBaseInput & z.infer<typeof AdaptiveEvidenceRouteSelectedPayloadSchema>
): DomainEvent {
  return event(
    input,
    "adaptive_evidence_route_selected",
    AdaptiveEvidenceRouteSelectedPayloadSchema.parse({
      selection: input.selection,
      candidates: input.candidates,
      selectedModuleId: input.selectedModuleId,
      deterministicAuthorityRetained: input.deterministicAuthorityRetained,
      promptStored: input.promptStored,
      providerPayloadStored: input.providerPayloadStored
    })
  );
}

export function createMedicationLabelProposedEvent(
  input: EventBaseInput & z.infer<typeof MedicationLabelProposedPayloadSchema>
): DomainEvent {
  return event(
    input,
    "medication_label_proposed",
    MedicationLabelProposedPayloadSchema.parse({
      proposal: input.proposal,
      explicitlyConfirmed: input.explicitlyConfirmed,
      rawMediaStored: input.rawMediaStored,
      providerPayloadStored: input.providerPayloadStored
    })
  );
}

export function createMedicationObservationConfirmedEvent(
  input: EventBaseInput & z.infer<typeof MedicationObservationConfirmedPayloadSchema>
): DomainEvent {
  return event(
    input,
    "medication_observation_confirmed",
    MedicationObservationConfirmedPayloadSchema.parse({
      fact: input.fact,
      proposalVerified: input.proposalVerified,
      rawMediaStored: input.rawMediaStored
    })
  );
}

export function createMedicationReviewSkippedEvent(
  input: EventBaseInput & z.infer<typeof MedicationReviewSkippedPayloadSchema>
): DomainEvent {
  return event(
    input,
    "medication_review_skipped",
    MedicationReviewSkippedPayloadSchema.parse({
      reason: input.reason,
      deterministicAuthorityRetained: input.deterministicAuthorityRetained,
      rawMediaStored: input.rawMediaStored
    })
  );
}

export function createVoiceBiomarkerAcceptedEvent(
  input: EventBaseInput & z.infer<typeof VoiceBiomarkerAcceptedPayloadSchema>
): DomainEvent {
  return event(
    input,
    "voice_biomarker_accepted",
    VoiceBiomarkerAcceptedPayloadSchema.parse({
      factId: input.factId,
      assessmentSessionId: input.assessmentSessionId,
      provider: input.provider,
      qualityStatus: input.qualityStatus,
      researchOnly: input.researchOnly,
      rawMediaStored: input.rawMediaStored
    })
  );
}

export function createVoiceBiomarkerQualityRejectedEvent(
  input: EventBaseInput & z.infer<typeof VoiceBiomarkerQualityRejectedPayloadSchema>
): DomainEvent {
  return event(
    input,
    "voice_biomarker_quality_rejected",
    VoiceBiomarkerQualityRejectedPayloadSchema.parse({
      assessmentSessionId: input.assessmentSessionId,
      quality: input.quality,
      researchOnly: input.researchOnly,
      rawMediaStored: input.rawMediaStored
    })
  );
}

export function createVoiceBiomarkerSkippedEvent(
  input: EventBaseInput & z.infer<typeof VoiceBiomarkerSkippedPayloadSchema>
): DomainEvent {
  return event(
    input,
    "voice_biomarker_skipped",
    VoiceBiomarkerSkippedPayloadSchema.parse({
      reason: input.reason,
      deterministicAuthorityRetained: input.deterministicAuthorityRetained,
      rawMediaStored: input.rawMediaStored
    })
  );
}

export function createClinicianMutationEvent(
  input: EventBaseInput & z.infer<typeof ClinicianMutationPayloadSchema>
): DomainEvent {
  return event(
    input,
    `clinician_${input.kind}`,
    ClinicianMutationPayloadSchema.parse({
      kind: input.kind,
      taskId: input.taskId,
      operationKey: input.operationKey,
      beforeStatus: input.beforeStatus,
      afterStatus: input.afterStatus,
      noteText: input.noteText,
      noteVersion: input.noteVersion,
      previousNoteVersion: input.previousNoteVersion,
      syntheticDataOnly: input.syntheticDataOnly
    })
  );
}

export function createRoundStateChangedEvent(
  input: EventBaseInput & {
    readonly before: RoundState;
    readonly after: RoundState;
    readonly beforeVersion: number;
    readonly afterVersion: number;
  }
): z.infer<typeof RoundStateChangedAuditEventSchema> {
  const before = RoundStateSchema.parse(input.before);
  const after = RoundStateSchema.parse(input.after);
  return RoundStateChangedAuditEventSchema.parse(
    event(input, "round_state_changed", {
      before,
      after,
      beforeVersion: z.number().int().nonnegative().parse(input.beforeVersion),
      afterVersion: z.number().int().positive().parse(input.afterVersion)
    })
  );
}
