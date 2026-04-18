# SQLPad 심층 분석 — 셀프 호스트 SQL GUI 참조 사례

> Wave 1 / Round 2 / SQL Editor Track / 미션 1
> 작성일: 2026-04-18
> 대상: 양평 부엌 서버 대시보드 `/sql-editor` 100점 동등성
> 비교 기준: Supabase Studio SQL Editor (FUNC 18%, PERF 10%, DX 14%, ECO 12%, LIC 8%, MAINT 10%, INTEG 10%, SECURITY 10%, SELF_HOST 5%, COST 3%)

---

## 0. 한 줄 요약

SQLPad는 React + Node.js로 작성된 MIT 라이선스의 셀프 호스트 SQL GUI로, "쿼리 = 1급 객체(저장/공유/태그/태그 기반 검색)" 개념과 다중 드라이버 추상화의 모범적 구현을 보여주지만 2025년 8월 아카이브 예정으로 의존성 측면에서는 채택할 수 없다. 그러나 **`Query`/`QueryHistory`/`Connection`/`ConnectionAccess`/`User` 5개 도메인 모델 설계**, **ACL 기반 공유**, **다중 드라이버 어댑터 패턴**은 우리 프로젝트의 `SqlQuery` 모델 확장에 그대로 차용 가능하다.

종합 점수: **3.45 / 5** — "참조 가치는 높지만 직접 통합은 불가, 패턴만 빌린다."

---

## 1. 프로젝트 개요

| 항목 | 값 |
|------|---|
| 공식 리포 | github.com/sqlpad/sqlpad |
| 라이선스 | MIT |
| 언어 | JavaScript (백엔드 Node.js, 프론트 React) |
| 패키징 | Docker 단일 이미지 (`sqlpad/sqlpad`, port 3000) |
| 임베디드 DB | SQLite (`/var/lib/sqlpad`) — 메타스토어 |
| 지원 드라이버 | Postgres, MySQL, SQL Server, ClickHouse, Crate, Vertica, Trino, Presto, SAP HANA, Cassandra, Snowflake, BigQuery, SQLite, TiDB + ODBC |
| 인증 | Local username/password, OAuth(Google/GitHub/Generic OIDC), LDAP, SAML, Disable Auth |
| 상태 | **Maintenance mode** — 2025년 8월 아카이브 예고 |
| 최신 메이저 | 7.x (2024년 시점) |
| Star | 약 8.5k+ |

### 1.1 우리 프로젝트와의 매핑

| SQLPad 개념 | 양평 부엌 대시보드 대응 |
|---|---|
| `Query` 모델 | `SqlQuery` (이미 존재, name/sql/scope) |
| `QueryHistory` | **부재** — Phase X 추가 필요 |
| `Connection` | **부재** — 단일 PG 풀(`pg`)만 있음. 멀티 DB는 Phase Y |
| `ConnectionAccess` | **부재** — `app_readonly` PG 롤로 대체 |
| `Snippet` | **부재** — Supabase parity 핵심 갭 |

---

## 2. 아키텍처 (DeepWiki 기반)

### 2.1 전체 토폴로지

