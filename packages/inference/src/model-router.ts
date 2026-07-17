import type { InferenceTask } from "@homerounds/contracts/inference";

export type InferenceModality = "text" | "vision";

export type InferenceModelRoute = {
  readonly task: InferenceTask;
  readonly modality: InferenceModality;
  readonly modelAlias: string;
  readonly providerModelId: string;
  readonly reasoningEffort: "none";
  readonly maxOutputTokens: number;
};

const ROUTES = {
  adaptive_module_selection: {
    task: "adaptive_module_selection",
    modality: "text",
    modelAlias: "deepseek-v4-pro-none",
    providerModelId: "accounts/fireworks/models/deepseek-v4-pro",
    reasoningEffort: "none",
    maxOutputTokens: 600
  },
  medication_label_extraction: {
    task: "medication_label_extraction",
    modality: "vision",
    modelAlias: "kimi-k2p6-vision-none",
    providerModelId: "accounts/fireworks/models/kimi-k2p6",
    reasoningEffort: "none",
    maxOutputTokens: 1_200
  }
} as const satisfies Readonly<Record<InferenceTask, InferenceModelRoute>>;

export function routeInferenceTask(
  task: InferenceTask,
  modality: InferenceModality
): InferenceModelRoute | null {
  const route = ROUTES[task];
  return route.modality === modality ? route : null;
}

export function listInferenceModelRoutes(): readonly InferenceModelRoute[] {
  return Object.freeze([ROUTES.adaptive_module_selection, ROUTES.medication_label_extraction]);
}
