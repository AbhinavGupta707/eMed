/** @jsxRuntime automatic */
/** @jsxImportSource react */

"use client";

import {
  MedicationImageError,
  createLocalVoiceBiomarkerProvider,
  prepareMedicationLabelImage,
  type OpticalAssessmentProvider,
  type OpticalProviderKind,
  type PreparedMedicationLabelImage,
  type VitalLensConsentGateway
} from "@homerounds/assessments";
import type { OpticalAssessmentResult } from "@homerounds/contracts/assessment";
import type { VoiceBiomarkerProvider } from "@homerounds/contracts";
import {
  CompanionTaskResultRequestSchema,
  type CompanionPhoneSnapshot,
  type CompanionTaskResultRequest
} from "@homerounds/companion/schemas";
import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from "react";

import { createPatientOpticalProvider } from "../patient/provider-factories";
import { VoiceBiomarkerStation } from "../voice-biomarker";
import { taskContent } from "./model";
import {
  createNonMeasurementResult,
  createOpticalCandidateResult,
  createVoiceCandidateResult,
  unavailableReasonForOptical,
  type CompanionResultDependencies,
  type CompanionUnavailableReason
} from "./result-model";
import styles from "./companion-stations.module.css";

type SubmitResult = (result: CompanionTaskResultRequest) => Promise<void>;

export type CompanionStationFactories = Readonly<{
  createOpticalProvider: (
    kind: OpticalProviderKind,
    snapshot: CompanionPhoneSnapshot
  ) => OpticalAssessmentProvider;
  createVoiceProvider: () => VoiceBiomarkerProvider;
}>;

export const defaultCompanionStationFactories: CompanionStationFactories = {
  createOpticalProvider: (kind, snapshot) =>
    createPatientOpticalProvider(kind, {
      vitalLensConsent: recordedVitalLensConsent(snapshot)
    }),
  createVoiceProvider: () => createLocalVoiceBiomarkerProvider({ captureDurationMs: 7_000 })
};

function recordedVitalLensConsent(snapshot: CompanionPhoneSnapshot): VitalLensConsentGateway {
  return {
    async requestConsent(input) {
      if (
        snapshot.task.kind !== "face_pulse" ||
        snapshot.consentState.status !== "granted" ||
        snapshot.consentState.version !== input.consentVersion
      ) {
        return { granted: false };
      }
      return {
        granted: true,
        consentVersion: snapshot.consentState.version,
        grantedAt: snapshot.consentState.grantedAt
      };
    }
  };
}

type SelectedCompanionStationProps = Readonly<{
  snapshot: CompanionPhoneSnapshot;
  submitResult: SubmitResult;
  dependencies: CompanionResultDependencies;
  factories?: CompanionStationFactories;
}>;

export function SelectedCompanionStation({
  snapshot,
  submitResult,
  dependencies,
  factories = defaultCompanionStationFactories
}: SelectedCompanionStationProps) {
  switch (snapshot.task.kind) {
    case "finger_pulse":
      return (
        <OpticalCompanionStation
          dependencies={dependencies}
          kind="finger_ppg"
          providerFactory={factories.createOpticalProvider}
          snapshot={snapshot}
          submitResult={submitResult}
        />
      );
    case "face_pulse":
      return (
        <OpticalCompanionStation
          dependencies={dependencies}
          kind="vitallens"
          providerFactory={factories.createOpticalProvider}
          snapshot={snapshot}
          submitResult={submitResult}
        />
      );
    case "voice_signal":
      return (
        <VoiceCompanionStation
          dependencies={dependencies}
          providerFactory={factories.createVoiceProvider}
          snapshot={snapshot}
          submitResult={submitResult}
        />
      );
    case "medication_label":
      return (
        <MedicationCompanionStation
          dependencies={dependencies}
          snapshot={snapshot}
          submitResult={submitResult}
        />
      );
  }
}

type OpticalPhase =
  "checking" | "ready" | "capturing" | "retry" | "failed" | "unavailable" | "handoff_error";

