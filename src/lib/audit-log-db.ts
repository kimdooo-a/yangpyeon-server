// 감사 로그 DB 레이어 — Node.js 전용 (API Route에서만 import)
// 미들웨어에서 절대 import하지 말 것

import { getDb } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";
import { desc, sql, and, like, gte, lte } from "drizzle-orm";
import { buffer, type AuditEntry } from "./audit-log";

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
  }));

  db.insert(auditLogs).values(rows).run();
  return entries.length;
}

/**
 * 감사 로그 직접 DB 기록 (API Route에서 사용)
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
  }).run();
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
  }));

  return {
    logs,
    pagination: { page, limit, total, totalPages },
  };
}
