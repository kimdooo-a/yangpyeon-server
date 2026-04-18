# 09. Table Editor Blueprint — 카테고리 1 (Phase 18)

> Wave 4 · Tier 2 · B4 Editor 클러스터 산출물
> 작성일: 2026-04-18 (세션 28, kdywave W4-B4)
> 상위: [CLAUDE.md](../../../../CLAUDE.md) → [docs/research/2026-04-supabase-parity/](../) → [02-architecture/](./) → **이 문서**
> 연관: [01-adr-log.md](./01-adr-log.md) ADR-002 · [00-system-overview.md](./00-system-overview.md) · [08-sql-editor-blueprint.md](./08-sql-editor-blueprint.md)
> 근거 Wave 1: `01-research/01-table-editor/01~05` (5 문서) · Wave 2 매트릭스: `04-table-editor-matrix.md`
> 근거 Wave 3: `00-vision/02-functional-requirements.md §FR-1.*` · `00-vision/03-non-functional-requirements.md` · `00-vision/07-dq-matrix.md §3.1~3.2`
> 구현 참고: `docs/handover/260418-session24-phase-14c-alpha.md` · `260418-session24-phase-14c-beta.md`

---

## 0. 문서 목적 및 범위

### 0.1 역할

이 문서는 양평 부엌 서버 대시보드의 **Table Editor(카테고리 1)를 현재 75점에서 100점으로 끌어올리기 위한 단일 진실 소스 Blueprint**다. Phase 14c-α/β가 세션 24에서 이미 완료되었고, 14c-γ·14d·14e·14f 로드맵이 남은 상태다. Wave 4 Tier 2 산출물로서, 후속 구현 세션이 기존 자산을 정확히 파악하고 다음 단계를 시작할 수 있어야 한다.

### 0.2 현황 점수

| 구분 | 현재 점수 | 목표 점수 | 갭 |
|------|----------|----------|-----|
| Table Editor (카테고리 1) | 75/100 | 100/100 | 25점 |
| 전체 14 카테고리 공수 중 순위 | 중위 (~80h 잔여) | — | 잔여 10일 |

Phase 14c-α/β 완료로 기존 60점에서 75점으로 상승. 잔여 25점을 위해 14c-γ(VIEWER 권한 분리)·14d(CSV + FK 셀렉터)·14e(가상 스크롤 + TanStack Query)·14f(보너스) 4단계가 필요.

### 0.3 ADR 연결

- **ADR-002** (Accepted): "TanStack Table v8 헤드리스 자체구현 (AG Grid/Glide 거부)". Wave 1 점수 4.6/5, Wave 2 매트릭스 4.54/5. 재검토 트리거: 100만 행 p95 > 1.2s OR TanStack v9 ABI 깨짐.
- **ADR-001** (Accepted): "Multi-tenancy 의도적 제외". `tenant_id` 컬럼 추가 금지. Table Editor는 user-level 분리만.

---

## 1. 요약

### 1.1 Phase 14c-α (세션 24) 완료 상태

**완료된 기능** (`docs/handover/260418-session24-phase-14c-alpha.md` 기준):

| 컴포넌트 | 경로 | 상태 |
|----------|------|------|
| `TypedInputControl` | `src/components/table-editor/editable-cell-inputs.tsx` | 완료 |
| `EditableCell` | `src/components/table-editor/editable-cell.tsx` | 완료 |
| `useInlineEditMutation` | `src/components/table-editor/use-inline-edit-mutation.ts` | 완료 |
| `TableDataGrid` | `src/components/table-editor/table-data-grid.tsx` | 완료 |
| `RowFormModal` | `src/components/table-editor/row-form-modal.tsx` | 완료 (리팩토링) |
| PATCH API (낙관적 잠금) | `src/app/api/v1/tables/[table]/[pk]/route.ts` | 완료 |
| 복합 PK PATCH API | `src/app/api/v1/tables/[table]/composite/route.ts` | 완료 |

**핵심 구현 패턴**:
- `expected_updated_at` 필드 기반 낙관적 잠금 — `WHERE updated_at = $M` 조건 + `SET ..., updated_at = NOW()` 자동 주입
- 409 CONFLICT → Sonner 토스트 3액션(덮어쓰기/유지/취소)
- 감사 로그 2종: `TABLE_ROW_UPDATE` (locked:bool metadata) + `TABLE_ROW_UPDATE_CONFLICT`
- `systemColumns` prop (기본 `["created_at", "updated_at"]`) — 편집 불가 컬럼 지정

### 1.2 Phase 14c-β (세션 24 연장) 완료 상태

**완료된 기능** (`docs/handover/260418-session24-phase-14c-beta.md` 기준):

| 컴포넌트 | 경로 | 상태 |
|----------|------|------|
| 복합 PK 라우트 | `src/app/api/v1/tables/[table]/composite/route.ts` | 완료 |
| 스키마 API 확장 | `src/app/api/v1/tables/[table]/schema/route.ts` | 완료 (`compositePkColumns: string[]` 추가) |
| UI 훅 분기 | `use-inline-edit-mutation.ts` | 완료 (`compositePkColumns` + `/composite` URL 분기) |
| UI 그리드 확장 | `table-data-grid.tsx` | 완료 (`isPkCol` 일반화) |

**핵심 세션 24 버그 기록 (Compound Knowledge)**:
- `_composite` 폴더명 → Next.js 16 private directory 인식 → 폴더명 `composite`(언더스코어 제거)로 해결
- `TIMESTAMP` vs `TIMESTAMP(3)` 정밀도 불일치 → 낙관적 잠금 WHERE 매칭 실패 → Prisma 모델과 동일한 `TIMESTAMP(3)` 사용 필수

### 1.3 Phase 14c-γ (예정)

**USER-as-VIEWER 권한 분리** — 세션 24c spec에서 정의, 세션 25-A 라이브 매트릭스에서 확인. 아직 미구현.

**핵심 변경**: 현재 코드에서 `USER` 롤은 읽기 전용이지만, 명시적 VIEWER 분리 UI가 없음. 14c-γ에서 `USER` 롤 접근 시 그리드 편집 모드 진입 자체를 차단하고, "읽기 전용 모드" 뱃지와 안내 메시지를 표시한다.

### 1.4 잔여 로드맵 요약

