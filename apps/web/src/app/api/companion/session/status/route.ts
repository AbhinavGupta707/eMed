import { handleUpdateCompanionStatus } from "@/server/companion/handlers";
import { getCompanionRouteRuntime } from "@/server/companion/runtime";

export const runtime = "nodejs";

export function POST(request: Request): Promise<Response> {
  return handleUpdateCompanionStatus(request, getCompanionRouteRuntime());
}
