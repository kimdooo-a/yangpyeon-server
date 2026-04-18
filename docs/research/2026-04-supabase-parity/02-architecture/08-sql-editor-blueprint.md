# 08. SQL Editor Blueprint — 카테고리 2 (Phase 18)

> Wave 4 · Tier 2 · B4 Editor 클러스터 산출물
> 작성일: 2026-04-18 (세션 28, kdywave W4-B4)
> 상위: [CLAUDE.md](../../../../CLAUDE.md) → [docs/research/2026-04-supabase-parity/](../) → [02-architecture/](./) → **이 문서**
> 연관: [01-adr-log.md](./01-adr-log.md) ADR-003 · ADR-014 · [00-system-overview.md](./00-system-overview.md) · [09-table-editor-blueprint.md](./09-table-editor-blueprint.md)
> 근거 Wave 1: `01-research/02-sql-editor/01~05` (5 문서) · Wave 2 매트릭스: `04-sql-editor-matrix.md`
> 근거 Wave 3: `00-vision/02-functional-requirements.md §FR-2.*` · `00-vision/03-non-functional-requirements.md` · `00-vision/07-dq-matrix.md §3.3`

---

## 0. 문서 목적 및 범위

### 0.1 역할

이 문서는 양평 부엌 서버 대시보드의 **SQL Editor(카테고리 2)를 현재 70점에서 100점으로 끌어올리기 위한 단일 진실 소스 Blueprint**다. Wave 4 Tier 2 산출물로서, Phase 18 구현팀(단독 운영자 포함)이 이 문서를 보고 설계 근거·컴포넌트 구조·보안 정책·4단계 일정을 전부 이해할 수 있어야 한다.

### 0.2 현황 점수

| 구분 | 현재 점수 | 목표 점수 | 갭 |
|------|----------|----------|-----|
| SQL Editor (카테고리 2) | 70/100 | 100/100 | 30점 |
| 전체 14 카테고리 공수 중 순위 | 최대 (~320h) | — | 40일 |

현재 70점의 근거: Phase 14c에서 `MonacoEditor` 동적 임포트 + `app_readonly` 연결 + 기본 저장/삭제 API가 이미 구현됨(세션 24 기준). 부재 기능: 멀티탭, 폴더 구조, EXPLAIN Visualizer, AI 어시스턴트, sql-formatter 포맷터, 공유 URL, 실행 이력, Row Limit 가드, 파괴적 쿼리 확인 모달.

### 0.3 ADR 연결

- **ADR-003** (Accepted): "supabase-studio Apache-2.0 패턴 직접 포팅 + Outerbase 공개 참조 + sqlpad 3중 흡수". 라이브러리 임베드 금지, 패턴만 흡수. Wave 2 매트릭스 4.70/5.
- **ADR-014** (Accepted): "Vercel AI SDK v6 + Anthropic Claude Haiku(기본) + BYOK + 자체 MCP `mcp-luckystyle4u`". AI 14f 보너스 구현 시 이 ADR 따름.

---

## 1. 요약 — 최대 공수 카테고리, 4단계 세분화

SQL Editor는 14 카테고리 중 공수가 가장 크다(~320h, 40일). 이유는 다음 세 가지 복잡도가 동시에 작용하기 때문이다.

1. **Monaco 에디터 심화 설정**: 언어 서버 수준 자동완성(스키마 기반 LSP-like), 커서 위치 선택 실행, 액션 시스템(F5/Ctrl+Enter/Ctrl+S/Ctrl+/) 전부를 Next.js 16 SSR 환경에서 동적 임포트 제약 하에 구현해야 한다.
2. **폴더 계층 구조**: Supabase Studio의 `SqlSnippet` + `SqlSnippetFolder` 2-table 모델을 `SqlQuery` + `SqlQueryFolder` 2-table로 이식하고, 사이드바 트리 드래그&드롭 + 자기참조 Prisma 관계를 안정적으로 관리해야 한다.
3. **AI 어시스턴트 + 보안 격리**: Anthropic Haiku BYOK 연동, 스키마 컨텍스트 자동 주입, 비용 가드($5/월), 그리고 AI 라우트에서의 `app_readonly` 강제 + `BEGIN READ ONLY` + `statement_timeout` 삼중 가드가 동시에 필요하다.

### 1.1 4단계 세분화 로드맵 요약

| Phase | 별칭 | 기간 | 핵심 목표 | 점수 변화 |
|-------|------|------|----------|----------|
| 14c | 기본 실행 | 10일 (80h) | Monaco 기본 + 단탭 실행 + 저장/삭제 + Row Limit 1000 + 파괴적 쿼리 모달 | 70 → 80 |
| 14d | 폴더 구조 | 10일 (80h) | SqlQueryFolder + 사이드바 트리 + sql-formatter 서버 라우트 + 공유 URL + 멀티탭 | 80 → 90 |
| 14e | Plan Visualizer | 10일 (80h) | EXPLAIN(ANALYZE, BUFFERS) → 자체 xyflow 트리 렌더링 + 경고 룰셋 | 90 → 97 |
| 14f | AI 보조 / 보너스 | 10일 (80h) | Claude Haiku BYOK + 스키마 주입 + 비용 가드 + DRY-RUN Savepoint | 97 → 100 |

---

## 2. Wave 1-2 채택안 — 3중 흡수 전략 (ADR-003)

### 2.1 supabase-studio (Apache-2.0) — 점수 4.70/5, 1위

**채택 이유**: Wave 2 매트릭스 전체 1위(4.70/5). Apache-2.0 라이선스로 코드 인용 + 패턴 학습 모두 법적 안전. `SqlSnippet + SqlSnippetFolder 2-table 모델`, Zustand 탭 상태 관리, Monaco IStandaloneCodeEditor 액션 시스템, AI Assistant v2(conversational + DiffEditor Accept/Reject), 공유 URL `snippet ID 기반` 패턴 15+개가 직접 학습 대상.

**흡수 패턴 목록**:
1. `SqlSnippet` / `content` 테이블 → 우리 `SqlQuery` (scope PRIVATE/SHARED/FAVORITE) 확장
2. `SqlSnippetFolder` → `SqlQueryFolder` (parentId 자기참조 트리)
3. Monaco `editor.addAction()` 기반 F5(실행), Cmd+S(저장), Cmd+/(주석) 액션
4. `useExecuteQuery.ts` 패턴 → `useQueryExecution.ts`
5. AI Assistant v2 — SSE conversational + DiffEditor Accept/Reject → 14f 구현 기준
6. 위험 쿼리 확인 모달 (DROP/TRUNCATE/DELETE without WHERE)
7. 탭 상태 Zustand store (열린 탭 ID 배열 + 활성 탭 ID)
8. DownloadResultsButton CSV export

**라이선스 처리**: Apache-2.0 코드를 직접 인용하는 모든 파일 최상단에 다음 헤더 추가.
```typescript
// Portions adapted from supabase/supabase — Apache License 2.0
// https://github.com/supabase/supabase/blob/master/LICENSE
```

### 2.2 outerbase-studio — 점수 4.06/5, 2위 (AGPL-3.0, 패턴만)

