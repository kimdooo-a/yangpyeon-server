/**
 * SSE 엔드포인트: PM2 프로세스 상태 스트림
 * - 5초 간격으로 PM2 프로세스 목록 전송
 * - 클라이언트 연결 해제 시 자동 정리
 */
import { NextRequest } from "next/server";
import { getPm2List } from "@/lib/pm2-metrics";
import { SSE_HEADERS } from "@/lib/sse-headers";

export const dynamic = "force-dynamic";

const INTERVAL_MS = 5000;

function sendProcesses(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
) {
  try {
    const processes = getPm2List();
    controller.enqueue(
      encoder.encode(`data: ${JSON.stringify({ processes })}\n\n`),
    );
  } catch {
    controller.enqueue(
      encoder.encode(
        `data: ${JSON.stringify({ error: "PM2 조회 실패", processes: [] })}\n\n`,
      ),
    );
  }
}

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // 즉시 첫 이벤트 전송
      sendProcesses(controller, encoder);

      const interval = setInterval(() => {
        sendProcesses(controller, encoder);
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
