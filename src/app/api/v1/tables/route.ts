import { withRole } from "@/lib/api-guard";
import { successResponse, errorResponse } from "@/lib/api-response";
import { runReadonly } from "@/lib/pg/pool";

interface TableSummary {
  schema: string;
  name: string;
  rowEstimate: number;
  columnCount: number;
}

/**
 * GET /api/v1/tables
 * public 스키마의 모든 테이블 목록 + 대략적 행 수 + 컬럼 수.
 * app_readonly 롤 + BEGIN READ ONLY 이중 방어.
 */
export const GET = withRole(["ADMIN", "MANAGER"], async () => {
  try {
    const { rows } = await runReadonly<{
      schemaname: string;
      tablename: string;
      row_estimate: string;
      column_count: string;
    }>(
      `SELECT
         t.schemaname,
         t.tablename,
         COALESCE(c.reltuples, 0)::bigint::text AS row_estimate,
         (
           SELECT COUNT(*)::text
           FROM information_schema.columns col
           WHERE col.table_schema = t.schemaname
             AND col.table_name   = t.tablename
         ) AS column_count
       FROM pg_tables t
       LEFT JOIN pg_class c
              ON c.relname = t.tablename
             AND c.relnamespace = (
               SELECT oid FROM pg_namespace WHERE nspname = t.schemaname
             )
       WHERE t.schemaname = 'public'
       ORDER BY t.tablename`,
    );

    const tables: TableSummary[] = rows.map((r) => ({
      schema: r.schemaname,
      name: r.tablename,
      rowEstimate: Number(r.row_estimate),
      columnCount: Number(r.column_count),
    }));

    return successResponse({ tables });
  } catch (err) {
    return errorResponse(
      "INTROSPECT_FAILED",
      err instanceof Error ? err.message : "테이블 목록 조회 실패",
      500,
    );
  }
});