**채택 이유**: AGPL-3.0이므로 **코드 인용 0줄**, 패턴 학습만. Outerbase는 Cloudflare에 인수된 이후 Monaco 컨텍스트 자동완성(schema-aware language provider), 멀티탭 UX(탭 헤더 + unsaved dot indicator), DiffEditor Accept/Reject AI 플로우에서 supabase-studio보다 앞선 UX 패턴을 보여준다.

**흡수 패턴 목록**:
1. 스키마 기반 자동완성 — Monaco `CompletionItemProvider` 에 테이블/컬럼/함수명 동적 주입
2. 멀티탭 헤더 — `Unsaved●` dot indicator, 탭 닫기 전 변경사항 저장 프롬프트
3. DiffEditor AI Accept/Reject — `monaco.editor.createDiffEditor()` + Anthropic 응답 diff
4. 실행 결과 패널 TanStack Table 렌더링 (FR-1.1 컴포넌트 재사용 원칙)

### 2.3 sqlpad — 점수 3.45/5, 3위 (MIT, 2025-08 아카이브 예정)

**채택 이유**: MIT + $0, 아카이브 예정이지만 역사적 UX 패턴이 우수. "쿼리 히스토리 사이드바"(시간순 + 실행 결과 미리보기), "Driver 추상화"(Node.js PG 풀 레이어), CSV 스트리밍 export 패턴이 직접 흡수 대상.

**흡수 패턴 목록**:
1. 실행 이력 사이드바 — 최근 50회 실행, 시간 + 결과 행 수 + 소요 ms 표시
2. CSV export 스트리밍 — `ReadableStream` + `Content-Disposition: attachment`
3. 쿼리 북마크 — 실행 결과와 쿼리 페어 SQLite 저장

---

## 3. 컴포넌트 설계

### 3.1 컴포넌트 계층 (Next.js 16 App Router 기준)

```
/app/(protected)/sql-editor/
├── page.tsx                          # SqlEditorPage — 최상위 서버 컴포넌트 (레이아웃만)
│                                     # 실제 에디터는 Client Component로 lazy import
└── _components/                      # 내부 전용 Client Components
    ├── SqlEditorView.tsx              # 메인 레이아웃 (3-column: Sidebar | Editor | Results)
    ├── MonacoWrapper.tsx              # Monaco 래퍼 (dynamic import 분리)
    ├── QueryTabBar.tsx                # 멀티탭 헤더 바 (unsaved dot, 탭 닫기)
    ├── QuerySidebar.tsx               # 사이드바 (폴더 트리 + 히스토리 + 검색)
    ├── QueryFolderTree.tsx            # 폴더 트리 (재귀 렌더링, 드래그&드롭 준비)
    ├── QueryResultPanel.tsx           # 결과 패널 (TanStack Table 렌더링 + CSV export)
    ├── ExplainVisualizerPanel.tsx     # EXPLAIN Plan xyflow 트리 (14e)
    ├── AiAssistantPanel.tsx           # AI 어시스턴트 패널 (14f)
    ├── DangerQueryModal.tsx           # 파괴적 쿼리 2단계 확인 모달
    └── use-sql-editor-store.ts        # Zustand store (탭/활성탭/편집 상태)

/app/api/v1/sql/
├── execute/route.ts                   # POST — QueryExecutor (app_readonly 분기)
├── format/route.ts                    # POST — sql-formatter 서버 라우트 (DQ-2.5 답변)
├── explain/route.ts                   # POST — EXPLAIN(ANALYZE?) 실행
├── queries/route.ts                   # GET/POST — SqlQuery CRUD
├── queries/[id]/route.ts              # PATCH/DELETE — 단일 쿼리 수정/삭제
└── folders/route.ts                   # GET/POST/PATCH/DELETE — SqlQueryFolder CRUD
```

### 3.2 SqlEditorView — 핵심 레이아웃 컴포넌트

```typescript
// Portions adapted from supabase/supabase — Apache License 2.0
// https://github.com/supabase/supabase/blob/master/LICENSE

"use client";

interface SqlEditorViewProps {
  initialQueries: SqlQuerySummary[];
  initialFolders: SqlQueryFolder[];
}

export function SqlEditorView({ initialQueries, initialFolders }: SqlEditorViewProps) {
  const { tabs, activeTabId, openTab, closeTab, setTabSql } = useSqlEditorStore();

  return (
    <div className="flex h-full overflow-hidden">
      {/* 좌측 사이드바: 폴더 트리 + 히스토리 */}
      <aside className="w-64 flex-shrink-0 border-r border-border overflow-y-auto">
        <QuerySidebar
          queries={initialQueries}
          folders={initialFolders}
          onSelectQuery={(q) => openTab(q)}
        />
      </aside>

      {/* 중앙: 탭 바 + Monaco 에디터 */}
      <main className="flex flex-1 flex-col overflow-hidden">
        <QueryTabBar
          tabs={tabs}
          activeTabId={activeTabId}
          onClose={closeTab}
        />
        <div className="flex-1 overflow-hidden">
          <MonacoWrapper
            tabId={activeTabId}
            onSqlChange={setTabSql}
          />
        </div>
        <QueryActionBar />
      </main>

      {/* 우측: 결과 패널 */}
      <section className="w-[40%] flex-shrink-0 border-l border-border flex flex-col overflow-hidden">
        <QueryResultPanel />
      </section>
    </div>
  );
}
```

### 3.3 QueryExecutor — `app_readonly` / `app_readwrite` 롤 분기

QueryExecutor는 **단일 책임**: SQL 텍스트를 받아 올바른 DB 연결 풀을 선택하고 실행한 뒤 결과를 반환한다. 쿼리 텍스트 자체를 분석해 `SELECT`/`EXPLAIN`만 있으면 `app_readonly` 풀, `INSERT`/`UPDATE`/`DELETE`/`DDL`이 있으면 `app_readwrite` 풀(현재 비활성화 — Phase 14f ADMIN 전용)로 분기한다.

```typescript
// src/lib/sql/query-executor.ts

export type QueryRole = "readonly" | "readwrite";

export interface ExecuteOptions {
  sql: string;
  timeoutMs?: number;      // 기본 30_000ms
  rowLimit?: number;       // 기본 1_000
  role?: QueryRole;        // 기본 "readonly"
}

export interface ExecuteResult {
  fields: { name: string; dataTypeID: number }[];
  rows: Record<string, unknown>[];
  rowCount: number;
  durationMs: number;
  truncated: boolean;
  notice?: string;
}

export async function executeQuery(opts: ExecuteOptions): Promise<ExecuteResult> {
  const pool = opts.role === "readwrite"
    ? getReadwritePool()   // app_readwrite role (ADMIN 전용)
    : getReadonlyPool();   // app_readonly role (기본)

  const client = await pool.connect();
  try {
    await client.query(`SET statement_timeout = ${opts.timeoutMs ?? 30_000}`);
    await client.query("BEGIN READ ONLY");

    const start = Date.now();
    const result = await client.query({
      text: opts.sql,
      rowMode: "array",
    });
    const durationMs = Date.now() - start;

    await client.query("COMMIT");

    const rows = result.rows.slice(0, opts.rowLimit ?? 1_000);
    return {
      fields: result.fields,
      rows: rows.map((r) => Object.fromEntries(result.fields.map((f, i) => [f.name, r[i]]))),
      rowCount: result.rowCount ?? rows.length,
      durationMs,
      truncated: (result.rowCount ?? 0) > (opts.rowLimit ?? 1_000),
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
```

