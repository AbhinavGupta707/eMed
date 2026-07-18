/** @jsxRuntime automatic */
/** @jsxImportSource react */

"use client";

import type { CompanionPhoneSnapshot } from "@homerounds/companion";
import type { ReactNode } from "react";

import {
  SelectedCompanionStation,
  defaultCompanionStationFactories,
  type CompanionStationFactories
} from "./companion-stations";
import { taskContent } from "./model";
import { createNonMeasurementResult } from "./result-model";
import styles from "./companion-shell.module.css";
import { useCompanionSession } from "./use-companion-session";

function StatusMark({ children }: { children: ReactNode }) {
  return (
    <p className={styles.status} role="status" aria-live="polite">
      <span aria-hidden="true">●</span>
      {children}
    </p>
  );
}

export type CompanionShellProps = Readonly<{
  factories?: CompanionStationFactories;
  createId?: () => string;
  now?: () => string;
}>;

function defaultId(): string {
  return globalThis.crypto.randomUUID();
}

function defaultNow(): string {
  return new Date().toISOString();
}

function completionCopy(snapshot: CompanionPhoneSnapshot): {
  eyebrow: string;
  heading: string;
  body: string;
} {
  switch (snapshot.lastResult?.outcome) {
    case "derived_candidate":
      return {
        eyebrow: "Phone step complete",
        heading: "Sent for safety checks",
        body: "The derived result is waiting for deterministic quality and workflow validation."
      };
    case "quality_rejected":
      return {
        eyebrow: "Phone step complete",
        heading: "No reading was accepted",
        body: "The quality check rejected the capture, so no numeric measurement was sent."
      };
    case "unavailable":
      return {
        eyebrow: "Phone step complete",
        heading: "Check recorded as unavailable",
        body: "No numeric measurement was sent. Your computer will show the supported next step."
      };
    case "declined":
      return {
        eyebrow: "Choice saved",
        heading: "Optional check skipped",
        body: "No capture or result was retained. Your computer will continue safely."
      };
    case undefined:
      return {
        eyebrow: "Phone step complete",
        heading: "Handoff received",
        body: "Your computer is checking the saved step."
      };
  }
}

