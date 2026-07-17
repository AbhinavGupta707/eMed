import { ProtocolResultSchema, type ProtocolResult } from "@homerounds/contracts";
import { z } from "zod";

export const PatientMessageTemplateSchema = z
  .object({
    templateId: z.enum([
      "programme_review_requested_v1",
      "abstain_for_review_v1",
      "emergency_guidance_demo_v1"
    ]),
    heading: z.string().min(1).max(120),
    body: z.string().min(1).max(360),
    serviceWindowLabel: z.string().min(1).max(180).nullable(),
    demoOnly: z.literal(true),
    diagnosticClaim: z.literal(false)
  })
  .strict();

export type PatientMessageTemplate = z.infer<typeof PatientMessageTemplateSchema>;

const templates = {
  programme_review_requested: {
    templateId: "programme_review_requested_v1",
    heading: "Programme review requested",
    body: "Your programme team can review the confirmed information from this synthetic demo round.",
    serviceWindowLabel:
      "Demo-only illustrative same-day window — this is not a clinical or response-time promise.",
    demoOnly: true,
    diagnosticClaim: false
  },
  abstain_for_review: {
    templateId: "abstain_for_review_v1",
    heading: "Programme review requested",
    body: "This synthetic demo does not have enough confirmed information to continue automatically.",
    serviceWindowLabel: "Demo-only review queue — no real service response is being promised.",
    demoOnly: true,
    diagnosticClaim: false
  },
  emergency_guidance: {
    templateId: "emergency_guidance_demo_v1",
    heading: "Stop this demo round",
    body: "This prototype cannot assess an emergency. In a real situation, use the emergency help available where you are.",
    serviceWindowLabel: null,
    demoOnly: true,
    diagnosticClaim: false
  }
} as const;

export function messageForProtocolResult(resultInput: ProtocolResult): PatientMessageTemplate {
  const result = ProtocolResultSchema.parse(resultInput);
  return PatientMessageTemplateSchema.parse(templates[result.outcome]);
}
