/** @jsxRuntime automatic */
/** @jsxImportSource react */

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Dialog,
  Field,
  FieldDescription,
  FieldLabel,
  Spinner,
  StatusChip,
  TextArea
} from "@homerounds/ui";

import type { ClinicianMutationKind, ClinicianMutationReceipt, ClinicianTaskDetail } from "./model";
import {
  mutationDescription,
  mutationTitle,
  pendingMutationLabel,
  readableToken
} from "./presentation";
import type { MutationNotice } from "./controller";
import styles from "./clinician-cockpit.module.css";

type ActionPanelProps = {
  detail: ClinicianTaskDetail;
  noteDraft: string;
  noteDirty: boolean;
  onNoteChange: (value: string) => void;
  confirmation: ClinicianMutationKind | null;
  pendingKind: ClinicianMutationKind | null;
  notice: MutationNotice | null;
  lastReceipt: ClinicianMutationReceipt | null;
  onRequestMutation: (kind: ClinicianMutationKind) => void;
  onCancelConfirmation: () => void;
  onConfirmMutation: () => Promise<void>;
};

function UnsupportedCapability({ children }: { children: React.ReactNode }) {
  return <p className={styles.capabilityNotice}>{children}</p>;
}

export function ActionPanel({
  detail,
  noteDraft,
  noteDirty,
  onNoteChange,
  confirmation,
  pendingKind,
  notice,
  lastReceipt,
  onRequestMutation,
  onCancelConfirmation,
  onConfirmMutation
}: ActionPanelProps) {
  const busy = pendingKind !== null;
  const noteSupported = detail.capabilities.note === "supported";
  const task = detail.task;

  return (
    <section aria-labelledby="clinician-actions-heading" className={styles.actionsSection}>
      <header className={styles.sectionHeading}>
        <div>
          <h3 id="clinician-actions-heading">Clinician controls</h3>
          <p>
            Local intent is distinct from persistence. Every confirmed write must return an audit
            reference.
          </p>
        </div>
        {pendingKind ? (
          <StatusChip variant="information">{pendingMutationLabel(pendingKind)}</StatusChip>
        ) : null}
      </header>

      {notice ? (
        <div
          aria-live="polite"
          className={notice.tone === "success" ? styles.noticeSuccess : styles.noticeError}
          role={notice.tone === "error" ? "alert" : "status"}
        >
          <strong>{notice.tone === "success" ? "Persistence confirmed" : "Not persisted"}</strong>
          <span>{notice.message}</span>
          {lastReceipt ? <span>Audit reference: {lastReceipt.event.eventId}</span> : null}
        </div>
      ) : null}

      <div className={styles.actionLayout}>
        <Card>
          <CardHeader>
            <CardTitle>Clinician note</CardTitle>
            <CardDescription>
              Draft synthetic-only text. Never enter a real name, identifier, or clinical claim.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Field className={styles.noteField} disabled={!noteSupported}>
              <FieldLabel htmlFor="clinician-note">Note draft</FieldLabel>
              <TextArea
                aria-describedby="clinician-note-description"
                disabled={!noteSupported}
                id="clinician-note"
                maxLength={2_000}
                onChange={(event) => onNoteChange(event.currentTarget.value)}
                rows={6}
                value={noteDraft}
              />
              <FieldDescription id="clinician-note-description">
                {noteSupported
                  ? `${noteDraft.length} of 2,000 characters. ${noteDirty ? "Local changes are not saved." : "No unsaved changes."}`
                  : "Draft editing is unavailable because the current API has no clinician-note contract."}
              </FieldDescription>
            </Field>
          </CardContent>
          <CardFooter>
            <Button
              disabled={!noteSupported || !noteDirty || busy}
              onClick={() => onRequestMutation("save_note")}
            >
              {pendingKind === "save_note" ? <Spinner label="Saving note" /> : null}
              Save note
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Task workflow</CardTitle>
            <CardDescription>
              Acknowledge, record attempted contact, or complete only through confirmed persistence.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className={styles.controlFacts}>
              <div>
                <dt>Current status</dt>
                <dd>{readableToken(task.status)}</dd>
              </div>
              <div>
                <dt>Stable task key</dt>
                <dd>{task.idempotencyKey}</dd>
              </div>
            </dl>
            {Object.values(detail.capabilities).some(
              (capability) => capability === "unsupported"
            ) ? (
              <UnsupportedCapability>
                Unsupported controls are disabled. The cockpit does not simulate a write or show a
                success state.
              </UnsupportedCapability>
            ) : null}
          </CardContent>
          <CardFooter className={styles.workflowActions}>
            <Button
              disabled={
                detail.capabilities.acknowledge !== "supported" || task.status !== "open" || busy
              }
              onClick={() => onRequestMutation("acknowledge")}
              variant="secondary"
            >
              Acknowledge
            </Button>
            <Button
              disabled={detail.capabilities.contact !== "supported" || busy}
              onClick={() => onRequestMutation("record_contact")}
              variant="secondary"
            >
              Record contact
            </Button>
            <Button
              disabled={
                detail.capabilities.complete !== "supported" || task.status === "completed" || busy
              }
              onClick={() => onRequestMutation("complete")}
            >
              Complete task
            </Button>
          </CardFooter>
        </Card>
      </div>

      <Dialog
        description={confirmation ? mutationDescription(confirmation) : undefined}
        footer={
          <div className="hr-inline-actions">
            <Button disabled={busy} onClick={onCancelConfirmation} variant="secondary">
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void onConfirmMutation()}>
              {busy ? <Spinner label="Awaiting persistence" /> : null}
              Confirm
            </Button>
          </div>
        }
        onOpenChange={(open) => {
          if (!open) onCancelConfirmation();
        }}
        open={confirmation !== null}
        title={confirmation ? mutationTitle(confirmation) : "Confirm clinician update"}
      >
        <div className={styles.confirmationBody}>
          <p>
            No success is displayed until a schema-valid persistence receipt and audit event are
            returned.
          </p>
          {confirmation === "complete" ? (
            <p>
              Repeated confirmation uses the same stable operation key so a capable server can
              suppress duplicate completion work.
            </p>
          ) : null}
          {confirmation === "save_note" ? (
            <p>
              Draft length: {noteDraft.length} characters. The note text is not logged by the
              cockpit.
            </p>
          ) : null}
        </div>
      </Dialog>
    </section>
  );
}
