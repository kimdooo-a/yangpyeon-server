import { withRole } from "@/lib/api-guard";
import { successResponse, errorResponse } from "@/lib/api-response";
import { runReadonly, runReadwrite } from "@/lib/pg/pool";
import { isValidIdentifier, quoteIdent } from "@/lib/db/identifier";
import { coerceValue, CoercionError } from "@/lib/db/coerce";
import {
  checkTablePolicy,
  redactSensitiveValues,
} from "@/lib/db/table-policy";
import { writeAuditLogDb } from "@/lib/audit-log-db";

interface ColumnAction {
  action: "set" | "null";
  value?: unknown;
}

interface IntrospectResult {
  colTypeMap: Map<string, string>;
  pkColumns: { column_name: string; data_type: string }[];
  noPk: boolean;
}

async function introspectComposite(
  table: string,
): Promise<IntrospectResult | null> {
  const { rows: cols } = await runReadonly<{
    column_name: string;
    data_type: string;
  }>(
    `SELECT column_name, data_type
     FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1`,
    [table],
  );
  if (cols.length === 0) return null;

  // pg_index.indkey 순서 보존
  const { rows: pkRows } = await runReadonly<{
    column_name: string;
    data_type: string;
    pos: number;
  }>(
    `SELECT a.attname AS column_name,
            format_type(a.atttypid, a.atttypmod) AS data_type,
            array_position(i.indkey::int[], a.attnum) AS pos
     FROM pg_index i
     JOIN pg_attribute a
       ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
     WHERE i.indrelid = ('public.' || quote_ident($1))::regclass
       AND i.indisprimary
     ORDER BY pos`,
    [table],
  );

  return {
    colTypeMap: new Map(cols.map((c) => [c.column_name, c.data_type])),
    pkColumns: pkRows.map((r) => ({
      column_name: r.column_name,
      data_type: r.data_type,
    })),
    noPk: pkRows.length === 0,
  };
}

function serializePk(pkValues: Record<string, unknown>): string {
  // 감사 로그용 안정 직렬화 — 키 정렬
  const sorted = Object.keys(pkValues)
    .sort()
    .reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = pkValues[k];
      return acc;
    }, {});
  return JSON.stringify(sorted);
}

