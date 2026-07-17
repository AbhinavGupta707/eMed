import type { SVGProps } from "react";

export type StatusIconKind = "success" | "information" | "warning" | "danger" | "neutral";

export function StatusIcon({ kind, ...props }: { kind: StatusIconKind } & SVGProps<SVGSVGElement>) {
  const shared = {
    "aria-hidden": true,
    fill: "none",
    focusable: "false",
    viewBox: "0 0 20 20"
  } as const;

  if (kind === "success") {
    return (
      <svg {...shared} {...props}>
        <circle cx="10" cy="10" r="7.5" />
        <path d="m6.7 10.2 2.1 2.1 4.6-4.8" />
      </svg>
    );
  }

  if (kind === "warning") {
    return (
      <svg {...shared} {...props}>
        <path d="M10 2.8 18 17H2L10 2.8Z" />
        <path d="M10 7.1v4.7M10 14.6v.1" />
      </svg>
    );
  }

  if (kind === "danger") {
    return (
      <svg {...shared} {...props}>
        <circle cx="10" cy="10" r="7.5" />
        <path d="m7.4 7.4 5.2 5.2m0-5.2-5.2 5.2" />
      </svg>
    );
  }

  if (kind === "information") {
    return (
      <svg {...shared} {...props}>
        <circle cx="10" cy="10" r="7.5" />
        <path d="M10 9v4.4M10 6.4v.1" />
      </svg>
    );
  }

  return (
    <svg {...shared} {...props}>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M6.8 10h6.4" />
    </svg>
  );
}
