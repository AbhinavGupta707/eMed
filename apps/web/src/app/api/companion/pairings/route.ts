import {
  handleCreateCompanionPairing,
  handleGetCurrentCompanionPairing
} from "@/server/companion/handlers";
import { getCompanionRouteRuntime } from "@/server/companion/runtime";

export const runtime = "nodejs";

export function GET(request: Request): Promise<Response> {
  return handleGetCurrentCompanionPairing(request, getCompanionRouteRuntime());
}

export function POST(request: Request): Promise<Response> {
  return handleCreateCompanionPairing(request, getCompanionRouteRuntime());
}