**중요 보안 결정**: `BEGIN READ ONLY`는 모든 실행에 기본 적용. `app_readwrite` 경로는 Phase 18 기준으로도 ADMIN 롤의 명시적 "읽기/쓰기 모드 전환" 토글이 있을 때만 사용. 현재 Phase 14c-γ까지는 `app_readonly`만 활성화.

### 3.4 QueryFolderManager — 폴더 CRUD + 트리 상태

Phase 14d에서 신규 구현. `SqlQueryFolder` 자기참조 트리를 서버 측 플랫 배열로 반환하고, 클라이언트에서 `buildFolderTree()` 유틸로 계층 구조를 재조립한다.

```typescript
// src/lib/sql/folder-tree.ts

export interface FolderNode {
  id: string;
  name: string;
  parentId: string | null;
  children: FolderNode[];
  queries: SqlQuerySummary[];
}

export function buildFolderTree(
  folders: SqlQueryFolder[],
  queries: SqlQuerySummary[],
): FolderNode[] {
  const nodeMap = new Map<string, FolderNode>();

  for (const f of folders) {
    nodeMap.set(f.id, { ...f, children: [], queries: [] });
  }
  for (const q of queries) {
    if (q.folderId) {
      nodeMap.get(q.folderId)?.queries.push(q);
    }
  }

  const roots: FolderNode[] = [];
  for (const node of nodeMap.values()) {
    if (!node.parentId) {
      roots.push(node);
    } else {
      nodeMap.get(node.parentId)?.children.push(node);
    }
  }
  return roots;
}
```

### 3.5 ExplainVisualizer — 자체 xyflow 트리 (Phase 14e)

`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` 결과를 수신해 `@xyflow/react` + `elkjs` 레이아웃으로 트리를 렌더링하는 전용 패널. **DQ-2.4 답변**: pev2 Vue wrapper 거부, 자체 d3/xyflow 트리 권장.

```typescript
// src/components/sql-editor/explain-visualizer.tsx

interface PlanNode {
  "Node Type": string;
  "Actual Total Time"?: number;
  "Total Cost": number;
  "Plan Rows": number;
  "Actual Rows"?: number;
  Plans?: PlanNode[];
}

// 경고 룰셋 (FR-2.2 세부 요구사항 반영)
function detectWarnings(node: PlanNode): string[] {
  const warnings: string[] = [];
  if (node["Node Type"] === "Seq Scan" && (node["Plan Rows"] ?? 0) > 10_000) {
    warnings.push("대형 테이블 Seq Scan — 인덱스 생성을 검토하세요");
  }
  if (node["Node Type"] === "Hash Join" && (node["Actual Rows"] ?? 0) > 100_000) {
    warnings.push("Hash Join 메모리 초과 우려 — work_mem 조정 또는 인덱스 확인");
  }
  if (node["Node Type"] === "Nested Loop" && (node["Plan Rows"] ?? 0) > 1_000) {
    warnings.push("Nested Loop outer row 1000+ — 쿼리 재작성을 고려하세요");
  }
  return warnings;
}
```

노드 크기는 `actual_total_time` 비례로 결정(`minWidth: 120px`, `maxWidth: 280px`). 경고 아이콘은 Lucide `AlertTriangle`(노란색), 위험 아이콘은 `AlertOctagon`(빨간색).

### 3.6 FormattedQueryExport — sql-formatter 서버 라우트 (DQ-2.5 답변)

**DQ-2.5 확정 답변**: `sql-formatter`(MIT)는 **서버 라우트 `/api/v1/sql/format`에서 실행**. 이유: (1) 초기 번들에 sql-formatter 포함 시 +130KB gzip 증가 (NFR-PERF.8 초기 청크 250KB 목표 위협), (2) 서버에서 한 번 실행하면 모든 클라이언트가 동일 포맷 결과를 받아 일관성 보장, (3) 향후 포맷 규칙(2-space/4-space, uppercase keyword) 서버 설정화 가능.

```typescript
// /app/api/v1/sql/format/route.ts

import { format } from "sql-formatter";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { sql, language = "postgresql" } = await req.json() as { sql: string; language?: string };
  if (!sql || typeof sql !== "string" || sql.length > 1_000_000) {
    return NextResponse.json({ success: false, error: { message: "SQL 텍스트 크기 초과 또는 누락" } }, { status: 400 });
  }
  try {
    const formatted = format(sql, {
      language: language as "postgresql",
      indentStyle: "standard",
      keywordCase: "upper",
      tabWidth: 2,
    });
    return NextResponse.json({ success: true, data: { formatted } });
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: { message: err instanceof Error ? err.message : "포맷 실패" },
    }, { status: 422 });
  }
}
```

클라이언트 Monaco에서는 `Format SQL (Shift+Alt+F)` 키 바인딩으로 이 API를 호출 후 에디터 값을 갱신한다.

### 3.7 AISqlAssistant — Phase 14f 보너스 (ADR-014 + ADR-003)

AI 어시스턴트는 **14f 보너스**로 분류된다. 구현 완료 시 100점 달성에 기여하지만, 14e까지 97점 상태로도 Supabase 동등 수준의 핵심 SQL 워크플로우는 완성된다.

**AI 라우트 설계** (`/api/v1/sql/ai-assist`):

```typescript
// 스키마 컨텍스트 자동 주입 + 비용 가드

interface AiSqlRequest {
  prompt: string;
  currentSql?: string;
  apiKey: string;          // BYOK — 클라이언트가 설정 페이지에서 입력한 키
  conversationHistory?: Message[];
}

// 스키마 컨텍스트 빌더 (최대 8000 토큰 예산)
async function buildSchemaContext(budgetTokens = 8_000): Promise<string> {
  const tables = await prisma.$queryRaw<{ name: string; columns: string }[]>`
    SELECT t.table_name AS name,
           string_agg(c.column_name || ' ' || c.data_type, ', ' ORDER BY c.ordinal_position) AS columns
    FROM information_schema.tables t
    JOIN information_schema.columns c ON c.table_name = t.table_name
    WHERE t.table_schema = 'public'
    GROUP BY t.table_name
    LIMIT 100
  `;
  const context = tables
    .map((t) => `${t.name}(${t.columns})`)
    .join("\n");
  // 토큰 예산 초과 시 요약 (컬럼 타입 제거)
  return countTokens(context) > budgetTokens
    ? tables.map((t) => t.name).join(", ")
    : context;
}
```

**비용 가드**: 사용자별 월 한도 기본 $5. SQLite `ai_usage_log` 테이블에 요청별 토큰 × 단가를 누적. 한도 초과 시 429 응답 + Sonner 토스트 "월 AI 한도 초과 — 설정에서 한도를 올리거나 내달까지 대기하세요".

**AI 응답 저장 정책**: 생성된 SQL 제안은 **영구 저장 금지**(세션 종료 시 메모리 소거). 사용자가 "에디터에 삽입" 버튼을 클릭해야만 현재 탭에 복사 — FR-2.3 세부 요구사항 5번 반영.

