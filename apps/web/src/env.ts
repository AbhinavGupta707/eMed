import { z } from "zod";

const booleanText = z.enum(["true", "false"]).transform((value) => value === "true");

const serverEnvironmentSchema = z
  .object({
    APP_ENV: z.enum(["development", "demo", "production"]).default("development"),
    APP_BASE_URL: z.url().default("http://localhost:3000"),
    DATABASE_URL: z.string().min(1).optional(),
    DEMO_MODE: booleanText.default(true),
    DEMO_ACCESS_SECRET: z.string().min(16).optional(),
    FHIR_PROVIDER: z.enum(["fixture"]).default("fixture"),
    VOICE_PROVIDER: z.enum(["disabled", "elevenlabs"]).default("disabled"),
    ELEVENLABS_API_KEY: z.string().min(1).optional(),
    ELEVENLABS_AGENT_ID: z.string().min(1).optional(),
    ELEVENLABS_SERVER_LOCATION: z
      .enum(["us", "eu-residency", "in-residency", "global"])
      .default("eu-residency"),
    VOICE_SESSION_MAX_SECONDS: z.coerce.number().int().min(15).max(300).default(120),
    NARRATIVE_MODEL_PROVIDER: z.enum(["disabled"]).default("disabled"),
    OPTICAL_ASSESSMENT_PROVIDER: z.enum(["finger_ppg", "vitallens"]).default("finger_ppg"),
    VITALLENS_API_KEY: z.string().min(1).optional(),
    VITALLENS_PROXY_ENABLED: booleanText.default(false),
    STORE_RAW_MEDIA: booleanText.default(false),
    ENABLE_PROVIDER_TRACING: booleanText.default(false),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info")
  })
  .superRefine((environment, context) => {
    if (environment.STORE_RAW_MEDIA) {
      context.addIssue({
        code: "custom",
        message: "HomeRounds forbids raw media storage in every current profile",
        path: ["STORE_RAW_MEDIA"]
      });
    }

    if (environment.APP_ENV === "production" && environment.DEMO_MODE) {
      context.addIssue({
        code: "custom",
        message: "Production cannot start with demo mode enabled",
        path: ["DEMO_MODE"]
      });
    }

    if (environment.APP_ENV === "production" && environment.FHIR_PROVIDER === "fixture") {
      context.addIssue({
        code: "custom",
        message: "Production cannot start with the synthetic fixture FHIR provider",
        path: ["FHIR_PROVIDER"]
      });
    }

    if (environment.APP_ENV === "demo") {
      if (!environment.DATABASE_URL) {
        context.addIssue({
          code: "custom",
          message: "Hosted demo mode requires durable PostgreSQL persistence",
          path: ["DATABASE_URL"]
        });
      }
      if (!environment.DEMO_ACCESS_SECRET) {
        context.addIssue({
          code: "custom",
          message: "Hosted demo mode requires a server-only access secret",
          path: ["DEMO_ACCESS_SECRET"]
        });
      }
    }

    if (environment.VOICE_PROVIDER === "elevenlabs") {
      if (!environment.ELEVENLABS_API_KEY) {
        context.addIssue({
          code: "custom",
          message: "ElevenLabs voice requires a server-only API key",
          path: ["ELEVENLABS_API_KEY"]
        });
      }
      if (!environment.ELEVENLABS_AGENT_ID) {
        context.addIssue({
          code: "custom",
          message: "ElevenLabs voice requires an agent id",
          path: ["ELEVENLABS_AGENT_ID"]
        });
      }
    }

    if (environment.OPTICAL_ASSESSMENT_PROVIDER === "vitallens") {
      if (!environment.VITALLENS_API_KEY || !environment.VITALLENS_PROXY_ENABLED) {
        context.addIssue({
          code: "custom",
          message: "Release-selected VitalLens requires the server proxy and key",
          path: ["OPTICAL_ASSESSMENT_PROVIDER"]
        });
      }
    }
  });

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

export function parseServerEnvironment(
  source: Record<string, string | undefined> = process.env
): ServerEnvironment {
  return serverEnvironmentSchema.parse(source);
}
