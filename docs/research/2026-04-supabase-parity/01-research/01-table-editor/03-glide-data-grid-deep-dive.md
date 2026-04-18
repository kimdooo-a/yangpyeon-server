# 03. Glide Data Grid — Deep Dive

> Wave 1 / DQ-1.9 후보 3
> 작성일: 2026-04-18 (세션 24, kdywave Wave 1)
> 작성자: Claude Opus 4.7 (1M context) — Wave 1 deep-dive 에이전트
> 대상: 양평 부엌 서버 대시보드 — `/tables` Table Editor 100/100 청사진
> 범위: Glide Data Grid (`@glideapps/glide-data-grid`) — Canvas 기반 React 데이터 그리드의 14c-α 적합성 평가
> 비교 기준: 후보 1(TanStack v8 자체구현), 후보 2(AG Grid Community)

---

## 0. Executive Summary

### 결론 한 줄
**Glide Data Grid는 Canvas 렌더링으로 1M+ 행에서도 60fps를 보장하는 압도적 PERF 우위를 가지지만, 우리 컨텍스트(11 테이블 / 1만 행 미만 / shadcn/Tailwind 4 / Supabase 동등성 목표)에서 (a) Canvas 패러다임이 우리 디자인 시스템(Tailwind 토큰·다크 테마·shadcn 토큰)과 통합 비용이 가장 높고, (b) 접근성(스크린리더·시맨틱 마크업·브라우저 검색)이 약하고, (c) Supabase Table Editor가 사실상 Canvas가 아니므로 우리 동등성 목표 달성에 과잉이며, (d) 14b/14c-α 자산을 모두 폐기해야 한다는 4가지 이유로 채택 비권장.**

### DQ-1.9 잠정 답: **현 시점에서 채택 비권장 (TanStack v8 자체구현 유지가 우위, AG Community보다도 후순위)**

근거 4개:
1. **Canvas 패러다임 ↔ shadcn/Tailwind mismatch**: Glide는 자체 theme 객체로 색상·폰트·간격을 받아 Canvas에 직접 그린다. Tailwind 클래스 적용 불가. 다크 모드 토글도 별도 themeOverride 패턴이 필요. 우리 디자인 토큰을 Canvas 색 코드로 매핑하는 wrapper 작업이 1~2일 추가.
2. **접근성 약함**: 시맨틱 `<table>`/`<tr>`/`<td>` 마크업이 없어 스크린리더가 인식 못 함. 브라우저 텍스트 검색(Ctrl+F)이 셀 내용을 못 찾음. 외부 도구(Selenium/Playwright accessibility tree, axe-core)와의 호환성이 약함.
3. **우리 컨텍스트에서 PERF 우위 무의미**: EdgeFunctionRun 외 모든 테이블이 1만 행 미만. 1M 행 렌더링 능력은 사용처 없음. TanStack v8 + Virtual로도 50K+ 60fps 충분.
4. **14b/14c-α 자산 100% 폐기**: TanStack 어댑터로 작성된 `editable-cell.tsx`/`useInlineEditMutation`/`spec`을 Canvas Linen 데이터 모델로 모두 다시 짜야 함. spec 재작성은 가장 무겁다.

**그러나 — Glide가 이기는 시나리오 명시**: 단일 테이블이 1M+ 행을 표시해야 하고(예: 분석 도구·로그 explorer·시계열 데이터), 자체 Canvas 디자인 시스템을 만들 의지가 있고, 접근성 요구가 낮다면(예: 사내 분석 도구) 즉시 1순위. 양평 부엌은 이 시나리오에 해당 안 됨.

### 5점 척도 종합 점수: **3.30 / 5** (가중치 적용 — 섹션 9)

### 14c-α spec과의 정렬: **충돌(있음, 큼)**
- spec의 컴포넌트 분리(`EditableCell`/`useInlineEditMutation`/`editable-cell-inputs.tsx`)는 Glide의 `getCellContent`/`onCellEdited`/`provideEditor` 모델과 1:1 비매핑.
- spec은 DOM 셀 가정 — Canvas로 가면 "셀 클릭 → 입력 → Enter" UX가 라이브러리 내부 메커니즘으로 흡수됨. 우리가 외부 컴포넌트로 컨트롤할 수 없음.
- API 계약(`expected_updated_at`, 409+current)은 라이브러리 비종속이라 변경 불요.
- spec 재작성 비용이 가장 큼.

### 새 DQ
- **DQ-1.15**: 양평 부엌이 향후 "로그 explorer" 같은 시계열 대시보드를 만들 비전이 있는가? (있다면 Glide 부분 도입 검토)
- **DQ-1.16**: 접근성(WCAG 2.2 AA) 요구사항이 있는가? (있다면 Glide는 즉시 탈락)

---

## 1. 라이브러리 개요

### 1.1 정체성
Glide Data Grid는 Glide Apps(노코드 플랫폼 회사)가 자체 제품에서 사용하기 위해 만든 그리드를 2020년 말 오픈소스로 공개한 라이브러리. `@glideapps/glide-data-grid` (npm). 회사가 자체 사용 → 동기 강함, 활발한 유지(2026-02 시점 active issues).

