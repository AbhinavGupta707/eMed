import { z } from "zod";

import {
  CompanionAcknowledgeRequestSchema,
  CompanionCreatePairingRequestSchema,
  CompanionExchangeRequestSchema,
  CompanionPairingMutationRequestSchema,
  CompanionStatusUpdateRequestSchema,
  CompanionTaskResultRequestSchema
} from "../../../../../packages/companion/src/index";
import {
  assertMethod,
  assertMutationOrigin,
  companionBoundary,
  companionCookie,
  companionCookieHeader,
  CompanionHttpError,
  consumeRateLimit,
  deviceBinding,
  readJson,
  requirePatientSession,
  sourceRateKey,
  successResponse
} from "./http";
import type { CompanionRouteRuntime } from "./runtime";

const PairingIdSchema = z.uuid();

export function handleCreateCompanionPairing(
  request: Request,
  runtime: CompanionRouteRuntime
): Promise<Response> {
  return companionBoundary(request, runtime, async (correlationId) => {
    assertMethod(request, "POST");
    assertMutationOrigin(request, runtime.appOrigin);
    const session = await requirePatientSession(request, runtime);
    await consumeRateLimit(runtime, {
      key: session.sessionId,
      bucket: "companion-pairing-create",
      limit: 8
    });
    const input = await readJson(request, CompanionCreatePairingRequestSchema, 1_024);
    const issue = await runtime.service.createPairing({
      ...input,
      patientId: session.patientId,
      createdBySessionId: session.sessionId
    });
    return successResponse({ issue }, correlationId, 201);
  });
}

export function handleExchangeCompanionPairing(
  request: Request,
  runtime: CompanionRouteRuntime
): Promise<Response> {
  return companionBoundary(request, runtime, async (correlationId) => {
    assertMethod(request, "POST");
    assertMutationOrigin(request, runtime.appOrigin);
    await consumeRateLimit(runtime, {
      key: sourceRateKey(request, runtime),
      bucket: "companion-token-exchange",
      limit: 10,
      windowMs: 5 * 60_000
    });
    const input = await readJson(request, CompanionExchangeRequestSchema, 1_024);
    const exchanged = await runtime.service.exchange({
      ...input,
      deviceBinding: deviceBinding(request)
    });
    const response = successResponse(
      { snapshot: exchanged.snapshot, replayed: exchanged.replayed },
      correlationId
    );
    response.headers.set(
      "set-cookie",
      companionCookieHeader(exchanged.sessionToken, exchanged.expiresAt, runtime.now())
    );
    return response;
  });
}

export function handleGetCompanionSession(
  request: Request,
  runtime: CompanionRouteRuntime
): Promise<Response> {
  return companionBoundary(request, runtime, async (correlationId) => {
    assertMethod(request, "GET");
    const token = companionCookie(request);
    if (!token) throw new CompanionHttpError(401, "session_unauthorized");
    await consumeRateLimit(runtime, {
      key: runtime.rateKey(token),
      bucket: "companion-session-read",
      limit: 90
    });
    const snapshot = await runtime.service.getPhoneSnapshot(token);
    const etag = `"companion-session-${snapshot.sessionVersion}"`;
    if (request.headers.get("if-none-match") === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          "cache-control": "no-store, private",
          etag,
          "referrer-policy": "no-referrer",
          "x-content-type-options": "nosniff",
          "x-correlation-id": correlationId
        }
      });
    }
    const response = successResponse({ snapshot }, correlationId);
    response.headers.set("etag", etag);
    return response;
  });
}

export function handleUpdateCompanionStatus(
  request: Request,
  runtime: CompanionRouteRuntime
): Promise<Response> {
  return companionBoundary(request, runtime, async (correlationId) => {
    assertMethod(request, "POST");
    assertMutationOrigin(request, runtime.appOrigin);
    const token = companionCookie(request);
    if (!token) throw new CompanionHttpError(401, "session_unauthorized");
    await consumeRateLimit(runtime, {
      key: runtime.rateKey(token),
      bucket: "companion-session-status",
      limit: 40
    });
    const input = await readJson(request, CompanionStatusUpdateRequestSchema, 4_096);
    const snapshot = await runtime.service.updateStatus({ ...input, sessionToken: token });
    return successResponse({ snapshot }, correlationId);
  });
}

