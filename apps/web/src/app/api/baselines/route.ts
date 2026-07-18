import { handleGetBaselines } from "@/server/route-handlers";
import { getServerRuntime } from "@/server/runtime";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return handleGetBaselines(request, getServerRuntime());
}
