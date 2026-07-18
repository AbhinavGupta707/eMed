import { randomUUID } from "node:crypto";

import {
  CompanionService,
  InMemoryCompanionPairingRepository,
  type CompanionPairingRepository,
  type CompanionResultRecord,
  type CompanionRoundAuthorityPort
} from "@homerounds/companion";
import { connectPostgresCompanionRepository } from "@homerounds/persistence";
import type { DemoSessionAuthenticator } from "../identity";
import type { RateLimiter } from "../rate-limit";
import { getServerRuntime } from "../runtime";
import { ExistingRoundCompanionAuthority } from "./authority";
import { deriveCompanionSecret, NodeCompanionCrypto } from "./crypto";
import { CompanionWorkflowProcessor } from "./workflow";

export type CompanionWorkflowDeviceContext = Readonly<{
  deviceClass: "phone";
  platform: "ios" | "android" | "windows" | "macos" | "linux" | "other" | "unknown";
}>;

export type CompanionWorkflowPort = Readonly<{
  process(input: {
    record: CompanionResultRecord;
    ownerPatientId: string;
    device: CompanionWorkflowDeviceContext;
  }): Promise<void>;
}>;

export type CompanionRouteRuntime = {
  service: CompanionService;
  repository: CompanionPairingRepository;
  workflow: CompanionWorkflowPort | null;
  authenticator: DemoSessionAuthenticator;
  rateLimiter: RateLimiter;
  appOrigin: string;
  available: boolean;
  now: () => string;
  createId: () => string;
  rateKey: (value: string) => string;
};

export type CompanionRouteRuntimeDependencies = {
  repository: CompanionPairingRepository;
  authority: CompanionRoundAuthorityPort;
  authenticator: DemoSessionAuthenticator;
  rateLimiter: RateLimiter;
  appOrigin: string;
  tokenHashSecret: string;
  available?: boolean;
  now?: () => string;
  createId?: () => string;
  workflow?: CompanionWorkflowPort | null;
};

export function createCompanionRouteRuntime(
  dependencies: CompanionRouteRuntimeDependencies
): CompanionRouteRuntime {
  const now = dependencies.now ?? (() => new Date().toISOString());
  const createId = dependencies.createId ?? randomUUID;
  const crypto = new NodeCompanionCrypto(dependencies.tokenHashSecret);
  return {
    service: new CompanionService({
      repository: dependencies.repository,
      authority: dependencies.authority,
      clock: { now },
      ids: { createId },
      crypto,
      appBaseUrl: dependencies.appOrigin
    }),
    repository: dependencies.repository,
    workflow: dependencies.workflow ?? null,
    authenticator: dependencies.authenticator,
    rateLimiter: dependencies.rateLimiter,
    appOrigin: dependencies.appOrigin,
    available: dependencies.available ?? true,
    now,
    createId,
    rateKey: (value) => crypto.hashValue("device", value)
  };
}

let singleton: CompanionRouteRuntime | undefined;

export function getCompanionRouteRuntime(): CompanionRouteRuntime {
  if (singleton) return singleton;
  const main = getServerRuntime();
  const durableRepository =
    main.runtimeProfile === "postgres" && main.environment.DATABASE_URL
      ? connectPostgresCompanionRepository(main.environment.DATABASE_URL).repository
      : null;
  singleton = createCompanionRouteRuntime({
    repository: durableRepository ?? new InMemoryCompanionPairingRepository(),
    authority: new ExistingRoundCompanionAuthority(main),
    authenticator: main.hooks.authenticator,
    rateLimiter: main.hooks.rateLimiter,
    appOrigin: main.environment.APP_BASE_URL,
    tokenHashSecret: deriveCompanionSecret(main.environment.DEMO_ACCESS_SECRET),
    available: durableRepository !== null || main.environment.APP_ENV === "development",
    workflow: new CompanionWorkflowProcessor(main),
    ...(main.hooks.now ? { now: main.hooks.now } : {}),
    ...(main.hooks.createId ? { createId: main.hooks.createId } : {})
  });
  return singleton;
}

export function installCompanionRouteRuntimeForIntegration(runtime: CompanionRouteRuntime): void {
  singleton = runtime;
}
