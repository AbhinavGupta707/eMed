import type { AdaptiveSelectionInput } from "@homerounds/contracts/inference";
import { describe, expect, it, vi } from "vitest";

import {
  StructuredAdaptiveSelectionProvider,
  type AdaptiveSelectionProvider
} from "./adaptive-selection";
import { DisabledAdaptiveSelectionProvider } from "./baseline";
import { inferenceFailure } from "./failures";
import { AdaptiveSelectionService } from "./selection-service";
import { FakeStructuredCompletionTransport } from "./structured-transport";
import {
  abstentionDecisionFixture,
  adaptiveInputFixture,
  selectionDecisionFixture
} from "./test-fixtures";

const ATTEMPT_ID = "71f1b1b2-9e60-44d7-bb87-cdf5f96059d4";
const NOW = new Date("2026-07-17T09:00:00.000Z");

function structuredProvider(content: unknown): StructuredAdaptiveSelectionProvider {
  return new StructuredAdaptiveSelectionProvider(
    new FakeStructuredCompletionTransport({
      createId: () => ATTEMPT_ID,
      clock: { now: () => NOW },
      respond: () => (typeof content === "string" ? content : JSON.stringify(content))
    })
  );
}

function currentState(input: AdaptiveSelectionInput) {
  return {
    roundId: input.roundId,
    stateVersion: input.stateVersion,
    syntheticDataOnly: true as const,
    redFlagGate: input.redFlagGate
  };
}

function serviceFor(
  provider: AdaptiveSelectionProvider,
  readAuthorityState: ConstructorParameters<
    typeof AdaptiveSelectionService
  >[0]["readAuthorityState"]
) {
  return new AdaptiveSelectionService({ provider, readAuthorityState });
}

describe("strict adaptive selection", () => {
  it.each([
    {
      name: "structured follow-up",
      neededFactKeys: ["follow_up_answer"] as const,
      evidenceReference: "patient.report",
      decision: selectionDecisionFixture("followup.timing", ["patient.report"])
    },
    {
      name: "medication label review",
      neededFactKeys: ["medication_label_observation"] as const,
      evidenceReference: "medication.list",
      decision: selectionDecisionFixture("medication.label", ["medication.list"])
    }
  ])(
    "accepts a novel eligible $name route",
    async ({ decision, evidenceReference, neededFactKeys }) => {
      const base = adaptiveInputFixture();
      const input = adaptiveInputFixture({
        neededFactKeys: [...neededFactKeys],
        context: base.context.filter(({ referenceId }) => referenceId === evidenceReference)
      });
      const result = await structuredProvider(decision).select(input, new AbortController().signal);

      expect(result).toMatchObject({
        ok: true,
        envelope: {
          roundId: input.roundId,
          stateVersion: input.stateVersion,
          decision,
          provenance: {
            provider: "fake",
            task: "adaptive_module_selection",
            contractVersion: "adaptive-selection.v1"
          }
        }
      });
    }
  );

  it("accepts explicit abstention as a successful bounded result", async () => {
    const result = await structuredProvider(abstentionDecisionFixture()).select(
      adaptiveInputFixture(),
      new AbortController().signal
    );

    expect(result).toMatchObject({
      ok: true,
      envelope: { decision: { decision: "abstain", candidateModuleId: null } }
    });
  });

  it("redacts an injected transport exception into the typed provider taxonomy", async () => {
    const provider = new StructuredAdaptiveSelectionProvider({
      async complete() {
        throw new Error("raw provider detail must not escape");
      }
    });

    const result = await provider.select(adaptiveInputFixture(), new AbortController().signal);

    expect(result).toEqual({
      ok: false,
      failure: { code: "provider_unavailable", retryable: false, retryAfterMs: null }
    });
    expect(JSON.stringify(result)).not.toContain("raw provider detail");
  });

  it.each([
    ["invented ID", selectionDecisionFixture("invented.module"), "ineligible_candidate"],
    [
      "unknown evidence reference",
      selectionDecisionFixture("followup.timing", ["unknown.reference"]),
      "invalid_proposal"
    ],
    [
      "extra authority field",
      { ...selectionDecisionFixture("followup.timing"), urgency: "emergency" },
      "invalid_proposal"
    ],
    [
      "cross-module rationale",
      {
        ...selectionDecisionFixture("pulse.local"),
        rationale: "A pulse check and medication label review would both help."
      },
      "invalid_proposal"
    ],
    ["malformed JSON", "{not-json", "invalid_proposal"],
    ["partial JSON", '{"decision":"select"', "invalid_proposal"]
  ])("rejects an %s", async (_name, content, rejectionReason) => {
    const result = await structuredProvider(content).select(
      adaptiveInputFixture(),
      new AbortController().signal
    );

    expect(result).toMatchObject({
      ok: false,
      rejectionReason,
      failure: {
        code: typeof content === "string" ? "malformed_response" : "contract_rejected",
        retryable: false,
        retryAfterMs: null
      }
    });
  });

  it("rejects a listed candidate that is unavailable, over budget, or irrelevant", async () => {
    const base = adaptiveInputFixture();
    const unavailable = adaptiveInputFixture({
      candidates: base.candidates.map((candidate) =>
        candidate.id === "medication.label"
          ? {
              ...candidate,
              availability: { status: "unavailable", reason: "provider_unavailable" }
            }
          : candidate
      )
    });
    const overBudget = adaptiveInputFixture({ burdenSecondsRemaining: 10 });
    const irrelevant = adaptiveInputFixture({ neededFactKeys: ["pulse_bpm"] });

    for (const input of [unavailable, overBudget, irrelevant]) {
      await expect(
        structuredProvider(
          selectionDecisionFixture("medication.label", ["medication.list"])
        ).select(input, new AbortController().signal)
      ).resolves.toMatchObject({
        ok: false,
        rejectionReason: "ineligible_candidate",
        failure: { code: "contract_rejected" }
      });
    }
  });
});