---

## 4. Monaco 설정 — 언어 서버 + 자동완성 + 단축키

### 4.1 Monaco 초기화 옵션

```typescript
// src/components/sql-editor/monaco-wrapper.tsx

const MONACO_OPTIONS: MonacoEditorOptions = {
  language: "sql",
  theme: "vs-dark",
  minimap: { enabled: false },
  fontSize: 13,
  lineNumbers: "on",
  scrollBeyondLastLine: false,
  automaticLayout: true,
  wordWrap: "on",
  tabSize: 2,
  renderLineHighlight: "line",
  padding: { top: 8, bottom: 8 },
  suggest: {
    showKeywords: true,
    showFunctions: true,
    showVariables: true,
  },
  quickSuggestions: {
    other: true,
    comments: false,
    strings: false,
  },
};
```

### 4.2 스키마 기반 자동완성 Provider

```typescript
// src/lib/sql/schema-completion-provider.ts

export function registerSchemaCompletionProvider(
  monaco: Monaco,
  schema: SchemaInfo,
) {
  return monaco.languages.registerCompletionItemProvider("sql", {
    triggerCharacters: [".", " ", "\n"],
    provideCompletionItems(model, position) {
      const wordInfo = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: wordInfo.startColumn,
        endColumn: wordInfo.endColumn,
      };

      const suggestions: monaco.languages.CompletionItem[] = [];

      // 테이블명
      for (const table of schema.tables) {
        suggestions.push({
          label: table.name,
          kind: monaco.languages.CompletionItemKind.Class,
          detail: `테이블 (${table.columnCount}컬럼, ~${table.rowEstimate.toLocaleString()}행)`,
          insertText: table.name,
          range,
        });
      }

      // 컬럼명 (현재 컨텍스트 테이블 추론)
      for (const col of schema.columns) {
        suggestions.push({
          label: col.columnName,
          kind: monaco.languages.CompletionItemKind.Field,
          detail: `${col.tableName}.${col.columnName} — ${col.dataType}`,
          insertText: col.columnName,
          range,
        });
      }

      return { suggestions };
    },
  });
}
```

### 4.3 단축키 매핑

| 단축키 | 액션 | 구현 방법 |
|--------|------|----------|
| `Ctrl/Cmd + Enter` | 현재 선택 영역 또는 전체 쿼리 실행 | `editor.addCommand(KeyMod.CtrlCmd \| KeyCode.Enter, ...)` |
| `Ctrl/Cmd + S` | 현재 탭 쿼리 저장 | `editor.addAction({ id: 'save-query', ... })` |
| `Ctrl/Cmd + /` | 선택 영역 주석 토글 | Monaco 내장 `editor.getAction('editor.action.commentLine')` |
| `Shift + Alt + F` | SQL 포맷터 (서버 라우트 호출) | `editor.addAction({ id: 'format-sql', ... })` |
| `F5` | 쿼리 실행 (전체) | `editor.addAction({ id: 'run-query', ... })` |
| `Ctrl/Cmd + Shift + E` | EXPLAIN 실행 | `editor.addAction({ id: 'explain-query', ... })` |
| `Ctrl/Cmd + K` | 명령 팔레트 (내장) | Monaco 내장 `editor.getAction('editor.action.quickCommand')` |

---

## 5. 보안 설계 — 3중 가드

### 5.1 `app_readonly` 롤 강제

모든 SQL 실행 API(`/api/v1/sql/execute`, `/api/v1/sql/explain`, `/api/v1/sql/ai-assist`)는 `app_readonly` PostgreSQL 롤로 연결한 풀을 사용한다. 환경변수 `READONLY_DATABASE_URL`에 `user=app_readonly` 가 포함된 연결 문자열을 주입한다.

```
# .env (예시 — 실제 시크릿은 /etc/luckystyle4u/secrets.env)
READONLY_DATABASE_URL="postgresql://app_readonly:${READONLY_PW}@localhost:5432/yangpyeong?connection_limit=5"
```

`app_readonly` 롤 정의 (마이그레이션 포함):
```sql
CREATE ROLE app_readonly WITH LOGIN PASSWORD '...';
GRANT CONNECT ON DATABASE yangpyeong TO app_readonly;
GRANT USAGE ON SCHEMA public TO app_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO app_readonly;
```

### 5.2 `BEGIN READ ONLY` 트랜잭션

QueryExecutor §3.3에서 설명한 대로 모든 실행 전 `BEGIN READ ONLY` 선언. 이로써 롤 수준에서 허용하는 `SELECT`조차도 트랜잭션 내부에서 쓰기 시도 시 PostgreSQL이 오류를 반환한다.

### 5.3 `statement_timeout` 가드

기본값 30,000ms. 사용자가 장시간 쿼리를 실행할 경우 DB 리소스를 독점하는 것을 방지한다. EXPLAIN ANALYZE는 별도로 60,000ms 허용(실제 실행 시간이 더 걸릴 수 있음).

```typescript
await client.query(`SET statement_timeout = ${timeoutMs}`);
```

### 5.4 Row Limit 1,000 가드

서버 응답에서 `rows.slice(0, 1_000)` 강제 적용. 클라이언트에서 쿼리 조건 없이 `SELECT * FROM large_table` 입력 시에도 최대 1,000행만 반환. 결과 패널에 "(1,000행으로 잘림)" 뱃지 표시(FR-2.1 세부 요구사항 반영 — 현재 sql-editor/page.tsx에 이미 구현됨).

### 5.5 파괴적 쿼리 2단계 확인 모달

실행 전 쿼리 텍스트에 다음 패턴 중 하나가 있으면 `DangerQueryModal` 표시 후 사용자 "실행" 클릭 시에만 진행:

```typescript
const DANGER_PATTERNS = [
  /\bDROP\s+(TABLE|DATABASE|SCHEMA|INDEX|VIEW)\b/i,
  /\bTRUNCATE\b/i,
  /\bDELETE\s+FROM\b(?!.*\bWHERE\b)/i,   // WHERE 없는 DELETE
  /\bUPDATE\s+\w+\s+SET\b(?!.*\bWHERE\b)/i, // WHERE 없는 UPDATE
];
```

### 5.6 AI 라우트 격리 (DQ-2.6 확정 답변)

**DQ-2.6 확정 답변**: Phase 14e까지는 **DB 레벨 격리만** 적용(`app_readonly` + `BEGIN READ ONLY` + `statement_timeout`). 컨테이너/샌드박스 추가 격리는 **14g 이후**로 연기. 근거:

1. Phase 18 기준 AI 라우트는 `SELECT` 쿼리 생성 제안만 담당. 생성된 SQL을 직접 실행하지 않고 에디터에 복사 후 사용자가 수동 실행 — 이중 검토 구조.
2. Anthropic Haiku 호출 자체는 외부 API 호출이므로 DB와 무관. 스키마 컨텍스트 주입 시 민감 데이터 값이 아닌 스키마 구조(테이블명/컬럼명/타입)만 포함.
3. 컨테이너/샌드박스 격리는 isolated-vm(ADR-009, Edge Functions)과 아키텍처 공유 가능하지만, 14f 완료 후 운영 데이터에서 AI 라우트가 실제로 DB를 직접 실행하는 케이스가 발생할 때 14g에서 추가.

