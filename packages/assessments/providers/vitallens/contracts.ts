import { CaptureQualitySchema } from "@homerounds/contracts/assessment";
import { z } from "zod";

export const VITALLENS_ALGORITHM_VERSION = "vitallens_face_rppg_v1";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export const VitalLensProviderConfigurationSchema = z
  .object({
    environment: z.enum(["development", "demo", "production"]),
    homeRoundsOrigin: z.url().max(2048),
    proxyPath: z
      .string()
      .min(1)
      .max(200)
      .refine(
        (path) =>
          path.startsWith("/") &&
          !path.startsWith("//") &&
          !path.includes("?") &&
          !path.includes("#"),
        "proxyPath must be a same-origin path without query or fragment"
      ),
    providerVersion: z.string().min(1).max(120),
    consentVersion: z.string().min(1).max(120),
    captureDurationMs: z.number().int().min(1_000).max(60_000),
    requestTimeoutMs: z.number().int().min(250).max(30_000),
    maxPayloadBytes: z.number().int().min(1).max(5_000_000)
  })
  .strict()
  .superRefine((configuration, context) => {
    const origin = new URL(configuration.homeRoundsOrigin);
    const isOriginOnly =
      origin.pathname === "/" &&
      origin.search === "" &&
      origin.hash === "" &&
      origin.username === "" &&
      origin.password === "";

    if (!isOriginOnly) {
      context.addIssue({
        code: "custom",
        path: ["homeRoundsOrigin"],
        message: "homeRoundsOrigin must contain an origin only"
      });
    }

    const isHttps = origin.protocol === "https:";
    const isDevelopmentLoopback =
      configuration.environment === "development" &&
      origin.protocol === "http:" &&
      LOOPBACK_HOSTS.has(origin.hostname);

    if (!isHttps && !isDevelopmentLoopback) {
      context.addIssue({
        code: "custom",
        path: ["homeRoundsOrigin"],
        message: "live proxy origins must use HTTPS except loopback development"
      });
    }
  });

export type VitalLensProviderConfiguration = z.infer<typeof VitalLensProviderConfigurationSchema>;

export const VitalLensPayloadMetadataSchema = z
  .object({
    contentType: z.literal("application/octet-stream"),
    byteLength: z.number().int().positive().max(5_000_000),
    durationMs: z.number().int().positive().max(60_000),
    frameCount: z.number().int().positive().max(3_600),
    width: z.number().int().positive().max(640),
    height: z.number().int().positive().max(640),
    audioIncluded: z.literal(false)
  })
  .strict();

export type VitalLensPayloadMetadata = z.infer<typeof VitalLensPayloadMetadataSchema>;

const PassingQualitySchema = CaptureQualitySchema.extend({
  status: z.literal("pass")
}).strict();

const RetryQualitySchema = CaptureQualitySchema.extend({
  status: z.literal("retry"),
  reasons: CaptureQualitySchema.shape.reasons.min(1)
}).strict();

export const VitalLensProxyResponseSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("completed"),
      heartRateBpm: z.number().positive().finite(),
      observedAt: z.iso.datetime(),
      durationMs: z.number().int().positive().max(60_000),
      providerVersion: z.string().min(1).max(120),
      modelVersion: z.string().min(1).max(120),
      quality: PassingQualitySchema
    })
    .strict(),
  z
    .object({
      status: z.literal("retry"),
      quality: RetryQualitySchema
    })
    .strict(),
  z
    .object({
      status: z.literal("unavailable"),
      reason: z.enum(["quota", "provider_unavailable"])
    })
    .strict(),
  z
    .object({
      status: z.literal("failed"),
      code: z.literal("processing_failed")
    })
    .strict()
]);

export type VitalLensProxyResponse = z.infer<typeof VitalLensProxyResponseSchema>;

export type VitalLensConsentRequest = Readonly<{
  provider: "vitallens";
  consentVersion: string;
  dataFlow: "cropped_downsampled_frames_via_homerounds_proxy";
  signal: AbortSignal;
}>;

export type VitalLensConsentGateway = Readonly<{
  requestConsent(input: VitalLensConsentRequest): Promise<unknown>;
}>;

export type VitalLensCameraGateway = Readonly<{
  checkCapability(signal: AbortSignal): Promise<unknown>;
  openFrontCamera(signal: AbortSignal): Promise<VitalLensCameraSession>;
}>;

export type VitalLensCameraSession = Readonly<{
  createInferencePayload(input: {
    maxDurationMs: number;
    maxPayloadBytes: number;
    signal: AbortSignal;
  }): Promise<{
    bytes: Uint8Array;
    metadata: unknown;
  }>;
  stop(): Promise<void>;
}>;

export type VitalLensProxyRequest = Readonly<{
  endpoint: string;
  providerVersion: string;
  requestId: string;
  consent: Readonly<{
    version: string;
    grantedAt: string;
  }>;
  payload: Readonly<{
    bytes: Uint8Array;
    metadata: VitalLensPayloadMetadata;
  }>;
  signal: AbortSignal;
}>;

export type VitalLensProxyTransport = Readonly<{
  send(request: VitalLensProxyRequest): Promise<unknown>;
}>;

export type VitalLensProviderDependencies = Readonly<{
  configuration?: unknown;
  consent: VitalLensConsentGateway;
  camera: VitalLensCameraGateway;
  transport: VitalLensProxyTransport;
  createId?: () => string;
}>;
