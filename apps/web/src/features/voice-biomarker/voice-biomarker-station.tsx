/** @jsxRuntime automatic */
/** @jsxImportSource react */

"use client";

import type { VoiceBiomarkerFact, VoiceBiomarkerProvider } from "@homerounds/contracts";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

import {
  VoiceBiomarkerStationController,
  voiceQualityReasonText,
  type VoiceBiomarkerTimer
} from "./controller";
import styles from "./voice-biomarker.module.css";

export type VoiceBiomarkerStationProps = Readonly<{
  provider: VoiceBiomarkerProvider;
  roundId: string;
  assessmentSessionId: string;
  onCompleted: (fact: VoiceBiomarkerFact) => Promise<void>;
  onDeclined?: () => Promise<void>;
  timer?: VoiceBiomarkerTimer;
}>;

function formatSeconds(durationMs: number): string {
  return `${(durationMs / 1_000).toFixed(1)} seconds`;
}

function formatFeature(value: number | null, unit: string): string {
  return value === null ? "Not available from this capture" : `${value.toFixed(2)} ${unit}`;
}

class DeferredDisposeLifecycle {
  #generation = 0;

  begin(): number {
    this.#generation += 1;
    return this.#generation;
  }

  isCurrent(generation: number): boolean {
    return this.#generation === generation;
  }
}

export function VoiceBiomarkerStation(props: VoiceBiomarkerStationProps) {
  return (
    <VoiceBiomarkerStationSession
      {...props}
      key={`${props.roundId}:${props.assessmentSessionId}`}
    />
  );
}

