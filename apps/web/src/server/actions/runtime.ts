import {
  CareActionAuthoritySchema,
  SYNTHETIC_CARE_ACTION_ALLOWLIST,
  SyntheticCareActionService,
  type CareActionAuthority
} from "@homerounds/actions";

import type { ApiRouteHooks } from "../http";
import type { ServerRuntime } from "../runtime";

export type CareActionHandlerRuntime = {
  hooks: ApiRouteHooks;
  persistence: "current_process" | "durable" | "durable_unavailable";
  service: SyntheticCareActionService;
  prepareAuthority(roundId: string): Promise<CareActionAuthority | null>;
};

const runtimeCache = new WeakMap<ServerRuntime, CareActionHandlerRuntime>();

export function createServerCareActionRuntime(runtime: ServerRuntime): CareActionHandlerRuntime {
  const existing = runtimeCache.get(runtime);
  if (existing) return existing;

  const repository = runtime.finalPass.careActions;
  const service = new SyntheticCareActionService({
    repository,
    ...(runtime.hooks.now ? { now: runtime.hooks.now } : {}),
    ...(runtime.hooks.createId ? { createId: runtime.hooks.createId } : {})
  });
  const careRuntime: CareActionHandlerRuntime = {
    hooks: runtime.hooks,
    persistence: runtime.runtimeProfile === "postgres" ? "durable" : "current_process",
    service,
    async prepareAuthority(roundId) {
      const round = await runtime.repository.getRound(roundId);
      if (!round) return null;
      const [protocolResult, measurements, events] = await Promise.all([
        runtime.orchestration.getProtocolResult(roundId),
        runtime.repository.listMeasurementFacts(roundId),
        runtime.repository.listAuditEvents(roundId)
      ]);
      const redFlagGate =
        round.state === "emergency_closed" || protocolResult?.outcome === "emergency_guidance"
          ? "stop"
          : protocolResult === null
            ? "unknown"
            : "clear";
      const acceptedMeasurement = measurements.find(({ fact }) => fact.quality.status === "pass");
      const rejectedCapture = events.some(({ type }) => type === "capture_quality_rejected");
      const actionEligible =
        redFlagGate === "clear" &&
        protocolResult?.allowedActions.length === 1 &&
        protocolResult.allowedActions[0] === "create_programme_task" &&
        (round.state === "action_pending" || round.state === "awaiting_clinician");
      const authority = CareActionAuthoritySchema.parse({
        roundId: round.id,
        patientId: round.patientId,
        roundVersion: round.stateVersion,
        roundState: round.state,
        redFlagGate,
        eligibleActions: actionEligible ? SYNTHETIC_CARE_ACTION_ALLOWLIST : [],
        evidence:
          redFlagGate === "clear" && protocolResult
            ? {
                summary:
                  protocolResult.outcome === "abstain_for_review"
                    ? "The safety workflow requested human review because confirmed evidence was insufficient."
                    : "The safety workflow requested review of the patient-confirmed structured evidence.",
                protocolId: protocolResult.protocolId,
                protocolVersion: protocolResult.protocolVersion,
                protocolOutcome: protocolResult.outcome,
                sourceFactIds: protocolResult.factIds,
                captureQuality: acceptedMeasurement ? "pass" : rejectedCapture ? "fail" : "unknown",
                measurementState: acceptedMeasurement
                  ? "accepted"
                  : rejectedCapture
                    ? "not_accepted"
                    : "unknown",
                redFlagGate: "clear",
                generatedAt: round.updatedAt,
                rawTranscriptStored: false,
                modelReasoningStored: false,
                rawMediaStored: false
              }
            : null
      });
      await repository.setAuthority(authority);
      return authority;
    }
  };
  runtimeCache.set(runtime, careRuntime);
  return careRuntime;
}
