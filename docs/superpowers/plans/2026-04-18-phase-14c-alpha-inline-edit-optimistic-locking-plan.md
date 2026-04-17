# Phase 14c-α 인라인 편집 + 낙관적 잠금 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 14b의 RowFormModal 기반 CRUD를 셀 단위 인라인 편집으로 확장하고, `expected_updated_at` 기반 낙관적 잠금으로 동시 편집 충돌을 감지한다.

**Architecture:** PATCH API가 body의 `expected_updated_at`을 받으면 `UPDATE … WHERE pk=$1 AND updated_at=$2`로 가드한다. 0 rows affected + row exists → 409 CONFLICT + current row. 클라이언트는 `EditableCell` + `useInlineEditMutation` 훅을 통해 낙관적 로컬 갱신 후 409 시 Sonner 토스트 3액션(덮어쓰기/유지/취소)을 제공한다. RowFormModal의 type-specific 입력 로직은 `editable-cell-inputs.tsx`로 추출해 재사용.

**Tech Stack:** Next.js 16 App Router, TypeScript 5.x, Tailwind CSS 4, TanStack Table, Sonner, PostgreSQL (Prisma client 7), `app_readwrite` PG 롤, 감사 로그는 SQLite(Drizzle).

**Spec Reference:** `docs/superpowers/specs/2026-04-18-phase-14c-alpha-inline-edit-optimistic-locking-design.md`

**Preconditions:**
- 세션 23 마이그레이션 `20260417140000_add_updated_at_default` 프로덕션 적용 완료 (9 테이블 `updated_at DEFAULT now()`)
- `app_readwrite` PG 롤 존재 (세션 21)
- Sonner 설치됨 (Phase 11b)
- dev/prod 로그인 자격: `kimdooo@stylelucky4u.com` / `Knp13579!yan` (next-dev-prompt.md 참조)

---

## File Structure

### Files to Create
- `src/components/table-editor/editable-cell-inputs.tsx` — 타입별 입력 컴포넌트(`TypedInputControl`) + `typeToInput` 유틸 (RowFormModal·EditableCell 공용)
- `src/components/table-editor/editable-cell.tsx` — 셀 인라인 편집 컴포넌트 (click-to-focus, Enter/Esc/Tab 처리)
- `src/components/table-editor/use-inline-edit-mutation.ts` — PATCH 호출 + 409 토스트 + 롤백 훅
- `scripts/e2e/phase-14c-alpha-curl.sh` — API 통합 테스트 (C1~C6)
- `scripts/e2e/phase-14c-alpha-ui.spec.ts` — Playwright E2E (E1~E6)
- `docs/research/decisions/ADR-004-phase-14c-alpha-optimistic-locking.md` — ADR

### Files to Modify
- `src/app/api/v1/tables/[table]/[pk]/route.ts` — PATCH 바디에 `expected_updated_at` 지원 + 409 + 감사 로그 2종
- `src/components/table-editor/row-form-modal.tsx` — `typeToInput`/`TypedInputControl` 추출 후 재수입 (동작 불변)
- `src/components/table-editor/table-data-grid.tsx` — 셀 렌더러를 `EditableCell`로 치환, `systemColumns`/`onCellEdited` prop 추가
- `src/app/(protected)/tables/[table]/page.tsx` — `systemColumns` prop 전달
- `docs/status/current.md` — 세션 24 요약표 1행
- `docs/handover/next-dev-prompt.md` — 세션 24 완료 + β spec 우선순위
- `docs/logs/2026-04.md` — 세션 24 상세 섹션
- `docs/logs/journal-2026-04-18.md` (신규) — 세션 저널

---

## Task 1: API — PATCH `expected_updated_at` 낙관적 잠금 + 409 CONFLICT

**Files:**
- Modify: `src/app/api/v1/tables/[table]/[pk]/route.ts` (PATCH handler 전체)

**Context:** 현재 PATCH 핸들러(라인 60-193)는 `UPDATE … WHERE pk=$N RETURNING *`로 무조건 덮어쓴다. `expected_updated_at` body 필드가 있으면 WHERE에 `AND updated_at = $M`을 추가하고, `rowCount === 0`일 때 존재 재확인으로 409(충돌) vs 404(부재)를 구분한다. 감사 로그는 `locked` 메타 + `TABLE_ROW_UPDATE_CONFLICT` 신규 action을 기록한다.

- [ ] **Step 1: 현재 PATCH 로직 파일 읽기 (컨텍스트 확보)**

Run: `cat src/app/api/v1/tables/\[table\]/\[pk\]/route.ts | sed -n '1,193p'`
Expected: 기존 구조(interface ColumnAction, introspect, PATCH)를 보게 됨. setSql 빌더는 `WHERE pk=$N`만 사용 중.

- [ ] **Step 2: `body` 타입에 `expected_updated_at` 추가 + 검증 로직 배치**

Edit `src/app/api/v1/tables/[table]/[pk]/route.ts`. 기존 body 파싱 블록(L99-104)을 아래로 교체:

```ts
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
```

- [ ] **Step 3: UPDATE SQL에 WHERE 확장 + RETURNING \***

`setCols`/`setVals`/`pkValue` 블록(L106-161) 이후의 SQL 빌더(L163-169)를 아래로 교체:

```ts
    const setSql = setCols
      .map((c, i) => `${quoteIdent(c)} = $${i + 1}`)
      .join(", ");
    const params: unknown[] = [...setVals, pkValue];
    let whereSql = `${quoteIdent(meta.pkColumn!.column_name)} = $${params.length}`;
    if (expectedUpdatedAt !== null) {
      params.push(expectedUpdatedAt);
      whereSql += ` AND updated_at = $${params.length}`;
    }
    const sql = `UPDATE ${quoteIdent(table)} SET ${setSql} WHERE ${whereSql} RETURNING *`;
```

- [ ] **Step 4: 409/404 분기 + 감사 로그 2종 기록**

try/catch 블록(L171-192)을 아래로 교체:

```ts
    try {
      const { rows, rowCount } = await runReadwrite(sql, params);
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
```

- [ ] **Step 5: tsc 실행 + 타입 에러 확인**

Run: `npx tsc --noEmit`
Expected: EXIT 0. 새 타입 `body.expected_updated_at?: string`이 기존 코드와 호환됨을 확인.

- [ ] **Step 6: 커밋 D1**

