/**
 * Next.js 16 instrumentation — 서버 기동 시 1회 실행 (Node.js 런타임 한정).
 *
 * 수행 작업:
 * 1. data/ 디렉터리 선제 생성 — SQLite 최초 open 이전 경로에서 "Cannot open database" 노이즈 제거
 * 2. SQLite 마이그레이션 self-heal — 누락된 drizzle 마이그레이션을 자동 적용 (ADR-021).
 *    빌드 파이프라인이 보장 1차 게이트, 이건 운영 자가치유용 2차 안전망.
 * 3. Cron 레지스트리 부트스트랩 — DB CronJob (UI CRUD 대상) 매분 tick
 *    (기존: /api/v1/cron 첫 HTTP 요청 시에만 ensureStarted 호출됨 → HTTP 트래픽 전까지 멈춤)
 * 4. Cleanup 스케줄러 부트스트랩 — 시스템 내부 만료 정리 4종 매일 KST 03:00
 *    (sessions / rate-limit / jwks retired / webauthn challenges)
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { mkdirSync } = await import("node:fs");
  const { join } = await import("node:path");
  mkdirSync(join(process.cwd(), "data"), { recursive: true });

  // 마이그레이션 self-heal — 빌드/배포 게이트 누락 또는 신규 .sql 미적용 케이스 방어.
  // 실패해도 부팅을 막지 않는다 (cross-cutting fail-soft 원칙, ADR-021).
  try {
    const { applyPendingMigrations, verifySchema } = await import("@/lib/db/migrate");
    const result = applyPendingMigrations();
    if (result.applied.length > 0) {
      console.log(
        `[instrumentation] migrations applied at startup: ${result.applied.join(", ")}`,
      );
    }
    const check = verifySchema();
    if (!check.ok) {
      console.warn(
        `[instrumentation] schema check WARN — missing tables: ${check.missing.join(", ")} (db=${check.dbPath})`,
      );
    }
  } catch (err) {
    console.warn(
      "[instrumentation] migrate/verify failed",
      err instanceof Error ? { message: err.message, stack: err.stack } : err,
    );
  }

  const { ensureStarted } = await import("@/lib/cron/registry");
  ensureStarted();

  const { ensureCleanupScheduler } = await import("@/lib/cleanup-scheduler");
  ensureCleanupScheduler();
}