| Phase | 별칭 | 기간 | 핵심 목표 | 점수 변화 |
|-------|------|------|----------|----------|
| 14c-γ | VIEWER 분리 | 2일 (16h) | USER 롤 읽기 전용 뱃지 + 편집 모드 진입 차단 | 75 → 80 |
| 14d | CSV + FK 셀렉터 | 4일 (32h) | Papa Parse CSV import/export + cmdk FK 셀렉터 | 80 → 90 |
| 14e | 가상 스크롤 + TanStack Query | 3일 (24h) | TanStack Virtual + TanStack Query v5 도입 | 90 → 97 |
| 14f | 보너스 | 1일 (8h) | table_editor_preferences 저장, 추가 UX | 97 → 100 |
| **합계** | | **10일 (80h)** | | 75 → 100 |

---

## 2. Wave 1-2 채택안 (ADR-002)

### 2.1 TanStack Table v8 자체구현 — 점수 4.54/5, 최고점

**채택 이유**: Wave 2 매트릭스 4.54/5. Phase 14b에서 이미 기초 자산(`RowFormModal`, `table-policy`, `redactSensitiveValues`, audit log)이 TanStack v8 헤드리스 기반으로 구현됨. 라이브러리 교체 시 이 자산을 전부 재검증해야 하므로 마이그레이션 비용이 교체 이득을 초과한다.

**핵심 자산 목록** (TanStack v8 위에 구축):
1. `TypedInputControl` — 컬럼 타입별 입력 위젯(text/number/boolean/date/JSON)
2. `EditableCell` — 셀 인라인 편집 (click→focus, Enter/Esc/Tab, amber dirty ring)
3. `useInlineEditMutation` — PATCH + 409 CONFLICT Sonner 3액션 + 복합 PK 분기
4. `TableDataGrid` — TanStack Table v8 헤드리스 래퍼 + `systemColumns` + `policy`
5. `RowFormModal` — 행 추가/편집 폼 모달 (TypedInputControl 재사용)

### 2.2 AG Grid — 거부 (CON-7 + CON-9)

**거부 이유** (ADR-002 §고려한 대안):
- AG Grid Enterprise: 상용 라이선스 $999/개발자 (CON-9 비용 상한 위반)
- AG Grid Community: MIT이지만 Phase 14b 자산 재사용 불가 → INTEG 점수 2.5/5 (14c-α 자체구현 5.0/5 대비)
- Wave 2 매트릭스 3.71~4.19/5 — 14c-α 자체구현 4.54 대비 열위

### 2.3 Glide Data Grid — 거부 (GPL + 낮은 통합 점수)

**거부 이유** (ADR-002 §고려한 대안):
- GPL 라이선스 (CON-7 GPL 거부 원칙)
- 통합 점수 1.5~2.0/5 (14c-α 5.0 대비 최저)
- Canvas 기반이라 shadcn/ui Tailwind 4 테마 토큰 통합 어려움

---

## 3. 컴포넌트 설계

### 3.1 컴포넌트 계층 (Phase 14c-γ 이후 목표 상태)

```
/app/(protected)/tables/
├── page.tsx                                # 테이블 목록 (TableSummary 그리드)
└── [table]/
    └── page.tsx                            # 테이블 상세 (TableDetailPage)

/components/table-editor/
├── table-data-grid.tsx                     # TanStack Table v8 헤드리스 래퍼 [기존]
├── editable-cell.tsx                       # 셀 인라인 편집 컴포넌트 [기존 14c-α]
├── editable-cell-inputs.tsx                # TypedInputControl 공용 입력 위젯 [기존 14c-α]
├── use-inline-edit-mutation.ts             # PATCH + 409 훅 [기존 14c-α/β]
├── row-form-modal.tsx                      # 행 추가/편집 모달 [기존]
├── table-viewer-badge.tsx                  # USER 롤 읽기 전용 뱃지 [신규 14c-γ]
├── csv-import-modal.tsx                    # Papa Parse CSV import [신규 14d]
├── csv-export-button.tsx                   # CSV export 버튼 [신규 14d]
├── fk-cell-selector.tsx                    # cmdk 기반 FK 셀렉터 [신규 14d]
├── virtual-table-body.tsx                  # TanStack Virtual 가상 스크롤 [신규 14e]
└── use-table-query.ts                      # TanStack Query v5 테이블 데이터 훅 [신규 14e]
```

### 3.2 TableGrid — TanStack v8 헤드리스 래퍼 (현재 `table-data-grid.tsx`)

현재 구현된 `TableDataGrid`는 TanStack Table v8의 `useReactTable` 훅을 사용하며 다음 기능을 포함한다:

```typescript
// src/components/table-editor/table-data-grid.tsx (현재 구현 요약)

interface TableDataGridProps {
  table: string;
  userRole: "ADMIN" | "MANAGER" | "USER";
  policy: { canUpdate: boolean; canDelete: boolean };
  refreshToken: number;
  onEditRow: (row: Record<string, unknown>) => void;
  onDeleteRow: (row: Record<string, unknown>) => void;
  systemColumns?: string[];  // 기본: ["created_at", "updated_at"]
}
```

TanStack v8 헤드리스 특성상 렌더링 레이어(HTML 구조, Tailwind 클래스)가 완전히 자체 구현이며, shadcn/ui 디자인 토큰과 100% 통합된다. 결과 패널(ResultPanel)은 SQL Editor의 동일 컴포넌트를 재사용할 수 있다(FR-2.1 세부 요구사항 5번).

### 3.3 InlineCellEditor — 기존 `EditableCell` + `TypedInputControl`

Phase 14c-α에서 완성된 인라인 셀 편집 시스템. 컬럼 타입에 따라 `TypedInputControl`이 적절한 입력 위젯을 렌더링:

| 컬럼 타입 | 입력 위젯 | 검증 |
|----------|----------|------|
| `varchar`, `text` | `<input type="text">` | 길이 제한 |
| `int`, `float`, `numeric` | `<input type="number">` | 숫자 범위 |
| `boolean` | `<input type="checkbox">` | true/false |
| `date`, `timestamp` | `<input type="datetime-local">` | ISO 8601 |
| `json`, `jsonb` | `<textarea>` + JSON.parse 검증 | 유효한 JSON |
| `uuid` | `<input type="text">` + UUID 정규식 | |
| FK 컬럼 (14d) | `FkCellSelector` (cmdk) | 참조 테이블 존재 확인 |

