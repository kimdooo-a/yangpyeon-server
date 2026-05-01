/**
 * /api/v1/t/[tenant]/messenger/admin/reports
 *
 * GET — 신고 큐 (운영자 전용). status 필터 + 페이지네이션.
 *
 * 가드: withTenantRole(["OWNER","ADMIN"]).
 */
import { z } from "zod";
import { withTenantRole } from "@/lib/api-guard-tenant";
import { successResponse, errorResponse } from "@/lib/api-response";
import { listOpenReports } from "@/lib/messenger/reports";
import { messengerErrorResponse } from "@/lib/messenger/route-utils";

export const runtime = "nodejs";

const querySchema = z
  .object({
    status: z.enum(["OPEN", "RESOLVED", "DISMISSED"]).optional(),
    cursor: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(30),
  })
  .strict();

export const GET = withTenantRole(["OWNER", "ADMIN"], async (request) => {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return errorResponse(
      "VALIDATION_ERROR",
      parsed.error.issues.map((i) => i.message).join(", "),
      400,
    );
  }
  try {
    const result = await listOpenReports({
      status: parsed.data.status,
      cursor: parsed.data.cursor,
      limit: parsed.data.limit,
    });
    return successResponse(result);
  } catch (err) {
    return messengerErrorResponse(err);
  }
});
