/** @jsxRuntime automatic */
/** @jsxImportSource react */

"use client";

import type { ClinicalTask } from "@homerounds/contracts";
import {
  AppShell,
  Button,
  FeedbackState,
  StatusChip,
  type StatusChipVariant
} from "@homerounds/ui";
import { useMemo } from "react";

import { ActionPanel } from "./action-panel";
import { CareActionPanel } from "./care-action-panel";
import {
  createBrowserCareActionTransport,
  createEmptyCareActionTransport,
  type ClinicianCareActionTransport
} from "./care-action-transport";
import { AuditTimeline, EvidenceBoundary, EvidenceChain } from "./evidence-chain";
import type { ClinicianDensity, ClinicianMutationKind, ClinicianTaskDetail } from "./model";
import {
  formatDateTime,
  pendingMutationLabel,
  programmeLabel,
  readableToken,
  taskPriorityVariant,
  taskStatusVariant
} from "./presentation";
import styles from "./clinician-cockpit.module.css";
import { createBrowserClinicianTransport, type ClinicianTransport } from "./transport";
import { useClinicianCockpit, type DetailState, type QueueState } from "./use-clinician-cockpit";

export type ClinicianCockpitProps = {
  roundIds: readonly string[];
  invalidRoundIdCount?: number;
  transport?: ClinicianTransport;
  careActionTransport?: ClinicianCareActionTransport;
};

function CockpitHeader({
  density,
  onDensityChange
}: {
  density: ClinicianDensity;
  onDensityChange: (density: ClinicianDensity) => void;
}) {
  return (
    <div className={styles.cockpitHeader}>
      <div className={styles.brandBlock}>
        <span aria-hidden="true" className={styles.brandMark}>
          H
        </span>
        <div>
          <strong>HomeRounds</strong>
          <span>Clinician operations</span>
        </div>
      </div>
      <div className={styles.titleBlock}>
        <h1>Clinician cockpit</h1>
        <p>Prioritised synthetic rounds with explicit provenance and persistence boundaries.</p>
      </div>
      <div className={styles.headerControls}>
        <div className={styles.headerStatuses}>
          <StatusChip variant="information">Synthetic data</StatusChip>
          <StatusChip variant="attention">Not clinically validated</StatusChip>
        </div>
        <fieldset className={styles.densityControl}>
          <legend className="hr-sr-only">Queue density</legend>
          {(["comfortable", "compact"] as const).map((option) => (
            <label key={option}>
              <input
                checked={density === option}
                name="queue-density"
                onChange={() => onDensityChange(option)}
                type="radio"
                value={option}
              />
              <span>{readableToken(option)}</span>
            </label>
          ))}
        </fieldset>
      </div>
    </div>
  );
}

function taskDisplay(input: {
  task: ClinicalTask;
  selected: boolean;
  pendingKind: ClinicianMutationKind | null;
}): { label: string; variant: StatusChipVariant } {
  if (input.selected && input.pendingKind !== null) {
    return { label: pendingMutationLabel(input.pendingKind), variant: "information" };
  }
  return { label: readableToken(input.task.status), variant: taskStatusVariant(input.task.status) };
}

function QueueTask({
  task,
  density,
  selected,
  pendingKind,
  onSelect
}: {
  task: ClinicalTask;
  density: ClinicianDensity;
  selected: boolean;
  pendingKind: ClinicianMutationKind | null;
  onSelect: () => void;
}) {
  const status = taskDisplay({ task, selected, pendingKind });
  return (
    <li>
      <button
        aria-current={selected ? "true" : undefined}
        className={styles.queueTask}
        data-density={density}
        onClick={onSelect}
        type="button"
      >
        <span className={styles.queueTaskTopline}>
          <strong>Synthetic record {task.patientId}</strong>
          <StatusChip variant={taskPriorityVariant(task.priority)}>
            {readableToken(task.priority)}
          </StatusChip>
        </span>
        <span className={styles.queueTaskMeta}>Task {task.id}</span>
        <span className={styles.queueTaskBottomline}>
          <StatusChip variant={status.variant}>{status.label}</StatusChip>
          <span>{formatDateTime(task.createdAt)}</span>
        </span>
        {density === "comfortable" ? (
          <span className={styles.queueTaskWindow}>{task.serviceWindowLabel}</span>
        ) : null}
      </button>
    </li>
  );
}

