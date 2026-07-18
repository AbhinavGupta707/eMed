import {
  CompanionDesktopSnapshotSchema,
  CompanionPairingIssueSchema,
  CompanionPhoneSnapshotSchema,
  CompanionResultReceiptSchema,
  InMemoryCompanionPairingRepository,
  type CompanionRoundAuthoritySnapshot
} from "../../../packages/companion/src/index";
import { z } from "../../../packages/companion/node_modules/zod";

import { createDemoSessionAuthenticator } from "../../../apps/web/src/server/identity";
import { InMemoryRateLimiter } from "../../../apps/web/src/server/rate-limit";
import {
  handleCreateCompanionPairing,
  handleExchangeCompanionPairing,
  handleGetCompanionPairing,
  handleGetCompanionSession,
  handleUpdateCompanionStatus
} from "../../../apps/web/src/server/companion/handlers";
import { createCompanionRouteRuntime } from "../../../apps/web/src/server/companion/runtime";

export const APP_ORIGIN = "http://localhost:3000";
export const TEST_NOW = "2026-07-18T12:00:00.000Z";
export const TEST_ROUND_ID = "11111111-1111-4111-8111-111111111111";
export const TEST_PATIENT_ID = "synthetic-maya";
export const TEST_TASK = {
  taskId: "capture.finger_ppg.pulse",
  kind: "finger_pulse" as const,
  taskVersion: 4
};

const CorrelationSchema = z.object({ correlationId: z.string().min(1).max(120) }).strict();
const IssueEnvelopeSchema = z
  .object({
    data: z.object({ issue: CompanionPairingIssueSchema }).strict(),
    meta: CorrelationSchema
  })
  .strict();
const PhoneEnvelopeSchema = z
  .object({
    data: z.object({ snapshot: CompanionPhoneSnapshotSchema }).strict(),
    meta: CorrelationSchema
  })
  .strict();
const ExchangeEnvelopeSchema = z
  .object({
    data: z.object({ snapshot: CompanionPhoneSnapshotSchema, replayed: z.boolean() }).strict(),
    meta: CorrelationSchema
  })
  .strict();
const DesktopEnvelopeSchema = z
  .object({
    data: z.object({ snapshot: CompanionDesktopSnapshotSchema }).strict(),
    meta: CorrelationSchema
  })
  .strict();
const ReceiptEnvelopeSchema = z
  .object({
    data: z.object({ receipt: CompanionResultReceiptSchema }).strict(),
    meta: CorrelationSchema
  })
  .strict();
export const ErrorEnvelopeSchema = z
  .object({
    error: z
      .object({
        code: z.string().min(1).max(80),
        userMessageKey: z.string().min(1).max(160),
        correlationId: z.string().min(1).max(120),
        retryable: z.boolean()
      })
      .strict()
  })
  .strict();

export function defaultAuthority(): CompanionRoundAuthoritySnapshot {
  return {
    roundId: TEST_ROUND_ID,
    patientId: TEST_PATIENT_ID,
    roundStateVersion: 4,
    pairable: true,
    currentTask: TEST_TASK,
    allowedTaskKinds: ["finger_pulse", "voice_signal"],
    consentRequirement: {
      kind: "explicit_local_capture",
      version: "homerounds-local-capture-v1"
    }
  };
}

export function createCompanionHarness(available = true) {
  let now = TEST_NOW;
  let id = 0;
  const repository = new InMemoryCompanionPairingRepository();
  const authority: { current: CompanionRoundAuthoritySnapshot | null } = {
    current: defaultAuthority()
  };
  const runtime = createCompanionRouteRuntime({
    repository,
    authority: {
      async read(roundId) {
        return authority.current?.roundId === roundId ? authority.current : null;
      }
    },
    authenticator: createDemoSessionAuthenticator({
      appEnvironment: "development",
      now: () => now
    }),
    rateLimiter: new InMemoryRateLimiter(() => Date.parse(now)),
    appOrigin: APP_ORIGIN,
    tokenHashSecret: "synthetic-companion-test-secret-at-least-thirty-two-bytes",
    available,
    now: () => now,
    createId: () => `aaaaaaaa-aaaa-4aaa-8aaa-${String(++id).padStart(12, "0")}`
  });
  return {
    runtime,
    repository,
    authority,
    setNow(next: string) {
      now = next;
    }
  };
}

type RequestOptions = Readonly<{
  cookie?: string;
  origin?: string;
  role?: "patient" | "clinician";
  userAgent?: string;
}>;

