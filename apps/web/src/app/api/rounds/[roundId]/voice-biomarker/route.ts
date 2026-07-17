import { handleSubmitVoiceBiomarker } from "@/server/route-handlers";
import { getServerRuntime } from "@/server/runtime";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ roundId: string }> }
): Promise<Response> {
  return handleSubmitVoiceBiomarker(request, getServerRuntime(), (await context.params).roundId);
}
