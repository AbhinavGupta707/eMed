import type { Metadata } from "next";
import { z } from "zod";

import { ClinicianCockpit } from "@/features/clinician";

export const metadata: Metadata = {
  title: "Clinician cockpit · HomeRounds",
  description: "Synthetic HomeRounds clinician task and evidence review cockpit."
};

type ClinicianPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ClinicianPage({ searchParams }: ClinicianPageProps) {
  const params = await searchParams;
  const roundIdValues = Array.isArray(params.roundId)
    ? params.roundId
    : params.roundId
      ? [params.roundId]
      : [];
  const parsed = roundIdValues.map((roundId) => z.uuid().safeParse(roundId));
  const roundIds = parsed.flatMap((result) => (result.success ? [result.data] : []));
  const invalidRoundIdCount = parsed.filter((result) => !result.success).length;

  return <ClinicianCockpit invalidRoundIdCount={invalidRoundIdCount} roundIds={roundIds} />;
}
