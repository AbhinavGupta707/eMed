/** @jsxRuntime automatic */
/** @jsxImportSource react */

"use client";

import type {
  PatientReport,
  VoiceAgentReportField,
  VoiceAgentReportProposal
} from "@homerounds/contracts";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

import {
  VoiceProposalReviewController,
  type ProposalReviewField
} from "./proposal-review-controller";
import styles from "./voice-round.module.css";

type FieldOption = Readonly<{ value: string; label: string }>;
type ReviewFieldDefinition = Readonly<{
  field: VoiceAgentReportField;
  label: string;
  safetyAnswer: boolean;
  options: readonly FieldOption[];
}>;

const REVIEW_FIELDS = [
  {
    field: "weakness",
    label: "Weakness",
    safetyAnswer: false,
    options: [
      { value: "absent", label: "Absent" },
      { value: "mild", label: "Mild" },
      { value: "moderate", label: "Moderate" },
      { value: "severe", label: "Severe" },
      { value: "unknown", label: "Keep unknown" }
    ]
  },
  {
    field: "palpitations",
    label: "Palpitations",
    safetyAnswer: false,
    options: [
      { value: "absent", label: "Absent" },
      { value: "intermittent", label: "Intermittent" },
      { value: "current", label: "Current" },
      { value: "unknown", label: "Keep unknown" }
    ]
  },
  {
    field: "chest_pain",
    label: "Chest pain now",
    safetyAnswer: true,
    options: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
      { value: "unsure", label: "Keep unsure" }
    ]
  },
  {
    field: "severe_breathlessness",
    label: "Severe breathlessness now",
    safetyAnswer: true,
    options: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
      { value: "unsure", label: "Keep unsure" }
    ]
  },
  {
    field: "fainted",
    label: "Fainted",
    safetyAnswer: true,
    options: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
      { value: "unsure", label: "Keep unsure" }
    ]
  }
] as const satisfies readonly ReviewFieldDefinition[];

const FIELD_LABELS: Readonly<Record<ProposalReviewField, string>> = {
  weakness: "Weakness",
  palpitations: "Palpitations",
  chest_pain: "Chest pain now",
  severe_breathlessness: "Severe breathlessness now",
  fainted: "Fainted",
  note: "Anything else"
};

function proposedValue(proposal: VoiceAgentReportProposal, field: VoiceAgentReportField): string {
  switch (field) {
    case "weakness":
      return proposal.weakness;
    case "palpitations":
      return proposal.palpitations;
    case "chest_pain":
      return proposal.redFlags.chestPain;
    case "severe_breathlessness":
      return proposal.redFlags.severeBreathlessness;
    case "fainted":
      return proposal.redFlags.fainted;
  }
}

function hasSafetyAttention(proposal: VoiceAgentReportProposal): boolean {
  return Object.values(proposal.redFlags).some((answer) => answer !== "no");
}

function proposalSessionKey(proposal: VoiceAgentReportProposal): string {
  return [
    proposal.contractVersion,
    proposal.weakness,
    proposal.palpitations,
    proposal.redFlags.chestPain,
    proposal.redFlags.severeBreathlessness,
    proposal.redFlags.fainted,
    proposal.note ?? "",
    proposal.unresolvedFields.join(",")
  ].join(":");
}

export type VoiceAgentProposalReviewProps = Readonly<{
  proposal: VoiceAgentReportProposal;
  roundId: string;
  onConfirmed: (report: PatientReport) => Promise<void>;
  createId?: () => string;
  now?: () => string;
}>;

export function VoiceAgentProposalReview(props: VoiceAgentProposalReviewProps) {
  return (
    <VoiceAgentProposalReviewSession
      {...props}
      key={`${props.roundId}:${proposalSessionKey(props.proposal)}`}
    />
  );
}

