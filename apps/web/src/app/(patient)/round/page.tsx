import { PatientRoundApp } from "../../../features/patient/patient-round-app";
import { patientRoundConfigForScenario } from "../../../features/shared-round/patient-round-config";

type PatientRoundPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PatientRoundPage({ searchParams }: PatientRoundPageProps) {
  const scenario = (await searchParams).scenario;
  return (
    <PatientRoundApp
      config={patientRoundConfigForScenario(Array.isArray(scenario) ? scenario[0] : scenario)}
    />
  );
}
