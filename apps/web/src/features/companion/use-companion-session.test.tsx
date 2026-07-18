/** @jsxRuntime automatic */
/** @jsxImportSource react */
// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CompanionPhoneSnapshot } from "../../../../../packages/companion/src/index";
import { useCompanionSession } from "./use-companion-session";

const token = `cpt1_${Buffer.alloc(32, 7).toString("base64url")}`;
const snapshot: CompanionPhoneSnapshot = {
  sessionVersion: 1,
  status: "active",
  expiresAt: "2026-07-18T12:20:00.000Z",
  task: { taskId: "capture.finger_ppg.pulse", kind: "finger_pulse", taskVersion: 1 },
  taskPhase: "ready",
  consentRequirement: { kind: "explicit_local_capture", version: "local-v1" },
  consentState: { status: "pending" },
  lastResult: null,
  reissueRequired: false
};

function success(snapshotValue = snapshot): Response {
  return new Response(
    JSON.stringify({
      data: { snapshot: snapshotValue, replayed: false },
      meta: { correlationId: "companion-test" }
    }),
    { status: 200, headers: { "content-type": "application/json", etag: '"session-1"' } }
  );
}

function sessionSuccess(snapshotValue = snapshot): Response {
  return new Response(
    JSON.stringify({
      data: { snapshot: snapshotValue },
      meta: { correlationId: "companion-test" }
    }),
    { status: 200, headers: { "content-type": "application/json", etag: '"session-1"' } }
  );
}

function Probe() {
  const controller = useCompanionSession();
  return createElement(
    "div",
    null,
    createElement("span", { "data-testid": "connection" }, controller.connection),
    createElement("span", { "data-testid": "phase" }, controller.snapshot?.taskPhase ?? "none"),
    createElement("button", { type: "button", onClick: controller.retryConnection }, "Retry")
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  sessionStorage.clear();
  history.replaceState({}, "", "/");
});

describe("companion browser resume controller", () => {
  it("removes the fragment before exchange and never stores the bearer token", async () => {
    history.replaceState({}, "", `/companion#pair=${token}`);
    const fetchMock = vi.fn<typeof fetch>(async () => success());
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(Probe));
    expect(location.hash).toBe("");
    await waitFor(() => expect(screen.getByTestId("connection")).toHaveTextContent("connected"));
    expect(screen.getByTestId("phase")).toHaveTextContent("ready");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/companion/exchange",
      expect.objectContaining({ method: "POST", credentials: "same-origin", cache: "no-store" })
    );
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(String(request.body)).toContain(token);
    expect(JSON.stringify({ ...sessionStorage })).not.toContain(token);
    expect(sessionStorage.getItem("homerounds-companion-exchange:v1")).toBeNull();
  });

  it("surfaces a network pause and resumes from the HttpOnly cookie on retry", async () => {
    history.replaceState({}, "", "/companion");
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("network unavailable"))
      .mockResolvedValueOnce(sessionSuccess());
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(Probe));
    await waitFor(() =>
      expect(screen.getByTestId("connection")).toHaveTextContent("network_recovery")
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByTestId("connection")).toHaveTextContent("connected"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/companion/session");
  });
});
