import { z } from "zod";

import {
  DeterministicTriggerEvaluationSchema,
  EvaluateTriggerInputSchema,
  ProactiveRoundCreationProposalSchema,
  ProactiveRoundCreationProposedEventSchema,
  TriggerFactEvaluationSchema,
  type DeterministicTriggerEvaluation,
  type EvaluateTriggerInput,
  type KnownStructuredFactData,
  type SyntheticLongitudinalFact,
  type TriggerChangeRule,
  type TriggerFactEvaluation
} from "./schemas";

const FNV_OFFSET_BASIS = 14_695_981_039_346_656_037n;
const FNV_PRIME = 1_099_511_628_211n;
const UINT64_MASK = 18_446_744_073_709_551_615n;

function canonicalStringify(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalStringify(entry)).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Readonly<Record<string, unknown>>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalStringify(record[key])}`)
      .join(",")}}`;
  }
  throw new Error("Unsupported value in deterministic trigger fingerprint.");
}

function fnv1a(value: string, offset: bigint): string {
  let hash = offset;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = (hash * FNV_PRIME) & UINT64_MASK;
  }
  return hash.toString(16).padStart(16, "0");
}

/** Stable non-secret fingerprint for idempotency only; never use it for authentication. */
export function deterministicTriggerFingerprint(value: unknown): string {
  const canonical = canonicalStringify(value);
  return `${fnv1a(`a\u001f${canonical}`, FNV_OFFSET_BASIS)}${fnv1a(
    `b\u001f${canonical}`,
    FNV_OFFSET_BASIS ^ 9_780_819_481_956_259_429n
  )}`;
}

export class TriggerInputConflictError extends Error {
  readonly code = "trigger_input_conflict";

  constructor(
    readonly reason: "duplicate_fact_conflict" | "duplicate_fact_id_conflict",
    readonly factReference: string
  ) {
    super(`Deterministic trigger input was rejected: ${reason} (${factReference}).`);
    this.name = "TriggerInputConflictError";
  }
}

function latestFacts(
  facts: readonly SyntheticLongitudinalFact[]
): ReadonlyMap<string, SyntheticLongitudinalFact> {
  const byKeyAndVersion = new Map<string, SyntheticLongitudinalFact>();
  const byId = new Map<string, SyntheticLongitudinalFact>();
  for (const fact of facts) {
    const versionKey = `${fact.factKey}\u001f${fact.factVersion}`;
    const existingVersion = byKeyAndVersion.get(versionKey);
    if (existingVersion && canonicalStringify(existingVersion) !== canonicalStringify(fact)) {
      throw new TriggerInputConflictError("duplicate_fact_conflict", versionKey);
    }
    const existingId = byId.get(fact.factId);
    if (existingId && canonicalStringify(existingId) !== canonicalStringify(fact)) {
      throw new TriggerInputConflictError("duplicate_fact_id_conflict", fact.factId);
    }
    byKeyAndVersion.set(versionKey, fact);
    byId.set(fact.factId, fact);
  }

  const latest = new Map<string, SyntheticLongitudinalFact>();
  for (const fact of byKeyAndVersion.values()) {
    const current = latest.get(fact.factKey);
    if (!current || fact.factVersion > current.factVersion) latest.set(fact.factKey, fact);
  }
  return latest;
}

function factReference(fact: SyntheticLongitudinalFact | undefined) {
  return fact ? { factId: fact.factId, factVersion: fact.factVersion } : null;
}

function unavailableEvaluation(
  rule: TriggerChangeRule,
  previous: SyntheticLongitudinalFact | undefined,
  current: SyntheticLongitudinalFact | undefined,
  reason: Extract<
    TriggerFactEvaluation["reason"],
    | "missing_previous_fact"
    | "missing_current_fact"
    | "previous_value_unknown_or_missing"
    | "current_value_unknown_or_missing"
    | "fact_kind_mismatch"
    | "unit_mismatch"
  >
): TriggerFactEvaluation {
  return TriggerFactEvaluationSchema.parse({
    ruleId: rule.ruleId,
    factKey: rule.factKey,
    status: "insufficient_data",
    reason,
    previousFact: factReference(previous),
    currentFact: factReference(current),
    comparison: { kind: "not_available" }
  });
}

