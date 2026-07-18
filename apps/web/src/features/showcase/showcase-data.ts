export type ContextEvent = Readonly<{
  id: string;
  when: string;
  title: string;
  detail: string;
  source: string;
  x: number;
  y: number;
}>;

export type EvidencePassport = Readonly<{
  id: string;
  label: string;
  value: string;
  source: string;
  comparison: string;
  status: "accepted" | "rejected" | "supporting" | "uncertain";
  explanation: string;
}>;

export const COPD_CONTEXT_EVENTS: readonly ContextEvent[] = [
  {
    id: "inhaler",
    when: "7 days ago",
    title: "Maintenance inhaler changed",
    detail: "New device confirmed in the sample medication record.",
    source: "Medication record",
    x: 14,
    y: 19
  },
  {
    id: "activity",
    when: "4 days ago",
    title: "Activity 23% below usual",
    detail: "Compared with Maya’s compatible fourteen-day baseline.",
    source: "Personal baseline",
    x: 78,
    y: 18
  },
  {
    id: "sleep",
    when: "2 days ago",
    title: "Two disturbed nights",
    detail: "Confirmed night waking increased from the usual pattern.",
    source: "Patient check-in",
    x: 82,
    y: 72
  },
  {
    id: "breathing",
    when: "Today",
    title: "More breathless on the stairs",
    detail: "A new symptom report completed the configured change pattern.",
    source: "Patient report",
    x: 12,
    y: 72
  }
];

export const HEART_CONTEXT_EVENTS: readonly ContextEvent[] = [
  {
    id: "weight",
    when: "3 days ago",
    title: "Weight rose by 0.8 kg",
    detail: "A modest change that remains below the configured 2 kg alert boundary.",
    source: "Confirmed home reading",
    x: 14,
    y: 19
  },
  {
    id: "activity",
    when: "2 days ago",
    title: "Activity 21% below usual",
    detail: "Compared with Maya’s compatible fourteen-day personal baseline.",
    source: "Personal baseline",
    x: 78,
    y: 18
  },
  {
    id: "medication",
    when: "Yesterday",
    title: "Dose record needs reconciling",
    detail: "A recent instruction and the pack at home do not yet establish the current dose.",
    source: "Medication record",
    x: 82,
    y: 72
  },
  {
    id: "breathlessness",
    when: "Today",
    title: "Stairs feel harder than usual",
    detail: "New breathlessness and fatigue completed the configured change pattern.",
    source: "Patient report",
    x: 12,
    y: 72
  }
];

export const HEART_EVIDENCE: readonly EvidencePassport[] = [
  {
    id: "respiratory-rate",
    label: "Respiratory rate",
    value: "22 breaths/min",
    source: "Facial vital assessment",
    comparison: "Personal baseline 15–18",
    status: "accepted",
    explanation: "Capture quality passed for this signal."
  },
  {
    id: "facial-pulse",
    label: "Facial pulse estimate",
    value: "Not accepted",
    source: "Facial vital assessment",
    comparison: "Motion exceeded quality limit",
    status: "rejected",
    explanation: "The unreliable estimate was discarded before workflow use."
  },
  {
    id: "finger-pulse",
    label: "Finger pulse",
    value: "96 bpm",
    source: "On-phone finger PPG",
    comparison: "Personal baseline 68–80",
    status: "accepted",
    explanation: "The fallback signal passed the configured quality gate."
  },
  {
    id: "voice",
    label: "Voice pattern",
    value: "More effortful than usual",
    source: "Sustained-vowel comparison",
    comparison: "Maya’s previous compatible samples",
    status: "supporting",
    explanation: "Supporting context only; never independent action authority."
  },
  {
    id: "medication",
    label: "Medication package",
    value: "20 mg pack confirmed",
    source: "Guided package scan",
    comparison: "Current daily instruction remains open",
    status: "uncertain",
    explanation: "The pack identity is known; the clinician must reconcile the active dose."
  }
];

export const COPD_EVIDENCE: readonly EvidencePassport[] = [
  {
    id: "respiratory-rate",
    label: "Respiratory rate",
    value: "23 breaths/min",
    source: "Facial vital scan",
    comparison: "Personal baseline 16–18",
    status: "accepted",
    explanation: "Capture quality passed for this signal."
  },
  {
    id: "facial-pulse",
    label: "Facial pulse estimate",
    value: "Not accepted",
    source: "Facial vital scan",
    comparison: "Excessive motion",
    status: "rejected",
    explanation: "The weak pulse estimate was discarded before workflow use."
  },
  {
    id: "finger-pulse",
    label: "Finger pulse",
    value: "96 bpm",
    source: "On-phone finger PPG",
    comparison: "Personal baseline 72–82",
    status: "accepted",
    explanation: "The fallback signal passed the configured quality gate."
  },
  {
    id: "voice",
    label: "Voice pattern",
    value: "Changed from usual",
    source: "Local sustained-vowel signal",
    comparison: "Maya’s previous compatible samples",
    status: "supporting",
    explanation: "Supporting context only; never independent action authority."
  },
  {
    id: "inhaler-technique",
    label: "Inhaler sequence",
    value: "One step uncertain",
    source: "Guided phone review",
    comparison: "Four-step technique sequence",
    status: "supporting",
    explanation: "Breath-hold confirmation was incomplete and remains visible."
  }
];

export const GLP_CONTEXT_EVENTS: readonly ContextEvent[] = [
  {
    id: "dose",
    when: "6 days ago",
    title: "Dose stepped up",
    detail: "The latest sample prescription event changed the weekly dose.",
    source: "Medication record",
    x: 15,
    y: 22
  },
  {
    id: "nausea",
    when: "3 days ago",
    title: "Nausea increased",
    detail: "Alex described symptoms after the dose change.",
    source: "Patient report",
    x: 78,
    y: 20
  },
  {
    id: "nutrition",
    when: "Yesterday",
    title: "Meals became smaller",
    detail: "The tolerance round preserves the patient’s confirmed context.",
    source: "Patient check-in",
    x: 81,
    y: 70
  },
  {
    id: "continuity",
    when: "Today",
    title: "Refill needs review",
    detail: "Medication continuity is the smallest useful next action.",
    source: "Programme record",
    x: 13,
    y: 72
  }
];

export const SHOWCASE_ROUND_ID = "0fd22f56-d5ce-4f0a-bfd3-165a4e8a2b01";
