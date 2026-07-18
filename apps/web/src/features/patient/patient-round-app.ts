"use client";
import { HomeRoundsApiClient } from "@homerounds/api-client";
import type { MedicationLabelProvider } from "@homerounds/assessments";
import {
  PatientReportSchema,
  RedFlagAnswerSchema,
  type RoundState,
  type VoiceBiomarkerProvider,
  type VoiceSessionContext
} from "@homerounds/contracts";
import {
  createConfirmedPatientReport,
  type TranscriptConfirmation,
  type VoiceSessionProvider
} from "@homerounds/voice";
import {
  AppShell,
  Banner,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  FeedbackState,
  FieldDescription,
  FieldLegend,
  FieldSet,
  MeasurementQuality,
  Spinner,
  StepProgress,
  type ProgressStep
} from "@homerounds/ui";
import { QRCodeSVG } from "qrcode.react";
import {
  Fragment,
  createElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type ReactNode
} from "react";
import { VoiceInteractionPanel, type VoiceAgentProposalState } from "../voice";
import { VoiceBiomarkerStation } from "../voice-biomarker";
import { HistoryPurposeCard, VoiceAgentProposalReview } from "../voice-round";
import { MedicationLabelPanel } from "../medication";
import {
  useDesktopCompanion,
  type DesktopCompanionController
} from "../companion/use-desktop-companion";
import { AdaptiveRoundMap, RoundMapExperienceSchema, type RoundMapExperience } from "../round-map";
import { ApiMedicationLabelProvider } from "../shared-round/medication-label-api-provider";
import type { PatientRoundLaunchConfig } from "../shared-round/patient-round-config";
import {
  PatientWorkflowController,
  patientWorkflowView,
  type OpticalProviderFactory,
  type PatientRoundApi,
  type PatientWorkflowState,
  type PatientWorkflowView
} from "../workflows/patient-workflow-controller";
import {
  createPatientOpticalProvider,
  createPatientVoiceBiomarkerProvider,
  createPatientVoiceProvider
} from "./provider-factories";
import {
  createRecordedCaptureReplayLoader,
  type RecordedCaptureReplayLoader
} from "./recorded-capture-replay";
import { DeviceHandoff } from "./device-handoff";
import styles from "./patient-round.module.css";
function createRequiredChildrenElement<
  Props extends {
    children: ReactNode;
  }
>(
  component: ComponentType<Props>,
  props: Omit<Props, "children">,
  child: ReactNode,
  ...children: ReactNode[]
) {
  return createElement(component, props as Props, child, ...children);
}
export type PatientRoundAppProps = Readonly<{
  config: PatientRoundLaunchConfig;
  api?: PatientRoundApi;
  voiceProvider?: VoiceSessionProvider;
  voiceBiomarkerProvider?: VoiceBiomarkerProvider;
  createOpticalProvider?: OpticalProviderFactory;
  loadRecordedCaptureReplay?: RecordedCaptureReplayLoader | null;
  createId?: () => string;
  now?: () => string;
  isOnline?: () => boolean;
  onRetryAdaptiveSelection?: () => void;
  roundMapExperience?: RoundMapExperience;
  medicationLabelProvider?: MedicationLabelProvider;
  timeoutMs?: number;
}>;
type ChoiceOption = Readonly<{
  value: string;
  label: string;
  description?: string;
}>;
const redFlagOptions: readonly ChoiceOption[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unsure", label: "I’m not sure" }
];
const weaknessOptions: readonly ChoiceOption[] = [
  { value: "absent", label: "None" },
  { value: "mild", label: "Mild" },
  { value: "moderate", label: "Moderate" },
  { value: "severe", label: "Severe" },
  { value: "unknown", label: "I’m not sure" }
];
const palpitationOptions: readonly ChoiceOption[] = [
  { value: "absent", label: "None" },
  { value: "intermittent", label: "Comes and goes" },
  { value: "current", label: "Happening now" },
  { value: "unknown", label: "I’m not sure" }
];
const cancellableStates = new Set<RoundState>([
  "invited",
  "red_flag_screen",
  "collecting_report",
  "assessment_selected",
  "capturing",
  "capture_retry",
  "assessment_complete",
  "follow_up_selected"
]);
const recommendationViews = new Set<PatientWorkflowView>([
  "voice_biomarker",
  "medication_review",
  "measurement_prepare"
]);
function browserId(): string {
  return globalThis.crypto.randomUUID();
}
function browserNow(): string {
  return new Date().toISOString();
}
function apiBaseUrl(): string {
  return typeof window === "undefined" ? "http://localhost" : window.location.origin;
}

function browserFetcher(...args: Parameters<typeof fetch>): ReturnType<typeof fetch> {
  return globalThis.fetch(...args);
}
function stepIndex(view: PatientWorkflowView): number {
  switch (view) {
    case "loading":
    case "invitation":
    case "report":
      return 0;
    case "medication_review":
    case "voice_biomarker":
    case "measurement_prepare":
    case "measurement_ready":
    case "measurement_unavailable":
    case "capturing":
    case "capture_retry":
      return 1;
    case "follow_up":
    case "action_confirmation":
    case "processing":
    case "resume_recovery":
      return 2;
    case "emergency":
    case "outcome":
    case "cancelled":
      return 3;
  }
}

const POST_ASSESSMENT_STATES = new Set<RoundState>([
  "assessment_complete",
  "follow_up_selected",
  "protocol_ready",
  "protocol_decided",
  "action_pending",
  "awaiting_clinician",
  "outcome_ready",
  "closed",
  "abstained_for_review"
]);

