"use client";
import { HomeRoundsApiClient } from "@homerounds/api-client";
import { PatientReportSchema, RedFlagAnswerSchema, type RoundState } from "@homerounds/contracts";
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
  StatusChip,
  StepProgress,
  type ProgressStep
} from "@homerounds/ui";
import {
  Fragment,
  createElement,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type ReactNode
} from "react";
import { VoiceInteractionPanel } from "../voice";
import { AdaptiveRoundMap, type RoundMapExperience } from "../round-map";
import type { PatientRoundLaunchConfig } from "../shared-round/patient-round-config";
import {
  PatientWorkflowController,
  patientWorkflowView,
  type OpticalProviderFactory,
  type PatientRoundApi,
  type PatientWorkflowState,
  type PatientWorkflowView
} from "../workflows/patient-workflow-controller";
import { createPatientOpticalProvider, createPatientVoiceProvider } from "./provider-factories";
import {
  createRecordedCaptureReplayLoader,
  type RecordedCaptureReplayLoader
} from "./recorded-capture-replay";
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
  createOpticalProvider?: OpticalProviderFactory;
  loadRecordedCaptureReplay?: RecordedCaptureReplayLoader | null;
  createId?: () => string;
  now?: () => string;
  isOnline?: () => boolean;
  onRetryAdaptiveSelection?: () => void;
  roundMapExperience?: RoundMapExperience;
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
function progressSteps(view: PatientWorkflowView): readonly ProgressStep[] {
  const current = stepIndex(view);
  return ["Check in", "Measure", "Confirm", "Outcome"].map((label, index) => ({
    id: `patient-step-${index}`,
    label,
    state: index < current ? "complete" : index === current ? "current" : "upcoming"
  }));
}
function PatientHeader({ state, controller }: PatientShellProps) {
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
      createElement(
        "span",
        {
          "aria-hidden": "true",
          className: styles.brandMark
        },
        "HR"
      ),
      createElement("span", null, "HomeRounds")
    ),
    createElement(
      "div",
      {
        className: styles.headerActions
      },
      createElement(
        StatusChip,
        {
          variant: "information"
        },
        "Synthetic demo"
      ),
      createRequiredChildrenElement(
        Button,
        {
          disabled: state.pending !== null,
          onClick: () => void controller.refresh(),
          size: "compact",
          variant: "quiet"
        },
        "Refresh saved state"
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
            "Cancel round"
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
        "Your two-minute check is ready"
      ),
      createElement("p", null, state.round?.purpose)
    ),
    createElement(
      Card,
      null,
      createElement(
        CardHeader,
        null,
        createElement(CardTitle, null, "Before you start"),
        createElement(
          CardDescription,
          null,
          "You stay in control of every submitted answer and action."
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
          createElement(
            "li",
            null,
            "Required safety questions are answered with structured controls."
          ),
          createElement(
            "li",
            null,
            "Voice is optional, editable, and cannot choose urgency or an action."
          ),
          createElement(
            "li",
            null,
            "A camera estimate appears only after the configured quality gate passes."
          ),
          createElement(
            "li",
            null,
            "No raw camera frames or raw voice audio are stored by HomeRounds."
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
            "I understand this is a synthetic demonstration, not clinically validated software, and not a medical service."
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
            : "Start the check"
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
  createId
}: PatientShellProps & {
  voiceProvider: VoiceSessionProvider;
  createId: () => string;
}) {
  const [chestPain, setChestPain] = useState<string | null>(null);
  const [severeBreathlessness, setSevereBreathlessness] = useState<string | null>(null);
  const [fainted, setFainted] = useState<string | null>(null);
  const [weakness, setWeakness] = useState<string | null>(null);
  const [palpitations, setPalpitations] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<TranscriptConfirmation | null>(null);
  const round = state.round;
  const complete =
    round !== null &&
    chestPain !== null &&
    severeBreathlessness !== null &&
    fainted !== null &&
    weakness !== null &&
    palpitations !== null &&
    confirmation !== null;
  function submitReport(): void {
    if (!complete || !round || !confirmation) return;
    const report = createConfirmedPatientReport({
      reportId: createId(),
      confirmation,
      fields: PatientReportSchema.pick({
        weakness: true,
        palpitations: true,
        redFlags: true
      })
        .strict()
        .parse({
          weakness,
          palpitations,
          redFlags: { chestPain, severeBreathlessness, fainted }
        })
    });
    void controller.submitConfirmedReport(report);
  }
  return createElement(
    "section",
    {
      "aria-labelledby": "report-title",
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
          id: "report-title"
        },
        "Tell us what is happening now"
      ),
      createElement(
        "p",
        null,
        "Answer every safety question yourself. Voice or typed narrative cannot skip them."
      )
    ),
    createRequiredChildrenElement(
      Banner,
      {
        title: "Safety questions are checked first",
        variant: "warning"
      },
      createElement(
        "p",
        null,
        "A \u201Cyes\u201D answer stops the ordinary demo flow. \u201CI\u2019m not sure\u201D remains uncertain and is sent for review; it is never treated as \u201Cno\u201D."
      )
    ),
    createElement(
      Card,
      null,
      createElement(
        CardHeader,
        null,
        createElement(CardTitle, null, "Required safety answers"),
        createElement(CardDescription, null, "All three answers are required before submission.")
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
      )
    ),
    createElement(
      Card,
      null,
      createElement(
        CardHeader,
        null,
        createElement(CardTitle, null, "Your structured check-in"),
        createElement(
          CardDescription,
          null,
          "These confirmed controls, not narrative text, become protocol facts."
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
          onChange: (value) => setPalpitations(PatientReportSchema.shape.palpitations.parse(value)),
          options: palpitationOptions,
          value: palpitations
        })
      )
    ),
    round
      ? createElement(VoiceInteractionPanel, {
          createId: createId,
          onConfirmed: setConfirmation,
          provider: voiceProvider,
          roundId: round.id
        })
      : null,
    createElement(
      "p",
      {
        className: styles.privacyNote
      },
      "The confirmed narrative remains ephemeral in this slice. HomeRounds submits only your structured answers and whether you used confirmed voice or text."
    ),
    createElement(
      "div",
      {
        className: styles.primaryActions
      },
      createRequiredChildrenElement(
        Button,
        {
          disabled: !complete || state.pending !== null,
          onClick: submitReport
        },
        state.pending === "submitting_report" || state.pending === "transition"
          ? createElement(
              Fragment,
              null,
              createElement(Spinner, {
                label: "Checking answers"
              }),
              "Checking answers\u2026"
            )
          : "Confirm and continue"
      )
    )
  );
}
function MeasurementPanel({ state, controller }: PatientShellProps) {
  const [consented, setConsented] = useState(false);
  const session = state.assessmentSession;
  const providerLabel =
    session?.provider === "vitallens" ? "VitalLens face check" : "Finger pulse check";
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
        createElement(
          "p",
          null,
          "No number is shown unless the selected provider returns a passing quality result."
        )
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
              "Use labelled recorded demo capture"
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
            "Recorded synthetic recovery is optional, never automatic, contains no raw media or patient data, and is not physical-device evidence."
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
        createElement("p", null, "HomeRounds will not switch providers inside this round.")
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
        title: providerLabel
      })
    );
  }
  if (!session) {
    return createElement(
      "section",
      {
        "aria-labelledby": "prepare-title",
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
            id: "prepare-title"
          },
          "Next, prepare a short camera pulse check"
        ),
        createElement(
          "p",
          null,
          "The server selects exactly one registered provider. This page never changes it."
        )
      ),
      createElement(
        Card,
        null,
        createElement(
          CardHeader,
          null,
          createElement(CardTitle, null, "What to expect"),
          createElement(CardDescription, null, "The check is optional and remains quality gated.")
        ),
        createElement(
          CardContent,
          null,
          createElement(
            "ul",
            {
              className: styles.plainList
            },
            createElement("li", null, "Camera support and permission are checked explicitly."),
            createElement(
              "li",
              null,
              "Finger PPG processes derived samples locally and sends no frames."
            ),
            createElement(
              "li",
              null,
              "VitalLens, when configured, requires separate third-party data-flow consent."
            ),
            createElement(
              "li",
              null,
              "No estimate appears for poor, failed, or unavailable capture."
            )
          )
        ),
        createElement(
          CardFooter,
          null,
          createRequiredChildrenElement(
            Button,
            {
              disabled: state.pending !== null,
              onClick: () => void controller.prepareMeasurement()
            },
            state.pending === "preparing_camera"
              ? createElement(
                  Fragment,
                  null,
                  createElement(Spinner, {
                    label: "Preparing camera"
                  }),
                  "Preparing\u2026"
                )
              : "Check this device"
          )
        )
      )
    );
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
        "Your device is ready for the",
        providerLabel.toLowerCase()
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
        createElement(CardTitle, null, providerLabel),
        createElement(
          CardDescription,
          null,
          session.provider === "finger_ppg"
            ? "Cover the rear camera and optional torch gently with a fingertip."
            : "Keep your face centred. Cropped, downsampled frames would pass through the HomeRounds proxy."
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
            "I consent to this synthetic-demo camera check and understand that no result is guaranteed."
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
    provider_quality_failed: "The selected provider did not return passing quality.",
    permission_denied: "Camera permission was not granted.",
    unsupported_device: "This device does not support the selected check.",
    provider_unavailable: "The selected provider was unavailable.",
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
        "One more structured question"
      ),
      createElement(
        "p",
        null,
        "The deterministic protocol returned this question. No second follow-up is allowed."
      )
    ),
    state.measurement
      ? createElement(MeasurementQuality, {
          details: createElement(
            "p",
            {
              className: styles.measurementValue
            },
            "Demo pulse estimate:",
            createElement("strong", null, state.measurement.value, "bpm")
          ),
          reasons: ["The selected provider passed the configured demo quality gate."],
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
        "Confirm the next demo step"
      ),
      createElement(
        "p",
        null,
        "The deterministic protocol proposes one allowlisted action. You decide whether to run it."
      )
    ),
    state.measurement
      ? createElement(MeasurementQuality, {
          details: createElement(
            "p",
            {
              className: styles.measurementValue
            },
            "Demo pulse estimate:",
            createElement("strong", null, state.measurement.value, "bpm")
          ),
          reasons: ["The selected provider passed the configured demo quality gate."],
          status: "pass"
        })
      : null,
    createElement(
      Card,
      null,
      createElement(
        CardHeader,
        null,
        createElement(CardTitle, null, "Programme review requested"),
        createElement(
          CardDescription,
          null,
          abstained
            ? "The protocol stopped because confirmed information was uncertain or incomplete."
            : "The illustrative demo protocol requested neutral programme review."
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
            createElement("dd", null, "Fictional programme clinician")
          ),
          createElement(
            "div",
            null,
            createElement("dt", null, "Protocol"),
            createElement("dd", null, result.protocolVersion, "\u00B7 illustrative demo only")
          ),
          createElement(
            "div",
            null,
            createElement("dt", null, "Timing"),
            createElement("dd", null, "Demo-only window; no real response is promised")
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
          createElement("span", null, "I confirm creation of one synthetic programme-review task.")
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
            : "Create synthetic review task"
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
        "Stop this demo round"
      ),
      createElement(
        "p",
        null,
        "The deterministic safety gate ended the ordinary flow before any camera check."
      )
    ),
    createRequiredChildrenElement(
      Banner,
      {
        title: "This prototype cannot assess an emergency",
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
            createElement(CardTitle, null, "Confirm that you have seen the demo guidance"),
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
              createElement("span", null, "I understand this is generic synthetic-demo guidance.")
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
          completed
            ? "Synthetic review completed"
            : (action?.message.heading ?? "Programme review requested")
        ),
        createElement(
          "p",
          null,
          completed
            ? "The fictional clinician completed this saved demo task."
            : (action?.message.body ??
                "Your confirmed synthetic information is waiting in the saved round.")
        )
      ),
      createRequiredChildrenElement(
        Banner,
        {
          title:
            action?.kind === "programme_task"
              ? action.created
                ? "One synthetic task created"
                : "Existing synthetic task reused"
              : "Saved synthetic task restored",
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
            action?.kind === "programme_task"
              ? "This outcome is demo-only and not a medical service."
              : "This task status comes from persisted task data."
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
              createElement("dd", null, "Fictional programme clinician")
            ),
            createElement(
              "div",
              null,
              createElement("dt", null, "Status"),
              createElement(
                "dd",
                null,
                completed
                  ? "Completed in clinician cockpit"
                  : projectedTask.status === "open"
                    ? "Waiting for synthetic review"
                    : projectedTask.status
              )
            ),
            createElement(
              "div",
              null,
              createElement("dt", null, "Timing"),
              createElement(
                "dd",
                null,
                action?.kind === "programme_task"
                  ? (action.message.serviceWindowLabel ?? projectedTask.serviceWindowLabel)
                  : projectedTask.serviceWindowLabel
              )
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
          action.message.heading
        ),
        createElement("p", null, action.message.body)
      ),
      createRequiredChildrenElement(
        Banner,
        {
          title: "Demo guidance recorded as shown",
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
          ? "The demo stopped without a measurement"
          : completed
            ? "Synthetic review completed"
            : "Programme review requested"
      ),
      createElement(
        "p",
        null,
        abstained
          ? "HomeRounds preserved the uncertainty and did not invent a camera value."
          : completed
            ? "The fictional clinician completed this saved demo task."
            : "Your confirmed synthetic information is waiting in the saved round."
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
              abstained ? "No review-task owner confirmed" : "Fictional programme clinician"
            )
          ),
          createElement(
            "div",
            null,
            createElement("dt", null, "Status"),
            createElement(
              "dd",
              null,
              completed ? "Completed in clinician cockpit" : "Waiting for synthetic review"
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
        "This build cannot safely reconstruct the exact assessment session or protocol decision from the current round projection.",
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
        "Checking the saved round"
      ),
      createElement("p", null, "The deterministic service is finishing the protocol state.")
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
      description: "Reload if this state does not update. No model controls this decision.",
      kind: "loading",
      title: "Protocol evaluation in progress"
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
      createElement("p", null, "You can close this page. This remains a synthetic demonstration.")
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
    description: "Looking for an existing synthetic round before creating anything new.",
    kind: "loading",
    title: "Loading your saved round"
  });
}
function assertNever(value: never): never {
  throw new Error(`Unhandled patient workflow view: ${String(value)}`);
}
function PatientWorkflowContent({
  view,
  state,
  controller,
  voiceProvider,
  createId
}: PatientShellProps & {
  view: PatientWorkflowView;
  voiceProvider: VoiceSessionProvider;
  createId: () => string;
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
        state: state,
        voiceProvider: voiceProvider
      });
    case "measurement_prepare":
    case "measurement_ready":
    case "measurement_unavailable":
    case "capturing":
    case "capture_retry":
      return createElement(MeasurementPanel, {
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
  createOpticalProvider = createPatientOpticalProvider,
  loadRecordedCaptureReplay: providedReplayLoader,
  createId = browserId,
  now = browserNow,
  isOnline,
  onRetryAdaptiveSelection,
  roundMapExperience,
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
          "Synthetic demonstration only \u00B7 not clinically validated \u00B7 not for medical decisions"
        ),
        header: createElement(PatientHeader, {
          controller: controller,
          state: state
        })
      },
      createElement(
        "div",
        {
          className: styles.content
        },
        createRequiredChildrenElement(
          Banner,
          {
            title: "Synthetic demonstration — not clinically validated",
            variant: "warning"
          },
          createElement(
            "p",
            null,
            "HomeRounds is a hackathon prototype. It does not diagnose, give medication advice, or connect you to a real care service."
          )
        ),
        createElement(StepProgress, {
          label: "Round progress",
          steps: progressSteps(view)
        }),
        roundMapExperience
          ? createElement(AdaptiveRoundMap, {
              experience: roundMapExperience,
              ...(onRetryAdaptiveSelection ? { onRetry: onRetryAdaptiveSelection } : {})
            })
          : null,
        createElement(ErrorNotice, {
          controller: controller,
          state: state
        }),
        state.recordedReplayLabel
          ? createRequiredChildrenElement(
              Banner,
              {
                title: state.recordedReplayLabel,
                variant: "information"
              },
              createElement(
                "p",
                null,
                "Explicit recorded synthetic recovery was used after a live-capture failure. It is not physical-device or medical-validation evidence."
              )
            )
          : null,
        createElement(PatientWorkflowContent, {
          controller: controller,
          createId: createId,
          state: state,
          view: view,
          voiceProvider: voiceProvider
        })
      )
    )
  );
}
