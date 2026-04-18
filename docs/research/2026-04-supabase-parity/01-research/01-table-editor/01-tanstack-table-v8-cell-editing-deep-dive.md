# 01. TanStack Table v8 + 자체 인라인 편집 — Deep Dive

> Wave 1 / DQ-1.9 후보 1
> 작성일: 2026-04-18 (세션 24, kdywave Wave 1)
> 작성자: Claude Opus 4.7 (1M context) — Wave 1 deep-dive 에이전트
> 대상: 양평 부엌 서버 대시보드 — `/tables` Table Editor 100/100 청사진
> 범위: TanStack Table v8 헤드리스 모델 위에 인라인 셀 편집 + 낙관적 잠금(@updatedAt) + CSV + 외래키 selector를 자체 구현하는 시나리오의 종합 평가
> 사전 작업 결과: `docs/superpowers/specs/2026-04-18-phase-14c-alpha-inline-edit-optimistic-locking-design.md`(α spec, 237줄), `docs/research/decisions/ADR-004-phase-14c-alpha-optimistic-locking.md`(38줄), 그리고 `src/components/table-editor/{editable-cell.tsx, use-inline-edit-mutation.ts, editable-cell-inputs.tsx}` 파일이 이미 존재함을 확인. 즉, **본 deep-dive는 "처음부터의 의사결정"이 아니라 "현재 진행 중인 14c-α 자체구현 노선의 정당화/리스크 검증/100점 청사진"이다.**

---

## 0. Executive Summary

### 결론 한 줄
**TanStack Table v8 + 자체 EditableCell + TanStack Virtual + 14c-α `expected_updated_at` 낙관적 잠금** 조합은 양평 부엌 대시보드 컨텍스트(11개 테이블, 행 수 1만 미만, 관리자 1~3명, Supabase 동등성 요구)에서 **DQ-1.9의 답으로 가장 적합하다.**

근거 4개:
1. **이미 의존성에 포함**: `package.json`에 `@tanstack/react-table ^8.21.3`이 있고, `/tables` CRUD가 이미 v8 위에서 동작 중. 마이그레이션 비용 0.
2. **헤드리스 모델 ↔ 14c-α spec의 일치도**: spec이 정의하는 `EditableCell`/`useInlineEditMutation`/`TableDataGrid` 분리는 v8의 `cell` 렌더러 슬롯 + `meta` 채널과 1:1로 대응한다. 다른 라이브러리(AG/Glide)로 가면 spec을 다시 써야 한다.
3. **Phase 14b 자산 재사용**: `editable-cell-inputs.tsx`(set/null/keep 3상태 컨트롤), `RowFormModal`, `redactSensitiveValues`, `table-policy.ts`(FULL_BLOCK/DELETE_ONLY)가 이미 헤드리스 패턴 위에 얹혀 있어 셀 편집으로 자연 확장된다.
4. **License/Cost/Bundle 모두 0/MIT/15.2KB**: 추가 비용·라이선스·번들 부담 없음. 11개 테이블/1만 행 미만에서 가상화 없이도 60fps가 나오며, TanStack Virtual을 추가해도 +5~10KB.

