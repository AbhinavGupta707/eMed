/** @jsxRuntime automatic */
/** @jsxImportSource react */
// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HeartShowcase } from "./showcase-shell";

beforeEach(() => {
  Object.defineProperty(window, "scrollTo", { configurable: true, value: vi.fn() });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("heart-failure showcase", () => {
  it("opens with the subtle-change explanation and separate condition packs", () => {
    render(createElement(HeartShowcase));

    expect(
      screen.getByRole("heading", {
        name: "Her baseline tells us what a single reading cannot."
      })
    ).toBeVisible();
    expect(screen.getAllByText("Weight rose by 0.8 kg")).toHaveLength(2);
    expect(screen.getAllByText("Activity 21% below usual")).toHaveLength(2);
    expect(screen.getAllByText("Previous round resolved")).toHaveLength(2);
    expect(screen.getByText("What changed today?")).toBeVisible();
    expect(screen.queryByText("Stairs feel harder than usual")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "COPD ↗" })).toHaveAttribute("href", "/showcase/copd");
    expect(screen.getByRole("link", { name: "GLP-1 ↗" })).toHaveAttribute("href", "/showcase/glp1");
    expect(screen.queryByText(/deterministic cache|fixture/i)).not.toBeInTheDocument();
  });

  it("keeps a no-microphone path to the adaptive Round Map", () => {
    render(createElement(HeartShowcase));

    fireEvent.click(screen.getByRole("button", { name: "Start today’s adaptive round" }));
    fireEvent.click(screen.getByRole("button", { name: "Type instead" }));
    fireEvent.change(screen.getByLabelText("What changed?"), {
      target: { value: "The stairs feel harder and I am more tired than usual." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Use this summary" }));
    expect(screen.getByRole("heading", { name: "Is this an accurate summary?" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Confirm and build my Round Map" }));

    expect(
      screen.getByRole("heading", { name: "HomeRounds makes the next decision visible." })
    ).toBeVisible();
    expect(screen.getByText("Facial vital assessment")).toBeVisible();
    expect(screen.getByText("Medication package")).toBeVisible();
  });
});