export function companionPost(path: string, body: unknown, options: RequestOptions = {}): Request {
  const headers = new Headers({
    "content-type": "application/json",
    origin: options.origin ?? APP_ORIGIN,
    "user-agent": options.userAgent ?? "Synthetic Phone Browser",
    "x-forwarded-for": "192.0.2.50",
    "x-homerounds-demo-role": options.role ?? "patient"
  });
  if (options.cookie) headers.set("cookie", options.cookie);
  return new Request(`${APP_ORIGIN}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
}

export function companionGet(path: string, options: RequestOptions = {}): Request {
  const headers = new Headers({
    "user-agent": options.userAgent ?? "Synthetic Phone Browser",
    "x-forwarded-for": "192.0.2.50",
    "x-homerounds-demo-role": options.role ?? "patient"
  });
  if (options.cookie) headers.set("cookie", options.cookie);
  return new Request(`${APP_ORIGIN}${path}`, { headers });
}

export async function issuePairing(harness: ReturnType<typeof createCompanionHarness>) {
  const response = await handleCreateCompanionPairing(
    companionPost("/api/companion/pairings", {
      roundId: TEST_ROUND_ID,
      expectedRoundStateVersion: 4
    }),
    harness.runtime
  );
  if (response.status !== 201) {
    throw new Error(
      `Expected pairing issue 201, received ${response.status}: ${await response.text()}`
    );
  }
  const issue = IssueEnvelopeSchema.parse(await response.json()).data.issue;
  const token = new URLSearchParams(new URL(issue.pairingLink).hash.slice(1)).get("pair");
  if (!token) throw new Error("Synthetic pairing issue did not contain a fragment token");
  return { issue, token };
}

export async function exchangePairing(
  harness: ReturnType<typeof createCompanionHarness>,
  token: string,
  options: Readonly<{
    exchangeId?: string;
    userAgent?: string;
  }> = {}
) {
  const response = await handleExchangeCompanionPairing(
    companionPost(
      "/api/companion/exchange",
      {
        token,
        exchangeIdempotencyKey: options.exchangeId ?? "22222222-2222-4222-8222-222222222222"
      },
      options.userAgent ? { userAgent: options.userAgent } : {}
    ),
    harness.runtime
  );
  if (response.status !== 200) return { response, cookie: null, envelope: null };
  const envelope = ExchangeEnvelopeSchema.parse(await response.clone().json());
  const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? null;
  if (!cookie) throw new Error("Synthetic exchange did not return the scoped companion cookie");
  return { response, cookie, envelope };
}

export async function movePhoneToProgress(
  harness: ReturnType<typeof createCompanionHarness>,
  cookie: string
) {
  const operations = [
    {
      operationId: "33333333-3333-4333-8333-333333333333",
      expectedSessionVersion: 1,
      phase: "permission" as const
    },
    {
      operationId: "44444444-4444-4444-8444-444444444444",
      expectedSessionVersion: 2,
      phase: "guidance" as const,
      consent: {
        decision: "granted" as const,
        version: "homerounds-local-capture-v1",
        grantedAt: TEST_NOW
      }
    },
    {
      operationId: "55555555-5555-4555-8555-555555555555",
      expectedSessionVersion: 3,
      phase: "in_progress" as const
    }
  ];
  let snapshot = CompanionPhoneSnapshotSchema.parse({
    sessionVersion: 1,
    status: "active",
    expiresAt: "2026-07-18T12:20:00.000Z",
    task: TEST_TASK,
    taskPhase: "ready",
    consentRequirement: {
      kind: "explicit_local_capture",
      version: "homerounds-local-capture-v1"
    },
    consentState: { status: "pending" },
    lastResult: null,
    reissueRequired: false
  });
  for (const operation of operations) {
    const response = await handleUpdateCompanionStatus(
      companionPost(
        "/api/companion/session/status",
        {
          ...operation,
          taskId: TEST_TASK.taskId,
          taskKind: TEST_TASK.kind
        },
        { cookie }
      ),
      harness.runtime
    );
    if (response.status !== 200) {
      throw new Error(
        `Expected status update 200, received ${response.status}: ${await response.text()}`
      );
    }
    snapshot = PhoneEnvelopeSchema.parse(await response.json()).data.snapshot;
  }
  return snapshot;
}

export async function readPhoneSnapshot(
  harness: ReturnType<typeof createCompanionHarness>,
  cookie: string
) {
  const response = await handleGetCompanionSession(
    companionGet("/api/companion/session", { cookie }),
    harness.runtime
  );
  return {
    response,
    envelope:
      response.status === 200 ? PhoneEnvelopeSchema.parse(await response.clone().json()) : null
  };
}

export async function readDesktopSnapshot(
  harness: ReturnType<typeof createCompanionHarness>,
  pairingId: string
) {
  const response = await handleGetCompanionPairing(
    companionGet(`/api/companion/pairings/${pairingId}`),
    harness.runtime,
    pairingId
  );
  return {
    response,
    envelope:
      response.status === 200 ? DesktopEnvelopeSchema.parse(await response.clone().json()) : null
  };
}

export const companionResponseSchemas = {
  desktop: DesktopEnvelopeSchema,
  exchange: ExchangeEnvelopeSchema,
  issue: IssueEnvelopeSchema,
  phone: PhoneEnvelopeSchema,
  receipt: ReceiptEnvelopeSchema
};
