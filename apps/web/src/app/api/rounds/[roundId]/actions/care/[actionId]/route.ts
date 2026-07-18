import {
  createServerCareActionRuntime,
  handleGetCareAction,
  handleMutateCareAction
} from "@/server/actions";
import { getServerRuntime } from "@/server/runtime";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ roundId: string; actionId: string }> }
): Promise<Response> {
  const { roundId, actionId } = await context.params;
  return handleGetCareAction(
    request,
    createServerCareActionRuntime(getServerRuntime()),
    roundId,
    actionId
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ roundId: string; actionId: string }> }
): Promise<Response> {
  const { roundId, actionId } = await context.params;
  return handleMutateCareAction(
    request,
    createServerCareActionRuntime(getServerRuntime()),
    roundId,
    actionId
  );
}
