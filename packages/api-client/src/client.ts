import { z } from "zod";

import {
  ApiErrorEnvelopeSchema,
  ApiSuccessEnvelopeSchema,
  BaselineDataSchema,
  StructuredMemoryDataSchema,
  StructuredMemoryUpdateRequestSchema,
  CareActionListDataSchema,
  CareActionMutationReceiptSchema,
  CareActionSubmissionReceiptSchema,
  MutateCareActionRequestSchema,
  SubmitCareActionRequestSchema,
  AssessmentSessionDataSchema,
  ConfirmMedicationObservationDataSchema,
  ConfirmMedicationObservationRequestSchema,
  ClinicianMutationReceiptSchema,
  ClinicianMutationRequestSchema,
  ClinicianTaskDetailDataSchema,
  CreateRoundDataSchema,
  CreateRoundRequestSchema,
  ElevenLabsCredentialDataSchema,
  ExecuteActionDataSchema,
  ExecuteActionRequestSchema,
  QueueDataSchema,
  RoundDataSchema,
  SkipVoiceBiomarkerDataSchema,
  SkipVoiceBiomarkerRequestSchema,
  StartAssessmentRequestSchema,
  StartVoiceBiomarkerRequestSchema,
  SubmitAssessmentDataSchema,
  SubmitAssessmentRequestSchema,
  SubmitCaptureQualityDataSchema,
  SubmitCaptureQualityRequestSchema,
  SubmitFollowUpDataSchema,
  SubmitFollowUpRequestSchema,
  SubmitMedicationLabelImageDataSchema,
  SubmitMedicationLabelImageRequestSchema,
  SubmitReportDataSchema,
  SubmitReportRequestSchema,
  SubmitVoiceBiomarkerDataSchema,
  SubmitVoiceBiomarkerRequestSchema,
  TransitionRoundRequestSchema,
  VoiceBiomarkerSessionDataSchema,
  type CreateRoundRequest,
  type ClinicianMutationRequest,
  type ConfirmMedicationObservationRequest,
  type ExecuteActionRequest,
  type StartAssessmentRequest,
  type StartVoiceBiomarkerRequest,
  type SkipVoiceBiomarkerRequest,
  type SubmitAssessmentRequest,
  type SubmitCaptureQualityRequest,
  type SubmitFollowUpRequest,
  type SubmitMedicationLabelImageRequest,
  type SubmitReportRequest,
  type SubmitVoiceBiomarkerRequest,
  type TransitionRoundRequest,
  type StructuredMemoryUpdateRequest,
  type MutateCareActionRequest,
  type SubmitCareActionRequest
} from "./schemas";

export class HomeRoundsApiError extends Error {
  constructor(readonly envelope: z.infer<typeof ApiErrorEnvelopeSchema>) {
    super(`HomeRounds API request failed: ${envelope.error.code}`);
    this.name = "HomeRoundsApiError";
  }
}

export type HomeRoundsApiClientOptions = {
  baseUrl: string;
  fetcher?: typeof fetch;
};

export type VitalLensProxyClientInput = {
  providerVersion: string;
  requestId: string;
  consentVersion: string;
  consentGrantedAt: string;
  metadata: unknown;
  bytes: Uint8Array;
};

export class HomeRoundsApiClient {
  readonly #baseUrl: URL;
  readonly #fetcher: typeof fetch;

  constructor(options: HomeRoundsApiClientOptions) {
    this.#baseUrl = new URL(z.url().parse(options.baseUrl));
    this.#fetcher = options.fetcher ?? fetch.bind(globalThis);
  }

