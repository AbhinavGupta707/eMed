import { handleDemoAccess, handlePublicDemoAccess } from "@/server/demo-access";
import { getServerRuntime } from "@/server/runtime";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return handlePublicDemoAccess(request, getServerRuntime());
}

export async function POST(request: Request): Promise<Response> {
  return handleDemoAccess(request, getServerRuntime());
}
