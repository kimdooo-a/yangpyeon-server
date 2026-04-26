// 감사 로그 DB 레이어 — Node.js 전용 (API Route에서만 import)
// 미들웨어에서 절대 import하지 말 것

import { getDb } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";
import { desc, sql, and, like, gte, lte } from "drizzle-orm";
import { buffer, type AuditEntry } from "./audit-log";
import { recordAuditOutcome } from "./audit-metrics";
import { getRequestContext } from "./request-context";

/** 페이지네이션 조회 옵션 */
export interface AuditPaginatedOptions {
  page: number;
  limit: number;
  action?: string;
  ip?: string;
  from?: string;
  to?: string;
}

/** 페이지네이션 응답 */
export interface AuditPaginatedResult {
  logs: AuditEntry[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * 인메모리 버퍼를 SQLite로 flush
 */
export function flushBufferToDb(): number {
  if (buffer.length === 0) return 0;

  const db = getDb();
  const entries = buffer.splice(0, buffer.length);

  const rows = entries.map((e) => ({
    timestamp: new Date(e.timestamp),
    action: e.action ?? `${e.method} ${e.path}`,
    ip: e.ip,
    path: e.path,
    method: e.method,
    statusCode: e.status ?? null,
    userAgent: e.userAgent ?? null,
    detail: e.detail ?? null,
    // Phase 1.7 (T1.7) — 버퍼 entry 에 tenantId/traceId 가 있으면 보존, 없으면 default/null.
    tenantId: e.tenantId ?? "default",
    traceId: e.traceId ?? null,
  }));

  db.insert(auditLogs).values(rows).run();
  return entries.length;
}

/**
 * 감사 로그 직접 DB 기록 — 저수준 (throw 가능).
 *
 * 도메인 라우트에서는 `safeAudit` 을 사용하라. audit 쓰기 실패가 도메인 응답을
 * 깨뜨리면 안 된다는 invariant 는 ADR-021 에 정식화되어 있다.
 *
 * Phase 1.7: tenantId/traceId 컬럼 매핑 추가 (entry 에 명시되지 않으면 default/null).
 * @internal
 */
export function writeAuditLogDb(entry: AuditEntry): void {
  const db = getDb();
  db.insert(auditLogs).values({
    timestamp: new Date(entry.timestamp || new Date().toISOString()),
    action: entry.action ?? `${entry.method} ${entry.path}`,
    ip: entry.ip,
    path: entry.path,
    method: entry.method,
    statusCode: entry.status ?? null,
    userAgent: entry.userAgent ?? null,
    detail: entry.detail ?? null,
    // Phase 1.7 (T1.7) ADR-029 §2.2.3 — per-tenant 차원 + T3 trace correlation.
    tenantId: entry.tenantId ?? "default",
    traceId: entry.traceId ?? null,
  }).run();
}

/**
 * 감사 로그 안전 기록 — fail-soft.
 *
 * cross-cutting observability 가 도메인 임계 경로(로그인/세션/CRUD)를 절대
 * 깨뜨리지 않게 보장한다. 실패 시 console.warn 으로 err 객체를 노출하되
 * 호출자에게는 throw 하지 않는다 (세션 54 진단 패턴 + ADR-021 일반화).
 *
 * 모든 도메인 라우트는 이 함수만 사용해야 한다.
 *
 * Phase 1.7 (T1.7) ADR-029 §2.2.3 — request-context AsyncLocalStorage 자동 주입:
 *   - 호출자가 entry.tenantId / entry.traceId 를 명시하면 그대로 사용.
 *   - 미지정 시 getRequestContext() 에서 자동 추출 (인증/router 경유 시).
 *   - 미인증/시스템 cron 호출 시 'default' sentinel + traceId undefined 로 fail-soft.
 *   - 11 도메인 콜사이트 시그니처 무수정 (ADR-021 §amendment-2 invariant).
 */
export function safeAudit(entry: AuditEntry, context?: string): void {
  const ctx = context ?? entry.action ?? `${entry.method} ${entry.path}`;
  const reqCtx = getRequestContext();
  const enriched: AuditEntry = {
    ...entry,
    tenantId: entry.tenantId ?? reqCtx?.tenantId ?? "default",
    traceId: entry.traceId ?? reqCtx?.traceId,
  };
  try {
    writeAuditLogDb(enriched);
    recordAuditOutcome(true, ctx, undefined, enriched.tenantId);
  } catch (err) {
    recordAuditOutcome(false, ctx, err, enriched.tenantId);
    console.warn("[audit] write failed", {
      context: ctx,
      tenantId: enriched.tenantId,
      traceId: enriched.traceId,
      error:
        err instanceof Error
          ? { message: err.message, stack: err.stack }
          : err,
    });
  }
}

/**
 * 감사 로그 조회 — 버퍼 flush 후 SQLite에서 읽기
 */
export function getAuditLogs(limit = 100): AuditEntry[] {
  // 먼저 인메모리 버퍼를 DB로 flush
  flushBufferToDb();

  const db = getDb();
  const rows = db
    .select()
    .from(auditLogs)
    .orderBy(desc(auditLogs.id))
    .limit(limit)
    .all();

  return rows.map((r) => ({
    timestamp: r.timestamp ? r.timestamp.toISOString() : new Date().toISOString(),
    method: r.method ?? "",
    path: r.path ?? "",
    ip: r.ip,
    status: r.statusCode ?? undefined,
    action: r.action,
    userAgent: r.userAgent ?? undefined,
    detail: r.detail ?? undefined,
    tenantId: r.tenantId ?? undefined,
    traceId: r.traceId ?? undefined,
  }));
}

/**
 * 감사 로그 페이지네이션 + 필터 조회
 */
export function getAuditLogsPaginated(options: AuditPaginatedOptions): AuditPaginatedResult {
  // 먼저 인메모리 버퍼를 DB로 flush
  flushBufferToDb();

  const db = getDb();
  const { page, limit, action, ip, from, to } = options;

  // 필터 조건 구성
  const conditions = [];
  if (action) conditions.push(like(auditLogs.action, `%${action}%`));
  if (ip) conditions.push(like(auditLogs.ip, `%${ip}%`));
  if (from) conditions.push(gte(auditLogs.timestamp, new Date(from)));
  if (to) {
    // to 날짜의 끝(23:59:59)까지 포함
    const toEnd = new Date(to);
    toEnd.setHours(23, 59, 59, 999);
    conditions.push(lte(auditLogs.timestamp, toEnd));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // 총 개수 조회
  const countResult = db
    .select({ count: sql<number>`count(*)` })
    .from(auditLogs)
    .where(where)
    .all();
  const total = Number(countResult[0]?.count ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  // 데이터 조회
  const rows = db
    .select()
    .from(auditLogs)
    .where(where)
    .orderBy(desc(auditLogs.id))
    .limit(limit)
    .offset((page - 1) * limit)
    .all();

  const logs: AuditEntry[] = rows.map((r) => ({
    timestamp: r.timestamp ? r.timestamp.toISOString() : new Date().toISOString(),
    method: r.method ?? "",
    path: r.path ?? "",
    ip: r.ip,
    status: r.statusCode ?? undefined,
    action: r.action,
    userAgent: r.userAgent ?? undefined,
    detail: r.detail ?? undefined,
    tenantId: r.tenantId ?? undefined,
    traceId: r.traceId ?? undefined,
  }));

  return {
    logs,
    pagination: { page, limit, total, totalPages },
  };
}
