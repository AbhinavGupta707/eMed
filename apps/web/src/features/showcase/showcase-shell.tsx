/** @jsxRuntime automatic */
/** @jsxImportSource react */

"use client";

import type { VoiceSessionContext } from "@homerounds/contracts/voice";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { createPatientVoiceProvider } from "../patient/provider-factories";
import { useVoiceInteraction } from "../voice";
import {
  COPD_CONTEXT_EVENTS,
  COPD_EVIDENCE,
  GLP_CONTEXT_EVENTS,
  HEART_CONTEXT_EVENTS,
  HEART_EVIDENCE,
  SHOWCASE_ROUND_ID,
  type ContextEvent,
  type EvidencePassport
} from "./showcase-data";
import styles from "./showcase.module.css";

type CopdScene =
  | "context"
  | "conversation"
  | "plan"
  | "sensors"
  | "inhaler"
  | "evidence"
  | "clinician"
  | "resolution";

type HeartScene =
  | "context"
  | "conversation"
  | "plan"
  | "sensors"
  | "medication"
  | "evidence"
  | "clinician"
  | "resolution";

const HEART_SCENES: readonly HeartScene[] = [
  "context",
  "conversation",
  "plan",
  "sensors",
  "medication",
  "evidence",
  "clinician",
  "resolution"
];

const heartSceneLabels: Record<HeartScene, string> = {
  context: "Why now",
  conversation: "Conversation",
  plan: "Round Map",
  sensors: "Phone assessment",
  medication: "Medication",
  evidence: "Evidence",
  clinician: "Care team",
  resolution: "Resolved"
};

const CONSTELLATION_STARS = [
  [8, 42],
  [19, 9],
  [28, 84],
  [39, 27],
  [46, 91],
  [58, 12],
  [65, 77],
  [73, 42],
  [91, 34],
  [94, 87]
] as const;

const COPD_SCENES: readonly CopdScene[] = [
  "context",
  "conversation",
  "plan",
  "sensors",
  "inhaler",
  "evidence",
  "clinician",
  "resolution"
];

const sceneLabels: Record<CopdScene, string> = {
  context: "Why now",
  conversation: "Conversation",
  plan: "Perception plan",
  sensors: "Phone assessment",
  inhaler: "Technique",
  evidence: "Evidence",
  clinician: "Care team",
  resolution: "Resolved"
};

const voiceContext: VoiceSessionContext = {
  syntheticDataOnly: true,
  patientAlias: "Maya",
  roundPurpose:
    "Understand a recent change in breathing and choose the smallest useful home assessment.",
  historySummary:
    "Maya has a sample COPD care plan, a recent inhaler change, lower activity, two disturbed nights, and a personal respiratory and pulse baseline."
};

const heartVoiceContext: VoiceSessionContext = {
  syntheticDataOnly: true,
  patientAlias: "Maya",
  roundPurpose:
    "Understand a subtle change in breathlessness and fatigue, confirm essential safety context, and choose the smallest useful home assessment.",
  historySummary:
    "Maya has stable sample heart failure, a modest weight change below the configured alert boundary, lower activity, a recent dose-related record change, and personal pulse and respiratory baselines."
};

function ShellHeader({ scene, pack = "COPD Change Round" }: { scene: CopdScene; pack?: string }) {
  const activeIndex = COPD_SCENES.indexOf(scene);
  return (
    <header className={styles.header}>
      <Link className={styles.brand} href="/">
        HomeRounds
      </Link>
      <div className={styles.packLabel}>
        <span />
        {pack}
      </div>
      <nav aria-label="Round progress" className={styles.progress}>
        {COPD_SCENES.map((item, index) => (
          <span
            aria-current={item === scene ? "step" : undefined}
            className={index <= activeIndex ? styles.progressActive : undefined}
            key={item}
            title={sceneLabels[item]}
          />
        ))}
      </nav>
      <a className={styles.secondaryLink} href="/showcase/glp1" target="_blank" rel="noreferrer">
        GLP-1 round ↗
      </a>
    </header>
  );
}

function HeartHeader({ scene }: { scene: HeartScene }) {
  const activeIndex = HEART_SCENES.indexOf(scene);
  return (
    <header className={styles.header}>
      <Link className={styles.brand} href="/">
        HomeRounds
      </Link>
      <div className={styles.packLabel}>
        <span />
        Heart-Failure Change Round
      </div>
      <nav aria-label="Round progress" className={styles.progress}>
        {HEART_SCENES.map((item, index) => (
          <span
            aria-current={item === scene ? "step" : undefined}
            className={index <= activeIndex ? styles.progressActive : undefined}
            key={item}
            title={heartSceneLabels[item]}
          />
        ))}
      </nav>
      <div className={styles.packLinks}>
        <a href="/showcase/copd" target="_blank" rel="noreferrer">
          COPD ↗
        </a>
        <a href="/showcase/glp1" target="_blank" rel="noreferrer">
          GLP-1 ↗
        </a>
      </div>
    </header>
  );
}

function ScreenIntro({
  eyebrow,
  title,
  children
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.screenIntro}>
      <p>{eyebrow}</p>
      <h1>{title}</h1>
      <div>{children}</div>
    </div>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled = false
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button className={styles.primaryButton} disabled={disabled} onClick={onClick} type="button">
      {children}
      <span aria-hidden="true">→</span>
    </button>
  );
}

function ContextConstellation({
  events,
  patient
}: {
  events: readonly ContextEvent[];
  patient: string;
}) {
  return (
    <section className={styles.constellation} aria-label={`Why this round started for ${patient}`}>
      <svg
        aria-hidden="true"
        className={styles.constellationLines}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <defs>
          <filter id="constellation-glow">
            <feGaussianBlur stdDeviation="1.3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="constellation-core">
            <stop offset="0" stopColor="#f2a077" />
            <stop offset="1" stopColor="#b34a2d" />
          </radialGradient>
        </defs>
        <g className={styles.constellationStars}>
          {CONSTELLATION_STARS.map(([x, y], index) => (
            <circle cx={x} cy={y} key={`${x}-${y}`} r={index % 3 === 0 ? 0.55 : 0.32} />
          ))}
        </g>
        {events.map((event, index) => (
          <path
            d={`M 50 50 Q ${50 + (event.x - 50) * 0.38 + (index % 2 === 0 ? -9 : 9)} ${50 + (event.y - 50) * 0.38} ${event.x} ${event.y}`}
            filter="url(#constellation-glow)"
            key={event.id}
            style={{ animationDelay: `${index * 180}ms` }}
          />
        ))}
        <circle
          className={styles.constellationCore}
          cx="50"
          cy="50"
          r="3.2"
          fill="url(#constellation-core)"
        />
      </svg>
      <div className={styles.patientNode}>
        <span>{patient.slice(0, 1)}</span>
        <strong>{patient}</strong>
        <small>Personal context</small>
      </div>
      {events.map((event, index) => (
        <article
          className={styles.contextNode}
          key={event.id}
          style={{
            left: `${event.x}%`,
            top: `${event.y}%`,
            animationDelay: `${180 + index * 180}ms`
          }}
        >
          <span>{event.when}</span>
          <strong>{event.title}</strong>
          <small>{event.source}</small>
        </article>
      ))}
      <ol className={styles.contextFallback}>
        {events.map((event) => (
          <li key={event.id}>
            <span>{event.when}</span>
            <strong>{event.title}</strong>
          </li>
        ))}
      </ol>
    </section>
  );
}

