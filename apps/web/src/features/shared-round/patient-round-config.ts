import { z } from "zod";

export const PatientRoundLaunchConfigSchema = z
  .object({
    patientId: z.string().min(1).max(120),
    triggerId: z.string().min(1).max(160),
    purpose: z.string().min(1).max(240),
    protocolId: z.string().min(1).max(120),
    burdenSeconds: z.number().int().positive().max(3_600)
  })
  .strict();

export type PatientRoundLaunchConfig = z.infer<typeof PatientRoundLaunchConfigSchema>;

export const SYNTHETIC_MAYA_ROUND = PatientRoundLaunchConfigSchema.parse({
  patientId: "synthetic-maya",
  triggerId: "checkpoint-3-maya-programme-round",
  purpose: "A short synthetic programme check-in about how you have been feeling.",
  protocolId: "cardiometabolic_demo",
  burdenSeconds: 120
});
