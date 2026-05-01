/**
 * /api/v1/t/[tenant]/messenger/conversations/[id]/members/[userId]
 *
 * DELETE — 멤버 제거 (OWNER/ADMIN 또는 self leave). soft remove (leftAt SET).
 *
 * audit: messenger.member_removed.
 */
import { withTenant } from "@/lib/api-guard-tenant";
import { tenantPrismaFor } from "@/lib/db/prisma-tenant-client";
import { successResponse, errorResponse } from "@/lib/api-response";
import { removeMember } from "@/lib/messenger/conversations";
import {
  messengerErrorResponse,
  emitMessengerAudit,
} from "@/lib/messenger/route-utils";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ tenant: string; id: string; userId: string }>;
}

export const DELETE = withTenant(async (request, user, tenant, context) => {
  const { id: convId, userId: removedUserId } = await (
    context as unknown as RouteContext
  ).params;

  try {
    const db = tenantPrismaFor({ tenantId: tenant.id });
    const me = await db.conversationMember.findUnique({
      where: {
        conversationId_userId: { conversationId: convId, userId: user.sub },
      },
      select: { role: true, leftAt: true },
    });
    const actorIsAdmin =
      !!me && me.leftAt === null && (me.role === "OWNER" || me.role === "ADMIN");

    const result = await removeMember({
      conversationId: convId,
      removerUserId: user.sub,
      removedUserId,
      actorIsAdmin,
    });
    await emitMessengerAudit({
      event: "messenger.member_removed",
      actor: user.email ?? user.sub,
      request: request as unknown as Request,
      details: {
        tenantId: tenant.id,
        conversationId: convId,
        removedUserId,
        selfLeave: removedUserId === user.sub,
      },
    });
    return successResponse({ member: result });
  } catch (err) {
    return messengerErrorResponse(err);
  }
});