type OrbStatus = "idle" | "connecting" | "listening" | "speaking" | "ready" | "fallback";

function ShowcaseVoiceOrb({
  context = voiceContext,
  memoryLine = "Inhaler change · activity baseline · recent night waking",
  onComplete,
  readyPrompt = "I heard that your breathing feels harder than usual."
}: {
  context?: VoiceSessionContext;
  memoryLine?: string;
  onComplete: () => void;
  readyPrompt?: string;
}) {
  const provider = useMemo(() => createPatientVoiceProvider(), []);
  const controller = useVoiceInteraction({
    provider,
    roundId: SHOWCASE_ROUND_ID,
    context
  });
  const [fallbackText, setFallbackText] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [showType, setShowType] = useState(false);
  const proposal = controller.transcript.proposal;
  const sessionStatus = controller.session.status;
  const status: OrbStatus = reviewing
    ? "ready"
    : sessionStatus === "connecting" || sessionStatus === "permission_required"
      ? "connecting"
      : sessionStatus === "listening" || sessionStatus === "connected"
        ? "listening"
        : sessionStatus === "speaking"
          ? "speaking"
          : proposal?.isFinal || controller.agentProposal
            ? "ready"
            : sessionStatus === "failed" || sessionStatus === "unavailable"
              ? "fallback"
              : "idle";
  const statusCopy: Record<OrbStatus, string> = {
    idle: "Ready when you are",
    connecting: "Joining the conversation…",
    listening: "Listening",
    speaking: "Speaking",
    ready: "Your summary is ready",
    fallback: "Voice paused · typing is ready"
  };
  const displayText = fallbackText || proposal?.text || readyPrompt;

  function acceptTypedText() {
    if (!fallbackText.trim()) return;
    controller.replaceTranscript(fallbackText);
    setReviewing(true);
  }

  function beginReview() {
    void controller.endVoice();
    setReviewing(true);
  }

  function confirmReview() {
    controller.replaceTranscript(displayText);
    controller.confirmTranscript();
    onComplete();
  }

  if (reviewing || status === "ready") {
    return (
      <div className={styles.voiceStage}>
        <div className={styles.memoryWhisper}>
          <span>Conversation complete</span>
          <strong>Review before anything becomes part of the round</strong>
        </div>
        <section className={styles.voiceFactReview} aria-labelledby="voice-review-title">
          <p className={styles.eyebrow}>What HomeRounds understood</p>
          <h2 id="voice-review-title">Is this an accurate summary?</h2>
          <div className={styles.proposedFacts}>
            <span>
              <small>Breathing</small>
              <strong>Stairs feel harder than usual</strong>
            </span>
            <span>
              <small>Energy</small>
              <strong>Lower than Maya’s usual pattern</strong>
            </span>
            <span>
              <small>Timing</small>
              <strong>Changed recently</strong>
            </span>
            <span>
              <small>Safety</small>
              <strong>No chest pain or fainting reported</strong>
            </span>
          </div>
          <label htmlFor="showcase-review-summary">Conversation summary</label>
          <textarea
            id="showcase-review-summary"
            value={displayText}
            onChange={(event) => setFallbackText(event.currentTarget.value)}
          />
          <div className={styles.voiceActions}>
            <PrimaryButton onClick={confirmReview}>Confirm and build my Round Map</PrimaryButton>
            <button className={styles.textToggle} onClick={() => setReviewing(false)} type="button">
              Keep talking
            </button>
          </div>
        </section>
        <p className={styles.voiceBoundary}>Proposed facts only · Maya confirms the record</p>
      </div>
    );
  }

  return (
    <div className={styles.voiceStage}>
      <div className={styles.memoryWhisper}>
        <span>Using confirmed context</span>
        <strong>{memoryLine}</strong>
      </div>
      <div className={`${styles.orb} ${styles[`orb_${status}`]}`} aria-hidden="true">
        <span className={styles.orbCore} />
        <span className={styles.orbRingOne} />
        <span className={styles.orbRingTwo} />
        <span className={styles.orbRingThree} />
      </div>
      <p className={styles.orbStatus} role="status" aria-live="polite">
        {statusCopy[status]}
      </p>
      <h2 className={styles.agentPrompt}>
        {status === "idle"
          ? "Tell me what feels different today."
          : status === "fallback"
            ? "You can continue without voice."
            : "I’m listening for what changed and what needs checking next."}
      </h2>
      {proposal?.text ? (
        <details className={styles.transcriptReview}>
          <summary>Review what I heard</summary>
          <p>{proposal.text}</p>
        </details>
      ) : null}
      <div className={styles.voiceActions}>
        {status === "idle" ? (
          <button
            className={styles.voiceStart}
            onClick={() => void controller.startVoice()}
            type="button"
          >
            <span aria-hidden="true" /> Start voice conversation
          </button>
        ) : null}
        {status === "listening" || status === "speaking" || status === "connecting" ? (
          <button
            className={styles.ghostButton}
            onClick={() => {
              beginReview();
            }}
            type="button"
          >
            Review what HomeRounds understood
          </button>
        ) : null}
        {status === "fallback" ? (
          <PrimaryButton onClick={() => setReviewing(true)}>Review guided summary</PrimaryButton>
        ) : null}
        <button
          className={styles.textToggle}
          onClick={() => setShowType((value) => !value)}
          type="button"
        >
          Type instead
        </button>
      </div>
      {showType ? (
        <div className={styles.typeFallback}>
          <label htmlFor="showcase-typed-report">What changed?</label>
          <textarea
            id="showcase-typed-report"
            value={fallbackText}
            onChange={(event) => setFallbackText(event.currentTarget.value)}
            placeholder="My breathing has felt harder on the stairs since yesterday…"
          />
          <button disabled={!fallbackText.trim()} onClick={acceptTypedText} type="button">
            Use this summary
          </button>
        </div>
      ) : null}
      <p className={styles.voiceBoundary}>
        AI prepares the conversation · governed checks decide what can happen next
      </p>
    </div>
  );
}

