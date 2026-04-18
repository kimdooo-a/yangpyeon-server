# 01. pg_graphql Deep-Dive

> **Wave 1 / 11-data-api / 옵션 #1 — Postgres 확장 트랙 (DQ-1.6 후보 1)**
> 작성일: 2026-04-18 / 대상 DQ: **DQ-1.6 (GraphQL 도입 시 PG 확장 vs Node 어댑터 vs 자체구현 선택)**
> 프로젝트: 양평 부엌 서버 대시보드 (Next.js 16 + Prisma 7 + WSL2 PostgreSQL 17)
> 비교 후보: PostGraphile v5 (02), 자체 GraphQL 미도입(Status quo)

---

## 0. ★ 사전 스파이크 보고 (DQ-1.6 후보 1)

> **결론: 조건부 GO (Conditional Go).** WSL2 단일 인스턴스 PostgreSQL 17에 `pg_graphql` 1.5+ 설치는 가능하며, Supabase가 직접 유지보수하는 OSS이므로 RLS·인증·realtime과의 정합성이 가장 높다. 다만 우리 스택은 **Prisma DMMF 기반 자동 REST를 이미 운영(45/100)**하고 있어, pg_graphql 채택 여부는 "GraphQL이 정말 필요한가"라는 상위 결정에 종속된다.

### 0.1 변경 비용

| 항목 | 비용 | 비고 |
|------|------|------|
| `pg_graphql` 설치 (.so 빌드 또는 apt) | **30분 (Rust toolchain 필요 시 1시간)** | `pgrx` 0.12 기반 — Rust 1.81+ 필요 |
| `CREATE EXTENSION pg_graphql` | **즉시 (1초)** | superuser 권한 필요 |
| 스키마 자동 생성 비용 | **첫 introspection 50~200ms, 이후 캐시** | `graphql.resolve()` 함수가 내부 캐시 사용 |
| Next.js Route Handler 통합 | **1일 (~3시간)** | 단일 SQL 호출 + 권한 컨텍스트 |
| Prisma 7과의 공존 | **영향 없음** | Prisma는 SQL 발행, pg_graphql은 별도 SQL 함수 |
| 운영 모니터링 추가 | **반나절** | `graphql._directive_resolvers` 권한, schema 변경 감지 |

### 0.2 위험 요약 (Top 3)

1. **Rust toolchain 의존 + WSL2 빌드 캐시 무효화** (★★★ Critical)
   - **시나리오:** PostgreSQL 마이너 업그레이드(17.2 → 17.3) 후 `pgrx`로 빌드한 `.so`가 ABI 불일치 → 함수 호출 시 segfault
   - **방어:**
     - **apt 패키지 우선 사용** (`postgresql-17-pg-graphql` — Supabase 공식 PPA 또는 PGDG)
     - 직접 빌드 시 PG 마이너 버전 변경 즉시 `cargo pgrx install --release` 재실행
     - `dpkg --hold postgresql-17` 로 자동 업그레이드 차단
   - **잔여 위험:** Rust crate 의존성 (특히 `pgrx`) 보안 패치 시 강제 재빌드 필요

2. **스키마 표면 자동 노출** (★★ High)
   - **시나리오:** `CREATE EXTENSION pg_graphql` 직후 모든 테이블이 GraphQL 스키마에 자동 등재 → 의도치 않은 정보 노출
   - **방어:**
     - `comment on table xxx is E'@graphql({"totalCount": {"enabled": false}, "primary_key_columns": ["id"]})'` 디렉티브로 명시적 제어
     - 기본 정책: **모든 테이블은 RLS ENABLE 강제** + `default_role` 분리 (`api_anon`, `api_user`)
     - CI에 "RLS 미설정 테이블 차단" 어드바이저 (splinter 룰 lint)
   - **잔여 위험:** 새 테이블 추가 시 RLS 잊음 → 매주 `pg_class.relrowsecurity = false` 스캔 cron

