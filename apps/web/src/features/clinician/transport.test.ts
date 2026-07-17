import { describe, expect, it, vi } from "vitest";

import { createMutationInput } from "./controller";
import { syntheticDetail, syntheticReceipt, syntheticTask } from "./test-support";
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

  it("loads persisted clinician evidence and capabilities with synthetic FHIR context", async () => {
    const task = syntheticTask();
    const completeDetail = syntheticDetail({ task });
    const rawFetcher = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.pathname === "/api/clinician/queue") {
        return successResponse({ tasks: [task], scope: "requested_rounds" });
      }
      if (url.pathname === `/api/clinician/tasks/${task.id}`) {
        if (
          completeDetail.round.status !== "available" ||
          completeDetail.report.status !== "available" ||
          completeDetail.measurement.status !== "available" ||
          completeDetail.protocolResult.status !== "available" ||
          completeDetail.timeline.status !== "available" ||
          completeDetail.note.status !== "available"
        ) {
          throw new Error("Fixture detail missing.");
        }
        return successResponse({
          task,
          round: completeDetail.round.value,
          report: completeDetail.report.value,
          measurement: completeDetail.measurement.value,
          captureQuality: null,
          protocolResult: completeDetail.protocolResult.value,
          timeline: completeDetail.timeline.value,
          note: completeDetail.note.value,
          capabilities: { note: true, acknowledge: true, contact: true, complete: true }
        });
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
    expect(detail.report.status).toBe("available");
    expect(detail.measurement.status).toBe("available");
    expect(detail.captureQuality.status).toBe("missing");
    expect(detail.timeline.status).toBe("available");
    expect(detail.capabilities).toEqual({
      note: "supported",
      acknowledge: "supported",
      contact: "supported",
      complete: "supported"
    });
    for (const call of rawFetcher.mock.calls) {
      expect(new Headers(call[1]?.headers).get("x-homerounds-demo-role")).toBe("clinician");
    }
  });

  it("persists clinician writes through the audited mutation endpoint", async () => {
    const task = syntheticTask();
    const input = createMutationInput({ task, kind: "acknowledge" });
    const receipt = syntheticReceipt({
      task: { ...task, status: "acknowledged", updatedAt: "2026-07-17T09:31:00.000Z" },
      kind: "acknowledge",
      operationKey: input.operationKey
    });
    const fetcher = vi.fn<typeof fetch>(async (request, init) => {
      const url = new URL(request instanceof Request ? request.url : request.toString());
      expect(url.pathname).toBe(`/api/clinician/tasks/${task.id}`);
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({
        kind: input.kind,
        expectedTaskUpdatedAt: input.expectedTaskUpdatedAt,
        operationKey: input.operationKey,
        note: null
      });
      return successResponse(receipt);
    });
    const transport = createApiClinicianTransport({
      baseUrl: "http://localhost:3000",
      roundIds: [task.roundId],
      fetcher: createDevelopmentClinicianFetcher(fetcher)
    });

    await expect(transport.mutate(input)).resolves.toEqual(receipt);
    expect(fetcher).toHaveBeenCalledTimes(1);
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