function compareKnownValues(
  rule: TriggerChangeRule,
  previous: SyntheticLongitudinalFact,
  current: SyntheticLongitudinalFact,
  previousData: KnownStructuredFactData,
  currentData: KnownStructuredFactData
): TriggerFactEvaluation {
  if (rule.comparison === "numeric_absolute_delta") {
    if (previousData.kind !== "number" || currentData.kind !== "number") {
      return unavailableEvaluation(rule, previous, current, "fact_kind_mismatch");
    }
    if (
      previousData.unit !== rule.unit ||
      currentData.unit !== rule.unit ||
      previousData.unit !== currentData.unit
    ) {
      return unavailableEvaluation(rule, previous, current, "unit_mismatch");
    }
    const absoluteDelta = Number(Math.abs(currentData.value - previousData.value).toFixed(8));
    const changed = absoluteDelta >= rule.absoluteDeltaThreshold;
    return TriggerFactEvaluationSchema.parse({
      ruleId: rule.ruleId,
      factKey: rule.factKey,
      status: changed ? "changed" : "unchanged",
      reason: changed ? "numeric_threshold_met" : "numeric_threshold_not_met",
      previousFact: factReference(previous),
      currentFact: factReference(current),
      comparison: {
        kind: "numeric_delta",
        absoluteDelta,
        threshold: rule.absoluteDeltaThreshold,
        unit: rule.unit
      }
    });
  }

  if (previousData.kind !== currentData.kind) {
    return unavailableEvaluation(rule, previous, current, "fact_kind_mismatch");
  }
  const equal = canonicalStringify(previousData) === canonicalStringify(currentData);
  return TriggerFactEvaluationSchema.parse({
    ruleId: rule.ruleId,
    factKey: rule.factKey,
    status: equal ? "unchanged" : "changed",
    reason: equal ? "exact_value_unchanged" : "exact_value_changed",
    previousFact: factReference(previous),
    currentFact: factReference(current),
    comparison: { kind: "exact_equality", equal }
  });
}

function evaluateRule(
  rule: TriggerChangeRule,
  previous: SyntheticLongitudinalFact | undefined,
  current: SyntheticLongitudinalFact | undefined,
  evaluatedAtMs: number,
  maxCurrentFactAgeSeconds: number
): TriggerFactEvaluation {
  if (!previous) return unavailableEvaluation(rule, previous, current, "missing_previous_fact");
  if (!current) return unavailableEvaluation(rule, previous, current, "missing_current_fact");
  if (current.factVersion <= previous.factVersion) {
    return TriggerFactEvaluationSchema.parse({
      ruleId: rule.ruleId,
      factKey: rule.factKey,
      status: "stale_version",
      reason: "current_version_not_newer",
      previousFact: factReference(previous),
      currentFact: factReference(current),
      comparison: { kind: "not_available" }
    });
  }
  const currentAgeMs = evaluatedAtMs - Date.parse(current.observedAt);
  if (currentAgeMs < 0 || currentAgeMs > maxCurrentFactAgeSeconds * 1_000) {
    return TriggerFactEvaluationSchema.parse({
      ruleId: rule.ruleId,
      factKey: rule.factKey,
      status: "stale_version",
      reason: "current_fact_too_old",
      previousFact: factReference(previous),
      currentFact: factReference(current),
      comparison: { kind: "not_available" }
    });
  }
  if (previous.value.status !== "known") {
    return unavailableEvaluation(rule, previous, current, "previous_value_unknown_or_missing");
  }
  if (current.value.status !== "known") {
    return unavailableEvaluation(rule, previous, current, "current_value_unknown_or_missing");
  }
  return compareKnownValues(rule, previous, current, previous.value.data, current.value.data);
}

