import type { HTMLAttributes, ReactNode } from "react";

import { cx } from "./utils";

export type EvidenceItem = {
  label: string;
  value: ReactNode;
  source?: string;
};

export type EvidencePanelProps = HTMLAttributes<HTMLElement> & {
  title: string;
  description?: string;
  items: readonly EvidenceItem[];
  footer?: ReactNode;
};

export function EvidencePanel({
  title,
  description,
  items,
  footer,
  className,
  ...props
}: EvidencePanelProps) {
  return (
    <section className={cx("hr-evidence", className)} {...props}>
      <header className="hr-evidence__header">
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
      </header>
      <dl className="hr-evidence__list">
        {items.map((item) => (
          <div className="hr-evidence__item" key={item.label}>
            <dt>{item.label}</dt>
            <dd>
              <span>{item.value}</span>
              {item.source ? <small>Source: {item.source}</small> : null}
            </dd>
          </div>
        ))}
      </dl>
      {footer ? <footer className="hr-evidence__footer">{footer}</footer> : null}
    </section>
  );
}