function VoiceBiomarkerStationSession(props: VoiceBiomarkerStationProps) {
  const baseId = useId();
  const statusRef = useRef<HTMLParagraphElement>(null);
  const [lifecycle] = useState(() => new DeferredDisposeLifecycle());
  const [controller] = useState(() => new VoiceBiomarkerStationController(props));
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot
  );
  const isBusy = ["checking", "capturing", "saving", "declining"].includes(snapshot.phase);
  const canStart = ["ready", "retry", "failed"].includes(snapshot.phase);

  useEffect(() => {
    controller.setHandlers({
      onCompleted: props.onCompleted,
      ...(props.onDeclined ? { onDeclined: props.onDeclined } : {})
    });
  }, [controller, props.onCompleted, props.onDeclined]);

  useEffect(() => {
    const lifecycleGeneration = lifecycle.begin();
    void controller.initialize();
    return () => {
      queueMicrotask(() => {
        if (lifecycle.isCurrent(lifecycleGeneration)) controller.dispose();
      });
    };
  }, [controller, lifecycle]);

  useEffect(() => {
    if (snapshot.focusToken > 0) statusRef.current?.focus();
  }, [snapshot.focusToken]);

  return (
    <section aria-labelledby={`${baseId}-heading`} className={styles.station}>
      <div className={styles.headingRow}>
        <div>
          <p className={styles.eyebrow}>Optional local voice station</p>
          <h2 id={`${baseId}-heading`}>Sustained-vowel research signal</h2>
        </div>
        <span className={styles.researchBadge}>Research signal—not a diagnosis</span>
      </div>

      <p className={styles.boundaryNote}>
        This separate 7-second “ah” capture is optional. Local software checks voice features and
        quality. It does not listen passively to the conversation, compare against a disease
        threshold, set urgency, or choose an action.
      </p>

      <details className={styles.explanation}>
        <summary>What the derived features mean</summary>
        <p>
          The station describes pitch, pitch variation, cycle-to-cycle variation, loudness
          variation, harmonic-to-noise ratio, and phonation duration. Microphone, room noise,
          language, hydration, and technique can affect them, so they are only useful as a
          quality-gated personal research trend.
        </p>
      </details>

      <label className={styles.consentRow}>
        <input
          checked={snapshot.consent}
          disabled={isBusy || ["completed", "declined", "unavailable"].includes(snapshot.phase)}
          onChange={(event) => controller.setConsent(event.target.checked)}
          type="checkbox"
        />
        <span>
          I consent to one separate local sustained-vowel capture. Raw audio stays in memory only
          for analysis, is not uploaded, and is not included in the derived result.
        </span>
      </label>

      {snapshot.phase === "capturing" ? (
        <div className={styles.progressGroup}>
          <label htmlFor={`${baseId}-progress`}>Sustained-vowel capture progress</label>
          <progress
            id={`${baseId}-progress`}
            max={snapshot.targetDurationMs}
            value={snapshot.elapsedMs}
          />
          <p aria-live="off">
            {formatSeconds(snapshot.elapsedMs)} of {formatSeconds(snapshot.targetDurationMs)}.
            Sustain a comfortable “ah” sound.
          </p>
        </div>
      ) : null}

      {snapshot.quality !== null && snapshot.quality.status !== "pass" ? (
        <section aria-labelledby={`${baseId}-quality`} className={styles.qualityFeedback}>
          <h3 id={`${baseId}-quality`}>
            {snapshot.quality.status === "retry"
              ? "Retry the quality check"
              : "Quality check failed"}
          </h3>
          <p>No feature fact or measurement was created.</p>
          {snapshot.quality.reasons.length > 0 ? (
            <ul>
              {snapshot.quality.reasons.map((reason) => (
                <li key={reason}>{voiceQualityReasonText(reason)}</li>
              ))}
            </ul>
          ) : (
            <p>The capture did not meet the deterministic quality gate.</p>
          )}
        </section>
      ) : null}

      {snapshot.phase === "completed" && snapshot.fact !== null ? (
        <section aria-labelledby={`${baseId}-baseline`} className={styles.result}>
          <h3 id={`${baseId}-baseline`}>Baseline started</h3>
          <p>
            The first passing capture starts a personal research baseline. It does not mean stable,
            changed, healthy, or unwell.
          </p>
          <dl className={styles.featureList}>
            <div>
              <dt>Median fundamental frequency</dt>
              <dd>{formatFeature(snapshot.fact.features.medianFundamentalFrequencyHz, "Hz")}</dd>
            </div>
            <div>
              <dt>Pitch variability</dt>
              <dd>
                {formatFeature(snapshot.fact.features.pitchVariabilitySemitones, "semitones")}
              </dd>
            </div>
            <div>
              <dt>Jitter</dt>
              <dd>{formatFeature(snapshot.fact.features.jitterPercent, "%")}</dd>
            </div>
            <div>
              <dt>Shimmer</dt>
              <dd>{formatFeature(snapshot.fact.features.shimmerPercent, "%")}</dd>
            </div>
            <div>
              <dt>Harmonic-to-noise ratio</dt>
              <dd>{formatFeature(snapshot.fact.features.harmonicToNoiseRatioDb, "dB")}</dd>
            </div>
            <div>
              <dt>Phonation duration</dt>
              <dd>{formatSeconds(snapshot.fact.features.phonationDurationMs)}</dd>
            </div>
          </dl>
          <p className={styles.rawMediaNote}>Derived features only. Raw media reference: none.</p>
        </section>
      ) : null}

      <div className={styles.controls}>
        {canStart ? (
          <button
            className={styles.primaryButton}
            disabled={!snapshot.consent}
            onClick={() => void controller.startCapture()}
            type="button"
          >
            {snapshot.phase === "ready" ? "Start 7-second capture" : "Try capture again"}
          </button>
        ) : null}
        {snapshot.phase === "capturing" ? (
          <button
            className={styles.cancelButton}
            onClick={() => controller.cancelCapture()}
            type="button"
          >
            Cancel capture
          </button>
        ) : null}
        {snapshot.phase === "handoff_error" ? (
          <button
            className={styles.primaryButton}
            onClick={() => void controller.retryHandoff()}
            type="button"
          >
            Retry derived-result handoff
          </button>
        ) : null}
        {!["completed", "declined", "declining"].includes(snapshot.phase) ? (
          <button
            className={styles.secondaryButton}
            disabled={snapshot.phase === "saving"}
            onClick={() => void controller.decline()}
            type="button"
          >
            Decline optional station
          </button>
        ) : null}
      </div>

      <p
        aria-live="polite"
        className={styles.status}
        data-tone={
          ["failed", "handoff_error", "unavailable"].includes(snapshot.phase)
            ? "error"
            : snapshot.phase === "completed"
              ? "success"
              : "information"
        }
        ref={statusRef}
        role={["failed", "handoff_error"].includes(snapshot.phase) ? "alert" : "status"}
        tabIndex={-1}
      >
        {snapshot.announcement}
      </p>
    </section>
  );
}
