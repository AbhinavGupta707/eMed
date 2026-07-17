import { handleGetRound } from "@/server/route-handlers";
import { getServerRuntime } from "@/server/runtime";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ roundId: string }> }
): Promise<Response> {
  return handleGetRound(request, getServerRuntime(), (await context.params).roundId);
}
