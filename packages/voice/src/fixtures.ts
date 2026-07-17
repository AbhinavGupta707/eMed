import type { VoiceAgentReportProposal, VoicePresentationEvent } from "@homerounds/contracts/voice";

export const SYNTHETIC_TRANSCRIPT_FIXTURES = {
  tentative: {
    type: "transcript_tentative",
    text: "I have felt a little weak this morning"
  },
  final: {
    type: "transcript_final",
    text: "I have felt a little weak this morning."
  },
  narration: {
    type: "narration",
    text: "Thank you. Please review the text before confirming it."
  }
} as const satisfies Record<string, VoicePresentationEvent>;

/** Schema-valid development-only proposal used to exercise explicit on-screen review. */
export const SYNTHETIC_REPORT_PROPOSAL_FIXTURE = {
  contractVersion: "voice-report-proposal.v1",
  weakness: "mild",
  palpitations: "absent",
  redFlags: {
    chestPain: "no",
    severeBreathlessness: "no",
    fainted: "no"
  },
  note: "Synthetic voice-agent proposal for explicit patient review.",
  unresolvedFields: []
} as const satisfies VoiceAgentReportProposal;
