import { handleReadiness } from "@/server/readiness";
import { getServerRuntime } from "@/server/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return handleReadiness(getServerRuntime());
}
