import { writeAuditLogDb } from "@/lib/audit-log-db";
import {
  cleanupExpiredSessions,
  buildSessionExpireAuditDetail,
} from "@/lib/sessions/cleanup";
import { cleanupExpiredRateLimitBuckets } from "@/lib/rate-limit-db";
import { cleanupRetiredKeys } from "@/lib/jwks/store";
import { cleanupExpiredChallenges } from "@/lib/mfa/webauthn";

/**
 * 만료 정리 스케줄러 (세션 35 / Phase 15 Step 6 후속).
 *
 * 대상 4종:
 *   - sessions            : expires_at < NOW() - INTERVAL '1 day' (세션 32)
 *   - rate-limit-buckets  : window_start < NOW() - INTERVAL '1 day' (세션 34)
 *   - jwks RETIRED keys   : retireAt < NOW() (grace 24h+4m 경과분, 세션 33)
 *   - webauthn challenges : expiresAt < NOW() (5분 만료, 세션 33)
 *
 * 실행 창: 매일 KST 03:00 (UTC 18:00). 1분 tick + lastRunKey 로 dedupe.
 * 각 cleanup 은 독립 try/catch — 한 개 실패가 뒤 작업을 블로킹하지 않음.
 *
 * cron registry(src/lib/cron/registry.ts)와 분리한 이유:
 *   - Cron registry 는 DB CronJob 레코드 기반 (UI CRUD), SQL/FUNCTION/WEBHOOK kind 한정
 *   - Cleanup 은 시스템 내부 유지보수 — 코드 하드코딩 + 함수 직접 호출이 더 단순·안전
 */

interface SchedulerState {
  started: boolean;
  tickHandle: NodeJS.Timeout | null;
  lastRunKey: string | null;
}

declare global {
  // eslint-disable-next-line no-var
  var __cleanupScheduler: SchedulerState | undefined;
}

function state(): SchedulerState {
  if (!globalThis.__cleanupScheduler) {
    globalThis.__cleanupScheduler = { started: false, tickHandle: null, lastRunKey: null };
  }
  return globalThis.__cleanupScheduler;
}

export interface CleanupTask {
  name: string;
  run: () => Promise<number>;
}

export type CleanupSummary = Record<string, number | string>;

export const CLEANUP_HOUR_KST = 3;

/**
 * KST(UTC+9) 기준 윈도우 매치 + dedupe 키.
 * 테스트를 위해 순수 함수로 분리. 시스템 timezone 의존 없이 UTC 연산만 사용.
 *
 * @returns match=true 인 경우 key 를 state.lastRunKey 와 비교해 같은 시간대 중복 실행 방지.
 */
export function computeCleanupWindow(
  now: Date,
  kstHour: number = CLEANUP_HOUR_KST,
): { match: boolean; key: string } {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  const h = kst.getUTCHours();
  const key = `${y}-${m}-${d}-${String(kstHour).padStart(2, "0")}`;
  return { match: h === kstHour, key };
}

/**
 * sessions cleanup 실행 + 각 expired row 별 SESSION_EXPIRE 감사 기록 (세션 39).
 * audit 기록 실패가 삭제 집계에 영향 주지 않도록 try/catch 로 격리.
 */
async function runSessionsCleanupWithAudit(): Promise<number> {
  const result = await cleanupExpiredSessions();
  for (const entry of result.expiredEntries) {
    try {
      writeAuditLogDb({
        timestamp: new Date().toISOString(),
        method: "SYSTEM",
        path: "/internal/cleanup-scheduler/session-expire",
        ip: "127.0.0.1",
        action: "SESSION_EXPIRE",
        detail: buildSessionExpireAuditDetail(entry),
      });
    } catch {
      // eslint-disable-next-line no-console
      console.warn("[cleanup-scheduler] SESSION_EXPIRE audit write failed", entry.id);
    }
  }
  return result.deleted;
}

/**
 * 기본 cleanup task 세트 — 4종. 각 함수의 반환값을 "삭제 행 수"로 정규화.
 * sessions task 는 세션 39 부터 per-row SESSION_EXPIRE 감사 로그를 함께 기록.
 */
export function defaultCleanupTasks(): CleanupTask[] {
  return [
    { name: "sessions", run: runSessionsCleanupWithAudit },
    { name: "rate-limit", run: () => cleanupExpiredRateLimitBuckets() },
    { name: "jwks", run: async () => (await cleanupRetiredKeys()).removed },
    { name: "webauthn-challenges", run: async () => (await cleanupExpiredChallenges()).removed },
  ];
}

/**
 * 주어진 task 목록을 순차 실행. 각 task 는 독립 try/catch.
 * 테스트용으로 tasks 를 주입 가능.
 */
export async function runCleanupTasks(
  tasks: CleanupTask[] = defaultCleanupTasks(),
): Promise<CleanupSummary> {
  const summary: CleanupSummary = {};
  for (const t of tasks) {
    try {
      summary[t.name] = await t.run();
    } catch (err) {
      summary[t.name] = err instanceof Error ? `ERROR: ${err.message}` : "ERROR";
    }
  }
  return summary;
}

/**
 * 수동 트리거 시 audit log에 actor 정보를 붙이기 위한 메타. 자동 스케줄러는 undefined.
 */
export interface CleanupActor {
  userId: string;
  email: string;
  ip: string;
}

function writeCleanupAudit(
  action: "CLEANUP_EXECUTED" | "CLEANUP_EXECUTED_MANUAL",
  summary: CleanupSummary,
  actor?: CleanupActor,
): void {
  try {
    writeAuditLogDb({
      timestamp: new Date().toISOString(),
      method: actor ? "POST" : "SYSTEM",
      path: actor ? "/api/admin/cleanup/run" : "/internal/cleanup-scheduler",
      ip: actor?.ip ?? "127.0.0.1",
      action,
      detail: JSON.stringify(actor ? { actor, summary } : summary),
    });
  } catch {
    // audit 기록 실패가 cleanup 루프를 끊지 않도록 — 콘솔 경고만
    // eslint-disable-next-line no-console
    console.warn("[cleanup-scheduler] audit log write failed", summary);
  }
}

async function tick(): Promise<void> {
  const s = state();
  const { match, key } = computeCleanupWindow(new Date());
  if (!match) return;
  if (s.lastRunKey === key) return;
  s.lastRunKey = key;
  const summary = await runCleanupTasks();
  writeCleanupAudit("CLEANUP_EXECUTED", summary);
}

/** 멱등 초기화. instrumentation.ts 에서 호출 */
export function ensureCleanupScheduler(): void {
  const s = state();
  if (s.started) return;
  s.started = true;
  s.tickHandle = setInterval(() => {
    void tick();
  }, 60_000);
  // 기동 직후 1회 tick — 03:00 KST 에 기동한 경우 수 초 내 실행 보장
  setTimeout(() => void tick(), 5_000);
}

/**
 * 관리자 수동 실행 — `/api/admin/cleanup/run` 라우트에서 래핑.
 * actor 를 전달하면 audit log detail 에 actor 정보가 함께 기록됨.
 */
export async function runCleanupsNow(
  actor?: CleanupActor,
): Promise<CleanupSummary> {
  const summary = await runCleanupTasks();
  writeCleanupAudit("CLEANUP_EXECUTED_MANUAL", summary, actor);
  return summary;
}
