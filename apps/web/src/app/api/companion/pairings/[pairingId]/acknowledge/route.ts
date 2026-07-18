import { handleAcknowledgeCompanionResult } from "@/server/companion/handlers";
import { getCompanionRouteRuntime } from "@/server/companion/runtime";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ pairingId: string }> }
): Promise<Response> {
  return handleAcknowledgeCompanionResult(
    request,
    getCompanionRouteRuntime(),
    (await context.params).pairingId
  );
}
