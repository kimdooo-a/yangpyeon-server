/**
 * /api/v1/t/[tenant]/messenger/conversations/[id]/typing
 *
 * POST — typing 신호 (M3 SSE publish 도입 전 stub). 본인 멤버 자격 + rate-limit 1/sec/user.
 *
 * Phase 1 Note: M3 도입 전까지는 publish 없음 → 200 OK 만 반환 (클라이언트 호출은 noop 보장).
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/api-guard-tenant";
import { tenantPrismaFor } from "@/lib/db/prisma-tenant-client";
import { successResponse, errorResponse } from "@/lib/api-response";
import { applyRateLimit } from "@/lib/rate-limit-guard";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ tenant: string; id: string }>;
}

export const POST = withTenant(async (request, user, tenant, context) => {
  const { id } = await (context as unknown as RouteContext).params;

  const limited = await applyRateLimit(request as unknown as NextRequest, {
    scope: "messenger.typing",
    maxRequests: 1,
    windowMs: 1000,
    identifier: { dimension: "user", value: user.sub },
  });
  if (limited) return limited;

  const db = tenantPrismaFor({ tenantId: tenant.id });
  const m = await db.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId: id, userId: user.sub } },
    select: { leftAt: true },
  });
  if (!m || m.leftAt !== null) {
    return errorResponse(
      "CONVERSATION_NOT_MEMBER",
      "대화 멤버가 아닙니다",
      403,
    );
  }

  // M3 게이트 — SSE bus.publish 도입 전 stub.
  return successResponse({ acknowledged: true });
});
