import {
  AdaptiveSelectionOutcomeSchema,
  EvidenceModuleCandidateSchema,
  type AdaptiveSelectionOutcome,
  type EvidenceFactKey,
  type EvidenceModuleCandidate
} from "@homerounds/contracts";
import { z } from "zod";

export const RoundMapModuleStatusSchema = z.enum([
  "completed",
  "completed_without_measurement",
  "current",
  "selected",
  "skipped",
  "unavailable",
  "next"
]);
export type RoundMapModuleStatus = z.infer<typeof RoundMapModuleStatusSchema>;

export const RoundMapModuleSchema = z
  .object({
    candidate: EvidenceModuleCandidateSchema,
    status: RoundMapModuleStatusSchema,
    statusDetail: z.string().trim().min(1).max(160).nullable()
  })
  .strict();
export type RoundMapModule = z.infer<typeof RoundMapModuleSchema>;

export const RoundMapSelectionStateSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("not_requested") }).strict(),
  z.object({ status: z.literal("loading") }).strict(),
  z.object({ status: z.literal("retrying") }).strict(),
  z
    .object({
      status: z.literal("settled"),
      outcome: AdaptiveSelectionOutcomeSchema,
      committed: z.literal(true).optional()
    })
    .strict()
]);
export type RoundMapSelectionState = z.infer<typeof RoundMapSelectionStateSchema>;

export const RoundMapExperienceSchema = z
  .object({
    currentRoundVersion: z.number().int().nonnegative(),
    modules: z.array(RoundMapModuleSchema).min(1).max(8),
    resumedConfirmedProgress: z.boolean(),
    selection: RoundMapSelectionStateSchema,
    syntheticStoryLabel: z.string().trim().min(1).max(80).nullable()
  })
  .strict()
  .superRefine((experience, context) => {
    const moduleIds = experience.modules.map(({ candidate }) => candidate.id);
    if (new Set(moduleIds).size !== moduleIds.length) {
      context.addIssue({
        code: "custom",
        message: "round map module IDs must be unique",
        path: ["modules"]
      });
    }

    for (const status of ["current", "selected"] as const) {
      if (experience.modules.filter((module) => module.status === status).length > 1) {
        context.addIssue({
          code: "custom",
          message: `round map may contain at most one ${status} module`,
          path: ["modules"]
        });
      }
    }

    experience.modules.forEach((module, index) => {
      const unavailable = module.candidate.availability.status === "unavailable";
      if ((module.status === "unavailable") !== unavailable) {
        context.addIssue({
          code: "custom",
          message: "unavailable progress must match candidate availability",
          path: ["modules", index, "status"]
        });
      }
    });

    if (
      experience.resumedConfirmedProgress &&
      !experience.modules.some(({ status }) => status === "completed")
    ) {
      context.addIssue({
        code: "custom",
        message: "resumed confirmed progress requires a completed module",
        path: ["resumedConfirmedProgress"]
      });
    }
  });
export type RoundMapExperience = z.infer<typeof RoundMapExperienceSchema>;

export type RoundMapPresentationKind =
  | "deterministic"
  | "loading"
  | "retrying"
  | "accepted"
  | "unavailable"
  | "abstained"
  | "rejected"
  | "stale"
  | "safety_fallback";

export type RoundMapSelectionPresentation = Readonly<{
  kind: RoundMapPresentationKind;
  title: string;
  description: string;
  rationale: string;
  rationaleSource: "ai_checked" | "deterministic_template" | "deterministic_fallback";
  uncertainty: "low" | "medium" | "high" | null;
  missingInformation: readonly string[];
  retryable: boolean;
}>;

const factLabels: Readonly<Record<EvidenceFactKey, string>> = {
  follow_up_answer: "a confirmed answer",
  medication_label_observation: "a reviewed label observation",
  pulse_bpm: "a quality-gated pulse estimate",
  voice_biomarker_observation: "a quality-gated research voice signal"
};

export function roundMapStatusLabel(status: RoundMapModuleStatus): string {
  switch (status) {
    case "completed":
      return "Completed — confirmed";
    case "completed_without_measurement":
      return "Completed — no measurement";
    case "current":
      return "Current — in progress";
    case "selected":
      return "Selected — ready";
    case "skipped":
      return "Skipped — not required";
    case "unavailable":
      return "Unavailable — cannot be used";
    case "next":
      return "Next — waiting";
  }
}

export function roundMapStatusDescription(module: RoundMapModule): string {
  if (module.statusDetail) return module.statusDetail;
  switch (module.status) {
    case "completed":
      return "Your confirmed information is preserved.";
    case "completed_without_measurement":
      return "The evidence step ended without an accepted numeric measurement.";
    case "current":
      return "This evidence step is open now.";
    case "selected":
      return "This eligible step is ready to start.";
    case "skipped":
      return "Your saved route does not need this step now.";
    case "unavailable":
      return availabilityReason(module.candidate);
    case "next":
      return "This step remains available if your saved route needs it.";
  }
}

function availabilityReason(candidate: EvidenceModuleCandidate): string {
  if (candidate.availability.status === "available") return candidate.description;
  switch (candidate.availability.reason) {
    case "not_needed":
      return "Your saved route does not need this check.";
    case "unsupported_device":
      return "This device does not support this module.";
    case "permission_denied":
      return "Required permission was not granted.";
    case "missing_configuration":
      return "This check is not available right now.";
    case "provider_unavailable":
      return "This check is temporarily unavailable.";
    case "burden_exceeded":
      return "The remaining round time does not allow this module.";
  }
}

