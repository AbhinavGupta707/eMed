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
          <p className={styles.eyebrow}>Synthetic round context</p>
          <h2 id={headingId}>History and purpose</h2>
        </div>
        <span className={styles.syntheticBadge}>Synthetic data only</span>
      </div>
      <dl className={styles.contextList}>
        <div>
          <dt>Patient alias</dt>
          <dd>{context.patientAlias}</dd>
        </div>
        <div>
          <dt>Round purpose</dt>
          <dd>{context.roundPurpose}</dd>
          <dd className={styles.sourceLabel}>Source: invited HomeRounds round</dd>
        </div>
        <div>
          <dt>Relevant history</dt>
          <dd>{context.historySummary}</dd>
          <dd className={styles.sourceLabel}>Source: bounded synthetic history summary</dd>
        </div>
      </dl>
      <p className={styles.boundaryNote}>
        Only this short synthetic context is available to the voice experience. It is not a
        diagnosis or a complete record.
      </p>
    </section>
  );
}
