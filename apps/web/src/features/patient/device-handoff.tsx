/** @jsxRuntime automatic */
/** @jsxImportSource react */

import { Button, StatusIcon } from "@homerounds/ui";
import type { ReactNode } from "react";

import styles from "./patient-round.module.css";

export type DeviceHandoffStatus =
  "ready" | "connecting" | "connected" | "waiting" | "result" | "no_result" | "unavailable";

const statusPresentation: Readonly<
  Record<DeviceHandoffStatus, { label: string; icon: "success" | "information" | "warning" }>
> = {
  ready: { label: "Ready to pair", icon: "information" },
  connecting: { label: "Connecting your phone", icon: "information" },
  connected: { label: "Phone connected", icon: "success" },
  waiting: { label: "Waiting for the selected check", icon: "information" },
  result: { label: "Reading received", icon: "success" },
  no_result: { label: "No reading was accepted", icon: "warning" },
  unavailable: { label: "Phone handoff unavailable", icon: "warning" }
};

export type DeviceHandoffProps = Readonly<{
  taskTitle: string;
  rationale: string;
  status: DeviceHandoffStatus;
  statusDetail: string;
  pairingVisual?: ReactNode;
  readableCode?: string;
  result?: ReactNode;
  phoneActionLabel?: string;
  onUsePhone?: () => void;
  computerSupported: boolean;
  onUseComputer?: () => void;
}>;

export function DeviceHandoff({
  taskTitle,
  rationale,
  status,
  statusDetail,
  pairingVisual,
  readableCode,
  result,
  phoneActionLabel = "Use my phone",
  onUsePhone,
  computerSupported,
  onUseComputer
}: DeviceHandoffProps) {
  const presentation = statusPresentation[status];

  return (
    <section aria-labelledby="device-handoff-title" className={styles.handoffPanel}>
      <div className={styles.handoffCopy}>
        <p className={styles.screenEyebrow}>Your next step</p>
        <h1 id="device-handoff-title">{taskTitle}</h1>
        <p>{rationale}</p>
      </div>

      <div className={styles.handoffCard}>
        {pairingVisual ? <div className={styles.pairingVisual}>{pairingVisual}</div> : null}
        <div aria-live="polite" className={styles.handoffStatus} role="status">
          <StatusIcon kind={presentation.icon} />
          <div>
            <strong>{presentation.label}</strong>
            <p>{statusDetail}</p>
          </div>
        </div>
        {readableCode ? (
          <p className={styles.readableCode}>
            Pairing code <strong>{readableCode}</strong>
          </p>
        ) : null}
        {result ? <div className={styles.handoffResult}>{result}</div> : null}

        <div className={styles.handoffActions}>
          {onUsePhone ? <Button onClick={onUsePhone}>{phoneActionLabel}</Button> : null}
          {computerSupported && onUseComputer ? (
            <Button onClick={onUseComputer} variant={onUsePhone ? "secondary" : "primary"}>
              Continue on this computer
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
