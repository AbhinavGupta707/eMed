/** @jsxRuntime automatic */
/** @jsxImportSource react */

import {
  Button,
  Card,
  CardContent,
  Dialog,
  FeedbackState,
  Field,
  FieldDescription,
  FieldLabel,
  Spinner,
  StatusChip,
  TextArea
} from "@homerounds/ui";

import type {
  ClinicianCareActionMutationKind,
  SyntheticCareAction
} from "@homerounds/actions/care-schemas";

import type { ClinicianCareActionTransport } from "./care-action-transport";
import styles from "./clinician-cockpit.module.css";
import { formatDateTime, readableToken } from "./presentation";
import { useCareActions } from "./use-care-actions";

function actionStatusVariant(status: SyntheticCareAction["status"]) {
  if (status === "completed") return "complete" as const;
  if (status === "failed" || status === "unknown") return "attention" as const;
  if (status === "approved" || status === "contact_attempted") return "information" as const;
  return "neutral" as const;
}

function mutationLabel(kind: ClinicianCareActionMutationKind): string {
  const labels: Record<ClinicianCareActionMutationKind, string> = {
    approve: "Approve synthetic request",
    edit: "Save edited summary",
    record_contact: "Record contact attempt",
    complete: "Complete synthetic action",
    retry: "Retry workflow"
  };
  return labels[kind];
}

function mutationDescription(kind: ClinicianCareActionMutationKind): string {
  const descriptions: Record<ClinicianCareActionMutationKind, string> = {
    approve:
      "Approve this recorded synthetic request for the prototype workflow. Nothing is sent to a real service.",
    edit: "Persist only this concise structured summary. Do not paste a transcript, prompt, provider payload, or hidden reasoning.",
    record_contact:
      "Record an attempted synthetic contact step. This never means a person or service was reached.",
    complete:
      "Close this synthetic workflow after reviewing its evidence and owner. No external delivery is implied.",
    retry:
      "Retry only the failed internal prototype workflow. No clinic, pharmacy, calendar, or care team will be contacted."
  };
  return descriptions[kind];
}

function EvidenceCard({ action }: { action: SyntheticCareAction }) {
  return (
    <Card className={styles.careEvidenceCard}>
      <CardContent>
        <div className={styles.careEvidenceHeading}>
          <div>
            <p className={styles.contextLabel}>Concise evidence card</p>
            <h4>{readableToken(action.kind)}</h4>
          </div>
          <StatusChip variant={actionStatusVariant(action.status)}>
            {readableToken(action.status)}
          </StatusChip>
        </div>
        <p>{action.evidence.summary}</p>
        <dl className={styles.careEvidenceValues}>
          <div>
            <dt>Deterministic protocol</dt>
            <dd>
              {action.evidence.protocolId} · {action.evidence.protocolVersion}
            </dd>
          </div>
          <div>
            <dt>Outcome</dt>
            <dd>{readableToken(action.evidence.protocolOutcome)}</dd>
          </div>
          <div>
            <dt>Capture quality</dt>
            <dd>{readableToken(action.evidence.captureQuality)}</dd>
          </div>
          <div>
            <dt>Measurement</dt>
            <dd>{readableToken(action.evidence.measurementState)}</dd>
          </div>
          <div>
            <dt>Confirmed summary</dt>
            <dd>{action.details.confirmedSummary}</dd>
          </div>
          <div>
            <dt>Patient confirmed</dt>
            <dd>{formatDateTime(action.patientConfirmationAt)}</dd>
          </div>
          <div>
            <dt>Owner</dt>
            <dd>{action.ownerId ?? "Not yet assigned"}</dd>
          </div>
          <div>
            <dt>Persisted version</dt>
            <dd>{action.version}</dd>
          </div>
        </dl>
        <p className={styles.careBoundary}>
          Synthetic-only: not sent to a real clinic, pharmacy, calendar, emergency service, or care
          team. Raw transcript, model reasoning, provider payload, and raw media are absent.
        </p>
      </CardContent>
    </Card>
  );
}