---

## 6. 폴더/구독 구조 — 14d 마이그레이션

### 6.1 현재 `SqlQuery` 모델 (기존 — prisma/schema.prisma)

```prisma
model SqlQuery {
  id        String     @id @default(uuid())
  name      String
  sql       String
  scope     QueryScope @default(PRIVATE)
  ownerId   String     @map("owner_id")
  owner     User       @relation("UserSqlQueries", fields: [ownerId], references: [id], onDelete: Cascade)
  lastRunAt DateTime?  @map("last_run_at")
  createdAt DateTime   @default(now()) @map("created_at")
  updatedAt DateTime   @default(now()) @updatedAt @map("updated_at")

  @@index([ownerId, scope])
  @@map("sql_queries")
}

enum QueryScope {
  PRIVATE
  SHARED
  FAVORITE
}
```

### 6.2 Phase 14d 확장 모델

```prisma
// Phase 14d 마이그레이션 대상 — SqlQuery 확장 + SqlQueryFolder 신규

model SqlQuery {
  id          String          @id @default(uuid())
  name        String
  sql         String
  scope       QueryScope      @default(PRIVATE)
  ownerId     String          @map("owner_id")
  owner       User            @relation("UserSqlQueries", fields: [ownerId], references: [id], onDelete: Cascade)
  folderId    String?         @map("folder_id")
  folder      SqlQueryFolder? @relation(fields: [folderId], references: [id], onDelete: SetNull)
  isShared    Boolean         @default(false) @map("is_shared")
  isFavorite  Boolean         @default(false) @map("is_favorite")
  tags        String[]        @default([])
  description String?
  resultCache Json?           @map("result_cache")   // 최근 실행 결과 메타 (행 수, 소요 ms)
  lastRunAt   DateTime?       @map("last_run_at")
  runCount    Int             @default(0) @map("run_count")
  createdAt   DateTime        @default(now()) @map("created_at")
  updatedAt   DateTime        @default(now()) @updatedAt @map("updated_at")

  @@index([ownerId, scope])
  @@index([folderId])
  @@map("sql_queries")
}

model SqlQueryFolder {
  id        String           @id @default(uuid())
  name      String
  parentId  String?          @map("parent_id")
  parent    SqlQueryFolder?  @relation("FolderTree", fields: [parentId], references: [id], onDelete: Cascade)
  children  SqlQueryFolder[] @relation("FolderTree")
  ownerId   String           @map("owner_id")
  owner     User             @relation("UserSqlFolders", fields: [ownerId], references: [id])
  queries   SqlQuery[]
  createdAt DateTime         @default(now()) @map("created_at")
  updatedAt DateTime         @default(now()) @updatedAt @map("updated_at")

  @@unique([parentId, name, ownerId])
  @@map("sql_query_folders")
}
```

**마이그레이션 전략**: `folderId`, `isShared`, `isFavorite`, `tags`, `description`, `resultCache`, `runCount` 컬럼은 nullable 또는 기본값으로 추가하므로 기존 데이터 손실 없음. `SqlQueryFolder` 테이블은 신규 생성.

---

## 7. AI 보조 — Phase 14f 보너스 (ADR-014)

### 7.1 AI 어시스턴트 패널 UX

```
┌──────────────────────────────────────┐
│  AI SQL 어시스턴트 (Anthropic Haiku)   │
│  BYOK API 키: [●●●●●●●●] [변경]        │
│  월 사용량: $1.23 / $5.00              │
├──────────────────────────────────────┤
│  시스템: public 스키마 8개 테이블       │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ 사용자: users 테이블에서 최근    │  │
│  │ 7일 가입자를 조회해줘           │  │
│  └────────────────────────────────┘  │
│  ┌────────────────────────────────┐  │
│  │ AI: SELECT id, email, created_at│ │
│  │ FROM users                     │  │
│  │ WHERE created_at >= NOW() - ... │  │
│  │ [에디터에 삽입] [다시 생성]       │  │
│  └────────────────────────────────┘  │
│                                      │
│  [자연어 입력...]      [전송 ⌘+↵]     │
└──────────────────────────────────────┘
```

### 7.2 시스템 프롬프트 구조 (Supabase Studio v2 패턴 차용)

```typescript
// Apache-2.0 패턴 차용 — supabase/supabase AiAssistantPanel/promptUtils.ts

function buildSystemPrompt(schemaContext: string): string {
  return `당신은 PostgreSQL SQL 전문가 어시스턴트입니다. 
현재 데이터베이스 스키마:
${schemaContext}

규칙:
1. SELECT 쿼리만 생성하세요 (INSERT/UPDATE/DELETE/DDL 금지)
2. 쿼리에 LIMIT을 추가하세요 (기본 100)
3. 한국어로 설명하되 SQL은 영문 유지
4. 스키마에 없는 테이블/컬럼은 절대 사용하지 마세요
5. 민감 컬럼(password_hash, key_hash)은 SELECT에서 제외하세요`;
}
```

### 7.3 BYOK 설정 흐름

1. 사용자가 `/settings/ai` 페이지에서 Anthropic API 키 입력
2. 서버가 AES-256-GCM(KEK = MASTER_KEY, ADR-013)으로 암호화 후 SQLite `user_ai_settings.api_key_encrypted` 저장
3. AI 요청 시 서버가 복호화 → `new Anthropic({ apiKey })` 인스턴스 생성
4. 클라이언트에는 키 평문이 전달되지 않음 (NEXT_PUBLIC_ 금지)

---

## 8. Plan Visualizer — Phase 14e 자체 d3/xyflow 트리 (DQ-2.4 확정 답변)

### 8.1 DQ-2.4 확정 답변

**DQ-2.4 확정 답변**: **자체 xyflow 트리 구현** (pev2 Vue wrapper 거부). 근거:

1. pev2는 Vue 3 컴포넌트 — React 프로젝트에서 사용하려면 Vue 런타임 전체를 번들에 포함해야 함. 추가 번들 크기 약 +350KB (NFR-PERF.8 초기 청크 250KB 목표 위협).
2. 프로젝트에 이미 `@xyflow/react` + `elkjs`가 Schema Visualizer(ADR-004)에서 사용 중 — 재사용으로 의존성 추가 없음.
3. EXPLAIN JSON 구조는 단순 재귀 트리 — 자체 변환기 구현이 150~200줄이면 충분.

### 8.2 EXPLAIN JSON → xyflow 노드/엣지 변환

