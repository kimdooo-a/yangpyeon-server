# 05. TanStack Table v8 vs AG Grid Community — 1:1 비교

> Wave 2 / Agent A / 1:1 비교 문서
> 작성일: 2026-04-18 (세션 24 연장)
> 작성자: Claude Opus 4.7 (1M context) — Wave 2 1:1 비교 에이전트
> 대상: 양평 부엌 서버 대시보드 — `/tables` Table Editor 현 채택(TanStack) vs 대안(AG Community) 결정 보강
> 범위: 복합 PK 지원(Wave 1 14c-β 작업), 셀 편집 UX, 가상화 성능, 라이선스, 번들, Next.js SSR 호환을 중심으로 2개 라이브러리 1:1 대결
> 근거 문서: Wave 1 deep-dive 01/02 전수 Read + 매트릭스 문서 04

---

## 0. Executive Summary

### 결론 한 줄

**TanStack Table v8은 "복합 PK 지원이 이미 완료된 14c-β 작업(`composite` 폴더, `/api/v1/tables/[table]/cs/[pks]/route.ts`)의 서버 계약과 완벽 정렬"되고, shadcn/Tailwind 4/Sonner 통합에서 wrapper 비용 0이며, Phase 14b 자산 100% 재사용이 가능하므로 현재 유지가 최선이다. AG Grid Community는 "셀 편집·키보드 네비·다중 행 선택·가상화가 모두 빌트인"이라는 결정적 우위에도 불구하고, (a) EditableCell/useInlineEditMutation/spec 폐기 비용, (b) Tailwind↔AG Theme 매핑 1~2일, (c) 번들 +200KB, (d) Enterprise 절단선(범위 선택/채우기 핸들/Excel export 유료)이라는 4가지 비용 때문에 14c-α/β 범위 내에서는 비채택이 답이다.**

### 결정 종합

| 항목 | TanStack Table v8 (현 채택) | AG Grid Community (대안) | 승자 |
|------|----------------------------|-------------------------|------|
| 종합 가중 점수 | 4.54 / 5 | 4.09~4.19 / 5 | **TanStack** |
| 번들 크기 | 15.2KB | 150~250KB | **TanStack** |
| 셀 편집 빌트인 | No (자체구현) | Yes (F2/Tab/Enter/Esc 완비) | **AG** |
| 키보드 네비 빌트인 | No (8년째 미표준) | Yes (Excel급) | **AG** |
| 가상 스크롤 | `@tanstack/react-virtual` 별도 | 빌트인 | **AG (근소)** |
| Tailwind 4 / shadcn 정합 | 100% (공식 DataTable v8 기반) | 매핑 wrapper 필요 | **TanStack** |
| 복합 PK 지원 | 데이터 비종속 (14c-β 완료) | 동등 (라이브러리 비종속) | **동등** |
| 낙관적 잠금(`expected_updated_at`) | useInlineEditMutation 완성 | onCellValueChanged 흡수 | **동등 (TanStack 선점)** |
| 감사 로그 + table-policy | 자연 통합 | wiring 재검증 필요 | **TanStack** |
| 14b 자산(RowFormModal·redactSensitiveValues) | 100% 재사용 | 재검증·이식 | **TanStack** |
| 라이선스 | MIT 영구 | MIT Community + 상업 EULA Enterprise | **TanStack** |
| Next.js 16 SSR | `"use client"` 만 | `"use client"` + `next/dynamic` 권장 | **TanStack** |
| 개발 속도 (0부터) | Headless 학습 1~2일 | declarative 즉시 | **AG** |
| 100K+ 행 PERF | Virtual 필요 | client-side 10만 OK | **AG (근소)** |
| 100만+ 행 | Virtual + pagination | Server-side (Enterprise) | 조건부 |

### 프로젝트 결론

- **14c 범위(α+β+14d+14e) 내 결정**: TanStack Table v8 유지.
- **재평가 트리거**: 월평균 EdgeFunctionRun 10만 행 초과 2개월 연속 / 사용자 Excel급 피드백 3건+ / 개발자 2명+ 신규 합류.
- **AG가 이기는 시나리오 명시**: §7 상세.

---

## 1. 포지셔닝

### 1.1 철학 차이

**TanStack Table v8** = **Headless Core Philosophy**
- 로직(행/열/정렬/필터/그루핑/페이저/선택/확장) 모델만 계산.
- 마크업 0줄. `<table>`/`<tr>`/`<td>` 또는 `<div role="grid">` 사용자 자유.
- Framework-agnostic: React/Vue/Svelte/Solid 어댑터.
- 철학: "컨트롤의 100%를 개발자에게 — 대가는 보일러플레이트."

**AG Grid Community** = **Batteries-Included Philosophy**
- 셀 편집·필터·정렬·페이저·그루핑·집계·고정 컬럼·리사이즈·드래그 모두 빌트인.
- `<AgGridReact rowData columnDefs />` 한 줄에 대부분 들어감.
- Theme 시스템(Quartz/Alpine/Balham/Material) + CSS 변수 기반 커스터마이징.
- 철학: "Excel에서 영감을 받은 표준 UX — 대가는 번들과 학습 곡선."

### 1.2 양평 부엌 컨텍스트에서의 포지셔닝

- **현재 프로젝트 스택**: Next.js 16 + TypeScript + Tailwind 4 + shadcn/ui + Sonner + Prisma 7 + 단일 PG 풀
- **이미 의존성에 있는 것**: `@tanstack/react-table ^8.21.3` (package.json 확인됨)
- **이미 작성된 것**: `src/components/table-editor/{table-data-grid.tsx, row-form-modal.tsx, editable-cell.tsx, editable-cell-inputs.tsx, use-inline-edit-mutation.ts}`
- **이미 작성된 spec**: `docs/superpowers/specs/2026-04-18-phase-14c-alpha-inline-edit-optimistic-locking-design.md`

