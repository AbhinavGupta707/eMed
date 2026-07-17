import { handleVitalLensProxy } from "@/server/route-handlers";
import { getServerRuntime } from "@/server/runtime";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return handleVitalLensProxy(request, getServerRuntime());
}
