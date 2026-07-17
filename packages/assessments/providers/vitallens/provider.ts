import {
  OpticalAssessmentResultSchema,
  type CaptureQuality,
  type OpticalAssessmentProvider,
  type OpticalAssessmentResult,
  type OpticalUnavailableReason
} from "@homerounds/contracts/assessment";
import { z } from "zod";

import {
  VITALLENS_ALGORITHM_VERSION,
  VitalLensPayloadMetadataSchema,
  VitalLensProviderConfigurationSchema,
  VitalLensProxyResponseSchema,
  type VitalLensCameraSession,
  type VitalLensConsentRequest,
  type VitalLensProviderConfiguration,
  type VitalLensProviderDependencies,
  type VitalLensProxyResponse
} from "./contracts";
import { VitalLensCameraError, VitalLensTransportError } from "./errors";

const AssessmentSessionIdSchema = z.uuid();
const GeneratedIdSchema = z.uuid();

const ConsentResponseSchema = z.discriminatedUnion("granted", [
  z
    .object({
      granted: z.literal(true),
      consentVersion: z.string().min(1).max(120),
      grantedAt: z.iso.datetime()
    })
    .strict(),
  z.object({ granted: z.literal(false) }).strict()
]);

const CapabilityResponseSchema = z.discriminatedUnion("available", [
  z
    .object({
      available: z.literal(true),
      frontCamera: z.literal(true)
    })
    .strict(),
  z
    .object({
      available: z.literal(false),
      reason: z.enum(["unsupported_device", "permission_denied"])
    })
    .strict()
]);

class CaptureAbortedError extends Error {
  constructor() {
    super("VitalLens capture aborted");
    this.name = "CaptureAbortedError";
  }
}

type RetryState = "retry_used" | "terminal";

type ActiveCapture = {
  readonly controller: AbortController;
  readonly done: Promise<void>;
};

function parseConfiguration(configuration: unknown): VitalLensProviderConfiguration | undefined {
  const parsed = VitalLensProviderConfigurationSchema.safeParse(configuration);
  return parsed.success ? parsed.data : undefined;
}

function normalized(result: OpticalAssessmentResult): OpticalAssessmentResult {
  return OpticalAssessmentResultSchema.parse(result);
}

function unavailable(reason: OpticalUnavailableReason): OpticalAssessmentResult {
  return normalized({ status: "unavailable", provider: "vitallens", reason });
}

function failure(
  reason: "provider_unavailable" | "cancelled",
  metric: string
): OpticalAssessmentResult {
  return normalized({
    status: "failed",
    quality: {
      status: "fail",
      score: 0,
      reasons: [reason],
      metrics: { [metric]: 1 }
    }
  });
}

function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(new CaptureAbortedError());
  }

  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new CaptureAbortedError());
    signal.addEventListener("abort", abort, { once: true });
    operation.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      }
    );
  });
}

function isCameraSession(value: unknown): value is VitalLensCameraSession {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<VitalLensCameraSession>;
  return (
    typeof candidate.createInferencePayload === "function" && typeof candidate.stop === "function"
  );
}

function createDefaultId(): string {
  return globalThis.crypto.randomUUID();
}

export class VitalLensAssessmentProvider implements OpticalAssessmentProvider {
  readonly kind = "vitallens" as const;

  readonly #configuration: VitalLensProviderConfiguration | undefined;
  readonly #dependencies: VitalLensProviderDependencies;
  readonly #createId: () => string;
  readonly #retryState = new Map<string, RetryState>();
  #disposed = false;
  #activeCapture: ActiveCapture | undefined;

  constructor(dependencies: VitalLensProviderDependencies) {
    this.#dependencies = dependencies;
    this.#configuration = parseConfiguration(dependencies.configuration);
    this.#createId = dependencies.createId ?? createDefaultId;
  }

