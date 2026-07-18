import {
  createServerCareActionRuntime,
  handleListCareActions,
  handleSubmitCareAction
} from "@/server/actions";
import { getServerRuntime } from "@/server/runtime";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ roundId: string }> }
): Promise<Response> {
  const { roundId } = await context.params;
  return handleListCareActions(request, createServerCareActionRuntime(getServerRuntime()), roundId);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ roundId: string }> }
): Promise<Response> {
  const { roundId } = await context.params;
  return handleSubmitCareAction(
    request,
    createServerCareActionRuntime(getServerRuntime()),
    roundId
  );
}
