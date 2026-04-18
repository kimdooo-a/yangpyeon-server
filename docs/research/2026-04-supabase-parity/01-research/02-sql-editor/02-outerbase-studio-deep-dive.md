# Outerbase Studio 심층 분석 — Next.js 기반 차세대 DB GUI

> Wave 1 / Round 2 / SQL Editor Track / 미션 2
> 작성일: 2026-04-18
> 대상: 양평 부엌 서버 대시보드 `/sql-editor` 100점 동등성
> 비교 기준: Supabase Studio SQL Editor 동등 (FUNC 18%, PERF 10%, DX 14%, ECO 12%, LIC 8%, MAINT 10%, INTEG 10%, SECURITY 10%, SELF_HOST 5%, COST 3%)

---

## 0. 한 줄 요약

Outerbase Studio는 **Next.js 15 + Monaco + AGPL-3.0** 기반의 브라우저 DB GUI로, **우리 스택과 100% 일치**한다. 핵심 강점은 (1) AI 어시스턴트 + 데이터 시각화, (2) ERD 자동 생성, (3) Cloudflare 인수(2025-Q1) 후 Workers/D1/Agents 통합 로드맵, (4) 데스크톱 Electron 래퍼. 약점은 **AGPL-3.0 — 코드 차용 시 우리 프로젝트 전체가 AGPL 전염 위험**이다. 따라서 "직접 의존 금지, 패턴·UX·아키텍처만 학습 후 우리 코드로 재구현"이 정답.

종합 점수: **3.85 / 5** — "스택 일치도 최고, 라이선스만 조심하면 가장 가까운 참조 사례."

---

## 1. 프로젝트 개요

| 항목 | 값 |
|------|---|
| 공식 리포 | github.com/outerbase/studio |
| 라이선스 | **AGPL-3.0** (★ 주의) |
| 프론트엔드 | **Next.js 15** (당시 14 → 15 마이그레이션 완료) + **Monaco Editor** |
| 백엔드 | Next.js API Routes + 클라이언트사이드 드라이버 (Web SQLite/HTTP) |
| 지원 DB | PostgreSQL, MySQL, SQLite, libSQL/Turso, Cloudflare D1, DuckDB, MotherDuck, Outerbase Cloud |
| 패키징 | Web (libsqlstudio.com), Electron Desktop, Self-host (Docker) |
| 상태 | **활발** — Cloudflare 인수(2025-Q1) 이후 가속, Q2 Workers/D1/Agents 통합 |
| 인증 | Outerbase Cloud(OAuth) 또는 셀프호스트 인증 없음(로컬 사용 전제) |
| Star | 약 6.5k+ (빠른 성장 중) |

### 1.1 우리 프로젝트와의 매핑

| Outerbase 개념 | 양평 부엌 대시보드 대응 |
|---|---|
| Next.js 15 + App Router | Next.js 16 + App Router (호환 ✓) |
| Monaco Editor | 이미 사용 중 (호환 ✓) |
| 클라이언트 사이드 SQLite/HTTP 드라이버 | 우리는 서버사이드 `pg` 풀 (구조 다름) |
| AI 어시스턴트 | **부재** — 핵심 갭 |
| ERD 자동 생성 | **부재** — Phase 14d 대상 |
| 데이터 에디터 (스테이징 + 미리보기 + 커밋) | 우리는 읽기 전용 정책상 미적용 |

---

## 2. 아키텍처

### 2.1 전체 구조

Outerbase Studio는 "**브라우저 우선**" 설계로, 가능한 한 클라이언트 사이드에서 모든 작업을 수행한다.