function liveRoundMapExperience(state: PatientWorkflowState): RoundMapExperience | undefined {
  const round = state.round;
  const route = state.evidenceRoute;
  if (!round || !route.selection || !route.selectedModuleId || route.candidates.length === 0) {
    return undefined;
  }
  const assessmentComplete = POST_ASSESSMENT_STATES.has(round.state);
  const assessmentCurrent = round.state === "capturing" || round.state === "capture_retry";
  const assessmentCompletedWithoutMeasurement =
    assessmentComplete &&
    (state.protocolResult?.missingFactKeys.includes("pulse_bpm") === true ||
      (state.quality !== null && state.quality.status !== "pass"));
  const modules = [
    {
      candidate: {
        id: "patient.report",
        kind: "structured_follow_up",
        label: "Confirmed symptom check-in",
        description: "The structured answers you reviewed and confirmed for this check-in.",
        producesFactKeys: ["follow_up_answer"],
        availability: { status: "available" },
        estimatedBurdenSeconds: 35,
        deterministicRank: 0
      },
      status: "completed",
      statusDetail: "Your confirmed answers are saved; conversation text is not retained."
    },
    ...route.candidates.map((candidate) => {
      if (candidate.availability.status === "unavailable") {
        return { candidate, status: "unavailable" as const, statusDetail: null };
      }
      if (candidate.kind === "medication_label") {
        if (route.selectedModuleId !== candidate.id) {
          return {
            candidate,
            status: "skipped" as const,
            statusDetail: "Your selected route did not require this optional check."
          };
        }
        if (route.medicationSkipped) {
          return {
            candidate,
            status: "skipped" as const,
            statusDetail: "You skipped this optional evidence step; no label observation was saved."
          };
        }
        return route.medicationConfirmed
          ? {
              candidate,
              status: "completed" as const,
              statusDetail: "The label details you reviewed were explicitly confirmed."
            }
          : {
              candidate,
              status: "current" as const,
              statusDetail: "Review and confirm visible label fields before continuing."
            };
      }
      if (candidate.kind === "voice_biomarker") {
        if (route.selectedModuleId !== candidate.id) {
          return {
            candidate,
            status: "skipped" as const,
            statusDetail: "Your selected route did not require this optional voice check."
          };
        }
        if (route.voiceBiomarkerSkipped) {
          return {
            candidate,
            status: "skipped" as const,
            statusDetail: "You skipped this optional station; no voice feature fact was saved."
          };
        }
        return route.voiceBiomarkerCompleted
          ? {
              candidate,
              status: "completed" as const,
              statusDetail:
                "A quality-passing local research signal was saved without raw voice audio."
            }
          : {
              candidate,
              status: "current" as const,
              statusDetail: "Consent and a passing local quality check are required."
            };
      }
      if (assessmentComplete) {
        if (assessmentCompletedWithoutMeasurement) {
          return {
            candidate,
            status: "completed_without_measurement" as const,
            statusDetail:
              "No numeric pulse reading was accepted; the check-in continued without one."
          };
        }
        return {
          candidate,
          status: "completed" as const,
          statusDetail: "A quality-passing pulse estimate was confirmed for this round."
        };
      }
      if (assessmentCurrent) {
        return {
          candidate,
          status: "current" as const,
          statusDetail: "Signal quality is being checked before any reading can be accepted."
        };
      }
      const pulseReady =
        route.selectedModuleId === candidate.id ||
        (route.selectedModuleId === "medication.label.review" &&
          (route.medicationConfirmed || route.medicationSkipped)) ||
        (route.selectedModuleId === "voice.local.baseline" &&
          (route.voiceBiomarkerCompleted || route.voiceBiomarkerSkipped));
      return {
        candidate,
        status: pulseReady ? ("selected" as const) : ("next" as const),
        statusDetail: pulseReady
          ? "This quality-gated step is ready."
          : "This usual next step remains available after the selected review."
      };
    })
  ];
  return RoundMapExperienceSchema.parse({
    currentRoundVersion: round.stateVersion,
    modules,
    resumedConfirmedProgress:
      state.interrupted ||
      route.medicationConfirmed ||
      route.medicationSkipped ||
      route.voiceBiomarkerCompleted ||
      route.voiceBiomarkerSkipped,
    selection: { status: "settled", outcome: route.selection, committed: true },
    syntheticStoryLabel: null
  });
}
function progressSteps(view: PatientWorkflowView): readonly ProgressStep[] {
  const current = stepIndex(view);
  return ["Check in", "Measure", "Confirm", "Outcome"].map((label, index) => ({
    id: `patient-step-${index}`,
    label,
    state: index < current ? "complete" : index === current ? "current" : "upcoming"
  }));
}
function PatientHeader({
  state,
  controller,
  view
}: PatientShellProps & { view: PatientWorkflowView }) {
  const canCancel = state.round ? cancellableStates.has(state.round.state) : false;
  return createElement(
    "div",
    {
      className: styles.header
    },
    createElement(
      "div",
      {
        className: styles.brand
      },
      createElement("span", null, "HomeRounds")
    ),
    createElement(
      "div",
      {
        className: styles.headerActions
      },
      createElement(
        "span",
        { className: styles.headerProgress },
        `Check-in · ${stepIndex(view) + 1} of 4`
      ),
      createRequiredChildrenElement(
        Button,
        {
          disabled: state.pending !== null,
          onClick: () => void controller.refresh(),
          size: "compact",
          variant: "quiet"
        },
        "Resume saved progress"
      ),
      canCancel
        ? createRequiredChildrenElement(
            Button,
            {
              disabled: state.pending !== null,
              onClick: () => void controller.cancelRound(),
              size: "compact",
              variant: "quiet"
            },
            "End check-in"
          )
        : null
    )
  );
}
type PatientShellProps = Readonly<{
  state: PatientWorkflowState;
  controller: PatientWorkflowController;
}>;
function ErrorNotice({ state, controller }: PatientShellProps) {
  const error = state.error;
  if (!error) return null;
  return createRequiredChildrenElement(
    Banner,
    {
      action: error.recoverable
        ? createRequiredChildrenElement(
            Button,
            {
              onClick: () => void controller.refresh(),
              size: "compact",
              variant: "secondary"
            },
            "Reload round"
          )
        : undefined,
      title: error.title,
      variant: error.code === "permission_denied" ? "warning" : "danger"
    },
    createElement("p", null, error.message)
  );
}
function InvitationPanel({ state, controller }: PatientShellProps) {
  const [consented, setConsented] = useState(false);
  return createElement(
    "section",
    {
      "aria-labelledby": "invitation-title",
      className: styles.primaryPanel
    },
    createElement(
      "div",
      {
        className: styles.introCopy
      },
      createElement(
        "h1",
        {
          id: "invitation-title"
        },
        "Ready when you are, Maya."
      ),
      createElement(
        "p",
        null,
        "A short check-in about how you have been feeling since your last saved round."
      )
    ),
    createElement(
      Card,
      null,
      createElement(
        CardHeader,
        null,
        createElement(CardTitle, null, "A short, guided check-in"),
        createElement(
          CardDescription,
          null,
          "You stay in control of every answer, optional check, and next step."
        )
      ),
      createElement(
        CardContent,
        null,
        createElement(
          "ul",
          {
            className: styles.plainList
          },
          createElement("li", null, "You will answer three required safety questions first."),
          createElement(
            "li",
            null,
            "Voice is optional, editable, and always has a complete text alternative."
          ),
          createElement("li", null, "A camera reading appears only when signal quality passes."),
          createElement(
            "li",
            null,
            "HomeRounds does not store raw camera frames or raw voice audio."
          )
        ),
        createElement(
          "label",
          {
            className: styles.checkboxChoice
          },
          createElement("input", {
            checked: consented,
            onChange: (event) => setConsented(event.currentTarget.checked),
            type: "checkbox"
          }),
          createElement(
            "span",
            null,
            "I understand this check does not diagnose a condition or contact a medical service."
          )
        )
      ),
      createElement(
        CardFooter,
        null,
        createRequiredChildrenElement(
          Button,
          {
            disabled: !consented || state.pending !== null,
            onClick: () => void controller.startRound()
          },
          state.pending === "transition"
            ? createElement(
                Fragment,
                null,
                createElement(Spinner, {
                  label: "Starting round"
                }),
                "Starting\u2026"
              )
            : "Start my check-in"
        )
      )
    )
  );
}
function ChoiceField({
  legend,
  description,
  name,
  options,
  value,
  onChange
}: Readonly<{
  legend: string;
  description?: string;
  name: string;
  options: readonly ChoiceOption[];
  value: string | null;
  onChange: (value: string) => void;
}>) {
  return createElement(
    FieldSet,
    null,
    createElement(FieldLegend, null, legend),
    description ? createElement(FieldDescription, null, description) : null,
    createElement(
      "div",
      {
        className: styles.choiceGrid
      },
      options.map((option) =>
        createElement(
          "label",
          {
            className: styles.choice,
            key: option.value
          },
          createElement("input", {
            checked: value === option.value,
            name: name,
            onChange: () => onChange(option.value),
            type: "radio",
            value: option.value
          }),
          createElement(
            "span",
            null,
            createElement("strong", null, option.label),
            option.description ? createElement("small", null, option.description) : null
          )
        )
      )
    )
  );
}
function ReportPanel({
  state,
  controller,
  voiceProvider,
  createId,
  now
}: PatientShellProps & {
  voiceProvider: VoiceSessionProvider;
  createId: () => string;
  now: () => string;
}) {
  const [stage, setStage] = useState<"safety" | "conversation" | "review">("safety");
  const [chestPain, setChestPain] = useState<string | null>(null);
  const [severeBreathlessness, setSevereBreathlessness] = useState<string | null>(null);
  const [fainted, setFainted] = useState<string | null>(null);
  const [weakness, setWeakness] = useState<string | null>(null);
  const [palpitations, setPalpitations] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<TranscriptConfirmation | null>(null);
  const [agentProposal, setAgentProposal] = useState<VoiceAgentProposalState | null>(null);
  const [reportReviewed, setReportReviewed] = useState(false);
  const round = state.round;
  const voiceContext = useMemo<VoiceSessionContext>(
    () => ({
      syntheticDataOnly: true,
      patientAlias: "Maya",
      roundPurpose: round?.purpose ?? "A short home check-in about how you have been feeling.",
      historySummary:
        "Your saved sample profile includes a usual baseline and recent medication context. It does not establish a diagnosis."
    }),
    [round?.purpose]
  );
  const complete =
    round !== null &&
    chestPain !== null &&
    severeBreathlessness !== null &&
    fainted !== null &&
    weakness !== null &&
    palpitations !== null &&
    confirmation !== null;
  function submitReport(): void {
    if (!complete || !round || !confirmation || !reportReviewed) return;
    const report = createConfirmedPatientReport({
      reportId: createId(),
      confirmation,
      fields: PatientReportSchema.pick({
        weakness: true,
        palpitations: true,
        redFlags: true,
        note: true
      })
        .strict()
        .parse({
          weakness,
          palpitations,
          redFlags: { chestPain, severeBreathlessness, fainted },
          ...(confirmation.text.length <= 500 ? { note: confirmation.text } : {})
        })
    });
    void controller.submitConfirmedReport(report);
  }
  const safetyComplete = chestPain !== null && severeBreathlessness !== null && fainted !== null;
  const conversationComplete = weakness !== null && palpitations !== null && confirmation !== null;
  const labelFor = (options: readonly ChoiceOption[], value: string | null) =>
    options.find((option) => option.value === value)?.label ?? "Not answered";

  if (stage === "safety") {
    return createElement(
      "section",
      { "aria-labelledby": "report-title", className: styles.primaryPanel },
      createElement(
        "div",
        { className: styles.introCopy },
        createElement("p", { className: styles.screenEyebrow }, "First, a safety check"),
        createElement("h1", { id: "report-title" }, "Three questions before we talk."),
        createElement(
          "p",
          null,
          "Answer each one yourself. “I’m not sure” stays uncertain and is never treated as “no”."
        )
      ),
      createRequiredChildrenElement(
        Banner,
        { title: "These answers come first", variant: "warning" },
        createElement(
          "p",
          null,
          "A “yes” answer ends the ordinary check-in before voice, camera, or a recommendation can continue."
        )
      ),
      createElement(
        Card,
        { className: styles.focusCard },
        createElement(
          CardHeader,
          null,
          createElement(CardTitle, null, "How are you right now?"),
          createElement(CardDescription, null, "Choose one answer for every question.")
        ),
        createElement(
          CardContent,
          null,
          createElement(ChoiceField, {
            legend: "Are you having chest pain now?",
            name: "chest-pain",
            onChange: (value) => setChestPain(RedFlagAnswerSchema.parse(value)),
            options: redFlagOptions,
            value: chestPain
          }),
          createElement(ChoiceField, {
            legend: "Are you severely short of breath now?",
            name: "severe-breathlessness",
            onChange: (value) => setSevereBreathlessness(RedFlagAnswerSchema.parse(value)),
            options: redFlagOptions,
            value: severeBreathlessness
          }),
          createElement(ChoiceField, {
            legend: "Have you fainted?",
            name: "fainted",
            onChange: (value) => setFainted(RedFlagAnswerSchema.parse(value)),
            options: redFlagOptions,
            value: fainted
          })
        ),
        createElement(
          CardFooter,
          null,
          createRequiredChildrenElement(
            Button,
            { disabled: !safetyComplete, onClick: () => setStage("conversation") },
            "Continue to conversation"
          )
        )
      )
    );
  }

  if (stage === "conversation") {
    return createElement(
      "section",
      { "aria-labelledby": "report-title", className: styles.primaryPanel },
      createElement(
        "div",
        { className: styles.introCopy },
        createElement("p", { className: styles.screenEyebrow }, "Conversation"),
        createElement("h1", { id: "report-title" }, "Tell me what’s changed."),
        createElement(
          "p",
          null,
          "Speak naturally or type instead. You will check the words and every structured answer before continuing."
        )
      ),
      round ? createElement(HistoryPurposeCard, { context: voiceContext }) : null,
      createElement(
        Card,
        { className: styles.focusCard },
        createElement(
          CardHeader,
          null,
          createElement(CardTitle, null, "Two details to keep clear"),
          createElement(
            CardDescription,
            null,
            "Choose “I’m not sure” whenever that is the most accurate answer."
          )
        ),
        createElement(
          CardContent,
          null,
          createElement(ChoiceField, {
            legend: "How weak do you feel?",
            name: "weakness",
            onChange: (value) => setWeakness(PatientReportSchema.shape.weakness.parse(value)),
            options: weaknessOptions,
            value: weakness
          }),
          createElement(ChoiceField, {
            legend: "Are you noticing a racing, pounding, or fluttering feeling?",
            name: "palpitations",
            onChange: (value) =>
              setPalpitations(PatientReportSchema.shape.palpitations.parse(value)),
            options: palpitationOptions,
            value: palpitations
          })
        )
      ),
      round
        ? createElement(VoiceInteractionPanel, {
            context: voiceContext,
            createId,
            onConfirmed: setConfirmation,
            onProposal: (proposal: VoiceAgentProposalState) => {
              setAgentProposal(proposal);
              setStage("review");
            },
            provider: voiceProvider,
            roundId: round.id
          })
        : null,
      confirmation
        ? createRequiredChildrenElement(
            Banner,
            { title: "Your words are ready to review", variant: "success" },
            createElement("p", null, "Nothing is submitted until you review the report next.")
          )
        : null,
      createElement(
        "div",
        { className: styles.primaryActions },
        createRequiredChildrenElement(
          Button,
          { onClick: () => setStage("safety"), variant: "quiet" },
          "Back to safety answers"
        ),
        createRequiredChildrenElement(
          Button,
          { disabled: !conversationComplete, onClick: () => setStage("review") },
          "Review my report"
        )
      )
    );
  }

  if (round && agentProposal) {
    return createElement(
      "section",
      { "aria-labelledby": "report-title", className: styles.primaryPanel },
      createElement(
        "div",
        { className: styles.introCopy },
        createElement("p", { className: styles.screenEyebrow }, "Review"),
        createElement("h1", { id: "report-title" }, "Check every answer before we continue."),
        createElement(
          "p",
          null,
          "The conversation only prepared a draft. You decide what each field should say."
        )
      ),
      createElement(VoiceAgentProposalReview, {
        createId,
        now,
        onConfirmed: (report) => controller.submitConfirmedReport(report),
        proposal: agentProposal.proposal,
        roundId: round.id
      }),
      createElement(
        "div",
        { className: styles.primaryActions },
        createRequiredChildrenElement(
          Button,
          {
            onClick: () => {
              setAgentProposal(null);
              setStage("conversation");
            },
            variant: "quiet"
          },
          "Return to conversation"
        )
      )
    );
  }

  return createElement(
    "section",
    { "aria-labelledby": "report-review-title", className: styles.primaryPanel },
    createElement(
      "div",
      { className: styles.introCopy },
      createElement("p", { className: styles.screenEyebrow }, "Review"),
      createElement("h1", { id: "report-review-title" }, "Let’s make sure I understood."),
      createElement(
        "p",
        null,
        "Here are the answers you are about to submit. Edit anything that is not right."
      )
    ),
    createElement(
      Card,
      { className: styles.reviewCard },
      createElement(
        CardHeader,
        null,
        createElement(CardTitle, null, "Your structured report"),
        createElement(CardDescription, null, "Unknown and unsure answers remain exactly as shown.")
      ),
      createElement(
        CardContent,
        null,
        createElement(
          "dl",
          { className: styles.reportSummary },
          createElement(
            "div",
            null,
            createElement("dt", null, "Chest pain now"),
            createElement("dd", null, labelFor(redFlagOptions, chestPain))
          ),
          createElement(
            "div",
            null,
            createElement("dt", null, "Severe breathlessness now"),
            createElement("dd", null, labelFor(redFlagOptions, severeBreathlessness))
          ),
          createElement(
            "div",
            null,
            createElement("dt", null, "Fainted"),
            createElement("dd", null, labelFor(redFlagOptions, fainted))
          ),
          createElement(
            "div",
            null,
            createElement("dt", null, "Weakness"),
            createElement("dd", null, labelFor(weaknessOptions, weakness))
          ),
          createElement(
            "div",
            null,
            createElement("dt", null, "Racing or fluttering feeling"),
            createElement("dd", null, labelFor(palpitationOptions, palpitations))
          ),
          createElement(
            "div",
            null,
            createElement("dt", null, "What you said"),
            createElement("dd", null, confirmation?.text ?? "Not answered")
          )
        ),
        createElement(
          "label",
          { className: styles.checkboxChoice },
          createElement("input", {
            checked: reportReviewed,
            onChange: (event) => setReportReviewed(event.currentTarget.checked),
            type: "checkbox"
          }),
          createElement("span", null, "I reviewed every field and confirm these are my answers.")
        )
      ),
      createElement(
        CardFooter,
        null,
        createRequiredChildrenElement(
          Button,
          { onClick: () => setStage("safety"), variant: "quiet" },
          "Edit answers"
        ),
        createRequiredChildrenElement(
          Button,
          { onClick: () => setStage("conversation"), variant: "secondary" },
          "Edit conversation"
        )
      )
    ),
    createElement(
      "p",
      { className: styles.privacyNote },
      "Your confirmed conversation text is not stored. The structured answers above are the report."
    ),
    createElement(
      "div",
      { className: styles.primaryActions },
      createRequiredChildrenElement(
        Button,
        { disabled: !complete || !reportReviewed || state.pending !== null, onClick: submitReport },
        state.pending === "submitting_report" || state.pending === "transition"
          ? createElement(
              Fragment,
              null,
              createElement(Spinner, { label: "Checking answers" }),
              "Checking answers…"
            )
          : "Confirm and continue"
      )
    )
  );
}
function MeasurementPanel({
  state,
  controller,
  companion
}: PatientShellProps & { companion: DesktopCompanionController }) {
  const [consented, setConsented] = useState(false);
  const session = state.assessmentSession;
  const selectedCheckLabel =
    session?.provider === "vitallens" ? "Face pulse check" : "Finger pulse check";
  if (state.pending === "capturing" || state.pending === "submitting_measurement") {
    return createElement(
      "section",
      {
        "aria-labelledby": "capture-title",
        className: styles.primaryPanel
      },
      createElement(
        "div",
        {
          className: styles.introCopy
        },
        createElement(
          "h1",
          {
            id: "capture-title"
          },
          "Keep still while quality is checked"
        ),
        createElement("p", null, "No reading is shown unless signal quality passes.")
      ),
      createElement(FeedbackState, {
        description:
          "Keep this page visible. Leaving the page stops camera processing and discards late results.",
        kind: "loading",
        title:
          state.pending === "submitting_measurement"
            ? "Saving passing evidence"
            : "Checking signal quality"
      }),
      createElement(
        "div",
        {
          className: styles.primaryActions
        },
        createRequiredChildrenElement(
          Button,
          {
            onClick: () => void controller.continueWithoutMeasurement(),
            variant: "secondary"
          },
          "Stop and continue without a measurement"
        )
      )
    );
  }
  if (state.quality) {
    const canRetry = state.round?.state === "capture_retry" && state.quality.status === "retry";
    const canUseRecordedReplay =
      canRetry && state.recordedReplayAvailable && state.selectedProvider === "finger_ppg";
    return createElement(
      "section",
      {
        "aria-labelledby": "quality-title",
        className: styles.primaryPanel
      },
      createElement(
        "div",
        {
          className: styles.introCopy
        },
        createElement(
          "h1",
          {
            id: "quality-title"
          },
          "The camera check needs attention"
        ),
        createElement(
          "p",
          null,
          "A failed or uncertain signal is never converted into a measurement."
        )
      ),
      createElement(MeasurementQuality, {
        reasons: state.quality.reasons.map(qualityReason),
        status: state.quality.status
      }),
      createElement(
        "div",
        {
          className: styles.primaryActions
        },
        canRetry
          ? createRequiredChildrenElement(
              Button,
              {
                disabled: state.pending !== null,
                onClick: () => void controller.retryMeasurement()
              },
              "Try the camera check once more"
            )
          : null,
        canUseRecordedReplay
          ? createRequiredChildrenElement(
              Button,
              {
                disabled: state.pending !== null,
                onClick: () => void controller.useRecordedDemoCapture(),
                variant: "secondary"
              },
              "Use the labelled sample reading"
            )
          : null,
        createRequiredChildrenElement(
          Button,
          {
            disabled: state.pending !== null,
            onClick: () => void controller.continueWithoutMeasurement(),
            variant: "secondary"
          },
          "Continue without a measurement"
        )
      ),
      canUseRecordedReplay
        ? createElement(
            "p",
            { className: styles.privacyNote },
            "This labelled sample is optional and never automatic. It is not a live reading and contains no raw media or personal data."
          )
        : null
    );
  }
  if (session && state.availability?.available === false) {
    return createElement(
      "section",
      {
        "aria-labelledby": "unavailable-title",
        className: styles.primaryPanel
      },
      createElement(
        "div",
        {
          className: styles.introCopy
        },
        createElement(
          "h1",
          {
            id: "unavailable-title"
          },
          "The selected camera check is unavailable"
        ),
        createElement("p", null, "HomeRounds will not silently switch to another camera method.")
      ),
      createElement(FeedbackState, {
        action: createRequiredChildrenElement(
          Button,
          {
            onClick: () => void controller.continueWithoutMeasurement(),
            variant: "secondary"
          },
          "Continue without a measurement"
        ),
        description: "No camera value was recorded. You can stop this attempt and request review.",
        kind: "error",
        title: selectedCheckLabel
      })
    );
  }
  if (!session) {
    const round = state.round;
    const handoffStatus = {
      idle: "ready",
      issuing: "connecting",
      waiting: "waiting",
      connected: "connected",
      result: "result",
      acknowledged: "result",
      expired: "unavailable",
      unavailable: "unavailable"
    }[companion.status] as Parameters<typeof DeviceHandoff>[0]["status"];
    const statusDetail = {
      idle: "Create a short-lived code, then scan it with your phone.",
      issuing: "Creating a private link for this selected check.",
      waiting:
        "Scan the code with your phone. It expires automatically and contains no patient details.",
      connected: "Your phone is connected. Continue with the guidance shown there.",
      result:
        "The phone result was received and is waiting for the normal quality and workflow checks.",
      acknowledged:
        "The result was received. HomeRounds has not accepted it as a measurement automatically.",
      expired: "This phone link expired or was closed. Create a new short-lived code to continue.",
      unavailable:
        "A secure phone connection is unavailable right now. You can continue on this computer."
    }[companion.status];
    const pairingVisual = companion.issue
      ? createElement(
          "div",
          { className: styles.qrPairing },
          createElement(QRCodeSVG, {
            bgColor: "#fffdf8",
            fgColor: "#173c32",
            level: "M",
            size: 288,
            title: "QR code for the short-lived HomeRounds phone link",
            value: companion.issue.pairingLink
          }),
          createElement(
            "a",
            {
              className: styles.qrLink,
              href: companion.issue.pairingLink,
              rel: "noreferrer",
              target: "_blank"
            },
            "Open the secure link instead"
          )
        )
      : undefined;
    const startPhone =
      round && ["idle", "unavailable"].includes(companion.status)
        ? () => void companion.start(round.id, round.stateVersion)
        : companion.status === "expired"
          ? () => void companion.reissue()
          : companion.status === "result"
            ? () => void companion.acknowledge()
            : undefined;
    const phoneActionLabel =
      companion.status === "expired"
        ? "Create a new code"
        : companion.status === "result"
          ? "Mark result as received"
          : companion.status === "unavailable"
            ? "Try phone connection again"
            : "Use my phone";
    return createElement(DeviceHandoff, {
      computerSupported: true,
      onUseComputer: () => {
        void companion.cancel().finally(() => controller.prepareMeasurement());
      },
      ...(startPhone ? { onUsePhone: startPhone, phoneActionLabel } : {}),
      ...(pairingVisual ? { pairingVisual } : {}),
      rationale:
        "A short camera check can add one quality-gated piece of information. No reading is accepted when quality is uncertain.",
      status: handoffStatus,
      statusDetail,
      taskTitle: "A pulse check is the most useful next step."
    });
  }
  return createElement(
    "section",
    {
      "aria-labelledby": "ready-title",
      className: styles.primaryPanel
    },
    createElement(
      "div",
      {
        className: styles.introCopy
      },
      createElement(
        "h1",
        {
          id: "ready-title"
        },
        "Your device is ready for the ",
        selectedCheckLabel.toLowerCase()
      ),
      createElement(
        "p",
        null,
        "Follow the setup, then keep still until the quality result is complete."
      )
    ),
    createElement(
      Card,
      null,
      createElement(
        CardHeader,
        null,
        createElement(CardTitle, null, selectedCheckLabel),
        createElement(
          CardDescription,
          null,
          session.provider === "finger_ppg"
            ? "Cover the rear camera and optional torch gently with a fingertip."
            : "Keep your face centred. A small cropped image sample may be processed by the selected camera service."
        )
      ),
      createElement(
        CardContent,
        null,
        createElement(
          "label",
          {
            className: styles.checkboxChoice
          },
          createElement("input", {
            checked: consented,
            onChange: (event) => setConsented(event.currentTarget.checked),
            type: "checkbox"
          }),
          createElement(
            "span",
            null,
            "I agree to use the camera for this check and understand that a reading is not guaranteed."
          )
        ),
        createElement(
          "p",
          {
            className: styles.privacyNote
          },
          "Camera processing stops on completion, cancellation, navigation, page hide, or error."
        )
      ),
      createElement(
        CardFooter,
        null,
        createRequiredChildrenElement(
          Button,
          {
            disabled: !consented || state.pending !== null,
            onClick: () => void controller.captureMeasurement()
          },
          "Start camera check"
        )
      )
    )
  );
}
function qualityReason(reason: string): string {
  const descriptions: Readonly<Record<string, string>> = {
    insufficient_duration: "The stable signal was not long enough.",
    weak_signal: "The signal was too weak.",
    saturation: "The camera image was overexposed.",
    motion: "Movement interrupted the signal.",
    irregular_cadence: "Frame timing was not reliable.",
    estimator_disagreement: "The two signal estimates did not agree.",
    provider_quality_failed: "The camera check did not return passing quality.",
    permission_denied: "Camera permission was not granted.",
    unsupported_device: "This device does not support the selected check.",
    provider_unavailable: "The selected camera check was unavailable.",
    cancelled: "The camera check was cancelled."
  };
  return descriptions[reason] ?? "The configured quality gate did not pass.";
}
function FollowUpPanel({ state, controller }: PatientShellProps) {
  const decision = state.decision?.kind === "follow_up_required" ? state.decision : null;
  const [answer, setAnswer] = useState<string | null>(state.followUpAnswer);
  if (!decision) return null;
  const prompt =
    decision.question.promptKey === "protocol.question.symptoms_worse_today"
      ? "Do your symptoms feel worse today than they usually do?"
      : "Please answer the single structured follow-up question.";
  return createElement(
    "section",
    {
      "aria-labelledby": "follow-up-title",
      className: styles.primaryPanel
    },
    createElement(
      "div",
      {
        className: styles.introCopy
      },
      createElement(
        "h1",
        {
          id: "follow-up-title"
        },
        "One more question."
      ),
      createElement(
        "p",
        null,
        "Your confirmed report needs this one answer. There will not be a second follow-up."
      )
    ),
    state.measurement
      ? createElement(MeasurementQuality, {
          details: createElement(
            "p",
            {
              className: styles.measurementValue
            },
            "Pulse reading: ",
            createElement("strong", null, state.measurement.value, "bpm")
          ),
          reasons: ["Signal quality passed before this reading was accepted."],
          status: "pass"
        })
      : null,
    createElement(
      Card,
      null,
      createElement(
        CardHeader,
        null,
        createElement(CardTitle, null, prompt),
        createElement(CardDescription, null, "Choose one answer. Voice cannot answer this for you.")
      ),
      createElement(
        CardContent,
        null,
        createElement(ChoiceField, {
          legend: "Your answer",
          name: decision.question.id,
          onChange: setAnswer,
          options: redFlagOptions,
          value: answer
        })
      ),
      createElement(
        CardFooter,
        null,
        createRequiredChildrenElement(
          Button,
          {
            disabled: answer === null || state.followUpAnswer !== null,
            onClick: () => {
              if (answer) void controller.answerFollowUp(RedFlagAnswerSchema.parse(answer));
            }
          },
          "Confirm this answer"
        )
      )
    )
  );
}
function ActionConfirmationPanel({ state, controller }: PatientShellProps) {
  const [confirmed, setConfirmed] = useState(false);
  const result = state.protocolResult;
  if (!result) return null;
  const abstained = result.outcome === "abstain_for_review";
  return createElement(
    "section",
    {
      "aria-labelledby": "action-title",
      className: styles.primaryPanel
    },
    createElement(
      "div",
      {
        className: styles.introCopy
      },
      createElement(
        "h1",
        {
          id: "action-title"
        },
        "Choose what happens next."
      ),
      createElement(
        "p",
        null,
        "HomeRounds has one available action. Nothing happens until you confirm it."
      )
    ),
    state.measurement
      ? createElement(MeasurementQuality, {
          details: createElement(
            "p",
            {
              className: styles.measurementValue
            },
            "Pulse reading: ",
            createElement("strong", null, state.measurement.value, "bpm")
          ),
          reasons: ["Signal quality passed before this reading was accepted."],
          status: "pass"
        })
      : null,
    createElement(
      Card,
      null,
      createElement(
        CardHeader,
        null,
        createElement(CardTitle, null, "Save a review request"),
        createElement(
          CardDescription,
          null,
          abstained
            ? "Some confirmed information is uncertain or incomplete, so the round can stop for review."
            : "Your confirmed answers make a neutral sample review the next available action."
        )
      ),
      createElement(
        CardContent,
        null,
        createElement(
          "dl",
          {
            className: styles.definitionList
          },
          createElement(
            "div",
            null,
            createElement("dt", null, "Saved to"),
            createElement("dd", null, "HomeRounds review queue")
          ),
          createElement(
            "div",
            null,
            createElement("dt", null, "Based on"),
            createElement("dd", null, "Your confirmed answers and accepted quality results")
          ),
          createElement(
            "div",
            null,
            createElement("dt", null, "Timing"),
            createElement(
              "dd",
              null,
              "Saved inside HomeRounds only; no clinic response is promised"
            )
          )
        ),
        createElement(
          "label",
          {
            className: styles.checkboxChoice
          },
          createElement("input", {
            checked: confirmed,
            onChange: (event) => setConfirmed(event.currentTarget.checked),
            type: "checkbox"
          }),
          createElement("span", null, "I want to save one sample review request.")
        )
      ),
      createElement(
        CardFooter,
        null,
        createRequiredChildrenElement(
          Button,
          {
            disabled: !confirmed || state.pending !== null,
            onClick: () => void controller.confirmAction()
          },
          state.pending === "confirming_action"
            ? createElement(
                Fragment,
                null,
                createElement(Spinner, {
                  label: "Creating task"
                }),
                "Confirming\u2026"
              )
            : "Save review request"
        )
      )
    )
  );
}
function EmergencyPanel({ state, controller }: PatientShellProps) {
  const [confirmed, setConfirmed] = useState(false);
  return createElement(
    "section",
    {
      "aria-labelledby": "emergency-title",
      className: styles.primaryPanel
    },
    createElement(
      "div",
      {
        className: styles.introCopy
      },
      createElement(
        "h1",
        {
          id: "emergency-title"
        },
        "Stop this check-in."
      ),
      createElement(
        "p",
        null,
        "Your required safety answers ended the ordinary flow before any camera check."
      )
    ),
    createRequiredChildrenElement(
      Banner,
      {
        title: "HomeRounds cannot assess an emergency",
        variant: "danger"
      },
      createElement(
        "p",
        null,
        "In a real situation, use the emergency help available where you are."
      )
    ),
    state.protocolResult && !state.action
      ? createElement(
          Card,
          null,
          createElement(
            CardHeader,
            null,
            createElement(CardTitle, null, "Confirm that you have seen this guidance"),
            createElement(CardDescription, null, "No clinical service or responder is connected.")
          ),
          createElement(
            CardContent,
            null,
            createElement(
              "label",
              {
                className: styles.checkboxChoice
              },
              createElement("input", {
                checked: confirmed,
                onChange: (event) => setConfirmed(event.currentTarget.checked),
                type: "checkbox"
              }),
              createElement(
                "span",
                null,
                "I understand this is general guidance and no emergency service is connected."
              )
            )
          ),
          createElement(
            CardFooter,
            null,
            createRequiredChildrenElement(
              Button,
              {
                disabled: !confirmed || state.pending !== null,
                onClick: () => void controller.confirmAction()
              },
              "Confirm guidance shown"
            )
          )
        )
      : null
  );
}
function OutcomePanel({
  state
}: Readonly<{
  state: PatientWorkflowState;
}>) {
  const action = state.action;
  const projectedTask = action?.kind === "programme_task" ? action.task : state.task;
  if (projectedTask) {
    const completed = projectedTask.status === "completed";
    return createElement(
      "section",
      {
        "aria-labelledby": "outcome-title",
        className: styles.primaryPanel
      },
      createElement(
        "div",
        {
          className: styles.introCopy
        },
        createElement(
          "h1",
          {
            id: "outcome-title"
          },
          completed ? "Review finished" : "Your review request is saved"
        ),
        createElement(
          "p",
          null,
          completed
            ? "The saved sample review was marked complete inside HomeRounds."
            : "This sample request is waiting inside HomeRounds. Nothing was sent to a real clinic."
        )
      ),
      createRequiredChildrenElement(
        Banner,
        {
          title:
            action?.kind === "programme_task"
              ? action.created
                ? "One sample request saved"
                : "Existing request restored"
              : "Saved request restored",
          variant: "success"
        },
        createElement("p", null, "Repeated confirmation does not create duplicate clinical work.")
      ),
      createElement(
        Card,
        null,
        createElement(
          CardHeader,
          null,
          createElement(CardTitle, null, "What happens next"),
          createElement(
            CardDescription,
            null,
            "This saved status belongs only to the sample HomeRounds profile."
          )
        ),
        createElement(
          CardContent,
          null,
          createElement(
            "dl",
            {
              className: styles.definitionList
            },
            createElement(
              "div",
              null,
              createElement("dt", null, "Owner"),
              createElement("dd", null, "HomeRounds review queue")
            ),
            createElement(
              "div",
              null,
              createElement("dt", null, "Status"),
              createElement(
                "dd",
                null,
                completed
                  ? "Completed in HomeRounds"
                  : projectedTask.status === "open"
                    ? "Waiting in HomeRounds"
                    : projectedTask.status
              )
            ),
            createElement(
              "div",
              null,
              createElement("dt", null, "Timing"),
              createElement("dd", null, "No real response time is promised")
            )
          )
        )
      )
    );
  }
  if (action?.kind === "emergency_guidance") {
    return createElement(
      "section",
      {
        "aria-labelledby": "outcome-title",
        className: styles.primaryPanel
      },
      createElement(
        "div",
        {
          className: styles.introCopy
        },
        createElement(
          "h1",
          {
            id: "outcome-title"
          },
          "This check-in has stopped"
        ),
        createElement(
          "p",
          null,
          "HomeRounds showed general safety guidance and did not continue to a camera check."
        )
      ),
      createRequiredChildrenElement(
        Banner,
        {
          title: "Guidance recorded as shown",
          variant: "warning"
        },
        createElement(
          "p",
          null,
          "No diagnosis was made and no real clinical service was contacted."
        )
      )
    );
  }
  const abstained = state.round?.state === "abstained_for_review";
  const completed = state.round?.state === "outcome_ready" || state.round?.state === "closed";
  return createElement(
    "section",
    {
      "aria-labelledby": "outcome-title",
      className: styles.primaryPanel
    },
    createElement(
      "div",
      {
        className: styles.introCopy
      },
      createElement(
        "h1",
        {
          id: "outcome-title"
        },
        abstained
          ? "No reading was accepted"
          : completed
            ? "Review finished"
            : "Programme review requested"
      ),
      createElement(
        "p",
        null,
        abstained
          ? "HomeRounds preserved the uncertainty and did not invent a camera value."
          : completed
            ? "The sample review was marked complete inside HomeRounds."
            : "Your confirmed information is waiting inside HomeRounds. Nothing was sent to a clinic."
      )
    ),
    createElement(
      Card,
      null,
      createElement(
        CardHeader,
        null,
        createElement(CardTitle, null, "Saved round status"),
        createElement(CardDescription, null, "This status comes from the persisted round state.")
      ),
      createElement(
        CardContent,
        null,
        createElement(
          "dl",
          {
            className: styles.definitionList
          },
          createElement(
            "div",
            null,
            createElement("dt", null, "Owner"),
            createElement(
              "dd",
              null,
              abstained ? "No review owner confirmed" : "HomeRounds review queue"
            )
          ),
          createElement(
            "div",
            null,
            createElement("dt", null, "Status"),
            createElement(
              "dd",
              null,
              completed ? "Completed in HomeRounds" : "Waiting in HomeRounds"
            )
          ),
          createElement(
            "div",
            null,
            createElement("dt", null, "Timing"),
            createElement("dd", null, "No real response time is promised")
          ),
          createElement(
            "div",
            null,
            createElement("dt", null, "Round state"),
            createElement("dd", null, state.round?.state.replaceAll("_", " "))
          )
        )
      )
    )
  );
}
function ResumeRecoveryPanel({ state, controller }: PatientShellProps) {
  const canAbstain = state.round
    ? ["capturing", "capture_retry", "assessment_selected"].includes(state.round.state)
    : false;
  return createElement(
    "section",
    {
      "aria-labelledby": "resume-title",
      className: styles.primaryPanel
    },
    createElement(
      "div",
      {
        className: styles.introCopy
      },
      createElement(
        "h1",
        {
          id: "resume-title"
        },
        "Your saved round needs a safe recovery step"
      ),
      createElement(
        "p",
        null,
        "The persisted state was restored. Ephemeral camera, transcript, and decision data were not reused."
      )
    ),
    createElement(FeedbackState, {
      action: canAbstain
        ? createRequiredChildrenElement(
            Button,
            {
              onClick: () => void controller.continueWithoutMeasurement(),
              variant: "secondary"
            },
            "Continue without a measurement"
          )
        : undefined,
      description:
        "Some short-lived check information has expired, so this step cannot be resumed safely.",
      kind: "error",
      title: "No local assumption was used"
    })
  );
}
function ProcessingPanel({
  controller
}: Readonly<{
  controller: PatientWorkflowController;
}>) {
  return createElement(
    "section",
    {
      "aria-labelledby": "processing-title",
      className: styles.primaryPanel
    },
    createElement(
      "div",
      {
        className: styles.introCopy
      },
      createElement(
        "h1",
        {
          id: "processing-title"
        },
        "Checking your saved answers"
      ),
      createElement("p", null, "HomeRounds is finishing the next saved step.")
    ),
    createElement(FeedbackState, {
      action: createRequiredChildrenElement(
        Button,
        {
          onClick: () => void controller.refresh(),
          variant: "secondary"
        },
        "Reload saved state"
      ),
      description: "Reload if this state does not update. Your confirmed answers remain saved.",
      kind: "loading",
      title: "Finishing your check-in"
    })
  );
}
function CancelledPanel() {
  return createElement(
    "section",
    {
      "aria-labelledby": "cancelled-title",
      className: styles.primaryPanel
    },
    createElement(
      "div",
      {
        className: styles.introCopy
      },
      createElement(
        "h1",
        {
          id: "cancelled-title"
        },
        "This round was cancelled"
      ),
      createElement(
        "p",
        null,
        "No further answers, camera values, or actions will be submitted for this round."
      )
    ),
    createRequiredChildrenElement(
      Banner,
      {
        title: "Camera and microphone stopped",
        variant: "information"
      },
      createElement("p", null, "You can close this page. No further step will run.")
    )
  );
}
function LoadingPanel({ state, controller }: PatientShellProps) {
  if (state.error) {
    return createElement(FeedbackState, {
      action: createRequiredChildrenElement(
        Button,
        {
          onClick: () => void controller.initialise(),
          variant: "secondary"
        },
        "Try again"
      ),
      description: state.error.message,
      kind: "error",
      title: state.error.title
    });
  }
  return createElement(FeedbackState, {
    description: "Looking for saved progress before starting anything new.",
    kind: "loading",
    title: "Loading your saved round"
  });
}
function assertNever(value: never): never {
  throw new Error(`Unhandled patient workflow view: ${String(value)}`);
}