function QueuePanel({
  state,
  density,
  selectedTaskId,
  pendingKind,
  invalidRoundIdCount,
  onSelect,
  onReload
}: {
  state: QueueState;
  density: ClinicianDensity;
  selectedTaskId: string | null;
  pendingKind: ClinicianMutationKind | null;
  invalidRoundIdCount: number;
  onSelect: (taskId: string) => void;
  onReload: () => void;
}) {
  return (
    <div className={styles.queuePanel}>
      <header className={styles.queueHeader}>
        <div>
          <h2>Priority queue</h2>
          <p>
            {state.status === "ready" ? `${state.tasks.length} returned tasks` : "Returned tasks"}
          </p>
        </div>
        <Button
          aria-label="Reload clinician priority queue"
          onClick={onReload}
          size="compact"
          variant="quiet"
        >
          Reload
        </Button>
      </header>
      {invalidRoundIdCount > 0 ? (
        <p className={styles.queueWarning} role="alert">
          {invalidRoundIdCount} invalid round reference
          {invalidRoundIdCount === 1 ? " was" : "s were"} ignored.
        </p>
      ) : null}
      {state.status === "loading" ? (
        <FeedbackState
          description="Reading only the explicitly scoped round references."
          kind="loading"
          title="Loading priority queue"
        />
      ) : null}
      {state.status === "error" ? (
        <FeedbackState
          action={
            <Button onClick={onReload} variant="secondary">
              Retry
            </Button>
          }
          description={state.message}
          kind="error"
          title="Queue unavailable"
        />
      ) : null}
      {state.status === "ready" && state.tasks.length === 0 ? (
        <FeedbackState
          description="No tasks were returned for the supplied round references. No work is inferred."
          kind="empty"
          title="No queued tasks"
        />
      ) : null}
      {state.status === "ready" && state.tasks.length > 0 ? (
        <ol className={styles.queueList}>
          {state.tasks.map((task) => (
            <QueueTask
              density={density}
              key={task.id}
              onSelect={() => onSelect(task.id)}
              pendingKind={pendingKind}
              selected={task.id === selectedTaskId}
              task={task}
            />
          ))}
        </ol>
      ) : null}
    </div>
  );
}

function ContextFacts({ detail }: { detail: ClinicianTaskDetail }) {
  return (
    <dl className={styles.contextFacts}>
      <div>
        <dt>Programme</dt>
        <dd>{programmeLabel(detail)}</dd>
      </div>
      <div>
        <dt>Round</dt>
        <dd>{detail.task.roundId}</dd>
      </div>
      <div>
        <dt>Task</dt>
        <dd>{detail.task.id}</dd>
      </div>
      <div>
        <dt>Owner</dt>
        <dd>{readableToken(detail.task.ownerRole)}</dd>
      </div>
      <div>
        <dt>Illustrative service window</dt>
        <dd>{detail.task.serviceWindowLabel}</dd>
      </div>
      <div>
        <dt>Last returned task update</dt>
        <dd>{formatDateTime(detail.task.updatedAt)}</dd>
      </div>
    </dl>
  );
}

function TaskDetailHeader({ detail }: { detail: ClinicianTaskDetail }) {
  const purpose =
    detail.round.status === "available" ? detail.round.value.purpose : detail.round.explanation;
  return (
    <>
      <section className={styles.taskHeading}>
        <div>
          <p className={styles.contextLabel}>Selected synthetic patient</p>
          <h2>Synthetic record {detail.task.patientId}</h2>
          <p>{purpose}</p>
        </div>
        <div className={styles.taskStatuses}>
          <StatusChip variant={taskPriorityVariant(detail.task.priority)}>
            {readableToken(detail.task.priority)}
          </StatusChip>
          <StatusChip variant={taskStatusVariant(detail.task.status)}>
            {readableToken(detail.task.status)}
          </StatusChip>
        </div>
      </section>
      <aside className={styles.safetyStrip}>
        <strong>Synthetic hackathon prototype</strong>
        <span>
          Not clinically validated or diagnostic. Urgency and workflow authority remain with the
          safety protocol and persisted service—not this interface.
        </span>
      </aside>
      <ContextFacts detail={detail} />
    </>
  );
}

