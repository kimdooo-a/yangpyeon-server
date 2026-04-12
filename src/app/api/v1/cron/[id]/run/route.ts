import { NextRequest } from "next/server";
import { withRole } from "@/lib/api-guard";
import { successResponse, errorResponse } from "@/lib/api-response";
import { runNow } from "@/lib/cron/registry";
import { writeAuditLog, extractClientIp } from "@/lib/audit-log";

export const runtime = "nodejs";

export const POST = withRole(["ADMIN"], async (request: NextRequest, _user, context) => {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  try {
    const result = await runNow(id);
    writeAuditLog({
      timestamp: new Date().toISOString(),
      method: "POST",
      path: `/api/v1/cron/${id}/run`,
      ip: extractClientIp(request.headers),
      action: "CRON_RUN_NOW",
      detail: `${id} → ${result.status}`,
      status: 200,
    });
    return successResponse(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "실행 실패";
    return errorResponse("RUN_FAILED", msg, 400);
  }
});