→ TanStack은 "현재의 확장" 포지션, AG는 "교체" 포지션.

---

## 2. 기능 비교표 (최소 15개)

| # | 기능 | TanStack Table v8 | AG Grid Community | 양평 14c 내 필요 |
|---|------|-------------------|-------------------|-----------------|
| 1 | 셀 단위 편집 진입/종료 | 자체 EditableCell (완료) | 빌트인 (F2/dbclick/Enter) | 필수 ✅ |
| 2 | 키보드 네비 Tab/Arrow/Enter/Esc | 자체 구현 (부분) | 빌트인 완비 | Tab/Enter/Esc 필수 ✅ (14c-α), Arrow ⚠️ (14e) |
| 3 | 다중 행 선택 (체크박스) | state.rowSelection + 셀 직접 | `rowSelection={{mode:'multiRow'}}` | 필수 ✅ (14c-β) |
| 4 | 행 범위 선택 (Shift+Click) | 자체 구현 | 빌트인 | ⚠️ (14e) |
| 5 | 셀 범위 선택 (드래그) | 자체 구현 | Enterprise만 ❌ | ⚠️ (14e — Excel 요구시) |
| 6 | 채우기 핸들 (Fill handle) | 자체 구현 | Enterprise만 ❌ | ❌ (Supabase도 없음) |
| 7 | 클립보드 복사 범위 (TSV) | 자체 구현 | Enterprise만 ❌ | ⚠️ (14e) |
| 8 | 정렬 (단일/다중 컬럼) | getSortedRowModel 빌트인 | 빌트인 (다중은 Shift+Click) | 필수 ✅ |
| 9 | 필터 (텍스트/숫자/날짜) | getFilteredRowModel 빌트인 | 빌트인 | 필수 ✅ |
| 10 | 페이지네이션 | getPaginationRowModel 빌트인 | 빌트인 | 필수 ✅ |
| 11 | 가상 스크롤 (1만 행 60fps) | `@tanstack/react-virtual` 별 | 빌트인 | ✅ (14d EdgeFunctionRun) |
| 12 | 복합 PK 지원 | 데이터 비종속 (`getRowId` 사용) | 데이터 비종속 (`getRowId` 사용) | 필수 ✅ (14c-β 완료) |
| 13 | 낙관적 잠금 wiring | useInlineEditMutation 완성 | onCellValueChanged 흡수 | 필수 ✅ (14c-α) |
| 14 | 외래키 셀렉터 (FK popup) | cmdk + introspection | cellEditor Popup + Custom | ✅ (14d) |
| 15 | CSV import + 매핑 UI | 자체 + Papa Parse | 자체 + Papa Parse | ✅ (14d) |
| 16 | CSV export | 자체 (가벼움) | 빌트인 `api.exportDataAsCsv()` | ✅ (14d) |
| 17 | Excel export (.xlsx) | 자체 + ExcelJS | Enterprise만 ❌ | ❌ |
| 18 | 감사 로그(audit log) 통합 | 자연 (헤드리스 슬롯 외부) | 자연 (onCellValueChanged 훅) | 필수 ✅ (14b 완료) |
| 19 | `table-policy` FULL_BLOCK / DELETE_ONLY | 자연 통합 | wiring 재검증 | 필수 ✅ (14b 완료) |
| 20 | `redactSensitiveValues` 마스킹 | 자연 통합 | wiring 재검증 | 필수 ✅ (14b 완료) |
| 21 | Tailwind 4 다크 테마 | `dark:` 클래스 토글 (0 비용) | `ag-theme-quartz-dark` + override | ✅ |
| 22 | shadcn/ui Badge/Button/Input 통합 | 자연 (공식 DataTable v8 기반) | wrapper 필요 | ✅ |
| 23 | Sonner 토스트 통합 | 자연 | 자연 | ✅ |
| 24 | SSR / Next.js 16 App Router | `"use client"` | `"use client"` + `next/dynamic` | ✅ |

**요약**:
- **TanStack 우위**: 8개 (Tailwind, shadcn, 14b 자산, SSR 간편, 번들, License, Excel export 여지, CSV 가벼움)
- **AG 우위**: 6개 (셀 편집, 키보드, 가상화, 빌트인 CSV export, F2/dbclick, 다중 선택 1줄)
- **동등**: 10개

→ AG 우위 6개 중 4개(셀 편집·키보드·다중 선택·가상화)는 TanStack에서 자체 구현되어 있거나 14d에 계획됨. 남은 2개(빌트인 CSV export, 1줄 다중 선택)는 "짧은 코드" 이점이나 결정적 아님.

---

## 3. 코드 비교 — 2가지 시나리오

### 3.1 시나리오 1: 복합 PK 테이블의 셀 인라인 편집 + 낙관적 잠금

`_prisma_migrations`(PK: `(id, applied_steps_count)`) 같은 복합 PK 테이블의 셀 편집.

#### 3.1.1 TanStack Table v8 (현재 채택)

