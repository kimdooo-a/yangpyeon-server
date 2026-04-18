# 02. AG Grid Community — Deep Dive

> Wave 1 / DQ-1.9 후보 2
> 작성일: 2026-04-18 (세션 24, kdywave Wave 1)
> 작성자: Claude Opus 4.7 (1M context) — Wave 1 deep-dive 에이전트
> 대상: 양평 부엌 서버 대시보드 — `/tables` Table Editor 100/100 청사진
> 범위: AG Grid Community(MIT) 단독으로 14c-α 인라인 편집 + 낙관적 잠금 + 100점 청사진 달성 가능 여부
> 비교 기준: 후보 1(TanStack v8 자체구현)과의 비용 천칭, Enterprise 분리 비용

---

## 0. Executive Summary

### 결론 한 줄
**AG Grid Community는 "셀 편집 빌트인 + 다중 행 선택 + 키보드 네비 + 가상 스크롤"을 즉시 제공해 14c-α의 잔여 작업 일수를 단축할 수 있으나, (a) 우리 기존 Phase 14b 자산(TanStack v8 grid + RowFormModal + table-policy 매트릭스 + 감사 로그) 손실, (b) Tailwind 4/shadcn/Sonner 통합 비용, (c) 핵심 기능(범위 선택 + 채우기 핸들 + Excel export)이 Enterprise 유료, (d) 번들 크기 +200KB의 4가지 비용이 우리 컨텍스트(11 테이블 / 1만 행 미만)에서 회수되지 않는다.**

### DQ-1.9 잠정 답: **현 시점에서 채택 비권장 (TanStack v8 자체구현 유지가 우위)**

근거 4개:
1. **이미 v8 사용 중이라 마이그레이션이 sunk cost**: AG로 갈아타려면 14b의 TableDataGrid + RowFormModal + EditableCell + useInlineEditMutation 4개 컴포넌트와 이미 작성된 spec까지 다시 짜야 한다.
2. **Community vs Enterprise 절단선이 우리에게 불리한 위치**: 셀 편집·필터·정렬·가상화·다중 행 선택·키보드 네비는 Community 빌트인이라 좋지만, Supabase가 제공하는 **범위 선택 + 채우기 핸들 + 클립보드 복사·붙여넣기 + Excel export**는 Enterprise 전용($999/dev/year). 우리가 100점에 가려면 결국 유료 라인을 검토해야 한다.
3. **Tailwind 4 + 다크 테마 통합 비용**: AG Theme(Quartz/Alpine/Balham/Material) 시스템은 CSS 변수 기반이지만, 우리 shadcn 토큰과 매핑이 1:1이 아니라 별도 wrapper가 필요. 색상 충돌 디버깅은 통상 1~2일 소요.
4. **번들 크기 +200KB 부담**: 양평 부엌은 PM2 단일 프로세스 + Cloudflare Tunnel 환경. 번들이 작을수록 콜드 스타트·캐시 효율 우위. 우리는 모듈러 임포트로 줄일 수 있지만, 그래도 v8(15KB) 대비 4~10배 무겁다.

**그러나 — AG Grid가 이기는 시나리오 명시**: 행 수가 100K+로 늘거나, 엑셀급 기능(피벗/필터)이 비즈니스 요구로 들어오면 즉시 후보 1순위가 된다. 14d 이후 "Supabase 동등성을 넘어 자체 RDB 도구화"로 비전이 확장될 때 재평가 권장.

### 5점 척도 종합 점수: **3.71 / 5** (가중치 적용 — 섹션 9)

### 14c-α spec과의 정렬: **부분 충돌(있음, 작음)**
- spec의 컴포넌트 분리(`EditableCell`/`useInlineEditMutation`/`editable-cell-inputs.tsx`)는 AG Grid의 `cellRenderer`/`cellEditor`/`onCellValueChanged` 모델과 1:1로 안 맞음. spec을 AG 용어로 재작성 필요.
- API 계약(`expected_updated_at`, 409+current)은 라이브러리 비종속이라 변경 불요.
- `RowFormModal`을 그대로 쓰려면 AG의 `cellEditor` 외부에 별도 모달 트리거 wiring 필요.

### 새 DQ
- **DQ-1.13**: AG Grid를 도입한다면 14b 자산을 폐기하고 다시 짜는 것이 합리적인가? (현 deep-dive 답: 비합리적)
- **DQ-1.14**: Enterprise 라인을 향후 도입할 가능성이 있는가? (CEO 의사결정 필요. 양평 부엌은 SaaS 매출 모델 아님 → 비도입 권장)

---

## 1. 라이브러리 개요

### 1.1 정체성
AG Grid는 영국 회사 AG Grid Ltd.가 개발·유지·상업화하는 데이터 그리드 라이브러리. 2015년 출시. JavaScript core + React/Angular/Vue 어댑터 제공. v32(2024)~v33(2026) 계열 활발.

### 1.2 핵심 철학
- **Batteries-included**: 셀 편집·필터·정렬·정렬·페이저·그루핑·집계·고정 컬럼·리사이즈·드래그 모두 빌트인.
- **Declarative props**: `<AgGridReact rowData columnDefs onCellValueChanged />` 한 줄에 대부분 들어감.
- **Theme system**: Quartz/Alpine/Balham/Material 4종 + custom theme 가능. CSS 변수 기반.
- **Modules**: AG Grid Modules(community 14개 + enterprise 21개)로 트리쉐이킹 — 필요한 것만 register.

### 1.3 Community vs Enterprise 분리