export function CompanionShell({
  factories = defaultCompanionStationFactories,
  createId = defaultId,
  now = defaultNow
}: CompanionShellProps = {}) {
  const { connection, snapshot, retryConnection, advance, submitResult, busy } =
    useCompanionSession();
  const dependencies = { createId, now };

  function declineCurrentTask(activeSnapshot: CompanionPhoneSnapshot): void {
    void submitResult(
      createNonMeasurementResult(activeSnapshot, "declined", "patient_declined", dependencies)
    );
  }

  let content: ReactNode;
  if (connection === "connecting") {
    content = (
      <section className={styles.card} aria-labelledby="connecting-title">
        <p className={styles.eyebrow}>Secure phone check</p>
        <h1 id="connecting-title">Connecting your phone</h1>
        <StatusMark>Checking your saved handoff…</StatusMark>
      </section>
    );
  } else if (connection === "resuming") {
    content = (
      <section className={styles.card} aria-labelledby="resuming-title">
        <p className={styles.eyebrow}>Welcome back</p>
        <h1 id="resuming-title">Restoring your saved step</h1>
        <StatusMark>Your completed progress is being checked.</StatusMark>
      </section>
    );
  } else if (connection === "network_recovery") {
    content = (
      <section className={styles.card} aria-labelledby="network-title">
        <p className={styles.eyebrow}>Connection paused</p>
        <h1 id="network-title">Your progress is still here</h1>
        <p>Keep this page open and try the secure connection again.</p>
        <button className={styles.primary} type="button" onClick={retryConnection}>
          Try connection again
        </button>
      </section>
    );
  } else if (connection === "expired" || !snapshot || snapshot.reissueRequired) {
    content = (
      <section className={styles.card} aria-labelledby="expired-title">
        <p className={styles.eyebrow}>New link needed</p>
        <h1 id="expired-title">This phone link has expired</h1>
        <p>Return to HomeRounds on your computer to show a new code.</p>
        <StatusMark>No result was sent from this link.</StatusMark>
      </section>
    );
  } else {
    const copy = taskContent(snapshot.task.kind);
    switch (snapshot.taskPhase) {
      case "ready":
        content = (
          <section className={styles.card} aria-labelledby="task-title">
            <p className={styles.eyebrow}>Ready on your phone</p>
            <h1 id="task-title">{copy.title}</h1>
            <p>{copy.purpose}</p>
            <button
              className={styles.primary}
              type="button"
              onClick={() => void advance()}
              disabled={busy}
            >
              Continue
            </button>
            <button
              className={styles.secondary}
              type="button"
              onClick={() => declineCurrentTask(snapshot)}
              disabled={busy}
            >
              Not now
            </button>
            <StatusMark>Connected securely to your computer</StatusMark>
          </section>
        );
        break;
      case "permission":
        content = (
          <section className={styles.card} aria-labelledby="permission-title">
            <p className={styles.eyebrow}>Before we begin</p>
            <h1 id="permission-title">You stay in control</h1>
            <p>{copy.permission}</p>
            <p className={styles.privacy}>
              You can stop at any time. No recording or image is saved.
            </p>
            <button
              className={styles.primary}
              type="button"
              onClick={() => void advance()}
              disabled={busy}
            >
              I understand and want to continue
            </button>
            <button
              className={styles.secondary}
              type="button"
              onClick={() => declineCurrentTask(snapshot)}
              disabled={busy}
            >
              Decline this optional check
            </button>
          </section>
        );
        break;
      case "guidance":
        content = (
          <section className={styles.card} aria-labelledby="guidance-title">
            <p className={styles.eyebrow}>One small step</p>
            <h1 id="guidance-title">{copy.title}</h1>
            <p>{copy.guidance}</p>
            <button
              className={styles.primary}
              type="button"
              onClick={() => void advance()}
              disabled={busy}
            >
              I’m ready
            </button>
            <button
              className={styles.secondary}
              type="button"
              onClick={() => declineCurrentTask(snapshot)}
              disabled={busy}
            >
              Skip this check
            </button>
          </section>
        );
        break;
      case "in_progress":
        content = (
          <section className={`${styles.card} ${styles.stationCard}`} aria-label={copy.title}>
            <SelectedCompanionStation
              dependencies={dependencies}
              factories={factories}
              snapshot={snapshot}
              submitResult={submitResult}
            />
          </section>
        );
        break;
      case "retry":
        content = (
          <section className={styles.card} aria-labelledby="retry-title">
            <p className={styles.eyebrow}>No reading was accepted</p>
            <h1 id="retry-title">Let’s try once more</h1>
            <p>{copy.guidance}</p>
            <button
              className={styles.primary}
              type="button"
              onClick={() => void advance()}
              disabled={busy}
            >
              Try again
            </button>
          </section>
        );
        break;
      case "unavailable":
        content = (
          <section className={styles.card} aria-labelledby="unavailable-title">
            <p className={styles.eyebrow}>No result was sent</p>
            <h1 id="unavailable-title">This check isn’t available here</h1>
            <p>Return to your computer to choose the supported next step.</p>
          </section>
        );
        break;
      case "completed":
        const complete = completionCopy(snapshot);
        content = (
          <section className={styles.card} aria-labelledby="completed-title">
            <p className={styles.eyebrow}>{complete.eyebrow}</p>
            <h1 id="completed-title">{complete.heading}</h1>
            <p>{complete.body}</p>
            <StatusMark>Waiting for your computer</StatusMark>
          </section>
        );
        break;
      case "desktop_acknowledged":
        content = (
          <section className={styles.card} aria-labelledby="acknowledged-title">
            <p className={styles.eyebrow}>All done here</p>
            <h1 id="acknowledged-title">Your computer received it</h1>
            <p>You can return to HomeRounds on your computer.</p>
            <StatusMark>Secure handoff complete</StatusMark>
          </section>
        );
        break;
    }
  }

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.wordmark}>HomeRounds</span>
      </header>
      <div className={styles.content}>{content}</div>
      <footer className={styles.disclosure}>Sample profile · Not medical care</footer>
    </main>
  );
}
