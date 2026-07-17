import { handleConfirmMedicationObservation } from "@/server/route-handlers";
import { getServerRuntime } from "@/server/runtime";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ roundId: string }> };

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { roundId } = await context.params;
  return handleConfirmMedicationObservation(request, getServerRuntime(), roundId);
}
