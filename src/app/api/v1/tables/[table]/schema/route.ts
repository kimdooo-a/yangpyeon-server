import { withRole } from "@/lib/api-guard";
import { successResponse, errorResponse } from "@/lib/api-response";
import { runReadonly } from "@/lib/pg/pool";

interface ColumnMeta {
  name: string;
  dataType: string;
  nullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
  ordinalPosition: number;
}

/**
 * GET /api/v1/tables/[table]/schema
 * 지정 테이블의 컬럼 메타 + PK 여부.
 * 테이블명 검증: public 스키마의 실제 테이블만 허용 (SQL 인젝션 차단).
 */
export const GET = withRole(
  ["ADMIN", "MANAGER"],
  async (_request, _user, context) => {
    const params = context?.params ? await context.params : {};
    const table = params.table;
    if (!table || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
      return errorResponse(
        "INVALID_TABLE",
        "유효하지 않은 테이블명",
        400,
      );
    }

    try {
      const exists = await runReadonly<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM pg_tables
           WHERE schemaname = 'public' AND tablename = $1
         ) AS exists`,
        [table],
      );
      if (!exists.rows[0]?.exists) {
        return errorResponse("NOT_FOUND", "테이블을 찾을 수 없음", 404);
      }

      const { rows: columns } = await runReadonly<{
        column_name: string;
        data_type: string;
        is_nullable: "YES" | "NO";
        column_default: string | null;
        ordinal_position: number;
      }>(
        `SELECT column_name, data_type, is_nullable, column_default, ordinal_position
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position`,
        [table],
      );

      // pg_catalog 기반 — information_schema.table_constraints는
      // app_readonly 롤에서 권한 필터로 0행 반환하는 문제 회피 (세션 21 수정)
      const { rows: pkRows } = await runReadonly<{ column_name: string }>(
        `SELECT a.attname AS column_name
         FROM pg_index i
         JOIN pg_attribute a
           ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
         WHERE i.indrelid = ('public.' || quote_ident($1))::regclass
           AND i.indisprimary`,
        [table],
      );
      const pkSet = new Set(pkRows.map((r) => r.column_name));

      const result: ColumnMeta[] = columns.map((c) => ({
        name: c.column_name,
        dataType: c.data_type,
        nullable: c.is_nullable === "YES",
        defaultValue: c.column_default,
        isPrimaryKey: pkSet.has(c.column_name),
        ordinalPosition: c.ordinal_position,
      }));

      const pkColumn = result.find((c) => c.isPrimaryKey);
      const primaryKey =
        pkColumn && pkRows.length === 1
          ? { column: pkColumn.name, dataType: pkColumn.dataType }
          : null;
      const compositePk = pkRows.length > 1;

      return successResponse({
        table,
        columns: result,
        primaryKey,
        compositePk,
      });
    } catch (err) {
      return errorResponse(
        "SCHEMA_FAILED",
        err instanceof Error ? err.message : "스키마 조회 실패",
        500,
      );
    }
  },
);