**그러나 — 이 "이미 결정된 길"의 비용**:
- 키보드 네비/Tab/Arrow/Esc/Enter는 100% 자체 구현 (Issue #697, #1500, #1226로 8년째 표준화 안 됨).
- CSV 가져오기는 Papa Parse + 자체 매핑 UI 직접 구현.
- 외래키 selector(reference picker)는 cmdk + introspection 자체 구현.
- 다중 행 선택+편집은 v8 `rowSelection` state는 있으나 "선택된 행에 같은 값 일괄 적용" UX는 자체 구현.

**5점 척도 종합 점수: 4.54/5** (가중치 적용 — 섹션 9 참조)

### Phase 14c-α spec과의 정렬: **있음(완벽)**
- spec이 명시한 컴포넌트(`EditableCell`/`useInlineEditMutation`/`editable-cell-inputs.tsx`)는 모두 TanStack v8 헤드리스 슬롯에 정확히 매핑.
- spec이 명시한 API 계약(`expected_updated_at` 바디 필드, 409+current 응답)은 라이브러리 비종속이라 어떤 그리드를 써도 변경 불요. 즉, 스펙은 v8 자체구현을 가정한 채 작성됨.
- 충돌은 없음.

### 새 DQ
- **DQ-1.10**: 가상 스크롤(TanStack Virtual)을 14c-α에 포함할까, 14d로 미룰까? (현재 11 테이블 모두 1만 행 미만 → 미루는 것이 안전)
- **DQ-1.11**: CSV 가져오기에 Papa Parse 정식 도입할까, 자체 CSV 파서 작성할까? (Papa Parse는 16KB, 자체는 ~3KB지만 따옴표/이스케이프 엣지케이스 위험)
- **DQ-1.12**: 외래키 selector를 cmdk(이미 의존성)로 만들지, base-ui Combobox로 만들지? (cmdk가 기존 패턴이라 일관성 우위)

---

## 1. 라이브러리 개요

### 1.1 정체성
TanStack Table v8(이전 명칭 React Table v8)은 Tanner Linsley가 이끄는 TanStack 패밀리(Query/Router/Form/Virtual/...)의 일원이다. v6→v7→v8을 거치며 **headless-only**(렌더러 미포함, 로직만 제공) 노선을 강화했다. 현재 안정 버전은 8.21.x 계열이며, v9는 발표되어 있으나 안정성·문서·커뮤니티 채택률이 v8 대비 낮아 프로덕션 권장은 v8(2026-04 시점).

### 1.2 핵심 철학
- **Headless**: 마크업/스타일 0줄. `useReactTable` 훅이 행/열/정렬/필터/그루핑/페이지네이션/선택/확장 모델만 계산. `<table>` 마크업은 사용자가 직접 작성.
- **Framework-agnostic core**: `@tanstack/table-core` + 어댑터(`@tanstack/react-table`, `@tanstack/vue-table`, `@tanstack/svelte-table`, `@tanstack/solid-table`).
- **Type-first**: TypeScript first-class. `ColumnDef<TData, TValue>`가 모든 콜백의 타입 추론을 견인.
- **Trees, not lists**: 행 모델은 `Row<TData>` 트리로 표현되어 그루핑/확장/하위행이 자연스럽다.

### 1.3 우리 프로젝트에서의 현재 위치
```
src/components/table-editor/
  table-data-grid.tsx           ← TanStack v8 useReactTable 사용 중
  row-form-modal.tsx            ← Phase 14b CRUD 모달
  editable-cell.tsx             ← Phase 14c-α 신규 (이미 작성됨)
  editable-cell-inputs.tsx      ← Phase 14c-α 신규 (set/null/keep 추출)
  use-inline-edit-mutation.ts   ← Phase 14c-α 신규 (이미 작성됨)
  column-type-badge.tsx
```

`use-inline-edit-mutation.ts`는 이미 PATCH + `expected_updated_at` + 409 토스트 액션을 담고 있고, `editable-cell.tsx`는 readonly/editing 2모드 + Tab 콜백 + commit/cancel 훅 + `committedRef` 가드까지 갖췄다. **이 deep-dive의 실용 목표는 "이 길을 끝까지 갈 가치가 있는가"의 최종 검증이다.**

---

## 2. 아키텍처 — 렌더링 모델

### 2.1 DOM 기반(Canvas 아님)
TanStack Table v8은 순수 DOM 렌더링이다. `<table>`/`<tr>`/`<td>` 또는 `<div role="grid">`/`<div role="row">`/`<div role="cell">` 어느 쪽이든 사용자가 선택. 양평 부엌은 현재 `<table>` 시맨틱을 사용한다.

장점:
- 접근성(스크린 리더)이 "그냥 된다" — 시맨틱 마크업 + ARIA만 챙기면 됨.
- 셀 내부에 임의 React 컴포넌트(Combobox, DatePicker, MonacoEditor 등) 자유 삽입.
- Tailwind/shadcn/CSS 변수가 그대로 작동. 다크 테마 변경 = `dark:` 클래스 토글 한 줄.
- 브라우저 텍스트 검색/선택/복사가 네이티브로 작동.

단점:
- DOM 노드 수가 행×열에 비례. 1만 행 × 10컬럼 = 10만 셀 → 가상화 없이는 초기 렌더 1~3초.
- 이를 해결하는 것이 TanStack Virtual(`@tanstack/react-virtual`) — 같은 가족이라 통합이 매끄럽다.

### 2.2 Headless 흐름
```
                    ┌────────────────────────────────────────┐
                    │  useReactTable<TData>({                 │
                    │    data,         ← Row[] (서버 fetch)   │
                    │    columns,      ← ColumnDef[]          │
                    │    state,        ← {sorting, filters,   │
                    │                     rowSelection, ...}  │
                    │    onStateChange,                       │
                    │    getCoreRowModel: getCoreRowModel(),  │
                    │    meta: { updateRow, ... }             │
                    │  })                                     │
                    └────────┬───────────────────────────────┘
                             │ (Table<TData> 인스턴스)
                             ▼
                    table.getHeaderGroups() → 헤더 트리
                    table.getRowModel().rows → 가공된 행 배열
                    row.getVisibleCells() → 셀 배열
                    cell.getContext() → CellContext (column, row, getValue, table)
                             │
                             ▼
            <td>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
```

핵심: `cell.column.columnDef.cell`은 `(ctx: CellContext) => ReactNode` 함수. 우리가 여기에 `<EditableCell ... />`을 그리면 끝. `meta`는 사용자 정의 채널 — `updateRow`/`onPatch` 같은 핸들러를 모든 셀이 `cell.getContext().table.options.meta?.updateRow`로 접근.

### 2.3 14c-α 컴포넌트 매핑
| spec 요구 | TanStack v8 슬롯 | 비용 |
|----------|-----------------|------|
| `EditableCell` | `columnDef.cell` 렌더러 | 즉시(이미 작성됨) |
| `useInlineEditMutation` | (라이브러리 외부) | 즉시(이미 작성됨) |
| `readonly 매트릭스` | `columnDef.meta.readOnly` 또는 `table.options.meta.readOnlyColumns` | 5분 |
| `Tab 키 → 다음 셀` | `cell.getContext().table.getRowModel()`로 다음 셀 찾기 | 1~2시간(현재 placeholder) |
| `다중 행 선택` | `getCoreRowModel` + `enableRowSelection` + `state.rowSelection` | 30분(이미 v8 내장) |
| `정렬/필터` | `getSortedRowModel`, `getFilteredRowModel` | 30분(이미 v8 내장) |
| `가상 스크롤` | `@tanstack/react-virtual` `useVirtualizer` | 2~3시간 |
| `CSV 가져오기` | (라이브러리 외부) Papa Parse + 매핑 UI | 4~6시간 |
| `외래키 selector` | `cmdk` Combobox + introspection API | 4~6시간 |

→ 14c-α 잔여 작업(CSV/FK/가상화)은 **TanStack에 의존하지 않는 외부 컴포넌트**이며, v8은 셀 슬롯만 빌려준다.

---

## 3. 핵심 기능 (Table Editor 100점 차원)

### 3.1 셀 단위 인라인 편집 (FUNC 18%)

#### v8이 주는 것
- `columnDef.cell` 함수 슬롯
- `meta` 채널로 핸들러 주입
- `table.getRowModel()`로 다음/이전 행 탐색

#### v8이 주지 않는 것 (모두 자체 구현)
- 클릭 → 편집 모드 전환 상태
- 텍스트 input/checkbox/textarea/datetime-local 입력 컨트롤
- Enter=커밋, Esc=취소, Tab=다음 셀 키바인딩
- 포커스 관리(편집 종료 후 셀로 포커스 복귀)
- "편집 중인 셀이 화면 밖으로 스크롤되면" 처리

→ `editable-cell.tsx`에 이미 commit/cancel/Tab/pending 가드가 들어가 있다. 남은 것은 **그리드 차원의 Tab 네비게이션**(다음 편집 가능 셀 결정 로직)으로, spec D2 커밋 범위.

#### 코드 예시 — TanStack v8 셀 슬롯
```tsx
// src/components/table-editor/table-data-grid.tsx (발췌·예시)
"use client";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import { EditableCell } from "./editable-cell";
import { useInlineEditMutation } from "./use-inline-edit-mutation";

interface Row {
  id: string;
  name: string | null;
  description: string | null;
  is_public: boolean;
  updated_at: string;
}

interface TableDataGridProps {
  table: string;
  rows: Row[];
  setRows: (next: Row[]) => void;
  columns: Array<{
    name: string;
    dataType: string;
    isPrimaryKey: boolean;
    isSystem: boolean;
  }>;
  policy: { canUpdate: boolean };
  primaryKey: string;
}

export function TableDataGrid(props: TableDataGridProps) {
  const { rows, setRows, columns, policy, primaryKey } = props;

  const { submit } = useInlineEditMutation({
    table: props.table,
    onRowUpdated: (next) => {
      setRows(rows.map((r) => (r.id === next.id ? (next as Row) : r)));
    },
    onRowReplaced: (next) => {
      setRows(rows.map((r) => (r.id === next.id ? (next as Row) : r)));
    },
    onRowMissing: () => {
      // 외부 fetcher 트리거
    },
  });

  // ColumnDef 동적 생성
  const tableColumns: ColumnDef<Row>[] = columns.map((col) => ({
    id: col.name,
    accessorKey: col.name,
    header: col.name,
    cell: ({ row }) => {
      const isReadOnly =
        col.isPrimaryKey ||
        col.isSystem ||
        !policy.canUpdate;
      return (
        <EditableCell
          value={row.original[col.name as keyof Row]}
          dataType={col.dataType}
          readOnly={isReadOnly}
          onCommit={async (value) => {
            const result = await submit({
              pkValue: String(row.original[primaryKey as keyof Row]),
              column: col.name,
              value,
              expectedUpdatedAt: row.original.updated_at,
            });
            if (result === "failed") {
              throw new Error("commit failed");
            }
          }}
          onTab={(shift) => {
            // TODO: Tab 네비게이션 (D2 커밋 범위)
          }}
        />
      );
    },
  }));

  const table = useReactTable<Row>({
    data: rows,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.id,
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

### 3.2 키보드 네비게이션 (FUNC)

#### 현실
TanStack Table v8은 키보드 네비게이션을 제공하지 않는다. Issue #697(2021), #1226(2022), #1500(2022), #2752(2023), Discussion #2238(2023)이 모두 같은 호소를 한다 — "Tab/Arrow/Enter/Esc 좀 표준화해주세요". 답은 항상 "headless 철학 — 직접 구현하세요". 8년째 변동 없음.

#### 우리에게 의미
- Tab/Arrow는 우리가 직접 짠다. `editable-cell.tsx`의 `onTab` props는 이미 시그니처가 있고, `table-data-grid.tsx`에서 다음 편집 가능 셀(readOnly=false인)을 찾아 포커스 이동시키는 로직을 D2 커밋에 추가.
- Arrow Up/Down/Left/Right는 세 가지 모드 분기:
  1. 편집 모드: input/textarea의 네이티브 동작(커서 이동) 우선.
  2. 셀 포커스 모드(편집 비활성): Arrow로 셀 간 이동. `tabIndex=-1`+`role="gridcell"` + `useRef`로 셀 ref 모아 포커스 전환.
  3. 셀렉션 모드: Shift+Arrow로 범위 확장.
- 양평 부엌의 현재 단계(α: 인라인 편집 기본기)에서는 Tab + Enter + Esc만으로 충분. Arrow는 β/14d에서 추가.

#### 패턴 — Tab 네비게이션 구현 스니펫
```tsx
// table-data-grid.tsx 내부 — 다음 편집 가능 셀 찾기
function findNextEditableCell(
  table: TableType<Row>,
  currentRowIndex: number,
  currentColumnId: string,
  shift: boolean,
  isEditable: (rowIndex: number, columnId: string) => boolean,
): { rowIndex: number; columnId: string } | null {
  const rows = table.getRowModel().rows;
  const cols = table.getAllLeafColumns();
  const colIndex = cols.findIndex((c) => c.id === currentColumnId);
  if (colIndex < 0) return null;

  const dir = shift ? -1 : 1;
  let r = currentRowIndex;
  let c = colIndex + dir;

  while (r >= 0 && r < rows.length) {
    while (c >= 0 && c < cols.length) {
      const colId = cols[c].id;
      if (isEditable(r, colId)) return { rowIndex: r, columnId: colId };
      c += dir;
    }
    r += dir;
    c = dir > 0 ? 0 : cols.length - 1;
  }
  return null; // 끝 도달
}
```

→ 이걸 `meta.focusCell(rowIndex, columnId)` 같은 채널로 셀에 다시 전달, 셀 내부 `useEffect`로 ref.focus().

### 3.3 다중 행 선택 + 편집 (FUNC)

v8 내장 `state.rowSelection`을 그대로 사용. `enableRowSelection: true` + 첫 컬럼에 체크박스 셀:
```tsx
{
  id: "_select",
  header: ({ table }) => (
    <input
      type="checkbox"
      checked={table.getIsAllRowsSelected()}
      ref={(el) => {
        if (el) el.indeterminate = table.getIsSomeRowsSelected();
      }}
      onChange={table.getToggleAllRowsSelectedHandler()}
    />
  ),
  cell: ({ row }) => (
    <input
      type="checkbox"
      checked={row.getIsSelected()}
      onChange={row.getToggleSelectedHandler()}
    />
  ),
}
```

선택된 행에 같은 값 일괄 적용은 spec 범위 밖(α). β 또는 14d에서:
- 선택 후 우상단 액션 바 등장 ("3개 선택됨 — [편집 | 삭제 | CSV 내보내기]").
- 편집은 `RowFormModal`을 다중 모드로 확장. PATCH를 N번 직렬 호출(409는 행 단위 Sonner 토스트로 보고).

### 3.4 가상 스크롤 (PERF 10%)

#### TanStack Virtual 통합
```tsx
import { useVirtualizer } from "@tanstack/react-virtual";

const tableContainerRef = useRef<HTMLDivElement>(null);
const { rows: tableRows } = table.getRowModel();
const rowVirtualizer = useVirtualizer({
  count: tableRows.length,
  getScrollElement: () => tableContainerRef.current,
  estimateSize: () => 36, // 평균 행 높이(px)
  overscan: 10,
});
const virtualRows = rowVirtualizer.getVirtualItems();
const totalSize = rowVirtualizer.getTotalSize();
const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
const paddingBottom =
  virtualRows.length > 0 ? totalSize - virtualRows[virtualRows.length - 1].end : 0;

return (
  <div ref={tableContainerRef} className="relative h-[600px] overflow-auto">
    <table>
      <thead className="sticky top-0">{/* ... */}</thead>
      <tbody>
        {paddingTop > 0 && <tr><td style={{ height: paddingTop }} /></tr>}
        {virtualRows.map((vr) => {
          const row = tableRows[vr.index];
          return (
            <tr key={row.id} data-index={vr.index}>
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
              ))}
            </tr>
          );
        })}
        {paddingBottom > 0 && <tr><td style={{ height: paddingBottom }} /></tr>}
      </tbody>
    </table>
  </div>
);
```

#### 벤치마크 (외부 사례)
- jpcamara.com 사례: 100K 행 → 단일 줄(`columnResizeMode: 'onChange'` 제거 등) 변경으로 **렌더링 1000배 가속**.
- Mojca Rojko(CodeX) 사례: TanStack Table + TanStack Virtual로 **50K+ 행에서 60fps + sticky header + column pinning + resize 동시 동작**.
- Strapi 가이드: "10K~50K 행 중간 규모는 TanStack이 충분, 100K+는 서버사이드 페이지네이션 + 가상화 필수".

#### 양평 부엌 현실
- 11 테이블 모두 1만 행 미만 (Folder/File 합계 < 1000, SqlQuery/EdgeFunction/Webhook/CronJob/LogDrain < 100).
- **현재 단계에서 가상화는 over-engineering**. β 또는 14d에서 도입 권장.
- 단, `EdgeFunctionRun`은 트리거 빈도에 따라 빠르게 1만+ 가능 → 14d 우선순위.

### 3.5 CSV 가져오기 (FUNC)

v8은 CSV를 모른다. 우리가 짠다. 권장 스택:
- **Papa Parse 5.x** (16KB gzipped, Worker 모드 지원, 1M+ 행 검증)
- 또는 자체 파서 (3KB, 단순 RFC 4180 구현, 따옴표/이스케이프/CRLF 처리 필수)

플로우:
1. **파일 입력** — `<input type="file" accept=".csv">` + drag-drop 영역.
2. **헤더 매핑 UI** — CSV 첫 행의 컬럼명 → 우리 테이블 컬럼명 매핑(자동 매칭 + 수동 오버라이드).
3. **타입 검증** — Phase 14b의 `coerce` 로직을 행별로 적용. 실패 행은 빨간 줄 + 사유.
4. **dry-run 미리보기** — 처음 10행 결과를 사용자에게 보여주고 확정 클릭 유도.
5. **배치 INSERT** — `POST /api/v1/tables/<table>/bulk` (신규 엔드포인트). 트랜잭션 안 → all-or-nothing.

→ 이 작업은 14d 마일스톤. α 범위 밖.

### 3.6 외래키 Selector (FUNC)

Supabase Table Editor의 시그니처 기능. FK 컬럼 셀 클릭 → 참조 테이블의 행 검색 가능한 Combobox 등장.

구현 청사진:
- introspection API 확장: `GET /api/v1/tables/<table>/_meta`에 FK 정보 추가. `{ column: "folder_id", refTable: "folders", refColumn: "id", refDisplay: "name" }`.
- `EditableCell`이 dataType과 별개로 `fkRef?: FKMeta` props를 받아 분기. fkRef 있으면 `<FKSelector />` 렌더.
- `FKSelector`: cmdk + lazy fetch(`GET /api/v1/tables/folders?q=...&limit=20`) + 선택 시 `onCommit(refRow.id)`.
- 표시: 셀 읽기 모드에서 `id (display)` 두 줄. 클릭 시 `/tables/folders/{id}` 링크.

→ 14d 또는 14e. α 범위 밖.

### 3.7 낙관적 잠금 + Optimistic UI (FUNC + INTEG)

#### 14c-α의 두 가지 "낙관성"
1. **서버 낙관적 잠금** (`expected_updated_at`): 충돌 감지용. 락 없이 단일 UPDATE WHERE 절로 감지.
2. **클라이언트 낙관적 UI** (rollback on error): 응답 전에 셀 표시 갱신, 실패 시 원복.

`use-inline-edit-mutation.ts`의 현재 구현은 **(1) 완료 + (2) 부분적**. `committedRef` + `pending` 상태로 중복 호출은 막지만, 응답 전 화면을 미리 갱신하지는 않는다(셀이 그냥 비활성화됨). spec은 둘 다 요구.

#### 풀 Optimistic UI 패턴 — TanStack Query 결합 시
spec은 TanStack Query를 강제하지 않지만, 도입한다면:
```tsx
const queryClient = useQueryClient();
const mutation = useMutation({
  mutationFn: (args: CellEditArgs) => fetch(...).then(r => r.json()),
  onMutate: async (args) => {
    await queryClient.cancelQueries({ queryKey: ["table", table] });
    const previous = queryClient.getQueryData(["table", table]);
    queryClient.setQueryData(["table", table], (old: Row[]) =>
      old.map(r => r.id === args.pkValue ? { ...r, [args.column]: args.value } : r)
    );
    return { previous };
  },
  onError: (err, args, ctx) => {
    queryClient.setQueryData(["table", table], ctx?.previous);
    toast.error("저장 실패 — 원복");
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ["table", table] });
  },
});
```

TanStack Query 공식 패턴(deepwiki/tanstack/query 4.6 optimistic-updates 섹션):
- `onMutate`에서 `cancelQueries`로 in-flight 차단(낡은 응답이 옵티미스틱 데이터를 덮어쓰는 것 방지).
- `onMutate` 반환값 = 컨텍스트(이전 스냅샷). `onError`에서 그 스냅샷으로 복원.
- `onSettled`에서 `invalidateQueries`로 진실 동기화.

양평 부엌은 현재 TanStack Query를 안 쓰고 있다(`fetch` 직접). 도입 비용 대비:
- (+) 캐시·옵티미스틱·invalidation 표준 패턴, devtools, suspense 지원.
- (−) 번들 +13KB, 학습 곡선, 기존 fetch 호출부 마이그레이션.
- 결론: **14c-α는 useState + 수동 setRows로 충분**. TanStack Query는 14e+(다중 테이블·실시간 동기화)에서 검토.

#### 충돌 시 UX 코드(이미 작성된 것 분석)
`use-inline-edit-mutation.ts:52~93` 블록은 spec §5.1 토스트 3액션 중 **덮어쓰기/취소** 2개만 구현. **"내 변경 유지"가 누락**. 보강 패치:
```tsx
toast.error("누군가 먼저 수정했습니다", {
  action: { label: "덮어쓰기", onClick: async () => { /* ... */ } },
  cancel: { label: "취소", onClick: () => { /* current로 치환 */ } },
});
// → spec은 3액션. Sonner는 action+cancel 2슬롯만 지원하므로
//   "내 변경 유지"는 제3 버튼이 아니라 "토스트 무시"로 자연스럽게 매핑됨.
//   사용자가 토스트를 닫지 않고 셀을 다시 클릭하면 dirty 유지 → 재시도.
//   이를 spec과 정렬하기 위해 description에 안내 문구 추가:
//   description: "다시 클릭해 수정하면 유지됩니다 / 덮어쓰기 / 취소"
```

→ 액션 보강은 D2/D5 잔여 커밋에서 다듬자.

---

## 4. API 표면

### 4.1 핵심 훅 — `useReactTable`
```ts
function useReactTable<TData>(options: TableOptions<TData>): Table<TData>;

