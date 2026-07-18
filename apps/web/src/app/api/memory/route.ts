import {
  handleGetStructuredMemory,
  handleUpdateStructuredMemory
} from "@/server/structured-memory";
import { getServerRuntime } from "@/server/runtime";

export const runtime = "nodejs";

export function GET(request: Request): Promise<Response> {
  return handleGetStructuredMemory(request, getServerRuntime());
}

export function POST(request: Request): Promise<Response> {
  return handleUpdateStructuredMemory(request, getServerRuntime());
}
