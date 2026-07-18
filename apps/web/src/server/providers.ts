import {
  VitalLensPayloadMetadataSchema,
  VitalLensProxyResponseSchema,
  type VitalLensPayloadMetadata,
  type VitalLensProxyResponse
} from "@homerounds/assessments";
import { z } from "zod";

const ElevenLabsTokenResponseSchema = z.object({ token: z.string().min(1).max(8_000) }).strip();

export type ProviderTransportErrorCode = "configuration" | "quota" | "network" | "provider";

export class ProviderTransportError extends Error {
  constructor(readonly code: ProviderTransportErrorCode) {
    super(`Provider transport failed: ${code}`);
    this.name = "ProviderTransportError";
  }
}

export type ElevenLabsTokenTransport = {
  issue(input: {
    apiKey: string;
    agentId: string;
    baseUrl: string;
    signal: AbortSignal;
  }): Promise<string>;
};

export class FetchElevenLabsTokenTransport implements ElevenLabsTokenTransport {
  async issue(input: {
    apiKey: string;
    agentId: string;
    baseUrl: string;
    signal: AbortSignal;
  }): Promise<string> {
    const endpoint = new URL("/v1/convai/conversation/token", input.baseUrl);
    endpoint.searchParams.set("agent_id", input.agentId);
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "GET",
        headers: { "xi-api-key": input.apiKey },
        signal: input.signal,
        cache: "no-store"
      });
    } catch {
      throw new ProviderTransportError("network");
    }
    if (response.status === 401 || response.status === 403 || response.status === 422) {
      throw new ProviderTransportError("configuration");
    }
    if (response.status === 429) throw new ProviderTransportError("quota");
    if (!response.ok) throw new ProviderTransportError("provider");
    try {
      return ElevenLabsTokenResponseSchema.parse(await response.json()).token;
    } catch {
      throw new ProviderTransportError("provider");
    }
  }
}

export type ElevenLabsCredentialResult =
  | {
      status: "available";
      token: string;
      agentId: string;
      expiresAt: string;
      maxSessionSeconds: number;
      serverLocation: keyof typeof elevenLabsBaseUrls;
    }
  | {
      status: "unavailable";
      reason: "disabled" | "missing_configuration" | "quota" | "network" | "provider";
    };

const elevenLabsBaseUrls = {
  global: "https://api.elevenlabs.io",
  us: "https://api.us.elevenlabs.io",
  "eu-residency": "https://api.eu.residency.elevenlabs.io",
  "in-residency": "https://api.in.residency.elevenlabs.io"
} as const;

export class ElevenLabsCredentialService {
  constructor(
    private readonly config: {
      provider: "disabled" | "elevenlabs";
      apiKey?: string;
      agentId?: string;
      serverLocation: keyof typeof elevenLabsBaseUrls;
      maxSessionSeconds: number;
      requestTimeoutMs?: number;
    },
    private readonly transport: ElevenLabsTokenTransport,
    private readonly now: () => string = () => new Date().toISOString()
  ) {}

  async issue(): Promise<ElevenLabsCredentialResult> {
    if (this.config.provider === "disabled") {
      return { status: "unavailable", reason: "disabled" };
    }
    if (!this.config.apiKey || !this.config.agentId) {
      return { status: "unavailable", reason: "missing_configuration" };
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs ?? 8_000);
    try {
      const token = await this.transport.issue({
        apiKey: this.config.apiKey,
        agentId: this.config.agentId,
        baseUrl: elevenLabsBaseUrls[this.config.serverLocation],
        signal: controller.signal
      });
      return {
        status: "available",
        token,
        agentId: this.config.agentId,
        expiresAt: new Date(
          Date.parse(this.now()) + this.config.maxSessionSeconds * 1_000
        ).toISOString(),
        maxSessionSeconds: this.config.maxSessionSeconds,
        serverLocation: this.config.serverLocation
      };
    } catch (error: unknown) {
      if (controller.signal.aborted) return { status: "unavailable", reason: "network" };
      if (error instanceof ProviderTransportError) {
        return {
          status: "unavailable",
          reason: error.code === "configuration" ? "missing_configuration" : error.code
        };
      }
      return { status: "unavailable", reason: "provider" };
    } finally {
      clearTimeout(timeout);
    }
  }
}

