import type { HTMLAttributes, ReactNode } from "react";

import { cx } from "./utils";

export type AppShellProps = HTMLAttributes<HTMLDivElement> & {
  header: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  density?: "comfortable" | "compact";
} & (
    | { navigation?: never; navigationLabel?: never }
    | { navigation: ReactNode; navigationLabel: string }
  ) &
  ({ contentAs?: "main"; contentLabel?: never } | { contentAs: "section"; contentLabel: string });

export function AppShell({
  header,
  navigation,
  navigationLabel,
  children,
  footer,
  density = "comfortable",
  contentAs = "main",
  contentLabel,
  className,
  ...props
}: AppShellProps) {
  const content = <>{children}</>;

  return (
    <div className={cx("hr-app-shell", `hr-app-shell--${density}`, className)} {...props}>
      <header className="hr-app-shell__header">{header}</header>
      {navigation ? (
        <nav aria-label={navigationLabel} className="hr-app-shell__navigation">
          {navigation}
        </nav>
      ) : null}
      {contentAs === "section" ? (
        <section aria-label={contentLabel} className="hr-app-shell__content">
          {content}
        </section>
      ) : (
        <main className="hr-app-shell__content">{content}</main>
      )}
      {footer ? <footer className="hr-app-shell__footer">{footer}</footer> : null}
    </div>
  );
}
