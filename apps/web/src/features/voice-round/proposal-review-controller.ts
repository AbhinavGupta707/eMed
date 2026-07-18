import {
  PatientReportSchema,
  RedFlagAnswerSchema,
  VoiceAgentReportProposalSchema,
  type PatientReport,
  type VoiceAgentReportField,
  type VoiceAgentReportProposal
} from "@homerounds/contracts";

export type ProposalReviewField = VoiceAgentReportField | "note";
export type ProposalNoteReview = "keep" | "remove";

export type ProposalReviewAnswers = Readonly<{
  weakness: PatientReport["weakness"] | null;
  palpitations: PatientReport["palpitations"] | null;
  chest_pain: PatientReport["redFlags"]["chestPain"] | null;
  severe_breathlessness: PatientReport["redFlags"]["severeBreathlessness"] | null;
  fainted: PatientReport["redFlags"]["fainted"] | null;
  note: ProposalNoteReview | null;
}>;

export type ProposalReviewStatus =
  "reviewing" | "review_required" | "confirming" | "confirmed" | "error";

export type ProposalReviewSnapshot = Readonly<{
  proposal: VoiceAgentReportProposal;
  answers: ProposalReviewAnswers;
  explicitConfirmation: boolean;
  status: ProposalReviewStatus;
  announcement: string;
  firstIncompleteField: ProposalReviewField | null;
  focusToken: number;
  canConfirm: boolean;
}>;

export type ProposalReviewControllerDependencies = Readonly<{
  proposal: VoiceAgentReportProposal;
  roundId: string;
  onConfirmed: (report: PatientReport) => Promise<void>;
  createId?: () => string;
  now?: () => string;
}>;

const REVIEW_ORDER = [
  "weakness",
  "palpitations",
  "chest_pain",
  "severe_breathlessness",
  "fainted",
  "note"
] as const satisfies readonly ProposalReviewField[];

function defaultId(): string {
  return globalThis.crypto.randomUUID();
}

function defaultNow(): string {
  return new Date().toISOString();
}

function emptyAnswers(): ProposalReviewAnswers {
  return {
    weakness: null,
    palpitations: null,
    chest_pain: null,
    severe_breathlessness: null,
    fainted: null,
    note: null
  };
}

function firstIncomplete(answers: ProposalReviewAnswers): ProposalReviewField | null {
  for (const field of REVIEW_ORDER) {
    if (answers[field] === null) return field;
  }
  return null;
}

function parseReviewValue(
  field: VoiceAgentReportField,
  value: unknown
): ProposalReviewAnswers[VoiceAgentReportField] {
  switch (field) {
    case "weakness":
      return PatientReportSchema.shape.weakness.parse(value);
    case "palpitations":
      return PatientReportSchema.shape.palpitations.parse(value);
    case "chest_pain":
    case "severe_breathlessness":
    case "fainted":
      return RedFlagAnswerSchema.parse(value);
  }
}

export class VoiceProposalReviewController {
  readonly #roundId: string;
  #onConfirmed: (report: PatientReport) => Promise<void>;
  readonly #createId: () => string;
  readonly #now: () => string;
  readonly #listeners = new Set<() => void>();
  #snapshot: ProposalReviewSnapshot;
  #confirmationGeneration = 0;

  constructor(dependencies: ProposalReviewControllerDependencies) {
    const proposal = VoiceAgentReportProposalSchema.parse(dependencies.proposal);
    this.#roundId = dependencies.roundId;
    this.#onConfirmed = dependencies.onConfirmed;
    this.#createId = dependencies.createId ?? defaultId;
    this.#now = dependencies.now ?? defaultNow;
    this.#snapshot = {
      proposal,
      answers: emptyAnswers(),
      explicitConfirmation: false,
      status: "reviewing",
      announcement:
        "Review every proposed field. No proposed answer has been confirmed or submitted.",
      firstIncompleteField: "weakness",
      focusToken: 0,
      canConfirm: false
    };
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  readonly getSnapshot = (): ProposalReviewSnapshot => this.#snapshot;

  setOnConfirmed(handler: (report: PatientReport) => Promise<void>): void {
    this.#onConfirmed = handler;
  }