function MedicationReviewPanel({
  state,
  controller,
  provider,
  createId,
  now
}: PatientShellProps & {
  provider: MedicationLabelProvider;
  createId: () => string;
  now: () => string;
}) {
  const round = state.round;
  if (!round) return null;
  return createElement(MedicationLabelPanel, {
    roundId: round.id,
    stateVersion: round.stateVersion,
    consentVersion: "homerounds-synthetic-medication-label-v1",
    provider,
    onConfirmed: (fact) => controller.confirmMedicationFact(fact),
    onSkipped: () => controller.skipMedicationReview(),
    createId,
    now
  });
}

function VoiceBiomarkerPanel({
  state,
  controller,
  provider
}: PatientShellProps & { provider: VoiceBiomarkerProvider }) {
  const requested = useRef(false);
  const session = state.voiceBiomarkerSession;

  useEffect(() => {
    if (requested.current || session !== null) return;
    requested.current = true;
    void controller.prepareVoiceBiomarker();
  }, [controller, session]);

  if (!state.round) return null;
  if (!session) {
    if (state.error && state.pending === null) {
      return createElement(FeedbackState, {
        action: createRequiredChildrenElement(
          Button,
          {
            onClick: () => {
              void controller.prepareVoiceBiomarker();
            },
            variant: "secondary"
          },
          "Try preparing the voice station again"
        ),
        description: state.error.message,
        kind: "error",
        title: "Voice station could not be prepared"
      });
    }
    return createElement(FeedbackState, {
      description:
        "Preparing the optional voice check. No microphone capture starts without your consent.",
      kind: "loading",
      title: "Preparing the optional voice-signal station"
    });
  }

  return createElement(VoiceBiomarkerStation, {
    assessmentSessionId: session.assessmentSessionId,
    onCompleted: (fact) => controller.completeVoiceBiomarker(fact),
    onDeclined: () => controller.skipVoiceBiomarker("patient_declined"),
    provider,
    roundId: state.round.id
  });
}

