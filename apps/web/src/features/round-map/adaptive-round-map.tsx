/** @jsxRuntime automatic */
/** @jsxImportSource react */

"use client";

import { Banner, Button, Spinner, StatusChip } from "@homerounds/ui";
import { useMemo } from "react";

import styles from "./adaptive-round-map.module.css";
import {
  RoundMapExperienceSchema,
  roundMapSelectionPresentation,
  roundMapStatusDescription,
  roundMapStatusLabel,
  roundMapTaskDescription,
  type RoundMapExperience,
  type RoundMapModule,
  type RoundMapPresentationKind
} from "./model";

export type AdaptiveRoundMapProps = Readonly<{
  experience: RoundMapExperience;
  onRetry?: () => void;
  onContinue?: () => void;
}>;

function presentationChip(kind: RoundMapPresentationKind): {
  label: string;
  variant: "complete" | "information" | "attention" | "neutral";
} {
  switch (kind) {
    case "accepted":
      return { label: "Next step ready", variant: "complete" };
    case "loading":
      return { label: "Choosing the next step", variant: "information" };
    case "retrying":
      return { label: "Checking again", variant: "information" };
    case "unavailable":
      return { label: "Usual route available", variant: "attention" };
    case "abstained":
      return { label: "Usual route continues", variant: "neutral" };
    case "rejected":
    case "stale":
      return { label: "Saved route protected", variant: "attention" };
    case "safety_fallback":
      return { label: "Safety check in control", variant: "attention" };
    case "deterministic":
      return { label: "Next step ready", variant: "neutral" };
  }
}

function sourceLabel(
  source: ReturnType<typeof roundMapSelectionPresentation>["rationaleSource"]
): string {
  switch (source) {
    case "ai_checked":
      return "What this can clarify";
    case "deterministic_fallback":
      return "Why the usual next step continues";
    case "deterministic_template":
      return "Why this step is next";
  }
}

function focusModule(experience: RoundMapExperience): RoundMapModule | undefined {
  const active = experience.modules.find(({ status }) => status === "current");
  if (active) return active;

  const selected = experience.modules.find(({ status }) => status === "selected");
  if (selected) return selected;

  if (
    experience.selection.status === "settled" &&
    experience.selection.outcome.status === "accepted" &&
    experience.selection.outcome.envelope.decision.decision === "select"
  ) {
    const id = experience.selection.outcome.envelope.decision.candidateModuleId;
    const recommended = experience.modules.find(({ candidate }) => candidate.id === id);
    if (recommended) return recommended;
  }

  return (
    experience.modules.find(({ status }) => status === "next") ??
    [...experience.modules]
      .reverse()
      .find(({ status }) => status === "completed" || status === "completed_without_measurement")
  );
}

function canContinue(roundTask: RoundMapModule | undefined): boolean {
  return (
    roundTask?.status === "current" ||
    roundTask?.status === "selected" ||
    roundTask?.status === "next"
  );
}

export function AdaptiveRoundMap({
  experience: input,
  onRetry,
  onContinue
}: AdaptiveRoundMapProps) {
  const experience = useMemo(() => RoundMapExperienceSchema.parse(input), [input]);
  const presentation = useMemo(() => roundMapSelectionPresentation(experience), [experience]);
  const roundTask = focusModule(experience);
  const chip = presentationChip(presentation.kind);
  const completedCount = experience.modules.filter(
    ({ status }) => status === "completed" || status === "completed_without_measurement"
  ).length;

  return (
    <section aria-labelledby="round-recommendation-title" className={styles.roundMap}>
      <div className={styles.headingRow}>
        <div>
          <p className={styles.eyebrow}>Your next step</p>
          <h1 className={styles.heading} id="round-recommendation-title">
            {presentation.title}
          </h1>
        </div>
        <StatusChip variant={chip.variant}>{chip.label}</StatusChip>
      </div>

      <p className={styles.intro}>{presentation.description}</p>

      {experience.resumedConfirmedProgress ? (
        <Banner title="Your confirmed progress is still here" variant="success">
          <p>
            Completed answers remain saved. Unfinished voice or camera activity was not restored.
          </p>
        </Banner>
      ) : null}

      {roundTask ? (
        <article className={styles.selectedTask}>
          <div className={styles.selectedTaskHeader}>
            <span aria-hidden="true" className={styles.taskNumber}>
              {roundTask.status === "completed" ||
              roundTask.status === "completed_without_measurement"
                ? "✓"
                : "1"}
            </span>
            <div>
              <p className={styles.taskStatus}>{roundMapStatusLabel(roundTask.status)}</p>
              <h2>{roundTask.candidate.label}</h2>
            </div>
          </div>
          <p className={styles.taskDescription}>{roundMapStatusDescription(roundTask)}</p>
          <dl className={styles.taskFacts}>
            <div>
              <dt>What it adds</dt>
              <dd>{roundMapTaskDescription(roundTask.candidate)}</dd>
            </div>
            <div>
              <dt>About how long</dt>
              <dd>{roundTask.candidate.estimatedBurdenSeconds} seconds</dd>
            </div>
          </dl>
        </article>
      ) : null}

      <section aria-labelledby="why-this-step-title" className={styles.rationalePanel}>
        <p className={styles.rationaleLabel}>{sourceLabel(presentation.rationaleSource)}</p>
        <h2 id="why-this-step-title">The smallest useful check right now</h2>
        <p className={styles.rationale}>{presentation.rationale}</p>
        {presentation.missingInformation.length > 0 ? (
          <div className={styles.missingInformation}>
            <strong>Still not clear</strong>
            <ul>
              {presentation.missingInformation.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <div className={styles.actions}>
        {presentation.kind === "loading" || presentation.kind === "retrying" ? (
          <span className={styles.loadingStatus}>
            <Spinner label="Checking the next step" /> Checking your saved answers…
          </span>
        ) : null}
        {presentation.retryable && onRetry ? (
          <Button onClick={onRetry} variant="secondary">
            Check the recommendation again
          </Button>
        ) : null}
        {canContinue(roundTask) && onContinue ? (
          <Button onClick={onContinue}>Continue to this check</Button>
        ) : null}
      </div>

      <p className={styles.progressNote}>
        {completedCount} confirmed step{completedCount === 1 ? "" : "s"} kept · Only the selected
        task is shown
      </p>
    </section>
  );
}
