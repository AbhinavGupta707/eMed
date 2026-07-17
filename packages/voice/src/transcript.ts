import { PatientReportSchema, type PatientReport } from "@homerounds/contracts/round";
import { z } from "zod";

export const TranscriptSourceSchema = z.enum(["voice_provider", "typed_text"]);
export type TranscriptSource = z.infer<typeof TranscriptSourceSchema>;

export const TranscriptProposalSchema = z
  .object({
    proposalId: z.uuid(),
    roundId: z.uuid(),
    generation: z.number().int().positive(),
    source: TranscriptSourceSchema,
    text: z.string().trim().min(1).max(2000),
    isFinal: z.boolean(),
    edited: z.boolean(),
    revision: z.number().int().positive()
  })
  .strict();
export type TranscriptProposal = z.infer<typeof TranscriptProposalSchema>;

export const TranscriptConfirmationSchema = z
  .object({
    proposalId: z.uuid(),
    roundId: z.uuid(),
    source: TranscriptSourceSchema,
    text: z.string().trim().min(1).max(2000),
    revision: z.number().int().positive(),
    confirmedAt: z.iso.datetime()
  })
  .strict();
export type TranscriptConfirmation = z.infer<typeof TranscriptConfirmationSchema>;

export const TranscriptStateSchema = z
  .object({
    roundId: z.uuid(),
    generation: z.number().int().positive(),
    proposal: TranscriptProposalSchema.nullable(),
    confirmation: TranscriptConfirmationSchema.nullable(),
    acceptedEventIds: z.array(z.string().min(1).max(120)).max(32)
  })
  .strict();
export type TranscriptState = z.infer<typeof TranscriptStateSchema>;

const TranscriptEventBaseSchema = z.object({ eventId: z.string().trim().min(1).max(120) });

export const TranscriptEventSchema = z.discriminatedUnion("type", [
  TranscriptEventBaseSchema.extend({
    type: z.literal("provider_transcript"),
    generation: z.number().int().positive(),
    proposalId: z.uuid(),
    text: z.string().max(2000),
    isFinal: z.boolean()
  }).strict(),
  TranscriptEventBaseSchema.extend({
    type: z.literal("text_entered"),
    proposalId: z.uuid(),
    text: z.string().max(2000)
  }).strict(),
  TranscriptEventBaseSchema.extend({
    type: z.literal("edit"),
    text: z.string().max(2000)
  }).strict(),
  TranscriptEventBaseSchema.extend({
    type: z.literal("confirm"),
    confirmedAt: z.iso.datetime()
  }).strict()
]);
export type TranscriptEvent = z.infer<typeof TranscriptEventSchema>;

export type TranscriptTransition = Readonly<{
  state: TranscriptState;
  accepted: boolean;
  rejection?:
    | "duplicate_event"
    | "late_event"
    | "already_confirmed"
    | "missing_proposal"
    | "tentative_proposal";
}>;

export const StructuredPatientReportFieldsSchema = PatientReportSchema.pick({
  weakness: true,
  palpitations: true,
  redFlags: true,
  note: true
}).strict();
export type StructuredPatientReportFields = z.infer<typeof StructuredPatientReportFieldsSchema>;

export function createTranscriptState(roundId: string, generation: number): TranscriptState {
  return TranscriptStateSchema.parse({
    roundId,
    generation,
    proposal: null,
    confirmation: null,
    acceptedEventIds: []
  });
}

function rejected(
  state: TranscriptState,
  rejection: NonNullable<TranscriptTransition["rejection"]>
): TranscriptTransition {
  return { state, accepted: false, rejection };
}

function accepted(state: TranscriptState, eventId: string): TranscriptTransition {
  return {
    state: TranscriptStateSchema.parse({
      ...state,
      acceptedEventIds: [...state.acceptedEventIds.slice(-31), eventId]
    }),
    accepted: true
  };
}

/** Keeps only the current in-memory draft; callers must not persist this state by default. */
export function reduceTranscript(
  current: TranscriptState,
  rawEvent: TranscriptEvent
): TranscriptTransition {
  const state = TranscriptStateSchema.parse(current);
  const event = TranscriptEventSchema.parse(rawEvent);
  if (state.acceptedEventIds.includes(event.eventId)) return rejected(state, "duplicate_event");
  if (state.confirmation) return rejected(state, "already_confirmed");

  switch (event.type) {
    case "provider_transcript": {
      if (event.generation !== state.generation) return rejected(state, "late_event");
      const text = event.text.trim();
      if (text.length === 0) return rejected(state, "missing_proposal");
      const revision = (state.proposal?.revision ?? 0) + 1;
      return accepted(
        {
          ...state,
          proposal: TranscriptProposalSchema.parse({
            proposalId: event.proposalId,
            roundId: state.roundId,
            generation: state.generation,
            source: "voice_provider",
            text,
            isFinal: event.isFinal,
            edited: false,
            revision
          })
        },
        event.eventId
      );
    }
    case "text_entered": {
      const text = event.text.trim();
      if (text.length === 0) return rejected(state, "missing_proposal");
      return accepted(
        {
          ...state,
          proposal: TranscriptProposalSchema.parse({
            proposalId: event.proposalId,
            roundId: state.roundId,
            generation: state.generation,
            source: "typed_text",
            text,
            isFinal: true,
            edited: false,
            revision: (state.proposal?.revision ?? 0) + 1
          })
        },
        event.eventId
      );
    }
    case "edit": {
      if (!state.proposal) return rejected(state, "missing_proposal");
      const text = event.text.trim();
      if (text.length === 0) return rejected(state, "missing_proposal");
      return accepted(
        {
          ...state,
          proposal: TranscriptProposalSchema.parse({
            ...state.proposal,
            text,
            isFinal: true,
            edited: true,
            revision: state.proposal.revision + 1
          })
        },
        event.eventId
      );
    }
    case "confirm": {
      if (!state.proposal) return rejected(state, "missing_proposal");
      if (!state.proposal.isFinal) return rejected(state, "tentative_proposal");
      return accepted(
        {
          ...state,
          confirmation: TranscriptConfirmationSchema.parse({
            proposalId: state.proposal.proposalId,
            roundId: state.roundId,
            source: state.proposal.source,
            text: state.proposal.text,
            revision: state.proposal.revision,
            confirmedAt: event.confirmedAt
          })
        },
        event.eventId
      );
    }
  }
}

/**
 * Creates a frozen structured report only from explicit controls plus a confirmed transcript.
 * No free-text parsing is performed and the provider cannot select red flags or urgency.
 */
export function createConfirmedPatientReport(
  input: Readonly<{
    reportId: string;
    confirmation: TranscriptConfirmation;
    fields: StructuredPatientReportFields;
  }>
): PatientReport {
  const confirmation = TranscriptConfirmationSchema.parse(input.confirmation);
  const fields = StructuredPatientReportFieldsSchema.parse(input.fields);
  return PatientReportSchema.parse({
    reportId: input.reportId,
    roundId: confirmation.roundId,
    ...fields,
    inputMode: confirmation.source === "voice_provider" ? "voice_confirmed" : "text",
    confirmedAt: confirmation.confirmedAt
  });
}
