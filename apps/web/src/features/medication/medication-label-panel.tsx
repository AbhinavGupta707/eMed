/** @jsxRuntime automatic */
/** @jsxImportSource react */

"use client";

import {
  MedicationReviewItemSchema,
  type ConfirmedMedicationObservationFact,
  type MedicationLabelField,
  type MedicationLabelObservation,
  type MedicationLabelProposal,
  type MedicationReviewItem
} from "@homerounds/contracts/medication";
import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent } from "react";

import {
  DefaultMedicationCameraGateway,
  MedicationCameraError,
  MedicationImageError,
  createConfirmedMedicationObservationFact,
  prepareMedicationLabelImage,
  type MedicationCameraGateway,
  type MedicationLabelExtractionOutcome,
  type MedicationLabelProvider,
  type PreparedMedicationLabelImage,
  type PrepareMedicationLabelImageInput
} from "../../../../../packages/assessments/providers/medication-label";

import styles from "./medication-label.module.css";

const FIELD_DETAILS = [
  { field: "product_name", label: "Product name" },
  { field: "active_ingredient", label: "Active ingredient" },
  { field: "strength", label: "Strength shown on the label" },
  { field: "dose_form", label: "Form shown on the label" },
  { field: "directions", label: "Directions printed on the label" },
  { field: "expiry", label: "Expiry" },
  { field: "batch_number", label: "Batch number" }
] as const satisfies readonly { field: MedicationLabelField; label: string }[];

const FIELD_LABELS = new Map<MedicationLabelField, string>(
  FIELD_DETAILS.map(({ field, label }) => [field, label])
);

const defaultCamera = new DefaultMedicationCameraGateway();

type ReviewDisposition = "" | "accepted" | "corrected" | "not_visible";
type ReviewDraft = Readonly<{ disposition: ReviewDisposition; value: string }>;
type ReviewDrafts = Partial<Record<MedicationLabelField, ReviewDraft>>;
type StatusTone = "information" | "error" | "success";
type StatusMessage = Readonly<{
  message: string;
  tone: StatusTone;
  focusToken: number;
}>;

export type MedicationLabelPanelProps = Readonly<{
  roundId: string;
  stateVersion: number;
  consentVersion: string;
  provider: MedicationLabelProvider;
  onConfirmed: (fact: ConfirmedMedicationObservationFact) => Promise<void>;
  camera?: MedicationCameraGateway;
  prepareImage?: (input: PrepareMedicationLabelImageInput) => Promise<PreparedMedicationLabelImage>;
  createId?: () => string;
  now?: () => string;
}>;

function defaultId(): string {
  return globalThis.crypto.randomUUID();
}

function defaultNow(): string {
  return new Date().toISOString();
}

function emptyTextDrafts(): ReviewDrafts {
  return {};
}

function observationStatus(observation: MedicationLabelObservation): string {
  switch (observation.status) {
    case "detected":
      return "Detected draft — review required";
    case "uncertain":
      return "Uncertain draft — check carefully";
    case "missing":
      return "Not detected — enter it or mark not visible";
  }
}

function extractionFailureMessage(outcome: MedicationLabelExtractionOutcome): string {
  if (outcome.status === "proposed") return "Review the extracted draft.";
  switch (outcome.failure.code) {
    case "missing_configuration":
      return "Image extraction is not configured. Complete this step with text.";
    case "authentication_failed":
    case "provider_unavailable":
      return "Image extraction is unavailable. Your image was cleared; continue with text or try again.";
    case "timeout":
      return "Image extraction timed out. Your image was cleared; continue with text or try again.";
    case "rate_limited":
      return "Image extraction is temporarily busy. Your image was cleared; continue with text.";
    case "malformed_response":
    case "contract_rejected":
      return "The extraction result could not be read safely. Your image was cleared; continue with text.";
    case "cancelled":
      return "Image extraction was cancelled and the temporary image was cleared.";
  }
}

