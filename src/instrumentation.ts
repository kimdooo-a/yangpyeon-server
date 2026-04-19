/**
 * Next.js 16 instrumentation — 서버 기동 시 1회 실행 (Node.js 런타임 한정).
 *
 * 수행 작업:
 * 1. data/ 디렉터리 선제 생성 — SQLite 최초 open 이전 경로에서 "Cannot open database" 노이즈 제거
 * 2. Cron 레지스트리 부트스트랩 — DB CronJob (UI CRUD 대상) 매분 tick
 *    (기존: /api/v1/cron 첫 HTTP 요청 시에만 ensureStarted 호출됨 → HTTP 트래픽 전까지 멈춤)
 * 3. Cleanup 스케줄러 부트스트랩 — 시스템 내부 만료 정리 4종 매일 KST 03:00
 *    (sessions / rate-limit / jwks retired / webauthn challenges)
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { mkdirSync } = await import("node:fs");
  const { join } = await import("node:path");
  mkdirSync(join(process.cwd(), "data"), { recursive: true });

  const { ensureStarted } = await import("@/lib/cron/registry");
  ensureStarted();

  const { ensureCleanupScheduler } = await import("@/lib/cleanup-scheduler");
  ensureCleanupScheduler();
}