describe("deterministic authority service", () => {
  it("preserves explicit abstention as an accepted outcome", async () => {
    const input = adaptiveInputFixture();
    const service = serviceFor(structuredProvider(abstentionDecisionFixture()), async () =>
      currentState(input)
    );

    await expect(service.select(input, new AbortController().signal)).resolves.toMatchObject({
      status: "accepted",
      envelope: { decision: { decision: "abstain", candidateModuleId: null } }
    });
  });

  it("refuses a result when the round becomes stale during inference", async () => {
    const input = adaptiveInputFixture();
    const states = [
      currentState(input),
      { ...currentState(input), stateVersion: input.stateVersion + 1 }
    ];
    const service = serviceFor(
      structuredProvider(selectionDecisionFixture("followup.timing")),
      async () => states.shift() ?? null
    );

    await expect(service.select(input, new AbortController().signal)).resolves.toMatchObject({
      status: "fallback",
      selectedModuleId: input.deterministicFallbackModuleId,
      reason: "stale_round",
      failure: null
    });
  });

  it.each(["blocked", "uncertain"] as const)(
    "does not call a model when the red-flag gate is %s",
    async (redFlagGate) => {
      const input = adaptiveInputFixture({ redFlagGate });
      const select = vi.fn<AdaptiveSelectionProvider["select"]>();
      const readAuthorityState = vi.fn(async () => currentState(input));
      const service = serviceFor({ select }, readAuthorityState);

      await expect(service.select(input, new AbortController().signal)).resolves.toMatchObject({
        status: "fallback",
        reason: "red_flag_gate_not_clear",
        failure: null
      });
      expect(select).not.toHaveBeenCalled();
      expect(readAuthorityState).not.toHaveBeenCalled();
    }
  );

  it("rejects a red-flag state that changes while the provider is running", async () => {
    const input = adaptiveInputFixture();
    const states = [
      currentState(input),
      { ...currentState(input), redFlagGate: "blocked" as const }
    ];
    const service = serviceFor(
      structuredProvider(selectionDecisionFixture("followup.timing")),
      async () => states.shift() ?? null
    );

    await expect(service.select(input, new AbortController().signal)).resolves.toMatchObject({
      status: "fallback",
      reason: "red_flag_gate_not_clear",
      failure: null
    });
  });

  it("preserves the exact deterministic fallback route and copy across provider failures", async () => {
    const input = adaptiveInputFixture();
    const failures: AdaptiveSelectionProvider[] = [
      new DisabledAdaptiveSelectionProvider(),
      {
        async select() {
          return { ok: false, failure: inferenceFailure("timeout", false) };
        }
      },
      {
        async select() {
          return { ok: false, failure: inferenceFailure("rate_limited", true, 250) };
        }
      },
      structuredProvider("{partial"),
      {
        async select() {
          throw new Error("unhandled provider fault");
        }
      }
    ];

    const outcomes = await Promise.all(
      failures.map((provider) =>
        serviceFor(provider, async () => currentState(input)).select(
          input,
          new AbortController().signal
        )
      )
    );

    expect(
      outcomes.map((outcome) =>
        outcome.status === "fallback"
          ? [outcome.selectedModuleId, outcome.patientRationale]
          : [null, null]
      )
    ).toEqual(
      Array.from({ length: failures.length }, () => [
        "pulse.local",
        "We’ll continue with Check pulse, the safe route available for this round."
      ])
    );
  });
});