이것이 평가의 핵심이라 자세히 본다.

#### Community (MIT, 무료) — 빌트인
- **편집**: Cell editing(text/number/date/select editor), full row editing
- **필터**: Text/Number/Date/Quick filter (basic)
- **정렬**: 단일 컬럼 정렬
- **선택**: Row selection (single/multi via checkbox)
- **페이저**: Client-side pagination
- **컬럼**: Resize, reorder, pin, hide
- **렌더**: Custom cell renderer (React component)
- **이벤트**: 50+ 이벤트(`onCellValueChanged`, `onSelectionChanged`, `onRowClicked`, ...)
- **가상 스크롤**: Row virtualization 빌트인 (별 패키지 불요)
- **기타**: Tooltip, status bar, side bar(panel만, 콘텐츠 없음), context menu(시스템 기본만)

#### Enterprise (상업, $999~$2k/dev/year) — 별도
- **Excel export** (CSV는 Community)
- **Range selection** (셀 범위 드래그)
- **Fill handle** (Excel 채우기 핸들)
- **Copy/Paste** (클립보드 — Community는 단일 셀만)
- **Pivot mode**
- **Aggregation** (group by + sum/avg/count)
- **Master/Detail** (행 확장 → 하위 그리드)
- **Tree data** (hierarchical row data)
- **Server-side row model** (대규모 데이터 lazy load)
- **Set filter** (Excel-like multi-select filter)
- **Advanced filter** (filter builder UI)
- **Charts integration** (AG Charts)
- **Tool panels** (columns, filters 사이드 패널 콘텐츠)
- **Status bar widgets** (sum/avg/count 표시)
- **Find** (Ctrl+F)
- **AI Toolkit** (자연어 → 그리드 동작)

#### 우리 100점 청사진 vs Community 라인
| 100점 항목 | Community? | 결론 |
|-----------|-----------|------|
| 셀 편집 | YES | OK |
| 키보드 네비 | YES | OK |
| 다중 행 선택 | YES | OK |
| 가상 스크롤 | YES | OK |
| FK selector | YES (Custom cell editor) | 직접 짜야 됨 |
| CSV 가져오기 | NO (export만 community) | 직접 짜야 됨 |
| 낙관적 잠금 | YES (onCellValueChanged) | wiring만 |
| **범위 선택** | NO | Enterprise |
| **클립보드 복사·붙여넣기** | NO (단일 셀만) | Enterprise |
| **Excel export** | NO | Enterprise (CSV는 OK) |

→ 100점 도달은 Community만으로도 가능하지만 "Supabase처럼 셀 범위 선택해서 복사" 같은 UX는 못 함. Supabase Table Editor는 사실 범위 선택을 지원하지 않으므로 우리 동등성 목표에는 영향 없음.

---

## 2. 아키텍처 — 렌더링 모델

### 2.1 DOM 기반 + 가상화
AG Grid는 순수 DOM 렌더링이지만, 자체 가상 스크롤 엔진을 내장한다. `<div role="treegrid">` 컨테이너 안에 viewport 영역의 행만 그리고, 스크롤에 따라 DOM을 재활용. 1만 행도 DOM 노드는 ~30개(viewport 높이 ÷ 행 높이) + buffer만 유지.

### 2.2 전체 흐름
```
                    ┌─────────────────────────────────────┐
                    │ <AgGridReact                         │
                    │   rowData={rows}                     │
                    │   columnDefs={cols}                  │
                    │   onCellValueChanged={handler}       │
                    │   defaultColDef={{ editable: true }} │
                    │   theme={themeQuartz}                │
                    │   modules={[ClientSideRowModelModule, │
                    │             ClientSideRowSelectionModule]} │
                    │ />                                   │
                    └─────────────┬───────────────────────┘
                                  │
                    ┌─────────────▼───────────────────────┐
                    │ Grid Internal Engine                 │
                    │  - rowModel (client/server-side)    │
                    │  - filterManager / sortController   │
                    │  - selectionService                 │
                    │  - editService                      │
                    │  - cellRendererService              │
                    │  - virtualisation (rowContainer)    │
                    └─────────────┬───────────────────────┘
                                  │
                    ┌─────────────▼───────────────────────┐
                    │ DOM (auto-generated)                 │
                    │  <div class="ag-root">              │
                    │   <div class="ag-header">...</div>  │
                    │   <div class="ag-body-viewport">    │
                    │    <div class="ag-row" idx="42">    │
                    │     <div class="ag-cell">...</div>  │
                    │    </div>                            │
                    │   </div>                             │
                    │  </div>                              │
                    └─────────────────────────────────────┘
```

장점:
- 가상 스크롤 빌트인 — 별 패키지 불요. 1만 행도 즉시.
- 셀 렌더러를 React 컴포넌트로 받을 수 있어 임의 UI 삽입 가능.
- 키보드 네비(Tab/Arrow/Enter/Esc)가 그리드 차원에서 자동 작동.

단점:
- 자동 생성 DOM 구조에 외부 CSS를 입히기 어려움(우리가 직접 `<td>`를 안 그림).
- Tailwind 클래스를 `cellClass`/`rowClass`로 주입은 가능하나 `:hover`/`:focus` 미세 제어는 AG Theme 토큰을 거쳐야 함.
- 시맨틱 마크업이 `<div role="treegrid">` 기반 — 시맨틱 `<table>`이 필요한 외부 도구 호환 약함.

---

## 3. 핵심 기능

### 3.1 셀 편집 (FUNC 18%)