const VitalLensProviderResponseSchema = z
  .object({
    vitals: z.object({
      heart_rate: z.object({
        value: z.number().positive().finite().nullable(),
        unit: z.literal("bpm"),
        confidence: z.number().min(0).max(1).nullable()
      })
    }),
    processing_status: z.object({
      face_detected: z.boolean(),
      signal_quality: z.enum(["optimal", "suboptimal", "low", "unusable"]),
      issues: z.array(z.string().max(120)).max(50)
    }),
    model_used: z.string().min(1).max(120)
  })
  .strip();

type VitalLensProviderResponse = z.infer<typeof VitalLensProviderResponseSchema>;

export type VitalLensInferenceTransport = {
  infer(input: {
    apiKey: string;
    providerVersion: string;
    bytes: Uint8Array;
    metadata: VitalLensPayloadMetadata;
    signal: AbortSignal;
  }): Promise<VitalLensProviderResponse>;
};

export class FetchVitalLensInferenceTransport implements VitalLensInferenceTransport {
  async infer(input: {
    apiKey: string;
    providerVersion: string;
    bytes: Uint8Array;
    metadata: VitalLensPayloadMetadata;
    signal: AbortSignal;
  }): Promise<VitalLensProviderResponse> {
    const framesPerSecond = input.metadata.frameCount / (input.metadata.durationMs / 1_000);
    let response: Response;
    try {
      response = await fetch("https://api.rouast.com/vitallens-v3/file", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": input.apiKey },
        body: JSON.stringify({
          video: Buffer.from(input.bytes).toString("base64"),
          fps: framesPerSecond,
          process_signals: true,
          model: input.providerVersion
        }),
        signal: input.signal,
        cache: "no-store"
      });
    } catch {
      throw new ProviderTransportError("network");
    }
    if (response.status === 401 || response.status === 403) {
      throw new ProviderTransportError("configuration");
    }
    if (response.status === 429) throw new ProviderTransportError("quota");
    if (response.status === 400 || response.status === 422) {
      throw new ProviderTransportError("provider");
    }
    if (!response.ok) throw new ProviderTransportError("provider");
    try {
      return VitalLensProviderResponseSchema.parse(await response.json());
    } catch {
      throw new ProviderTransportError("provider");
    }
  }
}

export type VitalLensProxyServiceInput = {
  providerVersion: string;
  requestId: string;
  consentVersion: string;
  consentGrantedAt: string;
  metadata: unknown;
  bytes: Uint8Array;
  signal?: AbortSignal;
};

export class VitalLensProxyService {
  readonly #seenRequestIds = new Set<string>();

  constructor(
    private readonly config: {
      enabled: boolean;
      apiKey?: string;
      providerVersion: string;
      consentVersion: string;
      maxPayloadBytes: number;
      requestTimeoutMs?: number;
      minimumHeartRateConfidence?: number;
      maximumConsentAgeMs?: number;
      requestHistorySize?: number;
    },
    private readonly transport: VitalLensInferenceTransport,
    private readonly now: () => string = () => new Date().toISOString()
  ) {}