function opticalReasonText(result: OpticalAssessmentResult): string {
  if (result.status === "unavailable") {
    switch (result.reason) {
      case "permission_denied":
        return "Camera permission was not granted. No image or result was retained.";
      case "unsupported_device":
        return "This browser does not support the selected camera check.";
      case "network_unavailable":
        return "The secure processing connection was interrupted.";
      case "missing_configuration":
      case "provider_unavailable":
        return "The selected check is unavailable right now.";
    }
  }
  if (result.status === "retry" || result.status === "failed") {
    const reasons = result.quality.reasons;
    if (reasons.includes("motion")) return "Keep the phone and your hand or face steadier.";
    if (reasons.includes("weak_signal")) return "Move into brighter, even light and try again.";
    if (reasons.includes("saturation")) return "Reduce pressure or move away from harsh light.";
    if (reasons.includes("insufficient_duration")) return "Keep the position for the full check.";
    if (reasons.includes("cancelled")) return "Capture cancelled. No result was retained.";
    return "The deterministic quality check did not accept this capture.";
  }
  return "A quality-passing derived candidate is ready for workflow validation.";
}

function OpticalCompanionStation({
  snapshot,
  submitResult,
  dependencies,
  kind,
  providerFactory
}: Readonly<{
  snapshot: CompanionPhoneSnapshot;
  submitResult: SubmitResult;
  dependencies: CompanionResultDependencies;
  kind: OpticalProviderKind;
  providerFactory: CompanionStationFactories["createOpticalProvider"];
}>) {
  const [provider] = useState(() => providerFactory(kind, snapshot));
  const [captureContextId] = useState(() => dependencies.createId());
  const [phase, setPhase] = useState<OpticalPhase>("checking");
  const [feedback, setFeedback] = useState("Checking support. The camera has not started.");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [pendingResult, setPendingResult] = useState<CompanionTaskResultRequest | null>(null);
  const [unavailableReason, setUnavailableReason] =
    useState<CompanionUnavailableReason>("provider_unavailable");
  const abortRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const copy = taskContent(snapshot.task.kind);

  useEffect(() => {
    const controller = new AbortController();
    void provider
      .checkAvailability(controller.signal)
      .then((availability) => {
        if (controller.signal.aborted) return;
        if (availability.available) {
          setPhase("ready");
          setFeedback("Ready. Camera access is requested only when you start.");
        } else {
          setUnavailableReason(unavailableReasonForOptical(availability.reason));
          setPhase("unavailable");
          setFeedback(
            opticalReasonText({
              status: "unavailable",
              provider: kind,
              reason: availability.reason
            })
          );
        }
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setPhase("unavailable");
        setFeedback("The selected camera check is unavailable. No result was created.");
      });
    return () => controller.abort();
  }, [kind, provider]);

  useEffect(() => {
    if (phase !== "capturing") return;
    const startedAt = Date.now();
    const timer = globalThis.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1_000));
    }, 250);
    return () => globalThis.clearInterval(timer);
  }, [phase]);

  useEffect(
    () => () => {
      generationRef.current += 1;
      abortRef.current?.abort();
      void provider.dispose().catch(() => undefined);
    },
    [provider]
  );

  async function handoff(result: CompanionTaskResultRequest): Promise<void> {
    setPendingResult(result);
    try {
      await submitResult(result);
    } catch {
      setPhase("handoff_error");
      setFeedback("The derived result was not sent. Retry the secure handoff without recapturing.");
    }
  }

  async function startCapture(): Promise<void> {
    if (!["ready", "retry", "failed"].includes(phase)) return;
    const generation = ++generationRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    setElapsedSeconds(0);
    setPhase("capturing");
    setFeedback(copy.positioning);
    const result = await provider.capture({
      assessmentSessionId: captureContextId,
      signal: controller.signal
    });
    if (generation !== generationRef.current) return;
    abortRef.current = null;

    switch (result.status) {
      case "completed":
        setFeedback(opticalReasonText(result));
        await handoff(createOpticalCandidateResult(snapshot, result, dependencies));
        return;
      case "retry":
        setPhase("retry");
        setFeedback(opticalReasonText(result));
        return;
      case "failed":
        if (result.quality.reasons.includes("cancelled")) {
          setPhase("ready");
          setFeedback(opticalReasonText(result));
          return;
        }
        setPhase("failed");
        setFeedback(opticalReasonText(result));
        return;
      case "unavailable":
        setUnavailableReason(unavailableReasonForOptical(result.reason));
        setPhase("unavailable");
        setFeedback(opticalReasonText(result));
        return;
    }
  }

  function cancelCapture(): void {
    generationRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase("ready");
    setFeedback("Capture cancelled. No camera image or numeric result was retained.");
  }

  return (
    <section className={styles.station} aria-labelledby="selected-station-title">
      <p className={styles.eyebrow}>Selected for this round</p>
      <h1 id="selected-station-title">{copy.title}</h1>
      <p className={styles.lede}>{copy.positioning}</p>

      {phase === "capturing" ? (
        <div className={styles.progressGroup}>
          <div
            className={styles.capturePulse}
            role="progressbar"
            aria-label={`${copy.title} capture`}
            aria-valuetext={`${elapsedSeconds} seconds elapsed; keep position`}
          >
            <span />
          </div>
          <p>{elapsedSeconds} seconds · Keep the position until the check finishes.</p>
        </div>
      ) : null}

      <p className={styles.feedback} role={phase === "failed" ? "alert" : "status"}>
        {feedback}
      </p>

      <div className={styles.actions}>
        {["ready", "retry", "failed"].includes(phase) ? (
          <button className={styles.primary} type="button" onClick={() => void startCapture()}>
            {phase === "ready" ? copy.startLabel : "Try once more"}
          </button>
        ) : null}
        {phase === "capturing" ? (
          <button className={styles.secondary} type="button" onClick={cancelCapture}>
            Stop and discard
          </button>
        ) : null}
        {phase === "failed" ? (
          <button
            className={styles.secondary}
            type="button"
            onClick={() =>
              void handoff(
                createNonMeasurementResult(
                  snapshot,
                  "quality_rejected",
                  "quality_too_low",
                  dependencies
                )
              )
            }
          >
            Continue without a reading
          </button>
        ) : null}
        {phase === "unavailable" ? (
          <button
            className={styles.primary}
            type="button"
            onClick={() =>
              void handoff(
                createNonMeasurementResult(snapshot, "unavailable", unavailableReason, dependencies)
              )
            }
          >
            Continue without this check
          </button>
        ) : null}
        {phase === "handoff_error" && pendingResult ? (
          <button
            className={styles.primary}
            type="button"
            onClick={() => void handoff(pendingResult)}
          >
            Retry secure handoff
          </button>
        ) : null}
        {phase !== "capturing" && phase !== "handoff_error" ? (
          <button
            className={styles.linkButton}
            type="button"
            onClick={() =>
              void handoff(
                createNonMeasurementResult(snapshot, "declined", "patient_declined", dependencies)
              )
            }
          >
            Decline this optional check
          </button>
        ) : null}
      </div>

      <StationProvenance
        method={copy.method}
        privacy={
          kind === "finger_ppg"
            ? "Processed on this phone"
            : "Processed by the selected secure provider"
        }
      />
      {copy.laptopAlternative ? (
        <p className={styles.alternative}>{copy.laptopAlternative}</p>
      ) : null}
    </section>
  );
}