function createProposal(
  input: EvaluateTriggerInput,
  factEvaluations: readonly TriggerFactEvaluation[],
  previousFacts: ReadonlyMap<string, SyntheticLongitudinalFact>,
  currentFacts: ReadonlyMap<string, SyntheticLongitudinalFact>
) {
  const changedFacts = factEvaluations
    .filter((evaluation) => evaluation.status === "changed")
    .map((evaluation) => {
      const previous = previousFacts.get(evaluation.factKey);
      const current = currentFacts.get(evaluation.factKey);
      if (!previous || !current) {
        throw new Error("Changed trigger facts must have both prior and current versions.");
      }
      return {
        factKey: evaluation.factKey,
        previousFactId: previous.factId,
        previousFactVersion: previous.factVersion,
        currentFactId: current.factId,
        currentFactVersion: current.factVersion,
        explanationCode:
          evaluation.reason === "numeric_threshold_met"
            ? ("numeric_threshold_met" as const)
            : ("exact_value_changed" as const),
        valueFingerprint: deterministicTriggerFingerprint(current.value)
      };
    })
    .sort((left, right) => left.factKey.localeCompare(right.factKey));
  const identity = deterministicTriggerFingerprint({
    patientId: input.patientId,
    policyVersion: input.policy.policyVersion,
    protocolId: input.policy.protocolId,
    changedFacts
  });
  const triggerId = `proactive-trigger:v1:${identity}`;
  const proposalId = `round-proposal:v1:${identity}`;
  const eventId = `round-proposal-event:v1:${identity}`;
  const idempotencyKey = `proactive-round:v1:${identity}`;
  const proposal = ProactiveRoundCreationProposalSchema.parse({
    schemaVersion: "proactive-round-creation-proposal.v1",
    proposalId,
    triggerId,
    idempotencyKey,
    patientId: input.patientId,
    dataClassification: "synthetic_demo",
    status: "proposed",
    policyVersion: input.policy.policyVersion,
    protocolId: input.policy.protocolId,
    purposeCode: input.policy.purposeCode,
    proposedAt: input.evaluatedAt,
    sourceInvocation: input.invocation,
    changedFacts: changedFacts.map((fact) => ({
      factKey: fact.factKey,
      previousFactId: fact.previousFactId,
      previousFactVersion: fact.previousFactVersion,
      currentFactId: fact.currentFactId,
      currentFactVersion: fact.currentFactVersion,
      explanationCode: fact.explanationCode
    })),
    authority: {
      proposalOnly: true,
      clinicalInterpretation: "none",
      workflowAuthority: false,
      requiresAuthoritativeRedFlagGate: true,
      requiresAuthoritativeProtocolEvaluation: true,
      requiresAuthoritativeRoundCreation: true
    }
  });
  const event = ProactiveRoundCreationProposedEventSchema.parse({
    schemaVersion: "proactive-round-creation-proposed-event.v1",
    eventId,
    eventType: "proactive_round_creation_proposed",
    eventVersion: 1,
    idempotencyKey,
    occurredAt: input.evaluatedAt,
    patientId: input.patientId,
    triggerId,
    proposalId,
    invocationKind: input.invocation.kind,
    roundCreated: false,
    workflowAuthority: false
  });
  return { proposal, event };
}

export function evaluateDeterministicTrigger(
  inputValue: EvaluateTriggerInput
): DeterministicTriggerEvaluation {
  const input = EvaluateTriggerInputSchema.parse(inputValue);
  const evaluatedAtMs = Date.parse(input.evaluatedAt);
  const previousFacts = latestFacts(input.previousFacts);
  const currentFacts = latestFacts(input.currentFacts);
  const factEvaluations = input.policy.rules.map((rule) =>
    evaluateRule(
      rule,
      previousFacts.get(rule.factKey),
      currentFacts.get(rule.factKey),
      evaluatedAtMs,
      input.policy.maxCurrentFactAgeSeconds
    )
  );
  const changedFactCount = factEvaluations.filter(({ status }) => status === "changed").length;
  const common = {
    schemaVersion: "deterministic-trigger-evaluation.v1" as const,
    patientId: input.patientId,
    dataClassification: "synthetic_demo" as const,
    evaluatedAt: input.evaluatedAt,
    invocation: input.invocation,
    policyVersion: input.policy.policyVersion,
    factEvaluations,
    changedFactCount,
    authority: {
      basis: "versioned_structured_synthetic_facts_only" as const,
      clinicalInterpretation: "none" as const,
      workflowAuthority: false as const
    }
  };
  if (factEvaluations.some(({ status }) => status === "stale_version")) {
    return DeterministicTriggerEvaluationSchema.parse({
      ...common,
      status: "stale_input",
      reason: "stale_fact_version_or_time",
      proposal: null,
      event: null
    });
  }
  if (factEvaluations.some(({ status }) => status === "insufficient_data")) {
    return DeterministicTriggerEvaluationSchema.parse({
      ...common,
      status: "insufficient_data",
      reason: "unknown_or_missing_fact",
      proposal: null,
      event: null
    });
  }
  if (changedFactCount < input.policy.minimumChangedFacts) {
    return DeterministicTriggerEvaluationSchema.parse({
      ...common,
      status: "not_triggered",
      reason: "change_threshold_not_met",
      proposal: null,
      event: null
    });
  }
  const { proposal, event } = createProposal(input, factEvaluations, previousFacts, currentFacts);
  return DeterministicTriggerEvaluationSchema.parse({
    ...common,
    status: "triggered",
    reason: "combined_personal_change",
    proposal,
    event
  });
}

export const DeterministicTriggerFingerprintSchema = z
  .string()
  .length(32)
  .regex(/^[a-f0-9]{32}$/);