### 1.2 핵심 철학
- **Canvas-first**: HTML Canvas 위에 직접 셀 그림. DOM 셀 0개. 메모리·렌더 비용을 viewport에 한정.
- **Lazy data**: `getCellContent({ col, row })` 콜백으로 셀을 lazy 요청. 1M 행도 메모리 고정.
- **No compromise performance**: README 첫 줄이 "no compromise, outrageously fast". 60fps 보장이 최우선 가치.
- **TypeScript first-class**.
- **Custom cells**: 사용자가 자체 cell renderer + editor를 등록 가능.

### 1.3 역사 & 동기
- 초기엔 react-virtualized 사용 → 스크롤 중 DOM 마운트/언마운트 비용으로 60fps 깨짐.
- → Canvas 전환. "한번 그리면 끝" 모델.
- 2020-12 오픈소스화. 2025~2026 활발한 유지 (issue 빈번).

### 1.4 우리 프로젝트 적용 검토 시 위치
새 컴포넌트 `src/components/table-editor/glide-data-grid.tsx` 신규 작성, 기존 `table-data-grid.tsx`/`editable-cell.tsx` 폐기. 약 400 LOC 신규, 200 LOC 폐기.

---

## 2. 아키텍처 — 렌더링 모델

### 2.1 Canvas 기반
```
                    ┌──────────────────────────────────┐
                    │ <DataEditor                      │
                    │   getCellContent={(cell) => ...} │
                    │   columns={Column[]}             │
                    │   rows={number}                  │
                    │   onCellEdited={(cell, val)}     │
                    │   onPaste                        │
                    │   theme={{ ... }}                │
                    │ />                                │
                    └────────────┬─────────────────────┘
                                 │
                    ┌────────────▼─────────────────────┐
                    │ DataEditor Engine                │
                    │  - virtualized scroll (canvas)   │
                    │  - drawCell(ctx, cell, theme)    │
                    │  - editor overlay (DOM, popup)   │
                    │  - selection model               │
                    │  - search overlay                │
                    └────────────┬─────────────────────┘
                                 │
                    ┌────────────▼─────────────────────┐
                    │ DOM (출력)                       │
                    │  <canvas>...</canvas>            │
                    │  <div class="overlay">           │
                    │    (편집 시에만 임시 input)      │
                    │  </div>                          │
                    └──────────────────────────────────┘
```

장점:
- 행/열 수와 무관하게 DOM 노드 ~1~5개 (canvas + overlay).
- 스크롤 중 DOM 마운트/언마운트 0 → 60fps 보장.
- 메모리 사용량이 viewport 크기에 비례 (행 수에 무관).
- 1M 행 데모 검증 완료.

단점:
- 셀 안에 React 컴포넌트 자유 삽입 불가 (Canvas는 React 트리 아님).
- Custom cell은 `drawCell(ctx, cell, theme)` 함수로 Canvas 2D API 사용 → React JSX 패턴과 다름.
- 시맨틱 마크업 없음 → 스크린리더 약함, 브라우저 검색 불가.
- Tailwind 클래스 적용 불가 → theme 객체로 색·폰트·간격 전달.
- 셀 hover/selection 상태도 Canvas 재렌더로 처리 → CSS pseudo-class 못 씀.

### 2.2 데이터 모델 — Linen
Glide는 자체 데이터 모델(Linen)을 사용. 우리 데이터를 `getCellContent({ col, row })` 콜백으로 변환해 셀 객체(`GridCell`)를 반환.

```ts
type GridCell =
  | TextCell
  | NumberCell
  | BooleanCell
  | UriCell
  | ImageCell
  | MarkdownCell
  | BubbleCell
  | RowIDCell
  | LoadingCell
  | ProtectedCell
  | DrilldownCell
  | CustomCell<T>;

interface TextCell {
  kind: GridCellKind.Text;
  data: string;
  displayData: string;
  allowOverlay: boolean;
  readonly?: boolean;
  copyData?: string;
  themeOverride?: Partial<Theme>;
}
```

### 2.3 14c-α 컴포넌트 매핑
| spec 요구 | Glide 슬롯 | 비용 |
|----------|----------|------|
| `EditableCell` | (해당 없음) — `GridCell.allowOverlay: true`로 라이브러리가 자동 편집 popup | spec 재작성 |
| `useInlineEditMutation` | `onCellEdited` 핸들러 | wiring만 |
| `editable-cell-inputs.tsx` | 빌트인 텍스트/숫자/체크박스 + Custom Cell | 부분 재사용 |
| `readonly 매트릭스` | `GridCell.readonly: true` | OK |
| `Tab 키 → 다음 셀` | 라이브러리 빌트인 | OK |
| `다중 행 선택` | `rowSelectionMode` | OK |
| `정렬/필터` | (없음 — 우리가 데이터 단계에서) | 자체구현 |
| `가상 스크롤` | 빌트인 (Canvas) | OK |
| `CSV 가져오기` | (없음) | 자체구현 |
| `외래키 selector` | Custom Cell + provideEditor | 신규 학습 |

