/**
 * /api/v1/t/[tenant]/messenger/conversations/[id]/receipts
 *
 * POST — 마지막 읽은 메시지 갱신 (MessageReceipt upsert).
 * Body: { lastReadMessageId: uuid, lastReadAt?: ISO8601 }
 *
 * 가드: withTenant + 본인 멤버.
 */
import { z } from "zod";
import { withTenant } from "@/lib/api-guard-tenant";
import { tenantPrismaFor } from "@/lib/db/prisma-tenant-client";
import { successResponse, errorResponse } from "@/lib/api-response";
import { messengerErrorResponse } from "@/lib/messenger/route-utils";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ tenant: string; id: string }>;
}

const receiptSchema = z
  .object({
    lastReadMessageId: z.string().uuid(),
    lastReadAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

export const POST = withTenant(async (request, user, tenant, context) => {
  const { id: convId } = await (context as unknown as RouteContext).params;
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return errorResponse("INVALID_BODY", "JSON 본문 필요", 400);
  }
  const parsed = receiptSchema.safeParse(raw);
  if (!parsed.success) {
    return errorResponse(
      "VALIDATION_ERROR",
      parsed.error.issues.map((i) => i.message).join(", "),
      400,
    );
  }
  try {
    const db = tenantPrismaFor({ tenantId: tenant.id });
    const m = await db.conversationMember.findUnique({
      where: {
        conversationId_userId: { conversationId: convId, userId: user.sub },
      },
      select: { leftAt: true },
    });
    if (!m || m.leftAt !== null) {
      return errorResponse(
        "CONVERSATION_NOT_MEMBER",
        "대화 멤버가 아닙니다",
        403,
      );
    }

    // message 가 같은 conversation 인지 검증 (cross-conversation 침투 방어).
    const msg = await db.message.findUnique({
      where: { id: parsed.data.lastReadMessageId },
      select: { conversationId: true },
    });
    if (!msg || msg.conversationId !== convId) {
      return errorResponse(
        "NOT_FOUND",
        "해당 메시지를 찾을 수 없습니다",
        404,
      );
    }

    const lastReadAt = parsed.data.lastReadAt
      ? new Date(parsed.data.lastReadAt)
      : new Date();

    const receipt = await db.messageReceipt.upsert({
      where: {
        conversationId_userId: { conversationId: convId, userId: user.sub },
      },
      create: {
        conversationId: convId,
        userId: user.sub,
        lastReadMessageId: parsed.data.lastReadMessageId,
        lastReadAt,
      },
      update: {
        lastReadMessageId: parsed.data.lastReadMessageId,
        lastReadAt,
      },
    });
    return successResponse({ receipt });
  } catch (err) {
    return messengerErrorResponse(err);
  }
});