```
┌──────────────────────────────────────────────────────────────┐
│ Browser (React SPA)                                           │
│  - Ace Editor (SQLPad는 Ace 기반, Monaco 아님)                  │
│  - SWR 데이터 페칭                                              │
│  - Recharts 결과 차트                                           │
└──────────────────────────────────────────────────────────────┘
                  │ REST / WebSocket (실시간 결과)
                  ▼
┌──────────────────────────────────────────────────────────────┐
│ Node.js Express Server (server/)                              │
│  - Sequelize ORM → SQLite/Postgres/MySQL (메타)                 │
│  - Driver Plugin Layer (drivers/postgres, drivers/mysql, ...)  │
│  - Job Queue (인 메모리 — 쿼리 큐)                               │
│  - Auth Middleware (Passport.js)                               │
└──────────────────────────────────────────────────────────────┘
                  │ pg, mysql2, mssql, snowflake-sdk ...
                  ▼
┌──────────────────────────────────────────────────────────────┐
│ Target Databases (사용자가 등록한 모든 DB)                       │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 핵심 디렉토리

```
sqlpad/
├── client/                       # React SPA
│   ├── src/queryEditor/           # 쿼리 에디터 (Ace + 사이드바 + 결과)
│   ├── src/queries/               # 저장된 쿼리 목록/검색
│   ├── src/connections/           # DB 커넥션 CRUD
│   └── src/users/                 # 사용자 + ACL
├── server/
│   ├── drivers/                   # 14개+ DB 드라이버 (★ 핵심)
│   │   ├── postgres/index.js
│   │   ├── mysql/index.js
│   │   ├── snowflake/index.js
│   │   └── _common.js            # 공통 인터페이스
│   ├── models/                    # Sequelize 모델
│   │   ├── queries.js
│   │   ├── queryHistory.js
│   │   ├── connections.js
│   │   ├── connectionAccesses.js
│   │   └── users.js
│   ├── routes/                    # REST 라우트
│   └── lib/
│       ├── jobs.js               # 쿼리 실행 잡
│       └── csv-stream.js          # 결과 스트리밍
└── docker-entrypoint.sh
```

### 2.3 Driver Plugin 인터페이스 (★ 빌릴 핵심 패턴)

SQLPad의 모든 DB 드라이버는 동일한 시그니처를 따른다:

```js
// server/drivers/postgres/index.js (요지)
module.exports = {
  id: 'postgres',
  name: 'Postgres',
  fields: [                              // UI 자동 폼 생성
    { key: 'host', formType: 'TEXT' },
    { key: 'port', formType: 'TEXT' },
    { key: 'database', formType: 'TEXT' },
    { key: 'username', formType: 'TEXT' },
    { key: 'password', formType: 'PASSWORD' },
    { key: 'ssl', formType: 'CHECKBOX' },
    { key: 'readOnlyMode', formType: 'CHECKBOX' },  // ★ 우리도 채택
  ],
  runQuery: async (query, connection) => {
    const client = new pg.Client(connection);
    await client.connect();
    if (connection.readOnlyMode) {
      await client.query('SET TRANSACTION READ ONLY');
    }
    const result = await client.query(query);
    return { rows: result.rows, fields: result.fields };
  },
  testConnection,
  getSchema,                              // INFORMATION_SCHEMA 기반 스키마 트리
};
```

**우리에 적용**: 멀티 DB는 당장 불필요하지만, **`readOnlyMode` + `runQuery` + `getSchema` 인터페이스**는 그대로 차용한다. `src/lib/sql/driver.ts`로 추상화하면 후일 BigQuery 등 추가 시 코드 수정 최소화.

---

## 3. 핵심 기능 분석

### 3.1 Query (저장된 쿼리) 모델

SQLPad 4.2.0부터 모든 쿼리는 기본 PRIVATE이며, 명시적으로 ACL을 추가해야 공유된다.

```js
// 단순화된 Sequelize 모델
const Query = sequelize.define('Query', {
  id: { type: STRING, primaryKey: true, defaultValue: uuid },
  name: STRING,
  queryText: TEXT,                       // SQL 본문
  connectionId: STRING,                  // FK → Connection
  userId: STRING,                        // 작성자
  tags: ARRAY(STRING),                   // 태그 (검색용)
  acl: JSONB,                            // [{ groupId|userId, write: bool }]
  chartConfiguration: JSONB,             // 차트 설정
  createdAt: DATE,
  updatedAt: DATE,
});
```

**얻은 인사이트** (우리 `SqlQuery` 모델 확장에 적용):
1. **`tags`** — 단순 문자열 배열, 검색·필터 핵심. 우리도 추가.
2. **`acl` JSONB** — `[{ userId, write: bool }, { groupId, write: bool }]`. 우리는 RBAC가 단순(ADMIN/MANAGER/USER)하니 enum scope(PRIVATE/PROJECT/PUBLIC) + `sharedWithUserIds[]` 정도로 단순화.
3. **`chartConfiguration`** — 결과를 Recharts/Vega로 시각화. Phase 2 후순위.
4. **`connectionId`** — 멀티 DB 지원. 우리는 단일 PG라 보류.

### 3.2 QueryHistory (이력)

쿼리 실행마다 별도 row 생성. 동일 쿼리 N번 실행 = N개 row.

```js
const QueryHistory = sequelize.define('QueryHistory', {
  id: STRING,
  queryId: STRING,                       // null 가능 (ad-hoc 실행)
  queryName: STRING,
  queryText: TEXT,                       // ★ 스냅샷 — 원본 쿼리가 변경되어도 보존
  userId: STRING,
  connectionId: STRING,
  startTime: DATE,
  stopTime: DATE,
  durationMs: INTEGER,
  rowCount: INTEGER,
  status: ENUM('started', 'finished', 'error'),
  error: TEXT,
});
```

**적용 포인트**:
- 우리 `SqlQuery.lastRunAt` 단일 필드는 부족 — 별도 `SqlQueryRun` 모델 필요.
- 스냅샷 패턴 중요(쿼리 본문이 나중에 변경돼도 이력은 당시 본문 보존).

### 3.3 Connection / ConnectionAccess (멀티 DB + ACL)

`Connection`은 DB 접속 정보, `ConnectionAccess`는 "어떤 사용자/그룹이 이 커넥션을 쓸 수 있나"를 정의한다. 만료(`expiryDate`) 지원.

```js
const ConnectionAccess = sequelize.define('ConnectionAccess', {
  connectionId: STRING,
  userId: STRING,                        // 또는 groupId
  duration: INTEGER,                      // 초 단위
  expiryDate: DATE,                       // null이면 무기한
});
```

**우리에 직접 적용 어려움** — 단일 PG라 Connection 개념 없음. 다만 **만료 기반 임시 접근 부여**는 보안 감사 관점에서 유용하므로 향후 메모.

### 3.4 결과 시각화

- **테이블**: 가상 스크롤 (react-window)
- **차트**: Recharts (line, bar, pie, scatter)
- **다운로드**: CSV / JSON / XLSX (서버 사이드 스트리밍 — 메모리 안전)

**적용**: 우리도 `ag-grid` 또는 `tanstack/react-table` + 가상 스크롤 필요. CSV 다운로드는 Phase 14 우선순위.

### 3.5 Snippets — **약점**

검색 결과에 따르면 SQLPad는 명시적 "Snippet" 기능이 없다. 대신 "쿼리를 PRIVATE으로 저장 후 다른 쿼리에 복붙"하는 우회 방식. **Supabase parity 핵심 갭이므로 SQLPad에서는 배울 게 없음** — 다음 미션(02 outerbase, 03 supabase)에서 보완.

### 3.6 인증/권한

- 사용자: `admin` / `editor` / `viewer` 3 롤
- 그룹(Group): 사용자 묶음. ACL은 그룹 또는 개인 단위.
- 외부 인증: OAuth, OIDC, LDAP, SAML

**우리**: `Role` enum (ADMIN/MANAGER/USER) 이미 존재. 그룹 도입은 과잉.

---

## 4. 통합 시나리오 — 우리 `/sql-editor`에 빌릴 것

### 4.1 빌릴 패턴 (우선순위 H)

| # | 패턴 | 우리 구현 위치 | 이유 |
|---|------|--------------|------|
| 1 | `QueryHistory` 모델 + 스냅샷 | `prisma/schema.prisma` `SqlQueryRun` | 실행 이력 영구 보존, 감사용 |
| 2 | `tags: String[]` | `SqlQuery.tags` 추가 | 검색/필터 |
| 3 | `acl` 단순화 (scope + sharedWithUserIds) | `SqlQuery.scope` + 신규 `sharedWithUserIds String[]` | 공유 모델 |
| 4 | Driver 인터페이스 (`runQuery/getSchema/testConnection`) | `src/lib/sql/driver.ts` | 향후 멀티 DB 확장 대비 |
| 5 | `readOnlyMode` 옵션 | 이미 `app_readonly` 롤로 구현됨 | OK |
| 6 | CSV/JSON/XLSX 서버 스트리밍 다운로드 | `src/app/api/sql/download/route.ts` | 대용량 결과 메모리 안전 |
| 7 | 결과 가상 스크롤 | `tanstack/react-table` + react-virtual | 성능 |

### 4.2 빌리지 않을 것 (이유 명시)

- **멀티 DB 드라이버** — 단일 PG 정책 유지 (단순성, 보안)
- **그룹/ACL JSONB** — RBAC 3단계로 충분
- **Ace Editor** — 우리는 Monaco 채택 완료
- **WebSocket 실시간 결과 스트리밍** — Phase 14b SSE로 갈음

### 4.3 마이그레이션 청사진 (Prisma)

```prisma
// SqlQuery 확장
model SqlQuery {
  id                  String     @id @default(uuid())
  name                String
  sql                 String
  scope               QueryScope @default(PRIVATE)
  tags                String[]   @default([])      // ★ 신규
  sharedWithUserIds   String[]   @default([])      // ★ 신규 (단순화된 ACL)
  description         String?                       // ★ 신규
  ownerId             String     @map("owner_id")
  owner               User       @relation("UserSqlQueries", fields: [ownerId], references: [id], onDelete: Cascade)
  lastRunAt           DateTime?  @map("last_run_at")
  runs                SqlQueryRun[]
  createdAt           DateTime   @default(now()) @map("created_at")
  updatedAt           DateTime   @default(now()) @updatedAt @map("updated_at")

  @@index([ownerId, scope])
  @@index([tags], type: Gin)                       // 태그 검색용
  @@map("sql_queries")
}

