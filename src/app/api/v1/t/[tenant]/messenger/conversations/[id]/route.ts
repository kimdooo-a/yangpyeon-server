/**
 * /api/v1/t/[tenant]/messenger/conversations/[id]
 *
 * GET    — 단일 conversation 상세 (멤버 목록 + 본인 멤버십).
 * PATCH  — title 변경 또는 archive (OWNER/ADMIN).
 * DELETE — archive (soft delete, OWNER 만).
 *
 * 가드:
 *   - withTenant + 본인 멤버십 검증.
 *   - PATCH/DELETE 는 추가 role 검증 (라우트 내부).
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/api-guard-tenant";
import { tenantPrismaFor } from "@/lib/db/prisma-tenant-client";
import { successResponse, errorResponse } from "@/lib/api-response";
import { archiveConversation } from "@/lib/messenger/conversations";
import { updateConversationSchema } from "@/lib/schemas/messenger/conversations";
import {
  messengerErrorResponse,
  emitMessengerAudit,
} from "@/lib/messenger/route-utils";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ tenant: string; id: string }>;
}

export const GET = withTenant(async (_request, user, tenant, context) => {
  const { id } = await (context as unknown as RouteContext).params;
  try {
    const db = tenantPrismaFor({ tenantId: tenant.id });
    const conv = await db.conversation.findUnique({
      where: { id },
      include: {
        members: {
          where: { leftAt: null },
          select: {
            userId: true,
            role: true,
            joinedAt: true,
            pinnedAt: true,
            mutedUntil: true,
          },
        },
      },
    });
    if (!conv) {
      return errorResponse("NOT_FOUND", "대화를 찾을 수 없습니다", 404);
    }
    const myMembership = conv.members.find((m) => m.userId === user.sub);
    if (!myMembership) {
      return errorResponse(
        "CONVERSATION_NOT_MEMBER",
        "대화 멤버가 아닙니다",
        403,
      );
    }
    return successResponse({
      conversation: conv,
      myMembership,
    });
  } catch (err) {
    return messengerErrorResponse(err);
  }
});

export const PATCH = withTenant(async (request, user, tenant, context) => {
  const { id } = await (context as unknown as RouteContext).params;
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return errorResponse("INVALID_BODY", "JSON 본문 필요", 400);
  }
  const parsed = updateConversationSchema.safeParse(raw);
  if (!parsed.success) {
    return errorResponse(
      "VALIDATION_ERROR",
      parsed.error.issues.map((i) => i.message).join(", "),
      400,
    );
  }

  try {
    const db = tenantPrismaFor({ tenantId: tenant.id });
    const member = await db.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: id, userId: user.sub } },
      select: { role: true, leftAt: true },
    });
    if (!member || member.leftAt !== null) {
      return errorResponse(
        "CONVERSATION_NOT_MEMBER",
        "대화 멤버가 아닙니다",
        403,
      );
    }
    if (member.role !== "OWNER" && member.role !== "ADMIN") {
      return errorResponse(
        "CONVERSATION_FORBIDDEN",
        "OWNER/ADMIN 권한이 필요합니다",
        403,
      );
    }

    if (parsed.data.archived === true) {
      const result = await archiveConversation({
        conversationId: id,
        actorId: user.sub,
      });
      await emitMessengerAudit({
        event: "messenger.conversation_archived",
        actor: user.email ?? user.sub,
        request: request as unknown as Request,
        details: { tenantId: tenant.id, conversationId: id },
      });
      return successResponse({ conversation: result });
    }

    const updated = await db.conversation.update({
      where: { id },
      data: {
        ...(parsed.data.title !== undefined && { title: parsed.data.title }),
      },
    });
    await emitMessengerAudit({
      event: "messenger.conversation_updated",
      actor: user.email ?? user.sub,
      request: request as unknown as Request,
      details: {
        tenantId: tenant.id,
        conversationId: id,
        fields: Object.keys(parsed.data),
      },
    });
    return successResponse({ conversation: updated });
  } catch (err) {
    return messengerErrorResponse(err);
  }
});

export const DELETE = withTenant(async (request, user, tenant, context) => {
  const { id } = await (context as unknown as RouteContext).params;
  try {
    const db = tenantPrismaFor({ tenantId: tenant.id });
    const member = await db.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: id, userId: user.sub } },
      select: { role: true, leftAt: true },
    });
    if (!member || member.leftAt !== null) {
      return errorResponse(
        "CONVERSATION_NOT_MEMBER",
        "대화 멤버가 아닙니다",
        403,
      );
    }
    if (member.role !== "OWNER") {
      return errorResponse(
        "CONVERSATION_FORBIDDEN",
        "OWNER 만 archive 할 수 있습니다",
        403,
      );
    }
    const result = await archiveConversation({
      conversationId: id,
      actorId: user.sub,
    });
    await emitMessengerAudit({
      event: "messenger.conversation_archived",
      actor: user.email ?? user.sub,
      request: request as unknown as Request,
      details: { tenantId: tenant.id, conversationId: id },
    });
    return successResponse({ conversation: result });
  } catch (err) {
    return messengerErrorResponse(err);
  }
});
