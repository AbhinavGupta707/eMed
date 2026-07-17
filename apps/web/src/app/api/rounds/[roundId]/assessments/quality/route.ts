import { handleSubmitCaptureQuality } from "@/server/route-handlers";
import { getServerRuntime } from "@/server/runtime";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ roundId: string }> }
): Promise<Response> {
  const { roundId } = await context.params;
  return handleSubmitCaptureQuality(request, getServerRuntime(), roundId);
}