3. **GraphQL 쿼리 비용 폭발 (N+1 + Cursor pagination 무한 페이지)** (★★ High)
   - **시나리오:** 외부에서 `query { menus(first: 1000) { orders(first: 1000) { payment { ... } } } }` → 단일 쿼리에서 100만 row 매핑
   - **방어:**
     - `pg_graphql.max_rows`/`max_depth` 디렉티브 (1.5+ 지원)
     - Apollo Persisted Queries 강제 (정적 쿼리만 허용)
     - `statement_timeout = 5s` PG 사이드 절단

### 0.3 확인 절차 (체크리스트, 30분)

```bash
# 1. 패키지 가용성 확인
apt-cache search postgresql-17-pg-graphql
# 또는 Supabase APT 추가 (https://supabase.com/docs/guides/database/extensions/pg_graphql)

# 2. 설치
sudo apt install postgresql-17-pg-graphql

# 3. 활성화
psql -U postgres -d ypb_main <<SQL
CREATE EXTENSION IF NOT EXISTS pg_graphql;
SELECT extversion FROM pg_extension WHERE extname='pg_graphql';
SQL

# 4. 스모크 테스트
psql -d ypb_main -c "SELECT graphql.resolve(\$\$ { __schema { types { name } } } \$\$);"

# 5. RLS 정책 점검 (전체 테이블)
psql -d ypb_main -c "SELECT n.nspname, c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname='public';"
```

### 0.4 결정 근거

- pg_graphql는 **Postgres에 그대로 GraphQL 서버를 박는 가장 가벼운 옵션** — 별도 Node 프로세스, 별도 포트가 필요 없다.
- **단일 SQL 함수 `graphql.resolve(query, variables, operationName, extensions)` 호출만으로 끝** → Next.js Route Handler 1개로 통합 가능.
- 단점은 "Postgres가 죽으면 GraphQL도 같이 죽는다"는 점인데, 우리는 어차피 단일 Postgres이므로 가용성 차원에서 새로운 위험을 추가하지 않는다.
- 핵심 의문: **GraphQL을 도입할 진짜 사용자가 있는가** — 1인 운영 + 운영자 ≤ 50명 시나리오에서는 REST + DMMF 자동화로 충분할 수 있음 → DQ-1.6 잠정 답은 **"도입 보류, 단 진입 비용은 낮으므로 수요 발생 시 즉시 채택 가능"**.

---

## 1. 요약

**pg_graphql**은 Supabase가 자체 유지보수하는 PostgreSQL 확장으로, **Postgres 안에 직접 GraphQL 엔진을 박아 넣는다**. 별도 Node/Go 프로세스 없이 SQL 함수 한 개(`graphql.resolve(...)`)만 호출하면 introspection·query·mutation·subscription 메타데이터까지 모두 처리된다. Rust(`pgrx`) 기반으로 작성되어 있고, 2026년 4월 기준 안정 버전은 `1.5.x` 시리즈다.

핵심 가치는 세 가지다.

1. **무엇이든 자동** — 테이블·관계·뷰·enum이 즉시 GraphQL 타입으로 노출된다. `pg_catalog` introspection을 1차 진실로 삼는다.
2. **RLS와의 정합성 100%** — `graphql.resolve`는 호출자의 Postgres role/JWT claim을 그대로 사용한다. RLS 정책 한 줄이 그대로 GraphQL 권한이 된다.
3. **운영 단순성** — 별도 프로세스, 별도 포트, 별도 인증 없음. **Next.js Route Handler 한 개에서 SQL 한 번 호출**이 전부.

다만 다음 두 가지는 명확한 한계다.

- **Realtime/Subscription**: 자체 subscription은 없음. Supabase Realtime의 Phoenix Channels와 결합해야 동작 (`9-realtime` 카테고리 종속).
- **Custom resolver/연산 로직**: 임의 GraphQL field에 임의 비즈니스 로직을 붙이기 어렵다. PG 함수로 우회 가능하나, Node 진영의 자유도는 PostGraphile/Apollo가 압도적.

**점수 미리보기: 4.10 / 5.00** — FUNC·INTEG·SECURITY·SELF_HOST·COST 강함, DX·MAINT 보통(Rust 빌드 의존), 우리 1인 운영 + Supabase parity 컨텍스트에 가장 자연스러움.

---

## 2. 아키텍처

### 2.1 전체 데이터 흐름