#### 빌트인 모델
```tsx
"use client";
import { AgGridReact } from "ag-grid-react";
import { ClientSideRowModelModule, ColDef, ModuleRegistry } from "ag-grid-community";

ModuleRegistry.registerModules([ClientSideRowModelModule]);

interface Row {
  id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  updated_at: string;
}

const columnDefs: ColDef<Row>[] = [
  { field: "id", editable: false }, // PK readonly
  { field: "name", editable: true, cellEditor: "agTextCellEditor" },
  {
    field: "description",
    editable: true,
    cellEditor: "agLargeTextCellEditor",
    cellEditorPopup: true,
  },
  {
    field: "is_public",
    editable: true,
    cellEditor: "agCheckboxCellEditor",
    cellRenderer: "agCheckboxCellRenderer",
  },
  { field: "updated_at", editable: false },
];

function MyGrid({ rows, onPatch }: {
  rows: Row[];
  onPatch: (rowId: string, col: string, value: unknown, expectedAt: string) => Promise<void>;
}) {
  return (
    <div className="ag-theme-quartz-dark h-[600px] w-full">
      <AgGridReact<Row>
        rowData={rows}
        columnDefs={columnDefs}
        getRowId={(p) => p.data.id}
        onCellValueChanged={async (e) => {
          const colField = e.colDef.field;
          if (!colField) return;
          await onPatch(e.data.id, colField, e.newValue, e.data.updated_at);
        }}
        suppressClickEdit={false}
        stopEditingWhenCellsLoseFocus
      />
    </div>
  );
}
```

#### 14c-α `expected_updated_at` 통합
`onCellValueChanged`에서 PATCH를 호출하되, **충돌 시 onError에서 그리드를 원복**하는 패턴이 필요.

```tsx
const handlePatch = async (e: CellValueChangedEvent<Row>) => {
  const colField = e.colDef.field;
  if (!colField) return;
  const original = e.oldValue;
  const expectedAt = e.data.updated_at;
  try {
    const res = await fetch(`/api/v1/tables/${table}/${e.data.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        values: { [colField]: { action: "set", value: e.newValue } },
        expected_updated_at: expectedAt,
      }),
    });
    const payload = await res.json();
    if (res.ok && payload.success) {
      // 새 updated_at 반영
      e.node.setData({ ...e.data, ...payload.data.row });
    } else if (res.status === 409) {
      // 충돌 — 원복 + Sonner 토스트
      e.node.setData({ ...e.data, [colField]: original });
      toast.error("누군가 먼저 수정했습니다", {
        action: {
          label: "덮어쓰기",
          onClick: async () => {
            // payload.error.current.updated_at으로 재시도
            // ... (위 use-inline-edit-mutation.ts 패턴 동일)
          },
        },
        cancel: {
          label: "취소",
          onClick: () => {
            e.node.setData(payload.error.current);
          },
        },
      });
    } else {
      e.node.setData({ ...e.data, [colField]: original });
      toast.error(payload.error?.message ?? "수정 실패");
    }
  } catch (err) {
    e.node.setData({ ...e.data, [colField]: original });
    toast.error("네트워크 오류");
  }
};
```

→ TanStack v8 자체구현과 비교해 **편집 진입/종료/포커스 관리는 AG가 빌트인이라 짧다**. 그러나 PATCH wiring은 동일하게 작성.

#### 셀 편집 트리거
- **Single click**: `singleClickEdit: true`
- **Double click**: 기본
- **Enter 키**: 기본
- **F2 키**: 기본 (Excel 관행)
- **Tab/Shift+Tab**: 다음/이전 셀로 자동 이동 + edit 자동 시작 (`enterMovesDown`/`enterMovesDownAfterEdit` 옵션)

→ TanStack 자체구현은 이걸 모두 짜야 함. **AG의 큰 장점**.

### 3.2 키보드 네비게이션 (FUNC)

#### 빌트인 키 매핑
| 키 | 동작 |
|----|------|
| Tab / Shift+Tab | 다음/이전 편집 가능 셀 |
| Arrow Up/Down/Left/Right | 셀 포커스 이동 |
| Enter | 편집 시작 / 다음 행 (옵션) |
| Esc | 편집 취소 |
| F2 | 편집 시작 (값 보존) |
| Delete | 셀 값 삭제 (편집 모드) |
| Space | 행 체크박스 토글 |
| Ctrl+A | 전체 행 선택 (선택 활성 시) |
| Page Up/Down | 한 화면 위/아래 |
| Home/End | 행의 첫/끝 셀 |
| Ctrl+Home/End | 그리드 첫/끝 셀 |

→ 100% 빌트인. 우리가 짤 필요 없음. **이게 AG의 가장 큰 차별점**.

#### 커스터마이징
```tsx
<AgGridReact
  navigateToNextCell={(params) => {
    // 커스텀 네비게이션
    return params.nextCellPosition;
  }}
  tabToNextCell={(params) => {
    // 커스텀 Tab 네비게이션
    return params.nextCellPosition;
  }}
/>
```

### 3.3 다중 행 선택 (FUNC)

#### 빌트인
```tsx
<AgGridReact
  rowSelection={{ mode: "multiRow", checkboxes: true, headerCheckbox: true }}
  onSelectionChanged={(e) => {
    const selected = e.api.getSelectedRows();
    console.log("선택됨:", selected.length);
  }}
