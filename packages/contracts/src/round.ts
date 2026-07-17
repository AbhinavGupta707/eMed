import { z } from "zod";

export const RoundStateSchema = z.enum([
  "invited",
  "red_flag_screen",
  "collecting_report",
  "assessment_selected",
  "capturing",
  "capture_retry",
  "assessment_complete",
  "follow_up_selected",
  "protocol_ready",
  "protocol_decided",
  "action_pending",
  "awaiting_clinician",
  "outcome_ready",
  "closed",
  "emergency_closed",
  "abstained_for_review",
  "patient_declined"
]);

export type RoundState = z.infer<typeof RoundStateSchema>;

export const RedFlagAnswerSchema = z.enum(["yes", "no", "unsure"]);

export const PatientReportSchema = z.object({
  reportId: z.uuid(),
  roundId: z.uuid(),
  weakness: z.enum(["absent", "mild", "moderate", "severe", "unknown"]),
  palpitations: z.enum(["absent", "intermittent", "current", "unknown"]),
  redFlags: z.object({
    chestPain: RedFlagAnswerSchema,
    severeBreathlessness: RedFlagAnswerSchema,
    fainted: RedFlagAnswerSchema
  }),
  note: z.string().trim().max(500).optional(),
  inputMode: z.enum(["text", "voice_confirmed"]),
  confirmedAt: z.iso.datetime()
});

export type PatientReport = z.infer<typeof PatientReportSchema>;

export const RoundSchema = z.object({
  id: z.uuid(),
  patientId: z.string().min(1),
  state: RoundStateSchema,
  stateVersion: z.number().int().nonnegative(),
  purpose: z.string().min(1).max(240),
  triggerId: z.string().min(1),
  burdenSecondsRemaining: z.number().int().nonnegative(),
  protocolId: z.string().min(1),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  closedAt: z.iso.datetime().nullable()
});

export type Round = z.infer<typeof RoundSchema>;

export const ProtocolResultSchema = z.object({
  protocolId: z.string().min(1),
  protocolVersion: z.string().min(1),
  matchedRuleIds: z.array(z.string().min(1)),
  factIds: z.array(z.string().min(1)),
  outcome: z.enum(["programme_review_requested", "emergency_guidance", "abstain_for_review"]),
  allowedActions: z.array(z.enum(["create_programme_task", "show_emergency_guidance"])),
  missingFactKeys: z.array(z.string().min(1)),
  explanationKey: z.string().min(1)
});

export type ProtocolResult = z.infer<typeof ProtocolResultSchema>;

export const ClinicalTaskSchema = z.object({
  id: z.uuid(),
  roundId: z.uuid(),
  patientId: z.string().min(1),
  idempotencyKey: z.string().min(16).max(200),
  type: z.literal("programme_review"),
  ownerRole: z.literal("programme_clinician"),
  priority: z.enum(["routine", "priority", "urgent_demo_only"]),
  reasonKey: z.string().min(1),
  status: z.enum(["open", "acknowledged", "completed"]),
  serviceWindowLabel: z.string().min(1),
  protocolId: z.string().min(1),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime()
});

export type ClinicalTask = z.infer<typeof ClinicalTaskSchema>;

export const DomainEventSchema = z.object({
  eventId: z.uuid(),
  type: z.string().min(1),
  schemaVersion: z.literal(1),
  occurredAt: z.iso.datetime(),
  actor: z.object({
    kind: z.enum(["patient", "clinician", "system", "voice_provider"]),
    id: z.string().min(1)
  }),
  patientId: z.string().min(1),
  roundId: z.uuid(),
  correlationId: z.string().min(1),
  source: z.enum(["patient_ui", "clinician_ui", "system", "voice_provider"]),
  payload: z.record(z.string(), z.unknown())
});

export type DomainEvent = z.infer<typeof DomainEventSchema>;
