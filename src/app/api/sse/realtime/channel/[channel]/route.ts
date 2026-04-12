import { NextRequest } from "next/server";
import { withRole } from "@/lib/api-guard";
import { errorResponse } from "@/lib/api-response";
import { subscribe } from "@/lib/realtime/bus";
import type { RealtimeMessage } from "@/lib/types/supabase-clone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRole(["ADMIN", "MANAGER"], async (request: NextRequest, _user, context) => {
  const { channel } = await (context as { params: Promise<{ channel: string }> }).params;
  if (!channel || channel.length > 120) {
    return errorResponse("INVALID_CHANNEL", "유효하지 않은 채널명", 400);
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let keepalive: NodeJS.Timeout | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          // 스트림이 닫힘 — 정리
        }
      };

      // 초기 안내 이벤트
      send(`event: ready\ndata: ${JSON.stringify({ channel })}\n\n`);

      unsubscribe = subscribe(channel, (msg: RealtimeMessage) => {
        send(`event: message\ndata: ${JSON.stringify(msg)}\n\n`);
      });

      // 15초 keepalive
      keepalive = setInterval(() => send(`: keepalive\n\n`), 15_000);

      // 클라이언트 abort 처리
      const signal = request.signal;
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