  async checkAvailability(
    signal?: AbortSignal
  ): Promise<
    | { available: true; capabilities: Readonly<Record<string, boolean>> }
    | { available: false; reason: OpticalUnavailableReason }
  > {
    if (this.#disposed) return { available: false, reason: "provider_unavailable" };
    if (!this.#configuration) return { available: false, reason: "missing_configuration" };
    if (signal?.aborted) return { available: false, reason: "provider_unavailable" };

    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal?.addEventListener("abort", cancel, { once: true });

    try {
      const rawCapability = await abortable(
        this.#dependencies.camera.checkCapability(controller.signal),
        controller.signal
      );
      const capability = CapabilityResponseSchema.safeParse(rawCapability);
      if (!capability.success) return { available: false, reason: "provider_unavailable" };
      if (!capability.data.available) {
        return { available: false, reason: capability.data.reason };
      }
      return {
        available: true,
        capabilities: {
          frontCamera: true,
          explicitConsent: true,
          serverProxy: true,
          rawMediaRetention: false,
          audioCapture: false,
          heartRateOnly: true
        }
      };
    } catch (error: unknown) {
      if (error instanceof VitalLensCameraError) {
        if (error.code === "unsupported_device") {
          return { available: false, reason: "unsupported_device" };
        }
        if (error.code === "permission_denied") {
          return { available: false, reason: "permission_denied" };
        }
      }
      return { available: false, reason: "provider_unavailable" };
    } finally {
      signal?.removeEventListener("abort", cancel);
    }
  }

  capture(input: {
    assessmentSessionId: string;
    signal: AbortSignal;
  }): Promise<OpticalAssessmentResult> {
    if (this.#disposed) return Promise.resolve(failure("cancelled", "disposed"));
    if (!this.#configuration) return Promise.resolve(unavailable("missing_configuration"));
    if (!AssessmentSessionIdSchema.safeParse(input.assessmentSessionId).success) {
      return Promise.resolve(failure("provider_unavailable", "invalid_assessment_session"));
    }
    if (input.signal.aborted) return Promise.resolve(failure("cancelled", "cancelled"));
    if (this.#retryState.get(input.assessmentSessionId) === "terminal") {
      return Promise.resolve(failure("provider_unavailable", "terminal_session"));
    }
    if (this.#activeCapture) {
      return Promise.resolve(failure("provider_unavailable", "capture_in_progress"));
    }

    const controller = new AbortController();
    const operation = this.#captureOnce(input, this.#configuration, controller).finally(() => {
      if (this.#activeCapture?.controller === controller) this.#activeCapture = undefined;
    });
    this.#activeCapture = {
      controller,
      done: operation.then(
        () => undefined,
        () => undefined
      )
    };
    return operation;
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    const activeCapture = this.#activeCapture;
    activeCapture?.controller.abort();
    await activeCapture?.done;
    this.#retryState.clear();
  }

  async #captureOnce(
    input: { assessmentSessionId: string; signal: AbortSignal },
    configuration: VitalLensProviderConfiguration,
    controller: AbortController
  ): Promise<OpticalAssessmentResult> {
    let cameraSession: VitalLensCameraSession | undefined;
    let rawBytes: Uint8Array | undefined;
    let requestTimedOut = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const cancel = () => controller.abort();
    input.signal.addEventListener("abort", cancel, { once: true });

    try {
      const rawCapability = await abortable(
        this.#dependencies.camera.checkCapability(controller.signal),
        controller.signal
      );
      const capability = CapabilityResponseSchema.safeParse(rawCapability);
      if (!capability.success) return failure("provider_unavailable", "malformed_capability");
      if (!capability.data.available) return unavailable(capability.data.reason);

      const consentRequest: VitalLensConsentRequest = {
        provider: "vitallens",
        consentVersion: configuration.consentVersion,
        dataFlow: "cropped_downsampled_frames_via_homerounds_proxy",
        signal: controller.signal
      };
      const rawConsent = await abortable(
        this.#dependencies.consent.requestConsent(consentRequest),
        controller.signal
      );
      const consent = ConsentResponseSchema.safeParse(rawConsent);
      if (!consent.success) return failure("provider_unavailable", "malformed_consent");
      if (!consent.data.granted) return unavailable("permission_denied");
      if (consent.data.consentVersion !== configuration.consentVersion) {
        return failure("provider_unavailable", "consent_version_mismatch");
      }

      const openedCamera = await abortable(
        this.#dependencies.camera.openFrontCamera(controller.signal),
        controller.signal
      );
      if (!isCameraSession(openedCamera)) {
        return failure("provider_unavailable", "malformed_camera_session");
      }
      cameraSession = openedCamera;

      const rawPayload = await abortable(
        cameraSession.createInferencePayload({
          maxDurationMs: configuration.captureDurationMs,
          maxPayloadBytes: configuration.maxPayloadBytes,
          signal: controller.signal
        }),
        controller.signal
      );
      rawBytes = rawPayload.bytes;
      const metadata = VitalLensPayloadMetadataSchema.safeParse(rawPayload.metadata);
      if (
        !metadata.success ||
        !(rawBytes instanceof Uint8Array) ||
        metadata.data.byteLength !== rawBytes.byteLength ||
        metadata.data.byteLength > configuration.maxPayloadBytes ||
        metadata.data.durationMs > configuration.captureDurationMs
      ) {
        return failure("provider_unavailable", "invalid_payload_boundary");
      }

      const requestId = this.#createId();
      if (!GeneratedIdSchema.safeParse(requestId).success) {
        return failure("provider_unavailable", "invalid_request_id");
      }

      timeout = setTimeout(() => {
        requestTimedOut = true;
        controller.abort();
      }, configuration.requestTimeoutMs);

      const rawResponse = await abortable(
        this.#dependencies.transport.send({
          endpoint: new URL(configuration.proxyPath, configuration.homeRoundsOrigin).toString(),
          providerVersion: configuration.providerVersion,
          requestId,
          consent: {
            version: consent.data.consentVersion,
            grantedAt: consent.data.grantedAt
          },
          payload: { bytes: rawBytes, metadata: metadata.data },
          signal: controller.signal
        }),
        controller.signal
      );
      const response = VitalLensProxyResponseSchema.safeParse(rawResponse);
      if (!response.success) return failure("provider_unavailable", "malformed_payload");
      return this.#normalizeResponse(input.assessmentSessionId, configuration, response.data);
    } catch (error: unknown) {
      if (requestTimedOut) return failure("provider_unavailable", "timeout");
      if (this.#disposed) return failure("cancelled", "disposed");
      if (input.signal.aborted || error instanceof CaptureAbortedError) {
        return failure("cancelled", "cancelled");
      }
      if (error instanceof VitalLensCameraError) {
        if (error.code === "permission_denied") return unavailable("permission_denied");
        if (error.code === "unsupported_device") return unavailable("unsupported_device");
        if (error.code === "cancelled") return failure("cancelled", "cancelled");
        return failure("provider_unavailable", "camera_failure");
      }
      if (error instanceof VitalLensTransportError) {
        switch (error.code) {
          case "timeout":
            return failure("provider_unavailable", "timeout");
          case "quota":
            return unavailable("provider_unavailable");
          case "network_failure":
            return unavailable("network_unavailable");
          case "cancelled":
            return failure("cancelled", "cancelled");
          case "provider_failure":
            return failure("provider_unavailable", "provider_failure");
        }
      }
      return failure("provider_unavailable", "provider_failure");
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
      input.signal.removeEventListener("abort", cancel);
      rawBytes?.fill(0);
      if (cameraSession) {
        try {
          await cameraSession.stop();
        } catch {
          // Cleanup failures are intentionally swallowed and never logged with media/provider data.
        }
      }
    }
  }

