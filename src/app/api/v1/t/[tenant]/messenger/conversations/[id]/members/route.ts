/**
 * /api/v1/t/[tenant]/messenger/conversations/[id]/members
 *
 * POST — 멤버 추가 (OWNER/ADMIN). 부분 성공 (added/skipped 응답).
 *
 * audit: messenger.member_added.
 */
import { withTenant } from "@/lib/api-guard-tenant";
import { tenantPrismaFor } from "@/lib/db/prisma-tenant-client";
import { successResponse, errorResponse } from "@/lib/api-response";
import { addMembers } from "@/lib/messenger/conversations";
import { addMembersSchema } from "@/lib/schemas/messenger/conversations";
import {
  messengerErrorResponse,
  emitMessengerAudit,
} from "@/lib/messenger/route-utils";
import { publishConvEvent } from "@/lib/messenger/sse";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ tenant: string; id: string }>;
}

export const POST = withTenant(async (request, user, tenant, context) => {
  const { id } = await (context as unknown as RouteContext).params;
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return errorResponse("INVALID_BODY", "JSON 본문 필요", 400);
  }
  const parsed = addMembersSchema.safeParse(raw);
  if (!parsed.success) {
    return errorResponse(
      "VALIDATION_ERROR",
      parsed.error.issues.map((i) => i.message).join(", "),
      400,
    );
  }
  try {
    const db = tenantPrismaFor({ tenantId: tenant.id });
    const me = await db.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: id, userId: user.sub } },
      select: { role: true, leftAt: true },
    });
    if (!me || me.leftAt !== null) {
      return errorResponse(
        "CONVERSATION_NOT_MEMBER",
        "대화 멤버가 아닙니다",
        403,
      );
    }
    if (me.role !== "OWNER" && me.role !== "ADMIN") {
      return errorResponse(
        "CONVERSATION_FORBIDDEN",
        "OWNER/ADMIN 권한이 필요합니다",
        403,
      );
    }

    const result = await addMembers({
      conversationId: id,
      actorId: user.sub,
      userIds: parsed.data.userIds,
    });
    if (result.added.length > 0) {
      await emitMessengerAudit({
        event: "messenger.member_added",
        actor: user.email ?? user.sub,
        request: request as unknown as Request,
        details: {
          tenantId: tenant.id,
          conversationId: id,
          addedUserIds: result.added.map((m) => m.userId),
          skippedCount: result.skipped.length,
        },
      });
      for (const m of result.added) {
        publishConvEvent(tenant.id, id, "member.joined", { member: m });
      }
    }
    return successResponse(result, 201);
  } catch (err) {
    return messengerErrorResponse(err);
  }
});
