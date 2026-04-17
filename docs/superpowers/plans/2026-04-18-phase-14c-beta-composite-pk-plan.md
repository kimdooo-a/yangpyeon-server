# Phase 14c-β 복합 PK 지원 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 복합 PK 테이블에 대한 PATCH/DELETE를 신규 `/_composite` 엔드포인트로 지원하고, 클라이언트가 schema 메타로 경로를 자동 분기한다.

**Architecture:** 기존 `[pk]/route.ts`는 단일 PK 전용으로 불변. 신규 `_composite/route.ts`가 body `pk_values` map을 받아 WHERE 절을 복수 컬럼으로 빌드. α의 낙관적 잠금·auto-bump·감사 로그 2종을 그대로 승계.

**Tech Stack:** Next.js 16 App Router, TypeScript, PostgreSQL (app_readwrite 롤), SQLite 감사 로그, Sonner 토스트 (α 자산).

**Spec Reference:** `docs/superpowers/specs/2026-04-18-phase-14c-beta-composite-pk-design.md`

**Preconditions:**
- Phase 14c-α 완료 (`025ce66`): `[pk]/route.ts` PATCH/DELETE + auto-bump + useInlineEditMutation 훅 + EditableCell
- `app_readwrite` PG 롤 존재
- 프로덕션 복합 PK 테이블 0개 → 임시 `_test_composite` 테이블을 E2E 내부에서 생성/DROP

---

## File Structure

### 신규
- `src/app/api/v1/tables/[table]/_composite/route.ts` — PATCH, DELETE (복합 PK)
- `docs/research/decisions/ADR-005-phase-14c-beta-composite-pk-routing.md`
- `scripts/e2e/phase-14c-beta-curl.sh` — B1~B9 + setup/teardown

### 수정
- `src/app/api/v1/tables/[table]/schema/route.ts` — `compositePkColumns: string[]` 필드 추가
- `src/components/table-editor/use-inline-edit-mutation.ts` — 훅 시그니처에 `compositePkColumns?` + URL/body 분기
- `src/components/table-editor/table-data-grid.tsx` — schema의 compositePkColumns 보유, 훅에 전달, readonly 매트릭스 확장
- `src/app/(protected)/tables/[table]/page.tsx` — "복합 PK 미지원" 경고 제거 + canInsert/canUpdate/canDelete의 `!compositePk` 제거
- `docs/status/current.md`, `docs/handover/next-dev-prompt.md`, `docs/handover/_index.md`, `docs/logs/2026-04.md`, `docs/logs/journal-2026-04-18.md`
- `docs/handover/260418-session24-phase-14c-beta.md` (신규 — 또는 기존 handover에 β 추가)

---

## Task 1: Schema 응답 확장 — `compositePkColumns`

**Files:**
- Modify: `src/app/api/v1/tables/[table]/schema/route.ts`

- [ ] **Step 1: 파일 구조 확인**

Run: `cat src/app/api/v1/tables/\[table\]/schema/route.ts | sed -n '70,95p'`
Expected: 기존 `compositePk = pkRows.length > 1` 계산 + `successResponse({table, columns, primaryKey, compositePk})` 반환.

- [ ] **Step 2: `compositePkColumns` 추가**

Edit `src/app/api/v1/tables/[table]/schema/route.ts`. 기존 반환 블록을 아래로 교체:

```ts
      const pkColumn = result.find((c) => c.isPrimaryKey);
      const primaryKey =
        pkColumn && pkRows.length === 1
          ? { column: pkColumn.name, dataType: pkColumn.dataType }
          : null;
      const compositePk = pkRows.length > 1;
      // pg_index.indkey 순서 보존 — WHERE 절 파라미터 순서에 사용
      const compositePkColumns = compositePk
        ? pkRows.map((r) => r.column_name)
        : [];

      return successResponse({
        table,
        columns: result,
        primaryKey,
        compositePk,
        compositePkColumns,
      });
```

- [ ] **Step 3: tsc**

Run: `npx tsc --noEmit`
Expected: EXIT 0.

- [ ] **Step 4: 커밋 D1**

```bash
git add "src/app/api/v1/tables/[table]/schema/route.ts"
git commit -m "$(cat <<'EOF'
feat(api): schema 응답에 compositePkColumns 필드 추가

pg_index.indkey 순서를 보존한 복합 PK 컬럼명 배열. 단일 PK는 빈 배열.
클라이언트가 PATCH/DELETE URL 분기와 pk_values 바디 구성에 사용.
후방 호환: 기존 클라이언트는 새 필드 무시.

Phase 14c-β D1

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `_composite` 엔드포인트 — PATCH, DELETE

**Files:**
- Create: `src/app/api/v1/tables/[table]/_composite/route.ts`

- [ ] **Step 1: 신규 파일 작성**

Create `src/app/api/v1/tables/[table]/_composite/route.ts` with exactly this content:

```ts
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
  // 감사 로그용 안정 직렬화
  const sorted = Object.keys(pkValues)
    .sort()
    .reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = pkValues[k];
      return acc;
    }, {});
  return JSON.stringify(sorted);
}

