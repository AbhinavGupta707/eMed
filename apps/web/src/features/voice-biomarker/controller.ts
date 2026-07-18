import {
  VoiceBiomarkerAssessmentResultSchema,
  type VoiceBiomarkerFact,
  type VoiceBiomarkerProvider,
  type VoiceBiomarkerQuality,
  type VoiceBiomarkerUnavailableReason
} from "@homerounds/contracts";

type IntervalHandle = ReturnType<typeof globalThis.setInterval>;
type VoiceBiomarkerQualityReason = VoiceBiomarkerQuality["reasons"][number];

export type VoiceBiomarkerTimer = Readonly<{
  now: () => number;
  setInterval: (callback: () => void, intervalMs: number) => IntervalHandle;
  clearInterval: (handle: IntervalHandle) => void;
}>;

export type VoiceBiomarkerStationPhase =
  | "checking"
  | "ready"
  | "capturing"
  | "retry"
  | "failed"
  | "saving"
  | "completed"
  | "unavailable"
  | "declining"
  | "declined"
  | "handoff_error";

export type VoiceBiomarkerStationSnapshot = Readonly<{
  phase: VoiceBiomarkerStationPhase;
  consent: boolean;
  elapsedMs: number;
  targetDurationMs: number;
  quality: VoiceBiomarkerQuality | null;
  fact: VoiceBiomarkerFact | null;
  unavailableReason: VoiceBiomarkerUnavailableReason | null;
  announcement: string;
  focusToken: number;
}>;

export type VoiceBiomarkerStationControllerDependencies = Readonly<{
  provider: VoiceBiomarkerProvider;
  roundId: string;
  assessmentSessionId: string;
  onCompleted: (fact: VoiceBiomarkerFact) => Promise<void>;
  onDeclined?: () => Promise<void>;
  onUnavailable?: (reason: VoiceBiomarkerUnavailableReason) => Promise<void>;
  timer?: VoiceBiomarkerTimer;
  targetDurationMs?: number;
}>;

const defaultTimer: VoiceBiomarkerTimer = {
  now: () => Date.now(),
  setInterval: (callback, intervalMs) => globalThis.setInterval(callback, intervalMs),
  clearInterval: (handle) => globalThis.clearInterval(handle)
};

export function voiceQualityReasonText(reason: VoiceBiomarkerQualityReason): string {
  switch (reason) {
    case "insufficient_duration":
      return "The sustained sound was too short.";
    case "excessive_noise":
      return "Background noise was too high.";
    case "clipping":
      return "The microphone signal was distorted or clipped.";
    case "insufficient_voiced_audio":
      return "There was not enough steady voiced sound.";
    case "unstable_pitch":
      return "The sustained sound changed too much for this quality check.";
    case "cancelled":
      return "The capture was cancelled.";
  }
}

export function voiceUnavailableReasonText(reason: VoiceBiomarkerUnavailableReason): string {
  switch (reason) {
    case "unsupported_device":
      return "This browser or device does not support the local voice-signal station.";
    case "permission_denied":
      return "Microphone permission was denied. Change the browser permission to try again, or decline this optional station.";
    case "microphone_unavailable":
      return "A microphone is not available. You can decline this optional station.";
  }
}

export class VoiceBiomarkerStationController {
  readonly #provider: VoiceBiomarkerProvider;
  readonly #roundId: string;
  readonly #assessmentSessionId: string;
  #onCompleted: (fact: VoiceBiomarkerFact) => Promise<void>;
  #onDeclined: (() => Promise<void>) | null;
  #onUnavailable: ((reason: VoiceBiomarkerUnavailableReason) => Promise<void>) | null;
  readonly #timer: VoiceBiomarkerTimer;
  readonly #listeners = new Set<() => void>();
  #snapshot: VoiceBiomarkerStationSnapshot;
  #abortController: AbortController | null = null;
  #intervalHandle: IntervalHandle | null = null;
  #captureStartedAt = 0;
  #operationGeneration = 0;
  #disposed = false;

  constructor(dependencies: VoiceBiomarkerStationControllerDependencies) {
    this.#provider = dependencies.provider;
    this.#roundId = dependencies.roundId;
    this.#assessmentSessionId = dependencies.assessmentSessionId;
    this.#onCompleted = dependencies.onCompleted;
    this.#onDeclined = dependencies.onDeclined ?? null;
    this.#onUnavailable = dependencies.onUnavailable ?? null;
    this.#timer = dependencies.timer ?? defaultTimer;
    this.#snapshot = {
      phase: "checking",
      consent: false,
      elapsedMs: 0,
      targetDurationMs: dependencies.targetDurationMs ?? 7_000,
      quality: null,
      fact: null,
      unavailableReason: null,
      announcement: "Checking local microphone availability. No capture has started.",
      focusToken: 0
    };
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  readonly getSnapshot = (): VoiceBiomarkerStationSnapshot => this.#snapshot;