  createRound(input: CreateRoundRequest) {
    return this.#json(
      "/api/rounds",
      "POST",
      CreateRoundRequestSchema.parse(input),
      CreateRoundDataSchema
    );
  }

  getRound(roundId: string) {
    return this.#json(`/api/rounds/${z.uuid().parse(roundId)}`, "GET", undefined, RoundDataSchema);
  }

  getBaselines() {
    return this.#json("/api/baselines", "GET", undefined, BaselineDataSchema);
  }

  getStructuredMemory() {
    return this.#json("/api/memory", "GET", undefined, StructuredMemoryDataSchema);
  }

  updateStructuredMemory(input: StructuredMemoryUpdateRequest) {
    return this.#json(
      "/api/memory",
      "POST",
      StructuredMemoryUpdateRequestSchema.parse(input),
      StructuredMemoryDataSchema
    );
  }

  listCareActions(roundId: string) {
    return this.#json(
      `/api/rounds/${z.uuid().parse(roundId)}/actions/care`,
      "GET",
      undefined,
      CareActionListDataSchema
    );
  }

  submitCareAction(roundId: string, input: SubmitCareActionRequest) {
    return this.#json(
      `/api/rounds/${z.uuid().parse(roundId)}/actions/care`,
      "POST",
      SubmitCareActionRequestSchema.parse(input),
      CareActionSubmissionReceiptSchema
    );
  }

  mutateCareAction(roundId: string, actionId: string, input: MutateCareActionRequest) {
    return this.#json(
      `/api/rounds/${z.uuid().parse(roundId)}/actions/care/${z.uuid().parse(actionId)}`,
      "POST",
      MutateCareActionRequestSchema.parse(input),
      CareActionMutationReceiptSchema
    );
  }

  transitionRound(roundId: string, input: TransitionRoundRequest) {
    return this.#json(
      `/api/rounds/${z.uuid().parse(roundId)}/transition`,
      "POST",
      TransitionRoundRequestSchema.parse(input),
      RoundDataSchema
    );
  }

  submitReport(roundId: string, input: SubmitReportRequest) {
    return this.#json(
      `/api/rounds/${z.uuid().parse(roundId)}/report`,
      "POST",
      SubmitReportRequestSchema.parse(input),
      SubmitReportDataSchema
    );
  }

  submitMedicationLabelImage(
    roundId: string,
    input: SubmitMedicationLabelImageRequest,
    signal?: AbortSignal
  ) {
    return this.#json(
      `/api/rounds/${z.uuid().parse(roundId)}/medication/label`,
      "POST",
      SubmitMedicationLabelImageRequestSchema.parse(input),
      SubmitMedicationLabelImageDataSchema,
      signal
    );
  }

  confirmMedicationObservation(roundId: string, input: ConfirmMedicationObservationRequest) {
    return this.#json(
      `/api/rounds/${z.uuid().parse(roundId)}/medication/confirmation`,
      "POST",
      ConfirmMedicationObservationRequestSchema.parse(input),
      ConfirmMedicationObservationDataSchema
    );
  }

  startAssessment(roundId: string, input: StartAssessmentRequest) {
    return this.#json(
      `/api/rounds/${z.uuid().parse(roundId)}/assessments/session`,
      "POST",
      StartAssessmentRequestSchema.parse(input),
      AssessmentSessionDataSchema
    );
  }

  startVoiceBiomarker(roundId: string, input: StartVoiceBiomarkerRequest) {
    return this.#json(
      `/api/rounds/${z.uuid().parse(roundId)}/voice-biomarker/session`,
      "POST",
      StartVoiceBiomarkerRequestSchema.parse(input),
      VoiceBiomarkerSessionDataSchema
    );
  }

  submitVoiceBiomarker(roundId: string, input: SubmitVoiceBiomarkerRequest) {
    return this.#json(
      `/api/rounds/${z.uuid().parse(roundId)}/voice-biomarker`,
      "POST",
      SubmitVoiceBiomarkerRequestSchema.parse(input),
      SubmitVoiceBiomarkerDataSchema
    );
  }

  skipVoiceBiomarker(roundId: string, input: SkipVoiceBiomarkerRequest) {
    return this.#json(
      `/api/rounds/${z.uuid().parse(roundId)}/voice-biomarker/skip`,
      "POST",
      SkipVoiceBiomarkerRequestSchema.parse(input),
      SkipVoiceBiomarkerDataSchema
    );
  }

  submitAssessment(roundId: string, input: SubmitAssessmentRequest) {
    return this.#json(
      `/api/rounds/${z.uuid().parse(roundId)}/assessments`,
      "POST",
      SubmitAssessmentRequestSchema.parse(input),
      SubmitAssessmentDataSchema
    );
  }

  submitCaptureQuality(roundId: string, input: SubmitCaptureQualityRequest) {
    return this.#json(
      `/api/rounds/${z.uuid().parse(roundId)}/assessments/quality`,
      "POST",
      SubmitCaptureQualityRequestSchema.parse(input),
      SubmitCaptureQualityDataSchema
    );
  }

  submitFollowUp(roundId: string, input: SubmitFollowUpRequest) {
    return this.#json(
      `/api/rounds/${z.uuid().parse(roundId)}/follow-up`,
      "POST",
      SubmitFollowUpRequestSchema.parse(input),
      SubmitFollowUpDataSchema
    );
  }

  executeAction(roundId: string, input: ExecuteActionRequest) {
    return this.#json(
      `/api/rounds/${z.uuid().parse(roundId)}/actions`,
      "POST",
      ExecuteActionRequestSchema.parse(input),
      ExecuteActionDataSchema
    );
  }

  getSnapshot<T>(patientId: string, snapshotSchema: z.ZodType<T>) {
    const dataSchema = z.object({ snapshot: snapshotSchema }).strict();
    return this.#json(
      `/api/snapshots/${encodeURIComponent(z.string().min(1).max(120).parse(patientId))}`,
      "GET",
      undefined,
      dataSchema
    );
  }

  getQueue(roundIds: readonly string[]) {
    const parsedIds = z.array(z.uuid()).min(1).max(50).parse(roundIds);
    const query = new URLSearchParams(parsedIds.map((roundId) => ["roundId", roundId]));
    return this.#json(`/api/clinician/queue?${query}`, "GET", undefined, QueueDataSchema);
  }

  getClinicianTask(taskId: string) {
    return this.#json(
      `/api/clinician/tasks/${z.uuid().parse(taskId)}`,
      "GET",
      undefined,
      ClinicianTaskDetailDataSchema
    );
  }

  mutateClinicianTask(taskId: string, input: ClinicianMutationRequest) {
    return this.#json(
      `/api/clinician/tasks/${z.uuid().parse(taskId)}`,
      "POST",
      ClinicianMutationRequestSchema.parse(input),
      ClinicianMutationReceiptSchema
    );
  }

  issueElevenLabsCredential() {
    return this.#json(
      "/api/providers/elevenlabs/session",
      "POST",
      {},
      ElevenLabsCredentialDataSchema
    );
  }

  async proxyVitalLens<T>(
    input: VitalLensProxyClientInput,
    responseSchema: z.ZodType<T>
  ): Promise<T> {
    const response = await this.#fetcher(new URL("/api/providers/vitallens/proxy", this.#baseUrl), {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/octet-stream",
        "x-homerounds-provider-version": z.string().min(1).max(120).parse(input.providerVersion),
        "x-homerounds-request-id": z.uuid().parse(input.requestId),
        "x-homerounds-consent-version": z.string().min(1).max(120).parse(input.consentVersion),
        "x-homerounds-consent-granted-at": z.iso.datetime().parse(input.consentGrantedAt),
        "x-homerounds-payload-metadata": JSON.stringify(input.metadata)
      },
      body: new Blob([Uint8Array.from(input.bytes).buffer])
    });
    const body = await this.#parseJson(response);
    if (!response.ok) throw new HomeRoundsApiError(ApiErrorEnvelopeSchema.parse(body));
    return ApiSuccessEnvelopeSchema(responseSchema).parse(body).data;
  }

  async #json<T>(
    path: string,
    method: "GET" | "POST",
    body: unknown,
    dataSchema: z.ZodType<T>,
    signal?: AbortSignal
  ): Promise<T> {
    const requestInit: RequestInit = {
      method,
      credentials: "include",
      ...(signal ? { signal } : {})
    };
    if (body !== undefined) {
      requestInit.headers = { "content-type": "application/json" };
      requestInit.body = JSON.stringify(body);
    }
    const response = await this.#fetcher(new URL(path, this.#baseUrl), requestInit);
    const value = await this.#parseJson(response);
    if (!response.ok) throw new HomeRoundsApiError(ApiErrorEnvelopeSchema.parse(value));
    return ApiSuccessEnvelopeSchema(dataSchema).parse(value).data;
  }

  async #parseJson(response: Response): Promise<unknown> {
    const text = await response.text();
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new Error("HomeRounds API returned a non-JSON response.");
    }
  }
}