```typescript
// src/lib/sql/plan-to-flow.ts

interface FlowNode {
  id: string;
  type: "planNode";
  position: { x: number; y: number };
  data: {
    nodeType: string;
    totalCost: number;
    actualTotalTime?: number;
    planRows: number;
    actualRows?: number;
    warnings: string[];
  };
}

export function planToFlow(plan: PlanNode, parentId?: string, index = 0): {
  nodes: FlowNode[];
  edges: { id: string; source: string; target: string }[];
} {
  const id = parentId ? `${parentId}-${index}` : "root";
  const warnings = detectWarnings(plan);

  const nodes: FlowNode[] = [{
    id,
    type: "planNode",
    position: { x: 0, y: 0 }, // elkjs가 재계산
    data: {
      nodeType: plan["Node Type"],
      totalCost: plan["Total Cost"],
      actualTotalTime: plan["Actual Total Time"],
      planRows: plan["Plan Rows"],
      actualRows: plan["Actual Rows"],
      warnings,
    },
  }];

  const edges: { id: string; source: string; target: string }[] = [];

  for (let i = 0; i < (plan.Plans?.length ?? 0); i++) {
    const child = planToFlow(plan.Plans![i], id, i);
    nodes.push(...child.nodes);
    edges.push(...child.edges);
    edges.push({ id: `${id}-${child.nodes[0].id}`, source: id, target: child.nodes[0].id });
  }

  return { nodes, edges };
}
```

### 8.3 ExplainVisualizer 완성 UX

- 기본 실행은 `EXPLAIN` (ANALYZE 없음) — 빠른 실행 계획 확인
- "ANALYZE 포함" 토글 활성화 시 `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` 실행 — 실제 실행 + 버퍼 통계
- 노드 클릭 시 우측 사이드 패널에 전체 EXPLAIN JSON 속성 표시
- "쿼리 + Plan 저장" 버튼 → SQLite `sql_query_explain_cache` 테이블에 북마크

---

## 9. 데이터 모델 전체 확장 (Phase 14d 이후)

### 9.1 신규 테이블 목록

| 테이블 | 추가 시점 | 설명 |
|--------|----------|------|
| `sql_query_folders` | Phase 14d | 폴더 계층 구조 (자기참조) |
| `sql_query_history` | Phase 14c (SQLite) | 실행 이력 50건 보관 |
| `sql_query_explain_cache` | Phase 14e (SQLite) | EXPLAIN 결과 북마크 |
| `user_ai_settings` | Phase 14f | BYOK API 키 암호화 저장 |
| `ai_usage_log` | Phase 14f | 월별 AI 비용 추적 |

### 9.2 `sql_query_history` (SQLite — Drizzle)

```typescript
// src/db/sqlite/schema.ts (Drizzle 스키마)

export const sqlQueryHistory = sqliteTable("sql_query_history", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  sql: text("sql").notNull(),
  durationMs: integer("duration_ms"),
  rowCount: integer("row_count"),
  error: text("error"),
  executedAt: integer("executed_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});
```

SQLite는 경량 임시 저장소로 사용. 행 수 50건 초과 시 오래된 순으로 자동 삭제.

---

## 10. UI 레이아웃 — `/dashboard/sql` (에디터 + 사이드바 + 결과 패널)

### 10.1 3-panel 레이아웃

```
┌──────────────────────────────────────────────────────────┐
│  SQL Editor                                    [14f AI▼]  │
├──────────────────────────────────────────────────────────┤
│ ┌────────────────┐ ┌────────────────────────────────────┐│
│ │  사이드바       │ │  탭 바: [Query 1 ●] [Query 2] [+] ││
│ │                │ ├────────────────────────────────────┤│
│ │  ▼ 내 쿼리      │ │  Monaco Editor (h: 60%)            ││
│ │    ▶ 폴더1     │ │                                    ││
│ │    📄 Query1   │ │  SELECT id, email, role            ││
│ │    📄 Query2   │ │  FROM users                        ││
│ │                │ │  LIMIT 20;                         ││
│ │  ─────────    │ ├────────────────────────────────────┤│
│ │  ▼ 실행 히스토리 │ │  [실행 ⌘↵] [포맷] [EXPLAIN]        ││
│ │    Query1 2ms  │ ├────────────────────────────────────┤│
│ │    Query2 15ms │ │  결과 패널 (h: 40%)                 ││
│ │                │ │  20행 · 8ms                        ││
│ │                │ │  id | email | role                 ││
│ │                │ │  ...                               ││
│ │                │ │  [CSV 다운로드]                     ││
│ └────────────────┘ └────────────────────────────────────┘│
└──────────────────────────────────────────────────────────┘
```

### 10.2 다크 테마 토큰

Monaco 테마는 `vs-dark` 기본 유지. 결과 패널과 사이드바는 Supabase 대시보드 스타일(`bg-zinc-950`, `border-zinc-800`, `text-zinc-100`) 적용.

### 10.3 공유 URL 설계 (Phase 14d)

쿼리 저장 후 `isShared = true`로 변경하면 `/sql-editor/queries/[id]` URL이 생성된다. 이 URL을 공유받은 사람이 대시보드 접근 권한이 있으면 해당 쿼리를 읽기 전용으로 볼 수 있다. 수정 권한은 원본 소유자(`ownerId`)에게만 있다.

---

## 11. 4단계 상세 일정 (Phase 14c~14f, 40일)

### 11.1 Phase 14c — 기본 실행 (10일, 80h)

**목표**: 현재 70점 → 80점. 기존 `sql-editor/page.tsx`의 단일 파일 구조를 컴포넌트 분리 + 보안 강화로 리팩토링.

| Task | 내용 | 시간 |
|------|------|------|
| T1 | `QueryExecutor` 분리 (`app_readonly` 풀, `BEGIN READ ONLY`, `statement_timeout 30s`) | 8h |
| T2 | `DangerQueryModal` 구현 (DROP/TRUNCATE/DELETE without WHERE 패턴 감지) | 6h |
| T3 | Row Limit 1000 가드 + 잘림 뱃지 (이미 부분 구현 — 완성) | 4h |
| T4 | `MonacoWrapper` 컴포넌트 분리 + 단축키 매핑 (§4.3 전체) | 10h |
| T5 | `QueryResultPanel` TanStack Table 재사용 (FR-2.1 세부 5) | 10h |
| T6 | `use-sql-editor-store.ts` Zustand 기본 상태 (단탭 → 멀티탭 준비) | 6h |
| T7 | `sql_query_history` SQLite 이력 저장 (최근 50건) | 8h |
| T8 | CSV 스트리밍 export (`/api/v1/sql/export/route.ts`) | 8h |
| T9 | Unit Test (QueryExecutor, DangerQueryModal 패턴 감지, Row Limit) | 8h |
| T10 | E2E + 배포 | 12h |
| **합계** | | **80h** |

**완료 기준 (DOD)**:
- `app_readonly` 연결로 `CREATE TABLE` 시도 → 403 오류 반환
- `DROP TABLE users` 입력 후 실행 → 확인 모달 표시
- 10만 행 테이블 조회 → 결과 1000행 + 잘림 뱃지

### 11.2 Phase 14d — 폴더 구조 + sql-formatter (10일, 80h)

**목표**: 80점 → 90점. `SqlQueryFolder` 마이그레이션 + 사이드바 폴더 트리 + sql-formatter 서버 라우트.