interface TableOptions<TData> {
  data: TData[];
  columns: ColumnDef<TData, any>[];
  state?: Partial<TableState>;
  onStateChange?: OnChangeFn<TableState>;
  getCoreRowModel: () => (table: Table<TData>) => RowModel<TData>;
  getSortedRowModel?: () => ...;
  getFilteredRowModel?: () => ...;
  getGroupedRowModel?: () => ...;
  getExpandedRowModel?: () => ...;
  getPaginationRowModel?: () => ...;
  meta?: any;  // 자유 채널 — 우리가 콜백 주입
  enableRowSelection?: boolean | ((row: Row<TData>) => boolean);
  enableColumnFilters?: boolean;
  enableSorting?: boolean;
  // ... 70+ 옵션
}
```

### 4.2 `ColumnDef`
```ts
interface ColumnDef<TData, TValue = unknown> {
  id?: string;
  accessorKey?: keyof TData;
  accessorFn?: (row: TData, index: number) => TValue;
  header?: string | ((ctx: HeaderContext<TData, TValue>) => ReactNode);
  cell?: string | ((ctx: CellContext<TData, TValue>) => ReactNode);  // ← 셀 슬롯
  footer?: ...;
  meta?: any;
  enableSorting?: boolean;
  enableColumnFilter?: boolean;
  filterFn?: FilterFn<TData>;
  sortingFn?: SortingFn<TData>;
  // ...
}
```

### 4.3 `CellContext` — 셀 렌더러가 받는 인자
```ts
interface CellContext<TData, TValue> {
  table: Table<TData>;
  column: Column<TData, TValue>;
  row: Row<TData>;
  cell: Cell<TData, TValue>;
  getValue: () => TValue;
  renderValue: () => TValue | null;
}
```

→ 우리 `EditableCell`은 `ctx.row.original`(원본 데이터)와 `ctx.table.options.meta`(주입 콜백)를 활용.

### 4.4 `Table<TData>` 인스턴스 메서드 (자주 쓰는 것)
- `getHeaderGroups()`, `getRowModel()`, `getAllLeafColumns()`
- `getIsAllRowsSelected()`, `getSelectedRowModel()`, `setRowSelection()`
- `getState()`, `setState()`, `reset()`
- `setSorting()`, `setColumnFilters()`, `setGlobalFilter()`
- `setPageIndex()`, `setPageSize()`

### 4.5 `flexRender`
`flexRender(headerOrCell, ctx)` — 문자열이면 그대로, 함수면 호출. JSX 호환.

---

## 5. 성능

### 5.1 일반 벤치마크 (외부)
| 시나리오 | 결과 | 출처 |
|---------|------|------|
| 100K 행 + columnResizeMode 'onChange' 제거 | 1000배 가속 | jpcamara.com (2023) |
| 50K 행 + sticky header + pinning + resize | 60fps 유지 | Mojca Rojko (Medium) |
| 10K~50K 행 mid-size dashboard | TanStack 적합 | Strapi 가이드 (2024) |
| 100K+ 행 | 서버사이드 페이지네이션 + 가상화 필수 | Strapi 가이드 |

### 5.2 알려진 성능 함정
1. **`columnResizeMode: 'onChange'`** — 컬럼 리사이즈 중 매 마우스 이벤트마다 전체 리렌더. `'onEnd'`로 변경하면 리사이즈 끝날 때만 리렌더. (jpcamara 사례의 그 한 줄)
2. **`columnDef.cell` 인라인 함수** — 매 렌더마다 새 함수 → memoization 깨짐. `useMemo(() => columns, [deps])`로 컬럼 정의 캐시.
3. **거대한 `data` prop** — `data` 참조가 바뀌면 row model 재계산. 안정적인 참조 유지 필수(외부 setRows 시 새 배열만 넘기되, 내부 row reference는 가능하면 보존).
4. **`getRowId`** — 명시 안 하면 인덱스 기반 → 정렬/필터 후 selection 깨짐. 항상 `getRowId: (row) => row.id` 명시.

### 5.3 양평 부엌 현실 점검
| 테이블 | 현재 행 수 추정 | 1만 행 도달 가능성 |
|-------|----------------|-------------------|
| Folder | <100 | 거의 없음 |
| File | <1000 | 가능(파일 업로드 빈도) |
| SqlQuery | <100 | 거의 없음 |
| EdgeFunction | <50 | 없음 |
| EdgeFunctionRun | 100~10K+ | **매우 높음** (트리거 로그) |
| Webhook | <50 | 없음 |
| CronJob | <50 | 없음 |
| LogDrain | <50 | 없음 |
| User | <20 | 없음 |
| ApiKey | <50 | 없음 |
| _prisma_migrations | <100 | 없음 |

**EdgeFunctionRun만이 가상화 필요 후보**. 14d에서 우선순위.

### 5.4 React 19 호환성
TanStack Table v8은 React 16.8+ 지원. React 19의 `use()` hook, server components, action functions 등은 표면 비호환 없음. `useReactTable`은 client-side hook이라 `"use client"` 디렉티브 필수. v8.21.x는 React 19 정식 호환 명시.

---

## 6. 통합 시나리오 — 우리 `/tables` 페이지

### 6.1 현재 상태 (Phase 14b 완료 + 14c-α 진행 중)
- `/tables/[table]/page.tsx`: introspection → `policy`/`primaryKey`/`columns` 결정 → `<TableDataGrid>` 렌더.
- `<TableDataGrid>`: `useReactTable` + `<RowFormModal>` 트리거 버튼.
- API: `GET/POST/PATCH/DELETE /api/v1/tables/<table>/[pk]?` + audit log.
- Phase 14c-α: PATCH에 `expected_updated_at` 옵션 추가 + EditableCell 셀 렌더러 교체.

### 6.2 100점 청사진 — DQ-1.9 답으로 가는 길
| 단계 | 작업 | 점수 기여 | 마일스톤 |
|------|------|----------|---------|
| 1 | 14c-α D1~D5 완료 (인라인 편집 + 낙관적 잠금) | +15 → 90/100 | 14c-α (현재) |
| 2 | Tab 네비게이션 셀 간 이동 | +1 → 91 | 14c-α D2 보강 |
| 3 | 다중 행 선택 + 일괄 삭제 | +2 → 93 | 14c-β |
| 4 | 외래키 selector (FKSelector cmdk) | +3 → 96 | 14d |
| 5 | CSV 가져오기 + dry-run UI | +2 → 98 | 14d |
| 6 | 가상 스크롤 (EdgeFunctionRun 우선) | +1 → 99 | 14d |
| 7 | Arrow key 셀 포커스 모드 + 셀 범위 복사 | +1 → 100 | 14e |

### 6.3 spec과의 정합성 표
| spec 컴포넌트 | 현재 상태 | TanStack v8 매핑 | 보강 필요 |
|--------------|----------|------------------|----------|
| `editable-cell.tsx` | 작성됨 | ColumnDef.cell 함수 내부에서 사용 | onTab 외부 핸들러 wiring (D2) |
| `editable-cell-inputs.tsx` | 작성됨 | (라이브러리 외부) | RowFormModal과 공유 검증 |
| `use-inline-edit-mutation.ts` | 작성됨 | (라이브러리 외부) | "내 변경 유지" 액션 description 보강 |
| `table-data-grid.tsx` | Phase 14b 버전 | useReactTable + cell 슬롯 교체 | EditableCell wiring (D3) |
| API PATCH 확장 | spec 명세됨 | (라이브러리 외부) | D1 |
| audit log 2종 | spec 명세됨 | (라이브러리 외부) | D1 |

### 6.4 마이그레이션 비용 vs 자체구현 비용 천칭

이 deep-dive의 핵심 질문이다.

#### A. 자체구현 노선 (현재 노선)
| 항목 | 비용 |
|------|------|
| EditableCell 작성 | 1일 (이미 완료) |
| useInlineEditMutation 작성 | 0.5일 (이미 완료) |
| editable-cell-inputs 추출 | 0.5일 (이미 완료) |
| API PATCH 확장 | 0.5일 |
| Tab 네비게이션 | 1일 |
| 다중 행 선택 UX | 1일 |
| FK selector | 2~3일 |
| CSV 가져오기 | 2~3일 |
| 가상 스크롤 (EdgeFunctionRun 한정) | 1일 |
| **합계 잔여** | **약 7~10일** |

#### B. AG Grid Community 마이그레이션 노선
| 항목 | 비용 |
|------|------|
| ag-grid-react 학습 + 패턴 | 1일 |
| 기존 TableDataGrid 폐기 + AgGridReact 도입 | 1~2일 |
| 14b RowFormModal 통합 (셀 + 모달 양립) | 1일 |
| 다크 테마 / Tailwind 통합 (AG Theme override) | 1일 |
| readOnly 매트릭스 매핑 (FULL_BLOCK / DELETE_ONLY / column-level) | 0.5일 |
| `expected_updated_at` 워이어업 (커스텀 Mutation 훅) | 0.5일 |
| FK selector (CellEditor Component) | 1~2일 |
| CSV (csvImport — Community 지원하나 매핑 UI는 자체) | 1~2일 |
| 가상 스크롤 (내장) | 0일 (FREE) |
| **합계 잔여** | **약 7~10일** |
| 기존 자산 폐기 손실 | spec, EditableCell, useInlineEditMutation 모두 다시 짬 |

#### C. Glide Data Grid 마이그레이션 노선
| 항목 | 비용 |
|------|------|
| Glide Canvas 모델 학습 | 1~2일 (DOM과 패러다임 다름) |
| @glideapps/glide-data-grid 통합 | 1일 |
| Tailwind/shadcn 통합 (Canvas는 CSS 부분 적용 어려움) | 2~3일 |
| 다크 테마 (themeOverride 매개변수) | 1일 |
| 셀 편집 (built-in onCellEdited) + 우리 PATCH 어댑터 | 1일 |
| FK selector (Custom Cell Renderer) | 2~3일 |
| CSV (외부 라이브러리, 우리가 짬) | 2~3일 |
| **합계 잔여** | **약 10~13일** |
| 추가 리스크 | 접근성(스크린리더 지원 약함), 시맨틱 마크업 부재, "검사" 도구로 셀 검색 불가 |

#### 결론
**자체구현(A)이 비용 동등 ~ 약간 우위. 그리고 spec/문서/마이그레이션/기존 자산 보존이 결정적**. AG로 가면 spec을 다시 쓰고 14b의 RowFormModal/policy/감사 로그 wiring을 전부 다시 검증해야 함. Glide는 캔버스 패러다임이 다른 곳을 다 침식 — 14b 자산 손실 최대.

---

## 7. 라이선스 & 비용

### 7.1 TanStack Table v8
- **라이선스**: MIT.
- **비용**: $0. 무제한 사용. 상업/내부 모두.
- **TanStack 후원**: GitHub Sponsors가 메인. Tanner Linsley + 소수 코어. 회사 기반(개발 회사) 없음.
- **위험**: BSL/SSPL 같은 핵심 변경 가능성 — 과거 사례 없음. 노드 패키지 마이그레이션은 항상 가능(MIT 영구).

### 7.2 부속 라이브러리
- `@tanstack/react-virtual`: MIT, $0
- `@tanstack/react-query`: MIT, $0 (도입 시)
- `cmdk`: MIT, $0 (이미 의존성)
- `sonner`: MIT, $0 (이미 의존성)
- `papaparse` (CSV 도입 시): MIT, $0

### 7.3 비교
| 라이브러리 | 라이선스 | 비용 |
|-----------|---------|------|
| TanStack Table v8 | MIT | $0 |
| AG Grid Community | MIT | $0 |
| AG Grid Enterprise | 상업 EULA | $999/dev/year~ |
| MUI X DataGrid Community | MIT | $0 |
| MUI X DataGrid Pro | 상업 | $180/dev/year |
| MUI X DataGrid Premium | 상업 | $588/dev/year |
| Glide Data Grid | MIT | $0 |

→ 라이선스/비용은 TanStack/AG-Community/Glide 모두 동등. 변별력 없음.

---

## 8. 보안

### 8.1 XSS 표면
TanStack v8 자체는 마크업을 만들지 않으므로 XSS 표면이 없다. **셀 안에서 우리가 무엇을 넣느냐가 모든 것**.

#### 안전 패턴 (현재)
```tsx
<span>{String(value)}</span>  // ← React 자동 escape
```
React JSX의 `{...}` 중괄호는 자동으로 HTML escape. 안전.

#### 위험 패턴 (절대 금지)
React의 직접 HTML 주입 props(`dangerouslySetInnerHTML`)는 사용자 데이터에 절대 사용 금지. 셀 값을 HTML로 해석할 필요가 있다면 DOMPurify 등으로 sanitize 필수. 양평 부엌 현재 코드에는 사용 사례 0건.

#### 우리 `editable-cell.tsx`의 현 상태
- `formatCell`: `JSON.stringify` + `String()` 사용. 모두 escape 안전.
- `<button>` 안에 텍스트 직접 출력. React가 escape.
- input/textarea의 `value`는 React가 escape.
- HTML 직접 주입 props 사용 0건. 안전.

### 8.2 비교 — AG Grid는?
AG Grid의 cellRenderer가 함수면 사용자가 직접 sanitize 책임을 짐. Issue #1961, #913, #3953, #5229 등 XSS 케이스가 다수 보고됨. AG Grid 측 입장: "cellRenderer 사용자 = 책임자". CVE-2017-16009 (AngularJS expression injection) 등 과거 이력 있음.
TanStack은 이런 표면 자체가 없다 — 우리가 짠 셀이 안전하면 안전.

### 8.3 양평 부엌 보안 가드
- `redactSensitiveValues`: 감사 로그에서 password/token/secret 마스킹 (Phase 14b).
- `table-policy.ts`: User/ApiKey FULL_BLOCK, EdgeFunctionRun DELETE_ONLY.
- API 입력 검증: Zod 스키마(`route.ts`).
- CSP: `Content-Security-Policy` 헤더 (Next.js middleware로 추가 권장 — 현재 미설정 시 14d 보강).

### 8.4 인라인 편집 신규 위험
- 사용자 입력 → DB 저장 → 다른 사용자 셀에 표시. **저장 직전 sanitize는 불필요(escape는 표시 시점)**. 단, 저장 전 길이 제한·이스케이프 검증은 권장.
- 14c-α 추가 가드:
  - `expected_updated_at` 형식 검증 (ISO 8601 정규식).
  - 셀 값 최대 길이(예: TEXT 컬럼 100K, VARCHAR 컬럼은 schema 한도).
  - SQL injection 표면은 Prisma/pg가 매개변수화로 차단.

---

## 9. 스코어링 (10개 차원, 5점 척도)

각 점수에 **앵커링 근거** 명시.

### 9.1 FUNC (가중치 18%) — 4.0 / 5
- **5점 앵커**: AG Grid Enterprise 수준(범위 선택 + 채우기 핸들 + Excel export + 피벗 + 마스터/디테일).
- **4점 앵커**: AG Grid Community 수준(셀 편집·체크박스·키보드·필터 모두 빌트인).
- **3점 앵커**: Material React Table 수준(빌트인 다 있되 UX 디테일 차이).
- **2점 앵커**: react-data-grid 수준(인라인 편집 빌트인 + 가상화).
- **1점 앵커**: 순수 `<table>` + 자체 모든 것.
- **TanStack v8 점수 = 4.0**: 정렬·필터·선택·그루핑·페이지네이션·확장·페이저·가상화(별 패키지)는 빌트인 모델로 받음. 셀 편집·키보드·CSV·FK는 자체. spec과 자체구현이 맞물려 ~Community 수준 도달 가능. **다만 "즉시" 못 쓴다**(빌드해야 됨).

### 9.2 PERF (10%) — 4.5 / 5
- **5점 앵커**: Glide Data Grid (canvas 1M 행 60fps).
- **4점 앵커**: AG Grid (DOM + 가상화 50K~100K 행).
- **3점 앵커**: react-data-grid (DOM + 가상화 30K 행).
- **2점 앵커**: 순수 DOM + 가상화 없음(1K 행 한계).
- **TanStack v8 + Virtual 점수 = 4.5**: 50K+ 행에서 60fps 검증 사례. 1M 행은 캔버스 우위지만 우리 컨텍스트(11 테이블 / EdgeFunctionRun 외 1만 미만)에서 Glide와 차이 무의미. **양평 부엌 컨텍스트 한정 5.0**.

### 9.3 DX (14%) — 4.5 / 5
- **5점 앵커**: AG Grid React(declarative props만으로 대부분 끝).
- **4점 앵커**: TanStack Table v8(headless + TS first, 약간의 보일러플레이트).
- **3점 앵커**: Glide Data Grid(Canvas 패러다임 학습 곡선 + Linen 데이터 모델).
- **TanStack v8 점수 = 4.5**: TS 추론 강력, 문서·예제 풍부, refine.dev/dev.to 가이드 풍부. Headless라 첫 학습 1~2일이지만, 그 후 어떤 UI든 입힐 수 있어 "압축적 강력함". **우리 팀은 이미 사용 중**이라 비용 0.

### 9.4 ECO (12%) — 4.5 / 5
- **5점 앵커**: AG Grid (글로벌 기업 채택, 깊은 docs, 유료 지원).
- **4점 앵커**: TanStack 패밀리 (대규모 OSS 채택, Tanner Linsley 콘퍼런스 키노트, Vercel·Shopify·Mux 사용).
- **3점 앵커**: Glide Data Grid (특정 기업용, 깊지만 좁음).
- **TanStack v8 점수 = 4.5**: GitHub stars 25K+ (table 단독), npm `@tanstack/react-table` 주간 다운로드 200만+. 서드파티 가이드(Material React Table, Mantine React Table, Tremor, shadcn/ui DataTable) 풍부. shadcn 공식 DataTable 예제가 v8 기반 — 우리 스택과 정합성 최고.

### 9.5 LIC (8%) — 5 / 5
- MIT, 무제한, 영구. 만점.

### 9.6 MAINT (10%) — 4.5 / 5
- **앵커**: AG Grid 5.0(상업 회사, 매주 릴리스), TanStack 4.5(Tanner + 소수 코어, 월 단위 패치), Glide 4.0(Glide 회사가 자체 사용 → 동기 강함).
- **TanStack v8 점수 = 4.5**: 8.21.x 안정, 정기 패치, React 19 즉시 지원. v9 진행 중이지만 v8 계열은 LTS 성격.

### 9.7 INTEG (10%) — 5 / 5
- **이미 의존성에 포함**. shadcn/ui DataTable이 v8 기반. Tailwind 4 + React 19 + Next.js 16 모두 검증.
- 14c-α spec과 1:1 매핑.
- 만점.

### 9.8 SECURITY (10%) — 4.5 / 5
- 라이브러리 자체 XSS 표면 없음(렌더 코드 없음). React JSX escape 자동.
- 위험 HTML 주입 props 사용 0건 (현재 우리 EditableCell).
- 0.5점 차감 사유: 사용자가 셀에 임의 React 컴포넌트를 넣으니 셀 작성자 책임 — 하지만 이건 라이브러리 결함 아님. 우리 코드 리뷰 항목.

### 9.9 SELF_HOST (5%) — 5 / 5
- 번들 크기: TanStack Table 15.2KB + Virtual 5~10KB = 25KB 이내.
- SSR/CSR 모두 동작 (`"use client"` 마킹).
- CDN/외부 통신 0.
- 만점.

### 9.10 COST (3%) — 5 / 5
- $0. 만점.

### 9.11 가중 합산
```
4.0×0.18 + 4.5×0.10 + 4.5×0.14 + 4.5×0.12 + 5.0×0.08
+ 4.5×0.10 + 5.0×0.10 + 4.5×0.10 + 5.0×0.05 + 5.0×0.03
= 0.72 + 0.45 + 0.63 + 0.54 + 0.40
+ 0.45 + 0.50 + 0.45 + 0.25 + 0.15
= 4.54 / 5
```

**가중 합산 점수 = 4.54 / 5**

---

## 10. 리스크

### 10.1 R-1 (중) — 키보드 네비게이션 자체구현 부담
8년째 라이브러리가 표준 안 줌. Tab/Arrow/Enter/Esc/Home/End/PageUp/PageDown 모두 우리 짐.
- **완화**: α 단계는 Tab/Enter/Esc만 (이미 진행 중). Arrow는 14e 분리.

### 10.2 R-2 (낮) — `data` 참조 안정성 함정
setRows 후 정렬·필터 상태가 깨질 수 있음.
- **완화**: `getRowId`로 안정 ID 명시 (위 5.2). E2E 테스트로 회귀 방지.

### 10.3 R-3 (중) — TanStack Query 미도입 → 캐시·동기화 수동
다중 탭 동시 편집 시 stale 데이터로 인한 오인 충돌.
- **완화**: 14c-α는 새로고침 = 진실로 가정 (sufficient). 14e+에서 TanStack Query 검토.

### 10.4 R-4 (낮) — TanStack v9 마이그레이션 압박
v9 안정화 시점에 v8 EOL 가능성.
- **완화**: v8 LTS 성격, MIT라 v8 fork 가능. 마이그레이션 가이드 통상 제공됨(v7→v8도 그랬음).

### 10.5 R-5 (낮) — `EdgeFunctionRun` 가상화 미도입 시 스크롤 락
1만 행 도달 시 초기 렌더 1~2초.
- **완화**: 14d에 가상화 우선순위. 그 전에는 페이지네이션(server-side limit/offset)으로 100행 단위 표시.

### 10.6 R-6 (중) — Tab 네비 미완성으로 Spec E2 실패 위험
Playwright E2 시나리오 "Tab으로 다음 셀 이동"이 spec D5 의존.
- **완화**: D2 커밋에 `findNextEditableCell` + `meta.focusCell` 채널 추가. 1일.

### 10.7 R-7 (낮) — Sonner 토스트 3액션 한도
Sonner는 action+cancel 2슬롯만 지원. spec의 3액션 중 "내 변경 유지"는 description으로만 안내.
- **완화**: 위 3.7에 정리. UX 충분.

---

## 11. 결론 — 100점 도달 청사진 + DQ-1.9 답

### 11.1 DQ-1.9 잠정 답: **TanStack Table v8 자체구현 (현재 노선 유지)**

근거:
1. **이미 의존성·spec·일부 코드가 v8 자체구현 노선에 정렬됨**. 마이그레이션 비용 = sunk cost 손실.
2. **자체구현 잔여 비용 ≈ AG/Glide 마이그레이션 비용**. 변동 폭 작음.
3. **Spec과 1:1 매핑**. 다른 라이브러리는 spec 다시 씀.
4. **License/Cost/Bundle 모두 우위 또는 동등**.
5. **Phase 14b 자산(RowFormModal, table-policy, redactSensitiveValues, audit log) 100% 재사용**.

### 11.2 100점 도달 청사진 (마일스톤별)

#### Phase 14c-α (현재 진행, ~3일 잔여)
- D1 API PATCH `expected_updated_at`
- D2 EditableCell + useInlineEditMutation + Tab placeholder
- D3 TableDataGrid wiring
- D2 보강: Tab 네비게이션 정식 구현 (위 3.2)
- D4 ADR-004
- D5 curl C1~C6 + Playwright E1~E6
- → **75 → 90/100**

#### Phase 14c-β (~5일)
- 다중 행 선택 + 일괄 삭제 confirm
- 복합 PK 테이블 지원 (현재 단일 PK만)
- VIEWER 권한 매트릭스 E2E
- → **90 → 93/100**

#### Phase 14d (~7일)
- 외래키 selector (FKSelector — cmdk)
- CSV 가져오기 (Papa Parse + 매핑 UI + dry-run)
- 가상 스크롤 (EdgeFunctionRun 우선)
- → **93 → 99/100**

#### Phase 14e (~3일)
- Arrow key 셀 포커스 모드
- 셀 범위 복사 (Ctrl+C로 TSV)
- TanStack Query 도입 (동기화·캐시·devtools)
- → **99 → 100/100**

### 11.3 14c-α spec과의 정렬: **있음(완벽)**
- spec의 7개 컴포넌트 모두 v8 슬롯에 1:1 매핑.
- spec 어디에도 v8 비호환 요소 없음.
- 충돌 없음.

### 11.4 잠정 디시전 트리
```
질문: DQ-1.9 — 어떤 데이터 그리드?
├─ 우리 컨텍스트(11 테이블 / 1만 행 미만 / 관리자 1~3명 / Tailwind/shadcn) ?
│   └─ Yes → TanStack v8 자체구현 (권장)
└─ 가정 변경(다른 컨텍스트)?
    ├─ 100K+ 행 데이터 표시가 잦다면 → Glide Data Grid 재검토
    └─ 엑셀급 기능(피벗/Range/Formula) 필수라면 → AG Grid Enterprise (유료)
