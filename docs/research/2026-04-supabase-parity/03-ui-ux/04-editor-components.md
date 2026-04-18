# 04. 편집기 컴포넌트 — 양평 부엌 서버 대시보드

> Wave 4 · Tier 3 (U1) 산출물 — kdywave W4-U1
> 작성일: 2026-04-18 (세션 28)
> 참조: [08-sql-editor-blueprint.md](../02-architecture/08-sql-editor-blueprint.md) · [12-schema-visualizer-blueprint.md](../02-architecture/12-schema-visualizer-blueprint.md) · [16-ux-quality-blueprint.md](../02-architecture/16-ux-quality-blueprint.md)
> 근거: ADR-003, ADR-004, ADR-014, NFR-PERF.2/7/8

---

## 목차

- [1. Monaco Editor 통합](#1-monaco-editor-통합)
- [2. Schema Canvas (@xyflow + elkjs)](#2-schema-canvas-xyflow--elkjs)
- [3. AI Assistant Panel (useChat 기반)](#3-ai-assistant-panel-usechat-기반)
- [4. 코드 Diff 뷰어](#4-코드-diff-뷰어)
- [5. 공통 편집기 UX 규칙](#5-공통-편집기-ux-규칙)

---

## 1. Monaco Editor 통합

### 1-A. 개요 및 설계 원칙

Monaco Editor는 SQL Editor (`/database/sql`), Functions Editor (`/functions/[id]`), Trigger Editor, Policy Editor 등 4개 페이지에서 재사용된다. Next.js 16 App Router 환경에서 Monaco는 반드시 **동적 임포트(ssr: false)** 로 로딩해야 한다 — Monaco는 `window`, `navigator` 같은 브라우저 전용 API에 의존하므로 서버사이드 렌더링 시 에러가 발생한다.

**설계 원칙:**
1. **단일 인스턴스 패턴**: `useMonaco()` 훅에서 editor 인스턴스를 ref로 보관
2. **지연 로딩**: `@monaco-editor/react` dynamic import, loading state는 Skeleton으로 대체
3. **yp-dark 테마**: 프로젝트 디자인 시스템 다크 팔레트로 커스텀 테마 정의
4. **언어별 진입점**: SQL/PL-pgSQL/TypeScript 각각 전용 래퍼 컴포넌트
5. **Action 시스템**: `editor.addAction()` supabase-studio 패턴으로 단축키/팔레트 통합

### 1-B. 동적 임포트 및 SSR 설정

```
// src/components/editor/MonacoEditorWrapper.tsx — 동적 임포트 진입점
// Next.js 16 dynamic() 사용
// ssr: false 필수 — Monaco는 브라우저 전용 API 사용

동적 임포트 체인:
  page.tsx
    └─ dynamic(() => import('./MonacoEditorWrapper'), { ssr: false })
         └─ @monaco-editor/react (Editor 컴포넌트)
              └─ monaco-editor (핵심 번들, ~2.5MB)

로딩 fallback:
  <div className="flex h-full items-center justify-center bg-bg-300">
    <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
  </div>

번들 최적화 (next.config.ts):
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      'monaco-editor': 'monaco-editor/esm/vs/editor/editor.api',
    }
    return config
  }
```

### 1-C. yp-dark 커스텀 테마 정의

yp-dark는 디자인 시스템 다크 팔레트(§00-design-system.md)를 Monaco 토큰 색상으로 매핑한 테마이다.

```
테마 ID: 'yp-dark'
등록 시점: monaco.editor.defineTheme() — Monaco 인스턴스 로드 직후 (onMount 콜백)

색상 매핑표:
  editor.background          → #141415  (--bg-200, 에디터 배경)
  editor.foreground          → #EDEDED  (--text-primary, 기본 텍스트)
  editor.lineHighlightBackground → #1C1C1F  (--bg-300, 현재 줄 강조)
  editor.selectionBackground → rgba(45,159,111,0.25)  (brand-500 25%)
  editor.selectionHighlightBackground → rgba(45,159,111,0.15)
  editorCursor.foreground    → #2D9F6F  (--brand-500)
  editorLineNumber.foreground → #6B6B72  (--text-muted)
  editorLineNumber.activeForeground → #9999A0  (--text-secondary)
  editorGutter.background    → #141415  (에디터 배경과 동일)
  editorWidget.background    → #1C1C1F  (--bg-300, 자동완성 팝업)
  editorWidget.border        → #2A2A2E  (--border-default)
  editorSuggestWidget.background → #1C1C1F
  editorSuggestWidget.border → #2A2A2E
  editorSuggestWidget.selectedBackground → #252528  (--bg-400)
  editorSuggestWidget.highlightForeground → #2D9F6F
  input.background           → #0E0E0F  (--bg-100)
  input.border               → #2A2A2E
  focusBorder                → #2D9F6F  (포커스 링)
  scrollbarSlider.background → rgba(255,255,255,0.10)
  scrollbarSlider.hoverBackground → rgba(255,255,255,0.18)
  scrollbarSlider.activeBackground → rgba(255,255,255,0.25)

토큰 규칙 (SQL 언어):
  keyword       → #FF6B9D  (--error-500 계열, SELECT/FROM/WHERE 등)
  string        → #A3E635  (연녹색, 리터럴 문자열)
  number        → #FB923C  (오렌지, 숫자 리터럴)
  comment       → #6B6B72  (--text-muted, -- 주석)
  identifier    → #EDEDED  (기본 텍스트)
  operator      → #67E8F9  (청록, =/</>/ 등 연산자)
  type          → #A78BFA  (보라, INTEGER/TEXT/BOOLEAN 등 데이터 타입)
  function      → #60A5FA  (파란, COUNT/SUM/NOW 등 함수)
```

### 1-D. SQL Editor 컴포넌트 구조

SQL Editor 페이지는 Phase 14c~14f 로드맵을 따르는 주요 편집기이다. 3-pane 레이아웃을 사용한다.

```
┌─────────────────────────────────────────────────────────────────────┐
│ [SQL Editor]  ▸ new_query_1.sql         ×  new_query_2.sql   ×  +  │  ← 탭 바
├──────────────┬──────────────────────────────────────────┬──────────┤
│              │ 1  SELECT *                               │ History  │
│  스키마 탐색기 │ 2  FROM users                            │──────────│
│  (240px)     │ 3  WHERE created_at > NOW() - INTERVAL   │ 09:12:45 │
│              │    '7 days'                               │ SELECT * │
│  ▾ public    │ 4  ORDER BY created_at DESC;              │ (2.1ms)  │
│    users     │                                           │──────────│
│    orders    │                                           │ 09:10:22 │
│    products  │                                           │ INSERT   │
│  ▾ auth      │                                           │ (0.8ms)  │
│    users     │                                           │──────────│
│              │                                           │          │
│  [검색창]     │                                           │          │
├──────────────┴──────────────────────────────────────────┴──────────┤
│  ▶ Run (Ctrl+Enter)  ⚡ Explain  ⬇ Export CSV  ⚠ 1개 경고           │  ← 툴바
├─────────────────────────────────────────────────────────────────────┤
│ 결과 (342행)  실행시간: 12.3ms  ── 탭: Results | Messages | Explain  │
│ id  │ email              │ created_at          │ is_active           │
│─────┼────────────────────┼─────────────────────┼─────────────────────│
│ 1   │ admin@example.com  │ 2026-04-11 09:23:14 │ true                │
│ 2   │ user2@example.com  │ 2026-04-12 14:05:32 │ true                │
└─────────────────────────────────────────────────────────────────────┘
```

**컴포넌트 계층:**
```
SqlEditorPage                          ← /database/sql 페이지
  ├── SqlEditorLayout                  ← 3-pane 레이아웃 컨테이너
  │     ├── SchemaExplorer             ← 좌측 240px 스키마 탐색기
  │     │     ├── SchemaTreeSearch     ← 검색 입력창
  │     │     └── SchemaTreeNode[]     ← 재귀적 트리 노드
  │     ├── EditorPane                 ← 중앙 편집기 영역
  │     │     ├── SqlTabBar            ← 탭 바 (다중 쿼리)
  │     │     ├── MonacoSqlEditor      ← Monaco 인스턴스 (dynamic)
  │     │     └── SqlEditorToolbar     ← Run/Explain/Export 버튼
  │     └── QueryHistorySidebar        ← 우측 240px 쿼리 히스토리
  └── ResultsPanel                     ← 하단 결과 패널
        ├── ResultsTable               ← 데이터 그리드 (TanStack v8)
        ├── MessagesTab                ← NOTICE/WARNING 메시지
        └── ExplainTab                 ← EXPLAIN ANALYZE 시각화
```

### 1-E. Schema Autocomplete (IntelliSense)

스키마 기반 자동완성은 Prisma DMMF(Data Model Meta Format)를 Monaco CompletionItemProvider로 등록하여 구현한다.

```
자동완성 제공 항목:
  1. 테이블명    → CompletionItemKind.Class
     트리거: FROM, JOIN, INTO, UPDATE 뒤 스페이스
     표시: 테이블명 + schema 접두사 (public.users)
     detail: "테이블 · N행 · M열"

  2. 컬럼명     → CompletionItemKind.Field
     트리거: SELECT 절, WHERE 절, ON 절 내 컨텍스트 분석
     표시: 컬럼명 + 데이터타입 배지
     detail: "INTEGER / NOT NULL / PK" 등

  3. SQL 키워드  → CompletionItemKind.Keyword
     SELECT, FROM, WHERE, GROUP BY, ORDER BY, HAVING, LIMIT,
     INSERT INTO, UPDATE, DELETE FROM, CREATE TABLE, DROP TABLE,
     BEGIN, COMMIT, ROLLBACK, EXPLAIN ANALYZE 등 120+ 키워드

  4. 내장 함수  → CompletionItemKind.Function
     집계: COUNT, SUM, AVG, MIN, MAX
     문자열: CONCAT, SUBSTRING, UPPER, LOWER, TRIM
     날짜: NOW, CURRENT_TIMESTAMP, DATE_TRUNC, EXTRACT
     JSON: json_agg, json_build_object, jsonb_set

  5. 스니펫     → CompletionItemKind.Snippet
     "sel" → "SELECT ${1:columns} FROM ${2:table} WHERE ${3:condition};"
     "ins" → "INSERT INTO ${1:table} (${2:columns}) VALUES (${3:values});"
     "upd" → "UPDATE ${1:table} SET ${2:column} = ${3:value} WHERE ${4:condition};"

DMMF 갱신 전략:
  - 페이지 마운트 시 /api/schema/dmmf 호출 (캐시: staleTime 5분)
  - 스키마 변경 이벤트 수신 시 즉시 무효화 (SSE 이벤트: schema_changed)
  - CompletionItemProvider 재등록은 Monaco dispose→재등록 패턴
```

### 1-F. Action 시스템 (editor.addAction)

supabase-studio 패턴을 참조하여 커맨드 팔레트와 키보드 단축키를 통합한다.

```
등록 Action 목록:

  actionId: 'run-query'
    label: "쿼리 실행"
    keybinding: [KeyMod.CtrlCmd | KeyCode.Enter]
    동작: 선택 영역이 있으면 선택 영역만, 없으면 전체 쿼리 실행
    콜백: onRunQuery(getSelectedOrAllSql())

  actionId: 'explain-query'
    label: "EXPLAIN ANALYZE 실행"
    keybinding: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Enter]
    동작: 현재 쿼리 앞에 EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) 추가 실행

  actionId: 'format-sql'
    label: "SQL 포맷"
    keybinding: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyF]
    동작: sql-formatter 라이브러리로 현재 내용 포맷 후 setValue()

  actionId: 'toggle-comment'
    label: "주석 토글"
    keybinding: [KeyMod.CtrlCmd | KeyCode.Slash]
    동작: 선택 줄마다 -- 토글

  actionId: 'export-results-csv'
    label: "결과 CSV 내보내기"
    keybinding: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyE]
    동작: 현재 결과셋 Papa.unparse → Blob download

  actionId: 'new-tab'
    label: "새 쿼리 탭"
    keybinding: [KeyMod.CtrlCmd | KeyCode.KeyT]
    동작: 새 빈 탭 생성, 포커스 이동

  actionId: 'close-tab'
    label: "현재 탭 닫기"
    keybinding: [KeyMod.CtrlCmd | KeyCode.KeyW]
    동작: 미저장 변경 있으면 확인 다이얼로그 → 탭 제거

  actionId: 'goto-line'
    label: "줄 이동"
    keybinding: [KeyMod.CtrlCmd | KeyCode.KeyG]
    동작: Monaco 기본 goto-line 위젯 열기

커맨드 팔레트 노출:
  Cmd+Shift+P (Mac) / Ctrl+Shift+P (Win) → Monaco 기본 커맨드 팔레트
  위 Action들이 자동으로 팔레트에 노출됨
```

### 1-G. 파괴적 SQL 감지 및 경고

```
감지 패턴 (대소문자 무시):
  - /^\s*DROP\s+(TABLE|DATABASE|SCHEMA|INDEX)/i
  - /^\s*TRUNCATE\s+/i
  - /^\s*DELETE\s+FROM\s+\w+\s*$/i  (WHERE 절 없는 DELETE)
  - /^\s*UPDATE\s+\w+\s+SET\s+.*$/i  (WHERE 절 없는 UPDATE)

감지 시 UI 반응:
  1. 에디터 하단 경고 배너 표시 (amber/warning 색상)
     "⚠ 파괴적 작업이 감지되었습니다. 실행 전 신중히 검토하세요."

  2. Run 버튼 → 빨간색(error-500) + "위험 실행" 텍스트로 변경
     클릭 시 확인 다이얼로그:
     제목: "파괴적 쿼리 실행"
     내용: "이 작업은 되돌릴 수 없습니다. 계속하시겠습니까?"
     버튼: [취소] [위험 실행 (빨간색)]

  3. 쿼리 히스토리에 ⚠ 아이콘 표시

위험 실행 후:
  - Sonner toast: error 변형, 5초 유지
  - "N행이 영향받았습니다" 메시지 + 취소 불가 안내
```

### 1-H. Functions / Trigger / Policy 편집기

SQL Editor 외에 3개 편집기가 Monaco를 재사용한다.

```
FunctionEditor  (/functions/[id])
  언어: plpgsql (PostgreSQL Procedural Language)
  특이점:
    - 함수 시그니처는 상단 ReadOnly 섹션으로 고정 (회색 배경)
    - 함수 본문($$ ... $$)만 편집 가능
    - 저장 단축키: Ctrl+S → PATCH /api/functions/:id
    - 배포 버튼: 별도 "배포" 버튼 (저장과 분리)

TriggerEditor  (/database/triggers/[id])
  언어: plpgsql
  특이점:
    - 트리거 함수 본문만 편집 (이름/이벤트는 폼 필드)
    - 높이: 300px 고정 (모달 내 편집기)

PolicyEditor  (/database/policies/[id])
  언어: sql (PostgreSQL expression)
  특이점:
    - USING 절과 WITH CHECK 절 각각 별도 편집기 인스턴스 (100px 높이)
    - 인라인 편집기 (카드 내 임베드)
    - 자동완성: 현재 테이블 컬럼 + auth.uid() 등 RLS 내장 함수

공통 EditorOptions:
  fontSize: 13 (JetBrains Mono)
  lineHeight: 20
  minimap: { enabled: false }  (작은 편집기에서는 끔)
  scrollBeyondLastLine: false
  wordWrap: 'off'
  folding: true
  foldingStrategy: 'indentation'
  renderLineHighlight: 'line'
  smoothScrolling: true
  cursorBlinking: 'smooth'
  cursorSmoothCaretAnimation: 'on'
  padding: { top: 12, bottom: 12 }
  scrollbar:
    verticalScrollbarSize: 6
    horizontalScrollbarSize: 6
    useShadows: false
```

---

## 2. Schema Canvas (@xyflow + elkjs)

### 2-A. 개요 및 기술 스택

Schema Canvas는 데이터베이스 스키마를 시각적으로 탐색하는 인터랙티브 캔버스이다. ADR-004에서 @xyflow/react v12 + elkjs v0.9를 확정했다.

**기술 결정 요약:**
- `@xyflow/react`: React 전용 노드-엣지 그래프 라이브러리 (이전 React Flow)
- `elkjs`: ELK(Eclipse Layout Kernel) JavaScript 포팅, 자동 레이아웃 계산
- `web-worker`: elkjs 레이아웃 연산을 메인 스레드 블로킹 없이 처리
- NFR-PERF.7: 50개 테이블/100개 관계에서 p95 ≤ 1.5s

### 2-B. 레이아웃 구조

```
┌─────────────────────────────────────────────────────────────────────┐
│ [Schema Visualizer]                                                  │
│ 검색: [테이블명 검색...]  레이아웃: [LR ▾]  [자동 배치]  [전체화면]    │  ← 컨트롤바
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│    ┌──────────────┐         ┌──────────────┐                        │
│    │ users        │──────→  │ orders       │                        │
│    │──────────────│  1:N    │──────────────│                        │
│    │ PK id        │         │ PK id        │                        │
│    │    email     │         │ FK user_id   │                        │
│    │    created_at│         │    total     │                        │
│    └──────────────┘         │    status    │                        │
│                             └──────────────┘                        │
│              ↑                      │ 1:N                           │
│              │                      ↓                               │
│    ┌──────────────┐         ┌──────────────┐                        │
│    │ profiles     │         │ order_items  │                        │
│    │──────────────│         │──────────────│                        │
│    │ PK id        │         │ PK id        │                        │
│    │ FK user_id   │         │ FK order_id  │                        │
│    └──────────────┘         └──────────────┘                        │
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│ 미니맵  ●  |  [+] [-] [리셋]  |  12개 테이블 · 18개 관계             │  ← 하단바
└─────────────────────────────────────────────────────────────────────┘
```

### 2-C. TableNode 디자인 스펙

TableNode는 하나의 데이터베이스 테이블을 나타내는 커스텀 노드이다.

```
TableNode 구조:
  크기: 최소 200px 너비, 높이 자동 (헤더 40px + 행당 28px)
  최대 높이: 280px (10행), 초과 시 스크롤 + "N개 더..." 텍스트

  헤더 영역 (40px):
    배경: #252528  (--bg-400)
    border-bottom: 1px solid #2A2A2E  (--border-default)
    padding: 0 12px
    내용:
      - 테이블 아이콘 (lucide: Table2, 14px, text-muted)
      - 테이블명 (font-medium, text-sm, text-primary)
      - 행 수 배지 (text-xs, text-muted, ml-auto)
      - 컨텍스트 메뉴 버튼 (MoreHorizontal, 16px, hover 시 표시)

  컬럼 행 (28px):
    배경 기본: transparent
    배경 호버: rgba(255,255,255,0.03)
    배경 선택: rgba(45,159,111,0.08)
    padding: 0 12px
    간격: 좌측 아이콘(12px) + 컬럼명(flex-1) + 타입(text-muted, text-xs)

    컬럼 아이콘:
      PK (Primary Key): KeyRound, #F59E0B  (amber)
      FK (Foreign Key): Link2, #60A5FA  (blue)
      일반:             Dot,   #6B6B72   (muted)
      Not Null 표시: 컬럼명 뒤 "*" (text-xs, text-muted)

  노드 상태:
    기본: border: 1px solid #2A2A2E
    선택됨: border: 1px solid #2D9F6F, box-shadow: 0 0 0 2px rgba(45,159,111,0.2)
    검색 일치: border: 1px solid #F59E0B  (amber 강조)
    드래그 중: opacity: 0.85, cursor: grabbing

  Handle 위치:
    FK 컬럼 우측 가운데: source Handle (type: source, id: `${columnName}-source`)
    PK 컬럼 좌측 가운데: target Handle (type: target, id: `${columnName}-target`)
    Handle 크기: 8px, 배경: #2D9F6F, border: 2px solid #141415
```

### 2-D. EdgeLabel 및 관계 표시

```
Edge 타입:
  1:N (FK → PK): 가장 일반적 관계
  N:M (조인 테이블 경유): 중간 테이블 노드가 있는 경우
  1:1 (unique FK): UNIQUE 제약이 있는 FK

Edge 스타일:
  type: 'smoothstep'  (곡선 경로)
  stroke: #3A3A3F  (--border-subtle 계열)
  strokeWidth: 1.5
  animated: false  (정적 표시)

  마우스 오버 시:
    stroke: #2D9F6F
    strokeWidth: 2
    EdgeLabel 표시

  선택 시:
    stroke: #2D9F6F
    strokeWidth: 2.5

EdgeLabel 컴포넌트:
  배경: #1C1C1F  (--bg-300)
  border: 1px solid #2A2A2E
  border-radius: 4px
  padding: 2px 6px
  font-size: 11px
  color: text-muted

  표시 내용:
    소스 측: "1" 또는 "N"
    타겟 측: "N" 또는 "1"
    중앙: FK 컬럼명 (15자 이상은 truncate)

관계 유형 아이콘 (엣지 중앙):
  1:N → 까마귀 발(crow's foot) 아이콘 (SVG 커스텀)
  1:1 → 단일 수직선 아이콘
  N:M → 양쪽 까마귀 발 아이콘
```

### 2-E. elkjs 자동 레이아웃

```
레이아웃 알고리즘: 'layered' (ELK의 계층형 레이아웃)

ELK 옵션 (layoutOptions):
  'elk.algorithm': 'layered'
  'elk.direction': 'RIGHT'  (LR 방향, 선택 가능)
  'elk.layered.spacing.nodeNodeBetweenLayers': '80'
  'elk.spacing.nodeNode': '40'
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP'
  'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF'

레이아웃 방향 선택 (컨트롤바):
  LR (Left→Right): 기본값, 대부분의 스키마에 적합
  TB (Top→Bottom): 깊은 계층 구조에 적합
  선택 시 즉시 재레이아웃 트리거

Web Worker 처리:
  elk 계산은 Web Worker로 오프로드:
    1. 메인 스레드: ELK 입력 데이터(nodes+edges) 직렬화 → Worker 전송
    2. Worker: elk.layout() 계산 (블로킹 연산)
    3. Worker: 결과(노드 위치+크기) → 메인 스레드 전송
    4. 메인 스레드: setNodes() 위치 업데이트 → ReactFlow re-render

성능 기준 (NFR-PERF.7):
  - 50개 테이블, 100개 관계: p95 ≤ 1,500ms
  - 측정: Worker 전송부터 setNodes() 완료까지
  - 초과 시: 프로그레스 바 표시 ("레이아웃 계산 중...")

초기 로드 최적화:
  - 최초 렌더: 가시 영역(viewport) 내 노드만 완전 렌더
  - 스크롤 시 lazy mount: Intersection Observer 기반
  - 노드 데이터 캐시: React Query staleTime 2분
```

### 2-F. 뷰포트 인터랙션 및 컨트롤

```
줌 컨트롤:
  최소: 0.15 (축소)
  최대: 2.0  (확대)
  기본: fitView on 초기 로드
  단축키: Ctrl+= / Ctrl+- / Ctrl+0 (리셋)

선택 및 포커스:
  클릭 → 노드 선택 (테이블 세부정보 패널 열림)
  더블클릭 → /database/tables/[tableName] 로 이동
  드래그 → 노드 이동 (위치 localStorage 저장)
  우클릭 → 컨텍스트 메뉴

컨텍스트 메뉴 (노드 우클릭):
  테이블 편집       → /database/tables/[name]
  여기서 쿼리 작성  → /database/sql?table=[name]
  관련 테이블 강조  → 이 테이블과 연결된 모든 노드/엣지 강조
  숨기기            → 이 노드를 캔버스에서 임시 숨김
  ──────────────
  테이블 삭제       → DeleteConfirmDialog (이름 입력 Level 3)

미니맵:
  위치: 우하단
  크기: 160px × 100px
  배경: #0E0E0F  (--bg-100)
  노드 색상: #252528  (--bg-400)
  활성 뷰포트 표시: rgba(45,159,111,0.2) 오버레이

검색 기능 (상단 컨트롤바):
  입력 시: 일치하는 노드명 강조 (amber border)
  일치 없는 노드: opacity 0.3
  Enter: 첫 번째 일치 노드로 panTo 이동
```

### 2-G. 테이블 상세 패널 (우측 ContextPanel)

```
트리거: 노드 클릭
패널 위치: 우측 ContextPanel (320px, 기존 레이아웃 시스템 활용)

패널 내용:
  ┌──────────────────────────────────────┐
  │ [Table2] users                [닫기]  │
  │ 스키마: public · 행 수: 4,231        │
  ├──────────────────────────────────────┤
  │ 컬럼 (6)                              │
  │  PK  id          bigint  NOT NULL    │
  │      email       text    NOT NULL    │
  │      name        text                │
  │      created_at  timestamp NOT NULL  │
  │      updated_at  timestamp           │
  │  FK  role_id     bigint              │
  ├──────────────────────────────────────┤
  │ 인덱스 (3)                            │
  │  users_pkey (id)                     │
  │  users_email_idx (email) UNIQUE      │
  │  users_role_id_idx (role_id)         │
  ├──────────────────────────────────────┤
  │ 관계 (2 → 출발, 1 ← 도착)             │
  │ → profiles.user_id (1:1)             │
  │ → orders.user_id (1:N)               │
  │ ← roles.id via role_id              │
  ├──────────────────────────────────────┤
  │ [테이블 편집]  [SQL 편집기에서 열기]    │
  └──────────────────────────────────────┘
```

---

## 3. AI Assistant Panel (useChat 기반)

### 3-A. 개요 및 설계 원칙

AI Assistant Panel은 Vercel AI SDK v6의 `useChat` 훅으로 구현하는 스트리밍 AI 채팅 패널이다. ADR-014에서 기술 스택을 확정했으며, MCP 서버 `mcp-luckystyle4u` 6개 툴을 통해 데이터베이스 조회/분석이 가능하다.

**설계 원칙:**
1. **스트리밍 우선**: 첫 토큰까지 p95 ≤ 500ms (NFR-PERF.8 파생 목표)
2. **비용 가드**: 월 $5 (BYOK 기준) 초과 시 경고 배너 표시
3. **컨텍스트 인식**: 현재 페이지(SQL 에디터/테이블/스키마)를 시스템 프롬프트에 자동 주입
4. **툴 콜 시각화**: MCP 도구 호출 시 진행 배지로 투명하게 표시

### 3-B. 레이아웃 및 상태

```
패널 위치: 3-pane 레이아웃의 우측 ContextPanel (320px)
토글 방법:
  - 헤더의 AI 버튼 (Bot 아이콘, 16px)
  - Cmd+I (전역 단축키)
  - 현재 ContextPanel 내용 교체 방식

상태 종류:
  닫힘: ContextPanel 숨김 (main 영역 전체 사용)
  열림: ContextPanel 320px 표시 (AI 채팅)
  확장: 전체 화면 오버레이 (미래 Phase)

패널 구조:
  ┌──────────────────────────────────────┐
  │ [Bot] AI 어시스턴트           [닫기]  │  ← 헤더 (48px)
  │ Anthropic · claude-sonnet-4-6        │
  ├──────────────────────────────────────┤
  │                                      │
  │ 안녕하세요! 데이터베이스에 대해      │  ← 환영 메시지
  │ 질문해주세요. SQL 작성, 스키마 분석, │    (메시지 없을 때)
  │ 쿼리 최적화를 도와드립니다.          │
  │                                      │  ← 메시지 목록 (스크롤)
  │ [User] users 테이블 구조 알려줘      │
  │                                      │
  │ [AI] users 테이블은 6개 컬럼으로     │
  │ 구성되어 있습니다:                   │
  │                                      │
  │ ┌─────────────────────────────┐      │
  │ │ 🔧 get_table_schema 호출 중 │      │  ← MCP 툴 콜 배지
  │ └─────────────────────────────┘      │
  │                                      │
  │ - id (bigint, PK)                    │  ← 스트리밍 응답
  │ - email (text, NOT NULL)             │
  │ ...                     [커서 깜박임] │
  │                                      │
  ├──────────────────────────────────────┤
  │ [입력창..................] [전송 ↑]   │  ← 입력 영역 (72px)
  │ Shift+Enter: 줄바꿈 · Enter: 전송    │
  └──────────────────────────────────────┘
```

### 3-C. useChat 훅 통합

```
Vercel AI SDK v6 useChat 기본 구성:

  api 엔드포인트: '/api/ai/chat'
  streamProtocol: 'data'  (v6 기본값)
  onError: (error) => notify.error('AI 오류: ' + error.message)

서버 라우트 (/api/ai/chat):
  모델: 'anthropic/claude-sonnet-4-6'  (AI Gateway 경유)
  maxSteps: 5  (MCP 툴 체인 최대 5단계)
  tools: mcp-luckystyle4u 서버 6개 툴

MCP 서버 (mcp-luckystyle4u) 툴 목록:
  query_database    : 읽기 전용 SQL 쿼리 실행
  get_table_schema  : 특정 테이블 스키마 조회
  list_tables       : 모든 테이블 목록 조회
  explain_query     : EXPLAIN ANALYZE 결과 반환
  get_slow_queries  : pg_stat_statements 느린 쿼리 조회
  analyze_table     : ANALYZE 실행 + 통계 반환

시스템 프롬프트 컨텍스트 주입:
  현재 페이지: /database/sql → "현재 SQL 에디터에 있습니다."
  현재 쿼리: Monaco 에디터 내용 (최대 2,000자)
  현재 테이블: /database/tables/users → "users 테이블을 보고 있습니다."
  현재 스키마: 활성 스키마 이름 (public 등)
```

### 3-D. MCP 툴 콜 배지 UI

```
툴 실행 상태 표시 (메시지 스트림 내 인라인):

  실행 중:
  ┌─────────────────────────────────────────┐
  │ 🔧 query_database 실행 중...  [애니메이션] │
  └─────────────────────────────────────────┘
  배경: rgba(45,159,111,0.08)
  border: 1px solid rgba(45,159,111,0.25)
  border-radius: 6px
  padding: 6px 10px
  폰트: text-xs, JetBrains Mono

  완료 (성공):
  ┌─────────────────────────────────────────┐
  │ ✓ query_database  0.3s  [펼치기]         │
  └─────────────────────────────────────────┘
  배경: rgba(45,159,111,0.05)
  border: 1px solid rgba(45,159,111,0.15)
  아이콘: CheckCircle2, brand-500

  완료 (오류):
  ┌─────────────────────────────────────────┐
  │ ✗ query_database  오류: permission denied │
  └─────────────────────────────────────────┘
  배경: rgba(239,68,68,0.05)
  border: 1px solid rgba(239,68,68,0.15)
  아이콘: XCircle, error-500

  펼치기 클릭 시 (툴 인풋/아웃풋 표시):
  ┌─────────────────────────────────────────┐
  │ ✓ query_database  0.3s  [접기]          │
  │─────────────────────────────────────────│
  │ 입력:                                   │
  │  { "sql": "SELECT * FROM users..." }    │
  │ 출력:                                   │
  │  { "rows": [...], "rowCount": 4231 }    │
  └─────────────────────────────────────────┘
  코드 영역: bg-bg-100, font JetBrains Mono, 최대 높이 200px 스크롤
```

### 3-E. 스트리밍 Markdown 렌더링

```
사용 라이브러리: react-markdown + rehype-highlight + remark-gfm

지원 마크다운 요소:
  # 제목 1~3: text-base/sm/xs, font-semibold
  **굵은 글씨**: font-semibold
  `인라인 코드`: bg-bg-300, JetBrains Mono, text-xs, px-1.5 py-0.5
  ```코드 블록```: bg-bg-100, border, border-radius 6px, overflow-x-scroll
  | 테이블 |: border-collapse 테이블, border-border-default
  - 목록: list-disc, pl-4
  1. 번호 목록: list-decimal, pl-4

코드 블록 언어 강조:
  sql, plpgsql, typescript, javascript: Highlight.js yp-dark 테마
  언어 배지: 코드 블록 우상단 (text-xs, text-muted)
  복사 버튼: 코드 블록 우상단 (Copy 아이콘, 클릭 시 클립보드 복사)

스트리밍 중 커서:
  마지막 문자 뒤: "▋" (블록 커서, brand-500, 깜박임 0.8s)
  isLoading === false 시: 커서 제거

메시지 목록 스크롤:
  새 메시지 추가 시: 자동 스크롤 다운 (smooth)
  사용자가 위로 스크롤 중: 자동 스크롤 일시 중지
  "맨 아래로" 버튼: 우하단 고정 표시 (ArrowDown, brand-500)
```

### 3-F. 비용 가드 UI

```
비용 추적:
  입력: 토큰 수 × $3/1M (claude-sonnet-4-6 기준)
  출력: 토큰 수 × $15/1M
  누적: 당월 사용량, localStorage 저장 + 서버 동기화

비용 경고 단계:
  80% ($4/월):
    헤더 아래 노란색 배너 (warning):
    "⚠ 이번 달 AI 사용량이 80%에 달했습니다 ($3.92 / $5.00)"

  100% ($5/월):
    빨간색 배너 (error):
    "✗ 월간 AI 사용 한도에 도달했습니다. 추가 비용이 발생할 수 있습니다."
    [계속 사용] [한도 올리기] 버튼
    계속 사용 클릭 시: 경고 닫힘 + 다음 달까지 재표시 안 함

  한도 설정 모달:
    /settings/ai 페이지 또는 인라인 모달
    슬라이더: $1 ~ $50
    현재 기본값: $5
    저장 버튼: PATCH /api/settings { aiMonthlyLimit: N }

토큰 사용량 표시 (채팅 입력창 아래):
  "이번 달: $1.23 / $5.00 사용"  (text-xs, text-muted)
  프로그레스 바: brand-500, 높이 2px
```

---

## 4. 코드 Diff 뷰어

### 4-A. 개요 및 사용 시나리오

코드 Diff 뷰어는 AI가 SQL 또는 함수 코드 수정을 제안할 때 변경 전/후를 나란히 보여주는 컴포넌트이다. Monaco Editor의 diff 기능을 활용한다.

**사용 시나리오:**
1. AI Assistant가 SQL 최적화 제안 → Diff로 현재 vs 제안 비교
2. 함수 편집기 저장 전 변경 사항 확인
3. SQL Editor에서 "이전 버전과 비교" 기능

### 4-B. MonacoDiffViewer 컴포넌트

```
컴포넌트: MonacoDiffViewer
로딩 방식: dynamic import, ssr: false (Monaco와 동일)

레이아웃:
  ┌────────────────────┬────────────────────┐
  │ 기존 코드          │ 수정 제안           │
  │──────────────────  │──────────────────  │
  │ SELECT *           │ SELECT             │
  │ FROM users         │   id, email, name  │
  │                    │ FROM users         │
  │─────────────────── │ ─────────────────  │
  │ (삭제 줄: red bg)  │ (추가 줄: green bg)│
  └────────────────────┴────────────────────┘

Monaco DiffEditor 설정:
  original: 기존 코드 (readOnly: true)
  modified: 제안 코드 (readOnly: true)
  theme: 'yp-dark'
  renderSideBySide: true  (나란히 표시)
  ignoreTrimWhitespace: true
  renderIndicators: true

diff 색상:
  삭제 줄: rgba(239,68,68,0.12) 배경, #EF4444 좌측 선
  추가 줄: rgba(45,159,111,0.12) 배경, #2D9F6F 좌측 선
  수정 인라인: 글자 단위 강조 (기존 red, 추가 green)
```

### 4-C. Accept / Reject 툴바

```
DiffActionToolbar 컴포넌트:
  위치: Diff 뷰어 상단 (44px 고정 높이)
  배경: bg-bg-300
  border-bottom: border-border-default

  ┌────────────────────────────────────────────────┐
  │ AI 제안 쿼리                                    │
  │ "WHERE 절 최적화로 인덱스 활용 개선"  ← AI 설명  │
  │────────────────────────────────────────────────│
  │ [✓ 적용] [✗ 거부] [diff만 보기/나란히 보기 토글] │
  └────────────────────────────────────────────────┘

[✓ 적용] 버튼:
  변형: 기본 (brand-500 배경)
  클릭 동작:
    SQL Editor: Monaco setValue(proposedCode)
    Functions Editor: 폼 필드 업데이트
  후처리: Diff 뷰어 닫힘 + Sonner "제안이 적용되었습니다" (success)

[✗ 거부] 버튼:
  변형: outline (border-border-default)
  클릭 동작: Diff 뷰어 닫힘 + 원본 유지
  후처리: AI 채팅에 "거부됨" 피드백 메시지 표시

보기 토글:
  "나란히 보기" (기본) ↔ "인라인 보기"
  Monaco DiffEditor renderSideBySide 토글

높이 조정:
  기본: 300px
  핸들 드래그: 최소 150px, 최대 600px
  "전체 화면" 버튼: 모달 오버레이로 확대
```

### 4-D. AI Chat 내 Diff 카드 표시

```
AI 응답 내 diff 블록 마크다운:
  ```diff
  - SELECT * FROM users
  + SELECT id, email, name FROM users
  + WHERE is_active = true
  ```

렌더링:
  diff 코드 블록 → DiffInlineCard 컴포넌트로 렌더
  (react-markdown의 code 컴포넌트 커스텀 renderer 활용)

DiffInlineCard:
  ┌──────────────────────────────────────────┐
  │ diff  [나란히 보기로 전환]  [적용] [거부]  │
  │──────────────────────────────────────────│
  │ - SELECT * FROM users                    │
  │ + SELECT id, email, name FROM users      │
  │ + WHERE is_active = true                 │
  └──────────────────────────────────────────┘
  삭제 줄: bg-red-500/10, 텍스트 text-red-400
  추가 줄: bg-green-500/10, 텍스트 text-green-400
  최대 높이: 200px, 초과 시 "더 보기" 링크

[나란히 보기로 전환] 클릭:
  MonacoDiffViewer 모달 열림 (전체 diff 표시)
```

---

## 5. 공통 편집기 UX 규칙

### 5-A. 단축키 레퍼런스

모든 편집기 컴포넌트에 공통 적용되는 키보드 단축키이다. 충돌 방지를 위해 전역 단축키와 분리한다.

```
편집기 포커스 상태 단축키:

  Ctrl+Enter (Mac: Cmd+Enter)
    SQL Editor: 쿼리 실행
    Functions Editor: 저장 + 배포 확인
    Policy Editor: 저장

  Ctrl+S (Mac: Cmd+S)
    모든 편집기: 저장 (임시 저장 + 서버 동기화)

  Ctrl+Shift+F (Mac: Cmd+Shift+F)
    코드 포맷 (sql-formatter / prettier)

  Ctrl+/ (Mac: Cmd+/)
    주석 토글

  Ctrl+Z (Mac: Cmd+Z)
    실행 취소 (Monaco 내장)

  Ctrl+Shift+Z (Mac: Cmd+Shift+Z)
    다시 실행 (Monaco 내장)

  Ctrl+F (Mac: Cmd+F)
    편집기 내 찾기 (Monaco 내장 검색 위젯)

  Ctrl+H (Mac: Cmd+Option+F)
    찾기+바꾸기 (Monaco 내장)

  F1 또는 Ctrl+Shift+P
    커맨드 팔레트 (Monaco 내장)

  Escape
    커맨드 팔레트 닫기
    Diff 뷰어 닫기
    자동완성 팝업 닫기

전역 단축키 (편집기 포커스 불필요):
  Ctrl+K      : 글로벌 커맨드 팔레트 (cmdk)
  Ctrl+I      : AI Assistant Panel 토글
  Ctrl+Enter  : 편집기 비포커스 시 무시
```

### 5-B. 미저장 변경사항 경고

```
감지 조건:
  Monaco onChange 이벤트에서 원본 값과 현재 값 비교
  isDirty = currentValue !== savedValue

미저장 상태 표시:
  탭 제목: "new_query_1.sql" → "new_query_1.sql ●" (brand-500 점)
  저장 버튼: "저장됨" → "저장" (활성화)
  헤더 breadcrumb: 파일명 뒤 "(수정됨)" 회색 텍스트

페이지 이탈 경고:
  Next.js router.beforePopState() 활용
  Prompt 메시지: "저장하지 않은 변경 사항이 있습니다. 이동하시겠습니까?"
  버튼: [이 페이지에 머물기] [이동 (변경사항 폐기)]

탭 닫기 경고 (SQL Editor):
  해당 탭 미저장 시 닫기 클릭:
  소형 팝오버:
    "저장하지 않은 쿼리가 있습니다"
    [저장 후 닫기] [저장 없이 닫기]
  저장 후 닫기: Ctrl+S → 탭 닫기
  저장 없이 닫기: 즉시 탭 제거

브라우저 이탈 경고 (window.beforeunload):
  isDirty === true 이면 브라우저 기본 이탈 확인 다이얼로그 표시
  (브라우저 종료/새로고침/다른 도메인 이동 시)
```

### 5-C. 결과 표시 패널

SQL 쿼리 실행 결과는 에디터 하단의 ResultsPanel에 표시된다.

```
ResultsPanel 탭 구조:
  [결과 (N행)]  [메시지]  [EXPLAIN]

결과 탭:
  컴포넌트: TanStack Table v8 (docs/03-ui-ux/02-table-and-form-patterns.md 패턴)
  특이점:
    - 읽기 전용 (인라인 편집 비활성)
    - 최대 표시 행: 1,000행 (applyRowLimit 함수)
    - 1,000행 초과 시: "1,000행만 표시 중 (전체 N행)" 배너
    - NULL 값: 이탤릭 회색 "null" 텍스트
    - boolean: true/false 배지 (green/muted)
    - timestamp: 상대 시간 (2분 전) + 호버 시 절대 시간
    - JSON: 인라인 축약 표시 + 클릭으로 JSON 뷰어 모달
  내보내기: 상단 툴바 "CSV 내보내기" 버튼

메시지 탭:
  NOTICE, WARNING, INFO 레벨 메시지 표시
  형식: [시간] [레벨 배지] 메시지 텍스트
  PostgreSQL NOTICE 메시지 파싱 (pg 드라이버)

EXPLAIN 탭:
  EXPLAIN ANALYZE JSON 결과 트리 시각화
  노드 타입별 색상 구분:
    Seq Scan: amber (느린 풀 스캔)
    Index Scan: green (인덱스 활용)
    Hash Join / Merge Join: blue
    Sort: purple
  각 노드: Actual Time / Rows / Loops 표시
  Seq Scan 감지 시 경고: "⚠ 풀 테이블 스캔 감지 — 인덱스 추가를 고려하세요"

결과 패널 크기 조정:
  패널 상단 경계: 드래그 핸들 (6px 높이, hover 시 brand-500)
  기본 높이: 260px
  최소: 120px (헤더+1행)
  최대: 60vh
  상태 저장: localStorage 'ypb:results-panel-height'
```

### 5-D. 행 제한 가드 (applyRowLimit)

```
목적: 대용량 쿼리 결과가 브라우저 메모리를 과점하는 것 방지

구현:
  쿼리 실행 시 자동으로 LIMIT N 추가 여부 판단:
    사용자 쿼리에 LIMIT 절 없음 + SELECT 문 → 자동 LIMIT 추가

  행 제한 기본값: 1,000행
  설정 위치: 에디터 하단 상태바 "행 제한: 1,000 ▾"
  변경 가능값: 100 / 500 / 1,000 / 5,000 / 제한 없음

  제한 없음 선택 시 경고 토스트:
    "행 제한을 해제하면 대용량 결과로 브라우저가 멈출 수 있습니다."

  자동 LIMIT 추가 표시:
    에디터 상단 읽기 전용 배너:
    "ℹ 자동으로 LIMIT 1,000이 추가되었습니다. [변경]"

  결과 탭 상단 배너:
    N행 이상 시: "⚠ N행 중 1,000행만 표시 중 — 전체 결과를 보려면 행 제한을 높이세요."

사용자 LIMIT 보존:
  쿼리에 LIMIT 절이 있으면 자동 LIMIT 추가 안 함
  사용자 LIMIT가 설정 제한보다 높으면 경고 표시만 (강제 변경 안 함)
```

### 5-E. 에디터 상태바

```
Monaco Editor 하단 상태바 (24px):
  배경: #0E0E0F  (--bg-100)
  border-top: 1px solid #1E1E22  (--border-subtle)
  폰트: text-xs, JetBrains Mono, text-muted

  좌측 정보:
    현재 커서 위치: "줄 3, 열 15"
    선택 범위: "선택됨: 42자" (선택 시 표시)
    파일 크기: "1.2 KB"

  우측 정보:
    언어 모드: "SQL" / "PL/pgSQL" / "TypeScript"  → 클릭 시 언어 변경 팝오버
    인코딩: "UTF-8"
    줄 끝 문자: "LF"
    행 제한: "행 제한: 1,000 ▾"  (SQL Editor 전용)
    실행 시간: "12.3ms"  (마지막 실행 결과, SQL Editor 전용)

언어 변경 팝오버 (클릭 시):
  sql · plpgsql · typescript · javascript · json · yaml · markdown
  선택 시 Monaco setModelLanguage() 호출
```

### 5-F. 편집기 전반 접근성 (WCAG 2.2 AA)

```
포커스 관리:
  편집기 활성 시: 포커스 ring 2px solid #2D9F6F
  모달 열림 시: 포커스 모달 내 트랩 (focus-trap-react)
  모달 닫힘 시: 트리거 요소로 포커스 복귀

키보드 전용 네비게이션:
  Tab: 도구 모음 버튼 순환 탐색
  Arrow keys: 결과 테이블 셀 이동
  Space: 체크박스 토글
  Enter: 버튼 활성화

스크린 리더 레이블:
  Monaco 컨테이너: role="region", aria-label="SQL 편집기"
  결과 테이블: role="grid", aria-label="쿼리 결과 (N행)"
  탭 목록: role="tablist", aria-label="에디터 탭"
  각 탭: role="tab", aria-selected, aria-controls

동작 감소 (prefers-reduced-motion):
  편집기 커서 깜박임: 정지 (animation: none)
  스크롤 애니메이션: instant (scroll-behavior: auto)
  MCP 배지 스피너: 정지 (animation: none)

고대비 모드 (prefers-contrast: more):
  에디터 border: 2px solid #EDEDED
  포커스 ring: 3px solid #FFFFFF
  diff 강조: 더 높은 채도 색상 사용
```

---

## 참조 목록

| 참조 문서 | 경로 | 관련 결정 |
|-----------|------|-----------|
| SQL Editor Blueprint | `02-architecture/08-sql-editor-blueprint.md` | Phase 14c~14f, Monaco Action 패턴 |
| Table Editor Blueprint | `02-architecture/09-table-editor-blueprint.md` | TanStack v8, 결과 테이블 패턴 |
| Schema Visualizer Blueprint | `02-architecture/12-schema-visualizer-blueprint.md` | @xyflow + elkjs, NFR-PERF.7 |
| UX Quality Blueprint | `02-architecture/16-ux-quality-blueprint.md` | AI Assistant, mcp-luckystyle4u |
| ADR-003 | `research/decisions/ADR-003-monaco-editor.md` | Monaco Editor 채택 결정 |
| ADR-004 | `research/decisions/ADR-004-schema-visualizer.md` | @xyflow + elkjs 채택 결정 |
| ADR-014 | `research/decisions/ADR-014-ai-sdk.md` | Vercel AI SDK v6, BYOK |
| NFR 문서 | `00-vision/03-non-functional-requirements.md` | NFR-PERF.2/7/8 성능 목표 |
| Design System | `03-ui-ux/00-design-system.md` | 색상 팔레트, yp-dark 토큰 |
| Table & Form Patterns | `03-ui-ux/02-table-and-form-patterns.md` | TanStack v8 표준 패턴 |

---

## 변경 이력

| 버전 | 날짜 | 내용 |
|------|------|------|
| v1.0 | 2026-04-18 | 최초 작성 (세션 28, Wave 4 Tier 3 U1) |

---

> **L4 품질 계약 준수:**
> - 모든 색상: 실제 hex 값 (`#141415`, `#2D9F6F`, `#EDEDED` 등) — TBD 없음
> - WCAG 2.2 AA: §5-F에서 포커스 관리, 스크린 리더, 고대비 모드 전부 명시
> - Tier 2 컴포넌트명 일치: Monaco addAction, TableNode, EdgeLabel, AIAssistantPanel, MonacoDiffViewer
> - ADR 근거: ADR-003(Monaco), ADR-004(xyflow), ADR-014(AI SDK) 전부 인용
> - NFR 근거: NFR-PERF.7(≤1.5s), NFR-PERF.8(LCP ≤1.8s), NFR-UX.1(다크 일관성)
