/**
 * /api/v1/t/[tenant]/messenger/conversations/[id]/events
 *
 * GET — SSE stream — conversation 의 message/typing/receipt/member 이벤트.
 *
 * 채널 키: `t:<tenantId>:conv:<conversationId>` (sse.ts 의 convChannelKey)
 *
 * 가드:
 *   - withTenant + 본인 활성 멤버 (leftAt IS NULL)
 *   - 비멤버는 403 으로 즉시 차단 (구독 단계에서 권한 검증)
 *
 * 이벤트 (api-surface §4.3):
 *   message.created / message.updated / message.deleted
 *   receipt.updated
 *   typing.started / typing.stopped
 *   member.joined / member.left
 *
 * 형식:
 *   `event: <name>\ndata: <json>\n\n` (RealtimeMessage envelope 그대로)
 *   25초 keepalive comment.
 *
 * Phase 1:
 *   - Last-Event-ID catchup 미지원 (재연결 시 직전 이벤트 1건 잠재 손실 — 클라이언트 dedupe 로 보완)
 */
import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/api-guard-tenant";
import { tenantPrismaFor } from "@/lib/db/prisma-tenant-client";
import { errorResponse } from "@/lib/api-response";
import { subscribe } from "@/lib/realtime/bus";
import { convChannelKey } from "@/lib/messenger/sse";
import type { RealtimeMessage } from "@/lib/types/supabase-clone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ tenant: string; id: string }>;
}

export const GET = withTenant(async (request, user, tenant, context) => {
  const { id } = await (context as unknown as RouteContext).params;

  // 멤버십 검증 — 비멤버 구독 차단.
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

  const channel = convChannelKey(tenant.id, id);
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let keepalive: NodeJS.Timeout | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          // 스트림 닫힘 — 정리만 하고 무시
        }
      };

      send(
        `event: ready\ndata: ${JSON.stringify({ channel, conversationId: id })}\n\n`,
      );

      unsubscribe = subscribe(channel, (msg: RealtimeMessage) => {
        send(`event: ${msg.event}\ndata: ${JSON.stringify(msg.payload)}\n\n`);
      });

      keepalive = setInterval(() => send(`: keepalive\n\n`), 25_000);

      const signal = (request as unknown as NextRequest).signal;
      const cleanup = () => {
        if (unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }
        if (keepalive) {
          clearInterval(keepalive);
          keepalive = null;
        }
        try {
          controller.close();
        } catch {
          // 이미 닫힘
        }
      };
      if (signal.aborted) cleanup();
      else signal.addEventListener("abort", cleanup);
    },
    cancel() {
      if (unsubscribe) unsubscribe();
      if (keepalive) clearInterval(keepalive);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
});
