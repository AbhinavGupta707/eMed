import { handleClinicianTaskDetail, handleClinicianTaskMutation } from "@/server/route-handlers";
import { getServerRuntime } from "@/server/runtime";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ taskId: string }> }
): Promise<Response> {
  const { taskId } = await context.params;
  return handleClinicianTaskDetail(request, getServerRuntime(), taskId);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ taskId: string }> }
): Promise<Response> {
  const { taskId } = await context.params;
  return handleClinicianTaskMutation(request, getServerRuntime(), taskId);
}
