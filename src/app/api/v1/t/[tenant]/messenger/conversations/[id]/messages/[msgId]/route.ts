/**
 * /api/v1/t/[tenant]/messenger/conversations/[id]/messages/[msgId]
 *
 * PATCH  — 메시지 편집 (sender 본인 + 15분 이내).
 * DELETE — 메시지 회수 (sender 본인 24h 또는 OWNER/ADMIN 무제한).
 *
 * audit: messenger.message_edited / messenger.message_deleted.
 */
import { withTenant } from "@/lib/api-guard-tenant";
import { tenantPrismaFor } from "@/lib/db/prisma-tenant-client";
import { successResponse, errorResponse } from "@/lib/api-response";
import { editMessage, recallMessage } from "@/lib/messenger/messages";
import { editMessageSchema } from "@/lib/schemas/messenger/messages";
import {
  messengerErrorResponse,
  emitMessengerAudit,
} from "@/lib/messenger/route-utils";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ tenant: string; id: string; msgId: string }>;
}

export const PATCH = withTenant(async (request, user, tenant, context) => {
  const { msgId } = await (context as unknown as RouteContext).params;
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return errorResponse("INVALID_BODY", "JSON 본문 필요", 400);
  }
  const parsed = editMessageSchema.safeParse(raw);
  if (!parsed.success) {
    return errorResponse(
      "VALIDATION_ERROR",
      parsed.error.issues.map((i) => i.message).join(", "),
      400,
    );
  }
  try {
    const updated = await editMessage({
      messageId: msgId,
      editorId: user.sub,
      newBody: parsed.data.body,
    });
    await emitMessengerAudit({
      event: "messenger.message_edited",
      actor: user.email ?? user.sub,
      request: request as unknown as Request,
      details: {
        tenantId: tenant.id,
        messageId: msgId,
        editCount: updated.editCount,
      },
    });
    return successResponse({ message: updated });
  } catch (err) {
    return messengerErrorResponse(err);
  }
});

export const DELETE = withTenant(async (request, user, tenant, context) => {
  const { id: convId, msgId } = await (
    context as unknown as RouteContext
  ).params;
  try {
    // 권한 분기 — sender 본인 or 대화 OWNER/ADMIN.
    const db = tenantPrismaFor({ tenantId: tenant.id });
    const m = await db.conversationMember.findUnique({
      where: {
        conversationId_userId: { conversationId: convId, userId: user.sub },
      },
      select: { role: true, leftAt: true },
    });
    const actorIsAdmin =
      !!m && m.leftAt === null && (m.role === "OWNER" || m.role === "ADMIN");

    const recalled = await recallMessage({
      messageId: msgId,
      actorId: user.sub,
      actorIsAdmin,
    });
    await emitMessengerAudit({
      event: "messenger.message_deleted",
      actor: user.email ?? user.sub,
      request: request as unknown as Request,
      details: {
        tenantId: tenant.id,
        messageId: msgId,
        deletedBy: recalled.deletedBy,
      },
    });
    return successResponse({ message: recalled });
  } catch (err) {
    return messengerErrorResponse(err);
  }
});
