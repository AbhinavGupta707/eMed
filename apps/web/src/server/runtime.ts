import { createHash, randomBytes } from "node:crypto";

import { ActionService } from "@homerounds/actions";
import {
  FhirBundleClinicalRecordAdapter,
  type ClinicalSnapshot
} from "@homerounds/clinical-records";
import {
  InMemoryHomeRoundsRepository,
  connectPostgresRepository,
  type HomeRoundsRepository
} from "@homerounds/persistence";
import { ProtocolDefinitionSchema, type ProtocolDefinition } from "@homerounds/protocols";

import fhirFixture from "../../../../data/fhir/maya-bundle.json";
import protocolFixture from "../../../../data/protocols/cardiometabolic-demo.v1.json";
import { parseServerEnvironment, type ServerEnvironment } from "../env";
import { createDemoSessionAuthenticator } from "./identity";
import type { ApiRouteHooks, RuntimeProfile } from "./http";
import { RoundOrchestrationService } from "./orchestration";
import {
  ElevenLabsCredentialService,
  FetchElevenLabsTokenTransport,
  FetchVitalLensInferenceTransport,
  VitalLensProxyService
} from "./providers";
import { InMemoryRateLimiter } from "./rate-limit";
import { SnapshotService } from "./snapshots";
import { ClinicianService } from "./clinician";

type PersistedFact = unknown;

export type ServerRuntime = {
  environment: ServerEnvironment;
  repository: HomeRoundsRepository<ClinicalSnapshot, PersistedFact>;
  runtimeProfile: Extract<RuntimeProfile, "postgres" | "in_memory_demo_fallback">;
  hooks: ApiRouteHooks;
  protocol: ProtocolDefinition;
  actions: ActionService<ClinicalSnapshot, PersistedFact>;
  orchestration: RoundOrchestrationService<ClinicalSnapshot, PersistedFact>;
  snapshots: SnapshotService<PersistedFact>;
  elevenLabs: ElevenLabsCredentialService;
  vitalLens: VitalLensProxyService;
  clinician: ClinicianService<ClinicalSnapshot, PersistedFact>;
};

export type ServerRuntimeOverrides = {
  environment?: ServerEnvironment;
  repository?: HomeRoundsRepository<ClinicalSnapshot, PersistedFact>;
  runtimeProfile?: Extract<RuntimeProfile, "postgres" | "in_memory_demo_fallback">;
  now?: () => string;
  createId?: () => string;
  assessmentAttestationSecret?: string;
};

function derivedSecret(source: string | undefined): string {
  const seed = source ?? randomBytes(32).toString("base64url");
  return createHash("sha256").update(`homerounds-assessment\u001f${seed}`).digest("base64url");
}

function repositoryFor(environment: ServerEnvironment): {
  repository: HomeRoundsRepository<ClinicalSnapshot, PersistedFact>;
  profile: Extract<RuntimeProfile, "postgres" | "in_memory_demo_fallback">;
} {
  if (environment.DATABASE_URL) {
    return {
      repository: connectPostgresRepository<ClinicalSnapshot, PersistedFact>(
        environment.DATABASE_URL
      ).repository,
      profile: "postgres"
    };
  }
  return {
    repository: new InMemoryHomeRoundsRepository<ClinicalSnapshot, PersistedFact>(),
    profile: "in_memory_demo_fallback"
  };
}

export function createServerRuntime(overrides: ServerRuntimeOverrides = {}): ServerRuntime {
  const environment = overrides.environment ?? parseServerEnvironment();
  const selectedRepository = overrides.repository
    ? {
        repository: overrides.repository,
        profile: overrides.runtimeProfile ?? ("in_memory_demo_fallback" as const)
      }
    : repositoryFor(environment);
  const now = overrides.now ?? (() => new Date().toISOString());
  const createId = overrides.createId ?? (() => globalThis.crypto.randomUUID());
  const protocol = ProtocolDefinitionSchema.parse(protocolFixture);
  const attestationSecret =
    overrides.assessmentAttestationSecret ?? derivedSecret(environment.DEMO_ACCESS_SECRET);
  const adapter = new FhirBundleClinicalRecordAdapter({
    async loadBundle(patientId) {
      if (patientId !== "synthetic-maya") throw new Error("Synthetic fixture not found.");
      return structuredClone(fhirFixture);
    }
  });
  const orchestration = new RoundOrchestrationService({
    repository: selectedRepository.repository,
    protocol,
    selectedProvider: environment.OPTICAL_ASSESSMENT_PROVIDER,
    isSelectedProviderAvailable: async () =>
      environment.OPTICAL_ASSESSMENT_PROVIDER === "finger_ppg" ||
      (environment.VITALLENS_PROXY_ENABLED && Boolean(environment.VITALLENS_API_KEY)),
    assessmentAttestationSecret: attestationSecret,
    now,
    createId
  });
  const hooks: ApiRouteHooks = {
    authenticator: createDemoSessionAuthenticator({
      appEnvironment: environment.APP_ENV,
      ...(environment.DEMO_ACCESS_SECRET ? { secret: environment.DEMO_ACCESS_SECRET } : {}),
      now
    }),
    rateLimiter: new InMemoryRateLimiter(() => Date.parse(now())),
    appOrigin: environment.APP_BASE_URL,
    runtimeProfile: selectedRepository.profile,
    createId,
    now
  };
  return {
    environment,
    repository: selectedRepository.repository,
    runtimeProfile: selectedRepository.profile,
    hooks,
    protocol,
    actions: new ActionService({ repository: selectedRepository.repository, now, createId }),
    orchestration,
    snapshots: new SnapshotService(selectedRepository.repository, adapter, now),
    elevenLabs: new ElevenLabsCredentialService(
      {
        provider: environment.VOICE_PROVIDER,
        ...(environment.ELEVENLABS_API_KEY ? { apiKey: environment.ELEVENLABS_API_KEY } : {}),
        ...(environment.ELEVENLABS_AGENT_ID ? { agentId: environment.ELEVENLABS_AGENT_ID } : {}),
        serverLocation: environment.ELEVENLABS_SERVER_LOCATION,
        maxSessionSeconds: environment.VOICE_SESSION_MAX_SECONDS
      },
      new FetchElevenLabsTokenTransport(),
      now
    ),
    vitalLens: new VitalLensProxyService(
      {
        enabled: environment.VITALLENS_PROXY_ENABLED,
        ...(environment.VITALLENS_API_KEY ? { apiKey: environment.VITALLENS_API_KEY } : {}),
        providerVersion: "vitallens-2.0",
        consentVersion: "homerounds-vital-signs-demo-v1",
        maxPayloadBytes: 5_000_000
      },
      new FetchVitalLensInferenceTransport(),
      now
    ),
    clinician: new ClinicianService({ repository: selectedRepository.repository, now })
  };
}

let singleton: ServerRuntime | undefined;

export function getServerRuntime(): ServerRuntime {
  singleton ??= createServerRuntime();
  return singleton;
}