function VoiceAgentProposalReviewSession(props: VoiceAgentProposalReviewProps) {
  const baseId = useId();
  const statusRef = useRef<HTMLParagraphElement>(null);
  const [controller] = useState(() => new VoiceProposalReviewController(props));
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot
  );
  const unresolved = new Set(snapshot.proposal.unresolvedFields);

  useEffect(() => {
    controller.setOnConfirmed(props.onConfirmed);
  }, [controller, props.onConfirmed]);

  useEffect(() => {
    if (snapshot.focusToken === 0) return;
    if (snapshot.status === "review_required" && snapshot.firstIncompleteField !== null) {
      document.getElementById(`${baseId}-${snapshot.firstIncompleteField}`)?.focus();
      return;
    }
    statusRef.current?.focus();
  }, [baseId, snapshot.firstIncompleteField, snapshot.focusToken, snapshot.status]);

  return (
    <section aria-labelledby={`${baseId}-heading`} className={styles.reviewPanel}>
      <div className={styles.headingRow}>
        <div>
          <p className={styles.eyebrow}>Your report draft</p>
          <h2 id={`${baseId}-heading`}>Let’s make sure I understood.</h2>
        </div>
        <span className={styles.draftBadge}>Not submitted</span>
      </div>

      <p className={styles.boundaryNote}>
        Here’s what I heard. Select an answer for every field and confirm the report yourself before
        anything continues.
      </p>

      {hasSafetyAttention(snapshot.proposal) ? (
        <div className={styles.safetyReview} role="note">
          <strong>Safety answers need your attention.</strong> A “yes” or “unsure” answer stays
          visible and is never changed to “no”. This screen does not diagnose or set urgency.
        </div>
      ) : null}

      <div className={styles.reviewGrid}>
        {REVIEW_FIELDS.map((definition) => {
          const value = snapshot.answers[definition.field] ?? "";
          const isUnresolved = unresolved.has(definition.field);
          return (
            <div className={styles.reviewField} key={definition.field}>
              <div className={styles.fieldHeading}>
                <label htmlFor={`${baseId}-${definition.field}`}>{definition.label}</label>
                {definition.safetyAnswer ? (
                  <span className={styles.safetyLabel}>Required safety answer</span>
                ) : null}
                {isUnresolved ? (
                  <span className={styles.unresolvedLabel}>Not yet clear</span>
                ) : null}
              </div>
              <p>
                Heard as: <strong>{proposedValue(snapshot.proposal, definition.field)}</strong>
              </p>
              <select
                disabled={snapshot.status === "confirming" || snapshot.status === "confirmed"}
                id={`${baseId}-${definition.field}`}
                onChange={(event) => controller.reviewField(definition.field, event.target.value)}
                value={value}
              >
                <option disabled value="">
                  Select after reviewing
                </option>
                {definition.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          );
        })}

        <div className={styles.reviewField}>
          <div className={styles.fieldHeading}>
            <label htmlFor={`${baseId}-note`}>Anything else</label>
          </div>
          <p>
            Heard as: <strong>{snapshot.proposal.note ?? "Not sure"}</strong>
          </p>
          <select
            disabled={snapshot.status === "confirming" || snapshot.status === "confirmed"}
            id={`${baseId}-note`}
            onChange={(event) => controller.reviewNote(event.target.value)}
            value={snapshot.answers.note ?? ""}
          >
            <option disabled value="">
              Select after reviewing
            </option>
            <option value="keep">
              {snapshot.proposal.note === null ? "Confirm no note" : "Keep proposed note"}
            </option>
            <option value="remove">Leave note empty</option>
          </select>
        </div>
      </div>

      <label className={styles.confirmationRow}>
        <input
          checked={snapshot.explicitConfirmation}
          disabled={snapshot.status === "confirming" || snapshot.status === "confirmed"}
          onChange={(event) => controller.setExplicitConfirmation(event.target.checked)}
          type="checkbox"
        />
        <span>
          I reviewed every field and confirm these are my answers. Unknown and unsure selections may
          remain unresolved for review.
        </span>
      </label>

      <button
        className={styles.primaryButton}
        disabled={snapshot.status === "confirming" || snapshot.status === "confirmed"}
        onClick={() => void controller.confirm()}
        type="button"
      >
        {snapshot.status === "confirming"
          ? "Confirming reviewed report…"
          : "Confirm reviewed report"}
      </button>

      <p
        aria-live="polite"
        className={styles.status}
        data-tone={
          snapshot.status === "error"
            ? "error"
            : snapshot.status === "confirmed"
              ? "success"
              : "information"
        }
        ref={statusRef}
        role={snapshot.status === "error" ? "alert" : "status"}
        tabIndex={-1}
      >
        {snapshot.announcement}
      </p>

      <p className={styles.reviewSummary}>
        Review progress: {Object.values(snapshot.answers).filter((value) => value !== null).length}{" "}
        of 6 fields. Your conversation is not shown or stored here.
      </p>
      {snapshot.firstIncompleteField !== null ? (
        <p className={styles.visuallyHidden} aria-live="polite">
          Next incomplete field: {FIELD_LABELS[snapshot.firstIncompleteField]}.
        </p>
      ) : null}
    </section>
  );
}
