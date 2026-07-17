"use client";

import type { DialogHTMLAttributes, ReactNode } from "react";
import { useEffect, useId, useRef } from "react";

import { Button } from "./button";
import { cx } from "./utils";

export type DialogPlacement = "center" | "drawer";

export type DialogProps = Omit<
  DialogHTMLAttributes<HTMLDialogElement>,
  "open" | "onCancel" | "onClose"
> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  placement?: DialogPlacement;
  closeLabel?: string;
};

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  placement = "center",
  closeLabel = "Close",
  className,
  ...props
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      aria-describedby={description ? descriptionId : undefined}
      aria-labelledby={titleId}
      aria-modal="true"
      className={cx("hr-dialog", `hr-dialog--${placement}`, className)}
      onCancel={(event) => {
        event.preventDefault();
        onOpenChange(false);
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false);
      }}
      onClose={() => onOpenChange(false)}
      ref={dialogRef}
      {...props}
    >
      <div className="hr-dialog__surface">
        <header className="hr-dialog__header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>
          <Button aria-label={closeLabel} onClick={() => onOpenChange(false)} variant="quiet">
            Close
          </Button>
        </header>
        <div className="hr-dialog__content">{children}</div>
        {footer ? <footer className="hr-dialog__footer">{footer}</footer> : null}
      </div>
    </dialog>
  );
}
