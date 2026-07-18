"use client";

import {
  CareActionMutationReceiptSchema,
  type ClinicianCareActionMutationKind,
  type SyntheticCareAction
} from "@homerounds/actions/care-schemas";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  CareActionTransportError,
  type ClinicianCareActionTransport
} from "./care-action-transport";

export type CareActionListState =
  | { status: "loading" }
  | { status: "ready"; actions: SyntheticCareAction[] }
  | { status: "error"; message: string };

function errorMessage(error: unknown): string {
  if (!(error instanceof CareActionTransportError)) {
    return "Care action status could not be verified.";
  }
  switch (error.code) {
    case "offline":
      return "The update was not persisted because the browser is offline.";
    case "stale":
    case "conflict":
      return "This care action changed elsewhere. Reload its persisted status before retrying.";
    case "unavailable":
      return "Durable care action persistence is unavailable. No update is shown as complete.";
    case "invalid_response":
      return "The returned status could not be verified, so the local view was restored.";
    case "unknown":
      return "The care action update could not be confirmed. The local view was restored.";
  }
}

function operationKey(action: SyntheticCareAction, kind: ClinicianCareActionMutationKind): string {
  return `care-clinician:${action.id}:${kind}:v${action.version}`;
}

export function useCareActions(roundId: string, transport: ClinicianCareActionTransport) {
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<CareActionListState>({ status: "loading" });
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [confirmation, setConfirmation] = useState<ClinicianCareActionMutationKind | null>(null);
  const [pending, setPending] = useState<ClinicianCareActionMutationKind | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [auditReference, setAuditReference] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void transport
      .listRound(roundId)
      .then((actions) => {
        if (!active) return;
        const ordered = actions.toSorted(
          (left, right) =>
            right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id)
        );
        setState({ status: "ready", actions: ordered });
        const nextAction = ordered[0] ?? null;
        setSelectedActionId(nextAction?.id ?? null);
        setSummaryDraft(nextAction?.clinicianSummary ?? nextAction?.evidence.summary ?? "");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setState({ status: "error", message: errorMessage(error) });
      });
    return () => {
      active = false;
    };
  }, [reloadToken, roundId, transport]);

  const selectedAction = useMemo(
    () =>
      state.status === "ready"
        ? (state.actions.find(({ id }) => id === selectedActionId) ?? null)
        : null,
    [selectedActionId, state]
  );

  const reload = useCallback(() => {
    setState({ status: "loading" });
    setNotice(null);
    setAuditReference(null);
    setReloadToken((current) => current + 1);
  }, []);

  const selectAction = useCallback(
    (actionId: string) => {
      const action =
        state.status === "ready" ? state.actions.find(({ id }) => id === actionId) : null;
      setSelectedActionId(actionId);
      setSummaryDraft(action?.clinicianSummary ?? action?.evidence.summary ?? "");
      setNotice(null);
      setAuditReference(null);
      setConfirmation(null);
    },
    [state]
  );

  const requestMutation = useCallback((kind: ClinicianCareActionMutationKind) => {
    setNotice(null);
    setAuditReference(null);
    setConfirmation(kind);
  }, []);

  const cancelConfirmation = useCallback(() => {
    if (pending === null) setConfirmation(null);
  }, [pending]);

  const confirmMutation = useCallback(async () => {
    if (!selectedAction || !confirmation || pending) return;
    const previousState = state;
    const mutation =
      confirmation === "edit"
        ? { kind: "edit" as const, clinicianSummary: summaryDraft }
        : confirmation === "record_contact"
          ? {
              kind: "record_contact" as const,
              outcome: "attempted_synthetic_contact_no_external_delivery" as const
            }
          : confirmation === "complete"
            ? { kind: "complete" as const, completion: "synthetic_workflow_closed" as const }
            : { kind: confirmation as "approve" | "retry" };
    setPending(confirmation);
    setNotice(null);
    try {
      const receipt = CareActionMutationReceiptSchema.parse(
        await transport.mutate({
          roundId,
          actionId: selectedAction.id,
          mutation,
          expectedVersion: selectedAction.version,
          operationKey: operationKey(selectedAction, confirmation)
        })
      );
      setState((current) =>
        current.status === "ready"
          ? {
              status: "ready",
              actions: current.actions.map((action) =>
                action.id === receipt.action.id ? receipt.action : action
              )
            }
          : current
      );
      setSummaryDraft(receipt.action.clinicianSummary ?? receipt.action.evidence.summary);
      setAuditReference(receipt.event.eventId);
      setNotice({
        tone: "success",
        message: receipt.duplicateSuppressed
          ? "The server confirmed this operation was already persisted; no duplicate work was created."
          : "Persisted status and audit reference confirmed."
      });
      setConfirmation(null);
    } catch (error: unknown) {
      setState(previousState);
      setNotice({ tone: "error", message: errorMessage(error) });
      setConfirmation(null);
    } finally {
      setPending(null);
    }
  }, [confirmation, pending, roundId, selectedAction, state, summaryDraft, transport]);

  return {
    state,
    selectedAction,
    selectedActionId,
    selectAction,
    reload,
    summaryDraft,
    setSummaryDraft,
    confirmation,
    requestMutation,
    cancelConfirmation,
    confirmMutation,
    pending,
    notice,
    auditReference
  };
}
