import { createHash, randomBytes } from "node:crypto";

import { ActionService } from "@homerounds/actions";
import {
  TransportMedicationLabelProvider,
  createDisabledMedicationLabelProvider,
  createFakeMedicationLabelProvider,
  type MedicationLabelProvider
} from "@homerounds/assessments";
import {
  FhirBundleClinicalRecordAdapter,
  type ClinicalSnapshot
} from "@homerounds/clinical-records";
import {
  InMemoryHomeRoundsRepository,
  connectPostgresRepository,
  type HomeRoundsRepository
} from "@homerounds/persistence";
import {
  DisabledAdaptiveSelectionProvider,
  FakeAdaptiveSelectionProvider,
  FireworksChatCompletionsTransport,
  StructuredAdaptiveSelectionProvider,
  createRuntimeFireworksDependencies,
  type AdaptiveSelectionProvider
} from "@homerounds/inference";
import { ProtocolDefinitionSchema, type ProtocolDefinition } from "@homerounds/protocols";

import fhirFixture from "../../../../data/fhir/maya-bundle.json";
import protocolFixture from "../../../../data/protocols/cardiometabolic-demo.v1.json";
import { parseServerEnvironment, type ServerEnvironment } from "../env";
import { createDemoSessionAuthenticator } from "./identity";
import type { ApiRouteHooks, RuntimeProfile } from "./http";
import { RoundOrchestrationService } from "./orchestration";
import { StructuredMedicationLabelTransport } from "./medication";
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
  medicationLabel: MedicationLabelProvider;
};

export type ServerRuntimeOverrides = {
  environment?: ServerEnvironment;
  repository?: HomeRoundsRepository<ClinicalSnapshot, PersistedFact>;
  runtimeProfile?: Extract<RuntimeProfile, "postgres" | "in_memory_demo_fallback">;
  now?: () => string;
  createId?: () => string;
  assessmentAttestationSecret?: string;
  adaptiveSelectionProvider?: AdaptiveSelectionProvider;
  medicationLabelProvider?: MedicationLabelProvider;
};

function derivedSecret(source: string | undefined): string {
  const seed = source ?? randomBytes(32).toString("base64url");
  return createHash("sha256").update(`homerounds-assessment\u001f${seed}`).digest("base64url");
}

function repositoryFor(environment: ServerEnvironment): {
  repository: HomeRoundsRepository<ClinicalSnapshot, PersistedFact>;
  profile: Extract<RuntimeProfile, "postgres" | "in_memory_demo_fallback">;
} {
  if (
    environment.PERSISTENCE_PROVIDER === "postgres" ||
    (environment.PERSISTENCE_PROVIDER === "auto" && environment.DATABASE_URL)
  ) {
    if (!environment.DATABASE_URL) {
      throw new Error("PostgreSQL persistence requires server-only DATABASE_URL configuration.");
    }
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
  const fireworksTransport =
    environment.INFERENCE_PROVIDER === "fireworks"
      ? new FireworksChatCompletionsTransport({
          apiKey: environment.FIREWORKS_API_KEY,
          dependencies: createRuntimeFireworksDependencies(),
          policy: {
            timeoutMs: environment.INFERENCE_REQUEST_TIMEOUT_MS,
            maxAttempts: environment.INFERENCE_MAX_RETRIES + 1
          }
        })
      : null;
  const adaptiveSelectionProvider =
    overrides.adaptiveSelectionProvider ??
    (environment.ADAPTIVE_SELECTION_ENABLED && fireworksTransport
      ? new StructuredAdaptiveSelectionProvider(fireworksTransport)
      : environment.ADAPTIVE_SELECTION_ENABLED && environment.INFERENCE_PROVIDER === "fake"
        ? new FakeAdaptiveSelectionProvider({ createId, now })
        : new DisabledAdaptiveSelectionProvider());
  const medicationLabel =
    overrides.medicationLabelProvider ??
    (environment.MEDICATION_LABEL_AI_ENABLED && fireworksTransport
      ? new TransportMedicationLabelProvider(
          new StructuredMedicationLabelTransport(fireworksTransport, createId)
        )
      : environment.MEDICATION_LABEL_AI_ENABLED && environment.INFERENCE_PROVIDER === "fake"
        ? createFakeMedicationLabelProvider(
            {
              observations: [
                {
                  field: "product_name",
                  status: "detected",
                  value: "Synthetic Demo Tablets",
                  confidence: 0.98
                },
                {
                  field: "strength",
                  status: "uncertain",
                  value: "10 mg",
                  confidence: 0.62
                },
                {
                  field: "directions",
                  status: "missing",
                  value: null,
                  confidence: null
                }
              ],
              missingInformation: ["Directions are not visible on the synthetic label"]
            },
            { createId, now }
          )
        : createDisabledMedicationLabelProvider());
  const orchestration = new RoundOrchestrationService({
    repository: selectedRepository.repository,
    protocol,
    selectedProvider: environment.OPTICAL_ASSESSMENT_PROVIDER,
    isSelectedProviderAvailable: async () =>
      environment.OPTICAL_ASSESSMENT_PROVIDER === "finger_ppg" ||
      (environment.VITALLENS_PROXY_ENABLED && Boolean(environment.VITALLENS_API_KEY)),
    assessmentAttestationSecret: attestationSecret,
    adaptiveSelectionProvider,
    adaptiveSelectionEnabled: environment.ADAPTIVE_SELECTION_ENABLED,
    medicationLabelEnabled: environment.MEDICATION_LABEL_AI_ENABLED,
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
    clinician: new ClinicianService({ repository: selectedRepository.repository, now }),
    medicationLabel
  };
}

let singleton: ServerRuntime | undefined;

export function getServerRuntime(): ServerRuntime {
  singleton ??= createServerRuntime();
  return singleton;
}
