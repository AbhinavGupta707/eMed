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

export const PatientScenarioIdSchema = z.enum([
  "maya-happy-text",
  "maya-poor-quality",
  "maya-red-flag"
]);

export type PatientScenarioId = z.infer<typeof PatientScenarioIdSchema>;

export const SYNTHETIC_MAYA_SCENARIOS: Readonly<
  Record<PatientScenarioId, PatientRoundLaunchConfig>
> = {
  "maya-happy-text": PatientRoundLaunchConfigSchema.parse({
    patientId: "synthetic-maya",
    triggerId: "homerounds-demo:v1:maya-happy-text",
    purpose: "Fictional cardiometabolic programme check-in — happy text path",
    protocolId: "cardiometabolic_demo",
    burdenSeconds: 180
  }),
  "maya-poor-quality": PatientRoundLaunchConfigSchema.parse({
    patientId: "synthetic-maya",
    triggerId: "homerounds-demo:v1:maya-poor-quality",
    purpose: "Fictional cardiometabolic programme check-in — capture quality recovery",
    protocolId: "cardiometabolic_demo",
    burdenSeconds: 180
  }),
  "maya-red-flag": PatientRoundLaunchConfigSchema.parse({
    patientId: "synthetic-maya",
    triggerId: "homerounds-demo:v1:maya-red-flag",
    purpose: "Fictional cardiometabolic programme check-in — structured safety path",
    protocolId: "cardiometabolic_demo",
    burdenSeconds: 180
  })
};

export const SYNTHETIC_MAYA_ROUND = SYNTHETIC_MAYA_SCENARIOS["maya-happy-text"];

export function patientRoundConfigForScenario(value: unknown): PatientRoundLaunchConfig {
  const parsed = PatientScenarioIdSchema.safeParse(value);
  return SYNTHETIC_MAYA_SCENARIOS[parsed.success ? parsed.data : "maya-happy-text"];
}