| Task | 내용 | 시간 |
|------|------|------|
| T1 | Prisma 마이그레이션: `sql_query_folders` 신규 + `sql_queries` 컬럼 확장 (§6.2) | 10h |
| T2 | `/api/v1/sql/folders` CRUD 라우트 | 8h |
| T3 | `SqlQueryFolder` 서버 쿼리 + `buildFolderTree()` 유틸 | 8h |
| T4 | `QueryFolderTree` 컴포넌트 (재귀 렌더링, 폴더 생성/이름변경/삭제) | 16h |
| T5 | `sql-formatter` 서버 라우트 `/api/v1/sql/format` (DQ-2.5 완성) | 6h |
| T6 | Monaco `Format SQL (Shift+Alt+F)` 액션 + API 연동 | 4h |
| T7 | 멀티탭 `QueryTabBar` (unsaved dot, 닫기 전 저장 프롬프트) | 12h |
| T8 | 공유 URL (`isShared` 토글 + `/sql-editor/queries/[id]` 라우트) | 8h |
| T9 | Unit Test + E2E + 배포 | 8h |
| **합계** | | **80h** |

### 11.3 Phase 14e — Plan Visualizer (10일, 80h)

**목표**: 90점 → 97점. EXPLAIN JSON → xyflow 트리 렌더링.

| Task | 내용 | 시간 |
|------|------|------|
| T1 | `/api/v1/sql/explain` 라우트 (EXPLAIN + EXPLAIN ANALYZE 모드 분기) | 8h |
| T2 | `planToFlow()` 변환기 (§8.2 구현) | 12h |
| T3 | `detectWarnings()` 룰셋 (Seq Scan/Hash Join/Nested Loop, §3.5) | 8h |
| T4 | `ExplainVisualizerPanel` xyflow 렌더링 + elkjs 레이아웃 | 20h |
| T5 | 노드 크기 비례 렌더링 (`actual_total_time`) + 경고 아이콘 | 8h |
| T6 | 노드 클릭 → 사이드 패널 전체 속성 표시 | 8h |
| T7 | `sql_query_explain_cache` SQLite 북마크 | 6h |
| T8 | EXPLAIN ANALYZE `statement_timeout 60s` 설정 분기 | 4h |
| T9 | Unit Test (변환기) + E2E + 배포 | 6h |
| **합계** | | **80h** |

**완료 기준 (DOD)**:
- 10만 행 Seq Scan 쿼리 → 경고 아이콘 + 한국어 설명 표시
- EXPLAIN ANALYZE 50개 노드 트리 → p95 렌더링 < 1.5s (NFR-PERF.2 기준)

### 11.4 Phase 14f — AI 보조 (10일, 80h, 보너스)

**목표**: 97점 → 100점.

| Task | 내용 | 시간 |
|------|------|------|
| T1 | `user_ai_settings` SQLite 스키마 + BYOK API 키 AES-256-GCM 암호화 저장 | 10h |
| T2 | `ai_usage_log` SQLite 스키마 + 월 비용 집계 쿼리 | 8h |
| T3 | `/api/v1/sql/ai-assist` 라우트 (Anthropic AI SDK v6 SSE 스트리밍) | 16h |
| T4 | `buildSchemaContext()` 스키마 컨텍스트 빌더 (8000 토큰 예산) | 8h |
| T5 | `AiAssistantPanel` 컴포넌트 (채팅 UI + "에디터에 삽입" 버튼) | 16h |
| T6 | 비용 가드 ($5/월 기본 한도, 초과 시 429 차단) | 8h |
| T7 | DRY-RUN Savepoint (FR-2.4 구현 — BEGIN; <쿼리>; ROLLBACK; 패턴) | 8h |
| T8 | Unit Test + E2E + 배포 | 6h |
| **합계** | | **80h** |

---

## 12. Wave 4 할당 DQ 최종 답변

### DQ-2.4 — EXPLAIN Visualizer 구현 방식

| 항목 | 내용 |
|------|------|
| **질문** | EXPLAIN Visualizer를 pev2 Vue wrapper로 쓸지, 자체 d3/xyflow 트리로 구현할지? |
| **확정 답변** | **자체 xyflow 트리 구현 (Phase 14e, pev2 Vue wrapper 거부)** |
| **정량 근거** | (1) pev2 Vue 런타임 번들 +350KB → NFR-PERF.8 초기 청크 250KB 목표 위협. (2) `@xyflow/react` + `elkjs`가 이미 Schema Visualizer(ADR-004)에서 사용 중 — 신규 의존성 0 추가. (3) EXPLAIN JSON 재귀 변환기 자체 구현 약 150~200줄 — 오버헤드 수용 가능. |
| **구현 위치** | Phase 14e, `src/components/sql-editor/explain-visualizer.tsx` |
| **ADR 후보** | ADR-003 부록(Visualizer 구현 방식)으로 확정. 별도 ADR 불필요. |

### DQ-2.5 — sql-formatter 위치

| 항목 | 내용 |
|------|------|
| **질문** | sql-formatter(MIT)를 클라이언트(Monaco action)에서 쓸지, 서버 라우트(/api/sql/format)에서 쓸지? |
| **확정 답변** | **서버 라우트 `/api/v1/sql/format` (Phase 14d 구현)** |
| **정량 근거** | (1) sql-formatter 번들 크기 ~130KB gzip — 클라이언트 포함 시 초기 청크 250KB 목표(NFR-PERF.8) 위협. (2) 서버 포맷 시 모든 클라이언트 동일 규칙 보장 — 운영자 설정(indentStyle/keywordCase) 서버 설정화 가능. (3) API 레이턴시 추가 < 50ms (로컬 WSL2 기준) — 포매팅 빈도가 실행 빈도보다 낮아 사용자 인지 불가. |
| **구현 위치** | Phase 14d, `src/app/api/v1/sql/format/route.ts` |
| **ADR 후보** | ADR-003 부록(포맷터 위치)으로 확정. |

### DQ-2.6 — AI 라우트 추가 격리

| 항목 | 내용 |
|------|------|
| **질문** | AI 라우트에 `app_readonly` 롤 + `BEGIN READ ONLY` + statement_timeout 이중 가드 외에 컨테이너/샌드박스 격리가 필요한가? |
| **확정 답변** | **Phase 14e까지는 DB 레벨 삼중 가드만 유지, 컨테이너/샌드박스는 14g 이후** |
| **정량 근거** | (1) Phase 18 AI 라우트는 SQL 생성 제안만 담당 — 직접 DB 실행 없음(사용자 수동 실행 후 검토). (2) 스키마 컨텍스트에 민감 데이터 값 포함 안 함(구조만). (3) isolated-vm(ADR-009 Edge Functions)과 아키텍처 공유 가능하나 Phase 19 이후 완성 예정 — 14g에서 통합. (4) Anthropic Haiku BYOK = 사용자 본인 API 키 → 데이터 유출 주체가 본인 자신. |
| **구현 위치** | Phase 14f, `/api/v1/sql/ai-assist/route.ts` 내 삼중 가드 확인 단계 추가 (격리 추가는 14g) |
| **ADR 후보** | ADR-003 재검토 트리거 2번 (AI 라우트 직접 DB 실행 케이스 발생 시) |

---

## 13. Phase 18 WBS — SQL Editor 파트 (~320h, 40일)

### 13.1 WBS 요약표

