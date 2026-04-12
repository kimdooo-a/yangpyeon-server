# Phase 14b — Table Editor CRUD 실행 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> 상위: [CLAUDE.md](../../../CLAUDE.md) → [ADR-003](../decisions/ADR-003-phase-14b-table-editor-crud.md) → **여기**
> 관련: [세션 18 인수인계](../../handover/260412-session18-auth-refactor.md), [Phase 14b 프롬프트](../../handover/phase-14b-crud-prompt.md)
> 작성일: 2026-04-12

**Goal:** Phase 14a 읽기 전용 Table Editor에 INSERT/UPDATE/DELETE를 추가해 MANAGER+ 권한자가 UI에서 안전하게 행을 관리하도록 한다.

**Architecture:** `app_readwrite` PG 롤 + `runReadwrite` 트랜잭션 래퍼(fail-closed) + `table-policy`/`identifier`/`coerce` 유틸 + POST/PATCH/DELETE API 3종 + 신규·수정 겸용 `RowFormModal`(3상태 입력). 민감 테이블은 policy에서 전면 차단, 모든 변경은 Drizzle `audit_logs`에 영속 기록.

**Tech Stack:** Next.js 16 · TypeScript · PostgreSQL(pg 8.x) · Prisma 7 · TanStack Table v8 · Drizzle SQLite(감사 로그)

**테스트 전략 주의:** 이 프로젝트에는 단위 테스트 러너(Vitest 등)가 없어 **tsc + curl 통합 + 브라우저 수동 E2E**로 검증. ADR §5 Vitest 언급은 후속 세션으로 이관. TDD는 "curl/빌드가 실패하는 걸 먼저 본 뒤 통과시키는 방식"으로 적용.

---

## 파일 구조 개요

```
scripts/sql/
└── create-app-readwrite.sql           [신규] PG 롤 정의 + 적용 메모

src/lib/pg/
└── pool.ts                             [확장] runReadwrite 추가

src/lib/db/
├── identifier.ts                       [신규] 식별자 검증·quoteIdent
├── coerce.ts                           [신규] PG 타입별 값 변환
└── table-policy.ts                     [신규] 테이블별 CRUD 허용 매트릭스

src/lib/
└── audit-log-db.ts                     [확장] TABLE_ROW_* action + REDACT

src/app/api/v1/tables/
├── [table]/route.ts                    [확장] POST 추가
├── [table]/[pk]/route.ts               [신규] PATCH + DELETE
└── [table]/schema/route.ts             [확장] primaryKey 응답

src/components/table-editor/
├── row-form-modal.tsx                  [신규] 3상태 폼 모달
└── table-data-grid.tsx                 [확장] 행 액션 버튼 + props 확장

src/app/(protected)/tables/[table]/
└── page.tsx                            [확장] "행 추가" CTA + 모달 상태

docs/guides/
└── tables-e2e-manual.md                [확장] S8~S11 CRUD 시나리오

docs/
├── status/current.md                   [확장] 세션 19 요약행
├── logs/2026-04.md                     [확장] 세션 19 상세
├── logs/journal-2026-04-12.md          [확장] 진행 저널
├── handover/
│   ├── 260412-session19-phase-14b.md   [신규] 인수인계
│   ├── _index.md                        [확장] 세션 19 등록
│   └── next-dev-prompt.md              [확장] Phase 14c 연결
```

---

## Task 1 — `app_readwrite` PG 롤 생성 (C1)

**Files:**
- Create: `scripts/sql/create-app-readwrite.sql`

- [ ] **Step 1: SQL 스크립트 작성**

파일 내용:
```sql
-- Phase 14b: Table Editor CRUD용 PG 롤
-- 적용:
--   wsl -d Ubuntu -- psql -h 127.0.0.1 -U postgres -d yangpyeong \
--     -f /mnt/e/00_develop/260406_luckystyle4u_server/scripts/sql/create-app-readwrite.sql
-- 검증:
--   wsl -d Ubuntu -- psql -h 127.0.0.1 -U postgres -d yangpyeong -c "\du app_readwrite"

-- LOGIN 불가, 세션에서 SET LOCAL ROLE로만 전환 가능
CREATE ROLE app_readwrite NOLOGIN;

GRANT USAGE ON SCHEMA public TO app_readwrite;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_readwrite;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_readwrite;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_readwrite;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_readwrite;

-- postgres(앱 연결 계정)가 SET LOCAL ROLE로 전환 가능하도록
GRANT app_readwrite TO postgres;
```

- [ ] **Step 2: WSL2 psql로 적용**

Run:
```bash
wsl -d Ubuntu -- psql -h 127.0.0.1 -U postgres -d yangpyeong \
  -f /mnt/e/00_develop/260406_luckystyle4u_server/scripts/sql/create-app-readwrite.sql
```
Expected: `CREATE ROLE`, `GRANT`, `ALTER DEFAULT PRIVILEGES` 각 한 줄씩.

재실행 시 `role "app_readwrite" already exists` 오류 나면 정상(멱등 아님을 확인한 뒤 ignore).

- [ ] **Step 3: 롤 존재 검증**

Run:
```bash
wsl -d Ubuntu -- psql -h 127.0.0.1 -U postgres -d yangpyeong -c "\du app_readwrite"
```
Expected: `app_readwrite | Cannot login | {}` 또는 유사 표시.

- [ ] **Step 4: 실제 쓰기 권한 smoke (임시 테이블)**

Run:
```bash
wsl -d Ubuntu -- psql -h 127.0.0.1 -U postgres -d yangpyeong <<'EOF'
BEGIN;
SET LOCAL ROLE app_readwrite;
INSERT INTO folders (id, name, owner_id, is_root) VALUES ('test-14b-rw-smoke', '__phase14b_smoke__', (SELECT id FROM users LIMIT 1), false);
DELETE FROM folders WHERE id = 'test-14b-rw-smoke';
ROLLBACK;
EOF
```
Expected: 에러 없이 완료 (ROLLBACK으로 변경 없음).

- [ ] **Step 5: 커밋 (C1)**

```bash
cd E:/00_develop/260406_luckystyle4u_server
git add scripts/sql/create-app-readwrite.sql
git commit -m "feat(db): Phase 14b — app_readwrite PG 롤 SQL 스크립트

CRUD 전용 NOLOGIN 롤. SET LOCAL ROLE로만 전환.
public.* SELECT/INSERT/UPDATE/DELETE + sequences USAGE/SELECT + default privileges.
WSL2 psql 수동 적용 (스크립트 헤더 주석에 명령 기재)."
```

---

## Task 2 — `identifier` 유틸 신설

**Files:**
- Create: `src/lib/db/identifier.ts`

