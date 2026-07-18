/** @jsxRuntime automatic */
/** @jsxImportSource react */

// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DeviceHandoff } from "./device-handoff";

afterEach(() => cleanup());

describe("DeviceHandoff", () => {
  it("keeps the selected task primary and offers only a supported computer alternative", () => {
    const onUsePhone = vi.fn();
    const onUseComputer = vi.fn();

    render(
      <DeviceHandoff
        computerSupported
        onUseComputer={onUseComputer}
        onUsePhone={onUsePhone}
        preferenceNote="Phone preferred for supported checks"
        rationale="A short pulse check can add one quality-gated piece of information."
        readableCode="MAYA-24"
        status="ready"
        statusDetail="Scan once to use your phone for this round."
        taskTitle="A pulse check is the most useful next step."
      />
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("pulse check");
    expect(screen.getByRole("status")).toHaveTextContent("Ready to pair");
    expect(screen.getByText("Phone preferred for supported checks")).toBeVisible();
    expect(screen.getByText(/Pairing code/)).toHaveTextContent("MAYA-24");

    fireEvent.click(screen.getByRole("button", { name: "Use my phone" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue on this computer" }));
    expect(onUsePhone).toHaveBeenCalledOnce();
    expect(onUseComputer).toHaveBeenCalledOnce();
  });

  it("states plainly when no reading was accepted and never invents a value", () => {
    render(
      <DeviceHandoff
        computerSupported={false}
        rationale="The quality check did not pass."
        status="no_result"
        statusDetail="Try again when you are comfortable, or continue without a reading."
        taskTitle="Pulse check complete"
      />
    );

    expect(screen.getByRole("status")).toHaveTextContent("No reading was accepted");
    expect(screen.queryByText(/bpm/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
