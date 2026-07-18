/** @jsxRuntime automatic */
/** @jsxImportSource react */
// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CompanionPhoneSnapshot } from "@homerounds/companion";
import { CompanionShell } from "./companion-shell";
import {
  COMPANION_POLL_INTERVAL_MS,
  firstPhaseFor,
  isTerminalPhonePhase,
  shouldPoll,
  taskContent
} from "./model";
import { useCompanionSession } from "./use-companion-session";

vi.mock("./use-companion-session", () => ({ useCompanionSession: vi.fn() }));

const mockedUseCompanionSession = vi.mocked(useCompanionSession);

const snapshot: CompanionPhoneSnapshot = {
  sessionVersion: 3,
  status: "active",
  expiresAt: "2026-07-18T12:20:00.000Z",
  task: { taskId: "capture.finger_ppg.pulse", kind: "finger_pulse", taskVersion: 1 },
  taskPhase: "ready",
  consentRequirement: { kind: "explicit_local_capture", version: "local-v1" },
  consentState: { status: "pending" },
  lastResult: null,
  reissueRequired: false
};

function controller(overrides: Partial<ReturnType<typeof useCompanionSession>> = {}) {
  return {
    connection: "connected" as const,
    snapshot,
    retryConnection: vi.fn(),
    advance: vi.fn(async () => undefined),
    busy: false,
    ...overrides
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("companion phone shell", () => {
  it("shows a warm one-task ready state with the persistent safety disclosure", () => {
    mockedUseCompanionSession.mockReturnValue(controller());
    render(createElement(CompanionShell));

    expect(screen.getByRole("heading", { name: "Finger pulse check" })).toBeVisible();
    expect(screen.getByText("Ready on your phone")).toBeVisible();
    expect(screen.getByText("Connected securely to your computer")).toBeVisible();
    expect(screen.getByText("Sample profile · Not medical care")).toBeVisible();
    expect(screen.queryByText(/demo|fixture|deterministic cache/i)).not.toBeInTheDocument();
  });

  it("provides keyboard/touch actions for contextual consent and retry", () => {
    const advance = vi.fn(async () => undefined);
    mockedUseCompanionSession.mockReturnValue(
      controller({ snapshot: { ...snapshot, taskPhase: "permission" }, advance })
    );
    const { rerender } = render(createElement(CompanionShell));
    fireEvent.click(screen.getByRole("button", { name: "I understand and want to continue" }));
    expect(advance).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/No recording or image is saved/i)).toBeVisible();

    mockedUseCompanionSession.mockReturnValue(
      controller({ snapshot: { ...snapshot, taskPhase: "retry" }, advance })
    );
    rerender(createElement(CompanionShell));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(advance).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["in_progress", "Keep this page open"],
    ["unavailable", "This check isn’t available here"],
    ["completed", "Sent securely"],
    ["desktop_acknowledged", "Your computer received it"]
  ] as const)("renders the %s state with non-colour text", (taskPhase, heading) => {
    mockedUseCompanionSession.mockReturnValue(controller({ snapshot: { ...snapshot, taskPhase } }));
    render(createElement(CompanionShell));
    expect(screen.getByRole("heading", { name: heading })).toBeVisible();
    if (taskPhase === "in_progress") {
      expect(screen.getByRole("progressbar")).toHaveAccessibleName("Finger pulse check");
    }
  });

  it("preserves an explicit network recovery and expiry/reissue path", () => {
    const retryConnection = vi.fn();
    mockedUseCompanionSession.mockReturnValue(
      controller({ connection: "network_recovery", retryConnection })
    );
    const { rerender } = render(createElement(CompanionShell));
    expect(screen.getByRole("heading", { name: "Your progress is still here" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Try connection again" }));
    expect(retryConnection).toHaveBeenCalledOnce();

    mockedUseCompanionSession.mockReturnValue(controller({ connection: "expired" }));
    rerender(createElement(CompanionShell));
    expect(screen.getByRole("heading", { name: "This phone link has expired" })).toBeVisible();
    expect(screen.getByText(/show a new code/i)).toBeVisible();
  });
});

describe("companion polling and presentation model", () => {
  it("uses conservative 1.5 second polling and pauses while backgrounded", () => {
    expect(COMPANION_POLL_INTERVAL_MS).toBe(1_500);
    expect(shouldPoll("connected", snapshot, true)).toBe(true);
    expect(shouldPoll("connected", snapshot, false)).toBe(false);
    expect(shouldPoll("network_recovery", snapshot, true)).toBe(true);
    expect(shouldPoll("connected", { ...snapshot, taskPhase: "desktop_acknowledged" }, true)).toBe(
      false
    );
  });

  it("keeps consent and task copy exhaustive without provider or clinical authority", () => {
    expect(firstPhaseFor({ kind: "none" })).toBe("guidance");
    expect(firstPhaseFor({ kind: "explicit_local_capture", version: "v1" })).toBe("permission");
    expect(isTerminalPhonePhase("completed")).toBe(false);
    expect(isTerminalPhonePhase("desktop_acknowledged")).toBe(true);
    expect(taskContent("face_pulse").permission).toMatch(/front camera/i);
    expect(taskContent("voice_signal").permission).toMatch(/recording is not kept/i);
    expect(taskContent("medication_label").permission).toMatch(/photo is not kept/i);
  });
});
