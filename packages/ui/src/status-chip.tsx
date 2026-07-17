import type { HTMLAttributes } from "react";

import { StatusIcon, type StatusIconKind } from "./status-icon";
import { cx } from "./utils";

export type StatusChipVariant = "complete" | "information" | "attention" | "action" | "neutral";

const iconKinds: Readonly<Record<StatusChipVariant, StatusIconKind>> = {
  complete: "success",
  information: "information",
  attention: "warning",
  action: "danger",
  neutral: "neutral"
};

export type StatusChipProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: StatusChipVariant;
};

export function StatusChip({
  variant = "neutral",
  className,
  children,
  ...props
}: StatusChipProps) {
  return (
    <span className={cx("hr-status-chip", `hr-status-chip--${variant}`, className)} {...props}>
      <StatusIcon className="hr-status-chip__icon" kind={iconKinds[variant]} />
      <span>{children}</span>
    </span>
  );
}
