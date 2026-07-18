import {
  CareActionMutationReceiptSchema,
  CareActionSubmissionReceiptSchema,
  InMemoryCareActionRepository,
  SyntheticCareActionService,
  type CareActionAuthority
} from "@homerounds/actions";
import { ApiErrorEnvelopeSchema, ApiSuccessEnvelopeSchema } from "@homerounds/api-client";
import { describe, expect, it } from "vitest";

import type { ApiRouteHooks } from "../http";
import type { DemoSession } from "../identity";
import { InMemoryRateLimiter } from "../rate-limit";
import {
  CareActionListDataSchema,
  handleListCareActions,
  handleMutateCareAction,
  handleSubmitCareAction
} from "./handlers";
import type { CareActionHandlerRuntime } from "./runtime";

const ROUND_ID = "137c9d4f-4dfc-4b95-a5ce-657ba00b29b4";
const NOW = "2026-07-18T10:00:00.000Z";

function authority(patientId = "synthetic-maya"): CareActionAuthority {
  return {
    roundId: ROUND_ID,
    patientId,
    roundVersion: 12,
    roundState: "awaiting_clinician",
    redFlagGate: "clear",
    eligibleActions: [
      "synthetic_appointment_request",
      "synthetic_refill_review_request",
      "synthetic_care_team_message"
    ],
    evidence: {
      summary: "Confirmed structured evidence is ready for synthetic review.",
      protocolId: "cardiometabolic_demo",
      protocolVersion: "1.0.0",
      protocolOutcome: "programme_review_requested",
      sourceFactIds: ["fact-confirmed-1"],
      captureQuality: "unknown",
      measurementState: "not_accepted",
      redFlagGate: "clear",
      generatedAt: NOW,
      rawTranscriptStored: false,
      modelReasoningStored: false,
      rawMediaStored: false
    }
  };
}

function session(role: "patient" | "clinician", patientId = "synthetic-maya"): DemoSession {
  return {
    sessionId: `test-${role}-session`,
    role,
    patientId: role === "patient" ? patientId : null,
    expiresAt: "2026-07-18T11:00:00.000Z",
    dataClassification: "synthetic_demo"
  };
}

function hooks(sessionValue: DemoSession | null): ApiRouteHooks {
  let id = 1;
  return {
    authenticator: { authenticate: async () => sessionValue },
    rateLimiter: new InMemoryRateLimiter(() => Date.parse(NOW)),
    appOrigin: "http://localhost:3000",
    runtimeProfile: "in_memory_demo_fallback",
    createId: () => `10000000-0000-4000-8000-${String(id++).padStart(12, "0")}`,
    now: () => NOW
  };
}

function runtime(input: {
  session: DemoSession | null;
  authority?: CareActionAuthority;
  persistence?: CareActionHandlerRuntime["persistence"];
}) {
  const authorityValue = input.authority ?? authority();
  const repository = new InMemoryCareActionRepository([authorityValue]);
  const routeHooks = hooks(input.session);
  return {
    repository,
    runtime: {
      hooks: routeHooks,
      persistence: input.persistence ?? "current_process",
      service: new SyntheticCareActionService({
        repository,
        now: () => NOW,
        createId: routeHooks.createId ?? (() => globalThis.crypto.randomUUID())
      }),
      prepareAuthority: async () => authorityValue
    } satisfies CareActionHandlerRuntime
  };
}

function postRequest(body: unknown): Request {
  return new Request(`http://localhost:3000/api/rounds/${ROUND_ID}/actions/care`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify(body)
  });
}

function submitBody(expectedRoundVersion = 12) {
  return {
    details: {
      kind: "synthetic_appointment_request",
      preferredWindow: "afternoon",
      confirmedSummary: "Request a synthetic programme review appointment."
    },
    confirmation: {
      confirmed: true,
      confirmedAt: NOW,
      confirmationKind: "explicit_patient_confirmation",
      confirmationVersion: "care-action-confirmation-v1",
      reviewedFields: [
        "action_kind",
        "confirmed_summary",
        "synthetic_boundary",
        "preferred_window"
      ],
      syntheticBoundaryAccepted: true
    },
    expectedRoundVersion,
    operationKey: "patient-submit-operation-1"
  };
}