  async infer(input: VitalLensProxyServiceInput): Promise<VitalLensProxyResponse> {
    try {
      const apiKey = this.config.apiKey;
      if (!this.config.enabled || !apiKey) {
        return VitalLensProxyResponseSchema.parse({
          status: "unavailable",
          reason: "provider_unavailable"
        });
      }

      const metadata = VitalLensPayloadMetadataSchema.safeParse(input.metadata);
      const requestId = z.uuid().safeParse(input.requestId);
      const consentGrantedAt = z.iso.datetime().safeParse(input.consentGrantedAt);
      const now = Date.parse(this.now());
      const consentAt = consentGrantedAt.success ? Date.parse(consentGrantedAt.data) : Number.NaN;
      const consentAgeMs = now - consentAt;
      if (
        !metadata.success ||
        !requestId.success ||
        !consentGrantedAt.success ||
        !Number.isFinite(now) ||
        !Number.isFinite(consentAt) ||
        consentAgeMs < -30_000 ||
        consentAgeMs > (this.config.maximumConsentAgeMs ?? 10 * 60_000) ||
        input.providerVersion !== this.config.providerVersion ||
        input.consentVersion !== this.config.consentVersion ||
        metadata.data.byteLength !== input.bytes.byteLength ||
        metadata.data.byteLength > this.config.maxPayloadBytes ||
        metadata.data.width !== 40 ||
        metadata.data.height !== 40 ||
        metadata.data.byteLength !==
          metadata.data.frameCount * metadata.data.width * metadata.data.height * 3 ||
        this.#seenRequestIds.has(input.requestId)
      ) {
        return VitalLensProxyResponseSchema.parse({ status: "failed", code: "processing_failed" });
      }

      this.#rememberRequest(input.requestId);
      const controller = new AbortController();
      const cancel = (): void => controller.abort();
      input.signal?.addEventListener("abort", cancel, { once: true });
      if (input.signal?.aborted) controller.abort();
      const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs ?? 15_000);
      try {
        const provider = await this.transport.infer({
          apiKey,
          providerVersion: this.config.providerVersion,
          bytes: input.bytes,
          metadata: metadata.data,
          signal: controller.signal
        });
        return this.#normalize(provider, metadata.data);
      } catch (error: unknown) {
        if (error instanceof ProviderTransportError && error.code === "quota") {
          return VitalLensProxyResponseSchema.parse({ status: "unavailable", reason: "quota" });
        }
        if (
          controller.signal.aborted ||
          (error instanceof ProviderTransportError &&
            (error.code === "network" || error.code === "configuration"))
        ) {
          return VitalLensProxyResponseSchema.parse({
            status: "unavailable",
            reason: "provider_unavailable"
          });
        }
        return VitalLensProxyResponseSchema.parse({ status: "failed", code: "processing_failed" });
      } finally {
        clearTimeout(timeout);
        input.signal?.removeEventListener("abort", cancel);
      }
    } finally {
      input.bytes.fill(0);
    }
  }

  #rememberRequest(requestId: string): void {
    const historySize = Math.max(1, this.config.requestHistorySize ?? 256);
    if (this.#seenRequestIds.size >= historySize) {
      const oldest = this.#seenRequestIds.values().next().value;
      if (oldest !== undefined) this.#seenRequestIds.delete(oldest);
    }
    this.#seenRequestIds.add(requestId);
  }

  #normalize(
    provider: VitalLensProviderResponse,
    metadata: VitalLensPayloadMetadata
  ): VitalLensProxyResponse {
    if (provider.model_used !== this.config.providerVersion) {
      return VitalLensProxyResponseSchema.parse({ status: "failed", code: "processing_failed" });
    }
    const heartRate = provider.vitals.heart_rate;
    const confidence = heartRate.confidence ?? 0;
    const passes =
      provider.processing_status.face_detected &&
      provider.processing_status.signal_quality === "optimal" &&
      heartRate.value !== null &&
      confidence >= (this.config.minimumHeartRateConfidence ?? 0.7);
    if (!passes) {
      return VitalLensProxyResponseSchema.parse({
        status: "retry",
        quality: {
          status: "retry",
          score: confidence,
          reasons: ["provider_quality_failed"],
          metrics: {
            provider_confidence: confidence,
            face_detected: provider.processing_status.face_detected ? 1 : 0
          }
        }
      });
    }
    return VitalLensProxyResponseSchema.parse({
      status: "completed",
      heartRateBpm: heartRate.value,
      observedAt: this.now(),
      durationMs: metadata.durationMs,
      providerVersion: this.config.providerVersion,
      modelVersion: provider.model_used,
      quality: {
        status: "pass",
        score: confidence,
        reasons: [],
        metrics: {
          provider_confidence: confidence,
          face_detected: 1
        }
      }
    });
  }
}
