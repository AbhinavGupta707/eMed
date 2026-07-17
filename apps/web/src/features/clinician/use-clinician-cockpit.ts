"use client";

import type { ClinicalTask } from "@homerounds/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  createMutationInput,
  mutationErrorNotice,
  mutationSuccessNotice,
  optimisticallyApplyTaskMutation,
  orderClinicianQueue,
  type MutationNotice
} from "./controller";
import {
  availableResource,
  type ClinicianDensity,
  type ClinicianMutationKind,
  type ClinicianMutationReceipt,
  type ClinicianQueue,
  type ClinicianTaskDetail,
  type ClinicianTransportErrorCode
} from "./model";
import {
  ClinicianTransportError,
  parseMutationReceipt,
  type ClinicianTransport
} from "./transport";

export type QueueState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; tasks: ClinicianQueue };

export type DetailState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; detail: ClinicianTaskDetail };

function errorCode(error: unknown): ClinicianTransportErrorCode {
  return error instanceof ClinicianTransportError ? error.code : "unknown";
}

function queueErrorMessage(error: unknown): string {
  const code = errorCode(error);
  if (code === "offline") return "The queue could not load while the browser is offline.";
  if (code === "unavailable") return "The queue service is temporarily unavailable.";
  if (code === "invalid_response") return "The queue response could not be verified.";
  return "The priority queue could not be loaded.";
}

function replaceTask(tasks: ClinicianQueue, replacement: ClinicalTask): ClinicianQueue {
  return orderClinicianQueue(
    tasks.map((task) => (task.id === replacement.id ? replacement : task))
  );
}

function applyReceiptToDetail(
  detail: ClinicianTaskDetail,
  receipt: ClinicianMutationReceipt
): ClinicianTaskDetail {
  const timeline =
    detail.timeline.status === "available"
      ? availableResource(
          [...detail.timeline.value, receipt.event].toSorted(
            (left, right) =>
              left.occurredAt.localeCompare(right.occurredAt) ||
              left.eventId.localeCompare(right.eventId)
          )
        )
      : detail.timeline;
  const note =
    receipt.kind === "save_note" && receipt.note !== null
      ? availableResource(receipt.note)
      : detail.note;
  return { ...detail, task: receipt.task, timeline, note };
}