- [ ] **Step 1: 파일 작성**

내용:
```ts
/**
 * Phase 14b: DB 식별자 검증 + 안전한 인용 처리.
 * 값이 아닌 식별자(테이블명·컬럼명)는 파라미터 바인딩이 불가능해
 * 수동 이스케이프가 필요하다. 사용 지점은 반드시 DB 화이트리스트 대조와 결합한다.
 */

const IDENTIFIER_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export function isValidIdentifier(name: string): boolean {
  return typeof name === "string" && IDENTIFIER_REGEX.test(name);
}

/**
 * PostgreSQL `quote_ident` 동등 동작.
 * 입력은 이미 `isValidIdentifier` 통과 + DB 화이트리스트 대조된 값이어야 한다.
 */
export function quoteIdent(name: string): string {
  if (!isValidIdentifier(name)) {
    throw new Error(`invalid identifier: ${name}`);
  }
  return `"${name.replace(/"/g, '""')}"`;
}
```

- [ ] **Step 2: 타입 체크**

Run: `cd E:/00_develop/260406_luckystyle4u_server && npx tsc --noEmit`
Expected: 에러 0.

---

## Task 3 — `coerce` 유틸 신설

**Files:**
- Create: `src/lib/db/coerce.ts`

- [ ] **Step 1: 파일 작성**

내용:
```ts
/**
 * Phase 14b: 클라이언트 폼 문자열 → PG 타입별 값 변환.
 * `information_schema.columns.data_type` 문자열을 기반으로 분기한다.
 */

