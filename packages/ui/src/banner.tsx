import type { HTMLAttributes, ReactNode } from "react";

import { StatusIcon, type StatusIconKind } from "./status-icon";
import { cx } from "./utils";

export type BannerVariant = "information" | "success" | "warning" | "danger";

const iconKinds: Readonly<Record<BannerVariant, StatusIconKind>> = {
  information: "information",
  success: "success",
  warning: "warning",
  danger: "danger"
};

export type BannerProps = Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  variant: BannerVariant;
  title: ReactNode;
  children: ReactNode;
  action?: ReactNode;
};

export function Banner({ variant, title, children, action, className, ...props }: BannerProps) {
  return (
    <div
      className={cx("hr-banner", `hr-banner--${variant}`, className)}
      role={variant === "danger" || variant === "warning" ? "alert" : "status"}
      {...props}
    >
      <StatusIcon className="hr-banner__icon" kind={iconKinds[variant]} />
      <div className="hr-banner__body">
        <strong className="hr-banner__title">{title}</strong>
        <div className="hr-banner__description">{children}</div>
      </div>
      {action ? <div className="hr-banner__action">{action}</div> : null}
    </div>
  );
}
