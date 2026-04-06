export const dynamic = 'force-dynamic';

export async function GET() {
  const encoder = new TextEncoder();
  let counter = 0;

  const stream = new ReadableStream({
    start(controller) {
      const interval = setInterval(() => {
        counter++;
        const data = JSON.stringify({
          time: new Date().toISOString(),
          counter,
          cpu: Math.random() * 100,
        });
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));

        // 테스트용: 30개 이벤트 후 종료
        if (counter >= 30) {
          clearInterval(interval);
          controller.close();
        }
      }, 2000); // 2초 간격

      // 클라이언트 연결 해제 시 정리 — request.signal 없이 stream abort로 처리
    },
    cancel() {
      // 클라이언트 연결 해제 시 자동 호출
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
