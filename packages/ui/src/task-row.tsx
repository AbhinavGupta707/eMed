import type { HTMLAttributes, ReactNode } from "react";

import { StatusChip, type StatusChipVariant } from "./status-chip";
import { cx } from "./utils";

export type TaskRowDensity = "comfortable" | "compact";

export type TaskRowProps = HTMLAttributes<HTMLElement> & {
  title: string;
  participantLabel: string;
  status: string;
  statusVariant?: StatusChipVariant;
  dueLabel: string;
  metadata?: readonly string[];
  action?: ReactNode;
  density?: TaskRowDensity;
};

export function TaskRow({
  title,
  participantLabel,
  status,
  statusVariant = "neutral",
  dueLabel,
  metadata = [],
  action,
  density = "comfortable",
  className,
  ...props
}: TaskRowProps) {
  return (
    <article className={cx("hr-task-row", `hr-task-row--${density}`, className)} {...props}>
      <div className="hr-task-row__identity">
        <h3>{title}</h3>
        <p>{participantLabel}</p>
      </div>
      <div className="hr-task-row__status">
        <span className="hr-task-row__mobile-label">Status</span>
        <StatusChip variant={statusVariant}>{status}</StatusChip>
      </div>
      <div className="hr-task-row__due">
        <span className="hr-task-row__mobile-label">Due</span>
        <strong>{dueLabel}</strong>
      </div>
      {metadata.length > 0 ? (
        <ul className="hr-task-row__metadata" aria-label="Task details">
          {metadata.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
      {action ? <div className="hr-task-row__action">{action}</div> : null}
    </article>
  );
}