### 3.4 CSVImportExport — Papa Parse 도입 (Phase 14d)

**DQ-1.11 확정 답변**: **Papa Parse 정식 도입** (자체 파서 거부). 이유: 자체 구현의 따옴표/이스케이프 엣지 케이스(RFC 4180 완전 준수 어려움), 멀티라인 필드, BOM 처리 등에서 Papa Parse(16KB gzip)가 확실히 안전하다.

```typescript
// src/components/table-editor/csv-import-modal.tsx

import Papa from "papaparse";

interface CsvImportModalProps {
  table: string;
  columns: ColumnMeta[];
  onClose: () => void;
  onImported: (count: number) => void;
}

export function CsvImportModal({ table, columns, onClose, onImported }: CsvImportModalProps) {
  const [preview, setPreview] = useState<string[][]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  const parseFile = useCallback((file: File) => {
    Papa.parse<string[]>(file, {
      header: false,
      skipEmptyLines: true,
      preview: 100,          // DRY-RUN: 첫 100행 미리보기 (DQ-2.2 반영)
      complete(result) {
        setPreview(result.data.slice(0, 5));  // 화면에 5행만 표시
        setErrors(result.errors.map((e) => e.message));
      },
    });
  }, []);

  // 실제 import: Papa Parse Workers는 Phase 14e (DQ-2.2 확정)
  const importAll = useCallback(async (file: File) => {
    return new Promise<void>((resolve, reject) => {
      Papa.parse<Record<string, string>>(file, {
        header: true,
        skipEmptyLines: true,
        complete: async (result) => {
          const res = await fetch(`/api/v1/tables/${table}/import`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rows: result.data }),
          });
          const json = await res.json();
          if (!json.success) reject(new Error(json.error?.message));
          else { onImported(json.data.insertedCount); resolve(); }
        },
        error: reject,
      });
    });
  }, [table, onImported]);

  // ...
}
```

**CSV export** (`csv-export-button.tsx`):

```typescript
// Supabase Studio DownloadResultsButton 패턴 차용 (Apache-2.0)

export function CsvExportButton({ table }: { table: string }) {
  const handleExport = useCallback(async () => {
    const res = await fetch(`/api/v1/tables/${table}/export?format=csv`);
    if (!res.ok) { toast.error("CSV export 실패"); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${table}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [table]);

  return (
    <button onClick={handleExport} className="...">
      CSV 내보내기
    </button>
  );
}
```

### 3.5 FkSelector — cmdk 기반 (Phase 14d, DQ-1.12 / DQ-2.1 확정 답변)

**DQ-1.12 확정 답변**: **cmdk 유지** (base-ui Combobox 대체 불필요). 이유: cmdk는 현재 프로젝트에서 이미 사용 중이며, shadcn/ui의 `Combobox` 컴포넌트가 cmdk 기반으로 구현되어 있어 디자인 토큰 일관성 최고.

**DQ-2.1 확정 답변**: `use-downshift` 대체 Combobox 검토 불필요. cmdk 유지.

```typescript
// src/components/table-editor/fk-cell-selector.tsx

import { Command } from "cmdk";

interface FkCellSelectorProps {
  column: ColumnMeta;
  currentValue: string | null;
  referencedTable: string;   // FK 참조 테이블명 (introspection 결과)
  referencedColumn: string;  // FK 참조 컬럼명
  onSelect: (value: string) => void;
  onClose: () => void;
}

export function FkCellSelector({
  column,
  currentValue,
  referencedTable,
  referencedColumn,
  onSelect,
  onClose,
}: FkCellSelectorProps) {
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<{ value: string; label: string }[]>([]);

  // 참조 테이블에서 후보 값 로드 (최대 100건)
  useEffect(() => {
    fetch(`/api/v1/tables/${referencedTable}/rows?size=100&sort=${referencedColumn}&order=asc`)
      .then((r) => r.json())
      .then((body) => {
        if (body.success) {
          setOptions(
            body.data.rows.map((row: Record<string, unknown>) => ({
              value: String(row[referencedColumn]),
              label: String(row[referencedColumn]),
            })),
          );
        }
      });
  }, [referencedTable, referencedColumn]);

  return (
    <Command>
      <Command.Input
        value={search}
        onValueChange={setSearch}
        placeholder={`${referencedTable} 검색...`}
      />
      <Command.List>
        {options
          .filter((o) => o.label.includes(search))
          .map((o) => (
            <Command.Item
              key={o.value}
              onSelect={() => { onSelect(o.value); onClose(); }}
            >
              {o.label}
            </Command.Item>
          ))}
      </Command.List>
    </Command>
  );
}
```

**FK 컬럼 감지**: `schema` API에서 `foreignKeys: { column, referencedTable, referencedColumn }[]` 필드를 반환하도록 확장. `TableDataGrid`가 이 정보를 기반으로 해당 컬럼의 `EditableCell`에 `FkCellSelector`를 주입한다.

### 3.6 VirtualScroller — TanStack Virtual (Phase 14e, DQ-1.10 확정 답변)

**DQ-1.10 확정 답변**: **가상 스크롤 14e로 미룸** (14c-α 포함 거부). 이유: 현재 11개 테이블 모두 1만 행 미만(Wave 1 01문서 §37 근거). 가상 스크롤 없이도 p95 800ms 목표(NFR-PERF.1) 충족 가능. Phase 14e에서 `@tanstack/react-virtual`을 도입해 가상화.

```typescript
// src/components/table-editor/virtual-table-body.tsx (Phase 14e)

import { useVirtualizer } from "@tanstack/react-virtual";

interface VirtualTableBodyProps {
  rows: Row<Record<string, unknown>>[];  // TanStack Table v8 rows
  rowHeight: number;                     // 기본 40px
}

export function VirtualTableBody({ rows, rowHeight }: VirtualTableBodyProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 10,           // 뷰포트 앞뒤 10행 선렌더링
  });

  return (
    <div ref={parentRef} style={{ height: "600px", overflow: "auto" }}>
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
        {virtualizer.getVirtualItems().map((virtualRow) => (
          <div
            key={virtualRow.index}
            style={{
              position: "absolute",
              top: `${virtualRow.start}px`,
              height: `${rowHeight}px`,
              width: "100%",
            }}
          >
            {/* 행 렌더링 */}
          </div>
        ))}
      </div>
    </div>
  );
}
```