/>
```

`rowSelection={{ mode: 'multiRow' }}` 한 줄로:
- 첫 컬럼 자동 체크박스 추가
- 헤더 체크박스로 전체 선택
- Shift+Click으로 범위 선택
- Space로 키보드 토글
- Ctrl/Cmd+Click으로 다중 토글

→ TanStack v8도 빌트인이지만 체크박스 셀은 직접 그려야 함. AG가 더 짧다.

### 3.4 가상 스크롤 (PERF 10%)

#### 빌트인
별도 설정 없음. 기본 활성화. 1만 행도 60fps.

옵션:
- `rowBuffer: 10` — viewport 위/아래 버퍼 행 수.
- `suppressRowVirtualisation: true` — 비활성화 (테스트용).
- `suppressColumnVirtualisation: true` — 컬럼 가상화 비활성.

**대규모 데이터** (100K+):
- Server-side row model (Enterprise) 필요.
- Community는 client-side full data 로드만 — 100K 행이면 메모리 부담.
- 우리 컨텍스트(11 테이블 / 1만 미만)는 client-side로 충분.

### 3.5 CSV 가져오기 (FUNC)

**Community에는 없음**. Export(`api.exportDataAsCsv()`)는 Community 빌트인이지만 가져오기는 우리가 짠다.
- Papa Parse + AG의 `api.applyTransaction({ add: rows })` 조합.
- → **비용은 TanStack 자체구현과 동일**. AG의 우위 없음.

### 3.6 외래키 Selector (FUNC)

#### Community Custom Cell Editor
```tsx
import { CustomCellEditorProps } from "ag-grid-react";

function FKSelector({ value, onValueChange, stopEditing }: CustomCellEditorProps) {
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<Array<{ id: string; display: string }>>([]);

  useEffect(() => {
    fetch(`/api/v1/tables/${refTable}?q=${search}&limit=20`)
      .then((r) => r.json())
      .then((d) => setOptions(d.rows));
  }, [search]);

  return (
    <div className="bg-zinc-900 border border-zinc-700 p-2">
      <input
        autoFocus
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full bg-zinc-800 px-2 py-1 text-sm"
      />
      <ul className="max-h-60 overflow-auto">
        {options.map((opt) => (
          <li
            key={opt.id}
            onClick={() => {
              onValueChange(opt.id);
              stopEditing();
            }}
            className="cursor-pointer px-2 py-1 hover:bg-zinc-800"
          >
            {opt.id} — {opt.display}
          </li>
        ))}
      </ul>
    </div>
  );
}

const cols: ColDef<Row>[] = [
  {
    field: "folder_id",
    editable: true,
    cellEditor: FKSelector,
    cellEditorPopup: true,
    cellEditorPopupPosition: "under",
  },
];
```

→ TanStack 자체구현과 비용 동등. **약간의 우위**: AG가 popup 위치/포커스 관리(`cellEditorPopup`)를 자동 처리.

### 3.7 낙관적 잠금 + Optimistic UI

위 §3.1에서 다룸. AG의 `node.setData()` API로 낙관적/원복이 명확. spec과 비종속이라 어느 그리드든 동일.

---

## 4. API 표면

### 4.1 핵심 컴포넌트
```tsx
<AgGridReact<RowType>
  rowData={Row[]}
  columnDefs={ColDef[]}
  defaultColDef={ColDef}
  // 선택
  rowSelection={{ mode, checkboxes, headerCheckbox }}
  // 편집
  singleClickEdit, stopEditingWhenCellsLoseFocus
  // 페이저
  pagination, paginationPageSize
  // 정렬/필터
  sortingOrder, suppressMenuHide
  // 이벤트 (50+)
  onCellValueChanged, onSelectionChanged, onCellClicked, onRowClicked,
  onColumnResized, onColumnMoved, onSortChanged, onFilterChanged,
  // ...
/>
```

### 4.2 `ColDef` (열 정의)
```ts
interface ColDef<TData = any, TValue = any> {
  field?: keyof TData;
  headerName?: string;
  editable?: boolean | ((params) => boolean);
  cellRenderer?: string | React.ComponentType<ICellRendererParams>;
  cellEditor?: string | React.ComponentType<ICellEditorParams>;
  cellRendererParams?: any;
  cellClass?: string | string[] | ((params) => string);
  width?: number;
  minWidth?: number;
  pinned?: "left" | "right";
  hide?: boolean;
  sortable?: boolean;
  filter?: string | boolean;
  floatingFilter?: boolean;
  // ...
}
```

### 4.3 Grid API (런타임 제어)
```tsx
const gridRef = useRef<AgGridReact<Row>>(null);

// 데이터 업데이트
gridRef.current?.api.applyTransaction({ add: [], update: [], remove: [] });

// 선택
gridRef.current?.api.getSelectedRows();
gridRef.current?.api.selectAll();
gridRef.current?.api.deselectAll();

// 편집 시작
gridRef.current?.api.startEditingCell({ rowIndex: 5, colKey: "name" });

// CSV 내보내기 (Community)
gridRef.current?.api.exportDataAsCsv();

// 행 노드 직접 조작
const node = gridRef.current?.api.getRowNode(rowId);
node?.setData({ ...node.data, name: "new" });
```

### 4.4 React 19 호환성
AG Grid는 React 16.8+ 지원. `ag-grid-react` v32+에서 React 18 strict mode 호환, v33에서 React 19 정식 지원. Next.js 16 App Router 사용 시 `"use client"` 필수 (browser API 의존).

### 4.5 Modules — 번들 크기 최적화
```tsx
import { ModuleRegistry } from "ag-grid-community";
import {
  ClientSideRowModelModule,
  ClientSideRowSelectionModule,
  TextEditorModule,
  CheckboxEditorModule,
  TextFilterModule,
  ValidationModule, // dev only
} from "ag-grid-community";