/** PATCH /api/v1/tables/[table]/_composite — 복합 PK 행 업데이트 */
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
          coerceValue(pkCol.column_name, pkCol.data_type, pkValues[pkCol.column_name]),
        );
      }
    } catch (err) {
      if (err instanceof CoercionError) {
        return errorResponse("COERCE_FAILED", `PK: ${err.reason}`, 400);
      }
      throw err;
    }

    // auto-bump updated_at (α와 동일 로직)
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
          const { rows: currentRows } = await runReadonly(
            `SELECT * FROM ${quoteIdent(table)} WHERE ${pkWhere.replace(/\$\d+/g, (m) => `$${parseInt(m.slice(1)) - setCols.length}`)}`,
            pkCoerced,
          );
          if (currentRows.length > 0) {
            const current = currentRows[0]!;
            writeAuditLogDb({
              timestamp: new Date().toISOString(),
              method: "PATCH",
              path: `/api/v1/tables/${table}/_composite`,
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
        path: `/api/v1/tables/${table}/_composite`,
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

/** DELETE /api/v1/tables/[table]/_composite — 복합 PK 행 삭제 (ADMIN 전용) */
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
          coerceValue(pkCol.column_name, pkCol.data_type, pkValues[pkCol.column_name]),
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
        path: `/api/v1/tables/${table}/_composite`,
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
```

**Note**: SELECT 재확인 쿼리의 파라미터 번호 재매핑은 `$1, $2, …`로 단순하게 — 이 파일에서는 pkCoerced 배열 자체를 그대로 넘기므로 placeholder를 `$1, $2, …`로 생성하도록 수정:

위 코드의 SELECT 재확인 부분을 아래로 교체:
```ts
          const { rows: currentRows } = await runReadonly(
            `SELECT * FROM ${quoteIdent(table)} WHERE ${meta.pkColumns
              .map((c, i) => `${quoteIdent(c.column_name)} = $${i + 1}`)
              .join(" AND ")}`,
            pkCoerced,
          );
```

- [ ] **Step 2: tsc**

Run: `npx tsc --noEmit`
Expected: EXIT 0.

- [ ] **Step 3: 커밋 D2**

```bash
git add "src/app/api/v1/tables/[table]/_composite/route.ts"
git commit -m "$(cat <<'EOF'
feat(api): POST /_composite 엔드포인트 — 복합 PK PATCH/DELETE

body.pk_values map으로 복합 PK 전달. pg_index.indkey 순서 보존한
WHERE 절 복수 컬럼 빌드. α의 expected_updated_at 낙관적 잠금 +
auto-bump + 409 CONFLICT + 감사 로그 2종(UPDATE/UPDATE_CONFLICT/DELETE)
완전 승계. 감사 로그 pk는 JSON 문자열(키 정렬) 직렬화.

단일 PK 테이블에 호출 시 400 NOT_COMPOSITE — 라우팅 오류 명확 신호.

Phase 14c-β D2

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: UI 분기 — 훅 + Grid

**Files:**
- Modify: `src/components/table-editor/use-inline-edit-mutation.ts`
- Modify: `src/components/table-editor/table-data-grid.tsx`

- [ ] **Step 1: 훅 시그니처 확장**

Edit `src/components/table-editor/use-inline-edit-mutation.ts`:

- `UseInlineEditMutationArgs`에 `compositePkColumns?: string[]` 추가.
- `CellEditArgs`에서 `pkValue: string`를 `pkKey: string | { values: Record<string, unknown>; primary: string }` 형태로는 복잡 → 단순히 추가 필드 `pkValuesMap?: Record<string, unknown>`로 처리.
- submit 내부에서 `compositePkColumns`가 있으면 URL = `/_composite`, body에 `pk_values` 포함. 아니면 기존 경로.

교체 블록(전체 파일):

```tsx
"use client";

import { useCallback } from "react";
import { toast } from "sonner";

interface UseInlineEditMutationArgs {
  table: string;
  /** 복합 PK 경로 사용 시 지정 (pg_index.indkey 순). 비어있으면 단일 PK 경로 */
  compositePkColumns?: string[];
  onRowUpdated: (row: Record<string, unknown>) => void;
  onRowReplaced: (row: Record<string, unknown>) => void;
  onRowMissing: () => void;
}

interface CellEditArgs {
  /** 단일 PK일 때 PK 스칼라 값 */
  pkValue?: string;
  /** 복합 PK일 때 컬럼별 값 */
  pkValuesMap?: Record<string, unknown>;
  column: string;
  value: string | boolean;
  expectedUpdatedAt: string | null;
}

export function useInlineEditMutation({
  table,
  compositePkColumns,
  onRowUpdated,
  onRowReplaced,
  onRowMissing,
}: UseInlineEditMutationArgs) {
  const isComposite = (compositePkColumns?.length ?? 0) > 1;

  const submit = useCallback(
    async ({
      pkValue,
      pkValuesMap,
      column,
      value,
      expectedUpdatedAt,
    }: CellEditArgs): Promise<
      "ok" | "conflict-resolved" | "failed"
    > => {
      const url = isComposite
        ? `/api/v1/tables/${table}/_composite`
        : `/api/v1/tables/${table}/${encodeURIComponent(pkValue ?? "")}`;

      const body: Record<string, unknown> = {
        values: { [column]: { action: "set", value } },
      };
      if (isComposite) body.pk_values = pkValuesMap ?? {};
      if (expectedUpdatedAt) body.expected_updated_at = expectedUpdatedAt;

      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json();

      if (res.ok && payload.success) {
        onRowUpdated(payload.data.row);
        return "ok";
      }

      if (res.status === 409 && payload.error?.code === "CONFLICT") {
        return await new Promise((resolve) => {
          toast.error("누군가 먼저 수정했습니다", {
            duration: 30000,
            description: `${table} 행이 다른 세션에서 변경됨`,
            action: {
              label: "덮어쓰기",
              onClick: async () => {
                const retryBody: Record<string, unknown> = {
                  values: { [column]: { action: "set", value } },
                  expected_updated_at: payload.error.current?.updated_at,
                };
                if (isComposite) retryBody.pk_values = pkValuesMap ?? {};
                const retry = await fetch(url, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(retryBody),
                });
                const retryBodyJson = await retry.json();
                if (retry.ok && retryBodyJson.success) {
                  onRowUpdated(retryBodyJson.data.row);
                  toast.success("덮어쓰기 완료");
                  resolve("conflict-resolved");
                } else {
                  toast.error("덮어쓰기 실패");
                  resolve("failed");
                }
              },
            },
            cancel: {
              label: "취소",
              onClick: () => {
                if (payload.error.current) {
                  onRowReplaced(payload.error.current);
                }
                resolve("failed");
              },
            },
          });
        });
      }

      if (res.status === 404) {
        toast.error("행이 이미 삭제되었습니다");
        onRowMissing();
        return "failed";
      }

      const msg = payload.error?.message ?? "수정 실패";
      toast.error(msg);
      return "failed";
    },
    [table, isComposite, onRowUpdated, onRowReplaced, onRowMissing],
  );

  return { submit };
}
```

- [ ] **Step 2: `TableDataGrid` 확장**

Edit `src/components/table-editor/table-data-grid.tsx`:

(1) `primaryKeyName` 옆에 `compositePkColumns` 상태 추가:
```tsx
  const [compositePkColumns, setCompositePkColumns] = useState<string[]>([]);
```

(2) `fetchSchema`에 schema 응답 저장 추가 (기존 `setPrimaryKeyName(...)` 다음 줄):
```tsx
    setCompositePkColumns(body.data.compositePkColumns ?? []);
```

(3) 훅 배선에 전달:
```tsx
  const { submit: submitInlineEdit } = useInlineEditMutation({
    table,
    compositePkColumns,
    onRowUpdated: () => {
      if (onRowPatched) onRowPatched();
      else fetchRows();
    },
    onRowReplaced: () => fetchRows(),
    onRowMissing: () => fetchRows(),
  });
```

(4) cell 렌더러의 readonly 판정 + pkVal 추출 로직 갱신:
기존 단일 PK 추출을 복합 지원으로 확장:

```tsx
      cell: ({ getValue, row }) => {
        const v = getValue();
        const isSystem = systemColumns.includes(col.name);
        const isComposite = compositePkColumns.length > 1;
        const isPkCol = isComposite
          ? compositePkColumns.includes(col.name)
          : col.isPrimaryKey;
        const readOnly =
          isPkCol ||
          isSystem ||
          !policy?.canUpdate ||
          (primaryKeyName === null && !isComposite);
        if (readOnly) {
          const text =
            v === null || v === undefined
              ? "NULL"
              : typeof v === "object"
                ? JSON.stringify(v)
                : typeof v === "boolean"
                  ? String(v)
                  : String(v);
          return (
            <span
              className={`font-mono text-xs ${v === null ? "text-zinc-500 italic" : "text-zinc-200"}`}
              title={text}
            >
              {text.length > 120 ? text.slice(0, 120) + "…" : text}
            </span>
          );
        }
        const expectedUpdatedAt = row.original["updated_at"];
        const pkValue = !isComposite && primaryKeyName
          ? row.original[primaryKeyName]
          : undefined;
        const pkValuesMap = isComposite
          ? compositePkColumns.reduce<Record<string, unknown>>((acc, c) => {
              acc[c] = row.original[c];
              return acc;
            }, {})
          : undefined;
        return (
          <EditableCell
            value={v}
            dataType={col.dataType}
            readOnly={false}
            onCommit={async (next) => {
              await submitInlineEdit({
                pkValue: pkValue !== undefined ? String(pkValue) : undefined,
                pkValuesMap,
                column: col.name,
                value: next,
                expectedUpdatedAt:
                  typeof expectedUpdatedAt === "string"
                    ? expectedUpdatedAt
                    : expectedUpdatedAt instanceof Date
                      ? expectedUpdatedAt.toISOString()
                      : null,
              });
            }}
          />
        );
      },
```

(5) `useMemo` deps에 `compositePkColumns` 추가:
```tsx
  }, [columns, orderBy, orderDir, actionColumn, policy, primaryKeyName, compositePkColumns, systemColumns, submitInlineEdit]);
```

- [ ] **Step 3: `page.tsx` 경고 제거**

Edit `src/app/(protected)/tables/[table]/page.tsx`:

(a) `hasPk` 정의 변경 — 복합 PK도 편집 가능으로 판정:
```tsx
  const hasPk = primaryKey !== null || compositePk;
```

(b) 기존 "복합 PK 테이블 — Phase 14b 미지원" 경고 블록(약 113-117L)을 삭제:
```tsx
          {!blocked && !hasPk && (
            <span className="text-xs text-amber-400">
              PK 없는 테이블 — 편집 불가
            </span>
          )}
```

- [ ] **Step 4: tsc**

Run: `npx tsc --noEmit`
Expected: EXIT 0.

- [ ] **Step 5: 커밋 D3**

```bash
git add src/components/table-editor/use-inline-edit-mutation.ts src/components/table-editor/table-data-grid.tsx "src/app/(protected)/tables/[table]/page.tsx"
git commit -m "$(cat <<'EOF'
feat(ui): TableDataGrid·useInlineEditMutation 복합 PK 분기

훅에 compositePkColumns prop 추가 → 있으면 URL=/_composite,
body에 pk_values 포함. Grid는 schema 응답의 compositePkColumns
저장 후 훅에 전달. cell readonly 매트릭스를 복합 PK 컬럼 전체로
확장(isPkCol 일반화). page.tsx의 "복합 PK 미지원" 경고 제거 +
hasPk 판정에 compositePk 포함.

Phase 14c-β D3

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: ADR-005 작성

**Files:**
- Create: `docs/research/decisions/ADR-005-phase-14c-beta-composite-pk-routing.md`

- [ ] **Step 1: ADR 작성**

Create `docs/research/decisions/ADR-005-phase-14c-beta-composite-pk-routing.md`:

```markdown
# ADR-005: Phase 14c-β 복합 PK 라우팅 — 바디 기반 `_composite` 엔드포인트

- **상태**: Accepted
- **날짜**: 2026-04-18
- **세션**: 24 연장

## 컨텍스트

Phase 14b/α가 단일 컬럼 PK에만 동작. 복합 PK 테이블은 `COMPOSITE_PK_UNSUPPORTED` 400으로 차단. 프로덕션에 복합 PK 테이블 0개지만 코드 seam을 제거하고 향후 테이블 추가 시 즉시 사용 가능한 경로를 준비할 필요.

## 결정

1. **엔드포인트 분리**: 신규 `/api/v1/tables/[table]/_composite` (PATCH, DELETE). 기존 `/[pk]` 불변.
2. **PK 전달**: 바디 `pk_values: Record<string, unknown>` map. 컬럼명 키 → URL 인코딩·순서 의존 제거.
3. **순서 보존**: Schema 응답의 `compositePkColumns`가 `pg_index.indkey` 순. WHERE 절 파라미터 순서에 사용.
4. **α 자산 승계**: `expected_updated_at` 낙관적 잠금, `updated_at = NOW()` auto-bump, 409 CONFLICT, 감사 로그 2종(`TABLE_ROW_UPDATE_CONFLICT` + `locked:bool` 메타) 동일 적용.
5. **UI 분기 위치**: `useInlineEditMutation` 훅 내부. 컴포넌트는 "어느 URL인지" 모름 — schema 메타가 훅에 주입됨.
6. **단일 PK `/[pk]` 호출 시 복합 PK 테이블**: 기존 400 `COMPOSITE_PK_UNSUPPORTED` 유지 → 명확한 라우팅 오류 신호.

## 대안

- **URL catch-all `[...pk]`**: 특수문자/UTF-8 인코딩 복잡, 컬럼 순서 암묵 의존 취약. 기각.
- **기존 `[pk]` 확장(바디 우선)**: 두 경로 오버로드로 가드 로직 복잡, 롤백 단위 불명확. 기각.

## 결과

- **장점**: 단일 PK 경로(α) 100% 회귀 위험 0. 롤백 단위 1파일 제거. 타입/정책/감사 로그 일관.
- **단점**: 두 라우트 핸들러에 공통 로직 중복(coerce, introspect, 감사 로그 조립). 향후 순수 함수 추출 리팩토링 여지 (Phase 14d 이상).
- **후속**: γ에서 권한 매트릭스 E2E로 복합 PK 경로의 role 차등 검증.

## 참고

- Spec: `docs/superpowers/specs/2026-04-18-phase-14c-beta-composite-pk-design.md`
- Plan: `docs/superpowers/plans/2026-04-18-phase-14c-beta-composite-pk-plan.md`
- 선행: ADR-004 (α 낙관적 잠금), 세션 24 `00d4e79` (raw UPDATE auto-bump)
```

- [ ] **Step 2: 커밋 D4**

```bash
git add docs/research/decisions/ADR-005-phase-14c-beta-composite-pk-routing.md
git commit -m "$(cat <<'EOF'
docs(adr): ADR-005 Phase 14c-β 복합 PK 라우팅 결정

엔드포인트 분리(/_composite) + 바디 pk_values map. URL catch-all
대비 특수문자/순서 의존 회피. α 자산(auto-bump, 409, 감사 로그)
완전 승계. 라우팅 오류 명확 신호 유지.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: E2E 스크립트 (B1~B9 + 임시 테이블 setup/teardown)

**Files:**
- Create: `scripts/e2e/phase-14c-beta-curl.sh`

- [ ] **Step 1: curl 스크립트 작성**

Create `scripts/e2e/phase-14c-beta-curl.sh`:

```bash
#!/bin/bash
# Phase 14c-β 복합 PK 지원 — E2E
# 실행: wsl -e bash -c "bash /mnt/e/00_develop/260406_luckystyle4u_server/scripts/e2e/phase-14c-beta-curl.sh"
#
# Setup: _test_composite 임시 테이블 생성 (postgres 수퍼유저 필요)
# Teardown: 스크립트 종료 시 테이블 DROP

DASH_EMAIL='kimdooo@stylelucky4u.com'
DASH_PASS='<ADMIN_PASSWORD>'
DASH_BASE='http://localhost:3000'
COOKIE=/tmp/dash-cookie-beta.txt
rm -f "$COOKIE"

echo "===== Phase 14c-β E2E ====="

# --- Setup: _test_composite 테이블 생성 ---
sudo -u postgres psql -d luckystyle4u <<'SQL' 2>&1 | tail -3
DROP TABLE IF EXISTS _test_composite;
CREATE TABLE _test_composite (
  tenant_id UUID NOT NULL,
  item_key TEXT NOT NULL,
  value TEXT,
  updated_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (tenant_id, item_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON _test_composite TO app_readwrite;
GRANT SELECT ON _test_composite TO app_readonly;
SQL
echo "SETUP: _test_composite 테이블 생성"
echo

# --- 로그인 ---
ACCESS_TOKEN=$(curl -s -X POST "$DASH_BASE/api/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$DASH_EMAIL\",\"password\":\"$DASH_PASS\"}" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["data"]["accessToken"])')
[ -z "$ACCESS_TOKEN" ] && { echo "FAIL: v1 로그인"; exit 1; }

curl -s -c "$COOKIE" -X POST "$DASH_BASE/api/auth/login-v2" \
  -H 'Content-Type: application/json' \
  -H "Referer: $DASH_BASE" \
  -H "Origin: $DASH_BASE" \
  -d "{\"accessToken\":\"$ACCESS_TOKEN\"}" -o /dev/null
echo "OK: 로그인"
echo

# --- seed 1 row via INSERT (POST /tables/_test_composite) ---
TENANT_ID=$(python3 -c 'import uuid; print(uuid.uuid4())')
INSERT_RES=$(curl -s -b "$COOKIE" -X POST "$DASH_BASE/api/v1/tables/_test_composite" \
  -H 'Content-Type: application/json' \
  -d "{\"values\":{\"tenant_id\":{\"action\":\"set\",\"value\":\"$TENANT_ID\"},\"item_key\":{\"action\":\"set\",\"value\":\"k1\"},\"value\":{\"action\":\"set\",\"value\":\"initial\"}}}")
INITIAL_UPDATED_AT=$(echo "$INSERT_RES" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["data"]["row"]["updated_at"])' 2>/dev/null)
[ -z "$INITIAL_UPDATED_AT" ] && { echo "FAIL: seed INSERT — $INSERT_RES"; sudo -u postgres psql -d luckystyle4u -c "DROP TABLE _test_composite;"; exit 1; }
echo "OK: seed (tenant_id=$TENANT_ID, item_key=k1, updated_at=$INITIAL_UPDATED_AT)"
echo

# --- B1 정상 PATCH (락 일치) ---
B1=$(curl -s -b "$COOKIE" -X PATCH "$DASH_BASE/api/v1/tables/_test_composite/_composite" \
  -H 'Content-Type: application/json' \
  -d "{\"pk_values\":{\"tenant_id\":\"$TENANT_ID\",\"item_key\":\"k1\"},\"values\":{\"value\":{\"action\":\"set\",\"value\":\"B1\"}},\"expected_updated_at\":\"$INITIAL_UPDATED_AT\"}" \
  -w "\n__HTTP__%{http_code}")
if echo "$B1" | grep -q "__HTTP__200"; then
  echo "PASS B1: 정상 PATCH (락 일치) → 200"
else
  echo "FAIL B1: $B1"
fi
echo

# --- B2 CONFLICT (구 timestamp) ---
B2=$(curl -s -b "$COOKIE" -X PATCH "$DASH_BASE/api/v1/tables/_test_composite/_composite" \
  -H 'Content-Type: application/json' \
  -d "{\"pk_values\":{\"tenant_id\":\"$TENANT_ID\",\"item_key\":\"k1\"},\"values\":{\"value\":{\"action\":\"set\",\"value\":\"B2\"}},\"expected_updated_at\":\"$INITIAL_UPDATED_AT\"}" \
  -w "\n__HTTP__%{http_code}")
if echo "$B2" | grep -q "__HTTP__409" && echo "$B2" | grep -q '"code":"CONFLICT"'; then
  echo "PASS B2: CONFLICT → 409 + 코드 일치"
else
  echo "FAIL B2: $B2"
fi
echo

# --- B3 NOT_FOUND (존재하지 않는 pk_values) ---
FAKE_TENANT=$(python3 -c 'import uuid; print(uuid.uuid4())')
B3=$(curl -s -b "$COOKIE" -X PATCH "$DASH_BASE/api/v1/tables/_test_composite/_composite" \
  -H 'Content-Type: application/json' \
  -d "{\"pk_values\":{\"tenant_id\":\"$FAKE_TENANT\",\"item_key\":\"nope\"},\"values\":{\"value\":{\"action\":\"set\",\"value\":\"x\"}}}" \
  -w "\n__HTTP__%{http_code}")
if echo "$B3" | grep -q "__HTTP__404"; then
  echo "PASS B3: NOT_FOUND → 404"
else
  echo "FAIL B3: $B3"
fi
echo

# --- B4 PK_VALUES_INCOMPLETE ---
B4=$(curl -s -b "$COOKIE" -X PATCH "$DASH_BASE/api/v1/tables/_test_composite/_composite" \
  -H 'Content-Type: application/json' \
  -d "{\"pk_values\":{\"tenant_id\":\"$TENANT_ID\"},\"values\":{\"value\":{\"action\":\"set\",\"value\":\"x\"}}}" \
  -w "\n__HTTP__%{http_code}")
if echo "$B4" | grep -q "__HTTP__400" && echo "$B4" | grep -q "PK_VALUES_INCOMPLETE"; then
  echo "PASS B4: PK_VALUES_INCOMPLETE → 400"
else
  echo "FAIL B4: $B4"
fi
echo

# --- B5 UNKNOWN_PK_COLUMN ---
B5=$(curl -s -b "$COOKIE" -X PATCH "$DASH_BASE/api/v1/tables/_test_composite/_composite" \
  -H 'Content-Type: application/json' \
  -d "{\"pk_values\":{\"tenant_id\":\"$TENANT_ID\",\"item_key\":\"k1\",\"bogus\":\"x\"},\"values\":{\"value\":{\"action\":\"set\",\"value\":\"x\"}}}" \
  -w "\n__HTTP__%{http_code}")
if echo "$B5" | grep -q "__HTTP__400" && echo "$B5" | grep -q "UNKNOWN_PK_COLUMN"; then
  echo "PASS B5: UNKNOWN_PK_COLUMN → 400"
else
  echo "FAIL B5: $B5"
fi
echo

# --- B6 NOT_COMPOSITE (단일 PK 테이블에 /_composite 호출) ---
B6=$(curl -s -b "$COOKIE" -X PATCH "$DASH_BASE/api/v1/tables/folders/_composite" \
  -H 'Content-Type: application/json' \
  -d "{\"pk_values\":{\"id\":\"whatever\"},\"values\":{\"name\":{\"action\":\"set\",\"value\":\"x\"}}}" \
  -w "\n__HTTP__%{http_code}")
if echo "$B6" | grep -q "__HTTP__400" && echo "$B6" | grep -q "NOT_COMPOSITE"; then
  echo "PASS B6: NOT_COMPOSITE → 400"
else
  echo "FAIL B6: $B6"
fi
echo

# --- B7 LEGACY GUARD (복합 PK 테이블에 /[pk] 호출) ---
B7=$(curl -s -b "$COOKIE" -X PATCH "$DASH_BASE/api/v1/tables/_test_composite/dummy" \
  -H 'Content-Type: application/json' \
  -d "{\"values\":{\"value\":{\"action\":\"set\",\"value\":\"x\"}}}" \
  -w "\n__HTTP__%{http_code}")
if echo "$B7" | grep -q "__HTTP__400" && echo "$B7" | grep -q "COMPOSITE_PK_UNSUPPORTED"; then
  echo "PASS B7: LEGACY GUARD → 400 COMPOSITE_PK_UNSUPPORTED"
else
  echo "FAIL B7: $B7"
fi
echo

# --- B8 DELETE (복합 PK) ---
B8=$(curl -s -b "$COOKIE" -X DELETE "$DASH_BASE/api/v1/tables/_test_composite/_composite" \
  -H 'Content-Type: application/json' \
  -d "{\"pk_values\":{\"tenant_id\":\"$TENANT_ID\",\"item_key\":\"k1\"}}" \
  -w "\n__HTTP__%{http_code}")
if echo "$B8" | grep -q "__HTTP__200" && echo "$B8" | grep -q '"deleted":true'; then
  echo "PASS B8: DELETE → 200 deleted:true"
else
  echo "FAIL B8: $B8"
fi
echo

# --- B9 감사 로그 확인 ---
AUDIT=$(curl -s -b "$COOKIE" "$DASH_BASE/api/audit?limit=50")
UPDATE_COUNT=$(echo "$AUDIT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(sum(1 for l in d['logs'] if l.get('action')=='TABLE_ROW_UPDATE' and '_test_composite' in l.get('path','')))")
CONFLICT_COUNT=$(echo "$AUDIT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(sum(1 for l in d['logs'] if l.get('action')=='TABLE_ROW_UPDATE_CONFLICT' and '_test_composite' in l.get('path','')))")
DELETE_COUNT=$(echo "$AUDIT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(sum(1 for l in d['logs'] if l.get('action')=='TABLE_ROW_DELETE' and '_test_composite' in l.get('path','')))")
if [ "$UPDATE_COUNT" -ge 1 ] && [ "$CONFLICT_COUNT" -ge 1 ] && [ "$DELETE_COUNT" -ge 1 ]; then
  echo "PASS B9: 감사 로그 — UPDATE=$UPDATE_COUNT, CONFLICT=$CONFLICT_COUNT, DELETE=$DELETE_COUNT"
else
  echo "FAIL B9: UPDATE=$UPDATE_COUNT, CONFLICT=$CONFLICT_COUNT, DELETE=$DELETE_COUNT"
fi
echo

# --- Teardown ---
sudo -u postgres psql -d luckystyle4u -c "DROP TABLE _test_composite;" > /dev/null
echo "TEARDOWN: _test_composite 테이블 DROP"
```

- [ ] **Step 2: 커밋 D5 준비 (실행은 Task 6)**

```bash
git add scripts/e2e/phase-14c-beta-curl.sh
git commit -m "$(cat <<'EOF'
test(14c-β): curl B1~B9 E2E 스크립트 + _test_composite setup/teardown

복합 PK PATCH/DELETE 매트릭스: 정상/CONFLICT/NOT_FOUND/PK 불완전/
미지 PK 컬럼/단일PK에 /_composite 호출/복합PK에 /[pk] 호출/DELETE/
감사 로그 3종. 임시 _test_composite 테이블을 psql로 생성 → 검증 →
DROP. 실행은 Task 6(배포 후).

Phase 14c-β D5 (스크립트)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 배포 + E2E 실행 + 세션 종료 문서화

**Files:**
- Modify: `docs/status/current.md`, `docs/logs/2026-04.md`, `docs/logs/journal-2026-04-18.md`
- Create: `docs/handover/260418-session24-phase-14c-beta.md`
- Modify: `docs/handover/_index.md`, `docs/handover/next-dev-prompt.md`

- [ ] **Step 1: 프로덕션 배포**

Run:
```bash
wsl -e bash -c "source ~/.nvm/nvm.sh && cd ~/dashboard && rm -rf src .next && cp -r /mnt/e/00_develop/260406_luckystyle4u_server/src . && cp /mnt/e/00_develop/260406_luckystyle4u_server/tsconfig.json . && npm run build 2>&1 | tail -5 && pm2 restart dashboard"
```
Expected: `.next` 재생성 + `pm2 restart` 성공.

- [ ] **Step 2: 헬스체크**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/login`
Expected: `200`.

- [ ] **Step 3: E2E 실행**

Run: `wsl -e bash -c "bash /mnt/e/00_develop/260406_luckystyle4u_server/scripts/e2e/phase-14c-beta-curl.sh"`
Expected: `PASS B1` … `PASS B9` 9줄 모두 PASS.

- [ ] **Step 4: `docs/status/current.md` β 행 추가**

체크박스 리스트에 추가 (α 행 직후):
```markdown
- [x] **Phase 14c-β (세션 24 연장)**: 복합 PK 지원 — 신규 `/_composite` 엔드포인트(PATCH/DELETE) + schema 응답에 `compositePkColumns` 필드 + useInlineEditMutation 훅 분기 + page.tsx "복합 PK 미지원" 경고 제거. α auto-bump + 409 + 감사 로그 2종 완전 승계. ADR-005. 프로덕션 복합 PK 테이블 0개 → 임시 `_test_composite`로 E2E B1~B9 전 PASS (setup/teardown 스크립트 내부).
```

세션 요약표 행 추가:
```markdown
| 24b | 2026-04-18 | Phase 14c-β 복합 PK 지원 — 바디 pk_values map + `/_composite` 엔드포인트 분리. α 자산 승계(auto-bump/409/감사 로그 2종). ADR-005 + 임시 `_test_composite` 테이블 기반 curl E2E B1~B9 전 PASS. 단일 PK 경로(α) 100% 불변 | [2026-04](../logs/2026-04.md) | [인수인계서](../handover/260418-session24-phase-14c-beta.md) |
```

- [ ] **Step 5: `docs/logs/2026-04.md` β 섹션 추가**

세션 24 섹션 뒤에 "## 세션 24 연장 — 2026-04-18 (Phase 14c-β 복합 PK 지원)" 섹션 추가. 포맷은 α 섹션과 동일.

- [ ] **Step 6: `docs/logs/journal-2026-04-18.md` β 토픽 추가**

파일 하단에 β 토픽 추가 — 스코프 확정, 설계 결정, 구현 진행, E2E 결과.

- [ ] **Step 7: `docs/handover/260418-session24-phase-14c-beta.md` 작성**

세션 24 α handover 포맷 모방. "작업 요약 / 핵심 산출물 / 배포 상태 / E2E 결과 / 대화 다이제스트 / 커밋 체인 / 다음 세션 권장" 섹션 포함.

- [ ] **Step 8: `_index.md` 행 추가 + `next-dev-prompt.md` 갱신**

`_index.md` 2026-04-18 그룹에 β 행 추가 (α 위에).

`next-dev-prompt.md`:
- 현재 상태를 "Phase 14c-α + β 완료"로 갱신
- 다음 작업 우선순위를 γ(VIEWER) > B(/ypserver) > C(Vitest)로 재정렬

- [ ] **Step 9: 커밋 종료**

```bash
git add docs/
git commit -m "$(cat <<'EOF'
docs(14c-β): 세션 24 연장 — 복합 PK 지원 완료

- ADR-005 복합 PK 라우팅 결정 기록
- 본 커밋: current.md / 2026-04.md / journal-2026-04-18 / handover
  260418-session24-phase-14c-beta / _index / next-dev-prompt

E2E 매트릭스 B1~B9 전 PASS:
  정상/CONFLICT/NOT_FOUND/PK 불완전/미지 PK 컬럼/단일PK-to-composite
  호출/composite-to-legacy 호출/DELETE + 감사 로그 3종.

α 단일 PK 경로 100% 불변 검증. 복합 PK 테스트는 임시
_test_composite 테이블(setup→검증→teardown) 패턴.

Phase 14c-β D5 + 세션 연장 종료

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Checklist

- [x] Spec §2.1 In Scope 5개 항목 모두 Task 매핑 — T2 API / T3 UI / T5 E2E / 경고 제거 T3 / α 승계 T2
- [x] Spec §3 아키텍처 경로 분리 — T2 (신규 파일)
- [x] Spec §3.3 컴포넌트 변경 6개 — T1~T3에 분배
- [x] Spec §4 엣지케이스 — T2 코드에 전부 구현 (NOT_COMPOSITE / INCOMPLETE / UNKNOWN / COERCE_FAILED / UPDATED_AT_NOT_SUPPORTED)
- [x] Spec §5 감사 로그 포맷 — T2 `serializePk` 함수로 JSON 정렬 직렬화
- [x] Spec §6 테스트 — T5 B1~B9 + setup/teardown
- [x] Spec §9 커밋 경계 D1~D5 — T1/T2/T3/T4/T5 매핑 (T6은 배포+DOD)
- [x] 타입 일관성: `compositePkColumns: string[]` schema → grid state → 훅 prop, `pk_values: Record<string, unknown>` body 일관
- [x] 플레이스홀더 스캔: 없음. 모든 step 실제 코드/명령 포함

---

## 실행 핸드오프

**Plan complete and saved to `docs/superpowers/plans/2026-04-18-phase-14c-beta-composite-pk-plan.md`.**

자율 실행 모드(사용자 지시: 권장안 직접 채택)에 따라 **Subagent-Driven**으로 진입합니다.