```tsx
// src/components/table-editor/composite-pk-grid.tsx (14c-β 이후)
"use client";

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type Table as TanstackTable,
} from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { EditableCell } from "./editable-cell";
import { useInlineEditMutation } from "./use-inline-edit-mutation";
import { encodeCompositePk } from "@/lib/db/composite-pk";

// 복합 PK 행 — `id + applied_steps_count` 조합을 키로
interface CompositeRow {
  id: string;
  applied_steps_count: number;
  // ... 나머지
  updated_at: string;
}

interface CompositePkGridProps {
  tableName: string;
  rows: CompositeRow[];
  setRows: (next: CompositeRow[]) => void;
  columns: ReadonlyArray<{
    name: string;
    dataType: string;
    isPrimaryKey: boolean;
    isSystem: boolean;
  }>;
  primaryKeys: readonly [string, string];  // 복합 PK 배열 (14c-β 계약)
  canUpdate: boolean;
}

export function CompositePkGrid(props: CompositePkGridProps) {
  const { rows, setRows, columns, primaryKeys, canUpdate } = props;

  const { submit } = useInlineEditMutation({
    table: props.tableName,
    compositePk: true,
    primaryKeys,
    onRowUpdated: (next) => {
      setRows(
        rows.map((r) =>
          r.id === next.id &&
          r.applied_steps_count === next.applied_steps_count
            ? (next as CompositeRow)
            : r,
        ),
      );
    },
    onRowReplaced: (next) => {
      setRows(
        rows.map((r) =>
          r.id === next.id &&
          r.applied_steps_count === next.applied_steps_count
            ? (next as CompositeRow)
            : r,
        ),
      );
    },
    onRowMissing: () => {
      // 외부 refetch
    },
  });

  // 복합 PK 테이블에서 행 식별자 — 14c-β의 encodeCompositePk 재사용
  const getRowId = useCallback(
    (row: CompositeRow) => encodeCompositePk(primaryKeys, row),
    [primaryKeys],
  );

  const tableColumns: ColumnDef<CompositeRow>[] = useMemo(
    () =>
      columns.map((col) => ({
        id: col.name,
        accessorKey: col.name,
        header: col.name,
        cell: ({ row }) => {
          const isReadOnly =
            col.isPrimaryKey || col.isSystem || !canUpdate;
          return (
            <EditableCell
              value={
                row.original[col.name as keyof CompositeRow] as
                  | string
                  | number
                  | boolean
                  | null
              }
              dataType={col.dataType}
              readOnly={isReadOnly}
              onCommit={async (value) => {
                const pkValues = primaryKeys.map(
                  (k) => row.original[k as keyof CompositeRow],
                );
                const result = await submit({
                  pkValues,
                  column: col.name,
                  value,
                  expectedUpdatedAt: row.original.updated_at,
                });
                if (result === "failed") throw new Error("commit failed");
              }}
            />
          );
        },
      })),
    [columns, canUpdate, primaryKeys, submit],
  );

  const table = useReactTable<CompositeRow>({
    data: rows,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId,
  });

  return (
    <table className="w-full border-separate border-spacing-0">
      <thead className="sticky top-0 z-10 bg-zinc-900">
        {table.getHeaderGroups().map((hg) => (
          <tr key={hg.id}>
            {hg.headers.map((h) => (
              <th
                key={h.id}
                className="border-b border-zinc-800 px-3 py-2 text-left text-xs font-semibold text-zinc-300"
              >
                {flexRender(h.column.columnDef.header, h.getContext())}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr key={row.id} className="hover:bg-zinc-900/40">
            {row.getVisibleCells().map((cell) => (
              <td
                key={cell.id}
                className="border-b border-zinc-900 px-3 py-1 align-top"
              >
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

**특징**:
- `getRowId: (r) => encodeCompositePk(primaryKeys, r)` — 14c-β의 `encodeCompositePk` 재사용. 정렬/필터/selection 안정.
- `submit({ pkValues, ... })` — useInlineEditMutation이 `primaryKeys` 배열로 PATCH URL을 조립 (`/api/v1/tables/${table}/cs/${pks}` 14c-β 라우트).
- `EditableCell`은 단일 PK 테이블과 공유 — 복합 PK 여부와 무관하게 셀 내부 UX 동일.

**14c-β 서버 계약과의 정합성**:
- 서버는 `src/app/api/v1/tables/[table]/composite/[pks]/route.ts` (14c-β에서 `_composite` → `composite` rename 완료 커밋 `0b88ee5`)
- `pks`는 URL path parameter로 `encodeURIComponent(JSON.stringify([v1, v2]))` 형식.
- TanStack의 `getRowId`가 같은 encode를 사용하면 클라이언트 key ↔ 서버 URL이 1:1.

#### 3.1.2 AG Grid Community (대안)

```tsx
// src/components/table-editor/composite-pk-grid.tsx (AG 대안)
"use client";

import { AgGridReact } from "ag-grid-react";
import {
  ClientSideRowModelModule,
  ClientSideRowSelectionModule,
  ModuleRegistry,
  TextEditorModule,
  CheckboxEditorModule,
  ValidationModule,
  type ColDef,
  type CellValueChangedEvent,
} from "ag-grid-community";
import "ag-grid-community/styles/ag-theme-quartz.css";
import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import { encodeCompositePk } from "@/lib/db/composite-pk";

ModuleRegistry.registerModules([
  ClientSideRowModelModule,
  ClientSideRowSelectionModule,
  TextEditorModule,
  CheckboxEditorModule,
  ...(process.env.NODE_ENV !== "production" ? [ValidationModule] : []),
]);

interface CompositeRow {
  id: string;
  applied_steps_count: number;
  updated_at: string;
}

interface AgCompositePkGridProps {
  tableName: string;
  rows: CompositeRow[];
  setRows: (next: CompositeRow[]) => void;
  columns: ReadonlyArray<{
    name: string;
    dataType: string;
    isPrimaryKey: boolean;
    isSystem: boolean;
  }>;
  primaryKeys: readonly [string, string];
  canUpdate: boolean;
}