/** PATCH /api/v1/tables/[table]/composite — 복합 PK 행 업데이트 */
export const PATCH = withRole(
  ["ADMIN", "MANAGER"],
  async (request, user, context) => {
    const params = (context?.params ? await context.params : {}) as {
      table?: string;
    };
    const table = params.table;
    if (!table || !isValidIdentifier(table)) {
      return errorResponse("INVALID_TABLE", "유효하지 않은 테이블명", 400);
    }

    const policy = checkTablePolicy(table, "UPDATE", user.role);
    if (!policy.allowed) {
      return errorResponse("OPERATION_DENIED", policy.reason!, 403);
    }

    const meta = await introspectComposite(table);
    if (!meta) return errorResponse("NOT_FOUND", "테이블 없음", 404);
    if (meta.noPk) {
      return errorResponse(
        "NO_PK_UNSUPPORTED",
        "PK 없는 테이블은 편집 불가",
        400,
      );
    }
    if (meta.pkColumns.length < 2) {
      return errorResponse(
        "NOT_COMPOSITE",
        "단일 PK 테이블은 /[pk] 경로를 사용하세요",
        400,
      );
    }

    let body: {
      values?: Record<string, ColumnAction>;
      pk_values?: Record<string, unknown>;
      expected_updated_at?: string;
    };
    try {
      body = await request.json();
    } catch {
      return errorResponse("INVALID_BODY", "JSON 파싱 실패", 400);
    }

    const pkValues = body.pk_values ?? {};
    const expectedPkCols = meta.pkColumns.map((c) => c.column_name);
    const providedPkCols = Object.keys(pkValues);
    const missing = expectedPkCols.filter((c) => !(c in pkValues));
    if (missing.length > 0) {
      return errorResponse(
        "PK_VALUES_INCOMPLETE",
        `누락된 PK 컬럼: ${missing.join(", ")}`,
        400,
      );
    }
    const extras = providedPkCols.filter((c) => !expectedPkCols.includes(c));
    if (extras.length > 0) {
      return errorResponse(
        "UNKNOWN_PK_COLUMN",
        `알 수 없는 PK 컬럼: ${extras.join(", ")}`,
        400,
      );
    }

    // 낙관적 잠금 파라미터 검증 (α와 동일)
    let expectedUpdatedAt: Date | null = null;
    if (body.expected_updated_at !== undefined) {
      const parsed = new Date(body.expected_updated_at);
      if (Number.isNaN(parsed.getTime())) {
        return errorResponse(
          "INVALID_EXPECTED_UPDATED_AT",
          "expected_updated_at이 유효한 ISO 타임스탬프가 아닙니다",
          400,
        );
      }
      if (!meta.colTypeMap.has("updated_at")) {
        return errorResponse(
          "UPDATED_AT_NOT_SUPPORTED",
          "이 테이블은 updated_at 컬럼이 없어 낙관적 잠금을 지원하지 않습니다",
          400,
        );
      }
      expectedUpdatedAt = parsed;
    }

    // SET clause — values coerce
    const setCols: string[] = [];
    const setVals: unknown[] = [];
    const diff: Record<string, unknown> = {};
    try {
      for (const [col, act] of Object.entries(body.values ?? {})) {
        if (!meta.colTypeMap.has(col)) {
          return errorResponse(
            "INVALID_COLUMN",
            `알 수 없는 컬럼: ${col}`,
            400,
          );
        }
        if (act.action === "null") {
          setCols.push(col);
          setVals.push(null);
          diff[col] = null;
        } else if (act.action === "set") {
          const coerced = coerceValue(
            col,
            meta.colTypeMap.get(col)!,
            act.value,
          );
          setCols.push(col);
          setVals.push(coerced);
          diff[col] = coerced;
        }
      }
    } catch (err) {
      if (err instanceof CoercionError) {
        return errorResponse(
          "COERCE_FAILED",
          `${err.column}: ${err.reason}`,
          400,
        );
      }
      throw err;
    }

    if (setCols.length === 0) {
      return errorResponse("EMPTY_PAYLOAD", "변경된 컬럼이 없습니다", 400);
    }

    // PK 값 coerce (pkColumns 순서)
    const pkCoerced: unknown[] = [];
    try {
      for (const pkCol of meta.pkColumns) {
        pkCoerced.push(
          coerceValue(
            pkCol.column_name,
            pkCol.data_type,
            pkValues[pkCol.column_name],
          ),
        );
      }
    } catch (err) {
      if (err instanceof CoercionError) {
        return errorResponse("COERCE_FAILED", `PK: ${err.reason}`, 400);
      }
      throw err;
    }

    // auto-bump updated_at (α와 동일)
    const hasUpdatedAtCol = meta.colTypeMap.has("updated_at");
    const userSetUpdatedAt = setCols.includes("updated_at");
    const autoBumpSuffix =
      hasUpdatedAtCol && !userSetUpdatedAt ? ", updated_at = NOW()" : "";

    // SET/WHERE SQL
    const setSql =
      setCols
        .map((c, i) => `${quoteIdent(c)} = $${i + 1}`)
        .join(", ") + autoBumpSuffix;
    const sqlParams: unknown[] = [...setVals, ...pkCoerced];
    const pkWhere = meta.pkColumns
      .map(
        (c, i) =>
          `${quoteIdent(c.column_name)} = $${setCols.length + i + 1}`,
      )
      .join(" AND ");
    let whereSql = pkWhere;
    if (expectedUpdatedAt !== null) {
      sqlParams.push(expectedUpdatedAt);
      whereSql += ` AND updated_at = $${sqlParams.length}`;
    }
    const sql = `UPDATE ${quoteIdent(table)} SET ${setSql} WHERE ${whereSql} RETURNING *`;

    try {
      const { rows, rowCount } = await runReadwrite(sql, sqlParams);
      if (rowCount === 0) {
        if (expectedUpdatedAt !== null) {
          // SELECT 재확인용 WHERE: $1부터 pkCoerced 순서로
          const reselectWhere = meta.pkColumns
            .map((c, i) => `${quoteIdent(c.column_name)} = $${i + 1}`)
            .join(" AND ");
          const { rows: currentRows } = await runReadonly(
            `SELECT * FROM ${quoteIdent(table)} WHERE ${reselectWhere}`,
            pkCoerced,
          );
          if (currentRows.length > 0) {
            const current = currentRows[0]!;
            writeAuditLogDb({
              timestamp: new Date().toISOString(),
              method: "PATCH",
              path: `/api/v1/tables/${table}/composite`,
              ip: request.headers.get("x-forwarded-for") ?? "unknown",
              action: "TABLE_ROW_UPDATE_CONFLICT",
              detail: `${user.email} → ${table}(pk=${serializePk(pkValues)}): expected=${expectedUpdatedAt.toISOString()}, actual=${String(current.updated_at)}`,
            });
            return Response.json(
              {
                success: false,
                error: {
                  code: "CONFLICT",
                  message: "행이 다른 세션에서 수정되었습니다",
                  current,
                },
              },
              { status: 409 },
            );
          }
        }
        return errorResponse("NOT_FOUND", "행을 찾을 수 없음", 404);
      }
      writeAuditLogDb({
        timestamp: new Date().toISOString(),
        method: "PATCH",
        path: `/api/v1/tables/${table}/composite`,
        ip: request.headers.get("x-forwarded-for") ?? "unknown",
        action: "TABLE_ROW_UPDATE",
        detail: `${user.email} → ${table}(pk=${serializePk(pkValues)}) [locked=${expectedUpdatedAt !== null}]: ${JSON.stringify(redactSensitiveValues(table, diff))}`,
      });
      return successResponse({ row: rows[0] });
    } catch (err) {
      return errorResponse(
        "QUERY_FAILED",
        err instanceof Error ? err.message : "UPDATE 실패",
        500,
      );
    }
  },
);

