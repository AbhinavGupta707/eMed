"use client";

import type {
  CompanionDesktopSnapshot,
  CompanionPairingIssue
} from "@homerounds/companion/schemas";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  acknowledgeCompanionResult,
  CompanionClientError,
  createCompanionPairing,
  readCompanionPairing,
  readCurrentCompanionPairing,
  reissueCompanionPairing,
  revokeCompanionPairing
} from "./client";

const DESKTOP_POLL_INTERVAL_MS = 1_500;

export type DesktopCompanionStatus =
  | "idle"
  | "issuing"
  | "waiting"
  | "connected"
  | "result"
  | "acknowledged"
  | "expired"
  | "unavailable";

export type DesktopCompanionController = {
  status: DesktopCompanionStatus;
  issue: CompanionPairingIssue | null;
  snapshot: CompanionDesktopSnapshot | null;
  errorCode: string | null;
  start: (roundId: string, expectedRoundStateVersion: number) => Promise<void>;
  reissue: () => Promise<void>;
  acknowledge: () => Promise<void>;
  cancel: () => Promise<void>;
};

function statusFor(snapshot: CompanionDesktopSnapshot | null): DesktopCompanionStatus {
  if (!snapshot) return "waiting";
  switch (snapshot.connection) {
    case "waiting_for_phone":
      return "waiting";
    case "phone_connected":
      return "connected";
    case "result_received":
      return "result";
    case "desktop_acknowledged":
      return "acknowledged";
    case "expired":
    case "revoked":
      return "expired";
  }
}

function errorCode(error: unknown): string {
  return error instanceof CompanionClientError ? error.code : "network_response_invalid";
}

export function useDesktopCompanion(): DesktopCompanionController {
  const [status, setStatus] = useState<DesktopCompanionStatus>("idle");
  const [issue, setIssue] = useState<CompanionPairingIssue | null>(null);
  const [pairingId, setPairingId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<CompanionDesktopSnapshot | null>(null);
  const [lastErrorCode, setLastErrorCode] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const etagRef = useRef<string | null>(null);

  const replaceIssue = useCallback((nextIssue: CompanionPairingIssue) => {
    setIssue(nextIssue);
    setPairingId(nextIssue.pairingId);
    setSnapshot(null);
    etagRef.current = null;
    setLastErrorCode(null);
    setStatus("waiting");
  }, []);

  const start = useCallback(
    async (roundId: string, expectedRoundStateVersion: number) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setStatus("issuing");
      setLastErrorCode(null);
      try {
        const current = await readCurrentCompanionPairing(roundId, controller.signal);
        if (current) {
          setPairingId(current.pairingId);
          setSnapshot(current);
          if (
            (current.reissueRequired && current.lastResult === null) ||
            current.connection === "waiting_for_phone"
          ) {
            await replaceIssue(
              await reissueCompanionPairing(
                current.pairingId,
                {
                  operationId: crypto.randomUUID(),
                  expectedPairingVersion: current.pairingVersion
                },
                controller.signal
              )
            );
          } else {
            setStatus(statusFor(current));
          }
          return;
        }
        await replaceIssue(
          await createCompanionPairing({ roundId, expectedRoundStateVersion }, controller.signal)
        );
      } catch (error: unknown) {
        if (controller.signal.aborted) return;
        setLastErrorCode(errorCode(error));
        setStatus("unavailable");
      }
    },
    [replaceIssue]
  );

  useEffect(() => {
    if (!pairingId || ["acknowledged", "expired", "unavailable"].includes(status)) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;
    let inFlight = false;
    const controller = new AbortController();

    const poll = async (): Promise<void> => {
      if (disposed || inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        const read = await readCompanionPairing(pairingId, etagRef.current, controller.signal);
        etagRef.current = read.etag;
        if (read.snapshot) {
          setSnapshot(read.snapshot);
          setStatus(statusFor(read.snapshot));
        }
        setLastErrorCode(null);
      } catch (error: unknown) {
        if (controller.signal.aborted) return;
        setLastErrorCode(errorCode(error));
      } finally {
        inFlight = false;
        if (!disposed && document.visibilityState === "visible") {
          timer = setTimeout(() => void poll(), DESKTOP_POLL_INTERVAL_MS);
        }
      }
    };

    const resume = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", resume);
    void poll();
    return () => {
      disposed = true;
      controller.abort();
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [pairingId, status]);

  const reissue = useCallback(async () => {
    if (!pairingId) return;
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    setStatus("issuing");
    try {
      await replaceIssue(
        await reissueCompanionPairing(
          pairingId,
          {
            operationId: crypto.randomUUID(),
            expectedPairingVersion: snapshot?.pairingVersion ?? issue?.pairingVersion ?? 1
          },
          controller.signal
        )
      );
    } catch (error: unknown) {
      if (controller.signal.aborted) return;
      setLastErrorCode(errorCode(error));
      setStatus("unavailable");
    }
  }, [issue, pairingId, replaceIssue, snapshot]);

  const acknowledge = useCallback(async () => {
    if (!pairingId || !snapshot?.lastResult) return;
    const controller = new AbortController();
    try {
      const next = await acknowledgeCompanionResult(
        pairingId,
        {
          operationId: crypto.randomUUID(),
          expectedPairingVersion: snapshot.pairingVersion,
          resultId: snapshot.lastResult.resultId
        },
        controller.signal
      );
      setSnapshot(next);
      setStatus(statusFor(next));
      setLastErrorCode(null);
    } catch (error: unknown) {
      setLastErrorCode(errorCode(error));
    }
  }, [pairingId, snapshot]);

  const cancel = useCallback(async () => {
    if (!pairingId) return;
    const controller = new AbortController();
    try {
      const next = await revokeCompanionPairing(
        pairingId,
        {
          operationId: crypto.randomUUID(),
          expectedPairingVersion: snapshot?.pairingVersion ?? issue?.pairingVersion ?? 1
        },
        controller.signal
      );
      setSnapshot(next);
      setStatus("expired");
      setIssue(null);
      setLastErrorCode(null);
    } catch (error: unknown) {
      setLastErrorCode(errorCode(error));
    }
  }, [issue, pairingId, snapshot]);

  useEffect(() => () => abortRef.current?.abort(), []);

  return {
    status,
    issue,
    snapshot,
    errorCode: lastErrorCode,
    start,
    reissue,
    acknowledge,
    cancel
  };
}
