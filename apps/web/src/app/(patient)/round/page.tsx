import { PatientRoundApp } from "../../../features/patient/patient-round-app";
import { patientRoundConfigForScenario } from "../../../features/shared-round/patient-round-config";
import { readSyntheticBaselineSeed } from "../../../server/baselines/demo-seed";
import { getServerRuntime } from "../../../server/runtime";

export const dynamic = "force-dynamic";

type PatientRoundPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PatientRoundPage({ searchParams }: PatientRoundPageProps) {
  const resolved = await searchParams;
  const scenario = resolved.scenario;
  const triggerId = Array.isArray(resolved.triggerId) ? resolved.triggerId[0] : resolved.triggerId;
  const baseConfig = patientRoundConfigForScenario(
    Array.isArray(scenario) ? scenario[0] : scenario
  );
  const config =
    typeof triggerId === "string" &&
    triggerId.startsWith("proactive-trigger:v1:") &&
    triggerId.length <= 160
      ? {
          ...baseConfig,
          triggerId,
          purpose: "Review a combined change from Maya’s confirmed sample history"
        }
      : baseConfig;
  const runtime = getServerRuntime();
  const defaultDevicePreference = await runtime
    .ensureBaselinesReady()
    .then(() => runtime.baselines.getPersonalizationProjection("synthetic-maya"))
    .then(
      (projection) =>
        projection?.defaultDevice ?? readSyntheticBaselineSeed().personalization.defaultDevice
    )
    .catch(() => readSyntheticBaselineSeed().personalization.defaultDevice);
  return <PatientRoundApp config={config} defaultDevicePreference={defaultDevicePreference} />;
}