function PatientWorkflowContent({
  view,
  state,
  controller,
  voiceProvider,
  createId,
  now,
  medicationLabelProvider,
  voiceBiomarkerProvider,
  companion
}: PatientShellProps & {
  view: PatientWorkflowView;
  voiceProvider: VoiceSessionProvider;
  createId: () => string;
  now: () => string;
  medicationLabelProvider: MedicationLabelProvider;
  voiceBiomarkerProvider: VoiceBiomarkerProvider;
  companion: DesktopCompanionController;
}): ReactNode {
  switch (view) {
    case "loading":
      return createElement(LoadingPanel, {
        controller: controller,
        state: state
      });
    case "invitation":
      return createElement(InvitationPanel, {
        controller: controller,
        state: state
      });
    case "report":
      return createElement(ReportPanel, {
        controller: controller,
        createId: createId,
        now: now,
        state: state,
        voiceProvider: voiceProvider
      });
    case "voice_biomarker":
      return createElement(VoiceBiomarkerPanel, {
        controller,
        provider: voiceBiomarkerProvider,
        state
      });
    case "medication_review":
      return createElement(MedicationReviewPanel, {
        controller,
        state,
        provider: medicationLabelProvider,
        createId,
        now
      });
    case "measurement_prepare":
    case "measurement_ready":
    case "measurement_unavailable":
    case "capturing":
    case "capture_retry":
      return createElement(MeasurementPanel, {
        companion,
        controller: controller,
        state: state
      });
    case "follow_up":
      return createElement(FollowUpPanel, {
        controller: controller,
        state: state
      });
    case "action_confirmation":
      return createElement(ActionConfirmationPanel, {
        controller: controller,
        state: state
      });
    case "emergency":
      return createElement(EmergencyPanel, {
        controller: controller,
        state: state
      });
    case "processing":
      return createElement(ProcessingPanel, {
        controller: controller
      });
    case "resume_recovery":
      return createElement(ResumeRecoveryPanel, {
        controller: controller,
        state: state
      });
    case "outcome":
      return createElement(OutcomePanel, {
        state: state
      });
    case "cancelled":
      return createElement(CancelledPanel, null);
    default:
      return assertNever(view);
  }
}
export function PatientRoundApp({
  config,
  api: providedApi,
  voiceProvider: providedVoice,
  voiceBiomarkerProvider: providedVoiceBiomarker,
  createOpticalProvider = createPatientOpticalProvider,
  loadRecordedCaptureReplay: providedReplayLoader,
  createId = browserId,
  now = browserNow,
  isOnline,
  onRetryAdaptiveSelection,
  roundMapExperience: providedRoundMapExperience,
  medicationLabelProvider: providedMedicationLabelProvider,
  timeoutMs = 180000
}: PatientRoundAppProps) {
  const api = useMemo<PatientRoundApi>(
    () =>
      providedApi ?? new HomeRoundsApiClient({ baseUrl: apiBaseUrl(), fetcher: browserFetcher }),
    [providedApi]
  );
  const voiceProvider = useMemo(
    () => providedVoice ?? createPatientVoiceProvider(),
    [providedVoice]
  );
  const voiceBiomarkerProvider = useMemo(
    () => providedVoiceBiomarker ?? createPatientVoiceBiomarkerProvider(),
    [providedVoiceBiomarker]
  );
  const medicationLabelProvider = useMemo(
    () => providedMedicationLabelProvider ?? new ApiMedicationLabelProvider(api),
    [api, providedMedicationLabelProvider]
  );
  const recordedCaptureReplayLoader = useMemo(
    () =>
      providedReplayLoader === null
        ? undefined
        : (providedReplayLoader ?? createRecordedCaptureReplayLoader(browserFetcher)),
    [providedReplayLoader]
  );
  const controller = useMemo(
    () =>
      new PatientWorkflowController({
        api,
        config,
        createOpticalProvider,
        createId,
        ...(recordedCaptureReplayLoader
          ? { loadRecordedCaptureReplay: recordedCaptureReplayLoader }
          : {}),
        now,
        ...(isOnline ? { isOnline } : {})
      }),
    [api, config, createId, createOpticalProvider, isOnline, now, recordedCaptureReplayLoader]
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot
  );
  const view = patientWorkflowView(state);
  const roundMapExperience = useMemo(
    () => providedRoundMapExperience ?? liveRoundMapExperience(state),
    [providedRoundMapExperience, state]
  );
  const [acceptedRecommendation, setAcceptedRecommendation] = useState<string | null>(null);
  const companion = useDesktopCompanion();
  const selectedRecommendation = state.evidenceRoute?.selectedModuleId ?? null;
  const showRecommendation =
    roundMapExperience !== undefined &&
    selectedRecommendation !== null &&
    recommendationViews.has(view) &&
    acceptedRecommendation !== selectedRecommendation;
  useEffect(() => {
    const online = () => controller.setOnline(true);
    const offline = () => controller.setOnline(false);
    const interrupt = () => {
      void voiceProvider.stop("pagehide").catch(() => undefined);
      void controller.interrupt();
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") interrupt();
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    window.addEventListener("pagehide", interrupt);
    document.addEventListener("visibilitychange", visibility);
    const timeout = window.setTimeout(() => void controller.timeout(), timeoutMs);
    void controller.initialise();
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      window.removeEventListener("pagehide", interrupt);
      document.removeEventListener("visibilitychange", visibility);
      void voiceProvider.stop("navigation").catch(() => undefined);
      void controller.interrupt();
    };
  }, [controller, timeoutMs, voiceProvider]);
  return createElement(
    "div",
    {
      className: styles.page
    },
    createRequiredChildrenElement(
      AppShell,
      {
        className: styles.shell,
        footer: createElement(
          "p",
          {
            className: styles.footerCopy
          },
          "Sample profile \u00B7 Not medical care"
        ),
        header: createElement(PatientHeader, {
          controller: controller,
          state: state,
          view
        })
      },
      createElement(
        "div",
        {
          className: styles.content
        },
        createElement(StepProgress, {
          label: "Round progress",
          steps: progressSteps(view)
        }),
        showRecommendation
          ? createElement(AdaptiveRoundMap, {
              experience: roundMapExperience,
              onContinue: () => setAcceptedRecommendation(selectedRecommendation),
              ...(onRetryAdaptiveSelection ? { onRetry: onRetryAdaptiveSelection } : {})
            })
          : null,
        createElement(ErrorNotice, {
          controller: controller,
          state: state
        }),
        !showRecommendation && state.recordedReplayLabel
          ? createRequiredChildrenElement(
              Banner,
              {
                title: "Labelled sample reading used",
                variant: "information"
              },
              createElement(
                "p",
                null,
                "You chose a labelled sample after a live camera attempt failed. It is not a live or medically validated reading."
              )
            )
          : null,
        showRecommendation
          ? null
          : createElement(PatientWorkflowContent, {
              controller: controller,
              createId: createId,
              state: state,
              view: view,
              voiceProvider: voiceProvider,
              voiceBiomarkerProvider,
              medicationLabelProvider,
              companion,
              now
            })
      )
    )
  );
}