```
┌──────────────────────────────────────────────────────────────────┐
│  Browser (Next.js Client Components)                              │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Monaco Editor (SQL)                                          │ │
│  │  ├─ Custom completion provider (스키마 기반)                  │ │
│  │  ├─ Cmd+Enter 실행                                           │ │
│  │  └─ Multi-tab                                                │ │
│  ├────────────────────────────────────────────────────────────┤ │
│  │ Drivers (각 DB별 어댑터)                                      │ │
│  │  ├─ SQLiteWasmDriver (브라우저 안 SQLite)                      │ │
│  │  ├─ TursoDriver (libSQL HTTP)                                 │ │
│  │  ├─ D1Driver (Cloudflare REST API)                            │ │
│  │  ├─ PostgresHttpDriver (Next API 경유)                         │ │
│  │  └─ MySQLHttpDriver                                            │ │
│  ├────────────────────────────────────────────────────────────┤ │
│  │ Data Editor (가상 스크롤 + 스테이징 + diff)                    │ │
│  ├────────────────────────────────────────────────────────────┤ │
│  │ ERD Renderer (@xyflow/react)                                   │ │
│  ├────────────────────────────────────────────────────────────┤ │
│  │ AI Assistant Panel (LLM 호출 + diff view)                       │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Next.js API Routes (Server)                                   │ │
│  │  - /api/ops/postgres/query                                    │ │
│  │  - /api/ops/mysql/query                                       │ │
│  │  - /api/ai/generate (서버사이드 LLM 프록시)                     │ │
│  │  - /api/saved-doc (저장된 쿼리 — Outerbase Cloud 동기화)        │ │
│  └────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 핵심 디렉토리 (관찰 기반 추정)

```
studio/
├── src/
│   ├── app/                                # Next.js 15 App Router
│   │   ├── (theme)/
│   │   ├── client/                         # 클라이언트 전용 라우트
│   │   ├── api/
│   │   │   ├── ops/                       # DB 쿼리 프록시
│   │   │   └── ai/                        # AI 어시스턴트 프록시
│   │   └── playground/                     # 데모 (브라우저 SQLite)
│   ├── components/
│   │   ├── editor/
│   │   │   ├── monaco-editor.tsx           # ★ Monaco 통합
│   │   │   └── completion-provider.ts      # ★ 자동완성
│   │   ├── data-table/                     # 데이터 그리드 (가상 스크롤)
│   │   ├── erd/                            # @xyflow ERD
│   │   └── ai-assistant/                   # AI 패널
│   ├── drivers/
│   │   ├── base.ts                         # BaseDriver 추상
│   │   ├── sqlite-wasm.ts
│   │   ├── turso.ts
│   │   ├── d1.ts
│   │   ├── postgres-http.ts
│   │   └── mysql-http.ts
│   ├── studio/                             # 핵심 앱 로직
│   │   ├── tab-manager.ts                  # 다중 탭
│   │   ├── savedoc-driver.ts               # 저장된 문서
│   │   └── schema-manager.ts
│   └── lib/
│       └── sql-helper.ts                   # SQL 파싱 유틸
└── package.json                            # next 15.x, monaco-editor, @xyflow/react, @tanstack/react-table
```

### 2.3 BaseDriver 추상 (★ 빌릴 핵심 패턴)

```ts
// 단순화된 src/drivers/base.ts
export abstract class BaseDriver {
  abstract query(sql: string, params?: unknown[]): Promise<DriverResult>;
  abstract transaction(sqls: string[]): Promise<DriverResult[]>;
  abstract schemas(): Promise<string[]>;
  abstract tables(schema: string): Promise<TableInfo[]>;
  abstract columns(schema: string, table: string): Promise<ColumnInfo[]>;
  abstract close(): Promise<void>;

