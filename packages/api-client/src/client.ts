import { z } from "zod";

import {
  ApiErrorEnvelopeSchema,
  ApiSuccessEnvelopeSchema,
  AssessmentSessionDataSchema,
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
  StartAssessmentRequestSchema,
  SubmitAssessmentDataSchema,
  SubmitAssessmentRequestSchema,
  SubmitCaptureQualityDataSchema,
  SubmitCaptureQualityRequestSchema,
  SubmitFollowUpDataSchema,
  SubmitFollowUpRequestSchema,
  SubmitReportDataSchema,
  SubmitReportRequestSchema,
  TransitionRoundRequestSchema,
  type CreateRoundRequest,
  type ClinicianMutationRequest,
  type ExecuteActionRequest,
  type StartAssessmentRequest,
  type SubmitAssessmentRequest,
  type SubmitCaptureQualityRequest,
  type SubmitFollowUpRequest,
  type SubmitReportRequest,
  type TransitionRoundRequest
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
    this.#fetcher = options.fetcher ?? fetch;
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

  startAssessment(roundId: string, input: StartAssessmentRequest) {
    return this.#json(
      `/api/rounds/${z.uuid().parse(roundId)}/assessments/session`,
      "POST",
      StartAssessmentRequestSchema.parse(input),
      AssessmentSessionDataSchema
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
    dataSchema: z.ZodType<T>
  ): Promise<T> {
    const requestInit: RequestInit = { method, credentials: "include" };
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
