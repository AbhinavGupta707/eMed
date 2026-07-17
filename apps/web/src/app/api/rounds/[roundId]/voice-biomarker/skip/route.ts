import { handleSkipVoiceBiomarker } from "@/server/route-handlers";
import { getServerRuntime } from "@/server/runtime";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ roundId: string }> }
): Promise<Response> {
  return handleSkipVoiceBiomarker(request, getServerRuntime(), (await context.params).roundId);
}
