/** @jsxRuntime automatic */
/** @jsxImportSource react */

"use client";

import { Banner, Spinner, StatusChip } from "@homerounds/ui";
import { useId, useMemo, useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";

import styles from "./adaptive-round-map.module.css";
import {
  RoundMapExperienceSchema,
  roundMapSelectionPresentation,
  roundMapStatusDescription,
  roundMapStatusLabel,
  type RoundMapExperience,
  type RoundMapModule,
  type RoundMapModuleStatus,
  type RoundMapPresentationKind
} from "./model";

export type AdaptiveRoundMapProps = Readonly<{
  experience: RoundMapExperience;
  onRetry?: () => void;
}>;

const statusSymbols: Readonly<Record<RoundMapModuleStatus, string>> = {
  completed: "✓",
  current: "●",
  selected: "→",
  skipped: "—",
  unavailable: "×",
  next: "+"
};

function presentationChip(kind: RoundMapPresentationKind): {
  label: string;
  variant: "complete" | "information" | "attention" | "action" | "neutral";
} {
  switch (kind) {
    case "accepted":
      return { label: "Eligible selection accepted", variant: "complete" };
    case "loading":
      return { label: "Selection loading", variant: "information" };
    case "retrying":
      return { label: "Selection retrying", variant: "information" };
    case "unavailable":
      return { label: "AI unavailable", variant: "attention" };
    case "abstained":
      return { label: "AI abstained", variant: "neutral" };
    case "rejected":
      return { label: "Suggestion rejected", variant: "attention" };
    case "stale":
      return { label: "Stale result rejected", variant: "attention" };
    case "safety_fallback":
      return { label: "Safety gate in control", variant: "attention" };
    case "deterministic":
      return { label: "Deterministic route", variant: "neutral" };
  }
}

function sourceLabel(
  source: ReturnType<typeof roundMapSelectionPresentation>["rationaleSource"]
): string {
  switch (source) {
    case "ai_checked":
      return "Why this was selected";
    case "deterministic_fallback":
      return "Why the deterministic fallback continues";
    case "deterministic_template":
      return "Why this module is next";
  }
}

function moduleLiveAnnouncement(module: RoundMapModule): string {
  return `${module.candidate.label}. ${roundMapStatusLabel(module.status)}. ${roundMapStatusDescription(module)}`;
}

export function AdaptiveRoundMap({ experience: input, onRetry }: AdaptiveRoundMapProps) {
  const experience = useMemo(() => RoundMapExperienceSchema.parse(input), [input]);
  const presentation = useMemo(() => roundMapSelectionPresentation(experience), [experience]);
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
  const [interactionAnnouncement, setInteractionAnnouncement] = useState("");
  const detailId = useId();
  const activeModule = experience.modules.find(({ candidate }) => candidate.id === activeModuleId);
  const chip = presentationChip(presentation.kind);

  function openModule(module: RoundMapModule): void {
    setActiveModuleId(module.candidate.id);
    setInteractionAnnouncement(moduleLiveAnnouncement(module));
  }

  function closeModule(): void {
    const trigger = activeModuleId
      ? document.getElementById(`${detailId}-trigger-${activeModuleId}`)
      : null;
    setActiveModuleId(null);
    setInteractionAnnouncement("Module details closed. Focus returned to the Round Map.");
    window.requestAnimationFrame(() => trigger?.focus());
  }

  const selectionAnnouncement = `${presentation.title}. ${presentation.description}`;
  return jsxs("section", {
    "aria-labelledby": `${detailId}-title`,
    className: styles.roundMap,
    children: [
      jsxs("div", {
        className: styles.headingRow,
        children: [
          jsxs("div", {
            children: [
              jsx("p", { className: styles.eyebrow, children: "Adaptive evidence route" }),
              jsx("h2", {
                className: styles.heading,
                id: `${detailId}-title`,
                children: "Round Map"
              })
            ]
          }),
          jsx(StatusChip, { variant: chip.variant, children: chip.label })
        ]
      }),
      jsx("p", {
        className: styles.intro,
        children:
          "Your confirmed steps stay visible. AI may propose one eligible next module, but deterministic safety, quality, and protocol checks remain in control."
      }),
      experience.syntheticStoryLabel
        ? jsx(StatusChip, {
            variant: "information",
            children: experience.syntheticStoryLabel
          })
        : null,
      experience.resumedConfirmedProgress
        ? jsx(Banner, {
            title: "Saved round resumed with confirmed progress",
            variant: "success",
            children: jsx("p", {
              children:
                "Completed modules remain confirmed. Ephemeral camera, voice, and unfinished selection data were not restored."
            })
          })
        : null,
      jsx("ol", {
        "aria-label": "Evidence modules",
        className: styles.modules,
        children: experience.modules.map((module) => {
          const expanded = activeModuleId === module.candidate.id;
          return jsx(
            "li",
            {
              children: jsxs("button", {
                "aria-controls": expanded ? detailId : undefined,
                "aria-expanded": expanded,
                className: styles.moduleButton,
                id: `${detailId}-trigger-${module.candidate.id}`,
                onClick: () => openModule(module),
                type: "button",
                children: [
                  jsxs("span", {
                    className: styles.moduleStatus,
                    children: [
                      jsx("span", {
                        "aria-hidden": "true",
                        className: styles.statusSymbol,
                        children: statusSymbols[module.status]
                      }),
                      roundMapStatusLabel(module.status)
                    ]
                  }),
                  jsx("span", {
                    className: styles.moduleLabel,
                    children: module.candidate.label
                  }),
                  jsx("span", {
                    className: styles.moduleDescription,
                    children: roundMapStatusDescription(module)
                  })
                ]
              })
            },
            module.candidate.id
          );
        })
      }),
      activeModule
        ? jsxs("section", {
            "aria-labelledby": `${detailId}-module-title`,
            className: styles.detailPanel,
            id: detailId,
            children: [
              jsxs("div", {
                className: styles.detailHeader,
                children: [
                  jsxs("div", {
                    children: [
                      jsx("p", {
                        className: styles.eyebrow,
                        children: roundMapStatusLabel(activeModule.status)
                      }),
                      jsx("h3", {
                        className: styles.selectionTitle,
                        id: `${detailId}-module-title`,
                        children: activeModule.candidate.label
                      })
                    ]
                  }),
                  jsx("button", {
                    className: styles.closeButton,
                    onClick: closeModule,
                    type: "button",
                    children: "Close details"
                  })
                ]
              }),
              jsx("p", {
                className: styles.moduleDetail,
                children: activeModule.candidate.description
              }),
              jsxs("dl", {
                className: styles.uncertaintyList,
                children: [
                  jsxs("div", {
                    children: [
                      jsx("dt", { children: "Current status" }),
                      jsx("dd", { children: roundMapStatusLabel(activeModule.status) })
                    ]
                  }),
                  jsxs("div", {
                    children: [
                      jsx("dt", { children: "Approximate time" }),
                      jsxs("dd", {
                        children: [activeModule.candidate.estimatedBurdenSeconds, " seconds"]
                      })
                    ]
                  })
                ]
              })
            ]
          })
        : null,
      jsxs("section", {
        "aria-labelledby": `${detailId}-selection-title`,
        className: styles.selectionPanel,
        children: [
          jsxs("div", {
            className: styles.selectionHeader,
            children: [
              jsxs("div", {
                children: [
                  jsx("p", { className: styles.eyebrow, children: "Selection status" }),
                  jsx("h3", {
                    className: styles.selectionTitle,
                    id: `${detailId}-selection-title`,
                    children: presentation.title
                  })
                ]
              }),
              presentation.kind === "loading" || presentation.kind === "retrying"
                ? jsx(Spinner, {
                    label:
                      presentation.kind === "loading" ? "Selecting module" : "Retrying selection"
                  })
                : null
            ]
          }),
          jsx("p", {
            className: styles.selectionDescription,
            children: presentation.description
          }),
          jsxs("div", {
            className: styles.rationaleBlock,
            children: [
              jsx("span", {
                className: styles.rationaleLabel,
                children: sourceLabel(presentation.rationaleSource)
              }),
              jsx("p", { className: styles.rationale, children: presentation.rationale })
            ]
          }),
          jsxs("dl", {
            className: styles.uncertaintyList,
            children: [
              jsxs("div", {
                children: [
                  jsx("dt", { children: "AI uncertainty" }),
                  jsx("dd", {
                    children: presentation.uncertainty
                      ? `${presentation.uncertainty[0]?.toUpperCase()}${presentation.uncertainty.slice(1)}`
                      : "Not used for this route"
                  })
                ]
              }),
              jsxs("div", {
                children: [
                  jsx("dt", { children: "Confirmed progress" }),
                  jsxs("dd", {
                    children: [
                      experience.modules.filter(({ status }) => status === "completed").length,
                      " completed module(s) preserved"
                    ]
                  })
                ]
              })
            ]
          }),
          presentation.missingInformation.length > 0
            ? jsxs("div", {
                children: [
                  jsx("p", {
                    className: styles.rationaleLabel,
                    children: "Information still missing"
                  }),
                  jsx("ul", {
                    className: styles.missingList,
                    children: presentation.missingInformation.map((item) =>
                      jsx("li", { children: item }, item)
                    )
                  })
                ]
              })
            : null,
          presentation.retryable && onRetry
            ? jsx("button", {
                className: styles.retryButton,
                onClick: onRetry,
                type: "button",
                children: "Retry selection from saved progress"
              })
            : null
        ]
      }),
      jsx("p", {
        "aria-atomic": "true",
        "aria-live": "polite",
        className: styles.liveRegion,
        role: "status",
        children: interactionAnnouncement || selectionAnnouncement
      })
    ]
  });
}
