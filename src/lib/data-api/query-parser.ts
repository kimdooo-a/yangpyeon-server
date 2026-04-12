/**
 * 세션 14: Data API URL 쿼리 → Prisma where 변환
 * 쿼리 문법:
 *   ?col=eq.value&col2=gt.3&col3=in.(a,b,c)
 *   ?orderBy=col.asc,col2.desc
 *   ?limit=50&offset=0
 *
 * 허용 operator 9종: eq/neq/gt/gte/lt/lte/like/ilike/in
 */

import type { DataApiOperator, DataApiFilter } from "@/lib/types/supabase-clone";

const OPERATORS: DataApiOperator[] = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "like",
  "ilike",
  "in",
];

export interface ParsedQuery {
  where: Record<string, unknown>;
  orderBy: { column: string; direction: "asc" | "desc" }[];
  limit: number;
  offset: number;
  select?: string[];
}

const RESERVED_KEYS = new Set(["orderBy", "limit", "offset", "select"]);

/**
 * URLSearchParams → Prisma 쿼리 옵션
 * @param params 요청 쿼리
 * @param exposedColumns 허용 컬럼 (화이트리스트)
 */
export function parseQuery(
  params: URLSearchParams,
  exposedColumns: string[]
): ParsedQuery {
  const allowed = new Set(exposedColumns);
  const filters: DataApiFilter[] = [];

  for (const [key, value] of params.entries()) {
    if (RESERVED_KEYS.has(key)) continue;
    if (!allowed.has(key)) continue; // 허용되지 않은 컬럼은 조용히 무시

    // value: "eq.value" 또는 "in.(a,b,c)" 형태
    const dotIdx = value.indexOf(".");
    if (dotIdx === -1) continue;
    const op = value.slice(0, dotIdx) as DataApiOperator;
    const rest = value.slice(dotIdx + 1);
    if (!OPERATORS.includes(op)) continue;

    let parsedValue: string | number | (string | number)[];
    if (op === "in") {
      // in.(a,b,c) 형태
      const match = /^\((.*)\)$/.exec(rest);
      const raw = match ? match[1] : rest;
      parsedValue = raw.split(",").map((v) => coerceValue(v.trim()));
    } else {
      parsedValue = coerceValue(rest);
    }

    filters.push({ column: key, op, value: parsedValue });
  }

  const where = buildPrismaWhere(filters);

  // orderBy
  const orderByRaw = params.get("orderBy");
  const orderBy: { column: string; direction: "asc" | "desc" }[] = [];
  if (orderByRaw) {
    for (const part of orderByRaw.split(",")) {
      const [col, dirRaw] = part.split(".");
      if (!col || !allowed.has(col)) continue;
      const direction: "asc" | "desc" = dirRaw === "desc" ? "desc" : "asc";
      orderBy.push({ column: col, direction });
    }
  }

  // limit / offset
  const limit = clampInt(params.get("limit"), 50, 1, 500);
  const offset = clampInt(params.get("offset"), 0, 0, 100_000);

  // select
  const selectRaw = params.get("select");
  let select: string[] | undefined;
  if (selectRaw) {
    select = selectRaw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => allowed.has(s));
    if (select.length === 0) select = undefined;
  }

  return { where, orderBy, limit, offset, select };
}

function coerceValue(v: string): string | number {
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

function clampInt(raw: string | null, defaultValue: number, min: number, max: number): number {
  if (!raw) return defaultValue;
  const n = Number(raw);
  if (!Number.isFinite(n)) return defaultValue;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

/** DataApiFilter[] → Prisma where 객체 */
function buildPrismaWhere(filters: DataApiFilter[]): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  for (const f of filters) {
    switch (f.op) {
      case "eq":
        where[f.column] = f.value;
        break;
      case "neq":
        where[f.column] = { not: f.value };
        break;
      case "gt":
        where[f.column] = { gt: f.value };
        break;
      case "gte":
        where[f.column] = { gte: f.value };
        break;
      case "lt":
        where[f.column] = { lt: f.value };
        break;
      case "lte":
        where[f.column] = { lte: f.value };
        break;
      case "like":
        where[f.column] = { contains: String(f.value) };
        break;
      case "ilike":
        where[f.column] = { contains: String(f.value), mode: "insensitive" };
        break;
      case "in":
        where[f.column] = { in: Array.isArray(f.value) ? f.value : [f.value] };
        break;
    }
  }
  return where;
}

/** forcedWhere를 기존 where에 병합 (forcedWhere가 우선) */
export function mergeForcedWhere(
  where: Record<string, unknown>,
  forced: Record<string, unknown>
): Record<string, unknown> {
  return { ...where, ...forced };
}

/** exposedColumns로 Prisma select 객체 생성 */
export function buildSelect(columns: string[]): Record<string, true> {
  return Object.fromEntries(columns.map((c) => [c, true as const]));
}
