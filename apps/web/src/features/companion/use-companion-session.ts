"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  CompanionPairingTokenSchema,
  type CompanionPhoneSnapshot,
  type CompanionTaskPhase,
  type CompanionTaskResultRequest
} from "@homerounds/companion/schemas";
import {
  CompanionClientError,
  exchangeCompanion,
  readCompanionSession,
  submitCompanionResult,
  updateCompanionStatus
} from "./client";
import {
  COMPANION_POLL_INTERVAL_MS,
  firstPhaseFor,
  shouldPoll,
  type CompanionConnectionState
} from "./model";

const EXCHANGE_OPERATION_KEY = "homerounds-companion-exchange:v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CompanionSessionController = {
  connection: CompanionConnectionState;
  snapshot: CompanionPhoneSnapshot | null;
  retryConnection: () => void;
  advance: () => Promise<void>;
  submitResult: (result: CompanionTaskResultRequest) => Promise<void>;
  busy: boolean;
};

function safeStoredOperationId(): string {
  try {
    const stored = sessionStorage.getItem(EXCHANGE_OPERATION_KEY);
    if (stored && UUID.test(stored)) return stored;
    const created = crypto.randomUUID();
    sessionStorage.setItem(EXCHANGE_OPERATION_KEY, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

function clearStoredOperationId(): void {
  try {
    sessionStorage.removeItem(EXCHANGE_OPERATION_KEY);
  } catch {
    // Storage can be disabled; the HttpOnly cookie still owns resume.
  }
}

function takeFragmentToken(): string | null {
  const parameters = new URLSearchParams(location.hash.slice(1));
  const candidate = parameters.get("pair");
  history.replaceState(history.state, "", `${location.pathname}${location.search}`);
  const parsed = CompanionPairingTokenSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

function isExpired(error: unknown): boolean {
  return error instanceof CompanionClientError && [401, 410].includes(error.status);
}

export function useCompanionSession(): CompanionSessionController {
  const [connection, setConnection] = useState<CompanionConnectionState>("connecting");
  const [snapshot, setSnapshot] = useState<CompanionPhoneSnapshot | null>(null);
  const [retryGeneration, setRetryGeneration] = useState(0);
  const [busy, setBusy] = useState(false);
  const fragmentTokenRef = useRef<string | null | undefined>(undefined);
  const etagRef = useRef<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollAbortRef = useRef<AbortController | null>(null);
  const mutationPendingRef = useRef(false);

  useLayoutEffect(() => {
    if (fragmentTokenRef.current === undefined) {
      fragmentTokenRef.current = takeFragmentToken();
    }
  }, []);

  const refresh = useCallback(async (resume = false) => {
    pollAbortRef.current?.abort();
    const controller = new AbortController();
    pollAbortRef.current = controller;
    if (resume) setConnection("resuming");
    try {
      const read = await readCompanionSession(etagRef.current, controller.signal);
      etagRef.current = read.etag;
      if (read.snapshot) setSnapshot(read.snapshot);
      setConnection("connected");
    } catch (error: unknown) {
      if (controller.signal.aborted) return;
      setConnection(isExpired(error) ? "expired" : "network_recovery");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const token = fragmentTokenRef.current;
    async function connect(): Promise<void> {
      try {
        if (token) {
          const exchanged = await exchangeCompanion(
            token,
            safeStoredOperationId(),
            controller.signal
          );
          clearStoredOperationId();
          setSnapshot(exchanged);
          setConnection("connected");
          fragmentTokenRef.current = null;
          return;
        }
        await refresh();
      } catch (error: unknown) {
        if (controller.signal.aborted) return;
        if (isExpired(error)) fragmentTokenRef.current = null;
        setConnection(isExpired(error) ? "expired" : "network_recovery");
      }
    }
    void connect();
    return () => controller.abort();
  }, [refresh, retryGeneration]);

  useEffect(() => {
    function cancelTimer(): void {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    function schedule(): void {
      cancelTimer();
      if (!shouldPoll(connection, snapshot, document.visibilityState === "visible")) return;
      pollTimerRef.current = setTimeout(() => {
        void refresh().finally(schedule);
      }, COMPANION_POLL_INTERVAL_MS);
    }
    function onVisibilityChange(): void {
      cancelTimer();
      if (document.visibilityState === "visible") void refresh(true).finally(schedule);
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    schedule();
    return () => {
      cancelTimer();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [connection, refresh, snapshot]);

  useEffect(
    () => () => {
      pollAbortRef.current?.abort();
    },
    []
  );

  const retryConnection = useCallback(() => {
    etagRef.current = null;
    setConnection("connecting");
    setRetryGeneration((current) => current + 1);
  }, []);

  const advance = useCallback(async () => {
    if (!snapshot || mutationPendingRef.current) return;
    let phase: Exclude<CompanionTaskPhase, "ready" | "completed" | "desktop_acknowledged">;
    let consent: { decision: "granted"; version: string; grantedAt: string } | undefined;
    switch (snapshot.taskPhase) {
      case "ready":
        phase = firstPhaseFor(snapshot.consentRequirement);
        break;
      case "permission":
        phase = "guidance";
        if (snapshot.consentRequirement.kind !== "none") {
          consent = {
            decision: "granted",
            version: snapshot.consentRequirement.version,
            grantedAt: new Date().toISOString()
          };
        }
        break;
      case "guidance":
      case "retry":
        phase = "in_progress";
        break;
      case "in_progress":
      case "unavailable":
      case "completed":
      case "desktop_acknowledged":
        return;
    }
    mutationPendingRef.current = true;
    setBusy(true);
    const controller = new AbortController();
    try {
      const next = await updateCompanionStatus(
        {
          operationId: crypto.randomUUID(),
          expectedSessionVersion: snapshot.sessionVersion,
          taskId: snapshot.task.taskId,
          taskKind: snapshot.task.kind,
          phase,
          ...(consent ? { consent } : {})
        },
        controller.signal
      );
      etagRef.current = null;
      setSnapshot(next);
      setConnection("connected");
    } catch (error: unknown) {
      setConnection(isExpired(error) ? "expired" : "network_recovery");
    } finally {
      mutationPendingRef.current = false;
      setBusy(false);
    }
  }, [snapshot]);

  const submitResult = useCallback(
    async (result: CompanionTaskResultRequest) => {
      if (!snapshot || mutationPendingRef.current) return;
      if (
        result.taskId !== snapshot.task.taskId ||
        result.taskKind !== snapshot.task.kind ||
        result.expectedSessionVersion !== snapshot.sessionVersion
      ) {
        throw new Error("Companion result does not match the active task snapshot.");
      }
      mutationPendingRef.current = true;
      setBusy(true);
      const controller = new AbortController();
      try {
        const receipt = await submitCompanionResult(result, controller.signal);
        etagRef.current = null;
        setSnapshot({
          ...snapshot,
          sessionVersion: receipt.sessionVersion,
          taskPhase: "completed",
          lastResult: {
            resultId: receipt.resultId,
            outcome: result.outcome,
            receivedAt: receipt.receivedAt
          }
        });
        setConnection("connected");
      } catch (error: unknown) {
        if (isExpired(error)) setConnection("expired");
        throw error;
      } finally {
        mutationPendingRef.current = false;
        setBusy(false);
      }
    },
    [snapshot]
  );

  return { connection, snapshot, retryConnection, advance, submitResult, busy };
}
