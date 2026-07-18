import { handleRevokeCompanionPairing } from "@/server/companion/handlers";
import { getCompanionRouteRuntime } from "@/server/companion/runtime";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ pairingId: string }> }
): Promise<Response> {
  return handleRevokeCompanionPairing(
    request,
    getCompanionRouteRuntime(),
    (await context.params).pairingId
  );
}