/** DELETE /api/v1/tables/[table]/composite — 복합 PK 행 삭제 (ADMIN 전용) */
export const DELETE = withRole(
  ["ADMIN"],
  async (request, user, context) => {
    const params = (context?.params ? await context.params : {}) as {
      table?: string;
    };
    const table = params.table;
    if (!table || !isValidIdentifier(table)) {
      return errorResponse("INVALID_TABLE", "유효하지 않은 테이블명", 400);
    }

    const policy = checkTablePolicy(table, "DELETE", user.role);
    if (!policy.allowed) {
      return errorResponse("OPERATION_DENIED", policy.reason!, 403);
    }

    const meta = await introspectComposite(table);
    if (!meta) return errorResponse("NOT_FOUND", "테이블 없음", 404);
    if (meta.noPk) {
      return errorResponse(
        "NO_PK_UNSUPPORTED",
        "PK 없는 테이블은 삭제 불가",
        400,
      );
    }
    if (meta.pkColumns.length < 2) {
      return errorResponse(
        "NOT_COMPOSITE",
        "단일 PK 테이블은 /[pk] 경로를 사용하세요",
        400,
      );
    }

    let body: { pk_values?: Record<string, unknown> };
    try {
      body = await request.json();
    } catch {
      return errorResponse("INVALID_BODY", "JSON 파싱 실패", 400);
    }

    const pkValues = body.pk_values ?? {};
    const expectedPkCols = meta.pkColumns.map((c) => c.column_name);
    const missing = expectedPkCols.filter((c) => !(c in pkValues));
    if (missing.length > 0) {
      return errorResponse(
        "PK_VALUES_INCOMPLETE",
        `누락된 PK 컬럼: ${missing.join(", ")}`,
        400,
      );
    }
    const providedPkCols = Object.keys(pkValues);
    const extras = providedPkCols.filter((c) => !expectedPkCols.includes(c));
    if (extras.length > 0) {
      return errorResponse(
        "UNKNOWN_PK_COLUMN",
        `알 수 없는 PK 컬럼: ${extras.join(", ")}`,
        400,
      );
    }

    const pkCoerced: unknown[] = [];
    try {
      for (const pkCol of meta.pkColumns) {
        pkCoerced.push(
          coerceValue(
            pkCol.column_name,
            pkCol.data_type,
            pkValues[pkCol.column_name],
          ),
        );
      }
    } catch (err) {
      if (err instanceof CoercionError) {
        return errorResponse("COERCE_FAILED", `PK: ${err.reason}`, 400);
      }
      throw err;
    }

    const pkWhere = meta.pkColumns
      .map((c, i) => `${quoteIdent(c.column_name)} = $${i + 1}`)
      .join(" AND ");
    const sql = `DELETE FROM ${quoteIdent(table)} WHERE ${pkWhere}`;
    try {
      const { rowCount } = await runReadwrite(sql, pkCoerced);
      if (rowCount === 0) {
        return errorResponse("NOT_FOUND", "행을 찾을 수 없음", 404);
      }
      writeAuditLogDb({
        timestamp: new Date().toISOString(),
        method: "DELETE",
        path: `/api/v1/tables/${table}/composite`,
        ip: request.headers.get("x-forwarded-for") ?? "unknown",
        action: "TABLE_ROW_DELETE",
        detail: `${user.email} → ${table}(pk=${serializePk(pkValues)})`,
      });
      return successResponse({ deleted: true });
    } catch (err) {
      return errorResponse(
        "QUERY_FAILED",
        err instanceof Error ? err.message : "DELETE 실패",
        500,
      );
    }
  },
);