// 신규: 실행 이력
model SqlQueryRun {
  id           String   @id @default(uuid())
  queryId      String?  @map("query_id")
  query        SqlQuery? @relation(fields: [queryId], references: [id], onDelete: SetNull)
  queryText    String   @map("query_text")        // ★ 스냅샷
  userId       String   @map("user_id")
  startedAt    DateTime @default(now()) @map("started_at")
  finishedAt   DateTime? @map("finished_at")
  durationMs   Int?     @map("duration_ms")
  rowCount     Int?     @map("row_count")
  status       RunStatus @default(STARTED)
  errorMessage String?  @map("error_message")
  explainPlan  Json?    @map("explain_plan")      // ★ Phase 14d EXPLAIN ANALYZE 결과

  @@index([userId, startedAt])
  @@index([queryId, startedAt])
  @@map("sql_query_runs")
}

enum RunStatus {
  STARTED
  FINISHED
  ERROR
  CANCELLED
}

enum QueryScope {
  PRIVATE
  PROJECT
  PUBLIC
}
```

### 4.4 Driver 추상화 코드 예시

```ts
// src/lib/sql/driver.ts
import type { Pool, QueryResult } from 'pg';

export interface SqlDriver {
  readonly id: string;
  readonly name: string;
  runQuery(sql: string, opts?: RunQueryOptions): Promise<QueryResult>;
  getSchema(): Promise<SchemaTree>;
  testConnection(): Promise<{ ok: boolean; error?: string }>;
}