  reviewField(field: VoiceAgentReportField, value: unknown): void {
    if (this.#snapshot.status === "confirmed" || this.#snapshot.status === "confirming") return;
    const parsed = parseReviewValue(field, value);
    this.#updateAnswers({ ...this.#snapshot.answers, [field]: parsed });
  }

  reviewNote(value: unknown): void {
    if (this.#snapshot.status === "confirmed" || this.#snapshot.status === "confirming") return;
    if (value !== "keep" && value !== "remove") {
      throw new Error("Note review must explicitly keep or remove the proposed note.");
    }
    this.#updateAnswers({ ...this.#snapshot.answers, note: value });
  }

  setExplicitConfirmation(confirmed: boolean): void {
    if (this.#snapshot.status === "confirmed" || this.#snapshot.status === "confirming") return;
    this.#setSnapshot({
      ...this.#snapshot,
      explicitConfirmation: confirmed,
      canConfirm: confirmed && firstIncomplete(this.#snapshot.answers) === null,
      status: "reviewing",
      announcement: confirmed
        ? "Final confirmation selected. Submit only after every field has been reviewed."
        : "Final confirmation cleared. No report has been submitted."
    });
  }

  async confirm(): Promise<void> {
    if (this.#snapshot.status === "confirmed" || this.#snapshot.status === "confirming") return;
    const incomplete = firstIncomplete(this.#snapshot.answers);
    if (incomplete !== null || !this.#snapshot.explicitConfirmation) {
      this.#setSnapshot({
        ...this.#snapshot,
        status: "review_required",
        announcement:
          incomplete === null
            ? "Select the final confirmation before submitting this reviewed report."
            : "Review every field before submitting. Focus moved to the first incomplete field.",
        firstIncompleteField: incomplete,
        focusToken: this.#snapshot.focusToken + 1,
        canConfirm: false
      });
      return;
    }

    const answers = this.#snapshot.answers;
    if (
      answers.weakness === null ||
      answers.palpitations === null ||
      answers.chest_pain === null ||
      answers.severe_breathlessness === null ||
      answers.fainted === null ||
      answers.note === null
    ) {
      return;
    }

    const report = PatientReportSchema.parse({
      reportId: this.#createId(),
      roundId: this.#roundId,
      weakness: answers.weakness,
      palpitations: answers.palpitations,
      redFlags: {
        chestPain: answers.chest_pain,
        severeBreathlessness: answers.severe_breathlessness,
        fainted: answers.fainted
      },
      ...(answers.note === "keep" && this.#snapshot.proposal.note !== null
        ? { note: this.#snapshot.proposal.note }
        : {}),
      inputMode: "voice_confirmed",
      confirmedAt: this.#now()
    });

    const generation = ++this.#confirmationGeneration;
    this.#setSnapshot({
      ...this.#snapshot,
      status: "confirming",
      announcement:
        "Submitting the answers you reviewed. Required safety answers remain in control.",
      firstIncompleteField: null,
      canConfirm: false
    });

    try {
      await this.#onConfirmed(report);
      if (generation !== this.#confirmationGeneration) return;
      this.#setSnapshot({
        ...this.#snapshot,
        status: "confirmed",
        announcement:
          "Reviewed report confirmed. Every yes, unsure, or unknown answer was preserved exactly.",
        focusToken: this.#snapshot.focusToken + 1,
        canConfirm: false
      });
    } catch {
      if (generation !== this.#confirmationGeneration) return;
      this.#setSnapshot({
        ...this.#snapshot,
        status: "error",
        announcement:
          "The reviewed report was not accepted. Your selections remain available; try confirmation again.",
        focusToken: this.#snapshot.focusToken + 1,
        canConfirm: true
      });
    }
  }

  #updateAnswers(answers: ProposalReviewAnswers): void {
    const incomplete = firstIncomplete(answers);
    this.#setSnapshot({
      ...this.#snapshot,
      answers,
      explicitConfirmation: false,
      status: "reviewing",
      announcement:
        incomplete === null
          ? "Every proposed field has an explicit patient review. Select final confirmation after reviewing these values."
          : "Review recorded. No report has been submitted.",
      firstIncompleteField: incomplete,
      canConfirm: false
    });
  }

  #setSnapshot(snapshot: ProposalReviewSnapshot): void {
    this.#snapshot = snapshot;
    for (const listener of this.#listeners) listener();
  }
}
