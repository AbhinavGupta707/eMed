import { z } from "zod";

import { PatientReportSchema } from "./round";

export const VoiceProviderKindSchema = z.enum(["disabled", "elevenlabs"]);
export type VoiceProviderKind = z.infer<typeof VoiceProviderKindSchema>;

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
  }): Promise<{ sessionId: string }>;
  stop(reason: string): Promise<void>;
  setMuted(muted: boolean): Promise<void>;
  sendText?(text: string): Promise<void>;
  subscribe(listener: (event: VoicePresentationEvent) => void): () => void;
};