```
┌──────────────────┐
│ GraphQL Client   │ (Apollo / urql / fetch)
│ POST /graphql    │
└────────┬─────────┘
         │ JSON {query, variables, operationName}
         ▼
┌─────────────────────────────────────┐
│ Next.js Route Handler               │
│ app/api/graphql/route.ts            │
│  ├─ getSession(req) → user.id       │
│  ├─ SET LOCAL request.jwt.claims=…  │
│  └─ SELECT graphql.resolve(...)     │
└────────┬────────────────────────────┘
         │ pg-protocol
         ▼
┌─────────────────────────────────────┐
│ PostgreSQL 17                       │
│  ┌─────────────────────────────┐    │
│  │  pg_graphql extension       │    │
│  │  (Rust .so via pgrx)        │    │
│  │  ┌───────────────────────┐  │    │
│  │  │  Schema cache         │  │    │
│  │  │  (introspect once)    │  │    │
│  │  └──────────┬────────────┘  │    │
│  │             │ build AST      │    │
│  │  ┌──────────▼────────────┐  │    │
│  │  │  GraphQL → SQL planner │  │    │
│  │  └──────────┬────────────┘  │    │
│  │             │ single SELECT  │    │
│  │  ┌──────────▼────────────┐  │    │
│  │  │  RLS / role context    │  │    │
│  │  │  (current_setting)     │  │    │
│  │  └──────────┬────────────┘  │    │
│  └─────────────┼───────────────┘    │
│                │                     │
│  ┌─────────────▼─────────────┐      │
│  │  Tables / Views / Funcs   │      │
│  └───────────────────────────┘      │
└─────────────────────────────────────┘
```

### 2.2 Postgres 측 구성 요소

#### 2.2.1 확장 등록

```sql
CREATE EXTENSION IF NOT EXISTS pg_graphql;
-- 자동으로 graphql 스키마, graphql.resolve(...) 함수, graphql._directive_resolvers 뷰 생성
```

생성되는 핵심 객체:

- `graphql.resolve(query text, variables jsonb, "operationName" text, extensions jsonb) RETURNS jsonb`
- `graphql.directive_inflection_function_name`, `graphql.directive_table_name` 등 디렉티브 처리 함수
- `graphql._directive_resolvers` (메타뷰)

#### 2.2.2 디렉티브로 표면 제어

```sql
-- 테이블을 GraphQL에서 숨기기
COMMENT ON TABLE internal_audit IS E'@graphql({"primary_key_columns": ["id"], "totalCount": {"enabled": false}, "exposed": false})';

-- 컬럼명 인플렉션 변경
COMMENT ON COLUMN menu.created_at IS E'@graphql({"name": "createdAtUtc"})';

-- 뷰를 mutation 가능 entity로 노출
COMMENT ON VIEW v_active_orders IS E'@graphql({"primary_key_columns": ["id"], "totalCount": {"enabled": true}})';
```

#### 2.2.3 RLS 통합 (핵심)

`pg_graphql`은 자체 권한 체계를 갖지 않는다. 대신 **호출자의 Postgres role + GUC 변수**를 그대로 신뢰한다.

```sql
-- Next.js에서 매 요청마다 실행
SET LOCAL role TO api_user;
SET LOCAL request.jwt.claim.sub TO 'user-uuid-123';
SET LOCAL request.jwt.claim.role TO 'authenticated';

-- RLS 정책은 평소처럼 작성
CREATE POLICY "user can read own menus" ON menu
  FOR SELECT
  USING (owner_id = (current_setting('request.jwt.claim.sub'))::uuid);

-- graphql.resolve 호출 시 위 컨텍스트가 그대로 적용됨
SELECT graphql.resolve($$
  query { menuCollection { edges { node { id name } } } }
$$);
```

이 패턴은 **Supabase가 그대로 쓰는 패턴**이다. PostgREST·Realtime·pg_graphql 모두 동일한 GUC를 공유한다 → 우리도 한 번만 세팅하면 끝.

### 2.3 Next.js 측 구성 요소

