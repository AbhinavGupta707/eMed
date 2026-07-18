import type {
  CompanionConsentRequirement,
  CompanionRoundAuthorityPort,
  CompanionRoundAuthoritySnapshot,
  CompanionTaskKind
} from "@homerounds/companion";
import type { ServerRuntime } from "../runtime";

const taskKindByModuleId: Readonly<Record<string, CompanionTaskKind>> = {
  "capture.finger_ppg.pulse": "finger_pulse",
  "capture.vitallens.pulse": "face_pulse",
  "voice.local.baseline": "voice_signal",
  "medication.label.review": "medication_label"
};

function consentFor(kind: CompanionTaskKind): CompanionConsentRequirement {
  switch (kind) {
    case "finger_pulse":
    case "voice_signal":
    case "medication_label":
      return { kind: "explicit_local_capture", version: "homerounds-local-capture-v1" };
    case "face_pulse":
      return {
        kind: "explicit_third_party_processing",
        version: "homerounds-vital-signs-demo-v1"
      };
  }
}

export class ExistingRoundCompanionAuthority implements CompanionRoundAuthorityPort {
  constructor(private readonly runtime: ServerRuntime) {}

  async read(roundId: string): Promise<CompanionRoundAuthoritySnapshot | null> {
    let round;
    try {
      round = await this.runtime.orchestration.getRound(roundId);
    } catch {
      return null;
    }
    const route = await this.runtime.orchestration.getEvidenceRoute(round.id);
    const selectedModuleId = route.selectedModuleId;
    const selectedKind = selectedModuleId ? taskKindByModuleId[selectedModuleId] : undefined;
    const candidateKinds = route.candidates.flatMap((candidate) => {
      const kind = taskKindByModuleId[candidate.id];
      return kind && candidate.availability.status === "available" ? [kind] : [];
    });
    const allowedTaskKinds = [
      ...new Set(selectedKind ? [...candidateKinds, selectedKind] : candidateKinds)
    ];
    const safeAllowedTaskKinds =
      allowedTaskKinds.length > 0 ? allowedTaskKinds : ["finger_pulse" as const];
    const pairable =
      selectedKind !== undefined &&
      (round.state === "assessment_selected" || round.state === "capture_retry");
    return {
      roundId: round.id,
      patientId: round.patientId,
      roundStateVersion: round.stateVersion,
      pairable,
      currentTask:
        pairable && selectedModuleId && selectedKind
          ? {
              taskId: selectedModuleId,
              kind: selectedKind,
              taskVersion: Math.max(1, round.stateVersion)
            }
          : null,
      allowedTaskKinds: safeAllowedTaskKinds,
      consentRequirement: selectedKind
        ? consentFor(selectedKind)
        : { kind: "explicit_local_capture", version: "homerounds-local-capture-v1" }
    };
  }
}