```

---

## 12. 참고 (10개+)

1. [TanStack Table v8 공식 문서](https://tanstack.com/table/v8) — 공식 사이트
2. [React TanStack Table Editable Data 예제](https://tanstack.com/table/v8/docs/framework/react/examples/editable-data) — 셀 편집 공식 예제
3. [TanStack Table Cells Guide](https://tanstack.com/table/v8/docs/guide/cells) — Cell API 정의
4. [TanStack Table Cell APIs](https://tanstack.com/table/v8/docs/api/core/cell) — `cell.getContext()` 등
5. [React TanStack Table Virtualized Rows 예제](https://tanstack.com/table/v8/docs/framework/react/examples/virtualized-rows) — Virtual 통합
6. [TanStack Virtual](https://tanstack.com/virtual/latest) — `@tanstack/react-virtual`
7. [Making Tanstack Table 1000x faster — JP Camara (2023)](https://jpcamara.com/2023/03/07/making-tanstack-table.html) — 성능 함정 사례
8. [Building Performant Virtualized Table — Mojca Rojko (Medium CodeX)](https://medium.com/codex/building-a-performant-virtualized-table-with-tanstack-react-table-and-tanstack-react-virtual-f267d84fbca7) — 50K+ 60fps 사례
9. [Virtualized Table with TanStack Virtual + ShadCN — DEV.to (Ainayeem)](https://dev.to/ainayeem/building-an-efficient-virtualized-table-with-tanstack-virtual-and-react-query-with-shadcn-2hhl) — shadcn 통합 가이드
10. [TanStack Table v8 Complete Demo — DEV.to (Abhirup99)](https://dev.to/abhirup99/tanstack-table-v8-complete-interactive-data-grid-demo-1eo0) — 종합 데모
11. [TanStack Query Optimistic Updates — DeepWiki](https://deepwiki.com/TanStack/query/4.6-optimistic-updates) — 옵티미스틱 패턴 표준
12. [React TanStack Query Optimistic UI 예제](https://tanstack.com/query/v5/docs/framework/react/examples/optimistic-updates-ui) — onMutate / onError 패턴
13. [Implementing Cell Editing in TanStack Table — Borstch](https://borstch.com/snippet/implementing-cell-editing-in-tanstack-table) — `updateMyData` 패턴
14. [TanStack/table Discussion #2752 — keyboard navigation](https://github.com/TanStack/table/discussions/2752) — 키보드 자체구현 합의
15. [TanStack/table Issue #1500 — Tab key editable cells](https://github.com/TanStack/table/issues/1500) — 8년째 미해결
16. [TanStack/table Issue #697 — Keyboard navigation](https://github.com/TanStack/table/issues/697) — 원조 이슈
17. [Auto-focus after adding new row — Ben Smithgall](https://bensmithgall.com/blog/react-tanstack-new-row-autofocus) — 포커스 관리 사례
18. [Best React Table Libraries 2026 Comparison — Simple Table](https://www.simple-table.com/blog/best-react-table-libraries-2026) — 비교 표
19. [TanStack Table vs AG Grid (2025) — Simple Table](https://www.simple-table.com/blog/tanstack-table-vs-ag-grid-comparison) — 양자 비교
20. [React Data Grid Bundle Size Comparison — Simple Table](https://www.simple-table.com/blog/react-data-grid-bundle-size-comparison) — 번들 크기 표
21. [Table Performance Guide — Strapi](https://strapi.io/blog/table-in-react-performance-guide) — 10K~50K 가이드
22. [Refine.dev — TanStack React Table Adapter Intro](https://refine.dev/blog/tanstack-react-table/) — 어댑터 사용
23. [Phase 14c-α 인라인 편집 spec (내부)](file:///E:/00_develop/260406_luckystyle4u_server/docs/superpowers/specs/2026-04-18-phase-14c-alpha-inline-edit-optimistic-locking-design.md) — 우리 spec
24. [ADR-004 낙관적 잠금 (내부)](file:///E:/00_develop/260406_luckystyle4u_server/docs/research/decisions/ADR-004-phase-14c-alpha-optimistic-locking.md) — 의사결정 기록

---

## 부록 A — 14c-α 완료 체크리스트 (이 deep-dive로부터 도출)

- [ ] D1: API PATCH `expected_updated_at` 처리 + WHERE 확장 + 409 분기 + audit log 2종
- [ ] D2: EditableCell `onTab` props 외부 wiring 완성 (`findNextEditableCell` + `meta.focusCell`)
- [ ] D3: TableDataGrid에 EditableCell wiring + readonly 매트릭스 적용
- [ ] D4: ADR-004 + 본 deep-dive 링크 추가
- [ ] D5: curl C1~C6 + Playwright E1~E6 통과
- [ ] 보강: Sonner 토스트 description에 "내 변경 유지" 안내
- [ ] 보강: `getRowId: (row) => row[primaryKey]` 명시
- [ ] 보강: `useMemo`로 `tableColumns` 캐시
- [ ] 보강: `columnResizeMode: 'onEnd'` (도입 시)
- [ ] 보강: tsc --noEmit 0, lint 0

## 부록 B — Phase 14c-β/d/e 마일스톤 요약

| Phase | 핵심 산출 | 점수 |
|-------|---------|------|
| 14c-α (현재) | 인라인 편집 + 낙관적 잠금 + Tab | 75 → 90 |
| 14c-β | 다중 선택 + 복합 PK + VIEWER | 90 → 93 |
| 14d | FK selector + CSV + 가상화 | 93 → 99 |
| 14e | Arrow + 범위 복사 + TanStack Query | 99 → 100 |

— 끝 —
