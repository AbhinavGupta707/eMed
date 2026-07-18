/** @jsxRuntime automatic */
/** @jsxImportSource react */
// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AISHA_RESILIENCE_ROUND_MAPS,
  MAYA_HAPPY_PATH_ROUND_MAP
} from "../patient/adaptive-round-map.fixtures";
import { AdaptiveRoundMap } from "./adaptive-round-map";
import { RoundMapExperienceSchema, roundMapSelectionPresentation } from "./model";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("adaptive recommendation", () => {
  it("shows one selected task and keeps the rest of the sensor inventory out of view", () => {
    render(createElement(AdaptiveRoundMap, { experience: MAYA_HAPPY_PATH_ROUND_MAP }));

    expect(
      screen.getByRole("region", { name: /pulse check is the most useful next step/i })
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "Quality-gated finger pulse check" })).toBeVisible();
    expect(screen.getByText("Selected — ready")).toBeVisible();
    expect(screen.getByText("What this can clarify")).toBeVisible();
    expect(screen.queryByText("Medication label review")).not.toBeInTheDocument();
    expect(screen.queryByText("Optional remote camera check")).not.toBeInTheDocument();
    expect(screen.queryByText("One structured follow-up")).not.toBeInTheDocument();
  });

  it("requires an explicit continue action before the selected task opens", () => {
    const onContinue = vi.fn();
    render(
      createElement(AdaptiveRoundMap, {
        experience: MAYA_HAPPY_PATH_ROUND_MAP,
        onContinue
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "Continue to this check" }));
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("keeps an explicit continue action for a current evidence step", () => {
    const experience = RoundMapExperienceSchema.parse({
      ...MAYA_HAPPY_PATH_ROUND_MAP,
      modules: MAYA_HAPPY_PATH_ROUND_MAP.modules.map((module) =>
        module.status === "selected" ? { ...module, status: "current" as const } : module
      )
    });
    const onContinue = vi.fn();
    render(createElement(AdaptiveRoundMap, { experience, onContinue }));

    fireEvent.click(screen.getByRole("button", { name: "Continue to this check" }));
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("states plainly when a completed task produced no reading", () => {
    const noMeasurementExperience = RoundMapExperienceSchema.parse({
      ...MAYA_HAPPY_PATH_ROUND_MAP,
      modules: MAYA_HAPPY_PATH_ROUND_MAP.modules.map((module) =>
        module.candidate.id === "pulse.local"
          ? {
              ...module,
              status: "completed_without_measurement",
              statusDetail: "No numeric pulse reading was accepted."
            }
          : module
      )
    });

    render(createElement(AdaptiveRoundMap, { experience: noMeasurementExperience }));

    expect(screen.getByText("Completed — no measurement")).toBeVisible();
    expect(screen.getByText("No numeric pulse reading was accepted.")).toBeVisible();
    expect(screen.queryByText(/bpm/i)).not.toBeInTheDocument();
  });

  it.each([
    ["loading", AISHA_RESILIENCE_ROUND_MAPS.loading, "Choosing the smallest useful next step"],
    ["retrying", AISHA_RESILIENCE_ROUND_MAPS.retrying, "Checking the next step again"],
    [
      "unavailable",
      AISHA_RESILIENCE_ROUND_MAPS.unavailable,
      "A personalised recommendation is unavailable"
    ],
    ["abstained", AISHA_RESILIENCE_ROUND_MAPS.abstained, "Your usual next step is still available"],
    ["rejected", AISHA_RESILIENCE_ROUND_MAPS.rejected, "That suggestion did not fit this round"],
    ["stale", AISHA_RESILIENCE_ROUND_MAPS.stale, "The selection result is out of date"]
  ])("renders the %s state without losing saved progress", (_label, experience, title) => {
    render(createElement(AdaptiveRoundMap, { experience }));

    expect(screen.getByRole("heading", { name: title })).toBeVisible();
    expect(screen.getByText("Your confirmed progress is still here")).toBeVisible();
    expect(screen.getByText(/confirmed step kept/i)).toBeVisible();
  });

  it("offers retry only when the settled recommendation can be checked again", () => {
    const onRetry = vi.fn();
    const { rerender } = render(
      createElement(AdaptiveRoundMap, {
        experience: AISHA_RESILIENCE_ROUND_MAPS.unavailable,
        onRetry
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "Check the recommendation again" }));
    expect(onRetry).toHaveBeenCalledOnce();

    rerender(
      createElement(AdaptiveRoundMap, {
        experience: AISHA_RESILIENCE_ROUND_MAPS.abstained,
        onRetry
      })
    );
    expect(
      screen.queryByRole("button", { name: "Check the recommendation again" })
    ).not.toBeInTheDocument();
  });

  it("rejects an unavailable task marked as selected", () => {
    const invalid = {
      ...MAYA_HAPPY_PATH_ROUND_MAP,
      modules: MAYA_HAPPY_PATH_ROUND_MAP.modules.map((module) =>
        module.candidate.id === "pulse.remote" ? { ...module, status: "selected" } : module
      )
    };

    expect(RoundMapExperienceSchema.safeParse(invalid).success).toBe(false);
  });

  it("treats an older uncommitted result as stale without changing the saved route", () => {
    const staleAccepted = RoundMapExperienceSchema.parse({
      ...MAYA_HAPPY_PATH_ROUND_MAP,
      currentRoundVersion: 5
    });

    expect(roundMapSelectionPresentation(staleAccepted)).toMatchObject({
      kind: "stale",
      retryable: true,
      rationaleSource: "deterministic_template"
    });
  });
});