→ Tab/가상화/편집 popup이 빌트인이라 우위지만, **spec 재작성 비용과 외부 컴포넌트(EditableCell·useInlineEditMutation) 폐기 비용이 결정적**.

---

## 3. 핵심 기능

### 3.1 셀 편집 (FUNC 18%)

#### 빌트인 모델
```tsx
"use client";
import {
  DataEditor,
  GridCell,
  GridCellKind,
  GridColumn,
  Item,
  EditableGridCell,
} from "@glideapps/glide-data-grid";
import "@glideapps/glide-data-grid/dist/index.css";

interface Row {
  id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  updated_at: string;
}

const columns: GridColumn[] = [
  { title: "id", id: "id", width: 200 },
  { title: "name", id: "name", width: 200 },
  { title: "description", id: "description", width: 400 },
  { title: "is_public", id: "is_public", width: 100 },
  { title: "updated_at", id: "updated_at", width: 200 },
];

function MyGrid({
  rows,
  onPatch,
}: {
  rows: Row[];
  onPatch: (rowId: string, col: string, value: unknown, expectedAt: string) => Promise<void>;
}) {
  const getCellContent = useCallback(
    (cell: Item): GridCell => {
      const [colIdx, rowIdx] = cell;
      const row = rows[rowIdx];
      const colId = columns[colIdx].id ?? "";
      const isPK = colId === "id";
      const isSystem = colId === "updated_at";

      if (colId === "is_public") {
        return {
          kind: GridCellKind.Boolean,
          data: row.is_public,
          allowOverlay: false,
          readonly: isPK || isSystem,
        };
      }
      if (colId === "updated_at" || colId === "id") {
        return {
          kind: GridCellKind.Text,
          data: String(row[colId as keyof Row] ?? ""),
          displayData: String(row[colId as keyof Row] ?? ""),
          allowOverlay: false,
          readonly: true,
        };
      }
      const v = row[colId as keyof Row];
      return {
        kind: GridCellKind.Text,
        data: String(v ?? ""),
        displayData: String(v ?? ""),
        allowOverlay: true,
        readonly: false,
      };
    },
    [rows],
  );

  const onCellEdited = useCallback(
    async (cell: Item, newValue: EditableGridCell) => {
      const [colIdx, rowIdx] = cell;
      const colId = columns[colIdx].id ?? "";
      const row = rows[rowIdx];
      if (newValue.kind === GridCellKind.Text) {
        await onPatch(row.id, colId, newValue.data, row.updated_at);
      }
    },
    [rows, onPatch],
  );

  return (
    <DataEditor
      columns={columns}
      rows={rows.length}
      getCellContent={getCellContent}
      onCellEdited={onCellEdited}
      width="100%"
      height={600}
      theme={{
        bgCell: "#0a0a0a",
        bgHeader: "#1a1a1a",
        textDark: "#e4e4e7",
        textLight: "#a1a1aa",
        borderColor: "#27272a",
        accentColor: "#f59e0b",
        // ... 30+ 토큰
      }}
    />
  );
}
```

#### 14c-α `expected_updated_at` 통합
`onCellEdited`에서 PATCH 호출 + 충돌 시 원복 로직:
```ts
const onCellEdited = useCallback(
  async (cell: Item, newValue: EditableGridCell) => {
    const [colIdx, rowIdx] = cell;
    const row = rows[rowIdx];
    const colId = columns[colIdx].id ?? "";
    if (newValue.kind !== GridCellKind.Text) return;

    const original = row[colId as keyof Row];
    const expectedAt = row.updated_at;

    // 옵티미스틱 갱신
    setRows((old) => old.map((r, i) => (i === rowIdx ? { ...r, [colId]: newValue.data } : r)));

    try {
      const res = await fetch(`/api/v1/tables/${table}/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          values: { [colId]: { action: "set", value: newValue.data } },
          expected_updated_at: expectedAt,
        }),
      });
      const payload = await res.json();
      if (res.ok && payload.success) {
        setRows((old) => old.map((r, i) => (i === rowIdx ? (payload.data.row as Row) : r)));
      } else if (res.status === 409) {
        setRows((old) => old.map((r, i) => (i === rowIdx ? { ...r, [colId]: original } : r)));
        toast.error("누군가 먼저 수정했습니다", {
          /* ... */
        });
      } else {
        setRows((old) => old.map((r, i) => (i === rowIdx ? { ...r, [colId]: original } : r)));
        toast.error(payload.error?.message ?? "수정 실패");
      }
    } catch (err) {
      setRows((old) => old.map((r, i) => (i === rowIdx ? { ...r, [colId]: original } : r)));
      toast.error("네트워크 오류");
    }
  },
  [rows, setRows, onPatch],
);
```

→ TanStack/AG와 비교해 **편집 popup·Tab·Esc·Enter는 빌트인이라 우위**, 단 React 트리 외부의 Canvas라 디버깅이 어려움.

### 3.2 키보드 네비게이션 (FUNC)

빌트인. Tab/Arrow/Enter/Esc/F2/Page Up/Down/Home/End 모두 자동.

다만:
- Tab은 다음 셀로 이동 (편집 모드에서도 동일).
- Enter는 다음 행으로 이동 (Excel 관행).
- Custom 키바인딩은 `onKeyDown` props로.

→ AG와 동등. TanStack 자체구현 대비 우위.

### 3.3 다중 행 선택 (FUNC)

```tsx
import { GridSelection, CompactSelection } from "@glideapps/glide-data-grid";

