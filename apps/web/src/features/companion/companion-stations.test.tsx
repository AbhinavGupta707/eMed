/** @jsxRuntime automatic */
/** @jsxImportSource react */
// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { OpticalAssessmentProvider } from "@homerounds/contracts";
import type { CompanionPhoneSnapshot, CompanionTaskResultRequest } from "@homerounds/companion";
import { SelectedCompanionStation, type CompanionStationFactories } from "./companion-stations";

const dependencies = {
  createId: () => "f843b77e-b870-45cd-b4a1-1344305c4d38",
  now: () => "2026-07-18T12:01:00.000Z"
};

function snapshot(kind: CompanionPhoneSnapshot["task"]["kind"]): CompanionPhoneSnapshot {
  return {
    sessionVersion: 3,
    status: "active",
    expiresAt: "2026-07-18T12:20:00.000Z",
    task: { taskId: `selected.${kind}`, kind, taskVersion: 1 },
    taskPhase: "in_progress",
    consentRequirement: { kind: "explicit_local_capture", version: "local-v1" },
    consentState: {
      status: "granted",
      version: "local-v1",
      grantedAt: "2026-07-18T12:00:00.000Z"
    },
    lastResult: null,
    reissueRequired: false
  };
}

function factories(optical: OpticalAssessmentProvider): CompanionStationFactories {
  return {
    createOpticalProvider: () => optical,
    createVoiceProvider: () => ({
      kind: "local_voice_features",
      checkAvailability: async () => ({ available: false, reason: "unsupported_device" }),
      capture: async () => ({
        status: "unavailable",
        provider: "local_voice_features",
        reason: "unsupported_device"
      }),
      dispose: async () => undefined
    })
  };
}

afterEach(cleanup);

describe("selected companion stations", () => {
  it("runs the selected finger provider and submits only a derived candidate", async () => {
    const submitResult = vi.fn<(result: CompanionTaskResultRequest) => Promise<void>>(
      async () => undefined
    );
    const provider: OpticalAssessmentProvider = {
      kind: "finger_ppg",
      checkAvailability: async () => ({ available: true, capabilities: { rearCamera: true } }),
      capture: async ({ assessmentSessionId }) => ({
        status: "completed",
        measurement: {
          factId: "ff4c60cc-e2af-4440-9ee3-e762b18c8cc9",
          assessmentSessionId,
          provider: "finger_ppg",
          value: 72,
          unit: "bpm",
          observedAt: "2026-07-18T12:00:30.000Z",
          durationMs: 20_000,
          algorithmVersion: "finger_ppg_hr_v1",
          providerModelVersion: null,
          quality: { status: "pass", score: 0.92, reasons: [], metrics: {} },
          rawMediaRef: null
        }
      }),
      dispose: async () => undefined
    };

    render(
      createElement(SelectedCompanionStation, {
        snapshot: snapshot("finger_pulse"),
        submitResult,
        dependencies,
        factories: factories(provider)
      })
    );

    fireEvent.click(await screen.findByRole("button", { name: "Start finger check" }));
    await waitFor(() => expect(submitResult).toHaveBeenCalledOnce());
    expect(submitResult.mock.calls[0]?.[0]).toMatchObject({
      taskKind: "finger_pulse",
      outcome: "derived_candidate",
      rawMediaStored: false,
      derived: { pulseBpm: 72, algorithmVersion: "finger_ppg_hr_v1" }
    });
    expect(screen.queryByText("Face pulse check")).not.toBeInTheDocument();
  });

  it("provides a complete manual medication text path with explicit confirmation", async () => {
    const submitResult = vi.fn<(result: CompanionTaskResultRequest) => Promise<void>>(
      async () => undefined
    );
    const unusedProvider: OpticalAssessmentProvider = {
      kind: "finger_ppg",
      checkAvailability: async () => ({ available: false, reason: "unsupported_device" }),
      capture: async () => ({
        status: "unavailable",
        provider: "finger_ppg",
        reason: "unsupported_device"
      }),
      dispose: async () => undefined
    };
    render(
      createElement(SelectedCompanionStation, {
        snapshot: snapshot("medication_label"),
        submitResult,
        dependencies,
        factories: factories(unusedProvider)
      })
    );

    fireEvent.change(screen.getByLabelText("Product name"), {
      target: { value: "Synthetic medicine" }
    });
    fireEvent.click(screen.getByLabelText(/I reviewed these label observations/i));
    fireEvent.click(screen.getByRole("button", { name: "Confirm label observations" }));

    await waitFor(() => expect(submitResult).toHaveBeenCalledOnce());
    expect(submitResult.mock.calls[0]?.[0]).toMatchObject({
      taskKind: "medication_label",
      outcome: "derived_candidate",
      rawMediaStored: false,
      derived: {
        source: "text_entry",
        explicitlyConfirmed: true,
        fields: [{ field: "product_name", status: "confirmed", value: "Synthetic medicine" }]
      }
    });
  });
});
