/**
 * /api/v1/t/[tenant]/messenger/conversations
 *
 * GET   — 본인이 멤버인 활성 conversation 목록 (페이지네이션, 미사용/M3 SSE 보강 예정).
 * POST  — DIRECT 또는 GROUP 생성. DIRECT 는 멱등 (동일 페어 활성 시 기존 반환).
 *
 * 가드:
 *   - withTenant — tenant slug + 인증.
 *   - 도메인 검증은 conversations.ts 헬퍼에 위임.
 *
 * audit: messenger.conversation_created (POST 신규).
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/api-guard-tenant";
import { tenantPrismaFor } from "@/lib/db/prisma-tenant-client";
import { successResponse, errorResponse } from "@/lib/api-response";
import {
  findOrCreateDirect,
  createGroup,
} from "@/lib/messenger/conversations";
import { createConversationSchema } from "@/lib/schemas/messenger/conversations";
import {
  messengerErrorResponse,
  emitMessengerAudit,
} from "@/lib/messenger/route-utils";

export const runtime = "nodejs";

export const GET = withTenant(async (_request, user, tenant) => {
  try {
    const db = tenantPrismaFor({ tenantId: tenant.id });
    const conversations = await db.conversation.findMany({
      where: {
        archivedAt: null,
        members: { some: { userId: user.sub, leftAt: null } },
      },
      orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
      include: {
        members: {
          where: { leftAt: null },
          select: { userId: true, role: true },
        },
      },
      take: 100,
    });
    return successResponse({ conversations });
  } catch (err) {
    return messengerErrorResponse(err);
  }
});

export const POST = withTenant(async (request, user, tenant) => {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return errorResponse("INVALID_BODY", "JSON 본문 필요", 400);
  }
  const parsed = createConversationSchema.safeParse(raw);
  if (!parsed.success) {
    return errorResponse(
      "VALIDATION_ERROR",
      parsed.error.issues.map((i) => i.message).join(", "),
      400,
    );
  }

  try {
    if (parsed.data.kind === "DIRECT") {
      const result = await findOrCreateDirect({
        creatorId: user.sub,
        peerId: parsed.data.peerId!,
      });
      if (result.created) {
        await emitMessengerAudit({
          event: "messenger.conversation_created",
          actor: user.email ?? user.sub,
          request: request as unknown as Request,
          details: {
            tenantId: tenant.id,
            conversationId: result.conversation.id,
            kind: "DIRECT",
            peerId: parsed.data.peerId,
          },
        });
      }
      return successResponse(
        { conversation: result.conversation, created: result.created },
        result.created ? 201 : 200,
      );
    }
    // GROUP
    const result = await createGroup({
      creatorId: user.sub,
      memberIds: parsed.data.memberIds!,
      title: parsed.data.title ?? "새 그룹",
    });
    await emitMessengerAudit({
      event: "messenger.conversation_created",
      actor: user.email ?? user.sub,
      request: request as unknown as Request,
      details: {
        tenantId: tenant.id,
        conversationId: result.conversation.id,
        kind: "GROUP",
        memberCount: result.members.length,
      },
    });
    return successResponse(
      { conversation: result.conversation, members: result.members },
      201,
    );
  } catch (err) {
    return messengerErrorResponse(err);
  }
});
