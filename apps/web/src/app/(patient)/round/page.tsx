import { PatientRoundApp } from "../../../features/patient/patient-round-app";
import { SYNTHETIC_MAYA_ROUND } from "../../../features/shared-round/patient-round-config";

export default function PatientRoundPage() {
  return <PatientRoundApp config={SYNTHETIC_MAYA_ROUND} />;
}
