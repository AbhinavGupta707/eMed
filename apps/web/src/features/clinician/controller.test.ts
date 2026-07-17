import { describe, expect, it } from "vitest";

import {
  clinicianOperationKey,
  createMutationInput,
  mutationErrorNotice,
  optimisticallyApplyTaskMutation,
  orderClinicianQueue
} from "./controller";
import { syntheticTask } from "./test-support";

describe("clinician cockpit controller", () => {
  it("orders open work before acknowledged/completed work, then by priority and creation time", () => {
    const tasks = [
      syntheticTask({
        id: "10000000-0000-4000-8000-000000000001",
        status: "completed",
        priority: "urgent_demo_only"
      }),
      syntheticTask({
        id: "10000000-0000-4000-8000-000000000002",
        status: "open",
        priority: "routine"
      }),
      syntheticTask({
        id: "10000000-0000-4000-8000-000000000003",
        status: "open",
        priority: "urgent_demo_only",
        createdAt: "2026-07-17T09:10:00.000Z"
      }),
      syntheticTask({
        id: "10000000-0000-4000-8000-000000000004",
        status: "open",
        priority: "urgent_demo_only",
        createdAt: "2026-07-17T09:05:00.000Z"
      })
    ];

    expect(orderClinicianQueue(tasks).map((task) => task.id)).toEqual([
      "10000000-0000-4000-8000-000000000004",
      "10000000-0000-4000-8000-000000000003",
      "10000000-0000-4000-8000-000000000002",
      "10000000-0000-4000-8000-000000000001"
    ]);
  });

  it("derives a stable operation key for duplicate-safe completion", () => {
    const task = syntheticTask();
    const first = createMutationInput({ task, kind: "complete" });
    const retry = createMutationInput({ task, kind: "complete" });

    expect(first.operationKey).toBe(clinicianOperationKey(task.id, "complete"));
    expect(retry.operationKey).toBe(first.operationKey);
    expect(first.note).toBeNull();
  });

  it("keeps optimistic task state explicit and reversible", () => {
    const original = syntheticTask({ status: "open" });
    const optimistic = optimisticallyApplyTaskMutation(original, "complete");

    expect(optimistic.status).toBe("completed");
    expect(original.status).toBe("open");
    expect(optimisticallyApplyTaskMutation(original, "record_contact")).toEqual(original);
  });

  it.each(["offline", "conflict", "stale"] as const)(
    "provides a non-success persistence message for %s failures",
    (code) => {
      const notice = mutationErrorNotice(code);
      expect(notice.tone).toBe("error");
      expect(notice.message).toMatch(/not persisted|restored|rollback|rolled back|reload/i);
    }
  );
});