function VoiceCompanionStation({
  snapshot,
  submitResult,
  dependencies,
  providerFactory
}: Readonly<{
  snapshot: CompanionPhoneSnapshot;
  submitResult: SubmitResult;
  dependencies: CompanionResultDependencies;
  providerFactory: CompanionStationFactories["createVoiceProvider"];
}>) {
  const [provider] = useState(providerFactory);
  const [roundContextId] = useState(() => dependencies.createId());
  const [captureContextId] = useState(() => dependencies.createId());

  return (
    <div className={styles.embeddedStation}>
      <VoiceBiomarkerStation
        assessmentSessionId={captureContextId}
        consentConfirmed
        onCompleted={(fact) =>
          submitResult(createVoiceCandidateResult(snapshot, fact, dependencies))
        }
        onDeclined={() =>
          submitResult(
            createNonMeasurementResult(snapshot, "declined", "patient_declined", dependencies)
          )
        }
        onUnavailable={(reason) =>
          submitResult(
            createNonMeasurementResult(
              snapshot,
              "unavailable",
              reason === "unsupported_device"
                ? "unsupported_device"
                : reason === "permission_denied"
                  ? "permission_denied"
                  : "provider_unavailable",
              dependencies
            )
          )
        }
        provider={provider}
        roundId={roundContextId}
      />
    </div>
  );
}

