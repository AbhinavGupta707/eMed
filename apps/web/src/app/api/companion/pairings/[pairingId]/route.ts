import { handleGetCompanionPairing } from "@/server/companion/handlers";
import { getCompanionRouteRuntime } from "@/server/companion/runtime";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ pairingId: string }> }
): Promise<Response> {
  return handleGetCompanionPairing(
    request,
    getCompanionRouteRuntime(),
    (await context.params).pairingId
  );
}
