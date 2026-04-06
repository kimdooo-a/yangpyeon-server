// 감사 로그 DB 레이어 — Node.js 전용 (API Route에서만 import)
// 미들웨어에서 절대 import하지 말 것

import { getDb } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { buffer, type AuditEntry } from "./audit-log";

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