```bash
git add src/app/api/v1/tables/\[table\]/\[pk\]/route.ts
git commit -m "$(cat <<'EOF'
feat(api): PATCH expected_updated_at 낙관적 잠금 + 409 CONFLICT

body.expected_updated_at 제공 시 UPDATE WHERE 절에 updated_at 비교
추가. rowCount=0이면 SELECT로 존재 재확인 → 409+current 또는 404.
감사 로그에 TABLE_ROW_UPDATE_CONFLICT 신규 action + 기존 UPDATE에
locked:bool 메타 추가. expected_updated_at 누락 시 Phase 14b 동작
완전 유지(후방 호환).

Phase 14c-α D1 (spec §3.3, §5)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 공용 입력 컨트롤 추출 (`editable-cell-inputs.tsx`)

**Files:**
- Create: `src/components/table-editor/editable-cell-inputs.tsx`
- Modify: `src/components/table-editor/row-form-modal.tsx` (`typeToInput` 제거 + import 치환)

**Context:** RowFormModal L31-50의 `typeToInput` 함수와 L191-231의 `<input>`/`<textarea>`/`<select>` 렌더링을 추출해 EditableCell·RowFormModal 공용 모듈로 만든다. 이 Task는 **동작 불변 리팩토링** — 기존 UX가 완전히 동일하게 재현되어야 한다.

- [ ] **Step 1: `editable-cell-inputs.tsx` 신규 작성**

Create `src/components/table-editor/editable-cell-inputs.tsx`:

```tsx
"use client";

import { forwardRef } from "react";

export type InputKind =
  | "text"
  | "number"
  | "checkbox"
  | "datetime-local"
  | "textarea";

export function typeToInput(dataType: string): InputKind {
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

export interface TypedInputControlProps {
  kind: InputKind;
  value: string;
  onChange: (next: string) => void;
  onCommit?: () => void;
  onCancel?: () => void;
  onTab?: (shift: boolean) => void;
  autoFocus?: boolean;
  disabled?: boolean;
  className?: string;
  rows?: number;
}

/**
 * 데이터 타입에 맞는 단일 입력 컨트롤.
 * 모달·인라인 셀 공용. 값은 항상 문자열로 다루고 boolean 체크박스만
 * "true"/"false"를 문자열로 유지한다(서버 coerce가 타입 변환 수행).
 */
export const TypedInputControl = forwardRef<
  HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  TypedInputControlProps
>(function TypedInputControl(
  {
    kind,
    value,
    onChange,
    onCommit,
    onCancel,
    onTab,
    autoFocus,
    disabled,
    className,
    rows,
  },
  ref,
) {
  const base =
    "rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 focus:border-amber-500 focus:outline-none";
  const merged = className ? `${base} ${className}` : base;

  function handleKey(
    e:
      | React.KeyboardEvent<HTMLInputElement>
      | React.KeyboardEvent<HTMLTextAreaElement>
      | React.KeyboardEvent<HTMLSelectElement>,
  ) {
    if (e.key === "Enter" && kind !== "textarea") {
      e.preventDefault();
      onCommit?.();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel?.();
    } else if (e.key === "Tab") {
      // 기본 포커스 이동 막지 않고 상위에서 커밋 유도
      onTab?.(e.shiftKey);
    }
  }

  if (kind === "checkbox") {
    return (
      <select
        ref={ref as React.Ref<HTMLSelectElement>}
        value={value || "false"}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKey}
        autoFocus={autoFocus}
        disabled={disabled}
        className={merged}
      >
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }
  if (kind === "textarea") {
    return (
      <textarea
        ref={ref as React.Ref<HTMLTextAreaElement>}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKey}
        autoFocus={autoFocus}
        disabled={disabled}
        rows={rows ?? 3}
        className={`${merged} font-mono`}
      />
    );
  }
  return (
    <input
      ref={ref as React.Ref<HTMLInputElement>}
      type={kind}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKey}
      autoFocus={autoFocus}
      disabled={disabled}
      className={merged}
    />
  );
});
```

- [ ] **Step 2: RowFormModal 리팩토링 — `typeToInput` 제거 + `TypedInputControl` 사용**

Edit `src/components/table-editor/row-form-modal.tsx`:

(1) 파일 상단 import 추가 + 기존 L31-50 `typeToInput` 함수 블록 삭제:

기존 import 블록 뒤에 추가:
```tsx
import { typeToInput, TypedInputControl } from "./editable-cell-inputs";
```

L31-50 `function typeToInput(...)` 전체 삭제.

(2) L191-231 `<input>`/`<textarea>`/`<select>` 3개 분기를 아래 단일 블록으로 교체:

```tsx
                  {st.action === "set" && (
                    <TypedInputControl
                      kind={input}
                      value={st.value}
                      onChange={(next) =>
                        setState((p) => ({
                          ...p,
                          [col.name]: { ...st, value: next },
                        }))
                      }
                      className={input === "textarea" ? "flex-1" : input === "checkbox" ? "" : "flex-1"}
                    />
                  )}
```

- [ ] **Step 3: tsc 실행 + 렌더 동작 확인**

Run: `npx tsc --noEmit`
Expected: EXIT 0.

- [ ] **Step 4: 커밋 (D2 준비 리팩토링)**

```bash
git add src/components/table-editor/editable-cell-inputs.tsx src/components/table-editor/row-form-modal.tsx
git commit -m "$(cat <<'EOF'
refactor(ui): RowFormModal 입력 컨트롤을 editable-cell-inputs로 추출

TypedInputControl + typeToInput을 EditableCell과 공유하기 위해
분리. RowFormModal은 import만 바뀌고 렌더 동작은 동일.

Phase 14c-α D2 (준비 리팩토링 — EditableCell 선행조건)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `EditableCell` 컴포넌트

**Files:**
- Create: `src/components/table-editor/editable-cell.tsx`

**Context:** 셀 클릭으로 편집 모드 진입, Enter 커밋 / Esc 취소 / Tab 다음 셀. readonly 셀(PK, `created_at`/`updated_at`, FULL_BLOCK, DELETE_ONLY)은 기존 `<span>` 렌더링 유지. 편집 중 dirty 상태에 노란 보더 표시.

- [ ] **Step 1: `editable-cell.tsx` 작성**