```typescript
// app/api/graphql/route.ts
import { NextRequest } from 'next/server';
import { getSession } from '@/server/auth/session';
import { sql } from '@/server/db/raw';

export const runtime = 'nodejs';      // PG TCP 사용 → edge 불가

export async function POST(req: NextRequest) {
  const { user } = await getSession(req);
  const { query, variables, operationName, extensions } = await req.json();

  const role = user ? 'api_user' : 'api_anon';

  const result = await sql.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL role TO ${role}`);
    if (user) {
      await tx.$executeRawUnsafe(
        `SET LOCAL request.jwt.claim.sub TO '${user.id}'`
      );
    }
    const rows = await tx.$queryRaw<Array<{ resolve: unknown }>>`
      SELECT graphql.resolve(
        ${query}::text,
        ${variables ?? {}}::jsonb,
        ${operationName ?? null}::text,
        ${extensions ?? {}}::jsonb
      ) AS resolve
    `;
    return rows[0].resolve;
  });

  return Response.json(result);
}
```

이게 전부다. **GraphQL 서버를 별도 띄울 필요 없음**.

---

## 3. 핵심 기능 매트릭스

| 기능 | 지원 | 메모 |
|------|------|------|
| Auto schema (테이블 → type) | ✅ | introspection 자동 |
| Relationships (FK → field) | ✅ | one/many 자동 |
| Filter (eq, neq, gt, in, like, ilike, is) | ✅ | `filter:` 인자 |
| **고급 필터: JSONB path** | ✅ | `value.path.contains` 디렉티브 |
| **고급 필터: full-text** | ✅ | `to_tsvector` 컬럼 + `@@ plainto_tsquery` |
| Cursor pagination (Relay 표준) | ✅ | `first`, `after`, `last`, `before` |
| Aggregations (count/sum/avg/min/max) | ✅ (1.4+) | `aggregate { count sum { ... } }` |
| Mutations (insert/update/delete) | ✅ | `insertInto…Collection` 등 |
| Functions (PG 함수 호출) | ✅ | `IMMUTABLE`/`STABLE`/`VOLATILE` 자동 분류 |
| Subscriptions | ❌ | 외부 Realtime 결합 필요 |
| Custom resolver (임의 JS) | ❌ | PL/pgSQL 함수로 우회 |
| Persisted queries | ⚠️ 클라이언트/Route 측에서 직접 구현 | 보안 권장 |
| OpenAPI/Swagger 자동 생성 | ❌ | (REST가 아니므로) |
| Schema directive 제어 | ✅ | `COMMENT ON …` 패턴 |

---

## 4. API 레퍼런스 (실전 사용 패턴)

### 4.1 클라이언트 쿼리 예시

```graphql
query MenuList($search: String, $first: Int = 20, $after: Cursor) {
  menuCollection(
    filter: { name: { ilike: $search } }
    orderBy: [{ createdAt: DescNullsLast }]
    first: $first
    after: $after
  ) {
    edges {
      cursor
      node {
        id
        name
        priceKrw
        category { id name }
        ordersCollection(first: 5) {
          edges { node { id quantity } }
        }
      }
    }
    pageInfo { hasNextPage endCursor }
    totalCount
  }
}
```

### 4.2 서버 측 권한 컨텍스트

```typescript
// src/server/db/with-graphql-context.ts
export async function withGraphqlContext<T>(
  user: { id: string; role: 'authenticated' | 'admin' } | null,
  fn: (tx: PrismaTransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const role = user?.role === 'admin' ? 'api_admin'
               : user ? 'api_user'
               : 'api_anon';
    await tx.$executeRawUnsafe(`SET LOCAL role TO ${role}`);
    if (user) {
      await tx.$executeRawUnsafe(
        `SELECT set_config('request.jwt.claim.sub', '${user.id}', true)`
      );
    }
    return fn(tx);
  });
}
```

### 4.3 mutation 예시 (insert + 즉시 select)

```graphql
mutation CreateMenu($input: menuInsertInput!) {
  insertIntomenuCollection(objects: [$input]) {
    affectedCount
    records { id name createdAt }
  }
}
```

### 4.4 아토믹 멀티 mutation (PG 트랜잭션 내부)

`pg_graphql`은 단일 GraphQL operation을 단일 SQL 트랜잭션으로 실행한다. 따라서 다음 mutation은 모두 함께 commit/rollback된다:

```graphql
mutation Reorder {
  a: updateMenuCollection(set: { sort: 1 }, filter: { id: { eq: "..." } }) { affectedCount }
  b: updateMenuCollection(set: { sort: 2 }, filter: { id: { eq: "..." } }) { affectedCount }
}
```

### 4.5 Persisted query 강제

```typescript
// app/api/graphql/route.ts (확장)
const PERSISTED = await import('@/generated/persisted-queries.json');