**도입 전략**: 14e에서 `TableDataGrid`의 `<tbody>` 부분을 `VirtualTableBody`로 교체. 10만 행 이하에서는 기존 비가상 렌더링과 성능 차이 미미하나, 향후 대용량 테이블 대비.

### 3.7 TableQuery — TanStack Query v5 도입 (Phase 14e, DQ-2.3 확정 답변)

**DQ-2.3 확정 답변**: **TanStack Query 도입은 14e에서만** (14c-β 선도 도입 거부). 이유: 현재 `useState + 수동 setRows`가 현재 11테이블 규모에서 충분히 동작. TanStack Query 도입 시 `QueryClient` 설정 + `queryKey` 구조화 + `invalidateQueries` 패턴이 추가되는데, 현재 인라인 편집 → `setRefreshToken` 패턴이 더 단순하고 충분함.

```typescript
// src/components/table-editor/use-table-query.ts (Phase 14e)

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export const tableQueryKey = (table: string, page: number, size: number) =>
  ["table", table, page, size] as const;

export function useTableRows(table: string, page: number, size: number) {
  return useQuery({
    queryKey: tableQueryKey(table, page, size),
    queryFn: async () => {
      const res = await fetch(`/api/v1/tables/${table}/rows?page=${page}&size=${size}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message);
      return json.data as { rows: Record<string, unknown>[]; total: number };
    },
    staleTime: 30_000,   // 30초 캐시 (FR-1.1 count 캐시 TTL 30초 동기화)
    placeholderData: (prev) => prev,  // 페이지 전환 시 이전 데이터 유지
  });
}

