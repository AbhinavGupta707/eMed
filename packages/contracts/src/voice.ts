import { z } from "zod";

import { PatientReportSchema } from "./round";

export const VoiceProviderKindSchema = z.enum(["disabled", "elevenlabs"]);
export type VoiceProviderKind = z.infer<typeof VoiceProviderKindSchema>;

export const VoiceServerLocationSchema = z.enum(["global", "us", "eu-residency", "in-residency"]);
export type VoiceServerLocation = z.infer<typeof VoiceServerLocationSchema>;

export const VoiceAgentReportFieldSchema = z.enum([
  "weakness",
  "palpitations",
  "chest_pain",
  "severe_breathlessness",
  "fainted"
]);
export type VoiceAgentReportField = z.infer<typeof VoiceAgentReportFieldSchema>;

/**
 * A voice agent may propose only values the patient can review. This is never a
 * confirmed report and cannot advance the round. Unknown and uncertain values
 * stay explicit instead of being converted to reassuring defaults.
 */
export const VoiceAgentReportProposalSchema = z
  .object({
    contractVersion: z.literal("voice-report-proposal.v1"),
    weakness: PatientReportSchema.shape.weakness,
    palpitations: PatientReportSchema.shape.palpitations,
    redFlags: PatientReportSchema.shape.redFlags,
    note: z.string().trim().min(1).max(500).nullable(),
    unresolvedFields: z.array(VoiceAgentReportFieldSchema).max(5)
  })
  .strict()
  .superRefine((proposal, context) => {
    const unresolved = new Set(proposal.unresolvedFields);
    const expectedUnknown: ReadonlyArray<readonly [VoiceAgentReportField, boolean]> = [
      ["weakness", proposal.weakness === "unknown"],
      ["palpitations", proposal.palpitations === "unknown"],
      ["chest_pain", proposal.redFlags.chestPain === "unsure"],
      ["severe_breathlessness", proposal.redFlags.severeBreathlessness === "unsure"],
      ["fainted", proposal.redFlags.fainted === "unsure"]
    ];
    for (const [field, isUnknown] of expectedUnknown) {
      if (unresolved.has(field) !== isUnknown) {
        context.addIssue({
          code: "custom",
          path: ["unresolvedFields"],
          message: `${field} must be unresolved exactly when its value is unknown or unsure`
        });
      }
    }
  });
export type VoiceAgentReportProposal = z.infer<typeof VoiceAgentReportProposalSchema>;

export const VoiceAgentToolOutcomeSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("pending_confirmation"),
      proposalId: z.uuid(),
      message: z.string().trim().min(1).max(240)
    })
    .strict(),
  z
    .object({
      status: z.literal("not_ready"),
      reason: z.enum([
        "report_not_confirmed",
        "required_answer_missing",
        "round_state_changed",
        "tool_unavailable"
      ]),
      message: z.string().trim().min(1).max(240)
    })
    .strict(),
  z
    .object({
      status: z.literal("accepted"),
      message: z.string().trim().min(1).max(240)
    })
    .strict()
]);
export type VoiceAgentToolOutcome = z.infer<typeof VoiceAgentToolOutcomeSchema>;

export const VoiceSessionContextSchema = z
  .object({
    syntheticDataOnly: z.literal(true),
    patientAlias: z.string().trim().min(1).max(40),
    roundPurpose: z.string().trim().min(1).max(240),
    historySummary: z.string().trim().min(1).max(800)
  })
  .strict();
export type VoiceSessionContext = z.infer<typeof VoiceSessionContextSchema>;

export type VoiceAgentClientToolHandlers = Readonly<{
  proposePatientReport(proposal: VoiceAgentReportProposal): Promise<VoiceAgentToolOutcome>;
  requestNextRoundStep(): Promise<VoiceAgentToolOutcome>;
}>;

export const VoicePresentationEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("connecting") }),
  z.object({ type: z.literal("connected"), sessionId: z.string().min(1) }),
  z.object({ type: z.literal("permission_required"), permission: z.literal("microphone") }),
  z.object({ type: z.literal("listening") }),
  z.object({ type: z.literal("transcript_tentative"), text: z.string().max(2000) }),
  z.object({ type: z.literal("transcript_final"), text: z.string().max(2000) }),
  z.object({ type: z.literal("narration"), text: z.string().max(1000) }),
  z.object({
    type: z.literal("report_proposed"),
    report: PatientReportSchema.omit({ confirmedAt: true })
  }),
  z.object({ type: z.literal("muted"), muted: z.boolean() }),
  z.object({ type: z.literal("reconnecting"), attempt: z.number().int().positive() }),
  z.object({
    type: z.literal("unavailable"),
    reason: z.enum(["disabled", "missing_configuration", "unsupported", "quota", "network"])
  }),
  z.object({
    type: z.literal("error"),
    recoverable: z.boolean(),
    code: z.enum(["permission_denied", "token", "network", "quota", "malformed_event", "provider"])
  }),
  z.object({ type: z.literal("ended"), reason: z.string().min(1).max(120) })
]);

export type VoicePresentationEvent = z.infer<typeof VoicePresentationEventSchema>;

export type VoiceSessionProvider = {
  readonly kind: VoiceProviderKind;
  capabilities(): Promise<{ available: boolean; voice: boolean; text: boolean }>;
  start(input: {
    roundId: string;
    phase: string;
    signal: AbortSignal;
    context?: VoiceSessionContext;
    clientTools?: VoiceAgentClientToolHandlers;
  }): Promise<{ sessionId: string }>;
  stop(reason: string): Promise<void>;
  setMuted(muted: boolean): Promise<void>;
  sendText?(text: string): Promise<void>;
  subscribe(listener: (event: VoicePresentationEvent) => void): () => void;
};