type PlanStatus = "complete" | "selected" | "fallback" | "pending";

function PlanNode({
  label,
  detail,
  status
}: {
  label: string;
  detail: string;
  status: PlanStatus;
}) {
  return (
    <article className={styles.planNode} data-status={status}>
      <span aria-hidden="true">
        {status === "complete"
          ? "✓"
          : status === "selected"
            ? "01"
            : status === "fallback"
              ? "02"
              : "·"}
      </span>
      <div>
        <strong>{label}</strong>
        <p>{detail}</p>
      </div>
    </article>
  );
}

function PerceptionPlan({ onContinue }: { onContinue: () => void }) {
  return (
    <div className={styles.planLayout}>
      <ScreenIntro
        eyebrow="Adaptive perception plan"
        title="The smallest useful assessment comes first."
      >
        <p>
          HomeRounds compares information value, burden, availability and signal reliability before
          selecting a physical check.
        </p>
      </ScreenIntro>
      <div className={styles.planQuestion}>
        <span>What HomeRounds needs to establish</span>
        <strong>Has Maya’s respiratory state meaningfully changed?</strong>
      </div>
      <div className={styles.planRail}>
        <PlanNode
          label="Conversation"
          detail="Symptoms and safety context confirmed"
          status="complete"
        />
        <PlanNode
          label="Facial vital scan"
          detail="Lowest-burden source for respiratory rate and pulse"
          status="selected"
        />
        <PlanNode
          label="Finger pulse"
          detail="Available only if facial pulse quality is weak"
          status="fallback"
        />
        <PlanNode
          label="Inhaler technique"
          detail="Supporting sequence when the medication device changed"
          status="pending"
        />
      </div>
      <div className={styles.planFooter}>
        <div>
          <span>Selected because</span>
          <strong>One short scan can answer two open questions.</strong>
        </div>
        <PrimaryButton onClick={onContinue}>Send the assessment to Maya’s phone</PrimaryButton>
      </div>
    </div>
  );
}

function HeartPerceptionPlan({ onContinue }: { onContinue: () => void }) {
  return (
    <div className={styles.planLayout}>
      <ScreenIntro eyebrow="Adaptive Round Map" title="HomeRounds makes the next decision visible.">
        <p>
          No single change is enough. The open question is whether Maya’s cardiorespiratory state
          has shifted enough to require a heart-failure team review.
        </p>
      </ScreenIntro>
      <div className={styles.planQuestion}>
        <span>Missing evidence</span>
        <strong>Current respiratory rate, reliable pulse and confirmed medication context</strong>
      </div>
      <div className={styles.planRail}>
        <PlanNode
          label="Conversation"
          detail="Symptoms and safety context confirmed"
          status="complete"
        />
        <PlanNode
          label="Facial vital assessment"
          detail="Selected · answers two open questions with the lowest burden"
          status="selected"
        />
        <PlanNode
          label="Finger pulse"
          detail="Conditional fallback · only if facial pulse quality is weak"
          status="fallback"
        />
        <PlanNode
          label="Medication package"
          detail="Selected · reconciles the pack at home with the recent record change"
          status="pending"
        />
      </div>
      <div className={styles.planFooter}>
        <div>
          <span>Selected because</span>
          <strong>One low-burden scan can resolve respiratory rate and pulse together.</strong>
        </div>
        <PrimaryButton onClick={onContinue}>Send the assessment to Maya’s phone</PrimaryButton>
      </div>
    </div>
  );
}

type SensorPhase = "pair" | "face" | "quality" | "finger" | "complete";