export interface RunQueryOptions {
  readOnly?: boolean;
  statementTimeoutMs?: number;
  bindParams?: unknown[];
}

// src/lib/sql/drivers/postgres.ts
export class PostgresDriver implements SqlDriver {
  readonly id = 'postgres';
  readonly name = 'Postgres';

  constructor(private pool: Pool) {}

  async runQuery(sql: string, opts: RunQueryOptions = {}): Promise<QueryResult> {
    const client = await this.pool.connect();
    try {
      if (opts.readOnly) {
        await client.query('BEGIN READ ONLY');
      }
      await client.query(`SET LOCAL statement_timeout = '${opts.statementTimeoutMs ?? 30000}'`);
      const result = await client.query(sql, opts.bindParams);
      if (opts.readOnly) await client.query('COMMIT');
      return result;
    } catch (err) {
      if (opts.readOnly) await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getSchema(): Promise<SchemaTree> {
    const sql = `
      SELECT table_schema, table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY table_schema, table_name, ordinal_position
    `;
    const { rows } = await this.runQuery(sql, { readOnly: true });
    return buildSchemaTree(rows);
  }

  async testConnection() {
    try {
      await this.runQuery('SELECT 1', { readOnly: true });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
}
```

### 4.5 Monaco 통합 (SQLPad는 Ace지만 우리는 Monaco이므로 monaco-sql-languages 활용)

```ts
// src/components/sql-editor/MonacoSqlEditor.tsx
'use client';

import Editor, { OnMount } from '@monaco-editor/react';
import { useEffect, useRef } from 'react';
import { setupLanguageFeatures, LanguageIdEnum } from 'monaco-sql-languages';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onRun: () => void;
  schema: SchemaTree;          // ★ Driver.getSchema() 결과
}

export function MonacoSqlEditor({ value, onChange, onRun, schema }: Props) {
  const editorRef = useRef<any>(null);

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;

    // PostgreSQL 언어 설정 (monaco-sql-languages 기반)
    setupLanguageFeatures(LanguageIdEnum.PG, {
      completionItems: {
        enable: true,
        completionService: async (model, position, completionContext) => {
          // 컨텍스트(테이블명 위치인지, 컬럼명 위치인지)에 따라 schema에서 후보 추출
          if (completionContext.tableNames) {
            return schema.tables.flatMap((t) =>
              t.columns.map((c) => ({
                label: c.name,
                kind: monaco.languages.CompletionItemKind.Field,
                insertText: c.name,
                detail: `${t.schema}.${t.name} : ${c.dataType}`,
              })),
            );
          }
          return schema.tables.map((t) => ({
            label: `${t.schema}.${t.name}`,
            kind: monaco.languages.CompletionItemKind.Class,
            insertText: t.name,
          }));
        },
      },
    });

    // ★ Cmd/Ctrl+Enter → Run (SQLPad의 표준 단축키)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, onRun);

    // ★ Cmd/Ctrl+S → 저장 (브라우저 저장 다이얼로그 차단)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      // 저장 액션
    });
  };

