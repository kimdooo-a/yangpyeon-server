/**
 * Next.js 16 instrumentation — 서버 기동 시 1회 실행 (Node.js 런타임 한정).
 *
 * Cron 레지스트리를 PM2 재시작 직후 즉시 부트스트랩.
 * 기존에는 /api/v1/cron 첫 HTTP 요청 시에만 ensureStarted() 호출되어,
 * 배포 직후 HTTP 트래픽 전까지 스케줄 tick이 멈춰있었음.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureStarted } = await import("@/lib/cron/registry");
    ensureStarted();
  }
}
