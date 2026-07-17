import { z } from "zod";

const booleanText = z.enum(["true", "false"]).transform((value) => value === "true");

const serverEnvironmentSchema = z
  .object({
    APP_ENV: z.enum(["development", "demo", "production"]).default("development"),
    APP_BASE_URL: z.url().default("http://localhost:3000"),
    DATABASE_URL: z.string().min(1).optional(),
    PERSISTENCE_PROVIDER: z.enum(["auto", "memory", "postgres"]).default("auto"),
    DEMO_MODE: booleanText.default(true),
    DEMO_ACCESS_SECRET: z.string().min(16).optional(),
    FHIR_PROVIDER: z.enum(["fixture"]).default("fixture"),
    VOICE_PROVIDER: z.enum(["disabled", "elevenlabs"]).default("disabled"),
    ELEVENLABS_API_KEY: z.string().min(1).optional(),
    ELEVENLABS_AGENT_ID: z.string().min(1).optional(),
    ELEVENLABS_SERVER_LOCATION: z
      .enum(["us", "eu-residency", "in-residency", "global"])
      .default("global"),
    VOICE_SESSION_MAX_SECONDS: z.coerce.number().int().min(15).max(300).default(120),
    NARRATIVE_MODEL_PROVIDER: z.enum(["disabled"]).default("disabled"),
    INFERENCE_PROVIDER: z.enum(["disabled", "fake", "fireworks"]).default("disabled"),
    FIREWORKS_API_KEY: z.string().min(1).optional(),
    FIREWORKS_SELECTION_MODEL: z
      .literal("accounts/fireworks/models/deepseek-v4-pro")
      .default("accounts/fireworks/models/deepseek-v4-pro"),
    FIREWORKS_VISION_MODEL: z
      .literal("accounts/fireworks/models/kimi-k2p6")
      .default("accounts/fireworks/models/kimi-k2p6"),
    INFERENCE_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(30_000).default(8_000),
    INFERENCE_MAX_RETRIES: z.coerce.number().int().min(0).max(2).default(1),
    ADAPTIVE_SELECTION_ENABLED: booleanText.default(false),
    MEDICATION_LABEL_AI_ENABLED: booleanText.default(false),
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

    if (environment.PERSISTENCE_PROVIDER === "postgres" && !environment.DATABASE_URL) {
      context.addIssue({
        code: "custom",
        message: "The PostgreSQL persistence profile requires DATABASE_URL",
        path: ["DATABASE_URL"]
      });
    }

    if (environment.APP_ENV !== "development" && environment.PERSISTENCE_PROVIDER === "memory") {
      context.addIssue({
        code: "custom",
        message: "In-memory persistence is restricted to development and automated tests",
        path: ["PERSISTENCE_PROVIDER"]
      });
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

    if (environment.INFERENCE_PROVIDER === "fireworks" && !environment.FIREWORKS_API_KEY) {
      context.addIssue({
        code: "custom",
        message: "Fireworks inference requires a server-only API key",
        path: ["FIREWORKS_API_KEY"]
      });
    }

    if (
      (environment.ADAPTIVE_SELECTION_ENABLED || environment.MEDICATION_LABEL_AI_ENABLED) &&
      environment.INFERENCE_PROVIDER === "disabled"
    ) {
      context.addIssue({
        code: "custom",
        message: "AI features require the fake or Fireworks inference provider",
        path: ["INFERENCE_PROVIDER"]
      });
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