describe("round-scoped synthetic care action handlers", () => {
  it("authenticates and enforces patient scope before submission", async () => {
    const unauthenticated = runtime({ session: null }).runtime;
    expect(
      (await handleSubmitCareAction(postRequest(submitBody()), unauthenticated, ROUND_ID)).status
    ).toBe(401);

    const clinician = runtime({ session: session("clinician") }).runtime;
    expect(
      (await handleSubmitCareAction(postRequest(submitBody()), clinician, ROUND_ID)).status
    ).toBe(403);

    const wrongPatient = runtime({
      session: session("patient"),
      authority: authority("synthetic-other")
    }).runtime;
    expect(
      (await handleSubmitCareAction(postRequest(submitBody()), wrongPatient, ROUND_ID)).status
    ).toBe(403);
  });

  it("fails closed when the durable PostgreSQL adapter has not been integrated", async () => {
    const unavailable = runtime({
      session: session("patient"),
      persistence: "durable_unavailable"
    }).runtime;
    const response = await handleSubmitCareAction(postRequest(submitBody()), unavailable, ROUND_ID);
    expect(response.status).toBe(503);
    const envelope = ApiErrorEnvelopeSchema.parse(await response.json());
    expect(envelope.error).toMatchObject({ code: "unavailable" });
  });

  it("returns stale state without mutating and persists a confirmed request once", async () => {
    const careRuntime = runtime({ session: session("patient") });
    const stale = await handleSubmitCareAction(
      postRequest(submitBody(11)),
      careRuntime.runtime,
      ROUND_ID
    );
    expect(stale.status).toBe(409);
    expect(await careRuntime.repository.listActionsForRound(ROUND_ID)).toEqual([]);

    const response = await handleSubmitCareAction(
      postRequest(submitBody()),
      careRuntime.runtime,
      ROUND_ID
    );
    expect(response.status).toBe(200);
    const envelope = ApiSuccessEnvelopeSchema(CareActionSubmissionReceiptSchema).parse(
      await response.json()
    );
    expect(envelope.data.action).toMatchObject({
      status: "pending_review",
      delivery: "synthetic_only_not_sent"
    });
  });

  it("supports clinician approval and patient-visible persisted status", async () => {
    const shared = runtime({ session: session("patient") });
    const submittedResponse = await handleSubmitCareAction(
      postRequest(submitBody()),
      shared.runtime,
      ROUND_ID
    );
    const submitted = ApiSuccessEnvelopeSchema(CareActionSubmissionReceiptSchema).parse(
      await submittedResponse.json()
    ).data;

    const clinicianRuntime: CareActionHandlerRuntime = {
      ...shared.runtime,
      hooks: hooks(session("clinician"))
    };
    const mutationRequest = new Request(
      `http://localhost:3000/api/rounds/${ROUND_ID}/actions/care/${submitted.action.id}`,
      {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({
          mutation: { kind: "approve" },
          expectedVersion: 1,
          operationKey: "clinician-approve-operation-1"
        })
      }
    );
    const mutationResponse = await handleMutateCareAction(
      mutationRequest,
      clinicianRuntime,
      ROUND_ID,
      submitted.action.id
    );
    expect(mutationResponse.status).toBe(200);
    const mutation = ApiSuccessEnvelopeSchema(CareActionMutationReceiptSchema).parse(
      await mutationResponse.json()
    ).data;
    expect(mutation.action).toMatchObject({ status: "approved", version: 2 });

    const patientListRuntime: CareActionHandlerRuntime = {
      ...shared.runtime,
      hooks: hooks(session("patient"))
    };
    const listResponse = await handleListCareActions(
      new Request(`http://localhost:3000/api/rounds/${ROUND_ID}/actions/care`),
      patientListRuntime,
      ROUND_ID
    );
    const list = ApiSuccessEnvelopeSchema(CareActionListDataSchema).parse(
      await listResponse.json()
    ).data;
    expect(list.actions).toMatchObject([
      { id: submitted.action.id, status: "approved", version: 2 }
    ]);
  });
});