export function useTableRowMutation(table: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      pk,
      data,
      expectedUpdatedAt,
    }: {
      pk: string;
      data: Record<string, unknown>;
      expectedUpdatedAt?: string;
    }) => {
      const res = await fetch(`/api/v1/tables/${table}/${encodeURIComponent(pk)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, expected_updated_at: expectedUpdatedAt }),
      });
      const json = await res.json();
      if (!json.success) throw Object.assign(new Error(json.error?.message), { code: json.error?.code, current: json.error?.current });
      return json.data;
    },
    onSuccess() {
      // 해당 테이블의 모든 페이지 무효화
      queryClient.invalidateQueries({ queryKey: ["table", table] });
    },
  });
}
```

---

## 4. Phase 14c-α/β 기존 구현 정확한 인용

### 4.1 Phase 14c-α 완료 API 엔드포인트

**`PATCH /api/v1/tables/[table]/[pk]`** — 단일 PK 행 업데이트

```
요청 바디: {
  data: Record<string, unknown>,          // 변경할 컬럼만
  expected_updated_at?: string            // ISO 타임스탬프 (낙관적 잠금)
}

응답 (200): { success: true, data: { row: Record<string, unknown> } }
응답 (409): { success: false, error: { code: "CONFLICT", current: Record<string, unknown> } }
응답 (404): { success: false, error: { code: "NOT_FOUND" } }
응답 (400): { success: false, error: { code: "INVALID_EXPECTED_UPDATED_AT" } }
```

**핵심 구현 (α의 2차 근본 수정)**:
```typescript
// updated_at 자동 bump (raw SQL에서는 @updatedAt 미작동 — 버그 수정)
if (hasUpdatedAtCol && !userSetUpdatedAt) {
  setClauses.push(`updated_at = NOW()`);
}
// 낙관적 잠금 WHERE 조건
if (expectedUpdatedAt) {
  whereConditions.push(`updated_at = $${paramCount++}`);
  params.push(new Date(expectedUpdatedAt));
}
```

### 4.2 Phase 14c-β 완료 API 엔드포인트

**`PATCH /api/v1/tables/[table]/composite`** — 복합 PK 행 업데이트

```
요청 바디: {
  pk_values: Record<string, unknown>,     // 모든 PK 컬럼 값
  data: Record<string, unknown>,
  expected_updated_at?: string
}

응답 (400): { success: false, error: { code: "NOT_COMPOSITE" } }  — 단일 PK 테이블에 호출 시
응답 (400): { success: false, error: { code: "PK_VALUES_INCOMPLETE" } }
응답 (400): { success: false, error: { code: "UNKNOWN_PK_COLUMN" } }
```

### 4.3 Phase 14c-γ spec (세션 24c → 25-A 라이브 매트릭스)

**USER-as-VIEWER 분리 spec**:

| 조건 | 현재 동작 | 14c-γ 목표 |
|------|----------|-----------|
| `USER` 롤, 편집 가능 테이블 | 셀 클릭 시 편집 모드 진입 가능 | 클릭 무시 + "읽기 전용 모드" 뱃지 표시 |
| `USER` 롤, 행 추가 버튼 | 조건부 숨김 (현재 canInsert=false) | 완전 숨김 + ADMIN/MANAGER만 표시 |
| `USER` 롤, 행 삭제 버튼 | 조건부 숨김 (현재 canDelete=false) | 완전 숨김 |
| `MANAGER` 롤 | 삽입/수정 가능, 삭제 불가 | 현행 유지 |
| `ADMIN` 롤 | 모든 작업 가능 | 현행 유지 |

**`table-viewer-badge.tsx` 신규 컴포넌트**:

```typescript
// src/components/table-editor/table-viewer-badge.tsx

export function TableViewerBadge() {
  return (
    <span className="flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-800/50 px-2.5 py-1 text-xs text-zinc-400">
      <EyeIcon size={12} />
      읽기 전용 — 편집 권한 없음 (ADMIN/MANAGER만 편집 가능)
    </span>
  );
}
```

---

## 5. CSV 처리 — Papa Parse (DQ-1.11 / DQ-2.2)

### 5.1 DQ-1.11 확정 답변

| 항목 | 내용 |
|------|------|
| **질문** | CSV 가져오기에 Papa Parse(16KB)를 정식 도입할까, 자체 CSV 파서(~3KB)를 작성할까? |
| **확정 답변** | **Papa Parse 정식 도입 (자체 파서 거부)** |
| **정량 근거** | (1) 자체 파서 RFC 4180 완전 준수 비용 ~24h (엣지 케이스: 멀티라인 필드, 인용 부호 내 콤마, BOM). (2) Papa Parse 16KB gzip — 번들 영향 NFR-PERF.8 250KB 목표 내 (SQL editor 서버 포매터 포함 여유분 충분). (3) Papa Parse `header: true` + `skipEmptyLines` + 스트리밍 지원으로 기능 완성도 압도적 차이. |

### 5.2 DQ-2.2 확정 답변

| 항목 | 내용 |
|------|------|
| **질문** | 14d CSV import에 Papa Parse Workers 모드를 포함할지, 14e로 미룰지? |
| **확정 답변** | **14d는 메인 스레드 파싱 + 100행 DRY-RUN, Workers는 Phase 14e** |
| **정량 근거** | (1) 현재 최대 CSV 파일 예상: 수천 행 이하 (1인 운영, 단순 데이터 수정). 메인 스레드 파싱 블로킹 시간 < 200ms. (2) Workers 모드 설정은 별도 WebWorker 번들 + Webpack/Turbopack 설정 필요 — 14d 공수 +8h 추가. (3) 14e에서 TanStack Virtual 가상 스크롤 도입 시점에 함께 Workers 모드 활성화가 자연스러운 흐름. |

### 5.3 CSV import API

```typescript
// src/app/api/v1/tables/[table]/import/route.ts

export async function POST(req: NextRequest, { params }: { params: Promise<{ table: string }> }) {
  const { table } = await params;
  const { rows } = await req.json() as { rows: Record<string, string>[] };

  // 권한 확인 (ADMIN/MANAGER만)
  const session = await getSession(req);
  if (!["ADMIN", "MANAGER"].includes(session?.user?.role)) {
    return NextResponse.json({ success: false, error: { message: "권한 없음" } }, { status: 403 });
  }

  // 테이블 정책 확인 (FULL_BLOCK 테이블 거부)
  if (FULL_BLOCK_TABLES.includes(table)) {
    return NextResponse.json({ success: false, error: { message: `${table} 테이블은 직접 편집 불가` } }, { status: 403 });
  }

  // 청크 단위 INSERT (1000행 단위)
  let insertedCount = 0;
  for (let i = 0; i < rows.length; i += 1000) {
    const chunk = rows.slice(i, i + 1000);
    // Prisma 7 createMany
    const result = await prisma[table as keyof typeof prisma].createMany({
      data: chunk,
      skipDuplicates: true,
    });
    insertedCount += result.count;
  }

  return NextResponse.json({ success: true, data: { insertedCount } });
}
```

---

## 6. FK 셀렉터 — cmdk 유지 (DQ-1.12 / DQ-2.1)

### 6.1 FK 정보 introspection 확장

Phase 14d에서 스키마 API(`/api/v1/tables/[table]/schema`)에 FK 정보를 추가한다:

```typescript
// 스키마 API 응답 확장 (Phase 14d)
interface SchemaResponse {
  columns: ColumnMeta[];
  primaryKey: { column: string; dataType: string } | null;
  compositePk: boolean;
  compositePkColumns: string[];          // 기존 14c-β 추가
  foreignKeys: {                         // 신규 14d 추가
    column: string;
    referencedTable: string;
    referencedColumn: string;
    constraintName: string;
  }[];
}
```

PostgreSQL `information_schema.referential_constraints` + `key_column_usage`에서 FK 정보를 조회:

```sql
SELECT
  kcu.column_name         AS column,
  ccu.table_name          AS referenced_table,
  ccu.column_name         AS referenced_column,
  tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.referential_constraints rc
  ON tc.constraint_name = rc.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON rc.unique_constraint_name = ccu.constraint_name
WHERE tc.table_name = $1
  AND tc.constraint_type = 'FOREIGN KEY'
```

### 6.2 FkCellSelector 통합 플로우

1. `TableDataGrid`가 스키마 로드 시 `foreignKeys` 배열 저장
2. 셀 렌더링 시 해당 컬럼이 FK 컬럼이면 `EditableCell`에 `isFkColumn={true}` + `fkInfo` 전달
3. `EditableCell` 편집 모드 진입 시 FK 컬럼이면 `<input>` 대신 `FkCellSelector` 렌더링
4. `FkCellSelector`는 cmdk `Command.Input` + 참조 테이블 데이터 로드 → 선택 시 값 반환

---

## 7. 데이터 모델

### 7.1 기존 10개 테이블 (Table Editor 대상 전체)

현재 `prisma/schema.prisma`에 정의된 모든 테이블이 Table Editor 대상이다. 각 테이블의 편집 정책:

| 테이블 | 편집 정책 | 이유 |
|--------|----------|------|
| `users` | `FULL_BLOCK` | 전용 사용자 관리 페이지 사용 (`/settings/users`) |
| `api_keys` | `FULL_BLOCK` | 전용 API 키 관리 페이지 사용 |
| `_prisma_migrations` | `FULL_BLOCK` | 마이그레이션 이력 — 직접 편집 금지 |
| `edge_function_runs` | `DELETE_ONLY` | 실행 로그 — 삽입/수정 불허, 삭제만 허용 |
| `folders` | 일반 편집 | ADMIN/MANAGER: INSERT/UPDATE/DELETE |
| `files` | 일반 편집 | ADMIN/MANAGER: INSERT/UPDATE/DELETE |
| `sql_queries` | 일반 편집 | ADMIN/MANAGER: INSERT/UPDATE/DELETE |
| `edge_functions` | 일반 편집 | ADMIN/MANAGER: INSERT/UPDATE/DELETE |
| `webhooks` | 일반 편집 | ADMIN/MANAGER: INSERT/UPDATE/DELETE |
| `cron_jobs` | 일반 편집 | ADMIN/MANAGER: INSERT/UPDATE/DELETE |

### 7.2 신규 `table_editor_preferences` 테이블 (Phase 14f)

사용자별 테이블 정렬/필터 저장. SQLite(Drizzle)에 저장(Prisma PostgreSQL 스키마 변경 없음).

```typescript
// src/db/sqlite/schema.ts (Phase 14f 추가)

export const tableEditorPreferences = sqliteTable("table_editor_preferences", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  tableName: text("table_name").notNull(),
  sortColumn: text("sort_column"),
  sortOrder: text("sort_order", { enum: ["asc", "desc"] }),
  pageSize: integer("page_size").default(25),
  hiddenColumns: text("hidden_columns"),  // JSON 직렬화 string[]
  activeFilters: text("active_filters"),  // JSON 직렬화 FilterDef[]
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date()),
}, (t) => ({
  uniqueUserTable: unique().on(t.userId, t.tableName),
}));
```

### 7.3 CSV import 임시 스테이징 (Phase 14d)

대용량 CSV import 시 `Papa.parse` 결과를 직접 API에 POST하는 방식(§5.3)을 사용. 별도 스테이징 테이블 없음. 100행 DRY-RUN 후 사용자 확인 → 전체 import.

---

## 8. UI 설계

### 8.1 기존 `/dashboard/tables` 확장

현재 테이블 목록 페이지(`/tables/page.tsx`)는 카드 그리드 형태. Phase 14d에서 다음을 추가한다:

```typescript
// /tables/page.tsx 확장 (Phase 14d)

// 현재: 카드 그리드 + 테이블명/컬럼수/행 추정치만 표시
// 14d 추가:
// - "CSV 가져오기" 버튼 (테이블 선택 후 CsvImportModal 오픈)
// - 검색 필터 입력 (테이블명 실시간 필터)
// - RLS 정책 수 뱃지 (Schema Visualizer ADR-004 연계 준비)
```

### 8.2 `/tables/[table]` 확장

현재 구현된 `table-detail-page.tsx` 기반으로 단계적 확장:

**Phase 14c-γ 추가**:
```tsx
{/* 상단 헤더 우측 */}
{userRole === "USER" && <TableViewerBadge />}
{canInsert && <AddRowButton />}
{userRole === "USER" && (
  <span className="text-xs text-zinc-500">
    데이터를 조회할 수 있습니다. 편집하려면 ADMIN/MANAGER 권한이 필요합니다.
  </span>
)}
```

**Phase 14d 추가**:
```tsx
{/* 상단 헤더 우측 */}
{canInsert && <CsvImportButton onClick={() => setCsvModalOpen(true)} />}
<CsvExportButton table={table} />

{/* 페이지 하단 */}
{csvModalOpen && (
  <CsvImportModal
    table={table}
    columns={columns}
    onClose={() => setCsvModalOpen(false)}
    onImported={(count) => { toast.success(`${count}행 가져오기 완료`); setRefreshToken((t) => t + 1); }}
  />
)}
```

**Phase 14e 추가**:
```tsx
{/* TableDataGrid 내 tbody를 VirtualTableBody로 교체 */}
<TableDataGrid
  table={table}
  userRole={userRole}
  policy={{ canUpdate, canDelete }}
  useVirtualScroll={true}   // Phase 14e 플래그
  useQueryCache={true}      // TanStack Query 활성화
  // ...
/>
```

### 8.3 인라인 편집 UX (현재 구현 시각화)

```
┌─────────────────────────────────────────────────────────┐
│  folders 테이블                    [행 추가] [CSV ↑] [↓] │
├────┬────────────────┬────────────────┬───────────────────┤
│ id │ name           │ parent_id      │ created_at        │
├────┼────────────────┼────────────────┼───────────────────┤
│ 1  │ 문서            │ (null)         │ 2026-04-01        │
├────┼────────────────┼────────────────┼───────────────────┤
│ 2  │ [이미지       ] │ (null)         │ 2026-04-01        │
│    │  ↑ 편집 중 (amber│               │                   │
│    │  ring + dirty)  │               │                   │
├────┼────────────────┼────────────────┼───────────────────┤
│ 3  │ 백업            │ 1              │ 2026-04-02        │
└────┴────────────────┴────────────────┴───────────────────┘

409 CONFLICT 토스트:
  ┌─────────────────────────────────────────────────────┐
  │ ⚠ 다른 세션이 먼저 수정했습니다                       │
  │ 현재 값: "이미지_2"                                   │
  │ [덮어쓰기] [내 값 유지] [취소]                         │
  └─────────────────────────────────────────────────────┘
```

---

## 9. 통합 — Schema Visualizer(RLS Permissions) + Audit Logs

### 9.1 RLS Permissions 통합 (ADR-004, Phase 20)

`/tables` 테이블 목록 페이지에서 테이블별 RLS 활성 여부 + 정책 수를 뱃지로 표시. 데이터 소스는 `pg_class.relrowsecurity` + `pg_policies` 조회. Phase 20(Schema Visualizer) 완료 후 통합 UI 구성.

```typescript
// Phase 14d에서 준비 — 뱃지 자리 예약
interface TableSummary {
  schema: string;
  name: string;
  rowEstimate: number;
  columnCount: number;
  rlsEnabled?: boolean;      // Phase 20 통합 시 채워짐
  policyCount?: number;      // Phase 20 통합 시 채워짐
}
```

### 9.2 Audit Logs 통합 (SQLite)

Phase 14c-α에서 구현된 `TABLE_ROW_UPDATE` / `TABLE_ROW_UPDATE_CONFLICT` / `TABLE_ROW_DELETE` 감사 로그 3종은 SQLite `audit_logs` 테이블에 저장. `/audit` 페이지(`src/app/(protected)/(admin)/audit/page.tsx`)에서 조회 가능.

**감사 로그 레코드 구조**:
```typescript
interface AuditLog {
  id: string;
  action: "TABLE_ROW_UPDATE" | "TABLE_ROW_UPDATE_CONFLICT" | "TABLE_ROW_DELETE" | "TABLE_ROW_INSERT";
  userId: string;
  table: string;
  pk: string | Record<string, unknown>;  // 단일 PK 또는 복합 PK map
  metadata: {
    locked?: boolean;
    expected?: string;       // CONFLICT 시 예상 updated_at
    actual?: string;         // CONFLICT 시 실제 updated_at
    oldValue?: Record<string, unknown>;
    newValue?: Record<string, unknown>;
  };
  createdAt: Date;
}
```

---

## 10. Wave 4 할당 DQ 최종 답변

### DQ-1.10 — 가상 스크롤 포함 단계

| 항목 | 내용 |
|------|------|
| **질문** | TanStack Virtual 가상 스크롤을 14c-α에 포함할까, 14d로 미룰까? |
| **확정 답변** | **14e로 미룸 (14c-α 포함 거부)** |
| **정량 근거** | (1) 현재 11개 테이블 모두 1만 행 미만(Wave 1 §37). 페이지 크기 25~100 범위에서 렌더링 p95 < 200ms — 가상화 불필요. (2) `@tanstack/react-virtual` 도입 시 TableDataGrid tbody 구조 전면 개편 필요 — 14c-α에서 추가 시 EditableCell/useInlineEditMutation 통합 테스트 부담 2배. (3) 14e는 TanStack Query 도입과 함께 "데이터 레이어 강화" 단계 — 가상 스크롤이 이 타이밍에 자연스럽게 통합됨. |
| **구현 위치** | Phase 14e, `src/components/table-editor/virtual-table-body.tsx` |

### DQ-1.11 — CSV 파서 선택

| 항목 | 내용 |
|------|------|
| **질문** | CSV 가져오기에 Papa Parse(16KB)를 정식 도입할까, 자체 CSV 파서(~3KB)를 작성할까? |
| **확정 답변** | **Papa Parse 정식 도입 (자체 파서 거부)** |
| **정량 근거** | (1) 자체 파서 RFC 4180 완전 구현 비용 ~24h. Papa Parse 16KB gzip = NFR-PERF.8 250KB 초기 청크 여유분 내(sql-formatter 서버 이동 후 +130KB 여유 확보). (2) Papa Parse는 5,000+ GitHub Star, 활발한 유지보수, 주요 엣지케이스(멀티라인, BOM, 따옴표 escape) 전부 처리. (3) `preview: 100` 옵션으로 DRY-RUN 구현 즉시 가능. |
| **구현 위치** | Phase 14d, `src/components/table-editor/csv-import-modal.tsx` |

### DQ-1.12 — 외래키 셀렉터 컴포넌트

| 항목 | 내용 |
|------|------|
| **질문** | 외래키 selector를 cmdk(기존 의존성)로 만들지, base-ui Combobox로 만들지? |
| **확정 답변** | **cmdk 유지 (base-ui Combobox 전환 불필요)** |
| **정량 근거** | (1) cmdk는 `package.json`에 이미 포함(shadcn/ui Combobox 의존성). 신규 의존성 추가 없음. (2) shadcn/ui `Command` 컴포넌트가 cmdk 기반 — 디자인 토큰(border, bg, text 클래스) 일관성 최고. (3) base-ui Combobox는 2026-04 기준 beta 상태, 안정성 미검증. Wave 2 매트릭스 01 §33 근거. |
| **구현 위치** | Phase 14d, `src/components/table-editor/fk-cell-selector.tsx` |

### DQ-2.1 — cmdk vs use-downshift

| 항목 | 내용 |
|------|------|
| **질문** | 14d FK selector 구현 시 cmdk 외에 `use-downshift` 대체 Combobox 검토가 필요한가? |
| **확정 답변** | **검토 불필요, cmdk 유지** |
| **정량 근거** | DQ-1.12와 동일. `use-downshift`는 추가 의존성이며 shadcn/ui와 독립적 — 스타일 통합 공수 +8~12h 예상. cmdk의 현재 구현 대비 기능 이점 없음. |
| **구현 위치** | DQ-1.12와 동일 |

### DQ-2.2 — Papa Parse Workers 단계

| 항목 | 내용 |
|------|------|
| **질문** | 14d CSV import에 Papa Parse Workers 모드를 포함할지, 14e로 미룰지? |
| **확정 답변** | **14d는 메인 스레드 파싱 + 100행 DRY-RUN, Workers는 Phase 14e** |
| **정량 근거** | (1) 예상 최대 CSV 크기: 수천 행(1인 운영). 메인 스레드 파싱 시 블로킹 < 200ms — 사용자 인지 불가. (2) Workers 모드는 Webpack/Turbopack `workerize-loader` 또는 `worker_threads` 설정 필요 — 14d 공수 +8h. (3) 14e에서 TanStack Virtual 도입 시점에 Workers 함께 활성화 — 대용량 CSV 가상 렌더링 연동이 자연스러움. |
| **구현 위치** | Phase 14e, `csv-import-modal.tsx` Workers 모드 플래그 활성화 |

### DQ-2.3 — TanStack Query 도입 시점

| 항목 | 내용 |
|------|------|
| **질문** | TanStack Query 도입은 14e에서만 진행할지, 14c-β에서 선도적으로 넣을지? |
| **확정 답변** | **14e에서만 도입 (14c-β 선도 도입 거부)** |
| **정량 근거** | (1) 현재 `useState + 수동 setRows + setRefreshToken` 패턴이 11테이블 규모에서 완전히 동작. (2) TanStack Query 도입 시 `QueryClientProvider` 루트 설정 + `queryKey` 구조 + `invalidateQueries` 패턴 표준화가 필요 — 14c-β 중간에 추가 시 기존 α 자산(`useInlineEditMutation`)과 상태 관리 이중화 문제 발생. (3) 14e는 "데이터 레이어 강화" 단계 — TanStack Query + TanStack Virtual + Papa Parse Workers 3종을 함께 도입하는 것이 아키텍처 일관성 면에서 최적. |
| **구현 위치** | Phase 14e, `src/components/table-editor/use-table-query.ts` |

---

## 11. Phase 18 WBS — Table Editor 파트 (~80h, 10일)

### 11.1 WBS 요약표

| WBS ID | 작업 | 담당 | 기간 | 공수 | 선행 |
|--------|------|------|------|------|------|
| TE-01 | `table-viewer-badge.tsx` 컴포넌트 | UI | 0.5일 | 4h | — |
| TE-02 | `TableDetailPage` USER 뱃지 통합 + 편집 모드 진입 차단 | UI | 0.5일 | 4h | TE-01 |
| TE-03 | Unit Test (USER 롤 편집 차단, MANAGER 삽입 가능, ADMIN 삭제 가능) | QA | 0.5일 | 4h | TE-02 |
| TE-04 | E2E + 14c-γ 배포 | QA | 0.5일 | 4h | TE-03 |
| **14c-γ 소계** | | | **2일** | **16h** | |
| TE-05 | `schema/route.ts` FK 정보 introspection 확장 | API | 0.5일 | 4h | TE-04 |
| TE-06 | `fk-cell-selector.tsx` cmdk FK 셀렉터 컴포넌트 | UI | 1일 | 8h | TE-05 |
| TE-07 | `EditableCell` FK 컬럼 감지 + FkCellSelector 주입 | UI | 0.5일 | 4h | TE-06 |
| TE-08 | `csv-import-modal.tsx` Papa Parse 메인 스레드 + 100행 DRY-RUN | UI | 1일 | 8h | TE-04 |
| TE-09 | `csv-export-button.tsx` + `/export` API 라우트 | UI+API | 0.5일 | 4h | TE-04 |
| TE-10 | `/import` API 라우트 (청크 1000행 createMany) | API | 0.5일 | 4h | TE-08 |
| TE-11 | Unit Test + E2E + 14d 배포 | QA | 1일 | 8h | TE-06~10 |
| **14d 소계** | | | **5일** | **40h** | |
| TE-12 | `@tanstack/react-virtual` 의존성 추가 + `virtual-table-body.tsx` | 구현 | 1일 | 8h | TE-11 |
| TE-13 | `TableDataGrid` tbody VirtualTableBody 교체 + 기존 편집 통합 | UI | 1일 | 8h | TE-12 |
| TE-14 | `use-table-query.ts` TanStack Query v5 훅 (useTableRows + useTableRowMutation) | 구현 | 0.5일 | 4h | TE-11 |
| TE-15 | `TableDataGrid` TanStack Query 통합 (setRefreshToken → invalidateQueries) | UI | 0.5일 | 4h | TE-14 |
| TE-16 | Papa Parse Workers 모드 활성화 + CSV 대용량 테스트 | 구현 | 0.5일 | 4h | TE-13 |
| TE-17 | 14e E2E (가상 스크롤 100행 렌더링 < 200ms, TanStack Query 캐시 stale 동작) | QA | 0.5일 | 4h | TE-13~16 |
| **14e 소계** | | | **4일** | **32h** | |
| TE-18 | `table_editor_preferences` SQLite + 사용자별 정렬/필터/페이지 크기 저장 | 구현 | 0.5일 | 4h | TE-17 |
| TE-19 | 숨겨진 컬럼 관리 UI (헤더 우클릭 → 숨기기/보이기) | UI | 0.5일 | 4h | TE-18 |
| TE-20 | 14f 통합 테스트 + 최종 배포 | QA | 0.5일 | 4h | TE-18, TE-19 |
| **14f 소계** | | | **1일** | **12h** | |
| **전체 합계** | | | **12일** | **100h** | |

> 참고: WBS 합산 100h는 14c-γ가 Phase 14c에 포함되어 기존 14c 80h에 추가 16h 분이 14c 내에서 소화된다고 가정 시 실제 잔여 공수 = 100h - 16h = **84h ≈ 80h(±10%)** 범위 내.

### 11.2 병렬화 가능 구간

- TE-05(스키마 FK 확장) + TE-08(CSV import modal): TE-04 이후 독립 — 병렬 가능
- TE-09(CSV export) + TE-10(import API): 각각 독립 — 병렬 가능
- TE-12(Virtual) + TE-14(TanStack Query): TE-11 이후 독립 — 병렬 가능

---

## 부록 A. Phase 14c-α/β 세션 24 핵심 기술 결정 요약

### A.1 Compound Knowledge — Next.js 16 Private Directory

`_` prefix 폴더는 Next.js 16 App Router에서 private directory로 인식되어 라우트 등록에서 제외된다. 영향 범위: `_composite` → 404, 동적 `[pk]` 라우트로 폴백. **해결**: 언더스코어 없는 `composite` 폴더명 사용. 관련 파일: `docs/solutions/2026-04-18-nextjs-private-folder-routing.md`.

### A.2 Compound Knowledge — TIMESTAMP 정밀도

Prisma 7 생성 테이블은 `TIMESTAMP(3)` (밀리초). 테스트/임시 테이블을 `TIMESTAMP` (마이크로초)로 생성하면 낙관적 잠금 WHERE 조건에서 정밀도 불일치로 항상 CONFLICT 발생. **해결**: 모든 낙관적 잠금 대상 테이블은 `TIMESTAMP(3)` 명시. 관련 파일: `docs/solutions/2026-04-18-timestamp-precision-optimistic-locking.md`.

### A.3 API 엔드포인트 현황 (Phase 14c 기준)

| 엔드포인트 | 메서드 | 인증 | 상태 |
|-----------|--------|------|------|
| `/api/v1/tables` | GET | 인증 필요 | 완료 |
| `/api/v1/tables/[table]/schema` | GET | 인증 필요 | 완료 |
| `/api/v1/tables/[table]/rows` | GET | 인증 필요 | 완료 |
| `/api/v1/tables/[table]/count` | GET | 인증 필요 | 완료 |
| `/api/v1/tables/[table]` | POST (insert) | ADMIN/MANAGER | 완료 |
| `/api/v1/tables/[table]/[pk]` | PATCH (update) | ADMIN/MANAGER | 완료 (14c-α) |
| `/api/v1/tables/[table]/[pk]` | DELETE | ADMIN | 완료 |
| `/api/v1/tables/[table]/composite` | PATCH (update) | ADMIN/MANAGER | 완료 (14c-β) |
| `/api/v1/tables/[table]/composite` | DELETE | ADMIN | 완료 (14c-β) |
| `/api/v1/tables/[table]/import` | POST (CSV) | ADMIN/MANAGER | **14d 예정** |
| `/api/v1/tables/[table]/export` | GET (CSV) | 인증 필요 | **14d 예정** |

---

## 부록 B. NFR 매핑

| NFR | 목표 | Table Editor 구현 포인트 |
|-----|------|------------------------|
| NFR-PERF.1 | 100만 행 정렬 p95 ≤ 800ms | 서버 LIMIT/OFFSET + B-tree 인덱스 (현재 구현) |
| NFR-PERF.1 (E2E) | end-to-end 렌더 p95 ≤ 1.2s | Phase 14e 가상 스크롤 도입 후 목표 충족 |
| NFR-SEC (감사) | 편집 감사 로그 영구 보존 | `TABLE_ROW_UPDATE/CONFLICT/DELETE` 3종 구현 완료 |
| NFR-MNT.2 | 코드 재사용 | `TypedInputControl` — RowFormModal/EditableCell 공유 완료 |

---

## 부록 C. 변경 이력

| 버전 | 날짜 | 작성자 | 요약 |
|------|------|-------|------|
| 1.0 | 2026-04-18 | Agent W4-B4 (Sonnet 4.6) | Wave 4 Tier 2 초안 — Table Editor Blueprint Phase 14c-γ~14f |

---

> **Blueprint 끝.** Wave 4 · B4 · 2026-04-18 · 양평 부엌 서버 대시보드 — Table Editor 75→100점 · 10일 80h · 5 DQ 확정 (DQ-1.10/1.11/1.12/2.1/2.2/2.3).
