/**
 * 세션 14: Data API 공통 핸들러
 * - Prisma delegate 동적 접근
 * - allowlist 검증 + 역할 적용 + forcedWhere 병합
 */

import { prisma } from "@/lib/prisma";
import type { Role } from "@/generated/prisma/client";
import { getAllowlistEntry } from "./allowlist";
import { parseQuery, mergeForcedWhere, buildSelect } from "./query-parser";
import type { TableAllowlistEntry } from "@/lib/types/supabase-clone";

export interface HandlerContext {
  role: Role;
  userId: string;
}

export interface CheckResult {
  ok: boolean;
  entry?: TableAllowlistEntry;
  error?: { code: string; message: string; status: number };
}

/** 읽기 권한 검증 */
export function checkReadAccess(table: string, role: Role): CheckResult {
  const entry = getAllowlistEntry(table);
  if (!entry) {
    return { ok: false, error: { code: "TABLE_NOT_ALLOWED", message: "허용되지 않은 테이블", status: 404 } };
  }
  if (!entry.readRoles.includes(role)) {
    return { ok: false, error: { code: "FORBIDDEN", message: "읽기 권한이 없습니다", status: 403 } };
  }
  return { ok: true, entry };
}

/** 쓰기 권한 검증 (ADMIN만) */
export function checkWriteAccess(table: string, role: Role): CheckResult {
  const entry = getAllowlistEntry(table);
  if (!entry) {
    return { ok: false, error: { code: "TABLE_NOT_ALLOWED", message: "허용되지 않은 테이블", status: 404 } };
  }
  if (role !== "ADMIN" || !entry.writeRoles.includes(role)) {
    return { ok: false, error: { code: "FORBIDDEN", message: "쓰기 권한이 없습니다", status: 403 } };
  }
  return { ok: true, entry };
}

/** Prisma delegate 동적 획득 (모델명 첫 글자 소문자 변환) */
function getDelegate(modelName: string): unknown {
  const key = modelName.charAt(0).toLowerCase() + modelName.slice(1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const delegate = (prisma as any)[key];
  if (!delegate) throw new Error(`Prisma delegate not found: ${modelName}`);
  return delegate;
}

/** 목록 조회 */
export async function runList(
  table: string,
  searchParams: URLSearchParams,
  ctx: HandlerContext
): Promise<{ rows: unknown[]; total: number; limit: number; offset: number }> {
  const entry = getAllowlistEntry(table)!;
  const parsed = parseQuery(searchParams, entry.exposedColumns);

  const forced = entry.forcedWhere ? entry.forcedWhere(ctx.role, ctx.userId) : {};
  const where = mergeForcedWhere(parsed.where, forced);

  const selectColumns = parsed.select ?? entry.exposedColumns;
  const select = buildSelect(selectColumns);

  const orderBy = parsed.orderBy.map((o) => ({ [o.column]: o.direction }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const delegate = getDelegate(table) as any;
  const [rows, total] = await Promise.all([
    delegate.findMany({
      where,
      select,
      orderBy: orderBy.length > 0 ? orderBy : undefined,
      take: parsed.limit,
      skip: parsed.offset,
    }),
    delegate.count({ where }),
  ]);

  return { rows, total, limit: parsed.limit, offset: parsed.offset };
}

/** 단건 조회 */
export async function runGetOne(
  table: string,
  id: string,
  ctx: HandlerContext
): Promise<unknown | null> {
  const entry = getAllowlistEntry(table)!;
  const forced = entry.forcedWhere ? entry.forcedWhere(ctx.role, ctx.userId) : {};
  const where = { id, ...forced };
  const select = buildSelect(entry.exposedColumns);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const delegate = getDelegate(table) as any;
  const row = await delegate.findFirst({ where, select });
  return row ?? null;
}

/** 생성 */
export async function runCreate(
  table: string,
  data: Record<string, unknown>
): Promise<unknown> {
  const entry = getAllowlistEntry(table)!;
  // exposedColumns에 있는 필드만 허용 (id/createdAt 제외)
  const allowed = new Set(entry.exposedColumns.filter((c) => c !== "id" && c !== "createdAt" && c !== "updatedAt"));
  const filteredData: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (allowed.has(k)) filteredData[k] = v;
  }

  const select = buildSelect(entry.exposedColumns);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const delegate = getDelegate(table) as any;
  return delegate.create({ data: filteredData, select });
}

/** 부분 수정 */
export async function runUpdate(
  table: string,
  id: string,
  data: Record<string, unknown>
): Promise<unknown> {
  const entry = getAllowlistEntry(table)!;
  const allowed = new Set(entry.exposedColumns.filter((c) => c !== "id" && c !== "createdAt" && c !== "updatedAt"));
  const filteredData: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (allowed.has(k)) filteredData[k] = v;
  }

  const select = buildSelect(entry.exposedColumns);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const delegate = getDelegate(table) as any;
  return delegate.update({ where: { id }, data: filteredData, select });
}

/** 삭제 */
export async function runDelete(table: string, id: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const delegate = getDelegate(table) as any;
  await delegate.delete({ where: { id } });
}
