import type { VoicePresentationEvent } from "@homerounds/contracts/voice";

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