export class CoercionError extends Error {
  constructor(
    public column: string,
    public reason: string,
  ) {
    super(`coerce failed: ${column} — ${reason}`);
    this.name = "CoercionError";
  }
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `information_schema.columns.data_type` 값 예:
 *  "integer", "bigint", "smallint", "numeric", "boolean",
 *  "text", "character varying", "uuid",
 *  "timestamp with time zone", "timestamp without time zone", "date",
 *  "json", "jsonb"
 */
export function coerceValue(
  column: string,
  dataType: string,
  raw: unknown,
): unknown {
  const dt = dataType.toLowerCase();

  // null pass-through (action="null")
  if (raw === null) return null;

  // 정수
  if (dt === "integer" || dt === "bigint" || dt === "smallint") {
    const n = Number(String(raw).trim());
    if (!Number.isFinite(n) || !Number.isInteger(n)) {
      throw new CoercionError(column, `정수가 아닙니다 (${String(raw)})`);
    }
    return n;
  }

  // numeric / real / double — 문자열 그대로 전달(정밀도 보존)
  if (
    dt === "numeric" ||
    dt === "real" ||
    dt === "double precision" ||
    dt.startsWith("decimal")
  ) {
    const s = String(raw).trim();
    if (!/^-?\d+(\.\d+)?$/.test(s)) {
      throw new CoercionError(column, `유효한 숫자 형식이 아닙니다 (${s})`);
    }
    return s;
  }

  // bool
  if (dt === "boolean") {
    if (raw === true || raw === false) return raw;
    const s = String(raw).trim().toLowerCase();
    if (s === "true" || s === "1" || s === "t") return true;
    if (s === "false" || s === "0" || s === "f") return false;
    throw new CoercionError(column, `boolean으로 변환 불가 (${s})`);
  }

  // uuid
  if (dt === "uuid") {
    const s = String(raw).trim();
    if (!UUID_REGEX.test(s)) {
      throw new CoercionError(column, `UUID 형식이 아닙니다 (${s})`);
    }
    return s;
  }

  // timestamp / date
  if (dt.startsWith("timestamp") || dt === "date") {
    const d = new Date(String(raw));
    if (Number.isNaN(d.getTime())) {
      throw new CoercionError(column, `날짜 파싱 실패 (${String(raw)})`);
    }
    return d.toISOString();
  }

  // json / jsonb
  if (dt === "json" || dt === "jsonb") {
    if (typeof raw === "object") return raw;
    try {
      return JSON.parse(String(raw));
    } catch {
      throw new CoercionError(column, `JSON 파싱 실패`);
    }
  }

  // text / varchar / bpchar / 기타 문자열 — 그대로
  return String(raw);
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 0.

---

## Task 4 — `table-policy` 신설

**Files:**
- Create: `src/lib/db/table-policy.ts`

- [ ] **Step 1: 파일 작성**

내용:
```ts
import type { Role } from "@/generated/prisma/client";

export type TableOperation = "INSERT" | "UPDATE" | "DELETE";

export interface PolicyDecision {
  allowed: boolean;
  reason?: string;
}

/** 민감 테이블 — 전 작업 차단 (전용 관리 페이지가 존재) */
const FULL_BLOCK = new Set([
  "users",
  "api_keys",
  "_prisma_migrations",
]);

/** 역사 자산 — DELETE(ADMIN)만 허용, INSERT/UPDATE 차단 */
const DELETE_ONLY = new Set(["edge_function_runs"]);

/**
 * Phase 14b: 테이블×작업×역할 기반 CRUD 허용 여부.
 * 1차 권한 검사(withRole)를 통과한 뒤 호출한다.
 */
export function checkTablePolicy(
  table: string,
  operation: TableOperation,
  role: Role,
): PolicyDecision {
  if (FULL_BLOCK.has(table)) {
    return {
      allowed: false,
      reason: `${table}은 Table Editor에서 편집할 수 없습니다 (전용 페이지 사용)`,
    };
  }

  if (DELETE_ONLY.has(table)) {
    if (operation !== "DELETE") {
      return {
        allowed: false,
        reason: `${table}은 삭제만 가능합니다`,
      };
    }
    if (role !== "ADMIN") {
      return { allowed: false, reason: "삭제는 ADMIN만 가능합니다" };
    }
    return { allowed: true };
  }

  // 일반 업무 테이블
  if (operation === "DELETE" && role !== "ADMIN") {
    return { allowed: false, reason: "삭제는 ADMIN만 가능합니다" };
  }
  if (
    (operation === "INSERT" || operation === "UPDATE") &&
    role !== "ADMIN" &&
    role !== "MANAGER"
  ) {
    return { allowed: false, reason: "MANAGER 이상 권한이 필요합니다" };
  }
  return { allowed: true };
}

/** 민감 컬럼 — 감사 로그 detail에서 [REDACTED] 처리 */
const REDACT_COLUMNS: Record<string, Set<string>> = {
  users: new Set(["password_hash", "passwordHash"]),
  api_keys: new Set(["key_hash", "keyHash", "secret"]),
};

export function redactSensitiveValues(
  table: string,
  diff: Record<string, unknown>,
): Record<string, unknown> {
  const set = REDACT_COLUMNS[table];
  if (!set) return diff;
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(diff)) {
    result[k] = set.has(k) ? "[REDACTED]" : v;
  }
  return result;
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 0.

---

## Task 5 — `runReadwrite` 헬퍼 추가

**Files:**
- Modify: `src/lib/pg/pool.ts`

- [ ] **Step 1: 파일 하단에 함수 추가**

`runReadonly` 아래에 추가:
```ts
/**
 * Phase 14b: 쓰기 트랜잭션 실행.
 * - BEGIN → SET LOCAL ROLE app_readwrite → SET LOCAL statement_timeout → query → COMMIT
 * - 롤 부재 시 fail-closed(에러 전파) — runReadonly의 관대 정책과 대비.
 */
export async function runReadwrite<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = [],
  options: { timeoutMs?: number } = {},
): Promise<{ rows: T[]; rowCount: number }> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const pool = getPgPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // fail-closed: app_readwrite 부재 시 여기서 에러 전파
    await client.query("SET LOCAL ROLE app_readwrite");
    await client.query(`SET LOCAL statement_timeout = ${timeoutMs}`);
    const result = await client.query<T>(sql, params);
    await client.query("COMMIT");
    return {
      rows: result.rows,
      rowCount: result.rowCount ?? 0,
    };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    throw err;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 0.

- [ ] **Step 3: C2 커밋**

```bash
git add src/lib/pg/pool.ts src/lib/db/identifier.ts src/lib/db/coerce.ts src/lib/db/table-policy.ts
git commit -m "feat(db): Phase 14b — CRUD 라이브러리 레이어

- pool.runReadwrite: fail-closed 트랜잭션 래퍼 (app_readwrite 롤 필수)
- db/identifier: 식별자 정규식 검증 + quoteIdent
- db/coerce: PG 타입별 값 변환 (int/numeric/bool/uuid/timestamp/json/text)
  + CoercionError 컬럼 단위 에러 보고
- db/table-policy: 테이블 × 작업 × 역할 매트릭스
  + 민감 테이블(users/api_keys/_prisma_migrations) 전면 차단
  + edge_function_runs DELETE(ADMIN) only
  + redactSensitiveValues (감사 로그용)"
```

---

## Task 6 — schema API에 `primaryKey` 응답 추가

**Files:**
- Modify: `src/app/api/v1/tables/[table]/schema/route.ts`

- [ ] **Step 1: 응답 스키마 확장**

기존 응답:
```ts
return successResponse({ table, columns: result });
```

확장:
```ts
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
```

(`primaryKey`는 단일 PK일 때만 값, 복합/부재 시 null. `compositePk` 플래그는 UI에서 "편집 불가 이유"를 정확히 표시하기 위함.)

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 0.

- [ ] **Step 3: curl 통합 테스트 (기존 기능 회귀 확인)**

WSL2 빌드 + PM2 재시작 후 (또는 `npm run dev`):
```bash
# 로그인 쿠키 획득
curl -s -c /tmp/cookie -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"kimdooo@stylelucky4u.com","password":"Knp13579!yan"}' | head -c 200
# 스키마 조회
curl -s -b /tmp/cookie http://localhost:3000/api/v1/tables/folders/schema | head -c 500
```
Expected JSON에 `"primaryKey":{"column":"id","dataType":"uuid"}` 포함.

---

## Task 7 — POST API (INSERT)

**Files:**
- Modify: `src/app/api/v1/tables/[table]/route.ts`

- [ ] **Step 1: POST 핸들러 추가 (파일 하단)**

```ts
import { writeAuditLog as writeAuditLogDb } from "@/lib/audit-log-db";
import { checkTablePolicy, redactSensitiveValues } from "@/lib/db/table-policy";
import { coerceValue, CoercionError } from "@/lib/db/coerce";
import { isValidIdentifier, quoteIdent } from "@/lib/db/identifier";
import { runReadwrite } from "@/lib/pg/pool";
// (기존 import 유지)

interface ColumnAction {
  action: "set" | "null";
  value?: unknown;
}

/**
 * POST /api/v1/tables/[table]
 * Body: { values: { [column]: { action: "set"|"null", value?: any } } }
 * action="keep"인 컬럼은 클라이언트가 payload에서 제외 → DB default 적용.
 */
export const POST = withRole(
  ["ADMIN", "MANAGER"],
  async (request, user, context) => {
    const params = context?.params ? await context.params : {};
    const table = params.table;
    if (!table || !isValidIdentifier(table)) {
      return errorResponse("INVALID_TABLE", "유효하지 않은 테이블명", 400);
    }

    const policy = checkTablePolicy(table, "INSERT", user.role);
    if (!policy.allowed) {
      return errorResponse("OPERATION_DENIED", policy.reason!, 403);
    }

    let body: { values?: Record<string, ColumnAction> };
    try {
      body = await request.json();
    } catch {
      return errorResponse("INVALID_BODY", "JSON 파싱 실패", 400);
    }
    const valuesInput = body.values ?? {};

    // 컬럼 화이트리스트 (실 DB 컬럼 + 타입 메타)
    const { rows: colRows } = await runReadonly<{
      column_name: string;
      data_type: string;
    }>(
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1`,
      [table],
    );
    if (colRows.length === 0) {
      return errorResponse("NOT_FOUND", "테이블을 찾을 수 없음", 404);
    }
    const colTypeMap = new Map(colRows.map((r) => [r.column_name, r.data_type]));

    // payload 키 = 화이트리스트 ∩ action≠"keep" (keep은 클라이언트에서 이미 제외)
    const insertCols: string[] = [];
    const insertVals: unknown[] = [];
    const diff: Record<string, unknown> = {};
    try {
      for (const [col, act] of Object.entries(valuesInput)) {
        if (!colTypeMap.has(col)) {
          return errorResponse("INVALID_COLUMN", `알 수 없는 컬럼: ${col}`, 400);
        }
        if (act.action === "null") {
          insertCols.push(col);
          insertVals.push(null);
          diff[col] = null;
        } else if (act.action === "set") {
          const coerced = coerceValue(col, colTypeMap.get(col)!, act.value);
          insertCols.push(col);
          insertVals.push(coerced);
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

    if (insertCols.length === 0) {
      return errorResponse(
        "EMPTY_PAYLOAD",
        "INSERT할 값이 하나도 없습니다 (DB default만 사용 시 빈 레코드 삽입은 허용하지 않음)",
        400,
      );
    }

    const colsSql = insertCols.map(quoteIdent).join(", ");
    const placeholders = insertCols.map((_, i) => `$${i + 1}`).join(", ");
    const sql = `INSERT INTO ${quoteIdent(table)} (${colsSql}) VALUES (${placeholders}) RETURNING *`;

    try {
      const { rows } = await runReadwrite(sql, insertVals);
      writeAuditLogDb({
        timestamp: new Date().toISOString(),
        method: "POST",
        path: `/api/v1/tables/${table}`,
        ip: request.headers.get("x-forwarded-for") ?? "unknown",
        action: "TABLE_ROW_INSERT",
        detail: `${user.email} → ${table}: ${JSON.stringify(redactSensitiveValues(table, diff))}`,
      });
      return successResponse({ row: rows[0] });
    } catch (err) {
      return errorResponse(
        "QUERY_FAILED",
        err instanceof Error ? err.message : "INSERT 실패",
        500,
      );
    }
  },
);
```

- [ ] **Step 2: `writeAuditLog` (DB) 시그니처 확인 / 필요 시 확장**

`src/lib/audit-log-db.ts`를 Read로 확인해 `action` 필드가 string 자유형인지 enum인지 점검. enum이면 `TABLE_ROW_INSERT`/`TABLE_ROW_UPDATE`/`TABLE_ROW_DELETE` 3종 추가 필요. 스키마가 string 자유형이면 수정 불필요.

수정 시 예(스키마가 enum인 경우):
```ts
// src/lib/db/schema.ts (Drizzle) 또는 audit-log-db.ts 내부 타입
// action 문자열 목록에 TABLE_ROW_* 3종 추가
```

(구체 패치는 Step 2에서 파일 확인 후 결정.)

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 0.

---

## Task 8 — PATCH/DELETE API (신규 route)

**Files:**
- Create: `src/app/api/v1/tables/[table]/[pk]/route.ts`

- [ ] **Step 1: 파일 작성**

```ts
import { withRole, withAuth } from "@/lib/api-guard";
import { successResponse, errorResponse } from "@/lib/api-response";
import { runReadonly, runReadwrite } from "@/lib/pg/pool";
import { isValidIdentifier, quoteIdent } from "@/lib/db/identifier";
import { coerceValue, CoercionError } from "@/lib/db/coerce";
import { checkTablePolicy, redactSensitiveValues } from "@/lib/db/table-policy";
import { writeAuditLog as writeAuditLogDb } from "@/lib/audit-log-db";
import type { NextRequest } from "next/server";
import type { AccessTokenPayload } from "@/lib/jwt-v1";

interface ColumnAction {
  action: "set" | "null";
  value?: unknown;
}

async function introspect(table: string) {
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

  const { rows: pkRows } = await runReadonly<{
    column_name: string;
    data_type: string;
  }>(
    `SELECT kcu.column_name, c.data_type
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema    = kcu.table_schema
     JOIN information_schema.columns c
       ON c.table_schema = kcu.table_schema
      AND c.table_name = kcu.table_name
      AND c.column_name = kcu.column_name
     WHERE tc.constraint_type='PRIMARY KEY'
       AND tc.table_schema='public'
       AND tc.table_name=$1`,
    [table],
  );

  return {
    colTypeMap: new Map(cols.map((c) => [c.column_name, c.data_type])),
    pkColumn: pkRows.length === 1 ? pkRows[0]! : null,
    compositePk: pkRows.length > 1,
    noPk: pkRows.length === 0,
  };
}

/** PATCH — 행 부분 업데이트 (MANAGER+) */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ table: string; pk: string }> },
) {
  return withRole(
    ["ADMIN", "MANAGER"],
    async (req, user) => {
      const { table, pk } = await context.params;
      if (!isValidIdentifier(table)) {
        return errorResponse("INVALID_TABLE", "유효하지 않은 테이블명", 400);
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

      let body: { values?: Record<string, ColumnAction> };
      try {
        body = await req.json();
      } catch {
        return errorResponse("INVALID_BODY", "JSON 파싱 실패", 400);
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
        return errorResponse(
          "EMPTY_PAYLOAD",
          "변경된 컬럼이 없습니다",
          400,
        );
      }

      // PK 값 coerce
      let pkValue: unknown;
      try {
        pkValue = coerceValue(meta.pkColumn!.column_name, meta.pkColumn!.data_type, pk);
      } catch (err) {
        if (err instanceof CoercionError) {
          return errorResponse(
            "COERCE_FAILED",
            `PK: ${err.reason}`,
            400,
          );
        }
        throw err;
      }

      const setSql = setCols
        .map((c, i) => `${quoteIdent(c)} = $${i + 1}`)
        .join(", ");
      const pkPlaceholder = `$${setCols.length + 1}`;
      const sql = `UPDATE ${quoteIdent(table)} SET ${setSql} WHERE ${quoteIdent(meta.pkColumn!.column_name)} = ${pkPlaceholder} RETURNING *`;

      try {
        const { rows, rowCount } = await runReadwrite(sql, [...setVals, pkValue]);
        if (rowCount === 0) {
          return errorResponse("NOT_FOUND", "행을 찾을 수 없음", 404);
        }
        writeAuditLogDb({
          timestamp: new Date().toISOString(),
          method: "PATCH",
          path: `/api/v1/tables/${table}/${pk}`,
          ip: req.headers.get("x-forwarded-for") ?? "unknown",
          action: "TABLE_ROW_UPDATE",
          detail: `${user.email} → ${table}(pk=${pk}): ${JSON.stringify(redactSensitiveValues(table, diff))}`,
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
  )(request, { params: context.params as Promise<Record<string, string>> });
}

/** DELETE — ADMIN 전용 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ table: string; pk: string }> },
) {
  return withRole(
    ["ADMIN"],
    async (req, user) => {
      const { table, pk } = await context.params;
      if (!isValidIdentifier(table)) {
        return errorResponse("INVALID_TABLE", "유효하지 않은 테이블명", 400);
      }
      const policy = checkTablePolicy(table, "DELETE", user.role);
      if (!policy.allowed) {
        return errorResponse("OPERATION_DENIED", policy.reason!, 403);
      }
      const meta = await introspect(table);
      if (!meta) return errorResponse("NOT_FOUND", "테이블 없음", 404);
      if (meta.noPk) {
        return errorResponse("NO_PK_UNSUPPORTED", "PK 없는 테이블은 삭제 불가", 400);
      }
      if (meta.compositePk) {
        return errorResponse(
          "COMPOSITE_PK_UNSUPPORTED",
          "복합 PK 미지원",
          400,
        );
      }

      let pkValue: unknown;
      try {
        pkValue = coerceValue(meta.pkColumn!.column_name, meta.pkColumn!.data_type, pk);
      } catch (err) {
        if (err instanceof CoercionError) {
          return errorResponse("COERCE_FAILED", `PK: ${err.reason}`, 400);
        }
        throw err;
      }

      const sql = `DELETE FROM ${quoteIdent(table)} WHERE ${quoteIdent(meta.pkColumn!.column_name)} = $1`;
      try {
        const { rowCount } = await runReadwrite(sql, [pkValue]);
        if (rowCount === 0) {
          return errorResponse("NOT_FOUND", "행을 찾을 수 없음", 404);
        }
        writeAuditLogDb({
          timestamp: new Date().toISOString(),
          method: "DELETE",
          path: `/api/v1/tables/${table}/${pk}`,
          ip: req.headers.get("x-forwarded-for") ?? "unknown",
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
  )(request, { params: context.params as Promise<Record<string, string>> });
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 0.

- [ ] **Step 3: curl 통합 테스트 (핵심 5개)**

WSL2 배포 또는 로컬 `npm run dev` 이후:

```bash
# 로그인
curl -s -c /tmp/cookie -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"kimdooo@stylelucky4u.com","password":"Knp13579!yan"}' > /dev/null

# 1) INSERT 정상 (folders) — ADMIN이라 성공
curl -s -b /tmp/cookie -X POST http://localhost:3000/api/v1/tables/folders \
  -H "Content-Type: application/json" \
  -d '{"values":{"name":{"action":"set","value":"__14b_test__"},"owner_id":{"action":"set","value":"<실제 user UUID>"},"is_root":{"action":"set","value":false}}}'
# 기대: {"success":true,"data":{"row":{...}}}  — row.id 기록해두기

# 2) PATCH 정상
curl -s -b /tmp/cookie -X PATCH http://localhost:3000/api/v1/tables/folders/<row.id> \
  -H "Content-Type: application/json" \
  -d '{"values":{"name":{"action":"set","value":"__14b_renamed__"}}}'
# 기대: {"success":true,"data":{"row":{...name:"__14b_renamed__"}}}

# 3) 민감 테이블 차단 (users)
curl -s -b /tmp/cookie -X POST http://localhost:3000/api/v1/tables/users \
  -H "Content-Type: application/json" \
  -d '{"values":{"email":{"action":"set","value":"x@y.z"}}}'
# 기대: 403 OPERATION_DENIED

# 4) 인젝션 시도 — identifier 정규식 차단
curl -s -b /tmp/cookie -X POST "http://localhost:3000/api/v1/tables/folders;DROP" \
  -H "Content-Type: application/json" -d '{"values":{}}'
# 기대: 400 INVALID_TABLE

# 5) DELETE 정상 (행 정리)
curl -s -b /tmp/cookie -X DELETE http://localhost:3000/api/v1/tables/folders/<row.id>
# 기대: {"success":true,"data":{"deleted":true}}
```

감사 로그 확인:
```bash
curl -s -b /tmp/cookie "http://localhost:3000/api/v1/audit?limit=5" | head -c 500
# TABLE_ROW_INSERT/UPDATE/DELETE 각 1건씩 기대
```

- [ ] **Step 4: C3 커밋**

```bash
git add src/app/api/v1/tables
git commit -m "feat(api): Phase 14b — 테이블 CRUD API 3종 + 스키마 PK 확장

- POST /api/v1/tables/[table] (MANAGER+)
- PATCH /api/v1/tables/[table]/[pk] (MANAGER+)
- DELETE /api/v1/tables/[table]/[pk] (ADMIN only)
- schema API에 primaryKey, compositePk 필드 추가

보안:
- identifier 정규식 + DB 화이트리스트 + quoteIdent 3중 방어
- 값은 전부 \$1 파라미터 바인딩
- table-policy로 민감 테이블 차단 (users/api_keys/_prisma_migrations)
- edge_function_runs는 DELETE(ADMIN) only
- 모든 변경은 audit_logs 테이블에 영속 기록 (민감 테이블은 [REDACTED])"
```

---

## Task 9 — `RowFormModal` UI 신설

**Files:**
- Create: `src/components/table-editor/row-form-modal.tsx`

- [ ] **Step 1: 파일 작성**

내용(요지):
```tsx
"use client";

import { useState, useMemo, useEffect } from "react";

interface ColumnMeta {
  name: string;
  dataType: string;
  nullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
  ordinalPosition: number;
}

type Action = "set" | "null" | "keep";
interface CellState {
  action: Action;
  value: string;
}

interface RowFormModalProps {
  open: boolean;
  mode: "create" | "edit";
  table: string;
  columns: ColumnMeta[];
  initialRow?: Record<string, unknown>;
  primaryKey: { column: string; dataType: string } | null;
  onClose: () => void;
  onSubmitted: () => void;
}

function typeToInput(
  dataType: string,
): "text" | "number" | "checkbox" | "datetime-local" | "textarea" {
  const dt = dataType.toLowerCase();
  if (dt === "boolean") return "checkbox";
  if (
    dt === "integer" ||
    dt === "bigint" ||
    dt === "smallint" ||
    dt === "numeric" ||
    dt === "real" ||
    dt === "double precision" ||
    dt.startsWith("decimal")
  ) {
    return "number";
  }
  if (dt.startsWith("timestamp") || dt === "date") return "datetime-local";
  if (dt === "json" || dt === "jsonb" || dt === "text") return "textarea";
  return "text";
}

function defaultCellState(
  col: ColumnMeta,
  initial: unknown,
  mode: "create" | "edit",
): CellState {
  if (mode === "create") {
    return { action: "keep", value: "" };
  }
  // edit 모드: 현재 값 기준 "keep" (변경 없음)
  if (initial === null || initial === undefined) {
    return { action: "keep", value: "" };
  }
  const str =
    typeof initial === "object"
      ? JSON.stringify(initial)
      : typeof initial === "boolean"
        ? String(initial)
        : String(initial);
  return { action: "keep", value: str };
}

export function RowFormModal({
  open,
  mode,
  table,
  columns,
  initialRow,
  primaryKey,
  onClose,
  onSubmitted,
}: RowFormModalProps) {
  const [state, setState] = useState<Record<string, CellState>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const s: Record<string, CellState> = {};
    for (const col of columns) {
      s[col.name] = defaultCellState(col, initialRow?.[col.name], mode);
    }
    setState(s);
    setError(null);
  }, [open, columns, initialRow, mode]);

  const editable = useMemo(
    () =>
      columns.filter((c) => {
        // 편집 모드에서 PK는 비편집 (UPDATE 대상 제외)
        if (mode === "edit" && c.isPrimaryKey) return false;
        return true;
      }),
    [columns, mode],
  );

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const values: Record<string, { action: "set" | "null"; value?: unknown }> = {};
      for (const [col, st] of Object.entries(state)) {
        if (st.action === "keep") continue;
        if (st.action === "null") {
          values[col] = { action: "null" };
          continue;
        }
        const colMeta = columns.find((c) => c.name === col);
        const input = typeToInput(colMeta?.dataType ?? "text");
        if (input === "checkbox") {
          values[col] = { action: "set", value: st.value === "true" };
        } else if (input === "number") {
          values[col] = { action: "set", value: st.value };
        } else {
          values[col] = { action: "set", value: st.value };
        }
      }

      const url =
        mode === "create"
          ? `/api/v1/tables/${table}`
          : `/api/v1/tables/${table}/${encodeURIComponent(String(initialRow?.[primaryKey!.column]))}`;
      const method = mode === "create" ? "POST" : "PATCH";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) {
        throw new Error(body.error?.message ?? "요청 실패");
      }
      onSubmitted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "실패");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[min(720px,95vw)] max-h-[85vh] overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-6">
        <h2 className="mb-4 text-lg font-semibold text-zinc-100">
          {mode === "create" ? "행 추가" : "행 편집"} — <span className="font-mono">{table}</span>
        </h2>

        <div className="space-y-3">
          {editable.map((col) => {
            const st = state[col.name];
            if (!st) return null;
            const input = typeToInput(col.dataType);
            return (
              <div key={col.name} className="flex flex-col gap-1">
                <label className="flex items-center gap-2 text-xs text-zinc-400">
                  <span className="font-mono text-zinc-200">{col.name}</span>
                  <span className="text-zinc-500">{col.dataType}</span>
                  {col.isPrimaryKey && <span className="text-amber-400">PK</span>}
                  {!col.nullable && <span className="text-red-400">required</span>}
                  {col.defaultValue && (
                    <span className="text-zinc-600">default: {col.defaultValue}</span>
                  )}
                </label>
                <div className="flex items-center gap-2">
                  <select
                    value={st.action}
                    onChange={(e) =>
                      setState((prev) => ({
                        ...prev,
                        [col.name]: { ...st, action: e.target.value as Action },
                      }))
                    }
                    className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200"
                  >
                    <option value="keep">유지</option>
                    <option value="set">값 입력</option>
                    {col.nullable && <option value="null">NULL</option>}
                  </select>
                  {st.action === "set" && input === "checkbox" && (
                    <select
                      value={st.value || "false"}
                      onChange={(e) =>
                        setState((p) => ({
                          ...p,
                          [col.name]: { ...st, value: e.target.value },
                        }))
                      }
                      className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200"
                    >
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                  )}
                  {st.action === "set" && input !== "checkbox" && input !== "textarea" && (
                    <input
                      type={input}
                      value={st.value}
                      onChange={(e) =>
                        setState((p) => ({
                          ...p,
                          [col.name]: { ...st, value: e.target.value },
                        }))
                      }
                      className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200"
                    />
                  )}
                  {st.action === "set" && input === "textarea" && (
                    <textarea
                      value={st.value}
                      onChange={(e) =>
                        setState((p) => ({
                          ...p,
                          [col.name]: { ...st, value: e.target.value },
                        }))
                      }
                      rows={3}
                      className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-200"
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {error && <div className="mt-3 text-sm text-red-400">오류: {error}</div>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            취소
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="rounded bg-amber-500 px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-40"
          >
            {submitting ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 0.

---

## Task 10 — `TableDataGrid` 행 액션 버튼 추가

**Files:**
- Modify: `src/components/table-editor/table-data-grid.tsx`

- [ ] **Step 1: Props 확장 + 행별 액션 컬럼 추가**

기존 `TableDataGridProps` 확장:
```ts
interface TableDataGridProps {
  table: string;
  userRole?: "ADMIN" | "MANAGER" | "USER";
  policy?: { canUpdate: boolean; canDelete: boolean };
  onEditRow?: (row: Record<string, unknown>) => void;
  onDeleteRow?: (row: Record<string, unknown>) => void;
  refreshToken?: number;  // 부모에서 증가 시 재fetch
}
```

`tanstackColumns`에 첫 컬럼으로 action 셀 삽입(조건부):
```ts
const actionColumn: ColumnDef<Record<string, unknown>> | null = (() => {
  if (!props.policy?.canUpdate && !props.policy?.canDelete) return null;
  return {
    id: "_actions",
    header: () => <span className="text-zinc-500">액션</span>,
    cell: ({ row }) => (
      <div className="flex gap-1">
        {props.policy?.canUpdate && (
          <button
            type="button"
            onClick={() => props.onEditRow?.(row.original)}
            className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-300 hover:bg-zinc-800"
          >편집</button>
        )}
        {props.policy?.canDelete && (
          <button
            type="button"
            onClick={() => props.onDeleteRow?.(row.original)}
            className="rounded border border-red-900 px-1.5 py-0.5 text-[10px] text-red-300 hover:bg-red-950"
          >삭제</button>
        )}
      </div>
    ),
  };
})();

const tanstackColumnsWithActions = useMemo(
  () => (actionColumn ? [actionColumn, ...tanstackColumns] : tanstackColumns),
  [actionColumn, tanstackColumns],
);
```

(React 주의: `actionColumn` 계산은 `useMemo`로 감싸기. props 구조분해 또는 직접 참조.)

`refreshToken` effect:
```ts
useEffect(() => {
  if (props.refreshToken !== undefined) {
    fetchRows();
  }
}, [props.refreshToken, fetchRows]);
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 0.

---

## Task 11 — `/tables/[table]` 페이지에 CTA + 모달 연결

**Files:**
- Modify: `src/app/(protected)/tables/[table]/page.tsx`

- [ ] **Step 1: 클라이언트 상태 + 데이터 로드**

```tsx
"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Table2 } from "lucide-react";
import { TableDataGrid } from "@/components/table-editor/table-data-grid";
import { RowFormModal } from "@/components/table-editor/row-form-modal";

interface ColumnMeta {
  name: string;
  dataType: string;
  nullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
  ordinalPosition: number;
}

export default function TableDetailPage({
  params,
}: {
  params: Promise<{ table: string }>;
}) {
  const { table } = use(params);

  const [columns, setColumns] = useState<ColumnMeta[]>([]);
  const [primaryKey, setPrimaryKey] = useState<{
    column: string;
    dataType: string;
  } | null>(null);
  const [compositePk, setCompositePk] = useState(false);
  const [userRole, setUserRole] = useState<"ADMIN" | "MANAGER" | "USER">(
    "USER",
  );
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [editingRow, setEditingRow] = useState<Record<string, unknown> | null>(
    null,
  );
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    fetch(`/api/v1/tables/${table}/schema`)
      .then((r) => r.json())
      .then((body) => {
        if (body.success) {
          setColumns(body.data.columns);
          setPrimaryKey(body.data.primaryKey);
          setCompositePk(body.data.compositePk);
        }
      });
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((body) => {
        if (body.success) setUserRole(body.data.role);
      });
  }, [table]);

  // policy: 일단 클라이언트 힌트만. 서버가 최종 거부 권한.
  const FULL_BLOCK = ["users", "api_keys", "_prisma_migrations"];
  const DELETE_ONLY = ["edge_function_runs"];
  const blocked = FULL_BLOCK.includes(table);
  const deleteOnly = DELETE_ONLY.includes(table);
  const hasPk = primaryKey !== null && !compositePk;

  const canInsert =
    !blocked && !deleteOnly && hasPk &&
    (userRole === "ADMIN" || userRole === "MANAGER");
  const canUpdate =
    !blocked && !deleteOnly && hasPk &&
    (userRole === "ADMIN" || userRole === "MANAGER");
  const canDelete = !blocked && hasPk && userRole === "ADMIN";

  const handleDelete = useCallback(
    async (row: Record<string, unknown>) => {
      if (!primaryKey) return;
      const pkVal = row[primaryKey.column];
      if (!confirm(`${table}(pk=${pkVal}) 행을 삭제합니다. 계속하시겠습니까?`))
        return;
      const res = await fetch(
        `/api/v1/tables/${table}/${encodeURIComponent(String(pkVal))}`,
        { method: "DELETE" },
      );
      const body = await res.json();
      if (!res.ok || !body.success) {
        alert(`삭제 실패: ${body.error?.message ?? "오류"}`);
        return;
      }
      setRefreshToken((t) => t + 1);
    },
    [table, primaryKey],
  );

  return (
    <div className="flex h-full flex-col p-6">
      <header className="mb-4 flex items-center gap-3">
        <Link
          href="/tables"
          className="flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-100"
        >
          <ArrowLeft size={14} /> 목록
        </Link>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-zinc-100">
          <Table2 size={18} />
          <span className="font-mono">{table}</span>
        </h1>
        <div className="ml-auto flex items-center gap-2">
          {blocked && (
            <span className="text-xs text-zinc-500">
              Table Editor에서 편집 불가 (전용 페이지 사용)
            </span>
          )}
          {!blocked && !hasPk && (
            <span className="text-xs text-amber-400">
              {compositePk
                ? "복합 PK 테이블 — Phase 14b 미지원"
                : "PK 없는 테이블 — 편집 불가"}
            </span>
          )}
          {canInsert && (
            <button
              type="button"
              onClick={() => {
                setEditingRow(null);
                setModalMode("create");
              }}
              className="flex items-center gap-1 rounded bg-amber-500 px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-400"
            >
              <Plus size={14} /> 행 추가
            </button>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1">
        <TableDataGrid
          table={table}
          userRole={userRole}
          policy={{ canUpdate, canDelete }}
          refreshToken={refreshToken}
          onEditRow={(row) => {
            setEditingRow(row);
            setModalMode("edit");
          }}
          onDeleteRow={handleDelete}
        />
      </div>

      <RowFormModal
        open={modalMode !== null}
        mode={modalMode ?? "create"}
        table={table}
        columns={columns}
        initialRow={editingRow ?? undefined}
        primaryKey={primaryKey}
        onClose={() => {
          setModalMode(null);
          setEditingRow(null);
        }}
        onSubmitted={() => setRefreshToken((t) => t + 1)}
      />
    </div>
  );
}
```

- [ ] **Step 2: `/api/auth/me` 응답 구조 확인**

`src/app/api/auth/me/route.ts`를 Read로 확인해 응답이 `{data: {role: "ADMIN"|...}}` 구조인지 검증. 다르면 페이지 코드의 role 파싱을 실제 필드 경로에 맞춤.

- [ ] **Step 3: 타입 체크 + dev 서버 스모크**

```bash
npx tsc --noEmit
```
Expected: 에러 0.

가능하면 `npm run dev` (Windows에서 가능) 후 브라우저로:
- http://localhost:3000/tables/folders — "행 추가" 버튼 보임
- http://localhost:3000/tables/users — "편집 불가" 메시지

- [ ] **Step 4: C4 커밋**

```bash
git add src/components/table-editor/ src/app/(protected)/tables/[table]/page.tsx
git commit -m "feat(ui): Phase 14b — 행 추가/편집/삭제 UI

- RowFormModal: 3상태 입력(set/null/keep), 타입별 컨트롤
- TableDataGrid: 행별 편집/삭제 액션 버튼, policy 기반 조건부 노출
- 테이블 상세 페이지: 행 추가 CTA, 모달 연결, 삭제 confirm, refreshToken 재조회

클라이언트 policy는 UX 힌트이며 서버(table-policy)가 최종 거부 권한."
```

---

## Task 12 — WSL2 빌드 + 실배포 E2E + 문서 + 세션 종료 (C5)

**Files:**
- Modify: `docs/guides/tables-e2e-manual.md`
- Modify: `docs/status/current.md`
- Modify: `docs/logs/2026-04.md`
- Modify: `docs/logs/journal-2026-04-12.md`
- Create: `docs/handover/260412-session19-phase-14b.md`
- Modify: `docs/handover/_index.md`
- Modify: `docs/handover/next-dev-prompt.md`

- [ ] **Step 1: WSL2 빌드 + PM2 재시작**

```bash
wsl -d Ubuntu -e bash -c "source ~/.nvm/nvm.sh && cd ~/dashboard && rm -rf src .next && cp -r /mnt/e/00_develop/260406_luckystyle4u_server/src . && cp /mnt/e/00_develop/260406_luckystyle4u_server/next.config.ts /mnt/e/00_develop/260406_luckystyle4u_server/tsconfig.json /mnt/e/00_develop/260406_luckystyle4u_server/tailwind.config.ts /mnt/e/00_develop/260406_luckystyle4u_server/postcss.config.mjs /mnt/e/00_develop/260406_luckystyle4u_server/package.json . && npm install && npm run build && pm2 restart dashboard"
```
Expected: `Ready in XXXms`, PM2 `online`.

- [ ] **Step 2: 프로덕션 smoke**

```bash
curl -s -c /tmp/cookie -X POST https://stylelucky4u.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"kimdooo@stylelucky4u.com","password":"Knp13579!yan"}' > /dev/null
curl -s -b /tmp/cookie https://stylelucky4u.com/api/v1/tables/folders/schema | head -c 300
```
Expected: primaryKey 필드 포함된 JSON.

- [ ] **Step 3: 브라우저 수동 E2E (프로덕션)**

1. `https://stylelucky4u.com/login` 로그인
2. `/tables/folders` 접근 → "행 추가" 클릭 → 폼에 이름/owner_id/is_root 입력 → 저장 → 그리드에 새 행 반영
3. 그 행의 "편집" 클릭 → name 변경 → 저장 → 반영
4. "삭제" 클릭 → confirm → 행 사라짐
5. `/audit` 페이지에서 `TABLE_ROW_INSERT`/`UPDATE`/`DELETE` 각 1건 확인
6. `/tables/users` 접근 → "편집 불가" 메시지 확인

- [ ] **Step 4: `docs/guides/tables-e2e-manual.md`에 S8~S11 시나리오 추가**

기존 파일 말미에 추가:
```markdown
## S8. 행 추가 (MANAGER+)
1. /tables/folders → "행 추가" 클릭
2. name: "시나리오 S8", owner_id: 본인 UUID, is_root: false
3. 저장 → 그리드 최상단에 새 행

## S9. 행 편집 (MANAGER+)
1. S8 행의 "편집" 클릭
2. name만 "S9 renamed"로 변경 → 저장
3. 그리드 반영 확인

## S10. 행 삭제 (ADMIN only)
1. S9 행의 "삭제" 클릭 → confirm
2. 행 사라짐
3. /audit 페이지에 TABLE_ROW_DELETE 기록 확인

## S11. 차단 테이블 (users / api_keys)
1. /tables/users 접근
2. "행 추가" 버튼 미표시, "편집 불가" 메시지 표시
```

- [ ] **Step 5: 세션 종료 4단계 문서 갱신**

1. `docs/status/current.md` 세션 요약표에 **세션 19** 행 추가:
   ```markdown
   | 19 | 2026-04-12 | Phase 14b Table Editor CRUD (app_readwrite 롤 + CRUD API 3종 + RowFormModal + policy 기반 차단) | [2026-04](../logs/2026-04.md) | [인수인계서](../handover/260412-session19-phase-14b.md) |
   ```
   및 체크박스 `- [x] Phase 14b: Table Editor CRUD` 표시.

2. `docs/logs/2026-04.md`에 세션 19 상세 블록 추가 (작업 요약 + 주요 커밋 5건 + 검증 결과 + 알려진 이슈).

3. `docs/logs/journal-2026-04-12.md`에 Phase 14b 진행 저널 append.

4. `docs/handover/260412-session19-phase-14b.md` 신규 인수인계서 작성. 섹션:
   - 작업 요약 / 대화 다이제스트 / 의사결정 요약 / 수정·신규 파일 / 검증 결과 / 터치하지 않은 영역 / 알려진 이슈 / 다음 작업 제안(Phase 14c 낙관적 잠금 + 인라인 편집)

5. `docs/handover/_index.md`에 세션 19 링크 추가.

6. `docs/handover/next-dev-prompt.md`를 Phase 14c (인라인 편집 + 낙관적 잠금 + 복합 PK 지원) 프롬프트로 갱신하거나 "Phase 14b 완료" 상태로 초기화.

- [ ] **Step 6: C5 커밋 + 푸시**

```bash
git add docs/
git commit -m "docs(14b): Phase 14b 완료 — E2E 가이드 + 세션 19 인수인계

- tables-e2e-manual.md S8~S11 (행 추가/편집/삭제/차단 테이블)
- current.md 세션 19 요약행 + Phase 14b 체크박스
- logs/2026-04.md 세션 19 상세
- logs/journal-2026-04-12.md 저널 append
- handover/260412-session19-phase-14b.md 신규
- handover/_index.md + next-dev-prompt.md 갱신"

git push origin main
```
Expected: 5 커밋 일괄 푸시.

---

## 전체 검증 체크리스트 (DOD)

- [ ] 일반 테이블(folders)에 MANAGER 계정으로 INSERT/UPDATE 성공
- [ ] VIEWER(USER) 계정은 UI 편집 버튼 비활성 + API 호출 시 403
- [ ] `users`/`api_keys`/`_prisma_migrations` 테이블은 MANAGER도 UI/API 모두 차단
- [ ] DELETE는 ADMIN만 가능, confirm 후 실행
- [ ] 부적절 식별자 주입(`"; DROP TABLE ...`) → 400 (DB 쿼리 도달 전 차단)
- [ ] 모든 변경에 대한 감사 로그 1건씩 DB 기록
- [ ] PM2 로그에 `SET LOCAL ROLE app_readwrite` 또는 관련 실행 흔적 확인
- [ ] WSL2 `npm run build` 통과 + 프로덕션 curl smoke 통과
- [ ] 브라우저 E2E S8~S11 전 시나리오 통과
- [ ] 세션 종료 4단계 완료 (current.md / logs / handover / next-dev-prompt)

---

## 셀프 리뷰 결과

**1. 스펙 커버리지 (ADR 각 섹션 ↔ Task 매핑)**
- D1 PK 감지 → Task 6/8 (schema primaryKey + introspect.noPk/compositePk)
- D2 coerce → Task 3 + 7/8 사용
- D3 파라미터 바인딩 → Task 2 (identifier) + 7/8 구현
- D4 감사 로그 → Task 4 (redactSensitiveValues) + 7/8 writeAuditLogDb 호출
- D5 권한 매트릭스 → Task 4 (table-policy) + 7/8 checkTablePolicy
- UI 범위(모달 집중) → Task 9/10/11
- 롤 부재 fail-closed → Task 5
- 3상태 입력 → Task 9 (RowFormModal) + Task 7/8 payload 파싱
- 보안 체크리스트 → Task 12 DOD

**2. 플레이스홀더 스캔**: "TBD"/"TODO"/"이후 채움" 없음. Step 2(Task 7)의 audit-log-db 시그니처 확인 및 Step 2(Task 11)의 `/api/auth/me` 응답 구조 확인은 **실행 중 실파일을 Read해 결정하는 의도적 검증 단계**로, 플레이스홀더가 아님.

**3. 타입 일관성**: `ColumnAction`/`CellState`/`PolicyDecision` 등 Task 간 재사용 타입은 Task 7에서 한 번 정의, 이후 Task에서 동일 이름·필드 사용. `writeAuditLog as writeAuditLogDb` 앨리어싱도 Task 7/8 공통.

---

## 실행 핸드오프

Plan complete and saved to `docs/research/plans/phase-14b-table-editor-crud-plan.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — 각 Task마다 신선한 서브에이전트 발사, 태스크 사이 리뷰, 빠른 이터레이션.
2. **Inline Execution** — 현 세션에서 `executing-plans`로 배치 실행, 체크포인트 단위 리뷰.

사용자 지시에 따라 **이 세션은 계획서 작성으로 종료**합니다. 이후 세션에서 위 두 옵션 중 선택해 실행 착수.