| WBS ID | 작업 | 담당 | 기간 | 공수 | 선행 |
|--------|------|------|------|------|------|
| SQL-01 | QueryExecutor 분리 + 보안 3중 가드 | 구현 | 2일 | 16h | — |
| SQL-02 | DangerQueryModal | 구현 | 1일 | 8h | SQL-01 |
| SQL-03 | MonacoWrapper 분리 + 단축키 매핑 | 구현 | 1.5일 | 12h | SQL-01 |
| SQL-04 | QueryResultPanel (TanStack Table 재사용) | 구현 | 1.5일 | 12h | SQL-01 |
| SQL-05 | Zustand 탭 상태 기본 | 구현 | 1일 | 8h | SQL-03, SQL-04 |
| SQL-06 | 실행 이력 SQLite (50건) | 구현 | 1일 | 8h | SQL-01 |
| SQL-07 | CSV export 스트리밍 | 구현 | 1일 | 8h | SQL-04 |
| SQL-08 | Phase 14c 테스트 + 배포 | QA | 1.5일 | 12h | SQL-02~07 |
| **14c 소계** | | | **10일** | **80h** | |
| SQL-09 | Prisma 마이그레이션 (SqlQueryFolder) | DB | 1.5일 | 12h | SQL-08 |
| SQL-10 | SqlQueryFolder CRUD API | 구현 | 1일 | 8h | SQL-09 |
| SQL-11 | buildFolderTree() 유틸 | 구현 | 0.5일 | 4h | SQL-09 |
| SQL-12 | QueryFolderTree 컴포넌트 | UI | 2일 | 16h | SQL-10, SQL-11 |
| SQL-13 | sql-formatter 서버 라우트 | 구현 | 0.5일 | 4h | SQL-08 |
| SQL-14 | Monaco Format 액션 연동 | 구현 | 0.5일 | 4h | SQL-13 |
| SQL-15 | 멀티탭 QueryTabBar | UI | 1.5일 | 12h | SQL-05 |
| SQL-16 | 공유 URL + isShared 토글 | 구현 | 1일 | 8h | SQL-09 |
| SQL-17 | Phase 14d 테스트 + 배포 | QA | 1.5일 | 12h | SQL-12~16 |
| **14d 소계** | | | **10일** | **80h** | |
| SQL-18 | /explain 라우트 | 구현 | 1일 | 8h | SQL-17 |
| SQL-19 | planToFlow() 변환기 | 구현 | 1.5일 | 12h | SQL-18 |
| SQL-20 | detectWarnings() 룰셋 | 구현 | 1일 | 8h | SQL-19 |
| SQL-21 | ExplainVisualizerPanel xyflow | UI | 2.5일 | 20h | SQL-19, SQL-20 |
| SQL-22 | 노드 크기/경고 아이콘 + 사이드 패널 | UI | 1.5일 | 12h | SQL-21 |
| SQL-23 | EXPLAIN 북마크 SQLite | 구현 | 0.5일 | 4h | SQL-21 |
| SQL-24 | Phase 14e 테스트 + 배포 | QA | 1.5일 | 12h | SQL-22, SQL-23 |
| SQL-25 | EXPLAIN ANALYZE 타임아웃 60s 분기 | 구현 | 0.5일 | 4h | SQL-18 |
| **14e 소계** | | | **10일** | **80h** | |
| SQL-26 | user_ai_settings SQLite + BYOK 암호화 | 구현 | 1.5일 | 12h | SQL-24 |
| SQL-27 | ai_usage_log SQLite + 월 비용 집계 | 구현 | 1일 | 8h | SQL-26 |
| SQL-28 | /ai-assist 라우트 (Anthropic AI SDK v6 SSE) | 구현 | 2일 | 16h | SQL-26, SQL-27 |
| SQL-29 | buildSchemaContext() | 구현 | 1일 | 8h | SQL-28 |
| SQL-30 | AiAssistantPanel 컴포넌트 | UI | 2일 | 16h | SQL-28 |
| SQL-31 | 비용 가드 (429 차단 + Sonner 토스트) | 구현 | 1일 | 8h | SQL-27 |
| SQL-32 | DRY-RUN Savepoint (FR-2.4) | 구현 | 1일 | 8h | SQL-01 |
| SQL-33 | Phase 14f 테스트 + 배포 | QA | 0.75일 | 4h | SQL-30~32 |
| **14f 소계** | | | **10일** | **80h** | |
| **전체 합계** | | | **40일** | **320h** | |

### 13.2 병렬화 가능 구간

- SQL-03(MonacoWrapper) + SQL-04(ResultPanel): 독립 — 병렬 가능
- SQL-13(sql-formatter) + SQL-16(공유 URL): SQL-08 이후 독립 — 병렬 가능
- SQL-18(explain 라우트) + SQL-19(planToFlow) 순차 단, SQL-23(SQLite)은 SQL-21 완료 후 독립

---

## 부록 A. 현재 구현 현황 (Phase 14c 기준)

### A.1 기존 구현 (`src/app/(protected)/sql-editor/page.tsx`)

세션 24 기준 구현된 기능:
- Monaco Editor (`@monaco-editor/react` dynamic import)
- `Ctrl/Cmd + Enter` 실행 단축키
- `/api/v1/sql/execute` POST 연동
- `/api/v1/sql/queries` GET/POST/DELETE 저장 쿼리 CRUD
- 결과 1000행 잘림 + 뱃지
- `SavedQuery` 사이드바 (단순 목록)
- `app_readonly` 롤 연결 (`getReadonlyPool()` — Phase 14c 이전 구현)

### A.2 미구현 기능 (Blueprint에서 설계 완료)

| 기능 | Phase | 섹션 |
|------|-------|------|
| DangerQueryModal | 14c | §3 |
| QueryExecutor 분리 + BEGIN READ ONLY | 14c | §3.3 |
| sql-formatter 서버 라우트 | 14d | §3.6 |
| SqlQueryFolder + 트리 | 14d | §6 |
| 멀티탭 | 14d | §10 |
| 공유 URL | 14d | §10.3 |
| EXPLAIN Visualizer | 14e | §8 |
| AI 어시스턴트 BYOK | 14f | §7 |

---

## 부록 B. NFR 매핑

| NFR | 목표 | SQL Editor 구현 포인트 |
|-----|------|----------------------|
| NFR-PERF.2 | EXPLAIN p95 ≤ 500ms | statement_timeout 30s + 결과 캐시 |
| NFR-PERF.2 (ANALYZE) | EXPLAIN ANALYZE p95 ≤ 2s | statement_timeout 60s 분기 |
| NFR-PERF.8 | 초기 청크 ≤ 250KB | sql-formatter 서버 라우트 + Monaco lazy import |
| NFR-SEC.1 | JWT ES256 | Auth 미변경 — 기존 jose 유지 |
| NFR-COST.2 | AI 월 ≤ $5 | ai_usage_log 집계 + 429 가드 |

---

## 부록 C. 변경 이력

| 버전 | 날짜 | 작성자 | 요약 |
|------|------|-------|------|
| 1.0 | 2026-04-18 | Agent W4-B4 (Sonnet 4.6) | Wave 4 Tier 2 초안 — SQL Editor Blueprint Phase 14c~14f |

---

> **Blueprint 끝.** Wave 4 · B4 · 2026-04-18 · 양평 부엌 서버 대시보드 — SQL Editor 70→100점 · 40일 320h · 3 DQ 확정.
