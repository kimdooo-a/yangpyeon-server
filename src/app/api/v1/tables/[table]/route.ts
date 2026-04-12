import { withRole } from "@/lib/api-guard";
import { successResponse, errorResponse } from "@/lib/api-response";
import { runReadonly } from "@/lib/pg/pool";

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

/**
 * GET /api/v1/tables/[table]?limit=50&offset=0&order=id&dir=asc
 * 지정 테이블의 행 페이지네이션 조회 (읽기 전용).
 *
 * 보안:
 *   - 테이블명/컬럼명은 identifier 정규식 검증 + DB 존재 대조 → 동적 quote_ident 치환
 *   - app_readonly 롤 + BEGIN READ ONLY + statement_timeout 이중 방어
 *   - limit 상한 200
 */
export const GET = withRole(
  ["ADMIN", "MANAGER"],
  async (request, _user, context) => {
    const params = context?.params ? await context.params : {};
    const table = params.table;
    if (!table || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
      return errorResponse("INVALID_TABLE", "유효하지 않은 테이블명", 400);
    }

    const url = new URL(request.url);
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT),
    );
    const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
    const order = url.searchParams.get("order");
    const dir = url.searchParams.get("dir")?.toLowerCase() === "desc"
      ? "DESC"
      : "ASC";

    try {
      // 1. 테이블 존재 확인 + 실제 컬럼 목록 조회 (identifier 화이트리스트 역할)
      const { rows: colRows } = await runReadonly<{ column_name: string }>(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position`,
        [table],
      );
      if (colRows.length === 0) {
        return errorResponse("NOT_FOUND", "테이블을 찾을 수 없음", 404);
      }
      const columnNames = colRows.map((r) => r.column_name);

      // order 파라미터 검증 — 실제 존재하는 컬럼만 허용
      const orderClause =
        order && columnNames.includes(order)
          ? `ORDER BY "${order.replace(/"/g, '""')}" ${dir}`
          : "";

      // 2. 전체 행 수 (정확도가 중요한 요청은 COUNT, 아니면 대략치)
      const { rows: countRows } = await runReadonly<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM "${table.replace(/"/g, '""')}"`,
        [],
        { timeoutMs: 5_000 },
      );
      const totalCount = Number(countRows[0]?.count ?? 0);

      // 3. 실제 데이터 조회
      const { rows: dataRows, fields } = await runReadonly(
        `SELECT * FROM "${table.replace(/"/g, '""')}"
         ${orderClause}
         LIMIT $1 OFFSET $2`,
        [limit, offset],
      );

      return successResponse({
        table,
        columns: fields.map((f) => f.name),
        rows: dataRows,
        pagination: { limit, offset, total: totalCount },
      });
    } catch (err) {
      return errorResponse(
        "QUERY_FAILED",
        err instanceof Error ? err.message : "데이터 조회 실패",
        500,
      );
    }
  },
);
