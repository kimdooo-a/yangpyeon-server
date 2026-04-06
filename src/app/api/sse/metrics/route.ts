/**
 * SSE 엔드포인트: 시스템 메트릭 스트림
 * - 5초 간격으로 CPU/메모리/디스크 정보 전송
 * - 클라이언트 연결 해제 시 자동 정리
 */
import { NextRequest } from "next/server";
import { collectSystemMetrics } from "@/lib/system-metrics";
import { SSE_HEADERS } from "@/lib/sse-headers";

export const dynamic = "force-dynamic";

const INTERVAL_MS = 5000;

function sendMetrics(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
) {
  try {
    const data = collectSystemMetrics();
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
  } catch {
    // 메트릭 수집 실패 시 에러 이벤트 전송
    controller.enqueue(
      encoder.encode(
        `data: ${JSON.stringify({ error: "메트릭 수집 실패" })}\n\n`,
      ),
    );
  }
}

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // 즉시 첫 이벤트 전송
      sendMetrics(controller, encoder);

      const interval = setInterval(() => {
        sendMetrics(controller, encoder);
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