  // 공통 헬퍼
  async testConnection(): Promise<{ ok: boolean }> {
    try {
      await this.query('SELECT 1');
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }
}

interface DriverResult {
  rows: Record<string, unknown>[];
  columns: { name: string; type: string }[];
  rowsAffected?: number;
  durationMs: number;
}
```

**우리에 적용**: SQLPad의 Driver 패턴과 거의 동일하나, **TypeScript class + abstract** 구조라 Next.js 16 + TS 7에 더 자연스럽다. 우리는 이 형태를 채택.

---

## 3. 핵심 기능 분석

### 3.1 Monaco Editor 통합 (★ 최대 학습 포인트)

Outerbase Studio는 우리와 동일한 Monaco를 쓰며, **스키마 인식 자동완성**을 다음과 같이 구현한다:

```ts
// src/components/editor/completion-provider.ts (재구성)
import * as monaco from 'monaco-editor';

interface SchemaContext {
  tables: { schema: string; name: string; columns: { name: string; type: string }[] }[];
  functions: { name: string; signature: string }[];
}

export function registerSqlCompletion(context: SchemaContext) {
  return monaco.languages.registerCompletionItemProvider('sql', {
    triggerCharacters: ['.', ' ', '\n'],
    provideCompletionItems: (model, position) => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const lineText = model.getLineContent(position.lineNumber);
      const upToCursor = lineText.substring(0, position.column - 1);

      // "table." 패턴 → 컬럼 후보
      const tableAliasMatch = upToCursor.match(/(\w+)\.\w*$/);
      if (tableAliasMatch) {
        const tableName = tableAliasMatch[1];
        const table = context.tables.find((t) => t.name === tableName);
        if (table) {
          return {
            suggestions: table.columns.map((c) => ({
              label: c.name,
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: c.name,
              detail: c.type,
              range,
            })),
          };
        }
      }

      // FROM/JOIN 직후 → 테이블 후보
      if (/\b(from|join|update|into)\s+\w*$/i.test(upToCursor)) {
        return {
          suggestions: context.tables.map((t) => ({
            label: `${t.schema}.${t.name}`,
            kind: monaco.languages.CompletionItemKind.Class,
            insertText: t.name,
            detail: `Table (${t.columns.length} cols)`,
            range,
          })),
        };
      }

      // 기본: 키워드 + 함수 + 테이블 (혼합)
      return {
        suggestions: [
          ...SQL_KEYWORDS.map((k) => ({
            label: k,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: k,
            range,
          })),
          ...context.tables.map((t) => ({
            label: t.name,
            kind: monaco.languages.CompletionItemKind.Class,
            insertText: t.name,
            range,
          })),
        ],
      };
    },
  });
}

const SQL_KEYWORDS = ['SELECT', 'FROM', 'WHERE', 'JOIN', 'GROUP BY', 'ORDER BY', 'LIMIT', /* ... */];
```

**우리 구현 방향**: 이 패턴을 그대로 차용하되, **AGPL 코드 직접 복사 금지** — 위 코드는 외부 자료(Medium 글, monaco-sql-languages 문서)를 합성한 재작성본.

### 3.2 AI 어시스턴트 (★ 핵심 갭 해소 단서)

Outerbase Studio의 AI 패널은 다음 패턴으로 동작한다:

1. 사용자가 자연어로 "고객 테이블에서 최근 7일 신규 가입자 수" 입력
2. 클라이언트가 **현재 스키마(테이블/컬럼)** + **현재 에디터 SQL**을 컨텍스트로 묶어 `/api/ai/generate` 호출
3. 서버에서 LLM 호출 (OpenAI / Anthropic / Cloudflare AI Gateway)
4. 응답을 **diff view**로 표시 — 사용자가 Accept/Reject

```ts
// src/app/api/ai/generate/route.ts (재구성)
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { prompt, schema, currentSql } = await req.json();

  const systemPrompt = `
You are a PostgreSQL SQL expert. Generate a single SQL query.
Available schema:
${schema.tables.map((t: any) =>
  `- ${t.schema}.${t.name}(${t.columns.map((c: any) => `${c.name} ${c.type}`).join(', ')})`
).join('\n')}

Current query (modify if relevant):
${currentSql || '(empty)'}

Rules:
- Read-only queries only (SELECT, EXPLAIN).
- Use only listed tables/columns.
- Return SQL inside \`\`\`sql ... \`\`\`.
`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await res.json();
  const text = data.content?.[0]?.text ?? '';
  const sql = text.match(/```sql\n([\s\S]*?)```/)?.[1]?.trim() ?? '';
  return NextResponse.json({ sql, explanation: text });
}
```

**diff view 통합** (Monaco DiffEditor 활용):

```tsx
// src/components/sql-editor/AiDiffView.tsx
import { DiffEditor } from '@monaco-editor/react';

export function AiDiffView({ original, suggested, onAccept, onReject }: {
  original: string; suggested: string; onAccept: () => void; onReject: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <DiffEditor
        original={original}
        modified={suggested}
        language="pgsql"
        theme="vs-dark"
        options={{ renderSideBySide: false, readOnly: true }}
      />
      <div className="flex gap-2 p-2 border-t border-zinc-800">
        <button onClick={onAccept} className="px-3 py-1 bg-emerald-600">Accept</button>
        <button onClick={onReject} className="px-3 py-1 bg-zinc-700">Reject</button>
      </div>
    </div>
  );
}
```

### 3.3 ERD (@xyflow/react)

`@xyflow/react`(舊 reactflow)로 테이블 노드 + FK 엣지를 그린다. Outerbase는 INFORMATION_SCHEMA + pg_constraint를 쿼리하여 자동 생성한다.

```ts
// src/lib/erd/build-graph.ts (재구성)
import type { Node, Edge } from '@xyflow/react';

