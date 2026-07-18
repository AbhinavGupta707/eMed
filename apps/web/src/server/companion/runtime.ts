import { randomUUID } from "node:crypto";

import {
  CompanionService,
  InMemoryCompanionPairingRepository,
  type CompanionPairingRepository,
  type CompanionRoundAuthorityPort
} from "@homerounds/companion";
import type { DemoSessionAuthenticator } from "../identity";
import type { RateLimiter } from "../rate-limit";
import { getServerRuntime } from "../runtime";
import { ExistingRoundCompanionAuthority } from "./authority";
import { deriveCompanionSecret, NodeCompanionCrypto } from "./crypto";

export type CompanionRouteRuntime = {
  service: CompanionService;
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
  singleton = createCompanionRouteRuntime({
    repository: new InMemoryCompanionPairingRepository(),
    authority: new ExistingRoundCompanionAuthority(main),
    authenticator: main.hooks.authenticator,
    rateLimiter: main.hooks.rateLimiter,
    appOrigin: main.environment.APP_BASE_URL,
    tokenHashSecret: deriveCompanionSecret(main.environment.DEMO_ACCESS_SECRET),
    // Durable registration is orchestrator-owned. Hosted routes fail closed until it is wired.
    available: main.environment.APP_ENV === "development",
    ...(main.hooks.now ? { now: main.hooks.now } : {}),
    ...(main.hooks.createId ? { createId: main.hooks.createId } : {})
  });
  return singleton;
}

export function installCompanionRouteRuntimeForIntegration(runtime: CompanionRouteRuntime): void {
  singleton = runtime;
}