const [gridSelection, setGridSelection] = useState<GridSelection>({
  columns: CompactSelection.empty(),
  rows: CompactSelection.empty(),
});

<DataEditor
  gridSelection={gridSelection}
  onGridSelectionChange={setGridSelection}
  rowSelectionMode="multi"
/>;
```

`CompactSelection`은 효율적인 range 표현. 1만 행 선택해도 메모리 작음.

→ AG와 동등. TanStack v8 빌트인 `rowSelection`과도 동등.

### 3.4 가상 스크롤 (PERF 10%)

빌트인 — Canvas 기반이라 별 설정 없음.
- 1M 행 데모 검증.
- 메모리 일정 (~50MB regardless of row count).
- 60fps 보장.

**우리 컨텍스트에서 의미**: EdgeFunctionRun이 1M+가 되면 우위지만, 현재 ~10K 예상. TanStack + Virtual로 충분.

### 3.5 CSV (FUNC) & 클립보드 복사·붙여넣기

#### Copy/Paste — 빌트인
```tsx
<DataEditor
  onPaste={true}              // 활성화
  getCellsForSelection={true} // 선택 영역 복사 활성화
  copyHeaders={true}          // CSV에 헤더 포함
  coercePasteValue={(val, cell) => {
    // 붙여넣은 값 변환
    if (cell.kind === GridCellKind.Boolean) {
      return { ...cell, data: val.toLowerCase() === "true" };
    }
    return undefined; // 기본 동작
  }}
/>
```

→ **이게 Glide의 대형 우위**. AG Community는 단일 셀 클립보드만, Range는 Enterprise. Glide는 무료로 범위 복사·붙여넣기 + Excel-format TSV 지원.

#### CSV 가져오기 (전체 import)
빌트인 없음. `onPaste`로 부분 가능. 전체 파일 import는 외부 라이브러리(Papa Parse) 필요.

### 3.6 외래키 Selector (FUNC)

#### Custom Cell
```ts
import { CustomCell, CustomRenderer, GridCellKind } from "@glideapps/glide-data-grid";

interface FKCellProps {
  refId: string;
  refDisplay: string;
  refTable: string;
}

type FKCell = CustomCell<FKCellProps>;

const fkRenderer: CustomRenderer<FKCell> = {
  kind: GridCellKind.Custom,
  isMatch: (c): c is FKCell => (c.data as any).refTable !== undefined,
  draw: (args, cell) => {
    const { ctx, theme, rect } = args;
    const { refId, refDisplay } = cell.data;
    ctx.fillStyle = theme.textDark;
    ctx.font = `12px ${theme.fontFamily}`;
    ctx.fillText(`${refId} — ${refDisplay}`, rect.x + 8, rect.y + rect.height / 2);
    return true;
  },
  provideEditor: () => ({
    editor: ({ value, onChange, onFinishedEditing }) => (
      // React 컴포넌트 — 라이브러리가 overlay popup으로 표시
      <FKSelectorPopup
        value={value.data.refId}
        refTable={value.data.refTable}
        onSelect={(newId, newDisplay) => {
          onChange({
            ...value,
            data: { ...value.data, refId: newId, refDisplay: newDisplay },
          });
          onFinishedEditing(value);
        }}
      />
    ),
  }),
};

<DataEditor customRenderers={[fkRenderer]} ... />
```

→ Custom cell editor의 `provideEditor`가 React 컴포넌트를 받으므로 cmdk Combobox를 그대로 쓸 수 있음. TanStack/AG와 동등 비용.

### 3.7 낙관적 잠금 + Optimistic UI

위 §3.1의 onCellEdited 패턴. spec 비종속. 어느 그리드든 동일.

---

## 4. API 표면

### 4.1 핵심 컴포넌트 — `<DataEditor>`
```ts
interface DataEditorProps {
  columns: GridColumn[];
  rows: number;
  getCellContent: (cell: Item) => GridCell;
  onCellEdited?: (cell: Item, newValue: EditableGridCell) => void;
  onPaste?: boolean | ((target: Item, values: readonly (readonly string[])[]) => boolean);
  getCellsForSelection?: boolean | (() => readonly (readonly GridCell[])[]);
  width?: number | string;
  height?: number;
  theme?: Partial<Theme>;
  rowSelectionMode?: "single" | "multi" | "none";
  gridSelection?: GridSelection;
  onGridSelectionChange?: (newVal: GridSelection) => void;
  customRenderers?: CustomRenderer<any>[];
  drawCell?: (args: DrawArgs<GridCell>) => boolean;
  // ... 100+ props
}
```

### 4.2 `GridCell` 종류
- Text, Number, Boolean, Uri, Image, Markdown
- Bubble (태그 칩), RowID, Loading, Protected
- Drilldown, Custom

### 4.3 `Theme` 객체 (전부 30+ 토큰)
```ts
interface Theme {
  accentColor: string;
  accentFg: string;
  accentLight: string;
  textDark: string;
  textMedium: string;
  textLight: string;
  textBubble: string;
  bgIconHeader: string;
  fgIconHeader: string;
  textHeader: string;
  textGroupHeader: string;
  bgHeader: string;
  bgHeaderHasFocus: string;
  bgHeaderHovered: string;
  bgCell: string;
  bgCellMedium: string;
  bgBubble: string;
  bgBubbleSelected: string;
  bgSearchResult: string;
  borderColor: string;
  drilldownBorder: string;
  linkColor: string;
  cellHorizontalPadding: number;
  cellVerticalPadding: number;
  headerFontStyle: string;
  baseFontStyle: string;
  fontFamily: string;
  // ...
}
```

→ Tailwind 토큰을 일일이 매핑. 일관성 유지를 위해 Tailwind config의 색상을 `getTheme()` 함수로 변환:
```ts
import resolveConfig from "tailwindcss/resolveConfig";
import tailwindConfig from "../../../tailwind.config";

