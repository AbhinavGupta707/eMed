import { handleGetCompanionSession } from "@/server/companion/handlers";
import { getCompanionRouteRuntime } from "@/server/companion/runtime";

export const runtime = "nodejs";

export function GET(request: Request): Promise<Response> {
  return handleGetCompanionSession(request, getCompanionRouteRuntime());
}