function imageErrorMessage(error: MedicationImageError): string {
  switch (error.code) {
    case "unsupported_type":
      return "Choose a JPEG, PNG, or WebP image.";
    case "file_too_large":
      return "Choose an image no larger than 5 MB.";
    case "dimensions_out_of_bounds":
      return "Choose an image between 320 and 8,192 pixels in both dimensions.";
    case "malformed_image":
      return "That image could not be read safely. Choose another image or enter the label as text.";
    case "cancelled":
      return "Image preparation was cancelled and temporary image data was cleared.";
  }
}

function cameraErrorMessage(error: MedicationCameraError): string {
  switch (error.code) {
    case "permission_denied":
      return "Camera access was denied. Change browser permission and try again, upload an image, or use text.";
    case "unsupported_camera":
      return "Camera capture is not supported on this device. Upload an image or use text.";
    case "cancelled":
      return "Camera capture was cancelled. You can upload an image or use text.";
    case "camera_failure":
      return "The camera could not be opened safely. Upload an image or use text.";
  }
}

export function MedicationLabelPanel(props: MedicationLabelPanelProps) {
  return <MedicationLabelPanelSession {...props} key={`${props.roundId}:${props.stateVersion}`} />;
}

function MedicationLabelPanelSession({
  roundId,
  stateVersion,
  consentVersion,
  provider,
  onConfirmed,
  camera = defaultCamera,
  prepareImage = prepareMedicationLabelImage,
  createId = defaultId,
  now = defaultNow
}: MedicationLabelPanelProps) {
  const baseId = useId();
  const headingId = `${baseId}-medication-heading`;
  const imageHelpId = `${baseId}-image-help`;
  const textHelpId = `${baseId}-text-help`;
  const statusRef = useRef<HTMLParagraphElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const activeControllerRef = useRef<AbortController | undefined>(undefined);
  const preparedImageRef = useRef<PreparedMedicationLabelImage | undefined>(undefined);
  const confirmationPendingRef = useRef(false);
  const focusTokenRef = useRef(0);
  const [imageConsent, setImageConsent] = useState(false);
  const [imageAvailability, setImageAvailability] = useState<{
    provider: MedicationLabelProvider;
    value: boolean | null;
  }>({ provider, value: null });
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [proposal, setProposal] = useState<MedicationLabelProposal | null>(null);
  const [imageDrafts, setImageDrafts] = useState<ReviewDrafts>({});
  const [imageConfirmation, setImageConfirmation] = useState(false);
  const [textDrafts, setTextDrafts] = useState<ReviewDrafts>(emptyTextDrafts);
  const [textConfirmation, setTextConfirmation] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [confirmationPending, setConfirmationPending] = useState(false);
  const [status, setStatus] = useState<StatusMessage>({
    message: "Choose an image or use the complete text-entry path.",
    tone: "information",
    focusToken: 0
  });
  const imageAvailable = imageAvailability.provider === provider ? imageAvailability.value : null;

  function announce(message: string, tone: StatusTone, focus = false): void {
    if (focus) focusTokenRef.current += 1;
    setStatus({ message, tone, focusToken: focus ? focusTokenRef.current : 0 });
  }

  function clearPreparedImage(): void {
    preparedImageRef.current?.clear();
    preparedImageRef.current = undefined;
    setPreviewUrl(null);
  }

  function abortActive(): void {
    activeControllerRef.current?.abort();
    activeControllerRef.current = undefined;
    clearPreparedImage();
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (uploadInputRef.current) uploadInputRef.current.value = "";
  }

  useEffect(() => {
    const controller = new AbortController();
    void provider
      .checkAvailability(controller.signal)
      .then((availability) => {
        if (controller.signal.aborted) return;
        setImageAvailability({ provider, value: availability.available });
        if (!availability.available) {
          announce(
            "Image extraction is unavailable. The complete text-entry path remains available.",
            "information"
          );
        }
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setImageAvailability({ provider, value: false });
        announce(
          "Image extraction is unavailable. The complete text-entry path remains available.",
          "information"
        );
      });
    return () => controller.abort();
  }, [provider]);

  useEffect(() => {
    if (status.focusToken > 0) statusRef.current?.focus();
  }, [status.focusToken]);

  useEffect(
    () => () => {
      activeControllerRef.current?.abort();
      preparedImageRef.current?.clear();
      preparedImageRef.current = undefined;
    },
    []
  );

  const imageReviewItems = useMemo(() => {
    if (!proposal) return null;
    const items: MedicationReviewItem[] = [];
    for (const observation of proposal.observations) {
      const draft = imageDrafts[observation.field];
      if (!draft || draft.disposition === "") return null;
      const candidate = {
        field: observation.field,
        disposition: draft.disposition,
        reviewedValue:
          draft.disposition === "not_visible"
            ? null
            : draft.disposition === "accepted"
              ? observation.value
              : draft.value
      };
      const parsed = MedicationReviewItemSchema.safeParse(candidate);
      if (!parsed.success) return null;
      items.push(parsed.data);
    }
    return items;
  }, [imageDrafts, proposal]);

  const textReviewItems = useMemo(() => {
    const items: MedicationReviewItem[] = [];
    for (const { field } of FIELD_DETAILS) {
      const draft = textDrafts[field];
      if (!draft || draft.disposition === "") continue;
      const parsed = MedicationReviewItemSchema.safeParse({
        field,
        disposition: draft.disposition,
        reviewedValue: draft.disposition === "not_visible" ? null : draft.value
      });
      if (!parsed.success) return null;
      items.push(parsed.data);
    }
    return items.length > 0 ? items : null;
  }, [textDrafts]);

  async function processImage(file: File, captureMode: "camera" | "file_upload") {
    if (!imageConsent || confirmed || imageAvailable !== true) {
      announce(
        "Confirm synthetic-image consent before choosing an image, or use text entry.",
        "error",
        true
      );
      return;
    }

    abortActive();
    const controller = new AbortController();
    activeControllerRef.current = controller;
    setBusy(true);
    setProposal(null);
    setImageDrafts({});
    setImageConfirmation(false);
    announce("Checking the temporary image…", "information");
    let prepared: PreparedMedicationLabelImage | undefined;

    try {
      const consentGrantedAt = now();
      prepared = await prepareImage({
        file,
        captureMode,
        consentVersion,
        consentGrantedAt,
        requestId: createId(),
        signal: controller.signal
      });
      if (controller.signal.aborted) return;
      preparedImageRef.current = prepared;
      setPreviewUrl(prepared.previewUrl);
      announce("Extracting a bounded draft for your review…", "information");

      const outcome = await provider.extract({
        roundId,
        stateVersion,
        metadata: prepared.metadata,
        bytes: prepared.bytes,
        signal: controller.signal
      });
      if (controller.signal.aborted) {
        announce(
          "Image extraction was cancelled and the temporary image was cleared.",
          "information"
        );
        return;
      }
      if (outcome.status === "failed") {
        announce(extractionFailureMessage(outcome), "error", true);
        return;
      }

      setProposal(outcome.proposal);
      setImageDrafts(
        Object.fromEntries(
          outcome.proposal.observations.map(({ field }) => [field, { disposition: "", value: "" }])
        ) as ReviewDrafts
      );
      announce(
        "Extraction complete. Review every item; no medication change has been made.",
        "success",
        true
      );
    } catch (error: unknown) {
      if (error instanceof MedicationImageError) {
        announce(
          imageErrorMessage(error),
          error.code === "cancelled" ? "information" : "error",
          true
        );
      } else {
        announce(
          "The image could not be prepared safely. Temporary image data was cleared; use another image or text.",
          "error",
          true
        );
      }
    } finally {
      prepared?.clear();
      if (preparedImageRef.current === prepared) preparedImageRef.current = undefined;
      if (activeControllerRef.current === controller) activeControllerRef.current = undefined;
      setPreviewUrl(null);
      setBusy(false);
      if (cameraInputRef.current) cameraInputRef.current.value = "";
      if (uploadInputRef.current) uploadInputRef.current.value = "";
    }
  }

  async function requestCamera(): Promise<void> {
    if (!imageConsent || imageAvailable !== true || confirmed) return;
    abortActive();
    const controller = new AbortController();
    activeControllerRef.current = controller;
    setBusy(true);
    announce("Checking camera support and permission…", "information");
    try {
      await camera.requestAccess(controller.signal);
      if (controller.signal.aborted) return;
      cameraInputRef.current?.click();
      announce("Camera is ready. Take a synthetic-demo label photo.", "information");
    } catch (error: unknown) {
      const safeError =
        error instanceof MedicationCameraError
          ? error
          : new MedicationCameraError("camera_failure");
      announce(
        cameraErrorMessage(safeError),
        safeError.code === "cancelled" ? "information" : "error",
        true
      );
    } finally {
      if (activeControllerRef.current === controller) activeControllerRef.current = undefined;
      setBusy(false);
    }
  }

  function cancel(): void {
    abortActive();
    setBusy(false);
    announce(
      "Cancelled. Temporary image data was cleared; text entry remains available.",
      "information",
      true
    );
  }

  async function confirmImageReview(): Promise<void> {
    if (
      !proposal ||
      !imageReviewItems ||
      !imageConfirmation ||
      confirmed ||
      confirmationPendingRef.current
    ) {
      return;
    }
    const fact = createConfirmedMedicationObservationFact({
      source: "image_review",
      proposal,
      roundId,
      stateVersion,
      reviewItems: imageReviewItems,
      explicitlyConfirmed: imageConfirmation,
      createId,
      now
    });
    if (!fact) {
      announce("Review every extracted item before confirming.", "error", true);
      return;
    }
    confirmationPendingRef.current = true;
    setConfirmationPending(true);
    announce("Handing off the confirmed observations…", "information");
    try {
      await onConfirmed(fact);
      setConfirmed(true);
      setProposal(null);
      setImageDrafts({});
      setImageConfirmation(false);
      announce(
        "Medication observations confirmed. This did not diagnose, advise dosing, or request a medication change.",
        "success",
        true
      );
    } catch {
      announce(
        "The confirmed observation was not accepted. Your review is unchanged; please try again.",
        "error",
        true
      );
    } finally {
      confirmationPendingRef.current = false;
      setConfirmationPending(false);
    }
  }

  async function confirmTextReview(): Promise<void> {
    if (!textReviewItems || !textConfirmation || confirmed || confirmationPendingRef.current) {
      return;
    }
    const fact = createConfirmedMedicationObservationFact({
      source: "text_entry",
      roundId,
      stateVersion,
      reviewItems: textReviewItems,
      explicitlyConfirmed: textConfirmation,
      createId,
      now
    });
    if (!fact) {
      announce("Enter or mark at least one field, then explicitly confirm it.", "error", true);
      return;
    }
    confirmationPendingRef.current = true;
    setConfirmationPending(true);
    announce("Handing off the confirmed observations…", "information");
    try {
      await onConfirmed(fact);
      setConfirmed(true);
      setTextDrafts(emptyTextDrafts());
      setTextConfirmation(false);
      announce(
        "Text-entered medication observations confirmed without model provenance. This did not request a medication change.",
        "success",
        true
      );
    } catch {
      announce(
        "The confirmed observation was not accepted. Your review is unchanged; please try again.",
        "error",
        true
      );
    } finally {
      confirmationPendingRef.current = false;
      setConfirmationPending(false);
    }
  }

  const imageControlsDisabled =
    busy || confirmed || confirmationPending || !imageConsent || imageAvailable !== true;

  return (
    <section className={styles.panel} aria-labelledby={headingId}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Synthetic-demo medication check</p>
          <h2 id={headingId}>Review what a medication label shows</h2>
        </div>
        <span className={styles.boundaryBadge}>Confirmation required</span>
      </header>

      <div className={styles.safetyBoundary}>
        <strong>Prototype boundary:</strong> use only a synthetic demo label with no person’s name,
        pharmacy details, prescription number, barcode, or other identifier. Extraction may be
        wrong. It cannot diagnose, give dosing advice, or change a medication.
      </div>

      <p
        ref={statusRef}
        className={styles.status}
        data-tone={status.tone}
        role={status.tone === "error" ? "alert" : "status"}
        aria-live={status.tone === "error" ? "assertive" : "polite"}
        aria-atomic="true"
        tabIndex={-1}
      >
        <strong>Status:</strong> {status.message}
      </p>

      <fieldset className={styles.section} disabled={confirmed || confirmationPending}>
        <legend>Option 1: temporary image</legend>
        <p id={imageHelpId} className={styles.help}>
          JPEG, PNG, or WebP only; maximum 5 MB; 320–8,192 pixels per side. The preview and byte
          buffer are cleared after extraction, cancellation, or failure. Nothing is confirmed
          automatically.
        </p>
        <label className={styles.consentRow}>
          <input
            type="checkbox"
            checked={imageConsent}
            disabled={busy || confirmed}
            onChange={(event) => setImageConsent(event.currentTarget.checked)}
          />
          <span>
            I will use only a synthetic, identifier-free demo label and consent to this one
            temporary image extraction.
          </span>
        </label>
        <p className={styles.availability}>
          Image extraction:{" "}
          {imageAvailable === null
            ? "checking"
            : imageAvailable
              ? "available"
              : "unavailable — use text entry"}
        </p>
        <div className={styles.controls} aria-describedby={imageHelpId}>
          <button
            className={styles.primaryButton}
            type="button"
            disabled={imageControlsDisabled}
            onClick={() => void requestCamera()}
          >
            Take label photo
          </button>
          <button
            className={styles.secondaryButton}
            type="button"
            disabled={imageControlsDisabled}
            onClick={() => uploadInputRef.current?.click()}
          >
            Upload label image
          </button>
          {busy ? (
            <button className={styles.cancelButton} type="button" onClick={cancel}>
              Cancel and clear image
            </button>
          ) : null}
        </div>
        <input
          ref={cameraInputRef}
          className={styles.visuallyHidden}
          data-testid="medication-camera-input"
          type="file"
          tabIndex={-1}
          aria-hidden="true"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            const file = event.currentTarget.files?.[0];
            if (file) void processImage(file, "camera");
          }}
        />
        <input
          ref={uploadInputRef}
          className={styles.visuallyHidden}
          data-testid="medication-upload-input"
          type="file"
          tabIndex={-1}
          aria-hidden="true"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            const file = event.currentTarget.files?.[0];
            if (file) void processImage(file, "file_upload");
          }}
        />
        {previewUrl ? (
          <figure className={styles.preview}>
            {/* The blob URL is ephemeral and revoked in every terminal request path. */}
            {/* eslint-disable-next-line @next/next/no-img-element -- Ephemeral blob previews cannot use the Next image optimizer. */}
            <img src={previewUrl} alt="Temporary medication label preview" />
            <figcaption>Temporary preview — it will be cleared after extraction.</figcaption>
          </figure>
        ) : null}

        {proposal ? (
          <div className={styles.review} aria-labelledby={`${baseId}-review-heading`}>
            <div className={styles.reviewHeading}>
              <h3 id={`${baseId}-review-heading`}>Review the unconfirmed draft</h3>
              <span className={styles.draftBadge}>
                {proposal.provenance.provider === "fake"
                  ? "Synthetic fixture draft"
                  : "AI-assisted draft"}
              </span>
            </div>
            <p className={styles.help}>
              Choose accept, edit, or not visible for every item. Uncertain and missing details are
              preserved until you decide.
            </p>
            {proposal.observations.map((observation) => {
              const draft = imageDrafts[observation.field] ?? { disposition: "", value: "" };
              const fieldLabel = FIELD_LABELS.get(observation.field) ?? observation.field;
              const selectId = `${baseId}-image-${observation.field}-disposition`;
              const valueId = `${baseId}-image-${observation.field}-value`;
              return (
                <div className={styles.reviewItem} key={observation.field}>
                  <div>
                    <h4>{fieldLabel}</h4>
                    <p className={styles.observationStatus}>{observationStatus(observation)}</p>
                    <p className={styles.draftValue}>
                      Draft value: {observation.value ?? "No value detected"}
                    </p>
                  </div>
                  <label htmlFor={selectId}>Your review</label>
                  <select
                    id={selectId}
                    value={draft.disposition}
                    onChange={(event) => {
                      const disposition = event.currentTarget.value as ReviewDisposition;
                      setImageDrafts((current) => ({
                        ...current,
                        [observation.field]: {
                          disposition,
                          value:
                            disposition === "corrected"
                              ? (current[observation.field]?.value ?? "")
                              : ""
                        }
                      }));
                    }}
                  >
                    <option value="">Choose a disposition</option>
                    <option value="accepted" disabled={observation.value === null}>
                      Accept as shown
                    </option>
                    <option value="corrected">Edit the value</option>
                    <option value="not_visible">Not visible</option>
                  </select>
                  {draft.disposition === "corrected" ? (
                    <label className={styles.valueField} htmlFor={valueId}>
                      Corrected {fieldLabel.toLowerCase()}
                      <input
                        id={valueId}
                        type="text"
                        maxLength={240}
                        value={draft.value}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setImageDrafts((current) => ({
                            ...current,
                            [observation.field]: { disposition: "corrected", value }
                          }));
                        }}
                      />
                    </label>
                  ) : null}
                </div>
              );
            })}
            {proposal.missingInformation.length > 0 ? (
              <div className={styles.missingInformation}>
                <strong>Still missing or unclear:</strong>
                <ul>
                  {proposal.missingInformation.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <label className={styles.confirmationRow}>
              <input
                type="checkbox"
                checked={imageConfirmation}
                onChange={(event) => setImageConfirmation(event.currentTarget.checked)}
              />
              <span>
                I reviewed every item and confirm these observations only. I understand this does
                not request a medication change.
              </span>
            </label>
            <button
              className={styles.confirmButton}
              type="button"
              disabled={!imageConfirmation || imageReviewItems === null}
              onClick={() => void confirmImageReview()}
            >
              {confirmationPending ? "Confirming observations…" : "Confirm reviewed observations"}
            </button>
          </div>
        ) : null}
      </fieldset>

      <fieldset className={styles.section} disabled={confirmed || confirmationPending}>
        <legend>Option 2: complete text entry</legend>
        <p id={textHelpId} className={styles.help}>
          This path does not use an image or claim AI/model provenance. Enter only synthetic demo
          details. Choose “not visible” to preserve missing information; leave unrelated fields
          unselected.
        </p>
        <div className={styles.textGrid} aria-describedby={textHelpId}>
          {FIELD_DETAILS.map(({ field, label }) => {
            const draft = textDrafts[field] ?? { disposition: "", value: "" };
            const selectId = `${baseId}-text-${field}-disposition`;
            const valueId = `${baseId}-text-${field}-value`;
            return (
              <div className={styles.textItem} key={field}>
                <label htmlFor={selectId}>{label}</label>
                <select
                  id={selectId}
                  value={draft.disposition}
                  onChange={(event) => {
                    const disposition = event.currentTarget.value as ReviewDisposition;
                    setTextDrafts((current) => ({
                      ...current,
                      [field]: {
                        disposition,
                        value: disposition === "corrected" ? (current[field]?.value ?? "") : ""
                      }
                    }));
                  }}
                >
                  <option value="">Leave unselected</option>
                  <option value="corrected">Enter label text</option>
                  <option value="not_visible">Not visible</option>
                </select>
                {draft.disposition === "corrected" ? (
                  <label className={styles.valueField} htmlFor={valueId}>
                    {label} text
                    <input
                      id={valueId}
                      type="text"
                      maxLength={240}
                      value={draft.value}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setTextDrafts((current) => ({
                          ...current,
                          [field]: { disposition: "corrected", value }
                        }));
                      }}
                    />
                  </label>
                ) : null}
              </div>
            );
          })}
        </div>
        <label className={styles.confirmationRow}>
          <input
            type="checkbox"
            checked={textConfirmation}
            onChange={(event) => setTextConfirmation(event.currentTarget.checked)}
          />
          <span>
            I reviewed and confirm these text-entered observations. I understand this does not
            provide advice or request a medication change.
          </span>
        </label>
        <button
          className={styles.confirmButton}
          type="button"
          disabled={!textConfirmation || textReviewItems === null}
          onClick={() => void confirmTextReview()}
        >
          {confirmationPending ? "Confirming observations…" : "Confirm text-entered observations"}
        </button>
      </fieldset>
    </section>
  );
}
