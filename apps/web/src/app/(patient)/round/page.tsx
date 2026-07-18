import { PatientRoundApp } from "../../../features/patient/patient-round-app";
import { patientRoundConfigForScenario } from "../../../features/shared-round/patient-round-config";
import { readSyntheticBaselineSeed } from "../../../server/baselines/demo-seed";

type PatientRoundPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PatientRoundPage({ searchParams }: PatientRoundPageProps) {
  const scenario = (await searchParams).scenario;
  const defaultDevicePreference = readSyntheticBaselineSeed().personalization.defaultDevice;
  return (
    <PatientRoundApp
      config={patientRoundConfigForScenario(Array.isArray(scenario) ? scenario[0] : scenario)}
      defaultDevicePreference={defaultDevicePreference}
    />
  );
}