  setHandlers(handlers: {
    onCompleted: (fact: VoiceBiomarkerFact) => Promise<void>;
    onDeclined?: () => Promise<void>;
    onUnavailable?: (reason: VoiceBiomarkerUnavailableReason) => Promise<void>;
  }): void {
    this.#onCompleted = handlers.onCompleted;
    this.#onDeclined = handlers.onDeclined ?? null;
    this.#onUnavailable = handlers.onUnavailable ?? null;
  }

  async initialize(): Promise<void> {
    if (this.#disposed || this.#snapshot.phase !== "checking") return;
    const generation = ++this.#operationGeneration;
    const controller = new AbortController();
    this.#abortController = controller;
    try {
      const availability = await this.#provider.checkAvailability(controller.signal);
      if (!this.#isCurrent(generation)) return;
      this.#abortController = null;
      if (availability.available) {
        this.#setSnapshot({
          ...this.#snapshot,
          phase: "ready",
          announcement:
            "Local microphone is available. Consent is required before the optional capture."
        });
      } else {
        this.#showUnavailable(availability.reason);
      }
    } catch {
      if (!this.#isCurrent(generation)) return;
      this.#abortController = null;
      this.#showUnavailable("microphone_unavailable");
    }
  }

  setConsent(consent: boolean): void {
    if (this.#snapshot.phase === "capturing" || this.#snapshot.phase === "saving") return;
    if (["completed", "declined", "declining"].includes(this.#snapshot.phase)) return;
    this.#setSnapshot({
      ...this.#snapshot,
      consent,
      announcement: consent
        ? "Consent recorded for one separate local sustained-vowel capture."
        : "Consent is not selected. No capture can start."
    });
  }

  async startCapture(): Promise<void> {
    if (
      this.#disposed ||
      this.#snapshot.phase === "capturing" ||
      this.#snapshot.phase === "saving"
    ) {
      return;
    }
    if (!this.#snapshot.consent) {
      this.#setSnapshot({
        ...this.#snapshot,
        announcement: "Select consent before starting this optional local capture.",
        focusToken: this.#snapshot.focusToken + 1
      });
      return;
    }
    if (!["ready", "retry", "failed"].includes(this.#snapshot.phase)) return;

    const generation = ++this.#operationGeneration;
    const controller = new AbortController();
    this.#abortController = controller;
    this.#captureStartedAt = this.#timer.now();
    this.#setSnapshot({
      ...this.#snapshot,
      phase: "capturing",
      elapsedMs: 0,
      quality: null,
      fact: null,
      unavailableReason: null,
      announcement:
        "Capture in progress. Sustain a comfortable ‘ah’ sound; stop if you are uncomfortable."
    });
    this.#intervalHandle = this.#timer.setInterval(() => this.#updateElapsed(generation), 100);

    try {
      const result = VoiceBiomarkerAssessmentResultSchema.parse(
        await this.#provider.capture({
          roundId: this.#roundId,
          assessmentSessionId: this.#assessmentSessionId,
          signal: controller.signal
        })
      );
      if (!this.#isCurrent(generation)) return;
      this.#abortController = null;
      this.#clearTimer();

      switch (result.status) {
        case "completed":
          await this.#completePassingCapture(result.fact, generation);
          return;
        case "retry":
          this.#setSnapshot({
            ...this.#snapshot,
            phase: "retry",
            elapsedMs: result.quality.metrics.durationMs,
            quality: result.quality,
            fact: null,
            announcement:
              "Quality check needs a retry. No research signal or measurement was created.",
            focusToken: this.#snapshot.focusToken + 1
          });
          return;
        case "failed":
          this.#setSnapshot({
            ...this.#snapshot,
            phase: "failed",
            elapsedMs: result.quality.metrics.durationMs,
            quality: result.quality,
            fact: null,
            announcement:
              "Quality check failed. No research signal or measurement was created; you may try again or decline.",
            focusToken: this.#snapshot.focusToken + 1
          });
          return;
        case "unavailable":
          this.#showUnavailable(result.reason);
          return;
      }
    } catch {
      if (!this.#isCurrent(generation)) return;
      this.#abortController = null;
      this.#clearTimer();
      this.#setSnapshot({
        ...this.#snapshot,
        phase: "failed",
        quality: null,
        fact: null,
        announcement:
          "The local capture could not be checked safely. No result was created; try again or decline.",
        focusToken: this.#snapshot.focusToken + 1
      });
    }
  }

  cancelCapture(): void {
    if (this.#snapshot.phase !== "capturing") return;
    ++this.#operationGeneration;
    this.#abortController?.abort();
    this.#abortController = null;
    this.#clearTimer();
    this.#setSnapshot({
      ...this.#snapshot,
      phase: "ready",
      elapsedMs: 0,
      quality: null,
      fact: null,
      announcement: "Capture cancelled. No voice result was created or retained.",
      focusToken: this.#snapshot.focusToken + 1
    });
  }

  async decline(): Promise<void> {
    if (this.#disposed || ["declined", "declining", "completed"].includes(this.#snapshot.phase)) {
      return;
    }
    ++this.#operationGeneration;
    this.#abortController?.abort();
    this.#abortController = null;
    this.#clearTimer();
    this.#setSnapshot({
      ...this.#snapshot,
      phase: "declining",
      fact: null,
      quality: null,
      announcement: "Recording your choice to decline this optional research station."
    });
    try {
      await this.#onDeclined?.();
      if (this.#disposed) return;
      this.#setSnapshot({
        ...this.#snapshot,
        phase: "declined",
        consent: false,
        announcement: "Voice-signal station declined. No capture or research signal was retained.",
        focusToken: this.#snapshot.focusToken + 1
      });
    } catch {
      if (this.#disposed) return;
      this.#setSnapshot({
        ...this.#snapshot,
        phase: "failed",
        announcement:
          "The decline choice was not accepted. No capture started; try declining again.",
        focusToken: this.#snapshot.focusToken + 1
      });
    }
  }

  async continueUnavailable(): Promise<void> {
    const reason = this.#snapshot.unavailableReason;
    if (this.#disposed || this.#snapshot.phase !== "unavailable" || reason === null) return;
    this.#setSnapshot({
      ...this.#snapshot,
      phase: "declining",
      announcement: "Recording that this optional voice station is unavailable."
    });
    try {
      await this.#onUnavailable?.(reason);
      if (this.#disposed) return;
      this.#setSnapshot({
        ...this.#snapshot,
        phase: "declined",
        consent: false,
        announcement: "Voice station recorded as unavailable. No capture or result was retained.",
        focusToken: this.#snapshot.focusToken + 1
      });
    } catch {
      if (this.#disposed) return;
      this.#setSnapshot({
        ...this.#snapshot,
        phase: "unavailable",
        announcement:
          "The unavailable result was not sent. No capture started; try the handoff again.",
        focusToken: this.#snapshot.focusToken + 1
      });
    }
  }

  async retryHandoff(): Promise<void> {
    if (this.#snapshot.phase !== "handoff_error" || this.#snapshot.fact === null) return;
    const generation = ++this.#operationGeneration;
    await this.#completePassingCapture(this.#snapshot.fact, generation);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    ++this.#operationGeneration;
    this.#abortController?.abort();
    this.#abortController = null;
    this.#clearTimer();
    this.#listeners.clear();
    void this.#provider.dispose().catch(() => undefined);
  }

  async #completePassingCapture(fact: VoiceBiomarkerFact, generation: number): Promise<void> {
    this.#setSnapshot({
      ...this.#snapshot,
      phase: "saving",
      elapsedMs: fact.durationMs,
      quality: fact.quality,
      fact,
      announcement:
        "Quality passed. Handing off derived features only; raw audio is not part of this result."
    });
    try {
      await this.#onCompleted(fact);
      if (!this.#isCurrent(generation)) return;
      this.#setSnapshot({
        ...this.#snapshot,
        phase: "completed",
        announcement:
          "Baseline started. This is a research signal—not a diagnosis—and no disease threshold was used.",
        focusToken: this.#snapshot.focusToken + 1
      });
    } catch {
      if (!this.#isCurrent(generation)) return;
      this.#setSnapshot({
        ...this.#snapshot,
        phase: "handoff_error",
        announcement:
          "The derived research signal was not accepted. Retry the handoff; do not repeat the capture.",
        focusToken: this.#snapshot.focusToken + 1
      });
    }
  }

  #updateElapsed(generation: number): void {
    if (!this.#isCurrent(generation) || this.#snapshot.phase !== "capturing") return;
    const elapsedMs = Math.min(
      this.#snapshot.targetDurationMs,
      Math.max(0, this.#timer.now() - this.#captureStartedAt)
    );
    this.#setSnapshot({ ...this.#snapshot, elapsedMs });
  }

  #showUnavailable(reason: VoiceBiomarkerUnavailableReason): void {
    this.#clearTimer();
    this.#setSnapshot({
      ...this.#snapshot,
      phase: "unavailable",
      unavailableReason: reason,
      fact: null,
      quality: null,
      announcement: voiceUnavailableReasonText(reason),
      focusToken: this.#snapshot.focusToken + 1
    });
  }

  #clearTimer(): void {
    if (this.#intervalHandle === null) return;
    this.#timer.clearInterval(this.#intervalHandle);
    this.#intervalHandle = null;
  }

  #isCurrent(generation: number): boolean {
    return !this.#disposed && generation === this.#operationGeneration;
  }

  #setSnapshot(snapshot: VoiceBiomarkerStationSnapshot): void {
    this.#snapshot = snapshot;
    for (const listener of this.#listeners) listener();
  }
}
