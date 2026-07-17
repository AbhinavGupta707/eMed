"use client";

import type { HTMLAttributes } from "react";
import { useId, useState } from "react";

import { Button } from "./button";
import { Field, FieldDescription, FieldLabel, TextArea } from "./field";
import { cx } from "./utils";

export type TranscriptConfirmationProps = Omit<HTMLAttributes<HTMLElement>, "onConfirm"> & {
  defaultValue: string;
  onConfirm?: (value: string) => void;
  maxLength?: number;
};

export function TranscriptConfirmation({
  defaultValue,
  onConfirm,
  maxLength = 500,
  className,
  ...props
}: TranscriptConfirmationProps) {
  const fieldId = useId();
  const descriptionId = `${fieldId}-description`;
  const [value, setValue] = useState(defaultValue);
  const [confirmed, setConfirmed] = useState(false);

  return (
    <section className={cx("hr-transcript", className)} {...props}>
      <header className="hr-transcript__header">
        <div>
          <h3>Confirm what you said</h3>
          <p>Review and edit the text for accuracy before continuing.</p>
        </div>
      </header>
      <Field>
        <FieldLabel htmlFor={fieldId}>Transcript</FieldLabel>
        <TextArea
          aria-describedby={descriptionId}
          id={fieldId}
          maxLength={maxLength}
          onChange={(event) => {
            setConfirmed(false);
            setValue(event.currentTarget.value);
          }}
          rows={5}
          value={value}
        />
        <FieldDescription id={descriptionId}>
          {value.length} of {maxLength} characters. Nothing is submitted until you confirm.
        </FieldDescription>
      </Field>
      <div className="hr-transcript__actions">
        <Button
          disabled={value === defaultValue}
          onClick={() => {
            setConfirmed(false);
            setValue(defaultValue);
          }}
          variant="quiet"
        >
          Reset changes
        </Button>
        <Button
          disabled={value.trim().length === 0}
          onClick={() => {
            setConfirmed(true);
            onConfirm?.(value.trim());
          }}
        >
          Confirm transcript
        </Button>
      </div>
      <p aria-live="polite" className="hr-transcript__confirmation">
        {confirmed ? "Transcript confirmed." : "Transcript not yet confirmed."}
      </p>
    </section>
  );
}
