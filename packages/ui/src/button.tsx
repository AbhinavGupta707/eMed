import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cx } from "./utils";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";
export type ButtonSize = "default" | "compact";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
};

export function Button({
  className,
  type = "button",
  variant = "primary",
  size = "default",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cx("hr-button", `hr-button--${variant}`, `hr-button--${size}`, className)}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span className="hr-spinner" role="status">
      <span aria-hidden="true" className="hr-spinner__mark" />
      <span className="hr-sr-only">{label}</span>
    </span>
  );
}
