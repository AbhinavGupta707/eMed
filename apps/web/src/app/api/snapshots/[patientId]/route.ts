import { handleSnapshot } from "@/server/route-handlers";
import { getServerRuntime } from "@/server/runtime";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ patientId: string }> }
): Promise<Response> {
  return handleSnapshot(request, getServerRuntime(), (await context.params).patientId);
}