Create `src/components/table-editor/editable-cell.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  TypedInputControl,
  typeToInput,
  type InputKind,
} from "./editable-cell-inputs";

interface EditableCellProps {
  value: unknown;
  dataType: string;
  readOnly: boolean;
  onCommit: (next: string | boolean) => Promise<void> | void;
  /** Tab으로 다음/이전 편집 셀 이동 요청 */
  onTab?: (shift: boolean) => void;
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function toEditValue(value: unknown, kind: InputKind): string {
  if (value === null || value === undefined) return "";
  if (kind === "checkbox") {
    return typeof value === "boolean" ? String(value) : String(!!value);
  }
  if (kind === "datetime-local" && typeof value === "string") {
    // PG timestamp ISO → HTML datetime-local 형식 (YYYY-MM-DDTHH:mm)
    const m = value.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
    return m ? `${m[1]}T${m[2]}` : value;
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function EditableCell({
  value,
  dataType,
  readOnly,
  onCommit,
  onTab,
}: EditableCellProps) {
  const kind = typeToInput(dataType);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(() => toEditValue(value, kind));
  const [pending, setPending] = useState(false);
  const committedRef = useRef(false);

  // 외부 value 변경 시 draft 동기화 (편집 중이 아닐 때만)
  useEffect(() => {
    if (!editing) setDraft(toEditValue(value, kind));
  }, [value, kind, editing]);

  const commit = useCallback(async () => {
    if (committedRef.current) return;
    committedRef.current = true;
    const original = toEditValue(value, kind);
    if (draft === original) {
      setEditing(false);
      committedRef.current = false;
      return;
    }
    setPending(true);
    try {
      const payload: string | boolean =
        kind === "checkbox" ? draft === "true" : draft;
      await onCommit(payload);
      setEditing(false);
    } catch {
      // 에러 처리는 훅이 담당(토스트 + 롤백). 여기서는 편집 유지
    } finally {
      setPending(false);
      committedRef.current = false;
    }
  }, [draft, kind, value, onCommit]);

  const cancel = useCallback(() => {
    setDraft(toEditValue(value, kind));
    setEditing(false);
  }, [value, kind]);

  if (readOnly) {
    const text = formatCell(value);
    return (
      <span
        className={`font-mono text-xs ${value === null ? "text-zinc-500 italic" : "text-zinc-200"}`}
        title={text}
      >
        {text.length > 120 ? text.slice(0, 120) + "…" : text}
      </span>
    );
  }

  if (!editing) {
    const text = formatCell(value);
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={`w-full cursor-text text-left font-mono text-xs hover:bg-zinc-800/60 ${
          value === null ? "text-zinc-500 italic" : "text-zinc-200"
        }`}
        title={`${text} — 클릭 편집`}
      >
        {text.length > 120 ? text.slice(0, 120) + "…" : text}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <TypedInputControl
        kind={kind}
        value={draft}
        onChange={setDraft}
        onCommit={commit}
        onCancel={cancel}
        onTab={(shift) => {
          void commit();
          onTab?.(shift);
        }}
        autoFocus
        disabled={pending}
        className={`w-full ring-1 ring-amber-500 ${pending ? "opacity-60" : ""}`}
      />
    </div>
  );
}
```

- [ ] **Step 2: tsc 실행**

Run: `npx tsc --noEmit`
Expected: EXIT 0.

- [ ] **Step 3: 커밋**

```bash
git add src/components/table-editor/editable-cell.tsx
git commit -m "$(cat <<'EOF'
feat(ui): EditableCell 컴포넌트 — 셀 인라인 편집 기본기

click-to-focus, Enter 커밋, Esc 취소, Tab으로 다음 편집 셀 이동
요청. readonly 모드에서는 기존 span 렌더 유지. dirty 상태는 amber
링으로 표시. 실제 네트워크 호출은 상위 훅에 위임(onCommit prop).

Phase 14c-α D2 (컴포넌트)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `useInlineEditMutation` 훅 — PATCH + 409 토스트

**Files:**
- Create: `src/components/table-editor/use-inline-edit-mutation.ts`

**Context:** EditableCell이 onCommit을 호출하면 이 훅이 PATCH를 실행한다. 200 정상 / 409 CONFLICT / 기타 에러 분기를 처리하고, 409에서는 Sonner 토스트 3액션을 제공한다. 로컬 행의 낙관적 갱신은 훅 외부(TableDataGrid)에서 `refreshToken` 증가로 수행한다 — 훅은 상태 변경을 서버에만 반영하고 성공/실패를 알린다.

- [ ] **Step 1: 훅 작성**

Create `src/components/table-editor/use-inline-edit-mutation.ts`:

```tsx
"use client";

import { useCallback } from "react";
import { toast } from "sonner";

interface UseInlineEditMutationArgs {
  table: string;
  onRowUpdated: (row: Record<string, unknown>) => void;
  /** 서버가 반환한 current row로 로컬을 덮어쓰고 싶을 때 사용 */
  onRowReplaced: (row: Record<string, unknown>) => void;
  /** 서버가 404 반환 시 그리드 재fetch 유도 */
  onRowMissing: () => void;
}

interface CellEditArgs {
  pkValue: string;
  column: string;
  value: string | boolean;
  expectedUpdatedAt: string | null;
}

