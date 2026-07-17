export { DefaultMedicationCameraGateway, type MedicationCameraGateway } from "./browser-camera";
export {
  DefaultMedicationImageDecoder,
  prepareMedicationLabelImage,
  type MedicationImageDecoder,
  type PreparedMedicationLabelImage,
  type PrepareMedicationLabelImageInput
} from "./browser-image";
export {
  createConfirmedMedicationObservationFact,
  type ImageMedicationConfirmationInput,
  type TextMedicationConfirmationInput
} from "./confirmation";
export {
  MedicationCameraError,
  MedicationImageError,
  MedicationLabelTransportError,
  type MedicationCameraErrorCode,
  type MedicationImageErrorCode
} from "./errors";
export {
  MEDICATION_LABEL_MAX_BYTES,
  MEDICATION_LABEL_MAX_DIMENSION,
  MEDICATION_LABEL_MEDIA_TYPES,
  MEDICATION_LABEL_MIN_DIMENSION,
  hasExpectedMedicationImageSignature,
  validateMedicationImageBoundary
} from "./image-boundary";
export {
  DisabledMedicationLabelProvider,
  FakeMedicationLabelProvider,
  TransportMedicationLabelProvider,
  createDisabledMedicationLabelProvider,
  createFakeMedicationLabelProvider
} from "./provider";
export {
  MedicationLabelExtractionOutcomeSchema,
  MedicationLabelExtractionRequestSchema,
  type FakeMedicationLabelFixture,
  type MedicationLabelExtractionInput,
  type MedicationLabelExtractionOutcome,
  type MedicationLabelExtractionTransport,
  type MedicationLabelProvider,
  type MedicationLabelProviderAvailability,
  type MedicationLabelTransportRequest
} from "./types";