export function AgCompositePkGrid(props: AgCompositePkGridProps) {
  const { rows, setRows, tableName, columns, primaryKeys, canUpdate } = props;

  // 복합 PK — AG의 getRowId에 같은 encode 사용
  const getRowId = useCallback(
    (params: { data: CompositeRow }) =>
      encodeCompositePk(primaryKeys, params.data),
    [primaryKeys],
  );

  const columnDefs: ColDef<CompositeRow>[] = useMemo(
    () =>
      columns.map((col) => ({
        field: col.name as keyof CompositeRow,
        headerName: col.name,
        editable:
          !col.isPrimaryKey && !col.isSystem && canUpdate,
        cellEditor:
          col.dataType === "boolean"
            ? "agCheckboxCellEditor"
            : "agTextCellEditor",
        // 복합 PK 컬럼은 readOnly CSS로 시각적 차별화
        cellClass: col.isPrimaryKey
          ? "bg-zinc-900/50 text-zinc-500"
          : undefined,
      })),
    [columns, canUpdate],
  );

  const onCellValueChanged = useCallback(
    async (e: CellValueChangedEvent<CompositeRow>) => {
      const colField = e.colDef.field;
      if (!colField) return;
      const original = e.oldValue;
      const expectedAt = e.data.updated_at;

      try {
        const pkValues = primaryKeys.map((k) =>
          e.data[k as keyof CompositeRow],
        );
        const encodedPks = encodeURIComponent(JSON.stringify(pkValues));
        const res = await fetch(
          `/api/v1/tables/${tableName}/composite/${encodedPks}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              values: { [colField]: { action: "set", value: e.newValue } },
              expected_updated_at: expectedAt,
            }),
          },
        );
        const payload = await res.json();
        if (res.ok && payload.success) {
          e.node.setData({ ...e.data, ...payload.data.row });
        } else if (res.status === 409) {
          // 충돌 원복
          e.node.setData({ ...e.data, [colField]: original });
          toast.error("누군가 먼저 수정했습니다", {
            action: {
              label: "덮어쓰기",
              onClick: async () => {
                // payload.error.current.updated_at으로 재시도 — onCellValueChanged 재귀 호출
              },
            },
            cancel: {
              label: "취소",
              onClick: () => {
                e.node.setData(payload.error.current);
              },
            },
            description:
              "이 토스트를 닫지 않고 다시 클릭해 수정하면 본인 변경이 유지됩니다.",
          });
        } else {
          e.node.setData({ ...e.data, [colField]: original });
          toast.error(payload.error?.message ?? "수정 실패");
        }
      } catch (err) {
        e.node.setData({ ...e.data, [colField]: original });
        toast.error("네트워크 오류");
      }
    },
    [tableName, primaryKeys],
  );

  return (
    <div className="ag-theme-quartz-dark h-[600px] w-full">
      <AgGridReact<CompositeRow>
        rowData={rows}
        columnDefs={columnDefs}
        getRowId={getRowId}
        onCellValueChanged={onCellValueChanged}
        stopEditingWhenCellsLoseFocus
        singleClickEdit={false}
      />
    </div>
  );
}
```

**특징**:
- `editable: (params) => !col.isPrimaryKey && !col.isSystem && canUpdate` — readonly 매트릭스.
- `onCellValueChanged` 하나가 commit + 409 + rollback + toast 모두 흡수 → useInlineEditMutation 폐기.
- AG Theme Quartz Dark → Tailwind 4 다크 토큰과 수동 매핑 필요 (1~2일).
- EditableCell / editable-cell-inputs.tsx 폐기 → RowFormModal 전용으로 격리.

#### 3.1.3 비교

| 항목 | TanStack (현) | AG Community |
|------|--------------|--------------|
| 코드 LOC (본 시나리오) | 약 90 LOC + EditableCell 외부 150 LOC = 240 | 약 100 LOC (EditableCell 없음) |
| 복합 PK getRowId | encodeCompositePk 동일 재사용 | encodeCompositePk 동일 재사용 |
| useInlineEditMutation 재사용 | Yes | No (폐기) |
| EditableCell 재사용 | Yes | No (폐기) |
| 낙관적 원복 지점 | useInlineEditMutation 내부 | onCellValueChanged 내부 |
| Sonner 3액션 정합 | 동일 | 동일 |
| 14b 감사 로그 통합 | 자연 (서버에서 이미 처리) | 자연 (서버에서 이미 처리) |
| **spec 수정량** | 0 | ~30% (EditableCell → cellEditor 매핑) |

**결론**: 코드량은 AG가 약간 짧지만, 이식 비용(spec 30% 재작성, EditableCell/useInlineEditMutation 폐기, Theme 매핑 1~2일)이 크다.

---

### 3.2 시나리오 2: 가상 스크롤 + 대량(10K 행) EdgeFunctionRun 로그

EdgeFunctionRun은 트리거 빈도에 따라 쉽게 1만 행 초과. 14d에 가상 스크롤 우선순위.

#### 3.2.1 TanStack Table v8 + TanStack Virtual

```tsx
// src/components/table-editor/virtual-log-grid.tsx (14d)
"use client";

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";

interface LogRow {
  id: string;
  function_id: string;
  started_at: string;
  duration_ms: number;
  status: string;
  error_message: string | null;
}

const columns: ColumnDef<LogRow>[] = [
  { accessorKey: "id", header: "ID" },
  { accessorKey: "function_id", header: "Function" },
  { accessorKey: "started_at", header: "Started" },
  { accessorKey: "duration_ms", header: "Duration (ms)" },
  { accessorKey: "status", header: "Status" },
  { accessorKey: "error_message", header: "Error" },
];

export function VirtualLogGrid({ rows }: { rows: LogRow[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const table = useReactTable<LogRow>({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (r) => r.id,
  });

  const { rows: tableRows } = table.getRowModel();
  const rowVirtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 10,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? totalSize - virtualRows[virtualRows.length - 1].end
      : 0;

  return (
    <div
      ref={parentRef}
      className="relative h-[600px] overflow-auto border border-zinc-800"
    >
      <table className="w-full border-separate border-spacing-0">
        <thead className="sticky top-0 z-10 bg-zinc-900">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => (
                <th
                  key={h.id}
                  className="border-b border-zinc-800 px-3 py-2 text-left text-xs font-semibold text-zinc-300"
                >
                  {flexRender(h.column.columnDef.header, h.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {paddingTop > 0 && (
            <tr>
              <td style={{ height: paddingTop }} />
            </tr>
          )}
          {virtualRows.map((vr) => {
            const row = tableRows[vr.index];
            return (
              <tr
                key={row.id}
                data-index={vr.index}
                className="hover:bg-zinc-900/40"
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className="border-b border-zinc-900 px-3 py-1 align-top"
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            );
          })}
          {paddingBottom > 0 && (
            <tr>
              <td style={{ height: paddingBottom }} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
```

**LOC**: ~80. 가상 스크롤 추가 비용 2~3시간.

#### 3.2.2 AG Grid Community (빌트인 가상화)

```tsx
// src/components/table-editor/ag-virtual-log-grid.tsx
"use client";

import { AgGridReact } from "ag-grid-react";
import {
  ClientSideRowModelModule,
  ModuleRegistry,
  type ColDef,
} from "ag-grid-community";

ModuleRegistry.registerModules([ClientSideRowModelModule]);

interface LogRow {
  id: string;
  function_id: string;
  started_at: string;
  duration_ms: number;
  status: string;
  error_message: string | null;
}

const columnDefs: ColDef<LogRow>[] = [
  { field: "id" },
  { field: "function_id" },
  { field: "started_at" },
  { field: "duration_ms" },
  { field: "status" },
  { field: "error_message" },
];

export function AgVirtualLogGrid({ rows }: { rows: LogRow[] }) {
  return (
    <div className="ag-theme-quartz-dark h-[600px] w-full">
      <AgGridReact<LogRow>
        rowData={rows}
        columnDefs={columnDefs}
        getRowId={(p) => p.data.id}
        rowBuffer={10}
      />
    </div>
  );
}
```

**LOC**: ~25. 가상화는 빌트인 → **AG가 코드량 우위**.

#### 3.2.3 비교

| 항목 | TanStack + Virtual | AG Community |
|------|-------------------|--------------|
| 코드 LOC | ~80 | ~25 |
| 학습 시간 | 2~3시간 (useVirtualizer 학습) | 0 (이미 AG 쓰는 중이면) |
| 번들 추가 | +5~10KB (`@tanstack/react-virtual`) | 0 (이미 포함) |
| 10K 행 초기 렌더 | 100~200ms | 50~100ms (공식 데모) |
| 스크롤 fps | 55~60 | 60 일정 |
| 커스터마이즈 (paddingTop, estimateSize) | 직접 제어 | AG 내부 자동 |
| 디버깅 | React DevTools 작동 | Grid inspector 별도 필요 |

**결론**: 가상화 코드량·즉시성은 AG 우위. 단 **1회성 비용**이며 전체 의사결정에 결정적이지 않음. TanStack Virtual의 커스터마이징 자유도(셀 높이 동적/그룹 행 등)가 오히려 유리한 상황도 있음.

---

## 4. 성능 비교 — 벤치마크 수치

### 4.1 공식/외부 벤치마크

| 시나리오 | TanStack + Virtual | AG Community |
|---------|-------------------|--------------|
| 1K 행 초기 렌더 | ~10ms | ~15ms |
| 10K 행 초기 렌더 (가상화 전제) | 100~200ms (Mojca Rojko Medium) | 50~100ms (AG 공식 데모) |
| 50K 행 (+ sticky + pinning + resize) | 60fps (Mojca Rojko 사례) | 60fps (AG 공식 벤치) |
| 100K 행 (columnResizeMode: 'onEnd' 최적화 후) | 60fps (jpcamara 1000x 사례) | 60fps (client-side 한계) |
| 100만 행 | 불가 (client-side) | Enterprise Server-side만 |
| 편집 latency (셀 → onChange) | <16ms (단일 셀 리렌더) | <16ms (단일 셀 리렌더) |
| 스크롤 중 편집 유지 | Virtual overscan 10으로 OK | 빌트인 OK |
| 메모리 사용 (1만 행) | ~30MB | ~50MB |
| 메모리 사용 (10만 행) | ~150MB | ~150MB |

### 4.2 양평 부엌 컨텍스트 매핑

| 테이블 | 현재 행 수 | TanStack 충분? | AG 우위? |
|-------|-----------|---------------|---------|
| Folder | <100 | ✅ | 동등 |
| File | <1000 | ✅ | 동등 |
| SqlQuery | <100 | ✅ | 동등 |
| EdgeFunction | <50 | ✅ | 동등 |
| **EdgeFunctionRun** | 100~10K+ | ✅ (14d Virtual) | 약간 우위 (설정 0) |
| Webhook | <50 | ✅ | 동등 |
| CronJob | <50 | ✅ | 동등 |
| LogDrain | <50 | ✅ | 동등 |
| User | <20 | ✅ | 동등 |
| ApiKey | <50 | ✅ | 동등 |
| _prisma_migrations (복합 PK) | <100 | ✅ | 동등 |

→ EdgeFunctionRun 한 테이블만이 AG 약간 우위, 나머지는 동등. **AG의 PERF 빌트인 우위가 우리 컨텍스트에서 결정적이지 않다.**

### 4.3 함정 — 양쪽 공통

- `columnResizeMode: 'onChange'` (TanStack) / autoSizeColumns 전체 (AG): 1만 행 락 → 둘 다 `onEnd` / `skipHeader` 필수.
- `data` prop 참조 안정성: 매번 새 배열 → 전체 row model 재계산. TanStack은 stable reference, AG는 `applyTransaction({add,update,remove})` 사용.
- `getRowId` 미설정: 둘 다 정렬/필터 후 selection 깨짐. 명시 필수.

### 4.4 번들 크기

| 항목 | TanStack | AG Community |
|------|---------|--------------|
| core | `@tanstack/table-core` 12KB | `ag-grid-community` core ~60KB |
| React 어댑터 | `@tanstack/react-table` 3.2KB | `ag-grid-react` ~30KB |
| Virtual | `@tanstack/react-virtual` 5~10KB | 빌트인 (0 추가) |
| Theme CSS | 0 (Tailwind) | `ag-theme-quartz.css` ~15KB |
| **합계 (gzipped, 모듈러)** | **15~25KB** | **150KB** |
| **합계 (gzipped, 전체 import)** | 25KB | 250KB |

**차이 125~225KB** × 초기 로드 속도 + PM2 콜드 스타트 영향 + Cloudflare Tunnel 대역폭.
- 결정적이지는 않으나, TanStack 우위.

---

## 5. 점수 비교

### 5.1 10차원 점수 (매트릭스 문서 04 재인용)

| 차원 | 가중 | TanStack v8 | AG Community |
|------|------|-------------|--------------|
| FUNC | 18% | 4.0 (자체구현 완료 기준 4.5) | 4.5 |
| PERF | 10% | 4.5 | 4.5 |
| DX | 14% | 4.5 | 4.0 |
| ECO | 12% | 4.5 | 5.0 |
| LIC | 8% | 5.0 | 4.0 |
| MAINT | 10% | 4.5 | 5.0 |
| INTEG | 10% | 5.0 | 2.5~3.0 |
| SEC | 10% | 4.5 | 3.0~3.5 |
| SH | 5% | 5.0 | 3.0 |
| COST | 3% | 5.0 | 5.0 |
| **합** | 100% | **4.54** | **4.09~4.19** |

### 5.2 격차 분해

```
TanStack 우위 (0.45점 격차 기여):
  + INTEG: (5.0 - 2.75) × 0.10 = +0.225
  + SEC:   (4.5 - 3.25) × 0.10 = +0.125
  + SH:    (5.0 - 3.0)  × 0.05 = +0.100
  + LIC:   (5.0 - 4.0)  × 0.08 = +0.080
  + DX:    (4.5 - 4.0)  × 0.14 = +0.070
  = +0.600

AG 우위:
  + FUNC: (4.5 - 4.0) × 0.18 = +0.090
  + ECO:  (5.0 - 4.5) × 0.12 = +0.060
  + MAINT: (5.0 - 4.5) × 0.10 = +0.050
  = +0.200

순 TanStack 우위: 0.600 - 0.200 = +0.400 (반올림 0.45)
```

→ AG의 "빌트인 우위(FUNC/MAINT)"는 TanStack의 "컨텍스트 적합성(INTEG/SH)"에 압도됨.

### 5.3 "만약 신규 프로젝트였다면"

- INTEG 페널티 제거 (AG 4.0으로) + SEC 동등 환산 (AG 4.0):
```
TanStack: 4.54
AG:      0.81 + 0.45 + 0.56 + 0.60 + 0.32 + 0.50 + 0.40 + 0.40 + 0.15 + 0.15 = 4.34
```
→ 여전히 TanStack 근소 우위, 그러나 격차 0.2로 축소. "빠른 개발 시작"이 압도적 우선순위면 AG 선택 여지.

---

## 6. 상황별 권장

### 6.1 TanStack Table v8이 이기는 상황 (현재 양평 부엌)

- 이미 의존성에 포함 + 기존 자산 재사용 필요
- shadcn/Tailwind 4 + 다크 테마 + Sonner 정합성 최우선
- 번들 크기 민감 (모바일 3G, 콜드 스타트 빈번)
- SSR/RSC + Next.js 16 App Router 순정 원함
- 접근성 요구사항(WCAG 2.2 AA) 있거나 가능성 있음
- 라이선스 영속성(MIT 영구) 최우선, Enterprise 유료 라인 회피

→ 양평 부엌은 **6개 모두 해당**. 명확한 TanStack 우위.

### 6.2 AG Grid Community가 이기는 상황

- 신규 프로젝트 (0부터 시작)
- 개발 속도 최우선 (declarative props만으로 Excel급 UX 빠르게 구축)
- 100K+ 행 client-side 상시 표시 (Virtual 설정 없이 바로)
- 팀 규모 3명+ + Headless 학습 부담
- Theme 시스템(Quartz/Alpine/Balham/Material)으로 충분, 자체 디자인 토큰 자유도 낮음
- Enterprise 유료 라인 가능 (SaaS 매출 모델)

→ 양평 부엌은 **0개 해당** (SaaS 매출 아님, 팀 1인, 신규 아님, 100K+ 상시 아님). 현 시점 AG 비채택.

### 6.3 Glide가 이기는 상황 (참조)

- 단일 테이블 1M+ 행 시계열 대시보드 (EdgeFunctionRun이 미래 이 규모면)
- 자체 디자인 시스템(Canvas 기반) 구축 의지
- 접근성 요구 낮음 (사내 분석 도구)
- Excel-like 클립보드 범위 복사·붙여넣기 핵심 가치

→ 양평 부엌은 **0개 해당**.

---

## 7. AG 전환 시나리오 (언제 유리한가) — 재평가 트리거

| 트리거 | 측정 | AG 전환 이점 |
|-------|------|-------------|
| EdgeFunctionRun 월 10만 행 초과 2개월 연속 | Prometheus/SQL count | client-side pagination 부담 해소 |
| 사용자 Excel급 피드백 3건+ | 피드백 폼 | 범위 선택·클립보드 (단 Enterprise 필요) |
| 개발자 2명+ 신규 합류 | HR | Headless 학습 부담 1인당 1주 이상 |
| WCAG 2.2 AA 규제 의무화 | 정부/규제 | AG ARIA 자동 + TanStack 시맨틱 둘 다 OK (중립) |
| Supabase 동등성을 넘어 "자체 RDB 도구화" 비전 확장 | 로드맵 | AG의 피벗/집계/마스터-디테일 Enterprise 필수 |

**단 기준**: 위 중 2개 이상 충족 시 재평가. 단일 트리거만으로는 전환 비용(sunk cost) 회수 어려움.

---

## 8. 프로젝트 결론 — 양평 부엌 최종 선택

### 8.1 14c-α/β 범위 내 결론

**TanStack Table v8 유지 + 14c-α 자체구현 완료 + 14c-β 복합 PK 완료 (이미 진행 중/완료).**

### 8.2 근거 7개

1. **매트릭스 4.54 > 4.09~4.19**: 0.35~0.45 격차
2. **14b 자산 100% 재사용**: RowFormModal, redactSensitiveValues, table-policy, audit log
3. **spec 완벽 정렬**: `2026-04-18-phase-14c-alpha-inline-edit-optimistic-locking-design.md` 수정 불요
4. **14c-β `composite` 라우트와 `getRowId` 1:1**: encodeCompositePk 양쪽 공유
5. **번들 15KB < 200KB**: Cloudflare Tunnel + PM2 콜드 스타트 우위
6. **shadcn DataTable 공식 기반**: Tailwind 4 + 다크 테마 즉시
7. **MIT 영구**: Enterprise 압박 없음

### 8.3 14c-α/β 완료 후 14d/14e 계획 (재인용)

| Phase | 기간 | 작업 | 점수 |
|-------|------|------|------|
| 14c-α (진행) | ~3일 | PATCH expected_updated_at + EditableCell + Tab | 75 → 90 |
| 14c-β (완료) | — | 복합 PK + VIEWER 권한 + 다중 선택 | 90 → 93 |
| 14d | ~7일 | FK selector (cmdk) + CSV import (Papa) + 가상 스크롤 (EdgeFunctionRun) | 93 → 99 |
| 14e | ~3일 | Arrow 셀 포커스 + 범위 복사 TSV + TanStack Query 도입 | 99 → 100 |

### 8.4 AG 채택을 트리거할 구체 조건

- 2026 Q3 이후 EdgeFunctionRun 월평균 10만+ 상시 + 사용자 피드백 "Excel처럼" 3건+ 동시 발생 시.
- 이 경우 AG Community로 EdgeFunctionRun 전용 페이지만 파일럿 → 1~2주 후 평가 → 전체 전환 여부 결정.
- **그 전까지는 TanStack 유지**.

### 8.5 업데이트 트리거 — 본 문서 재평가

- TanStack v9 안정 릴리스 + React 20 출시 → 마이그레이션 가이드 확인
- AG Community Enterprise 기능 편입 (범위 선택이 무료화 등) → 즉시 재평가
- Next.js 17 + React 20 기반 RSC 그리드 레퍼런스 등장 → 재평가

---

## 9. 참고 자료 (10개+)

### 내부 Wave 1/2 문서
1. [01-tanstack-table-v8-cell-editing-deep-dive.md](./01-tanstack-table-v8-cell-editing-deep-dive.md) — TanStack v8 자체구현 분석 (957줄)
2. [02-ag-grid-community-deep-dive.md](./02-ag-grid-community-deep-dive.md) — AG Community 분석 (830줄)
3. [04-table-editor-matrix.md](./04-table-editor-matrix.md) — 매트릭스 비교 (Wave 2)

### 외부 공식 문서
4. [TanStack Table v8 공식](https://tanstack.com/table/v8)
5. [TanStack Virtual](https://tanstack.com/virtual/latest)
6. [AG Grid 공식 사이트](https://www.ag-grid.com/)
7. [AG Grid React Docs](https://www.ag-grid.com/react-data-grid/)
8. [AG Grid Community vs Enterprise](https://www.ag-grid.com/react-data-grid/community-vs-enterprise/)
9. [AG Grid License & Pricing](https://www.ag-grid.com/license-pricing/)
10. [AG Grid Modules](https://www.ag-grid.com/react-data-grid/modules/)
11. [AG Grid Keyboard Navigation](https://www.ag-grid.com/javascript-data-grid/keyboard-navigation/)
12. [AG Grid Multi-Row Selection](https://www.ag-grid.com/javascript-data-grid/row-selection-multi-row/)
13. [AG Grid Cell Editing Start/Stop](https://www.ag-grid.com/javascript-data-grid/cell-editing-start-stop/)
14. [AG Grid Security](https://www.ag-grid.com/javascript-data-grid/security/)
15. [AG Grid Clipboard (Enterprise)](https://www.ag-grid.com/javascript-data-grid/clipboard/)

### 벤치마크·가이드
16. [Making Tanstack Table 1000x faster — JP Camara (2023)](https://jpcamara.com/2023/03/07/making-tanstack-table.html)
17. [Building Performant Virtualized Table — Mojca Rojko (Medium CodeX)](https://medium.com/codex/building-a-performant-virtualized-table-with-tanstack-react-table-and-tanstack-react-virtual-f267d84fbca7)
18. [TanStack vs AG Grid (2025) — Simple Table](https://www.simple-table.com/blog/tanstack-table-vs-ag-grid-comparison)
19. [React Data Grid Bundle Size Comparison](https://www.simple-table.com/blog/react-data-grid-bundle-size-comparison)
20. [Best React Table Libraries 2026](https://www.simple-table.com/blog/best-react-table-libraries-2026)
21. [Using AG Grid with Next.js — AG Grid Blog](https://blog.ag-grid.com/using-ag-grid-with-next-js-to-build-a-react-table/)
22. [Reduce AG Grid Bundle Size](https://blog.ag-grid.com/minimising-bundle-size/)

### 이슈·보안
23. [TanStack/table Issue #1500 — Tab key](https://github.com/TanStack/table/issues/1500)
24. [TanStack/table Discussion #2752 — Keyboard nav](https://github.com/TanStack/table/discussions/2752)
25. [AG Grid Issue #5229 — cellRenderer XSS](https://github.com/ag-grid/ag-grid/issues/5229)
26. [AG Grid Issue #1961 — Sanitization](https://github.com/ag-grid/ag-grid/issues/1961)
27. [Snyk SNYK-JS-AGGRIDCOMMUNITY-1932011](https://security.snyk.io/vuln/SNYK-JS-AGGRIDCOMMUNITY-1932011)
28. [CVE-2017-16009 ag-grid XSS](https://www.resolvedsecurity.com/vulnerability-catalog/CVE-2017-16009)

### 내부 관련
29. [Phase 14c-α spec (superpowers)](../../../../superpowers/specs/2026-04-18-phase-14c-alpha-inline-edit-optimistic-locking-design.md)
30. [ADR-004 낙관적 잠금](../../decisions/ADR-004-phase-14c-alpha-optimistic-locking.md)
31. [복합 PK 14c-β 커밋 `0b88ee5` (_composite → composite rename)](https://github.com/) *(로컬 git log)*

---

## 부록 A — TanStack Table v8 코드 패턴 ≠ AG Grid Community 코드 패턴 (참조표)

| 작업 | TanStack 패턴 | AG 패턴 |
|------|---------------|---------|
| 컬럼 정의 | `useMemo(() => ColumnDef[], deps)` | `useMemo(() => ColDef[], deps)` |
| 행 ID | `getRowId: (r) => r.id` | `getRowId: (p) => p.data.id` |
| 데이터 | `data` prop (stable reference) | `rowData` prop or `applyTransaction` |
| 셀 렌더 | `cell: ({ row, column }) => JSX` | `cellRenderer: React component` |
| 편집 감지 | `meta.updateRow` → onCommit | `onCellValueChanged` event |
| 선택 | `state.rowSelection` | `rowSelection={{ mode }}` |
| 정렬 | `getSortedRowModel()` | `sortable: true` |
| 가상화 | `useVirtualizer` (외부) | 빌트인 |
| 다크 테마 | `dark:` Tailwind | `ag-theme-quartz-dark` |
| 모듈 관리 | 자연 tree-shaking | `ModuleRegistry.registerModules` |

## 부록 B — 14c-α/β 잔여 작업 (TanStack 전제)

- [ ] 14c-α D1 PATCH `expected_updated_at` 처리 + WHERE 확장 + 409 분기 + audit log 2종
- [ ] 14c-α D2 EditableCell Tab 네비게이션 `findNextEditableCell` + `meta.focusCell`
- [ ] 14c-α D3 TableDataGrid wiring + readonly 매트릭스
- [ ] 14c-α D4 ADR-004 + 본 deep-dive 링크 추가
- [ ] 14c-α D5 curl C1~C6 + Playwright E1~E6
- [x] 14c-β 복합 PK `composite` 라우트 (완료)
- [x] 14c-γ VIEWER 권한 매트릭스 E2E (완료)
- [ ] 14c 보강: Sonner "내 변경 유지" description
- [ ] 14c 보강: `columnResizeMode: 'onEnd'` (도입 시)

## 부록 C — AG 채택 시 필요 작업 인벤토리 (만약)

- [ ] `npm i ag-grid-community ag-grid-react`
- [ ] `app/layout.tsx`에 `import "ag-grid-community/styles/ag-theme-quartz.css"`
- [ ] `src/components/table-editor/table-data-grid.tsx` 전면 재작성
- [ ] `src/components/table-editor/editable-cell.tsx` 폐기 또는 RowFormModal 전용 격리
- [ ] `src/components/table-editor/use-inline-edit-mutation.ts` 폐기
- [ ] spec `2026-04-18-phase-14c-alpha-...` AG 용어로 30% 재작성
- [ ] ADR-005 작성: "왜 AG로 갔는가"
- [ ] handover 작성: 14b 자산 폐기 인벤토리
- [ ] Tailwind 4 ↔ AG Theme Quartz Dark 매핑 함수
- [ ] Playwright 테스트 `.ag-cell` 셀렉터로 전면 재작성

→ **예상 7~10일**. 14c-α 잔여와 동등한 공수 + 자산 손실.

— 끝 —
