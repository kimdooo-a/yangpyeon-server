// 세션 44: Prisma 7 adapter-pg parsing-side +9h KST 시프트 회피 공용 헬퍼
// (CK orm-date-filter-audit-sweep — 패턴 B/C 일반화).
//
// 사용:
//   const ids = rows.map(r => r.id);
//   const dateMap = await fetchDateFieldsText("cron_jobs", ids, ["created_at", "updated_at", "last_run_at"]);
//   const withDates = rows.map(r => {
//     const d = dateMap.get(r.id);
//     return {
//       ...r,
//       createdAt: toIsoOrNull(d?.created_at),
//       updatedAt: toIsoOrNull(d?.updated_at),
//       lastRunAt: toIsoOrNull(d?.last_run_at),
//     };
//   });
//
// 보안: table/column 이름은 SQL 식별자로 직접 보간되므로 화이트리스트 강제.
// 새 테이블 추가 시 ALLOWED_TABLES 갱신 필요.

import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

const ALLOWED_TABLES = new Set<string>([
  "users",
  "cron_jobs",
  "webhooks",
  "api_keys",
  "log_drains",
  "edge_functions",
  "edge_function_runs",
  "mfa_enrollments",
  "mfa_recovery_codes",
  "webauthn_authenticators",
  "sessions",
]);

const COLUMN_RE = /^[a-z][a-z0-9_]*$/;

export type DateFieldsRecord<F extends string> = Record<F, string | null>;

export async function fetchDateFieldsText<F extends string>(
  table: string,
  ids: readonly string[],
  fields: readonly F[],
): Promise<Map<string, DateFieldsRecord<F>>> {
  const map = new Map<string, DateFieldsRecord<F>>();
  if (ids.length === 0 || fields.length === 0) return map;

  if (!ALLOWED_TABLES.has(table)) {
    throw new Error(`fetchDateFieldsText: 테이블 화이트리스트 위반 — ${table}`);
  }
  for (const f of fields) {
    if (!COLUMN_RE.test(f)) {
      throw new Error(`fetchDateFieldsText: 컬럼명 형식 위반 — ${f}`);
    }
  }

  const selectClause = fields.map((f) => `(${f}::text) AS ${f}_text`).join(", ");
  const idArray = [...ids];

  // eslint-disable-next-line tenant/no-raw-prisma-without-tenant -- 날짜 필드 헬퍼: 테이블/컬럼명 화이트리스트 검증 후 raw SQL 실행 (PG timestamptz text 변환). 호출자가 id 목록을 명시적으로 전달하므로 cross-tenant 위험 없음
  const rows = await prisma.$queryRaw<Array<Record<string, string | null>>>(
    Prisma.sql`SELECT id, ${Prisma.raw(selectClause)} FROM ${Prisma.raw(table)} WHERE id = ANY(${idArray}::text[])`,
  );

  for (const row of rows) {
    const rec = {} as DateFieldsRecord<F>;
    for (const f of fields) {
      rec[f] = (row[`${f}_text`] as string | null) ?? null;
    }
    map.set(row.id as unknown as string, rec);
  }
  return map;
}

export function toIsoOrNull(text: string | null | undefined): string | null {
  if (!text) return null;
  return new Date(text).toISOString();
}
