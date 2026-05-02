/**
 * /api/v1/t/[tenant]/messenger/admin/reports/[id]/resolve
 *
 * POST — 신고 처리 (DELETE_MESSAGE / BLOCK_USER / DISMISS).
 *
 * 가드: withTenantRole(["OWNER","ADMIN"]).
 * audit: messenger.report_resolved.
 */
import { withTenantRole } from "@/lib/api-guard-tenant";
import { successResponse, errorResponse } from "@/lib/api-response";
import { resolveReport } from "@/lib/messenger/reports";
import { resolveReportSchema } from "@/lib/schemas/messenger/safety";
import {
  messengerErrorResponse,
  emitMessengerAudit,
} from "@/lib/messenger/route-utils";
import { publishUserEvent } from "@/lib/messenger/sse";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ tenant: string; id: string }>;
}

export const POST = withTenantRole(
  ["OWNER", "ADMIN"],
  async (request, user, tenant, context) => {
    const { id } = await (context as unknown as RouteContext).params;
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return errorResponse("INVALID_BODY", "JSON 본문 필요", 400);
    }
    const parsed = resolveReportSchema.safeParse(raw);
    if (!parsed.success) {
      return errorResponse(
        "VALIDATION_ERROR",
        parsed.error.issues.map((i) => i.message).join(", "),
        400,
      );
    }
    try {
      const result = await resolveReport({
        reportId: id,
        resolverId: user.sub,
        action: parsed.data.action,
        note: parsed.data.note,
      });
      await emitMessengerAudit({
        event: "messenger.report_resolved",
        actor: user.email ?? user.sub,
        request: request as unknown as Request,
        details: {
          tenantId: tenant.id,
          reportId: id,
          action: parsed.data.action,
          performedActions: result.performedActions,
        },
      });

      // M3 user 채널 — 신고자에게 처리 결과 알림 (PRD api-surface §4.3).
      publishUserEvent(
        tenant.id,
        result.report.reporterId,
        "report.resolved",
        {
          reportId: id,
          action: parsed.data.action,
          note: parsed.data.note ?? null,
        },
      );

      return successResponse(result);
    } catch (err) {
      return messengerErrorResponse(err);
    }
  },
);
