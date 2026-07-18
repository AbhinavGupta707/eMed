/** @jsxRuntime automatic */
/** @jsxImportSource react */

"use client";

import { VoiceSessionContextSchema, type VoiceSessionContext } from "@homerounds/contracts/voice";
import { useId, useMemo } from "react";

import styles from "./voice-round.module.css";

export type HistoryPurposeCardProps = Readonly<{
  context: VoiceSessionContext;
}>;

export function HistoryPurposeCard({ context: input }: HistoryPurposeCardProps) {
  const context = useMemo(() => VoiceSessionContextSchema.parse(input), [input]);
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className={styles.historyCard}>
      <div className={styles.headingRow}>
        <div>
          <p className={styles.eyebrow}>Context for this check-in</p>
          <h2 id={headingId}>What I already know</h2>
        </div>
        <span className={styles.syntheticBadge}>Short saved summary</span>
      </div>
      <dl className={styles.contextList}>
        <div>
          <dt>Your name</dt>
          <dd>{context.patientAlias}</dd>
        </div>
        <div>
          <dt>Today’s check-in</dt>
          <dd>{context.roundPurpose}</dd>
          <dd className={styles.sourceLabel}>From your check-in invitation</dd>
        </div>
        <div>
          <dt>Recent context</dt>
          <dd>{context.historySummary}</dd>
          <dd className={styles.sourceLabel}>From your short saved profile</dd>
        </div>
      </dl>
      <p className={styles.boundaryNote}>
        This short summary helps keep the conversation focused. It is not a diagnosis or a complete
        record, and you can correct anything during review.
      </p>
    </section>
  );
}
