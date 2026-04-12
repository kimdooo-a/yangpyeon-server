import { NextRequest } from "next/server";
import { withRole } from "@/lib/api-guard";
import { successResponse, errorResponse } from "@/lib/api-response";
import { buildSchemaGraph } from "@/lib/pg/introspect";

// information_schema 조회는 Node.js 런타임 전용 (pg 패키지 사용)
export const runtime = "nodejs";

export const GET = withRole(["ADMIN", "MANAGER"], async (_req: NextRequest) => {
  try {
    const graph = await buildSchemaGraph(["public"]);
    return successResponse(graph);
  } catch (err) {
    const message = err instanceof Error ? err.message : "스키마 조회 실패";
    return errorResponse("SCHEMA_ERROR", message, 500);
  }
});
