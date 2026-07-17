import type { HTMLAttributes, ReactNode } from "react";

import { Spinner } from "./button";
import { StatusIcon } from "./status-icon";
import { cx } from "./utils";

export type FeedbackStateKind = "empty" | "loading" | "error";

export type FeedbackStateProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
  kind: FeedbackStateKind;
  title: ReactNode;
  description: ReactNode;
  action?: ReactNode;
};

export function FeedbackState({
  kind,
  title,
  description,
  action,
  className,
  ...props
}: FeedbackStateProps) {
  return (
    <section
      aria-busy={kind === "loading" ? true : undefined}
      className={cx("hr-feedback", `hr-feedback--${kind}`, className)}
      role={kind === "error" ? "alert" : "status"}
      {...props}
    >
      <div className="hr-feedback__media">
        {kind === "loading" ? (
          <Spinner label="Loading content" />
        ) : (
          <StatusIcon kind={kind === "error" ? "danger" : "neutral"} />
        )}
      </div>
      <div className="hr-feedback__body">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {action ? <div className="hr-feedback__action">{action}</div> : null}
    </section>
  );
}