export function CareActionPanel({
  roundId,
  transport
}: {
  roundId: string;
  transport: ClinicianCareActionTransport;
}) {
  const controller = useCareActions(roundId, transport);
  const action = controller.selectedAction;
  const busy = controller.pending !== null;
  const canEdit = action?.status === "pending_review" || action?.status === "approved";
  const canApprove = action?.status === "pending_review";
  const canContact = action?.status === "approved";
  const canComplete = action?.status === "approved" || action?.status === "contact_attempted";
  const canRetry = action?.status === "failed" && action.lastFailure?.retryable === true;

  return (
    <section aria-labelledby="care-actions-heading" className={styles.actionsSection}>
      <header className={styles.sectionHeading}>
        <div>
          <h3 id="care-actions-heading">Confirmed synthetic care actions</h3>
          <p>
            Approve, edit, record attempted contact, and complete only through persisted receipts.
          </p>
        </div>
        <Button disabled={busy} onClick={controller.reload} size="compact" variant="quiet">
          Reload status
        </Button>
      </header>

      {controller.state.status === "loading" ? (
        <FeedbackState
          description="Reading the round-scoped persisted action status."
          kind="loading"
          title="Loading care actions"
        />
      ) : null}
      {controller.state.status === "error" ? (
        <FeedbackState
          action={
            <Button onClick={controller.reload} variant="secondary">
              Retry status
            </Button>
          }
          description={controller.state.message}
          kind="error"
          title="Care action status unavailable"
        />
      ) : null}
      {controller.state.status === "ready" && controller.state.actions.length === 0 ? (
        <FeedbackState
          description="No explicitly patient-confirmed synthetic care action was returned. Nothing is inferred or sent."
          kind="empty"
          title="No confirmed care action"
        />
      ) : null}

      {controller.state.status === "ready" && controller.state.actions.length > 1 ? (
        <div className={styles.careActionSelector}>
          <span>Returned actions</span>
          {controller.state.actions.map((item) => (
            <Button
              aria-pressed={item.id === controller.selectedActionId}
              disabled={busy}
              key={item.id}
              onClick={() => controller.selectAction(item.id)}
              size="compact"
              variant={item.id === controller.selectedActionId ? "primary" : "secondary"}
            >
              {readableToken(item.kind)}
            </Button>
          ))}
        </div>
      ) : null}

      {action ? (
        <div className={styles.careActionWorkspace}>
          <EvidenceCard action={action} />
          {controller.notice ? (
            <div
              className={
                controller.notice.tone === "success" ? styles.noticeSuccess : styles.noticeError
              }
              role={controller.notice.tone === "error" ? "alert" : "status"}
            >
              <strong>
                {controller.notice.tone === "success" ? "Persistence confirmed" : "Not persisted"}
              </strong>
              <span>{controller.notice.message}</span>
              {controller.auditReference ? (
                <span>Audit reference: {controller.auditReference}</span>
              ) : null}
            </div>
          ) : null}
          <Field className={styles.careSummaryField} disabled={!canEdit || busy}>
            <FieldLabel htmlFor={`care-summary-${action.id}`}>Clinician summary</FieldLabel>
            <TextArea
              disabled={!canEdit || busy}
              id={`care-summary-${action.id}`}
              maxLength={280}
              onChange={(event) => controller.setSummaryDraft(event.currentTarget.value)}
              rows={4}
              value={controller.summaryDraft}
            />
            <FieldDescription>
              {controller.summaryDraft.length} of 280 characters. Concise structured evidence only;
              never paste raw transcript or model reasoning.
            </FieldDescription>
          </Field>
          <div className={styles.workflowActions}>
            <Button disabled={!canEdit || busy} onClick={() => controller.requestMutation("edit")}>
              Save edit
            </Button>
            <Button
              disabled={!canApprove || busy}
              onClick={() => controller.requestMutation("approve")}
              variant="secondary"
            >
              Approve
            </Button>
            <Button
              disabled={!canContact || busy}
              onClick={() => controller.requestMutation("record_contact")}
              variant="secondary"
            >
              Record contact attempt
            </Button>
            <Button
              disabled={!canComplete || busy}
              onClick={() => controller.requestMutation("complete")}
            >
              Complete action
            </Button>
            {canRetry ? (
              <Button
                disabled={busy}
                onClick={() => controller.requestMutation("retry")}
                variant="secondary"
              >
                Retry failed workflow
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <Dialog
        description={
          controller.confirmation ? mutationDescription(controller.confirmation) : undefined
        }
        footer={
          <div className="hr-inline-actions">
            <Button disabled={busy} onClick={controller.cancelConfirmation} variant="secondary">
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void controller.confirmMutation()}>
              {busy ? <Spinner label="Awaiting persistence" /> : null}
              Confirm persisted update
            </Button>
          </div>
        }
        onOpenChange={(open) => {
          if (!open) controller.cancelConfirmation();
        }}
        open={controller.confirmation !== null}
        title={
          controller.confirmation
            ? mutationLabel(controller.confirmation)
            : "Confirm synthetic care action update"
        }
      >
        <p>
          This prototype will show success only after a schema-valid persisted receipt and audit
          reference return.
        </p>
      </Dialog>
    </section>
  );
}
