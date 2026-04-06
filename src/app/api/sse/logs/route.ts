/**
 * SSE 엔드포인트: PM2 실시간 로그 테일
 * - 2초 간격으로 로그 전송
 * - 쿼리: ?process=all|<name>&lines=200
 * - 클라이언트 연결 해제 시 자동 정리
 */
import { NextRequest } from "next/server";
import { getPm2Logs } from "@/lib/pm2-metrics";
import { SSE_HEADERS } from "@/lib/sse-headers";
import { pm2LogsQuerySchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

const INTERVAL_MS = 2000;

function sendLogs(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  processName: string,
  lines: number,
) {
  try {
    const logs = getPm2Logs({ processName, lines });
    controller.enqueue(
      encoder.encode(`data: ${JSON.stringify({ logs })}\n\n`),
    );
  } catch {
    controller.enqueue(
      encoder.encode(
        `data: ${JSON.stringify({ error: "로그 조회 실패", logs: [] })}\n\n`,
      ),
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // 쿼리 파라미터 검증
  const parsed = pm2LogsQuerySchema.safeParse({
    process: searchParams.get("process") ?? undefined,
    lines: searchParams.get("lines") ?? undefined,
  });

  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "잘못된 파라미터" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const { process: processName, lines } = parsed.data;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // 즉시 첫 이벤트 전송
      sendLogs(controller, encoder, processName, lines);

      const interval = setInterval(() => {
        sendLogs(controller, encoder, processName, lines);
      }, INTERVAL_MS);

      // 클라이언트 연결 해제 감지
      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        controller.close();
      });
    },
    cancel() {
      // 스트림 취소 시 자동 정리
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