export function useClinicianCockpit(transport: ClinicianTransport) {
  const [density, setDensity] = useState<ClinicianDensity>("comfortable");
  const [queueState, setQueueState] = useState<QueueState>({ status: "loading" });
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [detailState, setDetailState] = useState<DetailState>({ status: "idle" });
  const [noteDraft, setNoteDraft] = useState("");
  const [noteBaseline, setNoteBaseline] = useState("");
  const [confirmation, setConfirmation] = useState<ClinicianMutationKind | null>(null);
  const [pendingKind, setPendingKind] = useState<ClinicianMutationKind | null>(null);
  const [notice, setNotice] = useState<MutationNotice | null>(null);
  const [lastReceipt, setLastReceipt] = useState<ClinicianMutationReceipt | null>(null);
  const [queueReloadToken, setQueueReloadToken] = useState(0);
  const [detailReloadToken, setDetailReloadToken] = useState(0);
  const selectedTaskIdRef = useRef<string | null>(null);
  const taskByIdRef = useRef(new Map<string, ClinicalTask>());

  useEffect(() => {
    let active = true;
    void transport
      .listQueue()
      .then((tasks) => {
        if (!active) return;
        const ordered = orderClinicianQueue(tasks);
        taskByIdRef.current = new Map(ordered.map((task) => [task.id, task]));
        setQueueState({ status: "ready", tasks: ordered });
        const current = selectedTaskIdRef.current;
        const next =
          current !== null && ordered.some((task) => task.id === current)
            ? current
            : (ordered[0]?.id ?? null);
        selectedTaskIdRef.current = next;
        setSelectedTaskId(next);
        setDetailState(next === null ? { status: "idle" } : { status: "loading" });
        setDetailReloadToken((current) => current + 1);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setQueueState({ status: "error", message: queueErrorMessage(error) });
        setDetailState({ status: "idle" });
      });
    return () => {
      active = false;
    };
  }, [queueReloadToken, transport]);

  useEffect(() => {
    if (selectedTaskId === null) return;
    const task = taskByIdRef.current.get(selectedTaskId);
    if (!task) return;

    let active = true;
    void transport
      .loadTaskDetail(task)
      .then((detail) => {
        if (!active) return;
        setDetailState({ status: "ready", detail });
        const initialNote = detail.note.status === "available" ? detail.note.value.text : "";
        setNoteDraft(initialNote);
        setNoteBaseline(initialNote);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setDetailState({
          status: "error",
          message:
            errorCode(error) === "offline"
              ? "Task detail could not load while offline."
              : "Task detail could not be loaded."
        });
      });
    return () => {
      active = false;
    };
  }, [detailReloadToken, selectedTaskId, transport]);

  const reloadQueue = useCallback(() => {
    setQueueState({ status: "loading" });
    setDetailState({ status: "loading" });
    setNotice(null);
    setLastReceipt(null);
    setQueueReloadToken((current) => current + 1);
  }, []);

  const reloadDetail = useCallback(() => {
    setDetailState({ status: "loading" });
    setNotice(null);
    setLastReceipt(null);
    setDetailReloadToken((current) => current + 1);
  }, []);

  const selectTask = useCallback((taskId: string) => {
    selectedTaskIdRef.current = taskId;
    setSelectedTaskId(taskId);
    setDetailState({ status: "loading" });
    setNotice(null);
    setLastReceipt(null);
    setDetailReloadToken((current) => current + 1);
  }, []);

  const requestMutation = useCallback((kind: ClinicianMutationKind) => {
    setNotice(null);
    setConfirmation(kind);
  }, []);

  const cancelConfirmation = useCallback(() => {
    if (pendingKind === null) setConfirmation(null);
  }, [pendingKind]);

  const confirmMutation = useCallback(async () => {
    if (confirmation === null || pendingKind !== null || detailState.status !== "ready") return;

    const previousTask = detailState.detail.task;
    const optimisticTask = optimisticallyApplyTaskMutation(previousTask, confirmation);
    const input = createMutationInput({
      task: previousTask,
      kind: confirmation,
      ...(confirmation === "save_note" ? { note: noteDraft } : {})
    });

    setPendingKind(confirmation);
    setNotice(null);
    setLastReceipt(null);
    taskByIdRef.current.set(optimisticTask.id, optimisticTask);
    setQueueState((current) =>
      current.status === "ready"
        ? { status: "ready", tasks: replaceTask(current.tasks, optimisticTask) }
        : current
    );
    setDetailState((current) =>
      current.status === "ready"
        ? { status: "ready", detail: { ...current.detail, task: optimisticTask } }
        : current
    );

    try {
      const receipt = parseMutationReceipt(await transport.mutate(input));
      taskByIdRef.current.set(receipt.task.id, receipt.task);
      setQueueState((current) =>
        current.status === "ready"
          ? { status: "ready", tasks: replaceTask(current.tasks, receipt.task) }
          : current
      );
      setDetailState((current) =>
        current.status === "ready"
          ? { status: "ready", detail: applyReceiptToDetail(current.detail, receipt) }
          : current
      );
      if (receipt.kind === "save_note" && receipt.note !== null) {
        setNoteBaseline(receipt.note.text);
        setNoteDraft(receipt.note.text);
      }
      setLastReceipt(receipt);
      setNotice(mutationSuccessNotice(receipt));
      setConfirmation(null);
    } catch (error: unknown) {
      taskByIdRef.current.set(previousTask.id, previousTask);
      setQueueState((current) =>
        current.status === "ready"
          ? { status: "ready", tasks: replaceTask(current.tasks, previousTask) }
          : current
      );
      setDetailState((current) =>
        current.status === "ready"
          ? { status: "ready", detail: { ...current.detail, task: previousTask } }
          : current
      );
      setNotice(mutationErrorNotice(errorCode(error)));
      setConfirmation(null);
    } finally {
      setPendingKind(null);
    }
  }, [confirmation, detailState, noteDraft, pendingKind, transport]);

  return {
    density,
    setDensity,
    queueState,
    selectedTaskId,
    selectTask,
    reloadQueue,
    detailState,
    reloadDetail,
    noteDraft,
    setNoteDraft,
    noteDirty: noteDraft !== noteBaseline,
    confirmation,
    requestMutation,
    cancelConfirmation,
    confirmMutation,
    pendingKind,
    notice,
    lastReceipt
  };
}
