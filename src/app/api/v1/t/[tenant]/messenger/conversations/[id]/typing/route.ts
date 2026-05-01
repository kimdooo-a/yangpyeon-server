/**
 * /api/v1/t/[tenant]/messenger/conversations/[id]/typing
 *
 * POST — typing 신호. 본인 멤버 자격 + rate-limit 1/sec/user. SSE publish (typing.started, M3).
 *
 * Phase 1: typing 은 저장하지 않고 publish 만 (PRD §284 결정 — 무저장 publish only).
 *   payload: { conversationId, userId, expiresAt }  expiresAt = now+6s (클라이언트 TTL 가이드)
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/api-guard-tenant";
import { tenantPrismaFor } from "@/lib/db/prisma-tenant-client";
import { successResponse, errorResponse } from "@/lib/api-response";
import { applyRateLimit } from "@/lib/rate-limit-guard";
import { publishConvEvent } from "@/lib/messenger/sse";

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

  const expiresAt = new Date(Date.now() + 6_000).toISOString();
  publishConvEvent(tenant.id, id, "typing.started", {
    userId: user.sub,
    expiresAt,
  });
  return successResponse({ acknowledged: true, expiresAt });
});