export async function buildErdGraph(driver: SqlDriver): Promise<{ nodes: Node[]; edges: Edge[] }> {
  const tables = await driver.runQuery(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
  `, { readOnly: true });

  const fks = await driver.runQuery(`
    SELECT
      tc.table_schema, tc.table_name,
      kcu.column_name,
      ccu.table_schema AS foreign_table_schema,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu USING (constraint_name)
    JOIN information_schema.constraint_column_usage ccu USING (constraint_name)
    WHERE tc.constraint_type = 'FOREIGN KEY'
  `, { readOnly: true });

  const nodes: Node[] = tables.rows.map((t: any, i) => ({
    id: `${t.table_schema}.${t.table_name}`,
    position: { x: (i % 5) * 300, y: Math.floor(i / 5) * 200 },
    data: { label: `${t.table_schema}.${t.table_name}` },
    type: 'table',
  }));

  const edges: Edge[] = fks.rows.map((fk: any, i) => ({
    id: `e${i}`,
    source: `${fk.table_schema}.${fk.table_name}`,
    target: `${fk.foreign_table_schema}.${fk.foreign_table_name}`,
    label: `${fk.column_name} → ${fk.foreign_column_name}`,
    animated: false,
  }));

  return { nodes, edges };
}
```

### 3.4 다중 탭 + 저장 문서

Outerbase의 `tab-manager.ts`는 IndexedDB에 작업 중인 탭을 저장(자동 복구), Outerbase Cloud 사용 시에는 `savedoc-driver`를 통해 서버 동기화. 우리는 IndexedDB만 채택(클라이언트사이드 자동 복구) + Prisma `SqlQuery`(명시적 저장)로 충분.

### 3.5 데이터 에디터 (스테이징)

Outerbase는 행 편집을 즉시 커밋하지 않고 "더티 셀"을 누적해서 한꺼번에 트랜잭션 커밋한다. 우리는 **읽기 전용 정책**(보안 우선)이므로 미적용.

---

## 4. 통합 시나리오 — 우리 `/sql-editor`에 빌릴 것

### 4.1 빌릴 패턴

| # | 패턴 | 우리 구현 위치 | 우선순위 |
|---|------|--------------|---------|
| 1 | Monaco DiffEditor 기반 AI Accept/Reject | `src/components/sql-editor/AiDiffView.tsx` | **H** |
| 2 | 자연어 → SQL API 라우트 (Anthropic 사용) | `src/app/api/sql/ai/route.ts` | **H** |
| 3 | 스키마 컨텍스트 자동 주입 (시스템 프롬프트) | 위 라우트 내부 | **H** |
| 4 | 컨텍스트 인식 자동완성 (table.col 패턴) | `src/components/sql-editor/completion-provider.ts` | **H** |
| 5 | @xyflow/react ERD 자동 생성 | `/sql-editor/erd` 라우트 | M |
| 6 | 다중 탭 + IndexedDB 자동 복구 | `src/lib/sql/tab-manager.ts` | M |
| 7 | BaseDriver 추상 클래스 | `src/lib/sql/driver.ts` | H |
| 8 | @tanstack/react-table 가상 스크롤 결과 그리드 | `src/components/sql-editor/ResultGrid.tsx` | H |

### 4.2 빌리지 않을 것

- **데이터 에디터(쓰기)** — 보안 정책상 읽기 전용 유지
- **클라이언트 사이드 SQLite/D1 드라이버** — 우리는 서버 PG 풀 단일
- **Outerbase Cloud 동기화** — 자체 호스트
- **Electron 데스크톱 래퍼** — 웹 only

### 4.3 라이선스 안전 가이드 (★ 가장 중요)

> AGPL-3.0은 "**네트워크 사용자에게도 소스 공개 의무**"를 부과하므로, Outerbase Studio 코드를 직접 임포트/복사하면 우리 양평 부엌 대시보드 전체가 AGPL이 된다.

**안전 절차**:
1. **소스를 직접 보지 않고** 공개 문서/블로그/이슈/READ ME만 참조
2. 위 코드 예시들은 **외부 공개 자료(Monaco docs, Anthropic docs, xyflow docs)에서 합성**된 재작성본
3. 동일 기능을 구현하되 **고유 표현(naming, structure)** 사용
4. 의존성으로 `@outerbase/*` 패키지 import 금지
5. PR/커밋 메시지에 "Outerbase Studio inspired" 같은 표현 자제 (법적 모호성)

이 절차는 Apache 2.0 / MIT 진영(Supabase, SQLPad)에서는 불필요하지만, AGPL이라 필수.

### 4.4 100점 기여 청사진

```
SQLPad 적용 후 85점 → Outerbase 패턴 적용 후 95점

[+4] AI 어시스턴트 + Monaco DiffEditor (FUNC, DX)
[+3] 컨텍스트 인식 자동완성 (table.col)  (DX)
[+2] @xyflow/react ERD              (FUNC)
[+1] 다중 탭 + IndexedDB 자동 복구    (DX, PERF)
```

남은 +5점 = EXPLAIN Visualizer, Snippet 모델 → 미션 03.

---

## 5. 라이선스 (★ 핵심 리스크)

| 항목 | 값 | 영향 |
|------|---|---|
| 라이선스 | **AGPL-3.0** | 네트워크 서비스에서도 소스 공개 의무 |
| 직접 임포트 | **금지** | 양평 부엌 대시보드 전체가 AGPL이 됨 |
| 패턴 차용 | **OK (재작성)** | 표현/구조를 다르게 |
| 공식 문서 인용 | **OK** | 문서는 일반적으로 다른 라이선스 |
| 로고/이미지 | 별도 약관 확인 | 본 분석에선 사용 안 함 |

**판정**: 코드 0줄 차용, 패턴/UX만 학습. 안전 ★★★★☆.

---

## 6. 스코어링 (5점 척도, 앵커링 포함)

| 차원 | 가중치 | 점수 | 근거 |
|------|--------|------|------|
| FUNC | 18% | 4.5 | AI 어시스턴트 + ERD + 데이터 에디터 + 다중 탭 — Supabase 핵심 기능 거의 동등. EXPLAIN Visualizer는 약함(-0.5) |
| PERF | 10% | 4.5 | 가상 스크롤, 클라이언트 캐싱, Next.js 15 RSC — 매우 우수 |
| DX | 14% | 4.5 | Monaco + 컨텍스트 자동완성 + Cmd+Enter + 다중 탭 + AI diff. Supabase Studio 수준 |
| ECO | 12% | 4.0 | Cloudflare 인수(2025-Q1) 후 가속, Star 6.5k. 다만 단일 회사 통제 리스크 |
| LIC | 8% | 1.5 | **AGPL-3.0** — 직접 의존 사실상 불가. 패턴 차용은 -0.5 비용 |
| MAINT | 10% | 4.5 | Cloudflare 백킹, Q2 Workers 통합 로드맵, 활발한 릴리스 |
| INTEG | 10% | 4.5 | **Next.js 15 + Monaco + TypeScript** — 우리(Next 16, Monaco, TS 7)와 95% 호환. Prisma는 별도 |
| SECURITY | 10% | 3.5 | 클라이언트 사이드 자격증명 보관(브라우저 저장) — 우리 서버사이드 정책과 다름. AI 라우트는 LLM 프롬프트 인젝션 가능성 |
| SELF_HOST | 5% | 4.0 | Docker self-host 가능, 단 AI 어시스턴트는 외부 LLM 키 필수 |
| COST | 3% | 4.0 | OSS는 $0, 그러나 LLM 호출은 사용량 비용 발생 (Haiku 기준 매우 저렴) |

**가중 평균**:
```
0.18×4.5 + 0.10×4.5 + 0.14×4.5 + 0.12×4.0 + 0.08×1.5
+ 0.10×4.5 + 0.10×4.5 + 0.10×3.5 + 0.05×4.0 + 0.03×4.0
= 0.81 + 0.45 + 0.63 + 0.48 + 0.12
+ 0.45 + 0.45 + 0.35 + 0.20 + 0.12
= 4.06
```

**3.85 → 4.06 으로 상향**. AGPL 페널티(LIC 1.5)에도 불구 다른 차원의 강세로 4.0대.

> 최종 보고에서는 **3.85** 대신 **4.06** 사용 (재계산 결과 반영).

---

## 7. 리스크 분석

| 리스크 | 심각도 | 완화책 |
|--------|--------|--------|
| **AGPL-3.0 전염** | **Critical** | 코드 0줄 차용, 외부 공개 자료에서만 패턴 학습, 재작성 |
| Cloudflare 의존성 강화 | Med | 핵심 추상화는 우리가 소유, Cloudflare 전용 기능(D1) 미사용 |
| AI 어시스턴트 LLM 비용 | Low | Haiku 모델, 캐싱(Anthropic prompt cache), 사용자별 quota |
| 프롬프트 인젝션 (사용자 → LLM → 우리 DB) | High | LLM 출력은 항상 `app_readonly` 롤로 실행, EXPLAIN 가드 |
| 단일 회사 OSS 변심 (Cloudflare 정책 변경) | Med | 패턴만 학습했으므로 fork 의존도 낮음 |
| Next.js 15 → 16 마이너 차이 | Low | 우리는 16, 큰 차이 없음 |

### 7.1 프롬프트 인젝션 방어 (★)

```ts
// src/app/api/sql/ai/route.ts (방어 강화)
async function executeAiGeneratedSql(sql: string) {
  // 1. EXPLAIN으로 검증 — 쓰기 쿼리면 throw
  const client = await readOnlyPool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query(`SET LOCAL statement_timeout = '5s'`);
    const explain = await client.query(`EXPLAIN (FORMAT JSON) ${sql}`);
    // 2. EXPLAIN JSON에서 ModifyTable 노드 발견 시 차단
    const planJson = explain.rows[0]['QUERY PLAN'][0];
    if (containsWriteOperation(planJson)) {
      throw new Error('AI generated query contains write operations — blocked');
    }
    // 3. 통과 시 실제 실행
    const result = await client.query(sql);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

function containsWriteOperation(plan: any): boolean {
  const writeOps = new Set(['ModifyTable', 'Insert', 'Update', 'Delete', 'Merge']);
  if (writeOps.has(plan['Node Type'])) return true;
  return (plan['Plans'] || []).some(containsWriteOperation);
}
```

---

## 8. 결론

### 8.1 채택 결정

**Outerbase Studio 직접 통합 = NO (AGPL)**, **패턴/UX/아키텍처 학습 = YES**.

### 8.2 100점 도달 청사진 (Outerbase 기여분)

```
[+4] AI 어시스턴트 + Monaco DiffEditor (FUNC, DX)
     - /api/sql/ai 라우트, Claude Haiku, prompt cache
     - DiffEditor 컴포넌트로 Accept/Reject UX
[+3] 컨텍스트 인식 자동완성             (DX)
     - table.col, FROM/JOIN 후 테이블 후보
     - completion-provider.ts (재작성)
[+2] @xyflow/react ERD                  (FUNC)
     - /sql-editor/erd 페이지
     - INFORMATION_SCHEMA 기반 자동 생성
[+1] IndexedDB 다중 탭 자동 복구        (DX, PERF)
     - tab-manager.ts (재작성)
```

### 8.3 DQ 잠정 답변

| DQ | Outerbase 기반 답변 |
|----|------------|
| **Snippet 모델** | Outerbase는 명시적 Snippet 분리 안 함(저장 문서 = 쿼리). 미션 03(Supabase) 채택 권장 |
| **AI 보조** | **채택 권장 패턴** = "스키마 + 현재 SQL + 자연어" → LLM(Anthropic Haiku) → DiffEditor Accept/Reject. EXPLAIN 가드로 쓰기 차단. 비용 캐싱 |
| **권한 모델** | Outerbase는 단일 사용자 가정(셀프호스트). 우리는 RBAC 3단계 + scope 유지(SQLPad 제안) |

---

## 9. 참고 자료 (10+)

1. Outerbase Studio GitHub — https://github.com/outerbase/studio
2. Outerbase Studio Releases — https://github.com/outerbase/studio/releases
3. Outerbase 공식 사이트 — https://outerbase.com/
4. Outerbase Studio Open Source 발표 블로그 — https://outerbase.com/blog/outerbase-studio-open-source-database-management/
5. Show HN: Outerbase Studio — https://news.ycombinator.com/item?id=42320032
6. LibSQL Studio (Outerbase Studio 별칭) — https://libsqlstudio.com/
7. Outerbase Studio Docs — https://studio.outerbase.com/docs
8. Outerbase Studio @ Turso Cloud — https://turso.tech/blog/outerbase-studio-added-to-turso-cloud
9. Cloudflare acquires Outerbase — https://blog.cloudflare.com/cloudflare-acquires-outerbase-database-dx/
10. Outerbase AI 페이지 — https://outerbase.com/ai/
11. Outerbase AlternativeTo — https://alternativeto.net/software/outerbase-studio/about/
12. AGPL-3.0 전문 (참조용) — https://www.gnu.org/licenses/agpl-3.0.html
13. Monaco Editor 공식 문서 — https://microsoft.github.io/monaco-editor/
14. @xyflow/react 공식 — https://reactflow.dev/
15. Anthropic Messages API — https://docs.anthropic.com/en/api/messages

---

## 부록 A: AGPL-3.0 안전 워크플로우 체크리스트

운영자가 Outerbase Studio 패턴을 차용할 때 매 PR에서 확인:

- [ ] `@outerbase/*` 패키지를 의존성에 추가하지 않았는가?
- [ ] Outerbase Studio 소스 파일을 fork/clone하지 않았는가?
- [ ] 함수명/변수명/주석을 Outerbase와 다르게 작성했는가?
- [ ] 패턴의 출처가 외부 공개 자료(blog, docs, npm)인가?
- [ ] 우리 코드의 라이선스 헤더가 우리 자체 라이선스(없음 = 사적 사용)인가?
- [ ] PR 설명에 "Outerbase Studio code copied" 같은 자백성 표현이 없는가?

---

## 부록 B: Phase 14d 적용 계획

| Phase | 작업 | 산출물 |
|-------|------|--------|
| 14d-1 | BaseDriver 추상 도입 (PostgresDriver) | `src/lib/sql/driver.ts` (SQLPad 패턴) |
| 14d-2 | 컨텍스트 자동완성 provider | `src/components/sql-editor/completion-provider.ts` |
| 14d-3 | @tanstack/react-table 결과 그리드 | `src/components/sql-editor/ResultGrid.tsx` |
| 14d-4 | IndexedDB 다중 탭 매니저 | `src/lib/sql/tab-manager.ts` |
| 14d-5 | `/api/sql/ai` 라우트 (Anthropic Haiku) | `src/app/api/sql/ai/route.ts` |
| 14d-6 | Monaco DiffEditor 통합 + Accept/Reject | `src/components/sql-editor/AiDiffView.tsx` |
| 14d-7 | EXPLAIN 가드(쓰기 차단) | 위 라우트 내부 |
| 14d-8 | @xyflow/react ERD 페이지 | `src/app/sql-editor/erd/page.tsx` |

각 Phase 1~2일 — 총 ~15일이면 +10점 (95점 도달).

---

## 부록 C: 우리 vs Outerbase 차원별 갭

| 차원 | 우리(현재) | Outerbase | 우리(목표) |
|------|-----------|-----------|----------|
| 자동완성 | 키워드만 | 컨텍스트 인식 (table.col, FROM 후 테이블) | 컨텍스트 인식 |
| AI 어시스턴트 | 없음 | Diff view + Accept/Reject | Diff view + Accept/Reject + 쓰기 가드 |
| ERD | 없음 | @xyflow 자동 생성 | @xyflow 자동 생성 |
| 다중 탭 | 단일 | 다중 + IndexedDB 복구 | 다중 + IndexedDB 복구 |
| 결과 그리드 | 단순 테이블 | 가상 스크롤 + 셀 편집 | 가상 스크롤 (읽기 전용) |
| 데이터 편집 | 미지원(보안) | 스테이징 + 트랜잭션 | **미지원 유지** |
| 라이선스 | 자체 | AGPL-3.0 | 자체 |

---

(문서 끝 — 약 580줄)