function deterministicRationale(experience: RoundMapExperience): string {
  const nextModule =
    experience.modules.find(({ status }) => status === "current") ??
    experience.modules.find(({ status }) => status === "selected") ??
    experience.modules.find(({ status }) => status === "next");
  if (!nextModule) {
    return "Your confirmed information is enough to continue without another evidence step.";
  }
  const facts = nextModule.candidate.producesFactKeys.map((key) => factLabels[key]);
  return `Based on your confirmed answers, ${nextModule.candidate.label.toLowerCase()} can add ${facts.join(" and ")}.`;
}

function acceptedPresentation(
  experience: RoundMapExperience,
  outcome: Extract<AdaptiveSelectionOutcome, { status: "accepted" }>,
  committed: boolean
): RoundMapSelectionPresentation {
  const { decision } = outcome.envelope;
  if (!committed && outcome.envelope.stateVersion !== experience.currentRoundVersion) {
    return {
      kind: "stale",
      title: "The selection result is out of date",
      description: "Your current saved round is newer, so this result was not used.",
      rationale: deterministicRationale(experience),
      rationaleSource: "deterministic_template",
      uncertainty: null,
      missingInformation: [],
      retryable: true
    };
  }
  if (decision.decision === "abstain") {
    return {
      kind: "abstained",
      title: "Your usual next step is still available",
      description:
        "No personalised recommendation was used. Your saved route still has a safe way forward.",
      rationale: decision.rationale,
      rationaleSource: "ai_checked",
      uncertainty: decision.uncertainty,
      missingInformation: decision.missingInformation,
      retryable: false
    };
  }
  const selected = experience.modules.find(
    ({ candidate }) => candidate.id === decision.candidateModuleId
  );
  if (!selected || selected.candidate.availability.status !== "available") {
    return {
      kind: "rejected",
      title: "That suggestion did not fit this round",
      description:
        "It was not one of the available choices, so your saved route was left unchanged.",
      rationale: deterministicRationale(experience),
      rationaleSource: "deterministic_template",
      uncertainty: null,
      missingInformation: [],
      retryable: true
    };
  }
  return {
    kind: "accepted",
    title: `${selected.candidate.label} is the most useful next step.`,
    description:
      "It can clarify one piece of your confirmed check-in without adding unnecessary tasks.",
    rationale: decision.rationale,
    rationaleSource: "ai_checked",
    uncertainty: decision.uncertainty,
    missingInformation: decision.missingInformation,
    retryable: false
  };
}

function fallbackPresentation(
  experience: RoundMapExperience,
  outcome: Extract<AdaptiveSelectionOutcome, { status: "fallback" }>
): RoundMapSelectionPresentation {
  const shared = {
    rationale: outcome.patientRationale,
    rationaleSource: "deterministic_fallback" as const,
    uncertainty: null,
    missingInformation: [] as readonly string[]
  };
  switch (outcome.reason) {
    case "disabled":
    case "provider_failure":
      return {
        ...shared,
        kind: "unavailable",
        title: "A personalised recommendation is unavailable",
        description:
          "Your confirmed progress is safe. HomeRounds can continue with the usual next step.",
        retryable: outcome.failure?.retryable ?? false
      };
    case "invalid_proposal":
    case "ineligible_candidate":
      return {
        ...shared,
        kind: "rejected",
        title: "That suggestion did not fit this round",
        description:
          "It was not one of the available choices, so it cannot change your saved route.",
        retryable: outcome.failure?.retryable ?? true
      };
    case "stale_round":
      return {
        ...shared,
        kind: "stale",
        title: "The selection result is out of date",
        description: "The saved round changed before the result arrived, so it was not used.",
        retryable: true
      };
    case "red_flag_gate_not_clear":
      return {
        ...shared,
        kind: "safety_fallback",
        title: "The safety check needs your attention",
        description: "No recommendation was made while a required safety answer remained unclear.",
        retryable: false
      };
  }
}

export function roundMapSelectionPresentation(
  input: RoundMapExperience
): RoundMapSelectionPresentation {
  const experience = RoundMapExperienceSchema.parse(input);
  switch (experience.selection.status) {
    case "not_requested":
      return {
        kind: "deterministic",
        title: "Your next useful step",
        description: "Your confirmed answers already point to one available next check.",
        rationale: deterministicRationale(experience),
        rationaleSource: "deterministic_template",
        uncertainty: null,
        missingInformation: [],
        retryable: false
      };
    case "loading":
      return {
        kind: "loading",
        title: "Choosing the smallest useful next step",
        description: "Your confirmed progress stays saved while the available choices are checked.",
        rationale: deterministicRationale(experience),
        rationaleSource: "deterministic_template",
        uncertainty: null,
        missingInformation: [],
        retryable: false
      };
    case "retrying":
      return {
        kind: "retrying",
        title: "Checking the next step again",
        description: "Your confirmed progress remains saved; an older suggestion is not reused.",
        rationale: deterministicRationale(experience),
        rationaleSource: "deterministic_template",
        uncertainty: null,
        missingInformation: [],
        retryable: false
      };
    case "settled":
      return experience.selection.outcome.status === "accepted"
        ? acceptedPresentation(
            experience,
            experience.selection.outcome,
            experience.selection.committed === true
          )
        : fallbackPresentation(experience, experience.selection.outcome);
  }
}
