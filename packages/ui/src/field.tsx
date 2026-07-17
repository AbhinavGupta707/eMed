import type {
  FieldsetHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  TextareaHTMLAttributes
} from "react";

import { cx } from "./utils";

export function FieldGroup({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("hr-field-group", className)} {...props} />;
}

export type FieldProps = HTMLAttributes<HTMLDivElement> & {
  invalid?: boolean;
  disabled?: boolean;
};

export function Field({ className, invalid, disabled, ...props }: FieldProps) {
  return (
    <div
      className={cx("hr-field", className)}
      data-disabled={disabled ? "true" : undefined}
      data-invalid={invalid ? "true" : undefined}
      {...props}
    />
  );
}

export function FieldLabel({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cx("hr-field__label", className)} {...props} />;
}

export function FieldDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cx("hr-field__description", className)} {...props} />;
}

export function FieldError({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cx("hr-field__error", className)} {...props} />;
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx("hr-input", className)} {...props} />;
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx("hr-textarea", className)} {...props} />;
}

export function FieldSet({ className, ...props }: FieldsetHTMLAttributes<HTMLFieldSetElement>) {
  return <fieldset className={cx("hr-fieldset", className)} {...props} />;
}

export function FieldLegend({ className, ...props }: HTMLAttributes<HTMLLegendElement>) {
  return <legend className={cx("hr-field__label", className)} {...props} />;
}
