/** @jsxRuntime automatic */
/** @jsxImportSource react */

"use client";

import type { ReactNode } from "react";

import { taskContent } from "./model";
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

export function CompanionShell() {
  const { connection, snapshot, retryConnection, advance, busy } = useCompanionSession();

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
          </section>
        );
        break;
      case "in_progress":
        content = (
          <section className={styles.card} aria-labelledby="progress-title">
            <p className={styles.eyebrow}>Check in progress</p>
            <h1 id="progress-title">Keep this page open</h1>
            <div
              className={styles.progress}
              role="progressbar"
              aria-label={copy.title}
              aria-valuetext="In progress"
            >
              <span />
            </div>
            <p>Only the result is sent. Camera and microphone recordings are not kept.</p>
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
        content = (
          <section className={styles.card} aria-labelledby="completed-title">
            <p className={styles.eyebrow}>Phone step complete</p>
            <h1 id="completed-title">Sent securely</h1>
            <p>Your result is waiting for HomeRounds on your computer.</p>
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