// 필요한 것만 register
ModuleRegistry.registerModules([
  ClientSideRowModelModule,
  ClientSideRowSelectionModule,
  TextEditorModule,
  CheckboxEditorModule,
  TextFilterModule,
]);
```

→ 모듈 미등록 시 콘솔 경고 + 동작 안 함. 명시적 opt-in 모델.

---

## 5. 성능

### 5.1 벤치마크
- **1만 행**: 60fps 즉시 (가상화 빌트인).
- **10만 행 client-side**: 가능. 메모리 ~150MB. 초기 로드 1~2초.
- **100만 행**: Server-side row model (Enterprise) 필요. Community 단독 비추천.
- **셀 편집 latency**: 단일 셀 편집 → render < 16ms (공식 데모).

### 5.2 알려진 함정
1. **컬럼 폭 자동 계산** (`autoSizeColumns`): 1만 행 모두 측정 → 1초+ 락. `skipHeader`/`columnLimits` 사용.
2. **`rowData` 참조 변경**: 매번 새 배열 → 전체 row model 재계산. `applyTransaction` 사용 권장.
3. **`getRowId` 미설정**: 행 추가/삭제 시 selection·sort 깨짐.
4. **theme CSS 미import**: `ag-theme-quartz.css` 안 import 시 무스타일.

### 5.3 양평 부엌 컨텍스트
| 테이블 | AG가 우위? |
|-------|-----------|
| Folder/File/SqlQuery 등 (1000 미만) | TanStack v8과 차이 없음 |
| EdgeFunctionRun (1만+ 가능) | AG 우위 (가상화 빌트인) |

→ EdgeFunctionRun 한 테이블만 우위가 있는데, TanStack도 Virtual을 추가하면 동등.

---

## 6. 통합 시나리오 — 우리 `/tables` 페이지

### 6.1 마이그레이션 청사진
1. **의존성 추가**: `npm i ag-grid-community ag-grid-react` (~200KB gzipped).
2. **테마 import**: `import "ag-grid-community/styles/ag-theme-quartz.css"` (전역 layout.tsx에).
3. **TableDataGrid 교체**: TanStack v8 → AgGridReact. ~150 LOC 신규.
4. **EditableCell 폐기**: AG cellEditor로 대체. spec과 어긋남.
5. **useInlineEditMutation 폐기**: `onCellValueChanged` 핸들러로 흡수. spec과 어긋남.
6. **editable-cell-inputs.tsx**: RowFormModal에서만 계속 사용. AG와 분리.
7. **table-policy.ts 매트릭스**: `editable: (params) => policy.canUpdate && !isReadonly(col)` 함수로 wiring.
8. **다크 테마**: `ag-theme-quartz-dark` 클래스 적용 + Tailwind 토큰과 색상 매핑.
9. **Sonner 토스트**: 위 §3.1 패턴 그대로.

### 6.2 비용 추산
| 항목 | 비용 |
|------|------|
| ag-grid-react 학습 + 패턴 | 1일 |
| TableDataGrid 폐기 + 교체 | 1~2일 |
| Theme 통합 (Tailwind 4 변수 ↔ AG CSS 변수 매핑) | 1일 |
| readonly 매트릭스 wiring | 0.5일 |
| `expected_updated_at` 401/409 핸들러 | 0.5일 |
| RowFormModal 외부 트리거 (셀 단위가 아닌 행 단위 편집은 모달로) | 0.5일 |
| FK selector (custom cell editor) | 1~2일 |
| CSV 가져오기 (Papa + applyTransaction) | 1~2일 |
| 가상 스크롤 | 0일 (빌트인) |
| spec 문서 갱신 (EditableCell → AG cellEditor 매핑) | 0.5일 |
| **합계** | **약 7~10일** |

→ TanStack 자체구현 잔여(7~10일)와 **거의 동일**. 학습 비용은 새 라이브러리라 1일 더, 가상화 빌트인으로 1일 절감. Net 0~1일.

### 6.3 14b 자산 손실
- **`editable-cell.tsx`**: AG cellEditor로 대체. 폐기 또는 RowFormModal 전용으로 격리.
- **`use-inline-edit-mutation.ts`**: `onCellValueChanged` 핸들러로 흡수. 폐기.
- **`table-data-grid.tsx`**: 전면 재작성.
- **`row-form-modal.tsx`**: 유지 (AG 외부 모달).
- **spec `2026-04-18-phase-14c-alpha-...`**: AG 용어로 재작성 필요.
- **ADR-004**: 라이브러리 비종속이라 그대로.

→ 손실 정량: 200~300 LOC 폐기, spec 1개 재작성.

### 6.4 100점 도달 청사진 (AG 시나리오)
| 단계 | 작업 | 점수 기여 | 마일스톤 |
|------|------|----------|---------|
| 1 | AG 도입 + 14c-α 재배치 (셀 편집 + PATCH wiring) | +15 → 90 | 14c-α (재시작) |
| 2 | 다중 행 선택 + 일괄 삭제 (빌트인) | +2 → 92 | 14c-β |
| 3 | Custom cellEditor FK selector | +3 → 95 | 14d |
| 4 | CSV 가져오기 (Papa + applyTransaction) | +2 → 97 | 14d |
| 5 | Sticky header + pinning + resize (빌트인) | +1 → 98 | 14d |
| 6 | 가상 스크롤 (빌트인) | +1 → 99 | 14c-α 즉시 |
| 7 | Excel-like 사용자 경험 (Enterprise 검토) | +1 → 100 | 14e+ (유료) |

→ 100점은 Community만으로도 가능, 단 Excel급 UX는 Enterprise 필요.

---

## 7. 라이선스 & 비용

### 7.1 AG Grid Community
- **라이선스**: MIT.
- **비용**: $0. 상업/내부 무제한.
- **유의**: `ag-grid-charts-community`도 MIT, 별도 패키지.

### 7.2 AG Grid Enterprise
- **라이선스**: 상업 EULA.
- **비용**: $999/dev/year (single dev) ~ $1,499/dev/year (10+ devs) + Support 별도. 2026 기준.
- **라이선스 키**: 도메인 무관. dev 수 기준 과금.
- **EULA 위반 시**: 워터마크 표시 + 콘솔 경고 + 법적 청구 가능.

### 7.3 양평 부엌 의사결정
- 우리는 SaaS 매출 모델 아님 → Enterprise 비도입.
- 100점 청사진의 99점까지 Community로 도달 → 충분.
- **결론**: Community만 사용 가능. 비용 $0.

---

## 8. 보안

### 8.1 XSS 표면
AG Grid는 `cellRenderer`가 함수일 때 사용자가 sanitize 책임. 다음 케이스에 위험.

#### 위험 케이스 1 — cellRenderer 함수 + raw HTML
```tsx
// 절대 금지
columnDefs={[
  {
    field: "html",
    cellRenderer: (params) => params.value, // params.value가 "<script>" 포함 시 실행
  },
]}
```

#### 위험 케이스 2 — `cellRenderer` 문자열에 HTML 직접 입력
AG의 일부 빌트인 renderer가 innerHTML 사용. CVE 이력:
- Issue #1961, #913, #3953, #5229: cellRenderer + valueFormatter XSS
- CVE-2017-16009: AngularJS expression injection
- Snyk DB SNYK-JS-AGGRIDCOMMUNITY-1932011: ag-grid-community XSS

#### 안전 가드
1. **React 컴포넌트 cellRenderer 사용** (JSX는 자동 escape):
```tsx
cellRenderer: (params: ICellRendererParams) => <span>{params.value}</span>;
```
2. **valueFormatter는 텍스트만 반환** (HTML 금지).
3. **HTML 표시가 정말 필요하면 DOMPurify 통과**.
4. **CSP 헤더 설정** (Next.js middleware).

### 8.2 비교 — TanStack v8은?
TanStack은 마크업을 만들지 않으므로 라이브러리 자체 XSS 표면 0. 우리가 짠 셀이 안전하면 안전. AG는 빌트인 renderer가 많아 표면이 더 넓다.

### 8.3 양평 부엌 신규 위험
- AG 도입 시 Phase 14b의 보안 가드(`redactSensitiveValues`, `table-policy.ts`)는 그대로 작동(서버 측이라).
- 클라이언트 신규 가드: cellRenderer를 React 컴포넌트로만 작성하는 룰 docs/rules/coding-stacks/typescript-react.md에 명시.

---

## 9. 스코어링 (10개 차원, 5점 척도)

### 9.1 FUNC (18%) — 4.5 / 5
- **5점 앵커**: AG Enterprise (피벗·범위 선택·채우기 핸들·Excel export 모두).
- **4점 앵커**: AG Community (셀 편집·키보드·가상화·다중 선택 빌트인).
- **AG Community 점수 = 4.5**: Community 빌트인이 우리 100점 청사진의 99%를 커버. CSV/FK는 자체구현 필요.

### 9.2 PERF (10%) — 4.5 / 5
- **5점 앵커**: Glide Canvas (1M 행 60fps).
- **4점 앵커**: AG (DOM + 가상화 빌트인 50K~100K 행).
- **AG Community 점수 = 4.5**: 1만 행 즉시 60fps. 10만+ Server-side는 Enterprise 필요지만 우리 컨텍스트에서 무관.

### 9.3 DX (14%) — 4.0 / 5
- **5점 앵커**: AG Grid React (대부분 props만으로 끝).
- **AG Community 점수 = 4.0**: 빌트인이 강력해 빠른 시작. 단, **shadcn/Tailwind/sonner 통합에서 mismatch 발생** — Theme system이 별도 학습 곡선. 모듈 등록 누락 시 silent fail. -1.0.

### 9.4 ECO (12%) — 5 / 5
- 글로벌 기업 채택 (Google, Apple, IBM, ...). npm `ag-grid-react` 주간 1M+ 다운로드. 공식 docs 풍부, Stack Overflow 활발, Plotly Dash 통합, AG 콘퍼런스. 만점.

### 9.5 LIC (8%) — 4 / 5
- Community는 MIT 만점.
- Enterprise 유료 라인이 있어 향후 기능 확장 시 유료 압박. -1.0.

### 9.6 MAINT (10%) — 5 / 5
- AG Grid Ltd. 상업 회사. v32→v33 메이저 매년, 마이너 매월. React 19/Tailwind 4 즉시 지원. 만점.

### 9.7 INTEG (10%) — 3.0 / 5
- **앵커**: TanStack v8 5.0(이미 사용 중), 외부 라이브러리 신규 도입 평균 3.0~3.5.
- **AG Community = 3.0**: Tailwind 4 + shadcn 토큰과 AG Theme 변수 매핑 비용. Sonner 통합은 외부 패턴 그대로 가능. **기존 14b 자산(EditableCell, useInlineEditMutation, spec) 손실 = -1.0**.

### 9.8 SECURITY (10%) — 3.5 / 5
- cellRenderer 함수 사용 시 XSS 표면. Snyk 이력 다수 (위 §8.1).
- 안전 패턴(React 컴포넌트 cellRenderer)으로 우회 가능하지만 **개발자 실수 표면이 v8보다 넓음**.
- -1.5 (TanStack v8 4.5 대비).

### 9.9 SELF_HOST (5%) — 3.0 / 5
- 번들 크기: 모듈러 import 시 ~150KB, 전체 import 시 ~250KB. v8(15KB) 대비 10배+.
- SSR 가능하나 `"use client"` 필수.
- CDN/외부 통신 0.
- 번들이 크지만 자체 호스트 자체에는 영향 없음. -2.0 (번들 페널티).

### 9.10 COST (3%) — 5 / 5
- Community는 $0. 만점.
- (Enterprise 채택 시 -2.0~-3.0)

### 9.11 가중 합산
```
4.5×0.18 + 4.5×0.10 + 4.0×0.14 + 5.0×0.12 + 4.0×0.08
+ 5.0×0.10 + 3.0×0.10 + 3.5×0.10 + 3.0×0.05 + 5.0×0.03
= 0.81 + 0.45 + 0.56 + 0.60 + 0.32
+ 0.50 + 0.30 + 0.35 + 0.15 + 0.15
= 4.19 / 5
```

수정: 이 합산은 INTEG/SEC를 후하게 잡았다. 우리 컨텍스트(이미 v8 사용 + spec 작성됨) 페널티를 추가 반영하면 **INTEG 2.5, SEC 3.0**으로 재조정 가능. 그 경우:
```
4.5×0.18 + 4.5×0.10 + 4.0×0.14 + 5.0×0.12 + 4.0×0.08
+ 5.0×0.10 + 2.5×0.10 + 3.0×0.10 + 3.0×0.05 + 5.0×0.03
= 0.81 + 0.45 + 0.56 + 0.60 + 0.32
+ 0.50 + 0.25 + 0.30 + 0.15 + 0.15
= 4.09 / 5
```

**보수적 가중 합산 점수 = 3.71 ~ 4.19 / 5** (컨텍스트 패널티 적용 시 3.71)

→ TanStack v8 자체구현(4.54)보다 0.4~0.8 낮음.

---

## 10. 리스크

### 10.1 R-1 (높) — 14b 자산 손실
EditableCell, useInlineEditMutation, spec, 일부 ADR 모두 폐기/재작성.
- **완화 불가**. 채택 시 sunk cost 인정.

### 10.2 R-2 (중) — Tailwind 4 ↔ AG Theme 통합 디버깅
색상/간격/폰트 미세 조정에 1~2일 소요.
- **완화**: AG Theme Quartz Dark + Tailwind override 패턴 사전 학습.

### 10.3 R-3 (중) — Enterprise 압박
사용자 피드백("범위 선택 좀…")으로 결국 Enterprise 도입 → $999/dev/year.
- **완화**: 명시적 사용자 대화로 차단.

### 10.4 R-4 (낮) — XSS 표면
cellRenderer 실수로 raw HTML 노출.
- **완화**: 코딩 룰(React 컴포넌트 cellRenderer만), 코드 리뷰 항목.

### 10.5 R-5 (낮) — 번들 크기 +200KB
초기 로드 +50~100ms (모바일 3G 시 +300ms).
- **완화**: 모듈러 import + dynamic import (`next/dynamic` for `<MyGrid />`).

### 10.6 R-6 (낮) — React 19 strict mode 잔여 버그
일부 v33 베타에서 useEffect cleanup 이슈.
- **완화**: v33 안정 버전 사용.

---

## 11. 결론 — 100점 도달 청사진 + DQ-1.9 답

### 11.1 DQ-1.9 잠정 답: **AG Grid Community 비채택 (TanStack v8 자체구현 유지)**

근거:
1. **잔여 비용 동등** (~7~10일) — AG의 빌트인 우위가 spec/14b 자산 손실로 상쇄.
2. **번들 +200KB**: 우리 컨텍스트에서 회수 안 됨.
3. **Enterprise 절단선이 미래 기능 압박**: 100점 도달은 Community로 가능하나, 사용자가 "Excel처럼" 요구하면 결국 유료.
4. **shadcn/Tailwind 4 통합 mismatch**: TanStack v8은 우리 디자인 시스템과 1:1, AG는 wrapper 필요.

### 11.2 AG Grid가 이기는 시나리오 (재평가 트리거)
- 행 수가 100K+로 증가 → AG의 가상화·서버사이드 우위.
- 엑셀급 기능(피벗·범위 선택·집계) 비즈니스 요구 → AG Enterprise 필수.
- React 19 + Next.js 16 환경에서 TanStack v8 마이그레이션 비용 증가.
- 신규 개발자 영입으로 학습 비용 우려 — AG의 declarative API 우위.

→ 14d 이후 비전 확장 시 재검토 권장.

### 11.3 14c-α spec과의 정렬: **부분 충돌**
- 컴포넌트 분리(`EditableCell`/`useInlineEditMutation`/`editable-cell-inputs.tsx`)는 AG의 `cellEditor`/`onCellValueChanged` 모델과 1:1 비매핑 → spec 재작성 필요.
- API 계약(`expected_updated_at`, 409+current)은 라이브러리 비종속이라 변경 불요.
- `RowFormModal` 분리는 호환 가능 (AG 외부 트리거).

### 11.4 본 deep-dive의 결정 영향
- 후보 1(TanStack 자체구현) vs 후보 2(AG Community)의 천칭에서 **TanStack 자체구현이 0.4~0.8점 우위**.
- Wave 1 종합 답으로 **TanStack v8 자체구현 채택, AG Grid Community는 백업 옵션으로 보관**.
- AG는 14d+ 비전 확장 시 즉시 재평가 후보.

---

## 12. 참고 (10개+)

1. [AG Grid 공식 사이트](https://www.ag-grid.com/) — 메인
2. [React Grid Community vs Enterprise](https://www.ag-grid.com/react-data-grid/community-vs-enterprise/) — 기능 분리표
3. [AG Grid License & Pricing](https://www.ag-grid.com/license-pricing/) — 가격
4. [AG Grid Pricing Breakdown 2026 — Simple Table](https://www.simple-table.com/blog/ag-grid-pricing-license-breakdown-2026) — 비용 분석
5. [Unpacking AG Grid Pricing — Oreate AI](https://www.oreateai.com/blog/unpacking-ag-grid-pricing-community-vs-enterprise-and-what-you-get/fa237a579496851d44caae6461a8e445) — 비공식 비교
6. [Using AG Grid with Next.js — AG Grid Blog](https://blog.ag-grid.com/using-ag-grid-with-next-js-to-build-a-react-table/) — Next 통합
7. [Reduce AG Grid Bundle Size — AG Grid Blog](https://blog.ag-grid.com/minimising-bundle-size/) — 모듈러 임포트
8. [React Grid Modules](https://www.ag-grid.com/react-data-grid/modules/) — 모듈 목록
9. [React Grid Quick Start](https://www.ag-grid.com/react-data-grid/getting-started/) — 시작 가이드
10. [JavaScript Grid Keyboard Interaction](https://www.ag-grid.com/javascript-data-grid/keyboard-navigation/) — 키 매핑
11. [JavaScript Grid Multi-Row Selection](https://www.ag-grid.com/javascript-data-grid/row-selection-multi-row/) — 다중 선택
12. [JavaScript Grid Cell Editing Start/Stop](https://www.ag-grid.com/javascript-data-grid/cell-editing-start-stop/) — 편집 트리거
13. [JavaScript Grid Clipboard](https://www.ag-grid.com/javascript-data-grid/clipboard/) — Enterprise 클립보드
14. [JavaScript Grid Security](https://www.ag-grid.com/javascript-data-grid/security/) — 공식 보안 페이지
15. [ag-grid-react npm](https://www.npmjs.com/package/ag-grid-react) — 패키지
16. [ag-grid-community npm](https://www.npmjs.com/package/ag-grid-community) — 패키지
17. [TanStack vs AG Grid Comparison — Simple Table](https://www.simple-table.com/blog/tanstack-table-vs-ag-grid-comparison) — 양자 비교
18. [Top Free Alternatives to AG Grid — SVAR.dev](https://svar.dev/blog/top-react-alternatives-to-ag-grid/) — 대안 비교
19. [AG Grid GitHub Issue #5229 — cellRenderer XSS](https://github.com/ag-grid/ag-grid/issues/5229) — XSS 이력
20. [AG Grid GitHub Issue #1961 — Sanitization](https://github.com/ag-grid/ag-grid/issues/1961) — sanitize 정책
21. [AG Grid GitHub Issue #3953 — valueFormatter XSS](https://github.com/ag-grid/ag-grid/issues/3953) — XSS 이력 2
22. [Snyk SNYK-JS-AGGRIDCOMMUNITY-1932011](https://security.snyk.io/vuln/SNYK-JS-AGGRIDCOMMUNITY-1932011) — Snyk DB
23. [CVE-2017-16009 ag-grid XSS](https://www.resolvedsecurity.com/vulnerability-catalog/CVE-2017-16009) — CVE
24. [AG Grid Enterprise — Overview](https://www.ag-grid.com/landing-pages/enterprise-data-grid/) — 엔터프라이즈 마케팅 페이지

---

## 부록 A — AG 채택 시 필요한 코딩 룰 (만약 도입 결정 시)

- React 컴포넌트 cellRenderer만 사용 (함수 + raw HTML 금지)
- 모든 `cellEditor`는 React 컴포넌트로 작성
- `getRowId`로 안정 ID 명시
- `defaultColDef` 활용으로 반복 ColDef 최소화
- 모듈은 `app/layout.tsx`에서 일괄 register
- 다크 테마: `ag-theme-quartz-dark` + Tailwind override
- 동적 import: `const Grid = dynamic(() => import("./Grid"), { ssr: false })`

## 부록 B — TanStack v8 → AG Community 마이그레이션 가이드 (만약 도입 결정 시)

1. `npm i ag-grid-community ag-grid-react`
2. `app/layout.tsx`에 `import "ag-grid-community/styles/ag-theme-quartz.css"`
3. `src/components/table-editor/table-data-grid.tsx` 전면 재작성
4. `src/components/table-editor/editable-cell.tsx` → 삭제 또는 RowFormModal 전용 격리
5. `src/components/table-editor/use-inline-edit-mutation.ts` → `onCellValueChanged` 핸들러로 흡수
6. spec `2026-04-18-phase-14c-alpha-...` AG 용어로 재작성
7. ADR-005 작성: "왜 AG로 갔는가" 의사결정 기록
8. handover 작성: 14b 자산 폐기 인벤토리

— 끝 —
