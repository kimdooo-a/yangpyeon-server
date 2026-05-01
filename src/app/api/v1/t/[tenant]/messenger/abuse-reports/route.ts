/**
 * /api/v1/t/[tenant]/messenger/abuse-reports
 *
 * POST — 신고 생성 (rate-limit 5/min/user, DUPLICATE_REPORT/NOT_FOUND 검증).
 *
 * audit: messenger.report_filed.
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/api-guard-tenant";
import { successResponse, errorResponse } from "@/lib/api-response";
import { applyRateLimit } from "@/lib/rate-limit-guard";
import { fileReport } from "@/lib/messenger/reports";
import { fileReportSchema } from "@/lib/schemas/messenger/safety";
import {
  messengerErrorResponse,
  emitMessengerAudit,
} from "@/lib/messenger/route-utils";

export const runtime = "nodejs";

export const POST = withTenant(async (request, user, tenant) => {
  const limited = await applyRateLimit(request as unknown as NextRequest, {
    scope: "messenger.report_file",
    maxRequests: 5,
    windowMs: 60_000,
    identifier: { dimension: "user", value: user.sub },
  });
  if (limited) return limited;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return errorResponse("INVALID_BODY", "JSON 본문 필요", 400);
  }
  const parsed = fileReportSchema.safeParse(raw);
  if (!parsed.success) {
    return errorResponse(
      "VALIDATION_ERROR",
      parsed.error.issues.map((i) => i.message).join(", "),
      400,
    );
  }
  try {
    const report = await fileReport({
      reporterId: user.sub,
      targetKind: parsed.data.targetKind,
      targetId: parsed.data.targetId,
      reason: parsed.data.reason,
    });
    await emitMessengerAudit({
      event: "messenger.report_filed",
      actor: user.email ?? user.sub,
      request: request as unknown as Request,
      details: {
        tenantId: tenant.id,
        reportId: report.id,
        targetKind: parsed.data.targetKind,
        targetId: parsed.data.targetId,
      },
    });
    return successResponse({ report }, 201);
  } catch (err) {
    return messengerErrorResponse(err);
  }
});
