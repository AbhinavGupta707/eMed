import { describe, expect, it, vi } from "vitest";

import { createMutationInput } from "./controller";
import { syntheticDetail, syntheticTask } from "./test-support";
import {
  ClinicianTransportError,
  createApiClinicianTransport,
  createDevelopmentClinicianFetcher
} from "./transport";

function successResponse(data: unknown): Response {
  return Response.json({
    data,
    meta: {
      correlationId: "correlation-clinician-test",
      runtimeProfile: "in_memory_demo_fallback"
    }
  });
}

describe("clinician API transport", () => {
  it("returns an honest empty queue without making an unscoped request", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const transport = createApiClinicianTransport({
      baseUrl: "http://localhost:3000",
      roundIds: [],
      fetcher
    });

    await expect(transport.listQueue()).resolves.toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("loads queue, round, and synthetic FHIR reads while marking absent APIs unsupported", async () => {
    const task = syntheticTask();
    const completeDetail = syntheticDetail({ task });
    const rawFetcher = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.pathname === "/api/clinician/queue") {
        return successResponse({ tasks: [task], scope: "requested_rounds" });
      }
      if (url.pathname === `/api/rounds/${task.roundId}`) {
        if (completeDetail.round.status !== "available") throw new Error("Fixture round missing.");
        return successResponse({ round: completeDetail.round.value });
      }
      if (url.pathname === `/api/snapshots/${task.patientId}`) {
        if (completeDetail.snapshot.status !== "available") {
          throw new Error("Fixture snapshot missing.");
        }
        return successResponse({ snapshot: completeDetail.snapshot.value });
      }
      return new Response("Not found", { status: 404 });
    });
    const transport = createApiClinicianTransport({
      baseUrl: "http://localhost:3000",
      roundIds: [task.roundId],
      fetcher: createDevelopmentClinicianFetcher(rawFetcher)
    });

    const queue = await transport.listQueue();
    const detail = await transport.loadTaskDetail(queue[0]!);

    expect(queue).toEqual([task]);
    expect(detail.round.status).toBe("available");
    expect(detail.snapshot.status).toBe("available");
    expect(detail.report).toMatchObject({
      status: "unsupported",
      reason: "current_api_unsupported"
    });
    expect(detail.timeline.status).toBe("unsupported");
    expect(detail.capabilities).toEqual({
      note: "unsupported",
      acknowledge: "unsupported",
      contact: "unsupported",
      complete: "unsupported"
    });
    for (const call of rawFetcher.mock.calls) {
      expect(new Headers(call[1]?.headers).get("x-homerounds-demo-role")).toBe("clinician");
    }
  });

  it("rejects clinician writes at the frozen API boundary", async () => {
    const task = syntheticTask();
    const transport = createApiClinicianTransport({
      baseUrl: "http://localhost:3000",
      roundIds: [task.roundId],
      fetcher: vi.fn<typeof fetch>()
    });

    await expect(
      transport.mutate(createMutationInput({ task, kind: "acknowledge" }))
    ).rejects.toMatchObject({ code: "unsupported" });
  });

  it("fails closed when a successful queue response violates the strict schema", async () => {
    const task = syntheticTask();
    const transport = createApiClinicianTransport({
      baseUrl: "http://localhost:3000",
      roundIds: [task.roundId],
      fetcher: async () =>
        successResponse({ tasks: [{ id: "not-a-task" }], scope: "requested_rounds" })
    });

    await expect(transport.listQueue()).rejects.toEqual(
      expect.objectContaining<Partial<ClinicianTransportError>>({ code: "invalid_response" })
    );
  });
});