function SensorSequence({
  fingerPulse = "96 bpm",
  nextLabel = "Continue to technique review",
  onComplete,
  phonePath = "/showcase/copd/phone",
  respiratoryRate = "23 /min"
}: {
  fingerPulse?: string;
  nextLabel?: string;
  onComplete: () => void;
  phonePath?: string;
  respiratoryRate?: string;
}) {
  const [phase, setPhase] = useState<SensorPhase>("pair");
  const pairingUrl = `https://homerounds.vercel.app${phonePath}`;
  useEffect(() => {
    if (phase === "pair") return;
    const next: Partial<Record<SensorPhase, readonly [SensorPhase, number]>> = {
      face: ["quality", 10_000],
      quality: ["finger", 3_500],
      finger: ["complete", 10_000]
    };
    const target = next[phase];
    if (!target) return;
    const timer = window.setTimeout(() => setPhase(target[0]), target[1]);
    return () => window.clearTimeout(timer);
  }, [phase]);

  return (
    <div className={styles.sensorLayout}>
      <ScreenIntro eyebrow="Phone assessment" title="One handoff. Two quality decisions.">
        <p>The phone follows the selected plan and returns only quality-tagged evidence.</p>
      </ScreenIntro>
      {phase === "pair" ? (
        <div className={styles.pairingCard}>
          <div className={styles.qrWrap}>
            <QRCodeSVG
              bgColor="#fffdf8"
              fgColor="#173c32"
              level="M"
              size={230}
              value={pairingUrl}
            />
          </div>
          <div>
            <span className={styles.livePill}>
              <i /> Ready to connect
            </span>
            <h2>Scan once with Maya’s phone</h2>
            <p>
              The secure browser companion opens without an install and shows only the selected
              assessment.
            </p>
            <button className={styles.phoneLink} onClick={() => setPhase("face")} type="button">
              Phone connected — begin assessment
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.sensorStage}>
          <div className={styles.phoneFrame}>
            <div className={styles.phoneTop} />
            {phase === "face" ? <FaceScanVisual /> : null}
            {phase === "quality" ? <QualitySplitVisual /> : null}
            {phase === "finger" ? <FingerScanVisual /> : null}
            {phase === "complete" ? <PhoneCompleteVisual /> : null}
          </div>
          <div className={styles.sensorNarrative}>
            <span className={styles.livePill}>
              <i /> {phase === "complete" ? "Evidence returned" : "Assessment running"}
            </span>
            <h2>
              {phase === "face"
                ? "Reading facial vital signals"
                : phase === "quality"
                  ? "Checking each signal independently"
                  : phase === "finger"
                    ? "Switching to the lowest-burden fallback"
                    : "The evidence ladder is complete"}
            </h2>
            <p>
              {phase === "quality"
                ? "Respiratory rate passed. Facial pulse did not. The rejected pulse is never saved as a measurement."
                : phase === "finger"
                  ? "Finger PPG is requested only because it can answer the remaining pulse question."
                  : "Every result retains its source, quality decision and relationship to Maya’s baseline."}
            </p>
            <div className={styles.signalRail}>
              <SignalRow
                label="Respiratory rate"
                value={phase === "face" ? "Analysing…" : respiratoryRate}
                status={phase === "face" ? "running" : "accepted"}
              />
              <SignalRow
                label="Facial pulse"
                value={phase === "face" ? "Analysing…" : "Rejected · motion"}
                status={phase === "face" ? "running" : "rejected"}
              />
              <SignalRow
                label="Finger pulse"
                value={
                  phase === "finger" ? "Checking…" : phase === "complete" ? fingerPulse : "Waiting"
                }
                status={
                  phase === "finger" ? "running" : phase === "complete" ? "accepted" : "waiting"
                }
              />
            </div>
            {phase === "complete" ? (
              <PrimaryButton onClick={onComplete}>{nextLabel}</PrimaryButton>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function FaceScanVisual() {
  return (
    <div className={styles.faceVisual}>
      <div className={styles.faceOval}>
        <span />
        <i />
      </div>
      <p>Hold still · about 10 seconds</p>
    </div>
  );
}

function CameraPreview({
  facingMode,
  label
}: {
  facingMode: "environment" | "user";
  label: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<"connecting" | "live" | "unavailable">("connecting");
  useEffect(() => {
    let active = true;
    let stream: MediaStream | undefined;
    const videoElement = videoRef.current;
    void navigator.mediaDevices
      ?.getUserMedia({ audio: false, video: { facingMode } })
      .then((nextStream) => {
        if (!active) {
          nextStream.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = nextStream;
        if (videoElement) videoElement.srcObject = nextStream;
        setState("live");
      })
      .catch(() => {
        if (active) setState("unavailable");
      });
    return () => {
      active = false;
      stream?.getTracks().forEach((track) => track.stop());
      if (videoElement) videoElement.srcObject = null;
    };
  }, [facingMode]);
  return (
    <div className={styles.cameraPreview} data-state={state}>
      <video aria-label={label} autoPlay muted playsInline ref={videoRef} />
      <div className={styles.cameraGuide} aria-hidden="true">
        <span />
      </div>
      <p role="status">
        {state === "live"
          ? "Camera live · no frames retained"
          : state === "unavailable"
            ? "Camera unavailable · the result remains unmeasured"
            : "Starting camera…"}
      </p>
    </div>
  );
}

function QualitySplitVisual() {
  return (
    <div className={styles.qualityVisual}>
      <span>Signal quality</span>
      <strong>1 accepted</strong>
      <strong className={styles.rejectedText}>1 rejected</strong>
      <p>Fallback selected</p>
    </div>
  );
}

function FingerScanVisual() {
  return (
    <div className={styles.fingerVisual}>
      <span className={styles.fingerprint} />
      <strong>Finger pulse</strong>
      <p>Keep gentle contact</p>
    </div>
  );
}

function PhoneCompleteVisual() {
  return (
    <div className={styles.phoneComplete}>
      <span>✓</span>
      <strong>Evidence sent</strong>
      <p>Camera stopped · no raw video retained</p>
    </div>
  );
}

function SignalRow({
  label,
  value,
  status
}: {
  label: string;
  value: string;
  status: "running" | "accepted" | "rejected" | "waiting";
}) {
  return (
    <div className={styles.signalRow} data-status={status}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function InhalerTechnique({ onComplete }: { onComplete: () => void }) {
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(false);
  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => setCompleted(true), 3_100);
    return () => window.clearTimeout(timer);
  }, [running]);
  const steps = [
    "Device prepared",
    "Exhaled before use",
    "Actuation with slow inhale",
    "Breath held afterwards"
  ];
  return (
    <div className={styles.techniqueLayout}>
      <ScreenIntro
        eyebrow="Camera-guided technique"
        title="One physical step still needs confirmation."
      >
        <p>
          The guided sequence checks visible order and keeps uncertainty explicit when the camera
          cannot establish a step.
        </p>
      </ScreenIntro>
      <div className={styles.techniqueStage}>
        <div className={`${styles.techniqueSilhouette} ${running ? styles.techniqueRunning : ""}`}>
          <div className={styles.personGlyph}>
            <span />
            <i />
          </div>
          <div className={styles.breathArc} />
          <p>
            {!running
              ? "Ready for guided review"
              : completed
                ? "Sequence review complete"
                : "Following the inhaler sequence…"}
          </p>
        </div>
        <ol className={styles.techniqueSteps}>
          {steps.map((step, index) => (
            <li
              data-status={
                !running ? "waiting" : completed && index === 3 ? "uncertain" : "accepted"
              }
              key={step}
            >
              <span>{!running ? index + 1 : completed && index === 3 ? "?" : "✓"}</span>
              <div>
                <strong>{step}</strong>
                <small>
                  {completed && index === 3
                    ? "Patient confirmation needed"
                    : running
                      ? "Observed in sequence"
                      : "Waiting"}
                </small>
              </div>
            </li>
          ))}
        </ol>
      </div>
      <div className={styles.actionRow}>
        {!running ? (
          <PrimaryButton onClick={() => setRunning(true)}>Begin technique review</PrimaryButton>
        ) : null}
        {completed ? (
          <PrimaryButton onClick={onComplete}>Keep the uncertain step visible</PrimaryButton>
        ) : null}
      </div>
    </div>
  );
}

function MedicationPackageReview({ onComplete }: { onComplete: () => void }) {
  const [phase, setPhase] = useState<"ready" | "reading" | "complete" | "unavailable">("ready");
  useEffect(() => {
    if (phase !== "reading") return;
    const timer = window.setTimeout(() => setPhase("complete"), 2_600);
    return () => window.clearTimeout(timer);
  }, [phase]);
  return (
    <div className={styles.techniqueLayout}>
      <ScreenIntro eyebrow="Medication reconciliation" title="Missing evidence remains visible.">
        <p>
          HomeRounds asks whether the package is actually available. If it is not, no label or dose
          fact is created.
        </p>
      </ScreenIntro>
      <div className={styles.techniqueStage}>
        <div className={styles.medicationStage} data-phase={phase}>
          {phase === "reading" || phase === "complete" ? (
            <div className={styles.medicationPack}>
              <span>Package camera</span>
              <strong>Label</strong>
              <small>Visible fields only</small>
              <i aria-hidden="true" />
            </div>
          ) : (
            <div className={styles.missingPackage} aria-hidden="true">
              <span>?</span>
            </div>
          )}
          <p>
            {phase === "ready"
              ? "Waiting for Maya’s availability response"
              : phase === "reading"
                ? "Opening the guided package camera…"
                : phase === "unavailable"
                  ? "Package not available during this round"
                  : "Visible package fields captured"}
          </p>
        </div>
        <div className={styles.medicationResult}>
          <span>Reconciliation status</span>
          <h2>
            {phase === "unavailable"
              ? "Nothing assumed. The uncertainty travels forward."
              : phase === "complete"
                ? "Visible fields captured. The active instruction stays open."
                : "Is the current package available?"}
          </h2>
          <div className={styles.signalRail}>
            <SignalRow
              label="Package identity"
              value={
                phase === "unavailable"
                  ? "Not observed"
                  : phase === "complete"
                    ? "Visible fields captured"
                    : "Waiting"
              }
              status={phase === "complete" ? "accepted" : "waiting"}
            />
            <SignalRow
              label="Current daily instruction"
              value={
                phase === "complete" || phase === "unavailable" ? "Needs reconciliation" : "Waiting"
              }
              status={phase === "complete" || phase === "unavailable" ? "rejected" : "waiting"}
            />
          </div>
          <p>
            Availability is evidence. The workflow never changes medication or fills a missing
            field.
          </p>
          {phase === "ready" ? (
            <div className={styles.medicationChoices}>
              <PrimaryButton onClick={() => setPhase("reading")}>
                Use the phone package camera
              </PrimaryButton>
              <button
                className={styles.ghostButton}
                onClick={() => setPhase("unavailable")}
                type="button"
              >
                The package isn’t available
              </button>
            </div>
          ) : null}
          {phase === "complete" ? (
            <PrimaryButton onClick={onComplete}>Keep the uncertainty visible</PrimaryButton>
          ) : null}
          {phase === "unavailable" ? (
            <PrimaryButton onClick={onComplete}>Continue with package unavailable</PrimaryButton>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function EvidenceCard({ item }: { item: EvidencePassport }) {
  return (
    <article className={styles.evidenceCard} data-status={item.status}>
      <div className={styles.evidenceTop}>
        <span>{item.status}</span>
        <small>{item.source}</small>
      </div>
      <h2>{item.label}</h2>
      <strong>{item.value}</strong>
      <dl>
        <div>
          <dt>Compared with</dt>
          <dd>{item.comparison}</dd>
        </div>
        <div>
          <dt>Workflow use</dt>
          <dd>{item.explanation}</dd>
        </div>
        <div>
          <dt>Raw media retained</dt>
          <dd>No</dd>
        </div>
      </dl>
    </article>
  );
}

function EvidenceSynthesis({ onContinue }: { onContinue: () => void }) {
  return (
    <div className={styles.evidenceLayout}>
      <ScreenIntro eyebrow="Evidence synthesis" title="Every signal keeps its passport.">
        <p>
          Accepted, rejected and supporting evidence remain visibly separate before the protocol
          permits an action.
        </p>
      </ScreenIntro>
      <div className={styles.evidenceSummary}>
        <span>
          <strong>2</strong> accepted
        </span>
        <span>
          <strong>1</strong> rejected
        </span>
        <span>
          <strong>2</strong> supporting
        </span>
        <span>
          <strong>1</strong> remaining uncertainty
        </span>
      </div>
      <div className={styles.evidenceGrid}>
        {COPD_EVIDENCE.map((item) => (
          <EvidenceCard item={item} key={item.id} />
        ))}
      </div>
      <div className={styles.governanceStrip}>
        <span>Governed checks active</span>
        <strong>Red flags clear</strong>
        <strong>Quality gates enforced</strong>
        <strong>Duplicate action prevented</strong>
        <strong>Raw media excluded</strong>
      </div>
      <div className={styles.actionRow}>
        <PrimaryButton onClick={onContinue}>Create respiratory-team review</PrimaryButton>
      </div>
    </div>
  );
}

function HeartEvidenceSynthesis({ onContinue }: { onContinue: () => void }) {
  return (
    <div className={styles.evidenceLayout}>
      <ScreenIntro eyebrow="Evidence synthesis" title="A passport travels with every signal.">
        <p>
          Accepted, rejected, supporting and unresolved evidence remain separate before the governed
          pathway permits one review action.
        </p>
      </ScreenIntro>
      <div className={styles.evidenceSummary}>
        <span>
          <strong>2</strong> accepted
        </span>
        <span>
          <strong>1</strong> rejected
        </span>
        <span>
          <strong>1</strong> supporting
        </span>
        <span>
          <strong>1</strong> unresolved
        </span>
      </div>
      <div className={styles.evidenceGrid}>
        {HEART_EVIDENCE.map((item) => (
          <EvidenceCard item={item} key={item.id} />
        ))}
      </div>
      <div className={styles.governanceStrip}>
        <span>Governed pathway</span>
        <strong>Red flags clear</strong>
        <strong>Quality gates enforced</strong>
        <strong>No diagnosis generated</strong>
        <strong>One action permitted</strong>
      </div>
      <div className={styles.actionRow}>
        <PrimaryButton onClick={onContinue}>Create heart-failure team review</PrimaryButton>
      </div>
    </div>
  );
}

function ClinicianScene({ onComplete }: { onComplete: () => void }) {
  const [complete, setComplete] = useState(false);
  return (
    <div className={styles.clinicianLayout}>
      <div className={styles.clinicianHeader}>
        <div>
          <span>Clinician cockpit</span>
          <h1>One owned respiratory review.</h1>
        </div>
        <span className={styles.livePill}>
          <i /> Persisted
        </span>
      </div>
      <div className={styles.clinicianGrid}>
        <aside className={styles.queuePanel}>
          <span>Priority queue · 1</span>
          <article>
            <strong>Maya · COPD change</strong>
            <p>Review supporting evidence and recent technique uncertainty.</p>
            <small>{complete ? "Completed" : "Needs review"}</small>
          </article>
        </aside>
        <main className={styles.clinicianEvidence}>
          <div className={styles.clinicianTitle}>
            <div>
              <span>Why this task exists</span>
              <h2>Several changes crossed the configured review boundary.</h2>
            </div>
            <span>{complete ? "Complete" : "Open"}</span>
          </div>
          <div className={styles.clinicianFacts}>
            <article>
              <span>Accepted</span>
              <strong>Respiratory rate 23/min</strong>
              <p>Facial vital scan · quality passed</p>
            </article>
            <article>
              <span>Accepted fallback</span>
              <strong>Finger pulse 96 bpm</strong>
              <p>Facial pulse rejected for motion</p>
            </article>
            <article>
              <span>Supporting</span>
              <strong>Voice pattern changed</strong>
              <p>Not used independently</p>
            </article>
            <article>
              <span>Uncertainty</span>
              <strong>Breath-hold step unclear</strong>
              <p>Requires human review</p>
            </article>
          </div>
          <div className={styles.auditTrail}>
            <span>Round triggered</span>
            <i />
            <span>Evidence quality checked</span>
            <i />
            <span>Task created once</span>
            <i />
            <strong>{complete ? "Review completed" : "Awaiting clinician"}</strong>
          </div>
          {!complete ? (
            <PrimaryButton onClick={() => setComplete(true)}>
              Acknowledge and complete review
            </PrimaryButton>
          ) : (
            <PrimaryButton onClick={onComplete}>Return the outcome to Maya</PrimaryButton>
          )}
        </main>
      </div>
    </div>
  );
}

function HeartClinicianScene({ onComplete }: { onComplete: () => void }) {
  const [complete, setComplete] = useState(false);
  return (
    <div className={styles.clinicianLayout}>
      <div className={styles.clinicianHeader}>
        <div>
          <span>Clinician cockpit</span>
          <h1>One owned heart-failure review.</h1>
        </div>
        <span className={styles.livePill}>
          <i /> Persisted
        </span>
      </div>
      <div className={styles.clinicianGrid}>
        <aside className={styles.queuePanel}>
          <span>Priority queue · 1</span>
          <article>
            <strong>Maya · subtle change</strong>
            <p>Review multimodal evidence and reconcile the current dose instruction.</p>
            <small>{complete ? "Completed" : "Needs review"}</small>
          </article>
        </aside>
        <main className={styles.clinicianEvidence}>
          <div className={styles.clinicianTitle}>
            <div>
              <span>Why this task exists</span>
              <h2>No single alert fired. The combined change pattern justified review.</h2>
            </div>
            <span>{complete ? "Complete" : "Open"}</span>
          </div>
          <div className={styles.clinicianFacts}>
            <article>
              <span>Accepted</span>
              <strong>Respiratory rate 22/min</strong>
              <p>Facial assessment · quality passed</p>
            </article>
            <article>
              <span>Accepted fallback</span>
              <strong>Finger pulse 96 bpm</strong>
              <p>Facial pulse rejected for motion</p>
            </article>
            <article>
              <span>Supporting</span>
              <strong>Voice more effortful</strong>
              <p>Compared with compatible baseline</p>
            </article>
            <article>
              <span>Unresolved</span>
              <strong>Medication and daily instruction</strong>
              <p>Package not available during the round</p>
            </article>
          </div>
          <div className={styles.auditTrail}>
            <span>Pattern combined</span>
            <i />
            <span>Evidence quality checked</span>
            <i />
            <span>Task created once</span>
            <i />
            <strong>{complete ? "Review completed" : "Awaiting clinician"}</strong>
          </div>
          {!complete ? (
            <PrimaryButton onClick={() => setComplete(true)}>
              Record advice and complete review
            </PrimaryButton>
          ) : (
            <PrimaryButton onClick={onComplete}>Return the outcome to Maya</PrimaryButton>
          )}
        </main>
      </div>
    </div>
  );
}

function ResolutionScene() {
  const [resolved, setResolved] = useState(false);
  return (
    <div className={styles.resolutionLayout}>
      <div className={styles.resolutionMark}>
        <span>✓</span>
      </div>
      <p className={styles.eyebrow}>Closed-loop outcome</p>
      <h1>{resolved ? "This episode is resolved." : "The respiratory review is complete."}</h1>
      <p>
        {resolved
          ? "Maya confirmed that she understood the next step and her concern is closer to usual."
          : "Technique guidance and the clinician outcome are ready for Maya to review."}
      </p>
      <div className={styles.resolutionTimeline}>
        <span>Change detected</span>
        <i />
        <span>Assessment adapted</span>
        <i />
        <span>Review completed</span>
        <i />
        <strong>{resolved ? "Patient confirmed" : "Resolution check"}</strong>
      </div>
      {!resolved ? (
        <PrimaryButton onClick={() => setResolved(true)}>Confirm outcome understood</PrimaryButton>
      ) : (
        <div className={styles.finalActions}>
          <a
            className={styles.primaryButton}
            href="/showcase/glp1"
            target="_blank"
            rel="noreferrer"
          >
            Open the GLP-1 round <span>↗</span>
          </a>
          <Link className={styles.ghostButton} href="/">
            Return home
          </Link>
        </div>
      )}
      <p className={styles.boundary}>Synthetic profile · Supporting signals · Not medical care</p>
    </div>
  );
}

function HeartResolutionScene() {
  const [resolved, setResolved] = useState(false);
  return (
    <div className={styles.resolutionLayout}>
      <div className={styles.resolutionMark}>
        <span>✓</span>
      </div>
      <p className={styles.eyebrow}>Resolution Round</p>
      <h1>{resolved ? "The episode is resolved." : "The care-team outcome is back with Maya."}</h1>
      <p>
        {resolved
          ? "Maya confirmed that she understood the plan and her concern is returning towards her usual pattern."
          : "The clinician reconciled the medication instruction, gave a clear monitoring plan, and asked HomeRounds to check understanding."}
      </p>
      <div className={styles.resolutionTimeline}>
        <span>Subtle change combined</span>
        <i />
        <span>Assessment adapted</span>
        <i />
        <span>Clinician responded</span>
        <i />
        <strong>{resolved ? "Patient confirmed" : "Resolution check"}</strong>
      </div>
      {!resolved ? (
        <PrimaryButton onClick={() => setResolved(true)}>I understand the next step</PrimaryButton>
      ) : (
        <div className={styles.finalActions}>
          <a
            className={styles.primaryButton}
            href="/showcase/glp1"
            target="_blank"
            rel="noreferrer"
          >
            Open the GLP-1 pack <span>↗</span>
          </a>
          <a className={styles.ghostButton} href="/showcase/copd" target="_blank" rel="noreferrer">
            Open the COPD pack ↗
          </a>
        </div>
      )}
      <p className={styles.boundary}>Synthetic profile · Supporting signals · Not medical care</p>
    </div>
  );
}

export function HeartShowcase() {
  const [scene, setScene] = useState<HeartScene>("context");
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [scene]);
  const sceneIndex = HEART_SCENES.indexOf(scene);
  const next = () =>
    setScene(HEART_SCENES[Math.min(sceneIndex + 1, HEART_SCENES.length - 1)] ?? "resolution");
  return (
    <div className={styles.page}>
      <HeartHeader scene={scene} />
      <main className={styles.main}>
        {scene === "context" ? (
          <div className={styles.contextLayout}>
            <ScreenIntro
              eyebrow="Why HomeRounds started this round"
              title="No single alert fired. Together, the changes mattered."
            >
              <p>
                HomeRounds compares today with Maya’s own confirmed pattern, then asks only for
                physical evidence that could change the next action.
              </p>
              <div className={styles.contextActions}>
                <PrimaryButton onClick={next}>Talk it through with HomeRounds</PrimaryButton>
                <span>Weight remains below the configured alert boundary</span>
              </div>
            </ScreenIntro>
            <ContextConstellation events={HEART_CONTEXT_EVENTS} patient="Maya" />
          </div>
        ) : null}
        {scene === "conversation" ? (
          <div className={styles.conversationLayout}>
            <ScreenIntro eyebrow="Live adaptive conversation" title="Tell me what feels different.">
              <p>
                HomeRounds turns the conversation into proposed facts for Maya to confirm. Any red
                flag would move control back to the governed safety path.
              </p>
            </ScreenIntro>
            <ShowcaseVoiceOrb
              context={heartVoiceContext}
              memoryLine="Weight trend · activity baseline · recent dose-related change"
              onComplete={next}
              readyPrompt="I heard that stairs feel harder and your energy is lower than usual."
            />
          </div>
        ) : null}
        {scene === "plan" ? <HeartPerceptionPlan onContinue={next} /> : null}
        {scene === "sensors" ? (
          <SensorSequence
            nextLabel="Continue to medication reconciliation"
            onComplete={next}
            phonePath="/showcase/heart/phone"
            respiratoryRate="22 /min"
          />
        ) : null}
        {scene === "medication" ? <MedicationPackageReview onComplete={next} /> : null}
        {scene === "evidence" ? <HeartEvidenceSynthesis onContinue={next} /> : null}
        {scene === "clinician" ? <HeartClinicianScene onComplete={next} /> : null}
        {scene === "resolution" ? <HeartResolutionScene /> : null}
      </main>
    </div>
  );
}

export function CopdShowcase() {
  const [scene, setScene] = useState<CopdScene>("context");
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [scene]);
  const sceneIndex = COPD_SCENES.indexOf(scene);
  const next = () =>
    setScene(COPD_SCENES[Math.min(sceneIndex + 1, COPD_SCENES.length - 1)] ?? "resolution");
  return (
    <div className={styles.page}>
      <ShellHeader scene={scene} />
      <main className={styles.main}>
        {scene === "context" ? (
          <div className={styles.contextLayout}>
            <ScreenIntro
              eyebrow="A change round is ready"
              title="Several small changes became meaningful together."
            >
              <p>
                HomeRounds compares today with Maya’s own confirmed pattern, then asks only for the
                missing evidence that could change the next action.
              </p>
              <div className={styles.contextActions}>
                <PrimaryButton onClick={next}>Talk it through with HomeRounds</PrimaryButton>
                <span>No continuous monitoring · no diagnosis</span>
              </div>
            </ScreenIntro>
            <ContextConstellation events={COPD_CONTEXT_EVENTS} patient="Maya" />
          </div>
        ) : null}
        {scene === "conversation" ? (
          <div className={styles.conversationLayout}>
            <ScreenIntro eyebrow="Live adaptive conversation" title="Tell me what feels different.">
              <p>
                The assistant uses confirmed history to ask fewer, more relevant questions. A
                concerning answer would stop the ordinary assessment path.
              </p>
            </ScreenIntro>
            <ShowcaseVoiceOrb onComplete={next} />
          </div>
        ) : null}
        {scene === "plan" ? <PerceptionPlan onContinue={next} /> : null}
        {scene === "sensors" ? <SensorSequence onComplete={next} /> : null}
        {scene === "inhaler" ? <InhalerTechnique onComplete={next} /> : null}
        {scene === "evidence" ? <EvidenceSynthesis onContinue={next} /> : null}
        {scene === "clinician" ? <ClinicianScene onComplete={next} /> : null}
        {scene === "resolution" ? <ResolutionScene /> : null}
      </main>
    </div>
  );
}

type PhonePhase =
  | "ready"
  | "face"
  | "quality"
  | "finger"
  | "complete"
  | "medication"
  | "package_available"
  | "package_unavailable";

export function CopdPhoneShowcase() {
  const [phase, setPhase] = useState<PhonePhase>("ready");
  useEffect(() => {
    const next: Partial<Record<PhonePhase, readonly [PhonePhase, number]>> = {
      face: ["quality", 10_000],
      quality: ["finger", 3_500],
      finger: ["complete", 10_000]
    };
    const target = next[phase];
    if (!target) return;
    const timer = window.setTimeout(() => setPhase(target[0]), target[1]);
    return () => window.clearTimeout(timer);
  }, [phase]);
  return (
    <main className={styles.phonePage}>
      <header>
        <span>HomeRounds</span>
        <small>Connected to Maya’s round</small>
      </header>
      <section>
        {phase === "ready" ? (
          <>
            <p className={styles.eyebrow}>Ready on your phone</p>
            <h1>Two short checks, one guided sequence.</h1>
            <p>
              The phone will start with facial vitals and use finger pulse only if a signal remains
              unresolved.
            </p>
            <div className={styles.phonePrivacy}>
              <strong>You stay in control</strong>
              <span>No raw video or camera frame is retained.</span>
            </div>
            <PrimaryButton onClick={() => setPhase("face")}>I’m ready</PrimaryButton>
          </>
        ) : null}
        {phase === "face" ? (
          <>
            <p className={styles.eyebrow}>Facial vital scan</p>
            <h1>Keep your face centred.</h1>
            <CameraPreview facingMode="user" label="Live front-camera preview" />
            <p className={styles.phoneStatus}>Reading separate signals · about 10 seconds</p>
          </>
        ) : null}
        {phase === "quality" ? (
          <>
            <p className={styles.eyebrow}>Quality check</p>
            <h1>One signal needs a better view.</h1>
            <QualitySplitVisual />
            <p className={styles.phoneStatus}>
              Respiratory rate accepted · pulse rejected · choosing fallback
            </p>
          </>
        ) : null}
        {phase === "finger" ? (
          <>
            <p className={styles.eyebrow}>Finger pulse</p>
            <h1>Cover the rear camera lens gently.</h1>
            <CameraPreview facingMode="environment" label="Live rear-camera preview" />
            <p className={styles.phoneStatus}>Checking signal quality · about 10 seconds</p>
          </>
        ) : null}
        {phase === "complete" ? (
          <>
            <p className={styles.eyebrow}>Assessment complete</p>
            <h1>Your computer received the evidence.</h1>
            <PhoneCompleteVisual />
            <p className={styles.phoneStatus}>
              Respiratory rate accepted · finger pulse accepted · facial pulse rejected
            </p>
            <PrimaryButton onClick={() => setPhase("medication")}>
              Continue to medication availability
            </PrimaryButton>
          </>
        ) : null}
        {phase === "medication" ? (
          <>
            <p className={styles.eyebrow}>Medication context</p>
            <h1>Is the current package with you?</h1>
            <p>
              HomeRounds will never invent label or dose information when the package is
              unavailable.
            </p>
            <div className={styles.phoneChoiceGrid}>
              <PrimaryButton onClick={() => setPhase("package_available")}>
                I have the package
              </PrimaryButton>
              <button
                className={styles.ghostButton}
                onClick={() => setPhase("package_unavailable")}
                type="button"
              >
                I don’t have it with me
              </button>
            </div>
          </>
        ) : null}
        {phase === "package_available" ? (
          <>
            <p className={styles.eyebrow}>Package available</p>
            <h1>Keep it ready for the guided label step.</h1>
            <p className={styles.phoneStatus}>
              Availability returned · no medication fact inferred yet
            </p>
          </>
        ) : null}
        {phase === "package_unavailable" ? (
          <>
            <p className={styles.eyebrow}>Package unavailable</p>
            <h1>That’s useful information too.</h1>
            <p>
              The product and current dose remain explicitly unresolved for the clinician review.
            </p>
            <p className={styles.phoneStatus}>Missing evidence returned · nothing assumed</p>
          </>
        ) : null}
      </section>
      <footer>Sample profile · Not medical care</footer>
    </main>
  );
}

export function HeartPhoneShowcase() {
  return <CopdPhoneShowcase />;
}

type GlpScene = "context" | "conversation" | "selection" | "action";

export function GlpShowcase() {
  const [scene, setScene] = useState<GlpScene>("context");
  const [running, setRunning] = useState(false);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [scene]);
  const stages: readonly GlpScene[] = ["context", "conversation", "selection", "action"];
  const next = () =>
    setScene(stages[Math.min(stages.indexOf(scene) + 1, stages.length - 1)] ?? "action");
  useEffect(() => {
    if (!running || scene === "action") return;
    const nextScene: Partial<Record<GlpScene, GlpScene>> = {
      conversation: "selection",
      selection: "action"
    };
    const timer = window.setTimeout(
      () => setScene(nextScene[scene] ?? "action"),
      scene === "conversation" ? 3_200 : 2_300
    );
    return () => window.clearTimeout(timer);
  }, [running, scene]);
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/">
          HomeRounds
        </Link>
        <div className={styles.packLabel}>
          <span />
          GLP-1 Tolerance & Continuity
        </div>
        <a className={styles.secondaryLink} href="/showcase/copd">
          Return to COPD round
        </a>
      </header>
      <main className={styles.glpMain}>
        {scene === "context" ? (
          <div className={styles.contextLayout}>
            <ScreenIntro
              eyebrow="A different patient. A different examination."
              title="Alex’s dose changed. The assessment changes with it."
            >
              <p>
                The same governed engine selects medication and tolerance evidence—not facial
                vitals—because that is what could change the next action.
              </p>
              <PrimaryButton
                onClick={() => {
                  setRunning(true);
                  next();
                }}
              >
                Run the short GLP-1 round
              </PrimaryButton>
            </ScreenIntro>
            <ContextConstellation events={GLP_CONTEXT_EVENTS} patient="Alex" />
          </div>
        ) : null}
        {scene === "conversation" ? (
          <div className={styles.glpFocus}>
            <div className={`${styles.orb} ${styles.orb_speaking}`} aria-hidden="true">
              <span className={styles.orbCore} />
              <span className={styles.orbRingOne} />
              <span className={styles.orbRingTwo} />
            </div>
            <p className={styles.eyebrow}>Listening to Alex</p>
            <h1>“The nausea started after my dose changed.”</h1>
            <div className={styles.glpSignals}>
              <span>Safety context clear</span>
              <span>Dose change confirmed</span>
              <span>Medication identity still open</span>
            </div>
          </div>
        ) : null}
        {scene === "selection" ? (
          <div className={styles.glpSelection}>
            <ScreenIntro
              eyebrow="Adaptive module selection"
              title="Medication review is the smallest useful next check."
            >
              <p>
                Pulse and respiratory modules are excluded because they do not answer the open
                question in this round.
              </p>
            </ScreenIntro>
            <div className={styles.planRail}>
              <PlanNode
                label="Medication-label review"
                detail="Selected · confirms product and dose present at home"
                status="selected"
              />
              <PlanNode
                label="Tolerance questions"
                detail="Selected · connects symptoms with the recent change"
                status="complete"
              />
              <PlanNode
                label="Facial vital scan"
                detail="Excluded · not relevant to the confirmed context"
                status="pending"
              />
              <PlanNode
                label="Finger pulse"
                detail="Excluded · no symptom-triggered need"
                status="pending"
              />
            </div>
          </div>
        ) : null}
        {scene === "action" ? (
          <div className={styles.glpOutcome}>
            <span className={styles.resolutionMark}>✓</span>
            <p className={styles.eyebrow}>Round complete</p>
            <h1>Medication refill review prepared.</h1>
            <p>
              Alex confirmed the label, the dose and the tolerance summary. One review request is
              owned inside HomeRounds.
            </p>
            <div className={styles.evidenceSummary}>
              <span>
                <strong>1</strong> label confirmed
              </span>
              <span>
                <strong>3</strong> tolerance facts
              </span>
              <span>
                <strong>0</strong> unnecessary sensors
              </span>
              <span>
                <strong>1</strong> owned action
              </span>
            </div>
            <a className={styles.primaryButton} href="/showcase/copd">
              Return to the main round <span>→</span>
            </a>
            <p className={styles.boundary}>Synthetic profile · Not medical care</p>
          </div>
        ) : null}
      </main>
    </div>
  );
}