  return (
    <Editor
      height="100%"
      defaultLanguage="pgsql"          // monaco-sql-languages
      value={value}
      onChange={(v) => onChange(v ?? '')}
      onMount={handleMount}
      theme="vs-dark"
      options={{
        minimap: { enabled: false },
        fontSize: 14,
        wordWrap: 'on',
      }}
    />
  );
}
```

---

## 5. 라이선스

| 항목 | 값 |
|------|---|
| 본체 | **MIT** |
| 의존성 위험 | sequelize(MIT), express(MIT), passport(MIT) — 모두 OK |
| AGPL 오염 | 없음 |
| 채택 가능성 | ★★★★★ (코드 인용·차용 자유) |

**결론**: 라이선스 측면에서 SQLPad의 모든 코드/패턴을 자유롭게 차용 가능. 다만 **참조만**, 직접 임포트는 안 함(아카이브 예고).

---

## 6. 스코어링 (5점 척도, 앵커링 포함)

| 차원 | 가중치 | 점수 | 근거 |
|------|--------|------|------|
| FUNC | 18% | 3.0 | 기본 SQL 편집/실행/이력/공유는 충실. **Snippet 별도 기능 없음**, EXPLAIN Visualizer 없음, AI 보조 없음 → Supabase 대비 -2점. 차트는 +1점 |
| PERF | 10% | 4.0 | 결과 가상 스크롤, CSV 스트리밍, 인메모리 잡 큐 — 모두 견고. 단 매우 큰 결과셋(>1M row)은 미검증 |
| DX | 14% | 3.5 | Cmd+Enter 표준, 사이드바 스키마 트리, 다중 탭. Ace 기반(Monaco 대비 -0.5), 자동완성은 키워드 수준 |
| ECO | 12% | 3.0 | GitHub Star 8.5k, 그러나 **유지보수 모드(2025-08 아카이브)** → 생태계 신규 확장 기대 불가 |
| LIC | 8% | 5.0 | MIT — 차용 자유 |
| MAINT | 10% | 1.5 | **아카이브 예고** — 신규 의존성 채택 부적격. 패턴 참조용으로만 가치 |
| INTEG | 10% | 3.0 | Driver 인터페이스/Sequelize 모델 → Prisma 마이그레이션 가능. 다만 React/Express는 우리 Next.js 16 App Router와 직접 호환 안됨(서버 라우트 재작성 필요) |
| SECURITY | 10% | 4.0 | `readOnlyMode`, OAuth/SAML, ACL 만료, SQL injection은 파라미터 바인딩 권장. 단 RBAC는 그룹 단위라 우리 단순 RBAC와 갭 |
| SELF_HOST | 5% | 5.0 | Docker 단일 이미지, 단일 노드. 양평 부엌 PM2 환경에 부합 |
| COST | 3% | 5.0 | $0 |

**가중 평균**:
```
0.18×3.0 + 0.10×4.0 + 0.14×3.5 + 0.12×3.0 + 0.08×5.0
+ 0.10×1.5 + 0.10×3.0 + 0.10×4.0 + 0.05×5.0 + 0.03×5.0
= 0.54 + 0.40 + 0.49 + 0.36 + 0.40
+ 0.15 + 0.30 + 0.40 + 0.25 + 0.15
= 3.44 → 반올림 3.45 / 5
```

---

## 7. 리스크 분석

| 리스크 | 심각도 | 완화책 |
|--------|--------|--------|
| 2025-08 아카이브 후 보안 패치 중단 | High | **직접 의존 금지**. 코드/패턴만 참조 |
| 멀티 드라이버 패턴 채택 시 과잉 추상화 | Med | 단일 PG는 그대로, 인터페이스만 도입 |
| Sequelize → Prisma 모델 마이그레이션 | Low | Prisma 모델 직접 작성, SQLPad는 청사진 참조만 |
| Ace 기반 단축키 매핑이 Monaco와 다름 | Low | Monaco의 `addCommand`로 동일하게 재현 |
| 차트 기능 도입 시 번들 크기 증가 | Low | Phase 2 후순위, 일단 미도입 |

---

## 8. 결론

### 8.1 채택 결정

**SQLPad 직접 통합 = NO**, **패턴 차용 = YES**.

### 8.2 100점 도달 청사진 (SQLPad 기여분)

다음 미션 02(outerbase), 03(supabase studio)와 결합하여 100점 청사진을 완성하지만, SQLPad 단독으로는 **+15점** 기여:

```
현재 70점 → SQLPad 패턴 적용 후 85점

