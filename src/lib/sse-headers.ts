/**
 * SSE 응답 공통 헤더
 * SPIKE-02에서 검증된 Cloudflare Tunnel 호환 헤더
 */
export const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  "Connection": "keep-alive",
  "X-Accel-Buffering": "no",
} as const;
