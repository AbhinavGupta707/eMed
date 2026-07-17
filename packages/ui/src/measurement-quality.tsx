import type { HTMLAttributes, ReactNode } from "react";

import { StatusIcon, type StatusIconKind } from "./status-icon";
import { cx } from "./utils";

export type MeasurementQualityStatus = "pass" | "retry" | "fail";

const qualityPresentation: Readonly<
  Record<MeasurementQualityStatus, { icon: StatusIconKind; label: string }>
> = {
  pass: { icon: "success", label: "Quality passed" },
  retry: { icon: "warning", label: "Try the measurement again" },
  fail: { icon: "danger", label: "No reliable measurement" }
};

export type MeasurementQualityProps = HTMLAttributes<HTMLElement> & {
  status: MeasurementQualityStatus;
  title?: string;
  reasons: readonly string[];
  details?: ReactNode;
};

export function MeasurementQuality({
  status,
  title = "Measurement quality",
  reasons,
  details,
  className,
  ...props
}: MeasurementQualityProps) {
  const presentation = qualityPresentation[status];

  return (
    <section className={cx("hr-quality", `hr-quality--${status}`, className)} {...props}>
      <div className="hr-quality__heading">
        <StatusIcon className="hr-quality__icon" kind={presentation.icon} />
        <div>
          <h3>{title}</h3>
          <strong>{presentation.label}</strong>
        </div>
      </div>
      <ul className="hr-quality__reasons">
        {reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
      {details ? <div className="hr-quality__details">{details}</div> : null}
      {status !== "pass" ? (
        <p className="hr-quality__guardrail">No measurement value is shown for this result.</p>
      ) : null}
    </section>
  );
}