type MedicationResult = Extract<
  CompanionTaskResultRequest,
  { taskKind: "medication_label"; outcome: "derived_candidate" }
>;
type MedicationField = MedicationResult["derived"]["fields"][number]["field"];

const MEDICATION_FIELDS = [
  { field: "product_name", label: "Product name" },
  { field: "strength", label: "Strength" },
  { field: "directions", label: "Directions on the label" },
  { field: "active_ingredient", label: "Active ingredient" }
] as const satisfies ReadonlyArray<{ field: MedicationField; label: string }>;

function MedicationCompanionStation({
  snapshot,
  submitResult,
  dependencies
}: Readonly<{
  snapshot: CompanionPhoneSnapshot;
  submitResult: SubmitResult;
  dependencies: CompanionResultDependencies;
}>) {
  const baseId = useId();
  const [values, setValues] = useState<Partial<Record<MedicationField, string>>>({});
  const [unknown, setUnknown] = useState<Partial<Record<MedicationField, boolean>>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [prepared, setPrepared] = useState<PreparedMedicationLabelImage | null>(null);
  const [feedback, setFeedback] = useState(
    "Use a synthetic, identifier-free label. The photo stays on this phone and is never sent."
  );
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingResult, setPendingResult] = useState<CompanionTaskResultRequest | null>(null);

  useEffect(
    () => () => {
      prepared?.clear();
    },
    [prepared]
  );

  async function chooseImage(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.currentTarget.files?.[0];
    if (!file || snapshot.consentState.status !== "granted") return;
    prepared?.clear();
    setPrepared(null);
    setBusy(true);
    const controller = new AbortController();
    try {
      const next = await prepareMedicationLabelImage({
        file,
        captureMode: "camera",
        consentVersion: snapshot.consentState.version,
        consentGrantedAt: snapshot.consentState.grantedAt,
        requestId: dependencies.createId(),
        signal: controller.signal
      });
      setPrepared(next);
      setFeedback(
        "Image quality is sufficient for you to read. HomeRounds has not extracted or confirmed any detail."
      );
    } catch (error: unknown) {
      setFeedback(
        error instanceof MedicationImageError
          ? "That image could not be checked safely. Retake it in even light or use text only."
          : "The image was cleared. Retake it or use text only."
      );
    } finally {
      setBusy(false);
      event.currentTarget.value = "";
    }
  }

  async function handoff(result: CompanionTaskResultRequest): Promise<void> {
    setPendingResult(result);
    setBusy(true);
    try {
      await submitResult(result);
      prepared?.clear();
      setPrepared(null);
    } catch {
      setFeedback("The confirmed details were not sent. Retry the handoff without another photo.");
    } finally {
      setBusy(false);
    }
  }

  function submitMedication(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!confirmed) {
      setFeedback("Confirm that you reviewed every entered or unknown detail before continuing.");
      return;
    }
    const fields: MedicationResult["derived"]["fields"] = [];
    for (const { field } of MEDICATION_FIELDS) {
      const value = values[field]?.trim() ?? "";
      if (unknown[field]) {
        fields.push({ field, status: "unknown", value: null });
      } else if (value) {
        fields.push({ field, status: "confirmed", value });
      }
    }
    if (fields.length === 0) {
      setFeedback("Enter at least one visible detail or mark it unknown.");
      return;
    }
    const result = CompanionTaskResultRequestSchema.parse({
      operationId: dependencies.createId(),
      expectedSessionVersion: snapshot.sessionVersion,
      taskId: snapshot.task.taskId,
      taskKind: "medication_label",
      clientObservedAt: dependencies.now(),
      rawMediaStored: false,
      outcome: "derived_candidate",
      derived: {
        source: prepared ? "image_review" : "text_entry",
        explicitlyConfirmed: true,
        fields
      }
    });
    void handoff(result);
  }

  function decline(): void {
    prepared?.clear();
    setPrepared(null);
    void handoff(
      createNonMeasurementResult(snapshot, "declined", "patient_declined", dependencies)
    );
  }

  return (
    <section className={styles.station} aria-labelledby={`${baseId}-title`}>
      <p className={styles.eyebrow}>Selected for this round</p>
      <h1 id={`${baseId}-title`}>Medication label check</h1>
      <p className={styles.lede}>
        Photograph one synthetic label as a temporary visual aid, or use the full text path. No
        image is uploaded, extracted, or retained.
      </p>

      <div className={styles.photoPanel}>
        {prepared ? (
          <figure className={styles.preview}>
            {/* eslint-disable-next-line @next/next/no-img-element -- local ephemeral blob */}
            <img src={prepared.previewUrl} alt="Temporary synthetic medication label preview" />
            <figcaption>Temporary on-phone preview · cleared when you finish</figcaption>
          </figure>
        ) : (
          <p>Place the label flat in even light and keep every edge inside the frame.</p>
        )}
        <button
          className={styles.secondary}
          type="button"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
        >
          {prepared ? "Retake label photo" : "Take label photo"}
        </button>
        <input
          ref={fileInputRef}
          className={styles.visuallyHidden}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          onChange={(event) => void chooseImage(event)}
        />
      </div>

      <form className={styles.form} onSubmit={submitMedication}>
        <fieldset disabled={busy}>
          <legend>Review only what you can see</legend>
          {MEDICATION_FIELDS.map(({ field, label }) => (
            <div className={styles.field} key={field}>
              <label htmlFor={`${baseId}-${field}`}>{label}</label>
              <input
                id={`${baseId}-${field}`}
                maxLength={240}
                value={values[field] ?? ""}
                disabled={unknown[field] === true}
                onChange={(event) =>
                  setValues((current) => ({ ...current, [field]: event.currentTarget.value }))
                }
              />
              <label className={styles.unknown}>
                <input
                  type="checkbox"
                  checked={unknown[field] === true}
                  onChange={(event) =>
                    setUnknown((current) => ({ ...current, [field]: event.currentTarget.checked }))
                  }
                />
                Mark as unknown or not visible
              </label>
            </div>
          ))}
        </fieldset>

        <label className={styles.confirmation}>
          <input
            type="checkbox"
            checked={confirmed}
            disabled={busy}
            onChange={(event) => setConfirmed(event.currentTarget.checked)}
          />
          <span>
            I reviewed these label observations. They do not change a medicine or provide dosing
            advice.
          </span>
        </label>

        <p className={styles.feedback} role="status">
          {feedback}
        </p>
        <div className={styles.actions}>
          <button className={styles.primary} type="submit" disabled={busy}>
            Confirm label observations
          </button>
          {pendingResult ? (
            <button
              className={styles.secondary}
              type="button"
              disabled={busy}
              onClick={() => void handoff(pendingResult)}
            >
              Retry secure handoff
            </button>
          ) : null}
          <button className={styles.linkButton} type="button" disabled={busy} onClick={decline}>
            Skip this optional review
          </button>
        </div>
      </form>

      <StationProvenance method="Manual label review" privacy="No image leaves this phone" />
      <p className={styles.alternative}>
        Prefer a larger screen? Text entry and image upload are also supported on your computer.
      </p>
    </section>
  );
}

function StationProvenance({ method, privacy }: Readonly<{ method: string; privacy: string }>) {
  return (
    <dl className={styles.provenance} aria-label="Check provenance">
      <div>
        <dt>Device</dt>
        <dd>This phone</dd>
      </div>
      <div>
        <dt>Browser</dt>
        <dd>Current secure browser session</dd>
      </div>
      <div>
        <dt>Method</dt>
        <dd>{method}</dd>
      </div>
      <div>
        <dt>Privacy</dt>
        <dd>{privacy}</dd>
      </div>
    </dl>
  );
}
