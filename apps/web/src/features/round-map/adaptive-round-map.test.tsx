/** @jsxRuntime automatic */
/** @jsxImportSource react */
// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

describe("adaptive Round Map", () => {
  it("shows every module state with persistent non-colour text", () => {
    render(createElement(AdaptiveRoundMap, { experience: MAYA_HAPPY_PATH_ROUND_MAP }));

    const map = screen.getByRole("region", { name: "Round Map" });
    expect(within(map).getByText("Completed — confirmed")).toBeVisible();
    expect(within(map).getByText("Selected — ready")).toBeVisible();
    expect(within(map).getByText("Skipped — not required")).toBeVisible();
    expect(within(map).getByText("Unavailable — cannot be used")).toBeVisible();
    expect(within(map).getByText("Next — waiting")).toBeVisible();
    expect(within(map).getByText("Why this was selected")).toBeVisible();
    expect(within(map).getByText("Low")).toBeVisible();
  });

  it("shows the selected module as current once its evidence step is in progress", () => {
    const currentExperience = RoundMapExperienceSchema.parse({
      ...MAYA_HAPPY_PATH_ROUND_MAP,
      modules: MAYA_HAPPY_PATH_ROUND_MAP.modules.map((module) =>
        module.candidate.id === "pulse.local" ? { ...module, status: "current" } : module
      )
    });
    render(createElement(AdaptiveRoundMap, { experience: currentExperience }));

    expect(screen.getByText("Current — in progress")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Quality-gated finger pulse check was selected" })
    ).toBeVisible();
  });

  it.each([
    ["loading", AISHA_RESILIENCE_ROUND_MAPS.loading, "Checking eligible evidence modules"],
    ["retrying", AISHA_RESILIENCE_ROUND_MAPS.retrying, "Retrying the bounded selection"],
    ["AI unavailable", AISHA_RESILIENCE_ROUND_MAPS.unavailable, "AI selection is unavailable"],
    [
      "AI abstained",
      AISHA_RESILIENCE_ROUND_MAPS.abstained,
      "AI abstained; the safe route continues"
    ],
    ["rejected", AISHA_RESILIENCE_ROUND_MAPS.rejected, "The AI suggestion was rejected"],
    ["ineligible", AISHA_RESILIENCE_ROUND_MAPS.ineligible, "The AI suggestion was rejected"],
    ["stale", AISHA_RESILIENCE_ROUND_MAPS.stale, "The selection result is out of date"]
  ])("renders the %s state without losing confirmed progress", (_label, experience, title) => {
    render(createElement(AdaptiveRoundMap, { experience }));

    expect(screen.getByRole("heading", { name: title })).toBeVisible();
    expect(screen.getByText("Saved round resumed with confirmed progress")).toBeVisible();
    expect(screen.getByText("Completed — confirmed")).toBeVisible();
    expect(screen.getByText(/1 completed module\(s\) preserved/i)).toBeVisible();
  });

  it("uses a deterministic rationale template while selection is loading", () => {
    render(createElement(AdaptiveRoundMap, { experience: AISHA_RESILIENCE_ROUND_MAPS.loading }));

    expect(screen.getByText("Why this module is next")).toBeVisible();
    expect(
      screen.getByText(/Quality-gated finger pulse check is next in the deterministic plan/i)
    ).toBeVisible();
    expect(screen.getByText("Not used for this route")).toBeVisible();
  });

  it("offers retry only for a retryable settled result", () => {
    const onRetry = vi.fn();
    const { rerender } = render(
      createElement(AdaptiveRoundMap, {
        experience: AISHA_RESILIENCE_ROUND_MAPS.unavailable,
        onRetry
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "Retry selection from saved progress" }));
    expect(onRetry).toHaveBeenCalledTimes(1);

    rerender(
      createElement(AdaptiveRoundMap, {
        experience: AISHA_RESILIENCE_ROUND_MAPS.abstained,
        onRetry
      })
    );
    expect(
      screen.queryByRole("button", { name: "Retry selection from saved progress" })
    ).not.toBeInTheDocument();
  });

  it("restores keyboard focus after closing module details and announces the interaction", async () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    render(createElement(AdaptiveRoundMap, { experience: MAYA_HAPPY_PATH_ROUND_MAP }));

    const trigger = screen.getByRole("button", { name: /Quality-gated finger pulse check/i });
    fireEvent.click(trigger);
    expect(screen.getByRole("heading", { name: "Quality-gated finger pulse check" })).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(/Selected — ready/i);

    fireEvent.click(screen.getByRole("button", { name: "Close details" }));
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.getByRole("status")).toHaveTextContent(/Focus returned to the Round Map/i);
  });

  it("rejects an unavailable module marked as active progress", () => {
    const invalid = {
      ...MAYA_HAPPY_PATH_ROUND_MAP,
      modules: MAYA_HAPPY_PATH_ROUND_MAP.modules.map((module) =>
        module.candidate.id === "pulse.remote" ? { ...module, status: "selected" } : module
      )
    };

    expect(RoundMapExperienceSchema.safeParse(invalid).success).toBe(false);
  });

  it("treats an accepted result for an older round version as stale presentation only", () => {
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

  it("keeps an atomically server-committed route accepted as later round steps advance", () => {
    const committed = RoundMapExperienceSchema.parse({
      ...MAYA_HAPPY_PATH_ROUND_MAP,
      currentRoundVersion: 5,
      selection: { ...MAYA_HAPPY_PATH_ROUND_MAP.selection, committed: true }
    });

    expect(roundMapSelectionPresentation(committed)).toMatchObject({
      kind: "accepted",
      retryable: false,
      rationaleSource: "ai_checked"
    });
  });
});