export function handleSubmitCompanionResult(
  request: Request,
  runtime: CompanionRouteRuntime
): Promise<Response> {
  return companionBoundary(request, runtime, async (correlationId) => {
    assertMethod(request, "POST");
    assertMutationOrigin(request, runtime.appOrigin);
    const token = companionCookie(request);
    if (!token) throw new CompanionHttpError(401, "session_unauthorized");
    await consumeRateLimit(runtime, {
      key: runtime.rateKey(token),
      bucket: "companion-session-result",
      limit: 12
    });
    const result = await readJson(request, CompanionTaskResultRequestSchema, 16_384);
    const receipt = await runtime.service.submitResult({ sessionToken: token, result });
    return successResponse({ receipt }, correlationId);
  });
}

export function handleGetCompanionPairing(
  request: Request,
  runtime: CompanionRouteRuntime,
  pairingIdValue: string
): Promise<Response> {
  return companionBoundary(request, runtime, async (correlationId) => {
    assertMethod(request, "GET");
    const session = await requirePatientSession(request, runtime);
    await consumeRateLimit(runtime, {
      key: session.sessionId,
      bucket: "companion-pairing-read",
      limit: 90
    });
    const snapshot = await runtime.service.getDesktopSnapshot({
      pairingId: PairingIdSchema.parse(pairingIdValue),
      patientId: session.patientId
    });
    const etag = `"companion-pairing-${snapshot.pairingVersion}"`;
    if (request.headers.get("if-none-match") === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          "cache-control": "no-store, private",
          etag,
          "referrer-policy": "no-referrer",
          "x-content-type-options": "nosniff",
          "x-correlation-id": correlationId
        }
      });
    }
    const response = successResponse({ snapshot }, correlationId);
    response.headers.set("etag", etag);
    return response;
  });
}

async function desktopMutationContext(
  request: Request,
  runtime: CompanionRouteRuntime,
  bucket: string
) {
  assertMethod(request, "POST");
  assertMutationOrigin(request, runtime.appOrigin);
  const session = await requirePatientSession(request, runtime);
  await consumeRateLimit(runtime, { key: session.sessionId, bucket, limit: 12 });
  return session;
}

export function handleRevokeCompanionPairing(
  request: Request,
  runtime: CompanionRouteRuntime,
  pairingIdValue: string
): Promise<Response> {
  return companionBoundary(request, runtime, async (correlationId) => {
    const session = await desktopMutationContext(request, runtime, "companion-pairing-revoke");
    const input = await readJson(request, CompanionPairingMutationRequestSchema, 1_024);
    const snapshot = await runtime.service.revokePairing({
      ...input,
      pairingId: PairingIdSchema.parse(pairingIdValue),
      patientId: session.patientId
    });
    return successResponse({ snapshot }, correlationId);
  });
}

export function handleReissueCompanionPairing(
  request: Request,
  runtime: CompanionRouteRuntime,
  pairingIdValue: string
): Promise<Response> {
  return companionBoundary(request, runtime, async (correlationId) => {
    const session = await desktopMutationContext(request, runtime, "companion-pairing-reissue");
    const input = await readJson(request, CompanionPairingMutationRequestSchema, 1_024);
    const issue = await runtime.service.reissuePairing({
      ...input,
      pairingId: PairingIdSchema.parse(pairingIdValue),
      patientId: session.patientId
    });
    return successResponse({ issue }, correlationId, 201);
  });
}

export function handleAcknowledgeCompanionResult(
  request: Request,
  runtime: CompanionRouteRuntime,
  pairingIdValue: string
): Promise<Response> {
  return companionBoundary(request, runtime, async (correlationId) => {
    const session = await desktopMutationContext(request, runtime, "companion-result-acknowledge");
    const input = await readJson(request, CompanionAcknowledgeRequestSchema, 1_024);
    const snapshot = await runtime.service.acknowledgeResult({
      ...input,
      pairingId: PairingIdSchema.parse(pairingIdValue),
      patientId: session.patientId
    });
    return successResponse({ snapshot }, correlationId);
  });
}