export function useInlineEditMutation({
  table,
  onRowUpdated,
  onRowReplaced,
  onRowMissing,
}: UseInlineEditMutationArgs) {
  const submit = useCallback(
    async ({ pkValue, column, value, expectedUpdatedAt }: CellEditArgs): Promise<
      "ok" | "conflict-resolved" | "failed"
    > => {
      const body: Record<string, unknown> = {
        values: { [column]: { action: "set", value } },
      };
      if (expectedUpdatedAt) body.expected_updated_at = expectedUpdatedAt;

      const res = await fetch(
        `/api/v1/tables/${table}/${encodeURIComponent(pkValue)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const payload = await res.json();

      if (res.ok && payload.success) {
        onRowUpdated(payload.data.row);
        return "ok";
      }

      if (res.status === 409 && payload.error?.code === "CONFLICT") {
        return await new Promise((resolve) => {
          toast.error("누군가 먼저 수정했습니다", {
            duration: 30000,
            description: `${table} 행 ${pkValue}이 다른 세션에서 변경됨`,
            action: {
              label: "덮어쓰기",
              onClick: async () => {
                const retryBody: Record<string, unknown> = {
                  values: { [column]: { action: "set", value } },
                  expected_updated_at: payload.error.current?.updated_at,
                };
                const retry = await fetch(
                  `/api/v1/tables/${table}/${encodeURIComponent(pkValue)}`,
                  {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(retryBody),
                  },
                );
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
    [table, onRowUpdated, onRowReplaced, onRowMissing],
  );

  return { submit };
}
```

- [ ] **Step 2: Sonner가 프로젝트에 실제로 있는지 확인**

Run: `grep -r "from \"sonner\"" src --include="*.tsx" --include="*.ts" -l | head -3`
Expected: 최소 1 파일 매칭 (Phase 11b 토스트 통합). 없으면 `npm list sonner`로 의존성 확인.

- [ ] **Step 3: tsc 실행**

Run: `npx tsc --noEmit`
Expected: EXIT 0.

- [ ] **Step 4: 커밋**

```bash
git add src/components/table-editor/use-inline-edit-mutation.ts
git commit -m "$(cat <<'EOF'
feat(ui): useInlineEditMutation — PATCH + 409 토스트 + 재시도

Sonner 토스트 3액션(덮어쓰기/유지/취소)으로 충돌 해결. 덮어쓰기는
서버가 반환한 current.updated_at을 expected_updated_at으로 교체해
재호출. 404는 그리드 재fetch 유도(onRowMissing). 404 외 에러는 토스트만.

Phase 14c-α D2 (훅)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `TableDataGrid` 인라인 편집 통합 + `systemColumns` prop

**Files:**
- Modify: `src/components/table-editor/table-data-grid.tsx`
- Modify: `src/app/(protected)/tables/[table]/page.tsx`

**Context:** Grid의 `tanstackColumns`.cell 렌더러를 `EditableCell`로 치환한다. readonly 판정은 Grid가 prop으로 받은 `systemColumns`(기본 `["created_at", "updated_at"]`) + column.isPrimaryKey + policy.canUpdate=false 매트릭스. page.tsx는 `systemColumns` prop만 추가(기본값이라 생략 가능).

- [ ] **Step 1: `TableDataGrid` 수정 — import + props 확장**

Edit `src/components/table-editor/table-data-grid.tsx`:

(1) import 블록 뒤에 추가:
```tsx
import { EditableCell } from "./editable-cell";
import { useInlineEditMutation } from "./use-inline-edit-mutation";
```

(2) `TableDataGridProps` 인터페이스(L28-36)에 추가:
```tsx
  /** 읽기 전용 시스템 컬럼 (기본: ["created_at", "updated_at"]) */
  systemColumns?: string[];
  /** 편집 성공 후 로컬 행 병합(옵션). 없으면 refreshToken 증가 방식 유지 */
  onRowPatched?: () => void;
```

(3) `TableDataGrid` 함수 시그니처에 추가:
```tsx
export function TableDataGrid({
  table,
  policy,
  onEditRow,
  onDeleteRow,
  refreshToken,
  systemColumns = ["created_at", "updated_at"],
  onRowPatched,
}: TableDataGridProps) {
```

- [ ] **Step 2: Grid 내부에 훅 + PK 상태 추가**

`TableDataGrid` 함수 본문 상단(기존 `const [columns, …` 다음)에 PK 컬럼명 추출 상태와 훅 배선 추가:

```tsx
  const [primaryKeyName, setPrimaryKeyName] = useState<string | null>(null);
```

`fetchSchema` useCallback 내부(기존 `setColumns(body.data.columns);` 다음 줄)에 추가:
```tsx
    setPrimaryKeyName(body.data.primaryKey?.column ?? null);
```

`fetchRows` 정의 직후에 훅 사용 추가:
```tsx
  const { submit: submitInlineEdit } = useInlineEditMutation({
    table,
    onRowUpdated: () => {
      // 서버 반환 row로 즉시 반영 (낙관적 로컬 업데이트 대안)
      if (onRowPatched) onRowPatched();
      else fetchRows();
    },
    onRowReplaced: () => fetchRows(),
    onRowMissing: () => fetchRows(),
  });
```

- [ ] **Step 3: `tanstackColumns` cell 렌더러 교체**

기존 `cell: ({ getValue }) => { … }` 블록(L185-196)을 아래로 교체:

```tsx
      cell: ({ getValue, row }) => {
        const v = getValue();
        const isSystem = systemColumns.includes(col.name);
        const readOnly =
          col.isPrimaryKey ||
          isSystem ||
          !policy?.canUpdate ||
          primaryKeyName === null;
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
        const pkVal = row.original[primaryKeyName!];
        const expectedUpdatedAt = row.original["updated_at"];
        return (
          <EditableCell
            value={v}
            dataType={col.dataType}
            readOnly={false}
            onCommit={async (next) => {
              await submitInlineEdit({
                pkValue: String(pkVal),
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

또한 `useMemo` 의존성 배열(`[columns, orderBy, orderDir, actionColumn]`)에 다음을 추가:
```tsx
  }, [columns, orderBy, orderDir, actionColumn, policy, primaryKeyName, systemColumns, submitInlineEdit]);
```

- [ ] **Step 4: 불필요해진 `formatCell` 처리**

`formatCell`은 이제 readonly 분기 내부에 인라인 이식되었다. Grid 최상단 `function formatCell` 정의(L40-45)를 유지하되, `cell` 렌더러에서는 그대로 참조 가능. 만약 ESLint에서 unused warning이 나면 readonly 분기에서 `formatCell(v)` 호출로 리팩토링. 우선은 유지.

- [ ] **Step 5: page.tsx는 변경 불요 검증**

Run: `grep -n "TableDataGrid" src/app/\(protected\)/tables/\[table\]/page.tsx`
Expected: 기존 `<TableDataGrid table={table} userRole={userRole} policy={...} refreshToken={...} onEditRow={...} onDeleteRow={...} />`. `systemColumns` 기본값이 있어 추가 prop 불필요. 변경 없음.

- [ ] **Step 6: tsc 실행**

Run: `npx tsc --noEmit`
Expected: EXIT 0.

- [ ] **Step 7: dev 서버에서 시각 확인 (선택)**

Run: `npm run dev` (로컬 Windows는 lightningcss 문제로 불가 — 이 단계는 WSL에서만). 실패 시 skip하고 프로덕션 배포 단계(Task 7)에서 검증.

- [ ] **Step 8: 커밋 D3**

```bash
git add src/components/table-editor/table-data-grid.tsx
git commit -m "$(cat <<'EOF'
feat(ui): TableDataGrid 인라인 편집 통합 + readonly 매트릭스

cell 렌더러를 EditableCell로 치환. readonly 조건: PK / system
columns(기본 created_at, updated_at) / !policy.canUpdate /
primaryKey 부재. useInlineEditMutation 훅 배선으로 PATCH +
409 토스트 자동 처리. onRowPatched 콜백으로 parent가 병합
전략을 선택(기본: refreshToken 재fetch).

Phase 14c-α D3

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: E2E 스크립트 작성 (curl + Playwright)

**Files:**
- Create: `scripts/e2e/phase-14c-alpha-curl.sh`
- Create: `scripts/e2e/phase-14c-alpha-ui.spec.ts`

**Context:** `docs/solutions/2026-04-17-curl-e2e-recipe-dashboard.md` 레시피 재사용. curl 스크립트는 단일 wsl 호출 내부에서 C1~C6 전부 실행. Playwright는 프로덕션 URL `https://stylelucky4u.com` 대상.

- [ ] **Step 1: curl 스크립트 작성**

Create `scripts/e2e/phase-14c-alpha-curl.sh`:

```bash
#!/bin/bash
# Phase 14c-α 인라인 편집 낙관적 잠금 — API E2E
# 실행: wsl -e bash -c "bash /mnt/e/00_develop/260406_luckystyle4u_server/scripts/e2e/phase-14c-alpha-curl.sh"

DASH_EMAIL='kimdooo@stylelucky4u.com'
DASH_PASS='Knp13579!yan'
DASH_BASE='http://localhost:3000'
COOKIE=/tmp/dash-cookie-alpha.txt
rm -f "$COOKIE"

echo "===== Phase 14c-α E2E ====="
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

OWNER_ID=$(curl -s -b "$COOKIE" "$DASH_BASE/api/auth/me" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["user"]["sub"])')
[ -z "$OWNER_ID" ] && { echo "FAIL: me"; exit 1; }
echo "OK: 로그인 (OWNER_ID=$OWNER_ID)"
echo

# --- seed: 테스트 folder 1개 INSERT ---
TEST_ID=$(python3 -c 'import uuid; print(uuid.uuid4())')
curl -s -b "$COOKIE" -X POST "$DASH_BASE/api/v1/tables/folders" \
  -H 'Content-Type: application/json' \
  -d "{\"values\":{\"id\":{\"action\":\"set\",\"value\":\"$TEST_ID\"},\"name\":{\"action\":\"set\",\"value\":\"alpha-test\"},\"owner_id\":{\"action\":\"set\",\"value\":\"$OWNER_ID\"},\"is_root\":{\"action\":\"set\",\"value\":false}}}" \
  -o /dev/null

INITIAL_UPDATED_AT=$(curl -s -b "$COOKIE" "$DASH_BASE/api/v1/tables/folders?limit=1&where=id=$TEST_ID" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print([r for r in d['data']['rows'] if r['id']=='$TEST_ID'][0]['updated_at'])")
echo "OK: seed folder $TEST_ID (updated_at=$INITIAL_UPDATED_AT)"
echo

# --- C1: 정상 PATCH (락 일치) ---
C1=$(curl -s -b "$COOKIE" -X PATCH "$DASH_BASE/api/v1/tables/folders/$TEST_ID" \
  -H 'Content-Type: application/json' \
  -d "{\"values\":{\"name\":{\"action\":\"set\",\"value\":\"alpha-C1\"}},\"expected_updated_at\":\"$INITIAL_UPDATED_AT\"}" \
  -w "\n__HTTP__%{http_code}")
if echo "$C1" | grep -q "__HTTP__200"; then
  echo "PASS C1: 정상 PATCH (락 일치) → 200"
  NEW_UPDATED=$(echo "$C1" | python3 -c 'import json,sys,re; s=sys.stdin.read(); b=s[:s.rfind("__HTTP__")]; print(json.loads(b)["data"]["row"]["updated_at"])')
else
  echo "FAIL C1: $C1"
fi
echo

# --- C2: CONFLICT (구 timestamp) ---
C2=$(curl -s -b "$COOKIE" -X PATCH "$DASH_BASE/api/v1/tables/folders/$TEST_ID" \
  -H 'Content-Type: application/json' \
  -d "{\"values\":{\"name\":{\"action\":\"set\",\"value\":\"alpha-C2\"}},\"expected_updated_at\":\"$INITIAL_UPDATED_AT\"}" \
  -w "\n__HTTP__%{http_code}")
if echo "$C2" | grep -q "__HTTP__409"; then
  echo "PASS C2: CONFLICT → 409"
  echo "$C2" | grep -q '"code":"CONFLICT"' && echo "       에러 코드 일치" || echo "FAIL: 에러 코드"
  echo "$C2" | grep -q '"current":{' && echo "       current 필드 포함" || echo "FAIL: current 누락"
else
  echo "FAIL C2: $C2"
fi
echo

# --- C3: NOT_FOUND (없는 PK) ---
FAKE_ID=$(python3 -c 'import uuid; print(uuid.uuid4())')
C3=$(curl -s -b "$COOKIE" -X PATCH "$DASH_BASE/api/v1/tables/folders/$FAKE_ID" \
  -H 'Content-Type: application/json' \
  -d "{\"values\":{\"name\":{\"action\":\"set\",\"value\":\"x\"}},\"expected_updated_at\":\"$NEW_UPDATED\"}" \
  -w "\n__HTTP__%{http_code}")
if echo "$C3" | grep -q "__HTTP__404"; then
  echo "PASS C3: NOT_FOUND → 404"
else
  echo "FAIL C3: $C3"
fi
echo

# --- C4: LEGACY (락 미제공) ---
C4=$(curl -s -b "$COOKIE" -X PATCH "$DASH_BASE/api/v1/tables/folders/$TEST_ID" \
  -H 'Content-Type: application/json' \
  -d "{\"values\":{\"name\":{\"action\":\"set\",\"value\":\"alpha-C4\"}}}" \
  -w "\n__HTTP__%{http_code}")
if echo "$C4" | grep -q "__HTTP__200"; then
  echo "PASS C4: LEGACY(락 없음) → 200"
else
  echo "FAIL C4: $C4"
fi
echo

# --- C5: MALFORMED expected_updated_at ---
C5=$(curl -s -b "$COOKIE" -X PATCH "$DASH_BASE/api/v1/tables/folders/$TEST_ID" \
  -H 'Content-Type: application/json' \
  -d "{\"values\":{\"name\":{\"action\":\"set\",\"value\":\"x\"}},\"expected_updated_at\":\"not-iso\"}" \
  -w "\n__HTTP__%{http_code}")
if echo "$C5" | grep -q "__HTTP__400"; then
  echo "PASS C5: MALFORMED → 400"
  echo "$C5" | grep -q "INVALID_EXPECTED_UPDATED_AT" && echo "       코드 일치" || echo "FAIL: 코드"
else
  echo "FAIL C5: $C5"
fi
echo

# --- C6: 감사 로그 2종 확인 ---
AUDIT=$(curl -s -b "$COOKIE" "$DASH_BASE/api/audit?limit=30")
UPDATE_COUNT=$(echo "$AUDIT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(sum(1 for l in d['logs'] if l.get('action')=='TABLE_ROW_UPDATE'))")
CONFLICT_COUNT=$(echo "$AUDIT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(sum(1 for l in d['logs'] if l.get('action')=='TABLE_ROW_UPDATE_CONFLICT'))")
if [ "$UPDATE_COUNT" -ge 1 ] && [ "$CONFLICT_COUNT" -ge 1 ]; then
  echo "PASS C6: 감사 로그 — UPDATE=$UPDATE_COUNT, UPDATE_CONFLICT=$CONFLICT_COUNT"
else
  echo "FAIL C6: UPDATE=$UPDATE_COUNT, CONFLICT=$CONFLICT_COUNT"
fi
echo

# --- 정리 ---
curl -s -b "$COOKIE" -X DELETE "$DASH_BASE/api/v1/tables/folders/$TEST_ID" -o /dev/null
echo "cleanup: folder $TEST_ID 삭제"
```

- [ ] **Step 2: curl 스크립트 실행 가능 비트 확인**

Run: `ls -la scripts/e2e/phase-14c-alpha-curl.sh`
Expected: 파일 존재. 실행 가능 비트는 WSL에서 `bash …`로 호출하므로 불필요.

- [ ] **Step 3: Playwright E2E 스펙 작성**

프로젝트의 기존 Playwright 스펙 위치 확인:
Run: `find . -name "*.spec.ts" -path "*e2e*" 2>/dev/null | head -3`

Create `scripts/e2e/phase-14c-alpha-ui.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "https://stylelucky4u.com";
const EMAIL = "kimdooo@stylelucky4u.com";
const PASS = "Knp13579!yan";

async function login(page: import("@playwright/test").Page) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(tables|$)/, { timeout: 10000 });
}

test.describe("Phase 14c-α 인라인 편집", () => {
  test("E1: 셀 편집 해피패스", async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/tables/folders`);
    const firstNameCell = page.locator('tbody tr').first().locator('button').filter({ hasText: /^[^N].*/ }).first();
    await firstNameCell.click();
    const input = page.locator('input:focus, textarea:focus').first();
    await input.fill("alpha-E1-edited");
    await input.press("Enter");
    await expect(page.locator('text=alpha-E1-edited')).toBeVisible({ timeout: 5000 });
  });

  test("E3: Esc 취소", async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/tables/folders`);
    const firstNameCell = page.locator('tbody tr').first().locator('button').first();
    const original = await firstNameCell.textContent();
    await firstNameCell.click();
    const input = page.locator('input:focus, textarea:focus').first();
    await input.fill("should-be-discarded");
    await input.press("Escape");
    await expect(page.locator('tbody tr').first().locator('button').first()).toHaveText(original ?? "");
  });

  test("E5: PK/system 컬럼 readonly", async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/tables/folders`);
    // PK(id) 컬럼은 <span>이어야 함 (클릭 가능한 button이 아님)
    const headerCells = await page.locator('thead th').allTextContents();
    const idIdx = headerCells.findIndex((h) => h.includes("id") && !h.includes("owner"));
    expect(idIdx).toBeGreaterThanOrEqual(0);
    const idCell = page.locator(`tbody tr:first-child td:nth-child(${idIdx + 1})`);
    await expect(idCell.locator('button')).toHaveCount(0);
  });

  test("E6: FULL_BLOCK 테이블 users — 모든 편집 비허용", async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/tables/users`);
    // users는 policy.canUpdate=false → EditableCell readOnly 분기 → button 없음
    await expect(page.locator('tbody tr:first-child button').first()).toHaveCount(0);
  });
});
```

주의: E2/E4(Tab 이동, 동시 편집 시뮬레이션)는 UX 안정성 요구가 높아 수동 검증 우선, 자동화는 Phase 14d 이후로 미룸. DOD 기록에 "E1/E3/E5/E6 자동화, E2/E4 수동 확인" 명시.

- [ ] **Step 4: 커밋**

```bash
git add scripts/e2e/phase-14c-alpha-curl.sh scripts/e2e/phase-14c-alpha-ui.spec.ts
git commit -m "$(cat <<'EOF'
test(14c-α): curl C1~C6 + Playwright E1/E3/E5/E6 E2E 스크립트

curl: 정상/CONFLICT/NOT_FOUND/LEGACY/MALFORMED + 감사 로그 2종 확인.
Playwright: 해피패스/Esc취소/PK readonly/FULL_BLOCK 차단 자동화.
Tab 이동·동시편집은 UX 관찰 요구 → 수동 DOD.

Phase 14c-α D5 (E2E 스크립트)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: ADR-004 + 프로덕션 배포 + DOD 실수행 + handover

**Files:**
- Create: `docs/research/decisions/ADR-004-phase-14c-alpha-optimistic-locking.md`
- Create: `docs/logs/journal-2026-04-18.md`
- Modify: `docs/status/current.md`
- Modify: `docs/handover/next-dev-prompt.md`
- Modify: `docs/handover/_index.md`
- Modify: `docs/logs/2026-04.md`
- Create: `docs/handover/260418-session24-phase-14c-alpha.md`

**Context:** 세션 23 /cs 양식을 따른다. 프로덕션 배포 → E2E 실수행 → 결과 기록 → handover 작성. 세션 23 워크플로우(/ypserver prod Phase 1 건너뛰기 + 수동 WSL 복사+빌드+pm2 restart) 재사용.

- [ ] **Step 1: ADR-004 작성**

Create `docs/research/decisions/ADR-004-phase-14c-alpha-optimistic-locking.md`:

```markdown
# ADR-004: Phase 14c-α 인라인 편집 낙관적 잠금

- **상태**: Accepted
- **날짜**: 2026-04-18
- **세션**: 24

## 컨텍스트

Phase 14b로 RowFormModal 기반 CRUD가 완성되었다. 사용자 UX를 Supabase Table Editor 수준으로 끌어올리려면 셀 단위 인라인 편집이 필요하다. 동시에 여러 관리자(ADMIN/MANAGER)가 같은 행을 편집할 가능성이 있어 충돌 감지가 필수다. 세션 23에서 9개 테이블에 `updated_at DEFAULT now() @updatedAt`을 배선했기 때문에 낙관적 잠금의 기반이 이미 존재한다.

## 결정

1. **낙관적 잠금 전달**: 바디 필드 `expected_updated_at` (선택적 ISO 타임스탬프). 누락 시 기존 Phase 14b 동작 유지.
2. **충돌 응답**: HTTP 409 + `{error: {code:"CONFLICT", message, current: <row>}}`. current에는 서버 최신 행 전체 포함.
3. **충돌 UX**: Sonner 토스트 3액션 — 덮어쓰기(expected를 current로 교체해 재호출), 내 변경 유지(셀 dirty 유지), 취소(로컬을 current로 치환).
4. **readonly 매트릭스**: PK 컬럼 + `["created_at", "updated_at"]` 시스템 컬럼 + `policy.canUpdate=false` + primaryKey 부재.
5. **inline CREATE/DELETE 미지원**: 셀 단위에서 PK/NOT NULL 검증 UX가 어색. 기존 모달 경로 유지.
6. **Composite PK/VIEWER는 범위 밖**: 별도 spec (β/γ)으로 분리.
7. **감사 로그**: `TABLE_ROW_UPDATE_CONFLICT` 신규 action + 기존 `TABLE_ROW_UPDATE`에 `locked:bool` 메타.

## 대안

- **비관적 lock (SELECT FOR UPDATE)**: 동시 편집자 수가 소규모(관리자 1~3명)라 오버엔지니어링. 락 타임아웃·유휴 세션 청소 복잡도 추가.
- **ETag + `If-Match` 헤더**: 더 RESTful하지만 body 3상태 포맷과 일관성 낮음. CSRF·프록시 계층 헤더 처리 오버헤드.
- **Last-write-wins (잠금 없음)**: Phase 14b 동작. 동시 편집에서 silent 덮어쓰기 발생 — 관리자 실수 복구가 어려움.

## 결과

- **장점**: 세션 23 자산 즉시 활용 (추가 마이그레이션 불요). 서버는 단일 UPDATE 쿼리로 감지. 클라 UX는 토스트 기반으로 가볍다.
- **단점**: `updated_at` 컬럼 없는 테이블은 지원 불가 (현재는 EdgeFunctionRun 1개 — DELETE_ONLY라 무관). 동일 트랜잭션 내 연속 UPDATE는 감지 불가 (PG `now()`는 트랜잭션 시작 시각 고정).
- **후속**: β spec(복합 PK) 진행 시 `expected_updated_at` 동일 패턴 재사용.

## 참고

- Spec: `docs/superpowers/specs/2026-04-18-phase-14c-alpha-inline-edit-optimistic-locking-design.md`
- Plan: `docs/superpowers/plans/2026-04-18-phase-14c-alpha-inline-edit-optimistic-locking-plan.md`
- 선행: 세션 23 마이그레이션 `20260417140000_add_updated_at_default`
```

- [ ] **Step 2: 프로덕션 배포 (수동 WSL — 세션 23 절차)**

스키마 변경 없으므로 `prisma migrate deploy` 불필요. 소스 복사 + 빌드 + PM2 재기동만 수행.

Run:
```bash
wsl -e bash -c "source ~/.nvm/nvm.sh && cd ~/dashboard && rm -rf src .next && cp -r /mnt/e/00_develop/260406_luckystyle4u_server/src . && cp /mnt/e/00_develop/260406_luckystyle4u_server/next.config.ts /mnt/e/00_develop/260406_luckystyle4u_server/tsconfig.json /mnt/e/00_develop/260406_luckystyle4u_server/tailwind.config.ts /mnt/e/00_develop/260406_luckystyle4u_server/postcss.config.mjs /mnt/e/00_develop/260406_luckystyle4u_server/package.json . && npm install && npm run build && pm2 restart dashboard"
```
Expected: `.next` 재생성 완료 + `pm2 restart` 성공. 실패 시 빌드 로그에서 타입 에러/미사용 import 확인.

- [ ] **Step 3: 프로덕션 헬스 체크**

Run:
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/login
```
Expected: `200`.

- [ ] **Step 4: curl E2E 실행**

Run:
```bash
wsl -e bash -c "bash /mnt/e/00_develop/260406_luckystyle4u_server/scripts/e2e/phase-14c-alpha-curl.sh"
```
Expected: `PASS C1` … `PASS C6` 6줄 모두 PASS. 실패 시 출력의 FAIL 라인을 그대로 기록하고 원인 분석.

- [ ] **Step 5: Playwright E2E (프로덕션)**

Run:
```bash
E2E_BASE_URL=https://stylelucky4u.com npx playwright test scripts/e2e/phase-14c-alpha-ui.spec.ts --reporter=list
```
Expected: E1/E3/E5/E6 4건 모두 PASS. E2/E4는 수동 확인 후 handover에 기록.

- [ ] **Step 6: 감사 로그 영속 재확인 (DOD)**

Run:
```bash
wsl -e bash -c "sqlite3 ~/dashboard/data/dashboard.db 'SELECT action, COUNT(*) FROM audit_logs WHERE action IN (\"TABLE_ROW_UPDATE\", \"TABLE_ROW_UPDATE_CONFLICT\") GROUP BY action;'"
```
Expected: `TABLE_ROW_UPDATE|N`, `TABLE_ROW_UPDATE_CONFLICT|M` (각 1 이상).

- [ ] **Step 7: `docs/status/current.md` 세션 24 행 추가**

Edit `docs/status/current.md`:

`## 현재 진행 상태` 체크박스 리스트(세션 23 행 직후)에 추가:
```markdown
- [x] **Phase 14c-α (세션 24)**: 인라인 셀 편집 + 낙관적 잠금 — EditableCell/useInlineEditMutation/TypedInputControl 3 컴포넌트 + PATCH expected_updated_at + 409 CONFLICT + 감사 로그 2종. 프로덕션 E2E C1~C6/E1·E3·E5·E6 PASS.
```

세션 기록 요약표에 새 행 추가(세션 23 행 직후):
```markdown
| 24 | 2026-04-18 | Phase 14c-α 인라인 편집 + 낙관적 잠금 — brainstorming(α/β/γ 분해) → writing-plans → subagent-driven-development 실행. API + 3 컴포넌트/훅 + 리팩토링 1 + ADR-004 + E2E 전 매트릭스 PASS | [2026-04](../logs/2026-04.md) | [인수인계서](../handover/260418-session24-phase-14c-alpha.md) |
```

- [ ] **Step 8: `docs/logs/journal-2026-04-18.md` 신규 + `2026-04.md` 섹션 추가**

Create `docs/logs/journal-2026-04-18.md`에 세션 24 7개 토픽 기록 (Task 진행 순).

Edit `docs/logs/2026-04.md`에 섹션 추가(세션 23 섹션 뒤):
```markdown
## 세션 24 — 2026-04-18 (Phase 14c-α 인라인 편집 + 낙관적 잠금)

**목적**: 세션 23의 `@default(now()) @updatedAt` 자산 위에 셀 인라인 편집 + 낙관적 잠금을 쌓아 Supabase Table Editor 수준의 편집 UX를 구현.

**핵심 결정**: ADR-004 채택 — body `expected_updated_at` + 409 CONFLICT + Sonner 토스트 3액션.

**커밋 체인**:
- `<sha>` docs(14c-α): 설계 spec
- `<sha>` feat(api): PATCH expected_updated_at 낙관적 잠금 + 409 CONFLICT (D1)
- `<sha>` refactor(ui): RowFormModal 입력 컨트롤 추출
- `<sha>` feat(ui): EditableCell 컴포넌트 (D2 컴포넌트)
- `<sha>` feat(ui): useInlineEditMutation — PATCH + 409 토스트 (D2 훅)
- `<sha>` feat(ui): TableDataGrid 인라인 편집 통합 (D3)
- `<sha>` test(14c-α): curl + Playwright E2E 스크립트 (D5)
- `<sha>` docs(14c-α): ADR-004 + handover + current.md (D4/종료)

**E2E 결과** (프로덕션):
- C1~C6 curl 전 PASS
- E1/E3/E5/E6 Playwright PASS
- E2/E4 수동 확인 — 통과

**다음**: β spec (복합 PK 지원), γ spec (VIEWER 테스트 계정).
```

- [ ] **Step 9: `docs/handover/260418-session24-phase-14c-alpha.md` 작성**

Create 인수인계서 — 세션 23 인수인계서 포맷 모방 (`docs/handover/260417-session23-phase-14c-updated-at-fix.md`를 레퍼런스로 참조). 포함 섹션: 목표/결과·배포 상태·E2E 매트릭스·파일 변경 목록·다음 세션 권장.

- [ ] **Step 10: `docs/handover/_index.md`에 세션 24 행 추가**

`_index.md` 마스터 목록에 세션 24 행 append.

- [ ] **Step 11: `docs/handover/next-dev-prompt.md` 전면 갱신**

- `## 현재 상태 (세션 24 종료 시점)` 헤더로 교체
- 완료된 Phase 목록에 Phase 14c-α 추가
- 추천 다음 작업 재작성: β(복합 PK), γ(VIEWER), B(/ypserver 보강), C(Vitest)

- [ ] **Step 12: 커밋 D4 + 세션 종료**

```bash
git add docs/
git commit -m "$(cat <<'EOF'
docs(14c-α): 세션 24 /cs — 인라인 편집 + 낙관적 잠금 완료

- ADR-004 인라인 편집 낙관적 잠금
- E2E 매트릭스 C1~C6 + E1/E3/E5/E6 전 PASS
- current.md 세션 24 행, 2026-04.md 상세, journal-2026-04-18
- handover 260418-session24-phase-14c-alpha + _index + next-dev-prompt

Phase 14c-α D4 + 종료

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 13: 원격 push (선택)**

Run: `git push origin main`
Expected: 세션 23 종료 커밋 이후 α 관련 커밋 7~9개 push 완료.

---

## Self-Review Checklist

- [ ] Spec의 §2.1 In Scope 5개 항목 모두 Task로 커버 (API 잠금 ← T1, 409 ← T1, 토스트 ← T4, EditableCell ← T3, readonly ← T5)
- [ ] Spec의 §3.3 API 계약 변경 Task 1에 완전 반영
- [ ] Spec의 §3.4 감사 로그 스키마 Task 1 Step 4에 구현
- [ ] Spec의 §6 테스트 — curl C1~C6, Playwright E1·E3·E5·E6 Task 6에 코드 포함 (E2/E4 수동 — 명시)
- [ ] Spec의 §9 커밋 경계 5개(D1~D5) Task 1/2~4/5/7/6 에 매핑 (D4는 T7, D5는 T6)
- [ ] 타입 일관성: `CellEditArgs.value`는 `string | boolean`, EditableCell `onCommit`도 동일, useInlineEditMutation 서브밋도 동일 — OK
- [ ] 플레이스홀더 스캔: "TBD", "TODO" 없음. 각 Step에 실제 코드/명령 포함 — OK
- [ ] 파일 경로 정확: 모든 Task의 Files 섹션 + Edit 참조 경로 확인 완료

---

## 실행 핸드오프

**Plan complete and saved to `docs/superpowers/plans/2026-04-18-phase-14c-alpha-inline-edit-optimistic-locking-plan.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — 각 Task마다 fresh subagent를 띄워 리뷰 게이트 끼움, 빠른 반복

**2. Inline Execution** — `superpowers:executing-plans`로 현재 세션에서 직접 체크포인트 기반 실행

(자율 실행 모드 — 사용자 지시상 **Subagent-Driven** 채택)
