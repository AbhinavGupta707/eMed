/** @jsxRuntime automatic */
/** @jsxImportSource react */
// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import {
  VoiceBiomarkerFactSchema,
  VoiceBiomarkerQualitySchema,
  type VoiceBiomarkerAssessmentResult,
  type VoiceBiomarkerProvider
} from "@homerounds/contracts";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { VoiceBiomarkerStation } from "./voice-biomarker-station";

const ROUND_ID = "b8731a19-3b2e-4c44-a1ab-d92b96b7e26a";
const SESSION_ID = "7fc9ed94-7b72-47ca-a83c-8d2b762c2401";

function result(): VoiceBiomarkerAssessmentResult {
  const quality = VoiceBiomarkerQualitySchema.parse({
    status: "pass",
    score: 0.91,
    reasons: [],
    metrics: {
      sampleRateHz: 48_000,
      durationMs: 7_000,
      clippingFraction: 0.001,
      voicedFraction: 0.9,
      estimatedSnrDb: 24
    }
  });
  return {
    status: "completed",
    fact: VoiceBiomarkerFactSchema.parse({
      factId: "a43a350f-d6aa-4251-b19d-9eabf7e6cb4f",
      roundId: ROUND_ID,
      assessmentSessionId: SESSION_ID,
      provider: "local_voice_features",
      observedAt: "2026-07-17T12:00:00.000Z",
      durationMs: 7_000,
      algorithmVersion: "synthetic-voice-features-v1",
      features: {
        medianFundamentalFrequencyHz: 181.2,
        pitchVariabilitySemitones: 0.42,
        jitterPercent: 0.71,
        shimmerPercent: 2.4,
        harmonicToNoiseRatioDb: 21.5,
        phonationDurationMs: 7_000
      },
      quality,
      researchOnly: true,
      rawMediaRef: null
    })
  };
}

function provider(
  capture: VoiceBiomarkerProvider["capture"] = vi.fn(async () => result()),
  availability: Awaited<ReturnType<VoiceBiomarkerProvider["checkAvailability"]>> = {
    available: true,
    capabilities: { localAnalysis: true }
  }
): VoiceBiomarkerProvider {
  return {
    kind: "local_voice_features",
    checkAvailability: vi.fn(async () => availability),
    capture,
    dispose: vi.fn(async () => undefined)
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("voice biomarker station", () => {
  it("exposes consent, research boundary, touch-sized controls, and a text-labelled passing result", async () => {
    const onCompleted = vi.fn(async () => undefined);
    render(
      createElement(VoiceBiomarkerStation, {
        assessmentSessionId: SESSION_ID,
        onCompleted,
        provider: provider(),
        roundId: ROUND_ID
      })
    );

    expect(screen.getByRole("region", { name: "Sustained-vowel research signal" })).toBeVisible();
    expect(screen.getByText("Research signal—not a diagnosis")).toBeVisible();
    expect(screen.getByText(/does not.*compare against a disease threshold/i)).toBeVisible();
    const consent = screen.getByLabelText(
      /I consent to one separate local sustained-vowel capture/i
    );
    const start = await screen.findByRole("button", { name: "Start 7-second capture" });
    expect(start).toBeDisabled();

    fireEvent.click(consent);
    expect(start).toBeEnabled();
    fireEvent.click(start);

    await waitFor(() => expect(onCompleted).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("heading", { name: "Baseline started" })).toBeVisible();
    expect(screen.getByText(/does not mean stable, changed, healthy, or unwell/i)).toBeVisible();
    expect(screen.getByText(/Raw media reference: none/i)).toBeVisible();
    expect(screen.getByText("181.20 Hz")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(/not a diagnosis/i);
  });

  it("announces permission denial and leaves decline as an operable recovery", async () => {
    const onDeclined = vi.fn(async () => undefined);
    render(
      createElement(VoiceBiomarkerStation, {
        assessmentSessionId: SESSION_ID,
        onCompleted: vi.fn(async () => undefined),
        onDeclined,
        provider: provider(vi.fn(), { available: false, reason: "permission_denied" }),
        roundId: ROUND_ID
      })
    );

    expect(await screen.findByText(/Microphone permission was denied/i)).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /Start 7-second capture/i })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Decline optional station" }));

    await waitFor(() => expect(onDeclined).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("status")).toHaveTextContent(/station declined/i);
  });

  it("shows labelled progress and a keyboard-operable cancel path while capture is pending", async () => {
    let finish: ((outcome: VoiceBiomarkerAssessmentResult) => void) | undefined;
    const capture = vi.fn(
      () =>
        new Promise<VoiceBiomarkerAssessmentResult>((resolve) => {
          finish = resolve;
        })
    );
    render(
      createElement(VoiceBiomarkerStation, {
        assessmentSessionId: SESSION_ID,
        onCompleted: vi.fn(async () => undefined),
        provider: provider(capture),
        roundId: ROUND_ID
      })
    );

    const consent = screen.getByLabelText(
      /I consent to one separate local sustained-vowel capture/i
    );
    const start = await screen.findByRole("button", { name: "Start 7-second capture" });
    fireEvent.click(consent);
    fireEvent.click(start);

    expect(
      screen.getByRole("progressbar", { name: "Sustained-vowel capture progress" })
    ).toBeVisible();
    const cancel = screen.getByRole("button", { name: "Cancel capture" });
    cancel.focus();
    fireEvent.keyDown(cancel, { key: "Enter" });
    fireEvent.click(cancel);

    expect(screen.getByRole("status")).toHaveTextContent(/Capture cancelled/i);
    finish?.(result());
  });
});
