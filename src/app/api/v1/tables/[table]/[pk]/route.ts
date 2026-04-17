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
  pkColumn: { column_name: string; data_type: string } | null;
  compositePk: boolean;
  noPk: boolean;
}

async function introspect(table: string): Promise<IntrospectResult | null> {
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

  // pg_catalog 기반 — app_readonly 롤에서 information_schema 제약 뷰가
  // 0행 반환하는 이슈 회피 (세션 21 수정)
  const { rows: pkRows } = await runReadonly<{
    column_name: string;
    data_type: string;
  }>(
    `SELECT a.attname AS column_name,
            format_type(a.atttypid, a.atttypmod) AS data_type
     FROM pg_index i
     JOIN pg_attribute a
       ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
     WHERE i.indrelid = ('public.' || quote_ident($1))::regclass
       AND i.indisprimary`,
    [table],
  );

  return {
    colTypeMap: new Map(cols.map((c) => [c.column_name, c.data_type])),
    pkColumn: pkRows.length === 1 ? pkRows[0]! : null,
    compositePk: pkRows.length > 1,
    noPk: pkRows.length === 0,
  };
}

/** PATCH /api/v1/tables/[table]/[pk] — 행 부분 업데이트 (MANAGER+) */
export const PATCH = withRole(
  ["ADMIN", "MANAGER"],
  async (request, user, context) => {
    const params = (context?.params ? await context.params : {}) as {
      table?: string;
      pk?: string;
    };
    const table = params.table;
    const pk = params.pk;
    if (!table || !isValidIdentifier(table)) {
      return errorResponse("INVALID_TABLE", "유효하지 않은 테이블명", 400);
    }
    if (pk === undefined) {
      return errorResponse("INVALID_PK", "PK 파라미터 누락", 400);
    }

    const policy = checkTablePolicy(table, "UPDATE", user.role);
    if (!policy.allowed) {
      return errorResponse("OPERATION_DENIED", policy.reason!, 403);
    }

    const meta = await introspect(table);
    if (!meta) return errorResponse("NOT_FOUND", "테이블 없음", 404);
    if (meta.noPk) {
      return errorResponse(
        "NO_PK_UNSUPPORTED",
        "PK 없는 테이블은 편집 불가",
        400,
      );
    }
    if (meta.compositePk) {
      return errorResponse(
        "COMPOSITE_PK_UNSUPPORTED",
        "복합 PK 테이블은 Phase 14b에서 미지원",
        400,
      );
    }

    let body: {
      values?: Record<string, ColumnAction>;
      expected_updated_at?: string;
    };
    try {
      body = await request.json();
    } catch {
      return errorResponse("INVALID_BODY", "JSON 파싱 실패", 400);
    }

    // 낙관적 잠금 파라미터 검증
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

    // PK 값 coerce
    let pkValue: unknown;
    try {
      pkValue = coerceValue(
        meta.pkColumn!.column_name,
        meta.pkColumn!.data_type,
        pk,
      );
    } catch (err) {
      if (err instanceof CoercionError) {
        return errorResponse("COERCE_FAILED", `PK: ${err.reason}`, 400);
      }
      throw err;
    }

    const setSql = setCols
      .map((c, i) => `${quoteIdent(c)} = $${i + 1}`)
      .join(", ");
    const sqlParams: unknown[] = [...setVals, pkValue];
    let whereSql = `${quoteIdent(meta.pkColumn!.column_name)} = $${sqlParams.length}`;
    if (expectedUpdatedAt !== null) {
      sqlParams.push(expectedUpdatedAt);
      whereSql += ` AND updated_at = $${sqlParams.length}`;
    }
    const sql = `UPDATE ${quoteIdent(table)} SET ${setSql} WHERE ${whereSql} RETURNING *`;

    try {
      const { rows, rowCount } = await runReadwrite(sql, sqlParams);
      if (rowCount === 0) {
        // 낙관적 잠금 사용 중이면 존재 재확인 → 409 vs 404 구분
        if (expectedUpdatedAt !== null) {
          const { rows: currentRows } = await runReadonly(
            `SELECT * FROM ${quoteIdent(table)} WHERE ${quoteIdent(meta.pkColumn!.column_name)} = $1`,
            [pkValue],
          );
          if (currentRows.length > 0) {
            const current = currentRows[0]!;
            writeAuditLogDb({
              timestamp: new Date().toISOString(),
              method: "PATCH",
              path: `/api/v1/tables/${table}/${pk}`,
              ip: request.headers.get("x-forwarded-for") ?? "unknown",
              action: "TABLE_ROW_UPDATE_CONFLICT",
              detail: `${user.email} → ${table}(pk=${pk}): expected=${expectedUpdatedAt.toISOString()}, actual=${String(current.updated_at)}`,
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
        path: `/api/v1/tables/${table}/${pk}`,
        ip: request.headers.get("x-forwarded-for") ?? "unknown",
        action: "TABLE_ROW_UPDATE",
        detail: `${user.email} → ${table}(pk=${pk}) [locked=${expectedUpdatedAt !== null}]: ${JSON.stringify(redactSensitiveValues(table, diff))}`,
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

/** DELETE /api/v1/tables/[table]/[pk] — ADMIN 전용 */
export const DELETE = withRole(
  ["ADMIN"],
  async (request, user, context) => {
    const params = (context?.params ? await context.params : {}) as {
      table?: string;
      pk?: string;
    };
    const table = params.table;
    const pk = params.pk;
    if (!table || !isValidIdentifier(table)) {
      return errorResponse("INVALID_TABLE", "유효하지 않은 테이블명", 400);
    }
    if (pk === undefined) {
      return errorResponse("INVALID_PK", "PK 파라미터 누락", 400);
    }

    const policy = checkTablePolicy(table, "DELETE", user.role);
    if (!policy.allowed) {
      return errorResponse("OPERATION_DENIED", policy.reason!, 403);
    }

    const meta = await introspect(table);
    if (!meta) return errorResponse("NOT_FOUND", "테이블 없음", 404);
    if (meta.noPk) {
      return errorResponse(
        "NO_PK_UNSUPPORTED",
        "PK 없는 테이블은 삭제 불가",
        400,
      );
    }
    if (meta.compositePk) {
      return errorResponse("COMPOSITE_PK_UNSUPPORTED", "복합 PK 미지원", 400);
    }

    let pkValue: unknown;
    try {
      pkValue = coerceValue(
        meta.pkColumn!.column_name,
        meta.pkColumn!.data_type,
        pk,
      );
    } catch (err) {
      if (err instanceof CoercionError) {
        return errorResponse("COERCE_FAILED", `PK: ${err.reason}`, 400);
      }
      throw err;
    }

    const sql = `DELETE FROM ${quoteIdent(table)} WHERE ${quoteIdent(
      meta.pkColumn!.column_name,
    )} = $1`;
    try {
      const { rowCount } = await runReadwrite(sql, [pkValue]);
      if (rowCount === 0) {
        return errorResponse("NOT_FOUND", "행을 찾을 수 없음", 404);
      }
      writeAuditLogDb({
        timestamp: new Date().toISOString(),
        method: "DELETE",
        path: `/api/v1/tables/${table}/${pk}`,
        ip: request.headers.get("x-forwarded-for") ?? "unknown",
        action: "TABLE_ROW_DELETE",
        detail: `${user.email} → ${table}(pk=${pk})`,
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
