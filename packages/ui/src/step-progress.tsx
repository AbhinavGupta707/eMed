import type { CSSProperties, HTMLAttributes } from "react";

import { cx } from "./utils";

export type StepState = "complete" | "current" | "upcoming";

export type ProgressStep = {
  id: string;
  label: string;
  state: StepState;
};

export type StepProgressProps = Omit<HTMLAttributes<HTMLOListElement>, "children"> & {
  steps: readonly ProgressStep[];
  label?: string;
};

export function StepProgress({
  steps,
  label = "Progress",
  className,
  style,
  ...props
}: StepProgressProps) {
  const progressStyle = {
    ...style,
    "--hr-step-count": steps.length
  } as CSSProperties;

  return (
    <nav aria-label={label} className={cx("hr-step-progress", className)}>
      <ol style={progressStyle} {...props}>
        {steps.map((step, index) => (
          <li
            aria-current={step.state === "current" ? "step" : undefined}
            className={cx("hr-step", `hr-step--${step.state}`)}
            key={step.id}
          >
            <span aria-hidden="true" className="hr-step__marker">
              {step.state === "complete" ? "✓" : index + 1}
            </span>
            <span className="hr-step__label">{step.label}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