const fullConfig = resolveConfig(tailwindConfig);
const colors = fullConfig.theme.colors;

export function getGlideTheme(): Partial<Theme> {
  return {
    bgCell: colors.zinc["950"],
    bgHeader: colors.zinc["900"],
    textDark: colors.zinc["200"],
    textLight: colors.zinc["500"],
    borderColor: colors.zinc["800"],
    accentColor: colors.amber["500"],
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    // ...
  };
}
```

### 4.4 React 19 호환성
React 16+ 지원, React 19 명시적 호환 (npm peer deps `>=16`). Next.js 16 App Router에서 `"use client"` 필수. SSR은 미지원 (Canvas는 client-only).

---

## 5. 성능

### 5.1 벤치마크
- **1M 행**: 60fps 검증 (공식 데모).
- **메모리**: ~50MB regardless of row count.
- **셀 편집 latency**: < 5ms (overlay popup display).
- **스크롤 fps**: 60 일정 (Canvas direct draw).

### 5.2 강점
- 메모리 일정 → 큰 데이터셋도 부담 없음.
- 스크롤 잼 0.
- DOM 노드 ~5개 → 브라우저 부담 최소.

### 5.3 약점
- 첫 페인트 지연 (Canvas ready + theme 계산).
- React DevTools에서 셀 검사 불가.
- 브라우저 텍스트 검색(Ctrl+F) 못 씀.

### 5.4 양평 부엌 컨텍스트
- 11 테이블 모두 1만 미만 → PERF 우위 무의미.
- EdgeFunctionRun이 1M+ 도달하면 우위, 그러나 그 시점에는 server-side pagination이 더 적합.

---

## 6. 통합 시나리오 — 우리 `/tables` 페이지

### 6.1 마이그레이션 청사진
1. `npm i @glideapps/glide-data-grid` (~150KB gzipped).
2. CSS import: `import "@glideapps/glide-data-grid/dist/index.css"`.
3. `src/components/table-editor/glide-data-grid.tsx` 신규 작성 (~400 LOC).
4. `table-data-grid.tsx`/`editable-cell.tsx`/`use-inline-edit-mutation.ts` 폐기.
5. `editable-cell-inputs.tsx`는 RowFormModal 전용 격리.
6. Tailwind → Glide Theme 매핑 함수 작성 (`getGlideTheme()`).
7. spec `2026-04-18-phase-14c-alpha-...` Canvas 패러다임으로 재작성.
8. ADR-005 작성: "왜 Canvas로 갔는가" 의사결정 기록.

### 6.2 비용 추산
| 항목 | 비용 |
|------|------|
| Glide API 학습 (Linen 데이터 모델, Custom Cell, theme) | 1~2일 |
| @glideapps/glide-data-grid 통합 | 1일 |
| Tailwind 4 → Glide Theme 매핑 | 1~2일 (디버깅 포함) |
| 다크 테마 themeOverride | 1일 |
| onCellEdited + PATCH wiring + 409 핸들러 | 1일 |
| FK selector (Custom Cell + provideEditor) | 2~3일 |
| CSV 가져오기 (Papa Parse + 매핑 UI) | 2~3일 |
| 가상 스크롤 | 0일 (빌트인) |
| 다중 행 선택 + 일괄 동작 | 0.5일 (빌트인) |
| 클립보드 (TSV 복사·붙여넣기) | 0일 (빌트인) |
| spec 재작성 + ADR-005 | 1일 |
| 14b 자산 폐기 + 리팩토링 | 0.5일 |
| **합계** | **약 11~14일** |

→ TanStack 자체구현(7~10일), AG Community(7~10일)보다 **3~4일 더 김**.

### 6.3 14b 자산 손실
- `editable-cell.tsx`: Glide overlay popup으로 대체. 폐기.
- `use-inline-edit-mutation.ts`: `onCellEdited` 핸들러로 흡수. 폐기.
- `editable-cell-inputs.tsx`: RowFormModal 전용으로 격리.
- `table-data-grid.tsx`: 전면 재작성.
- `row-form-modal.tsx`: 유지 (Glide 외부 모달).
- spec: 재작성 (가장 무거운 비용).

### 6.4 100점 도달 청사진 (Glide 시나리오)
| 단계 | 작업 | 점수 기여 |
|------|------|----------|
| 1 | Glide 도입 + 14c-α 재배치 | +15 → 90 |
| 2 | 다중 행 선택 + 일괄 삭제 (빌트인) | +2 → 92 |
| 3 | Custom Cell FK selector | +3 → 95 |
| 4 | CSV 가져오기 (Papa) | +2 → 97 |
| 5 | 클립보드 범위 복사·붙여넣기 (빌트인) | +2 → 99 |
| 6 | Markdown/Image 셀 (빌트인) | +1 → 100 |

→ Glide 채택 시 100점이 더 빨리 도달 (빌트인 우위), 단 도달 비용은 +3~4일 더.

### 6.5 접근성 절단선
- 시맨틱 마크업 없음 → 스크린리더 약함.
- Glide README의 "first class accessibility" 주장은 키보드 내비 한정 — 스크린리더 지원은 약함.
- 양평 부엌은 사내 관리자(소수)용이라 절단선이 약하지만, 향후 공개·외부 협력자 접근 시 제약.

---

## 7. 라이선스 & 비용

### 7.1 Glide Data Grid
- **라이선스**: MIT.
- **비용**: $0. 상업/내부 무제한.
- **회사**: Glide Apps (회사가 자체 사용 → 활발한 유지).

### 7.2 부속 라이브러리
- React, ReactDOM peer deps만.
- 외부 의존성 작음.

### 7.3 비교
| 라이브러리 | 라이선스 | 비용 |
|-----------|---------|------|
| Glide Data Grid | MIT | $0 |
| TanStack v8 | MIT | $0 |
| AG Community | MIT | $0 |

→ 동등.

---

## 8. 보안

### 8.1 XSS 표면
Canvas는 HTML 렌더링이 아니므로 **셀 데이터의 XSS 불가**. ctx.fillText()는 텍스트로만 그림.
- → 라이브러리 자체 XSS 표면 0. **이게 Glide의 보안 우위**.

### 8.2 위험 케이스 — Custom Cell의 React Editor
`provideEditor`는 React 컴포넌트 — JSX escape 자동. 단, React의 직접 HTML 주입 props(예: `dangerouslySet...HTML`)를 직접 쓰면 위험. 본 검토 대상 코드에는 사용 없음.

### 8.3 양평 부엌 신규 위험
- Glide 도입 시 클라이언트 보안 가드는 단순 (Custom Cell editor만 주의).
- 서버 측 가드(redactSensitiveValues, table-policy)는 그대로.

### 8.4 비교
| 라이브러리 | XSS 표면 | 비고 |
|-----------|----------|------|
| TanStack v8 | 없음 (마크업 없음) | 우리가 짠 셀이 안전하면 안전 |
| AG Community | 있음 (cellRenderer XSS 이력) | sanitize 책임 사용자에게 |
| Glide Data Grid | 없음 (Canvas) | provideEditor만 주의 |

→ Glide가 약간 우위 (Canvas로 표면 자체 제거).

---

## 9. 스코어링 (10개 차원, 5점 척도)

### 9.1 FUNC (18%) — 4.5 / 5
- 셀 편집·키보드·다중 선택·가상화·클립보드 복사·붙여넣기 모두 빌트인. **클립보드는 AG Community에 없는 우위**.
- 단, CSV 가져오기·정렬·필터는 자체구현 필요. -0.5.

### 9.2 PERF (10%) — 5.0 / 5
- 1M 행 60fps 검증. 메모리 일정. 만점.
- 우리 컨텍스트에서 무의미하지만 차원 점수는 만점.

### 9.3 DX (14%) — 3.5 / 5
- TS first, 문서 풍부, 데모 다양.
- 단 **Linen 데이터 모델 + theme 객체 학습 곡선**, Canvas 패러다임 디버깅 어려움. -1.5.

### 9.4 ECO (12%) — 3.5 / 5
- Glide Apps + Notion + Hex + 일부 분석 도구 채택. npm `@glideapps/glide-data-grid` 주간 ~80K 다운로드.
- TanStack(200만+), AG(100만+) 대비 작음. -1.5.

### 9.5 LIC (8%) — 5 / 5
- MIT. 만점.

### 9.6 MAINT (10%) — 4.5 / 5
- Glide Apps 자체 사용 → 동기 강함. 2025~2026 active issues. -0.5 (BUS factor 작음).

### 9.7 INTEG (10%) — 2.0 / 5
- **Tailwind/shadcn/Sonner 통합 비용 가장 큼**. Canvas는 CSS 토큰을 자동 받지 못함. theme 매핑 함수 필수.
- 14b 자산(EditableCell, useInlineEditMutation) 100% 폐기.
- spec 재작성. -3.0.

### 9.8 SECURITY (10%) — 5.0 / 5
- Canvas 렌더링 → XSS 표면 0. 만점.

### 9.9 SELF_HOST (5%) — 4.0 / 5
- 번들 ~150KB. SSR 미지원(Canvas client-only) → `next/dynamic`로 lazy load. -1.0.

### 9.10 COST (3%) — 5 / 5
- $0. 만점.

### 9.11 가중 합산
```
4.5×0.18 + 5.0×0.10 + 3.5×0.14 + 3.5×0.12 + 5.0×0.08
+ 4.5×0.10 + 2.0×0.10 + 5.0×0.10 + 4.0×0.05 + 5.0×0.03
= 0.81 + 0.50 + 0.49 + 0.42 + 0.40
+ 0.45 + 0.20 + 0.50 + 0.20 + 0.15
= 4.12 / 5
```

수정: 컨텍스트 패널티(11 테이블 / 1만 미만 → PERF 5.0 → 컨텍스트 한정 3.5 환산, INTEG 추가 패널티 2.0 → 1.5)를 보수적으로 적용:
```
4.5×0.18 + 3.5×0.10 + 3.5×0.14 + 3.5×0.12 + 5.0×0.08
+ 4.5×0.10 + 1.5×0.10 + 5.0×0.10 + 4.0×0.05 + 5.0×0.03
= 0.81 + 0.35 + 0.49 + 0.42 + 0.40
+ 0.45 + 0.15 + 0.50 + 0.20 + 0.15
= 3.92 / 5
```

여기에 14b 자산 손실 패널티(우리 컨텍스트 특이) -0.6을 더 빼면:
```
약 3.30 / 5
```

**보수적 가중 합산 점수 = 3.30 / 5** (양평 부엌 컨텍스트 한정)
**일반 가중 합산 점수 = 4.12 / 5** (컨텍스트 중립)

→ TanStack v8 자체구현(4.54), AG Community(3.71~4.19)보다 모두 낮음.

---

## 10. 리스크

### 10.1 R-1 (높) — Tailwind/shadcn 통합 디버깅
Canvas는 CSS 토큰 자동 못 받음. theme 매핑 함수 작성·디버깅 1~2일.
- **완화 불가**. 채택 시 sunk cost 인정.

### 10.2 R-2 (높) — 14b/14c-α 자산 100% 폐기
EditableCell, useInlineEditMutation, spec 모두 재작성.
- **완화 불가**.

### 10.3 R-3 (중) — 접근성 약함
스크린리더·시맨틱·브라우저 검색 모두 약함.
- **완화**: 양평 부엌은 사내 관리자용이라 절단선 약함. 단, 향후 공개 시 제약.

### 10.4 R-4 (중) — Canvas 디버깅
React DevTools에서 셀 검사 불가. console.log + 자체 debug overlay만.
- **완화**: 빌드된 데모 페이지로 사전 검증.

### 10.5 R-5 (낮) — Glide Apps 회사 의존
Glide Apps가 사용 중단 시 유지 동기 약화.
- **완화**: MIT라 fork 가능. 현재 active.

### 10.6 R-6 (낮) — SSR 미지원
Next.js App Router에서 `next/dynamic` 필수.
- **완화**: 패턴 표준. 추가 비용 작음.

---

## 11. 결론 — 100점 도달 청사진 + DQ-1.9 답

### 11.1 DQ-1.9 잠정 답: **Glide Data Grid 비채택 (TanStack v8 자체구현 유지)**

근거:
1. **컨텍스트 부적합**: 1M 행 PERF 우위가 우리(11 테이블 / 1만 미만)에서 무의미.
2. **마이그레이션 비용 최대**: 11~14일 (TanStack 7~10, AG 7~10).
3. **14b/14c-α 자산 폐기 비용 최대**.
4. **Tailwind/shadcn/접근성 통합 비용 최대**.
5. **점수 최저**: 3.30/5 (TanStack 4.54, AG 3.71~4.19).

### 11.2 Glide가 이기는 시나리오 (재평가 트리거)
- 단일 테이블이 1M+ 행 도달 (예: 시계열 로그·이벤트 스트림·분석 데이터).
- 자체 디자인 시스템 구축 의지 (Tailwind 종속 해제).
- 접근성 요구사항 없음 (사내 분석 도구 한정).
- 클립보드 범위 복사·붙여넣기가 핵심 가치 (Excel-like 분석).

→ 양평 부엌은 이 시나리오 해당 없음. 14d+ 비전 확장 시 일부 페이지(EdgeFunctionRun explorer)에 부분 도입 가능.

### 11.3 14c-α spec과의 정렬: **충돌(있음, 큼)**
- 컴포넌트 분리(`EditableCell`/`useInlineEditMutation`/`editable-cell-inputs.tsx`)가 Canvas의 `getCellContent`/`onCellEdited`/`provideEditor` 모델과 비매핑.
- spec은 DOM 셀 가정 — Canvas로 가면 라이브러리 내부 메커니즘으로 흡수됨.
- API 계약(`expected_updated_at`, 409+current)은 라이브러리 비종속이라 변경 불요.
- spec 재작성 비용이 가장 큼.

### 11.4 본 deep-dive의 결정 영향
- 후보 1(TanStack 자체구현) vs 후보 3(Glide)의 천칭에서 **TanStack 자체구현이 1.0~1.2점 우위**.
- Wave 1 종합 답으로 **TanStack v8 자체구현 채택, Glide는 부분 도입 옵션으로 보관**.
- Glide는 14d+ "1M+ 데이터 explorer" 비전 확장 시 즉시 재평가 후보.

---

## 12. 참고 (10개+)

1. [Glide Data Grid 공식 사이트](https://grid.glideapps.com/) — 메인
2. [Glide Data Grid GitHub](https://github.com/glideapps/glide-data-grid) — 리포지토리
3. [Welcome to Glide Data Grid (Docs)](https://docs.grid.glideapps.com/) — 공식 문서
4. [@glideapps/glide-data-grid npm](https://www.npmjs.com/package/@glideapps/glide-data-grid) — 패키지
5. [Glide on X — 오픈소스화 발표](https://x.com/glideapps/status/1342155067181264896) — 2020-12 공개
6. [Custom Cells](https://docs.grid.glideapps.com/api/dataeditor/custom-cells) — Custom Cell 가이드
7. [Editing](https://docs.grid.glideapps.com/api/dataeditor/editing) — onCellEdited
8. [DataEditor API](https://docs.grid.glideapps.com/api/dataeditor) — 핵심 props
9. [Implementing Custom Cells](https://docs.grid.glideapps.com/guides/implementing-custom-cells) — 가이드
10. [BaseGridCell](https://docs.grid.glideapps.com/api/cells/basegridcell) — 셀 타입 베이스
11. [Copy and Paste support](https://docs.grid.glideapps.com/extended-quickstart-guide/copy-and-paste-support) — 클립보드
12. [Editing Data](https://docs.grid.glideapps.com/extended-quickstart-guide/editing-data) — 편집 전체
13. [Releases — Glide Data Grid](https://github.com/glideapps/glide-data-grid/releases) — 릴리스 히스토리
14. [Discover Glide Data Grid 7 Features](https://prompts.brightcoding.dev/blog/discover-glide-data-grid-7-features-that-make-it-lightning-fast) — 7가지 핵심
15. [Implementing Glide Data Grid in React — Dhiwise](https://www.dhiwise.com/post/how-to-implementing-glide-data-grid-in-your-react-project) — 통합 가이드
16. [Exploring Glide Data Grid — Codemancers](https://www.codemancers.com/blog/2024-01-17-blog-glide-apps-grid) — 사용 사례
17. [Copy Paste — Joeylene](https://joeylene.com/blog/2022/copy-paste-data-grid) — 클립보드 사례
18. [Built At Lightspeed Theme — Glide Data Grid](https://www.builtatlightspeed.com/theme/glideapps-glide-data-grid) — 테마 사례
19. [Render 1 Million Rows — keyurparalkar](https://github.com/keyurparalkar/render-million-rows) — 1M 행 데모 비교
20. [Component Depot — glide-data-grid](https://component-depot.com/listing/glideapps-glide-data-grid) — 카탈로그
21. [Issues — glide-data-grid](https://github.com/glideapps/glide-data-grid/issues) — 활발성 확인

---

## 부록 A — Glide 채택 시 필요한 코딩 룰 (만약 도입 결정 시)

- `getCellContent`은 useCallback 필수 (매 렌더 새 함수 시 성능 저하).
- `theme`은 모듈 레벨 상수로 (매 렌더 새 객체 시 전체 redraw).
- Custom Cell은 별도 파일로 격리 (`src/components/table-editor/glide-cells/fk-cell.tsx` 등).
- Tailwind 토큰 → Glide Theme 매핑은 단일 함수에서 (`get-glide-theme.ts`).
- `next/dynamic`로 lazy load (SSR 미지원).
- 다크 모드 토글 시 theme 객체 교체 + key 변경으로 강제 리마운트.
- 접근성: `aria-label` props 활용 + ScreenReader 사용자 안내.

## 부록 B — TanStack v8 → Glide 마이그레이션 가이드 (만약 도입 결정 시)

1. `npm i @glideapps/glide-data-grid`
2. `app/layout.tsx`에 `import "@glideapps/glide-data-grid/dist/index.css"`
3. `src/components/table-editor/get-glide-theme.ts` 신규 (Tailwind → Glide 매핑)
4. `src/components/table-editor/glide-data-grid.tsx` 신규 (~400 LOC)
5. `src/components/table-editor/table-data-grid.tsx` 폐기
6. `src/components/table-editor/editable-cell.tsx` 폐기
7. `src/components/table-editor/use-inline-edit-mutation.ts` → `onCellEdited` 핸들러로 흡수
8. `src/components/table-editor/editable-cell-inputs.tsx` → RowFormModal 전용 격리
9. spec `2026-04-18-phase-14c-alpha-...` Canvas 패러다임으로 재작성
10. ADR-005 작성: "왜 Canvas로 갔는가" 의사결정 기록

— 끝 —
