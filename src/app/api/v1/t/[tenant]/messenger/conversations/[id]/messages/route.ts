/**
 * /api/v1/t/[tenant]/messenger/conversations/[id]/messages
 *
 * GET  — 대화의 메시지 stream (keyset cursor pagination, 30/page).
 * POST — 메시지 송신 (clientGeneratedId 멱등 + rate-limit 60/min).
 *
 * 가드:
 *   - withTenant + 본인이 conversation 활성 멤버
 *   - POST 는 rate-limit 60/min/user.
 *
 * audit: messenger.message_sent (POST 신규).
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/api-guard-tenant";
import { tenantPrismaFor } from "@/lib/db/prisma-tenant-client";
import { successResponse, errorResponse } from "@/lib/api-response";
import { applyRateLimit } from "@/lib/rate-limit-guard";
import { listMessages, sendMessage } from "@/lib/messenger/messages";
import {
  sendMessageSchema,
  listMessagesSchema,
} from "@/lib/schemas/messenger/messages";
import {
  messengerErrorResponse,
  emitMessengerAudit,
} from "@/lib/messenger/route-utils";
import { publishConvEvent, publishUserEvent } from "@/lib/messenger/sse";

/** PRD §4.3 user-channel notif payload 의 snippet — 본문 80자 컷, kind!=TEXT 면 빈 문자열. */
function buildSnippet(body: string | null, kind: "TEXT" | "IMAGE" | "FILE"): string {
  if (kind !== "TEXT" || !body) return "";
  return body.length > 80 ? body.slice(0, 80) : body;
}

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ tenant: string; id: string }>;
}

async function ensureMember(
  tenantId: string,
  conversationId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; status: number; code: string; msg: string }> {
  const db = tenantPrismaFor({ tenantId });
  const m = await db.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { leftAt: true },
  });
  if (!m || m.leftAt !== null) {
    return {
      ok: false,
      status: 403,
      code: "CONVERSATION_NOT_MEMBER",
      msg: "대화 멤버가 아닙니다",
    };
  }
  return { ok: true };
}

export const GET = withTenant(async (request, user, tenant, context) => {
  const { id } = await (context as unknown as RouteContext).params;

  const member = await ensureMember(tenant.id, id, user.sub);
  if (!member.ok) return errorResponse(member.code, member.msg, member.status);

  const { searchParams } = new URL(request.url);
  const parsed = listMessagesSchema.safeParse(
    Object.fromEntries(searchParams),
  );
  if (!parsed.success) {
    return errorResponse(
      "VALIDATION_ERROR",
      parsed.error.issues.map((i) => i.message).join(", "),
      400,
    );
  }
  try {
    const result = await listMessages({
      conversationId: id,
      cursor: parsed.data.cursor,
      limit: parsed.data.limit,
    });
    return successResponse(result);
  } catch (err) {
    return messengerErrorResponse(err);
  }
});

export const POST = withTenant(async (request, user, tenant, context) => {
  const { id } = await (context as unknown as RouteContext).params;

  const limited = await applyRateLimit(request as unknown as NextRequest, {
    scope: "messenger.message_send",
    maxRequests: 60,
    windowMs: 60_000,
    identifier: { dimension: "user", value: user.sub },
  });
  if (limited) return limited;

  const member = await ensureMember(tenant.id, id, user.sub);
  if (!member.ok) return errorResponse(member.code, member.msg, member.status);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return errorResponse("INVALID_BODY", "JSON 본문 필요", 400);
  }
  const parsed = sendMessageSchema.safeParse(raw);
  if (!parsed.success) {
    return errorResponse(
      "VALIDATION_ERROR",
      parsed.error.issues.map((i) => i.message).join(", "),
      400,
    );
  }

  try {
    const result = await sendMessage({
      conversationId: id,
      senderId: user.sub,
      kind: parsed.data.kind,
      body: parsed.data.body ?? null,
      clientGeneratedId: parsed.data.clientGeneratedId,
      replyToId: parsed.data.replyToId,
      attachments: parsed.data.attachments,
      mentions: parsed.data.mentions,
    });
    if (result.created) {
      await emitMessengerAudit({
        event: "messenger.message_sent",
        actor: user.email ?? user.sub,
        request: request as unknown as Request,
        details: {
          tenantId: tenant.id,
          conversationId: id,
          messageId: result.message.id,
          kind: parsed.data.kind,
        },
      });
      publishConvEvent(tenant.id, id, "message.created", {
        message: result.message,
      });

      // M3 user 채널 — DM 수신 알림 (DIRECT 한정, peer 에게).
      const snippet = buildSnippet(parsed.data.body ?? null, parsed.data.kind);
      if (
        result.conversationKind === "DIRECT" &&
        result.otherMemberId &&
        result.otherMemberId !== user.sub
      ) {
        publishUserEvent(tenant.id, result.otherMemberId, "dm.received", {
          messageId: result.message.id,
          conversationId: id,
          sender: user.sub,
          snippet,
        });
      }

      // M3 user 채널 — 멘션 알림 (차단 필터링 후 살아남은 mentions 만).
      for (const m of result.message.mentions) {
        if (m.mentionedUserId === user.sub) continue; // 자기 자신 멘션 방어
        publishUserEvent(
          tenant.id,
          m.mentionedUserId,
          "mention.received",
          {
            messageId: result.message.id,
            conversationId: id,
            sender: user.sub,
            snippet,
          },
        );
      }
    }
    return successResponse(
      { message: result.message, created: result.created },
      result.created ? 201 : 200,
    );
  } catch (err) {
    return messengerErrorResponse(err);
  }
});