  #normalizeResponse(
    assessmentSessionId: string,
    configuration: VitalLensProviderConfiguration,
    response: VitalLensProxyResponse
  ): OpticalAssessmentResult {
    switch (response.status) {
      case "completed": {
        if (response.providerVersion !== configuration.providerVersion) {
          return failure("provider_unavailable", "provider_version_mismatch");
        }
        this.#retryState.set(assessmentSessionId, "terminal");
        return normalized({
          status: "completed",
          measurement: {
            factId: this.#createId(),
            assessmentSessionId,
            provider: "vitallens",
            value: response.heartRateBpm,
            unit: "bpm",
            observedAt: response.observedAt,
            durationMs: response.durationMs,
            algorithmVersion: VITALLENS_ALGORITHM_VERSION,
            providerModelVersion: response.modelVersion,
            quality: response.quality,
            rawMediaRef: null
          }
        });
      }
      case "retry":
        return this.#normalizeRetry(assessmentSessionId, response.quality);
      case "unavailable":
        return unavailable("provider_unavailable");
      case "failed":
        return failure("provider_unavailable", "provider_failure");
    }
  }

  #normalizeRetry(
    assessmentSessionId: string,
    quality: CaptureQuality & { status: "retry" }
  ): OpticalAssessmentResult {
    if (this.#retryState.get(assessmentSessionId) !== "retry_used") {
      this.#retryState.set(assessmentSessionId, "retry_used");
      return normalized({ status: "retry", quality });
    }

    this.#retryState.set(assessmentSessionId, "terminal");
    return normalized({
      status: "failed",
      quality: {
        ...quality,
        status: "fail",
        metrics: { ...quality.metrics, retry_exhausted: 1 }
      }
    });
  }
}

export function createVitalLensAssessmentProvider(
  dependencies: VitalLensProviderDependencies
): OpticalAssessmentProvider {
  return new VitalLensAssessmentProvider(dependencies);
}