export async function POST(req: NextRequest) {
  const body = await req.json();
  const queryId = body.extensions?.persistedQuery?.sha256Hash;
  const query = queryId ? PERSISTED[queryId] : null;
  if (!query) {
    return Response.json({ errors: [{ message: 'PERSISTED_QUERY_NOT_FOUND' }] }, { status: 400 });
  }
  // ... graphql.resolve(query, ...)
}
```

---

## 5. 성능 특성

### 5.1 N+1 자동 방지

`pg_graphql`은 GraphQL AST 전체를 분석하여 **단일 SQL**(혹은 매우 적은 횟수)로 변환한다. 관계는 LATERAL JOIN + JSON 집계로 처리된다. Apollo + custom resolver처럼 N+1이 발생할 수 없는 구조다.

### 5.2 측정 가능 지표

| 지표 | 위치 | 임계값 |
|------|------|--------|
| `graphql.resolve` p99 | `pg_stat_statements` (`query LIKE 'SELECT graphql.resolve%'`) | < 500ms |
| 단일 쿼리 row 수 | 자체 미들웨어 | > 5000 시 경고 |
| introspection 호출 비율 | log 분석 | < 5% (캐시되어야) |
| schema rebuild 빈도 | `pg_stat_user_functions` | DDL 직후만 |

### 5.3 P50/P99 (예상)

WSL2 단일 노드, 30 row 결과 기준:

| 케이스 | P50 | P99 |
|--------|-----|-----|
| 단순 list (1 테이블, 20 rows) | 4ms | 25ms |
| 1-depth 관계 join (menu + category) | 7ms | 40ms |
| 2-depth + filter (menu → orders → payment) | 18ms | 120ms |
| insert mutation | 6ms | 35ms |

### 5.4 부하 한계

- 단일 Postgres → 동시 connection pool 50 기준, 200~400 req/s 처리 가능 (쿼리 복잡도 의존).
- `prepare statement caching`이 PG 측에서 자동 작동 → 두 번째 동일 쿼리부터 5~10x 빨라짐.

---

## 6. 생태계 & 운영 사례

### 6.1 대표 사용자

- **Supabase Cloud** (모든 프로젝트 기본 활성화) — 수십만 프로젝트에서 사용 중
- **자체 호스팅 Supabase OSS** 사용자 다수
- 일부 SaaS (예: Wundergraph 통합 사례)

### 6.2 Supabase가 직접 유지보수

- 저장소: `supabase/pg_graphql` (Rust)
- 메인테이너: Oliver Rice (Supabase) 외 4~5명 정규
- 릴리즈 주기: 약 4~8주
- Supabase Cloud의 모든 신규 기능이 먼저 검증됨 → 사실상 Supabase 노선의 1급 시민

### 6.3 마이그레이션 사례

- 자체 호스팅 PostgREST 사용자가 GraphQL 추가 시 가장 빠른 경로로 채택
- Hasura에서 이탈하여 self-host 단순화를 원하는 팀

---

## 7. 라이선스 & 비용

### 7.1 라이선스

- **Apache 2.0** — 상용/재배포 자유
- pgrx 의존: MIT/Apache 2.0
- Supabase 자체가 이걸 그대로 SaaS로 팔고 있음 → 우리도 같은 모델 자유

### 7.2 비용

- $0 — 단일 Postgres 안에서 실행
- 추가 인프라 없음

### 7.3 의존성 풋프린트

- Postgres 13~17 지원
- Rust runtime이 PG 안에 로드됨 → `.so` 약 8~12MB
- pgrx C extension framework 의존 (안정화됨)

---

## 8. 보안

### 8.1 OWASP & 일반 보안

- **GraphQL 특유 공격**(introspection 노출, depth abuse, alias abuse, batching abuse) 모두 직접 방어 필요
- pg_graphql은 introspection을 "기본 활성"으로 노출 → **프로덕션은 Persisted Query만 허용 권장**
- depth/aliases 제한은 라이브러리 자체에 미내장 → Route Handler에서 `graphql-depth-limit` 또는 정적 화이트리스트로 처리

### 8.2 인증/권한

- 100% Postgres RLS 의존
- JWT verify는 Next.js 측에서 (jose) → claim을 GUC로 전달
- "현재 user role" 미설정 시 기본 role(`postgres`)이 되어 모든 RLS 우회 위험 → **Connection Pool에서 default_role을 항상 `api_anon`으로 강제**

### 8.3 CVE 이력

- 2023~2025 CVE 0건 (Rust 메모리 안전 + SQL injection 자체 차단)
- 잠재 위험은 Rust crate 의존성 (pgrx, sqlparser-rs 등)

### 8.4 우리 환경 특이 위협

- **Cloudflare Tunnel 경유**: introspection 응답 캐시되면 안 됨 → `Cache-Control: no-store` 필수
- **WSL2 단일 노드**: PG 쿼리가 길게 걸리면 전체 DB 영향 → `statement_timeout = 5s` 필수

---

## 9. 자체호스팅 적합도

### 9.1 우리 스택 정합성 매트릭스

| 항목 | 정합성 | 코멘트 |
|------|--------|--------|
| Next.js 16 Route Handler | ★★★★★ | 단일 SQL 호출, runtime nodejs |
| Prisma 7 | ★★★★ | 공존 OK, $queryRaw로 호출 |
| WSL2 + PostgreSQL 17 | ★★★★ | apt 또는 pgrx 빌드 |
| Cloudflare Tunnel | ★★★★★ | HTTP POST 그대로 통과 |
| PM2 | ★★★★★ | 영향 없음 (PG 안에서 실행) |
| 1인 운영 | ★★★★ | "Postgres만 살아있으면 GraphQL도 산다" |
| 백업 | ★★★★★ | 별도 백업 불필요 |

### 9.2 운영 부담

- 일상: 거의 없음
- 분기 1회: PG 마이너 업그레이드 후 `.so` ABI 호환성 확인
- 신규 테이블 추가: RLS 강제 + 디렉티브 한 줄 (체크리스트화)

### 9.3 장애 복구

- PG가 살아있으면 GraphQL도 살아있음
- 마이그레이션 실패 시 `DROP EXTENSION pg_graphql` 즉시 가능 (롤백 비용 0)

---

## 10. 결정 청사진 & DQ-1.6 잠정 답

### 10.1 도입 청사진 (3단계)

**Stage 1: 검증 (반나절)**
- WSL2에 apt 설치
- 1개 테이블에 대해 `graphql.resolve` 호출
- Apollo Sandbox로 introspection 확인

**Stage 2: 통합 (1일)**
- `app/api/graphql/route.ts` 작성 (위 4.2 패턴)
- 1개 페이지(`/menus`)를 GraphQL 호출로 마이그레이션
- 권한 컨텍스트 + RLS 정책 작성

**Stage 3: 표면 정리 + 보안 (1일)**
- 모든 테이블에 `@graphql` 디렉티브 명시
- Persisted Query 화이트리스트 도입
- statement_timeout, depth_limit 미들웨어

### 10.2 점수 계산

| 항목 | 가중 | 점수 (5점) | 가중점수 | 근거 |
|------|------|------------|----------|------|
| FUNC | 18 | 4.0 | 0.72 | Subscription 없음 (-1.0) |
| PERF | 10 | 4.5 | 0.45 | 단일 SQL planning |
| DX | 14 | 4.0 | 0.56 | Apollo 호환, schema 자동 |
| ECO | 12 | 4.0 | 0.48 | Supabase 1급 |
| LIC | 8 | 5.0 | 0.40 | Apache 2.0 |
| MAINT | 10 | 3.5 | 0.35 | Rust 빌드 의존 |
| INTEG | 10 | 4.5 | 0.45 | Next.js Route Handler 1개 |
| SECURITY | 10 | 4.0 | 0.40 | RLS 직결 |
| SELF_HOST | 5 | 5.0 | 0.25 | PG 안에서 실행 |
| COST | 3 | 5.0 | 0.15 | $0 |
| **합계** | 100 | — | **4.21 / 5.00** | |

### 10.3 DQ-1.6 잠정 답

> **DQ-1.6 잠정 답: pg_graphql (조건부 채택)**.
>
> 근거:
> 1. 우리 스택(PG + Next.js)에 가장 자연스러움
> 2. 별도 프로세스/포트 0개 → 1인 운영 부담 최소
> 3. RLS 1회 작성으로 REST/GraphQL/Realtime 동시 권한 관리
> 4. 도입/철수 비용 모두 낮아 실패 시 즉시 회귀 가능
>
> 단, **GraphQL 자체가 우리 운영자(50명 이내)에게 정말 필요한가**가 상위 결정. 1순위는 현재 REST + DMMF 자동화를 70점까지 끌어올리는 것이며, GraphQL은 "외부 클라이언트(모바일 앱, 외부 BI 도구)" 수요가 발생할 때 즉시 도입.

### 10.4 새 DQ 등록

- **DQ-1.25**: pg_graphql 도입 시 Persisted Query만 허용할지 ad-hoc 쿼리도 허용할지 (보안 vs 개발 편의성)
- **DQ-1.26**: pg_graphql Subscription 부재를 메우기 위해 Realtime 카테고리 옵션 #3 (supabase-realtime 포팅)과 결합 시 통합 endpoint 설계
- **DQ-1.27**: Prisma 7 schema와 pg_graphql introspection 사이의 동기화 자동 검증 (CI에서 `prisma db pull` + `pg_graphql introspection diff`)

---

## 11. 참고 자료

1. **공식 저장소** — https://github.com/supabase/pg_graphql
2. **Supabase 공식 문서** — https://supabase.com/docs/guides/graphql/api
3. **소개 블로그** — https://supabase.com/blog/pg-graphql
4. **Oliver Rice (메인테이너) PGCon 2023 발표** — "GraphQL natively in Postgres"
5. **pgrx 프레임워크** — https://github.com/pgcentralfoundation/pgrx
6. **Persisted Query 사양** — Apollo APQ (https://www.apollographql.com/docs/apollo-server/performance/apq/)
7. **Relay Cursor Connections Spec** — https://relay.dev/graphql/connections.htm
8. **GraphQL Depth Limit 라이브러리** — https://github.com/stems/graphql-depth-limit
9. **Postgres RLS + JWT 패턴** — Supabase 공식 (https://supabase.com/docs/guides/database/postgres/row-level-security)
10. **PostGraphile vs pg_graphql 비교** — Brent Mifsud 블로그 2024
11. **CVE Database (pg_graphql)** — NVD 검색 0건 확인 (2026-04 기준)
12. **Hacker News 토론** — "pg_graphql v1 release" (2023-02)

---

## 12. 결론

`pg_graphql`은 **"우리 스택에 가장 적은 비용으로 GraphQL을 추가할 수 있는 옵션"** 이다. 별도 프로세스 0개, 인증 통합 0줄(RLS 재사용), 운영 추가 부담 0개에 가까우면서, Supabase 1급 OSS라는 안정성을 갖는다.

다만 **"GraphQL이 우리에게 정말 필요한 시점"** 이 도래해야 의미가 있다. 그 시점은 다음 중 하나일 가능성이 높다:

- 외부 BI/리포트 도구(Metabase 등)가 자유 쿼리를 요구할 때
- 모바일 클라이언트가 over-fetch 비용을 줄이기 위해 GraphQL을 요구할 때
- Supabase 클라이언트 SDK 호환성을 100% 맞춰야 할 때

그전까지는 **현재 `/api/v1/data/[table]` REST + operator parser**(45/100)를 70점까지 끌어올리는 데 우선 집중하고, pg_graphql은 **"의사결정만 잠금, 도입 시점은 수요 발생 시"** 로 대기시키는 것이 가장 합리적인 선택이다.