function TaskWorkspace({
  state,
  onReload,
  actionProps,
  careActionTransport
}: {
  state: DetailState;
  onReload: () => void;
  actionProps: Omit<React.ComponentProps<typeof ActionPanel>, "detail">;
  careActionTransport: ClinicianCareActionTransport;
}) {
  if (state.status === "idle") {
    return (
      <FeedbackState
        description="Choose a returned task. If no round references were supplied, this view does not invent a queue."
        kind="empty"
        title="No task selected"
      />
    );
  }
  if (state.status === "loading") {
    return (
      <FeedbackState
        description="Reading round and synthetic FHIR context. Evidence that is not exposed remains unavailable."
        kind="loading"
        title="Loading task detail"
      />
    );
  }
  if (state.status === "error") {
    return (
      <FeedbackState
        action={
          <Button onClick={onReload} variant="secondary">
            Retry detail
          </Button>
        }
        description={state.message}
        kind="error"
        title="Task detail unavailable"
      />
    );
  }

  return (
    <div className={styles.workspace}>
      <TaskDetailHeader detail={state.detail} />
      <EvidenceBoundary detail={state.detail} />
      <EvidenceChain detail={state.detail} />
      <AuditTimeline detail={state.detail} />
      <CareActionPanel roundId={state.detail.task.roundId} transport={careActionTransport} />
      <ActionPanel detail={state.detail} {...actionProps} />
    </div>
  );
}

export function ClinicianCockpit({
  roundIds,
  invalidRoundIdCount = 0,
  transport,
  careActionTransport
}: ClinicianCockpitProps) {
  const roundIdsKey = roundIds.join(",");
  const resolvedTransport = useMemo(
    () =>
      transport ??
      createBrowserClinicianTransport(roundIdsKey === "" ? [] : roundIdsKey.split(",")),
    [roundIdsKey, transport]
  );
  const resolvedCareActionTransport = useMemo(
    () =>
      careActionTransport ??
      (transport ? createEmptyCareActionTransport() : createBrowserCareActionTransport()),
    [careActionTransport, transport]
  );
  const controller = useClinicianCockpit(resolvedTransport);

  return (
    <div className={styles.page}>
      <AppShell
        className={styles.shell}
        density={controller.density}
        footer={
          <span>
            Synthetic data only · Not clinically validated · No raw camera frames, face video, or
            raw voice audio
          </span>
        }
        header={
          <CockpitHeader density={controller.density} onDensityChange={controller.setDensity} />
        }
        navigation={
          <QueuePanel
            density={controller.density}
            invalidRoundIdCount={invalidRoundIdCount}
            onReload={controller.reloadQueue}
            onSelect={controller.selectTask}
            pendingKind={controller.pendingKind}
            selectedTaskId={controller.selectedTaskId}
            state={controller.queueState}
          />
        }
        navigationLabel="Clinician priority queue"
      >
        <TaskWorkspace
          actionProps={{
            confirmation: controller.confirmation,
            lastReceipt: controller.lastReceipt,
            noteDirty: controller.noteDirty,
            noteDraft: controller.noteDraft,
            notice: controller.notice,
            onCancelConfirmation: controller.cancelConfirmation,
            onConfirmMutation: controller.confirmMutation,
            onNoteChange: controller.setNoteDraft,
            onRequestMutation: controller.requestMutation,
            pendingKind: controller.pendingKind
          }}
          careActionTransport={resolvedCareActionTransport}
          onReload={controller.reloadDetail}
          state={controller.detailState}
        />
      </AppShell>
    </div>
  );
}