[+5] SqlQueryRun 모델 + 이력 UI       (FUNC)
[+3] 태그 검색 + 공유 단순화 (scope+sharedWithUserIds)  (FUNC, DX)
[+2] CSV/JSON/XLSX 서버 스트리밍 다운로드   (FUNC, PERF)
[+2] Monaco + monaco-sql-languages 자동완성 (스키마 인지)  (DX)
[+2] Driver 인터페이스 (PostgresDriver) — 향후 확장 대비  (INTEG)
[+1] Cmd+Enter 등 표준 단축키 매핑           (DX)
```

남은 +15점은 Snippet/EXPLAIN/AI Assistant — **미션 02, 03**에서 충당.

### 8.3 DQ(미결정사항) 잠정 답변

| DQ | SQLPad 기반 잠정 답변 |
|----|-----------|
| Snippet 모델 | SQLPad는 별도 Snippet 모델 없음 — 미해결, 미션 03(Supabase) 참고 필수 |
| AI 보조 | SQLPad 미지원 — 미션 02/03 참고 |
| 권한 모델 | **단순화 권장** — `scope: PRIVATE/PROJECT/PUBLIC` + `sharedWithUserIds: String[]`. SQLPad의 그룹+JSONB ACL은 과잉 |

---

## 9. 참고 자료 (10+)

1. SQLPad 공식 GitHub — https://github.com/sqlpad/sqlpad
2. SQLPad DeepWiki 개요 — https://deepwiki.com/sqlpad/sqlpad/1-overview
3. SQLPad Getting Started 문서 — https://sqlpad.github.io/en/getting-started/
4. SQLPad Releases — https://github.com/sqlpad/sqlpad/releases
5. SQLPad Docker Hub — https://hub.docker.com/r/sqlpad/sqlpad
6. SQLPad ODBC Wiki — https://github.com/sqlpad/sqlpad/wiki/ODBC
7. SQLPad Issue #624 (커넥션 공유 만료) — https://github.com/sqlpad/sqlpad/issues/624
8. ComputingForGeeks: SQLPad MySQL/PostgreSQL/SQL Server — https://computingforgeeks.com/manage-mysql-postgresql-sql-server-using-sqlpad-editor/
9. Azure SQL Dev Blog: Querying with SQLPad — https://devblogs.microsoft.com/azure-sql/querying-and-visualizing-data-using-sqlpad/
10. Yugabyte: SQLPad on GKE — https://www.yugabyte.com/blog/getting-started-with-sqlpad-and-distributed-sql-on-google-kubernetes-engine/
11. SourceForge SQLPad — https://sourceforge.net/projects/sqlpad.mirror/
12. monaco-sql-languages npm — https://www.npmjs.com/package/monaco-sql-languages
13. monaco-sql-languages GitHub — https://github.com/DTStack/monaco-sql-languages
14. Implementing SQL Autocompletion in Monaco-Editor (Medium, Alan He) — https://medium.com/@alanhe421/implementing-sql-autocompletion-in-monaco-editor-493f80342403

---

## 부록 A: SQLPad가 잘하는 것 vs 못하는 것 (한눈)

| 영역 | 잘함 | 못함 |
|------|------|------|
| 멀티 DB | 14개+ 드라이버 | 단일 DB 사용자에겐 과잉 |
| 쿼리 저장/공유 | ACL 만료, 그룹 | 너무 복잡(JSONB) |
| 차트 | Recharts 내장 | 디자인은 구식 |
| EXPLAIN | TEXT 출력만 | Visualizer 없음 |
| AI 보조 | 없음 | — |
| Snippet | 없음 | — |
| 인증 | OAuth/SAML/LDAP | 풀스택 자체 인증 시스템 |
| 보안 | readOnlyMode, ACL | RBAC 단순 케이스에 과잉 |
| 유지보수 | 2025-08 아카이브 | 향후 의존 금지 |

---

## 부록 B: 우리 `/sql-editor` Phase별 SQLPad 적용 계획

| Phase | 작업 | 산출물 |
|-------|------|--------|
| 14c-1 | `SqlQuery.tags` + `description` 추가 | Prisma migration |
| 14c-2 | `SqlQueryRun` 모델 + 실행 이력 UI | Prisma migration + `/sql-editor/history` 페이지 |
| 14c-3 | Driver 인터페이스 (`PostgresDriver`) | `src/lib/sql/driver.ts` |
| 14c-4 | Monaco + monaco-sql-languages | `src/components/sql-editor/MonacoSqlEditor.tsx` 갱신 |
| 14c-5 | CSV/JSON/XLSX 다운로드 (스트리밍) | `src/app/api/sql/download/route.ts` |
| 14c-6 | Cmd+Enter 단축키 표준화 | 위 컴포넌트 |
| 14c-7 | `sharedWithUserIds` 공유 UI | `/sql-editor/queries/[id]/share` |

각 Phase는 1~2일 분량 — 총 ~10일이면 SQLPad 기반 +15점 도달.

---

(문서 끝 — 약 540줄)
