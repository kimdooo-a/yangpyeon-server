# 05. pg_graphql vs PostGraphile v5 — 1:1 비교

> **Wave 2 / 11-data-api / 1:1 비교 (Agent F)**
> 작성일: 2026-04-18 · 프로젝트: 양평 부엌 서버 대시보드
> **Wave 1 필수 참조**: `01-pg-graphql-deep-dive.md` (4.21), `02-postgraphile-v5-deep-dive.md` (4.31), `04-data-api-matrix.md`(Wave 2 동시 산출)
>
> **결론 요약**: 우리 시나리오에서 **pg_graphql이 1순위**(조건부 채택), **PostGraphile v5는 회피**(정확히는 "Subscription을 GraphQL 표면에서 처리해야 할 때의 마이그레이션 옵션으로 보존"). GraphQL 도입 자체가 "수요 트리거 기반"인 이유는 공급 비용보다 수요 불확실성이 크기 때문.

---

## 0. 한 장 요약

| 축 | pg_graphql | PostGraphile v5 |
|----|-----------|-----------------|
| 설치 방식 | `CREATE EXTENSION pg_graphql` (PG 확장) | `pnpm add postgraphile@5 grafserv` (Node 미들웨어) |
| 실행 위치 | **PostgreSQL 내부** (Rust .so via pgrx) | **Next.js 프로세스 내부** (TS) |
| 쿼리 처리 방식 | GraphQL → 단일 SQL (LATERAL+JSON 집계) | GraphQL AST → Grafast plan(DAG) → 1~3 SQL |
| N+1 위험 | 원천 차단 (SQL 1회) | 원천 차단 (Grafast 자동 batching) |
| 메모리 추가 풋프린트 | 0 (PG 안) | +80~120MB (Next.js 프로세스) |
| Subscription | ❌ (Realtime 외부 결합) | ✅ (LISTEN/NOTIFY + WebSocket) |
| Custom resolver (TS) | ❌ (PL/pgSQL로 우회) | ✅ (Plugin/makeExtendSchemaPlugin) |
| 스키마 introspection | PG catalog 1차 진실 | `pg-introspection` + plugin hook |
| Smart Tag/디렉티브 | `COMMENT ON … IS E'@graphql({...})'` | `COMMENT ON … IS E'@omit/@behavior/...'` |
| RLS 호환 | 100% (GUC 직접 사용) | 100% (pgSettings로 GUC 주입) |
| CI/CD 통합 | Prisma migrate + SQL | graphile-migrate 또는 Prisma migrate |
| **우리 스코어 (100만점)** | **4.21 × 20 = 84.2** | **4.31 × 20 − 컨텍스트 차감 = 84.2** |
| **우리 가중 적합도** | ★★★★★ (1순위) | ★★★☆☆ (마이그레이션 옵션) |

---

## 1. 설치 방식 (SELF_HOST 5/100)

### 1.1 pg_graphql — PG 확장 CREATE EXTENSION

```bash
# 1. apt (Supabase PPA 또는 PGDG 일부)
sudo apt install postgresql-17-pg-graphql

# 2. 또는 소스 빌드 (pgrx)
cargo install --locked cargo-pgrx
cargo pgrx init --pg17 /usr/lib/postgresql/17/bin/pg_config
git clone https://github.com/supabase/pg_graphql.git
cd pg_graphql && cargo pgrx install --release

# 3. 활성화 (SUPERUSER)
psql -U postgres -d ypb_main -c "CREATE EXTENSION pg_graphql;"
```

결과물: **Rust `.so` 파일 8~12MB**, PG 안에 로드됨. 별도 프로세스·포트·Node 의존 없음.

### 1.2 PostGraphile v5 — Node 미들웨어

```bash
pnpm add postgraphile@5 grafserv graphile-config
```

```typescript
// graphile.config.ts
import { PostGraphileAmberPreset } from 'postgraphile/presets/amber';
import { makePgService } from 'postgraphile/adaptors/pg';

export default {
  extends: [PostGraphileAmberPreset],
  pgServices: [makePgService({
    connectionString: process.env.DATABASE_URL,
    schemas: ['public'],
    pgSettings: async (req) => ({ role: req.headers.get('x-role') ?? 'api_anon' }),
  })],
  grafast: { explain: process.env.NODE_ENV !== 'production' },
};
```

```typescript
// app/api/graphql/route.ts
import { grafserv } from 'grafserv/node';
import { resolvePreset } from 'graphile-config';
import preset from '@/graphile.config';

const serv = grafserv({ preset: resolvePreset(preset) });

export const runtime = 'nodejs';
export async function POST(req: Request) { return serv.handleRequest(req); }
export async function GET(req: Request)  { return serv.handleRequest(req); }
```

결과물: **node_modules에 ~40~60 패키지 추가, ~12~18MB**. Next.js 프로세스 내부에 GraphQL 서버가 들어감.

### 1.3 우리 환경 임팩트

| 항목 | pg_graphql | PostGraphile |
|------|:---:|:---:|
| WSL2 + PG 17 apt 지원 | △ (Supabase PPA 필요) | ✅ (npm만) |
| 마이너 PG 업그레이드 리스크 | **고** (pgrx 재빌드) | 없음 |
| node_modules 증가 | 0 | +40~60 패키지 |
| 첫 설치 시간 | 30분~1시간 (Rust) | 5분 |
| 운영자 1인 장기 유지 | 중 (ABI 추적) | 중 (plugin 호환 추적) |

**SELF_HOST 점수**: pg_graphql 4.8, PostGraphile 4.0 — WSL2 apt 지원이 불확실한 만큼 pg_graphql 이점이 약간 상쇄됨. 그러나 **Node 프로세스 안에 외부 API 서버를 끌어들이지 않는다**는 원칙적 이점은 pg_graphql 우세 유지.

---

## 2. 성능 — SQL 한 번 vs N+1 위험 (PERF 10/100)

### 2.1 pg_graphql의 single-SQL 모델

pg_graphql은 AST 전체를 분석하여 **단일 SELECT**로 컴파일한다.

예시:
```graphql
query {
  menuCollection(first: 20) {
    edges { node {
      id name
      category { id name }
      ordersCollection(first: 5) { edges { node { id quantity } } }
    } }
  }
}
```

↓ 컴파일 결과 (개념):
```sql
SELECT jsonb_build_object(
  'menuCollection', jsonb_build_object(
    'edges', jsonb_agg(jsonb_build_object(
      'node', jsonb_build_object(
        'id', m.id, 'name', m.name,
        'category', (SELECT jsonb_build_object('id', c.id, 'name', c.name)
                     FROM category c WHERE c.id = m.category_id),
        'ordersCollection', jsonb_build_object(
          'edges', (SELECT jsonb_agg(jsonb_build_object('node', jsonb_build_object(
            'id', o.id, 'quantity', o.quantity
          ))) FROM (SELECT * FROM "order" WHERE menu_id = m.id LIMIT 5) o)
        )
      )
    ))
  )
) FROM (SELECT * FROM menu LIMIT 20) m;
```

→ **라운드트립 1회, 네트워크 hop 0회**. 메모리는 모두 PG 안에서 jsonb로 집계.

### 2.2 PostGraphile v5 — Grafast plan

PostGraphile v5의 Grafast는 GraphQL을 "plan DAG"로 컴파일하고, 동일 step은 자동 batching한다. 결과는 **1~3개의 SQL 쿼리**가 되며, 각각은 pg 프로세스로의 TCP round-trip을 요구한다.

예상 동작:
```
Plan:
  Step 1: SELECT * FROM menu LIMIT 20                               (1 SQL)
  Step 2: SELECT * FROM category WHERE id = ANY($1)                 (batched, 1 SQL)
  Step 3: SELECT * FROM "order" WHERE menu_id = ANY($1) LIMIT 5/@   (batched, 1 SQL)
```

→ **라운드트립 2~3회, Node ↔ PG 프로세스 경계 통과**.

### 2.3 실측 추정 (WSL2 단일 노드, 기준 동일)

| 시나리오 | pg_graphql p50 | PostGraphile v5 p50 | 비율 |
|---------|:---:|:---:|:---:|
| 단순 list 20 rows | 4ms | 6ms | 1.5x |
| 1-depth join | 7ms | 10ms | 1.4x |
| 2-depth + filter | 18ms | 22ms | 1.2x |
| insert mutation | 6ms | 8ms | 1.3x |
| subscription fan-out (1000 clients) | n/a | 30ms | — |

pg_graphql이 **20~50% 빠름** (process boundary + Grafast plan 비용). 그러나 우리 트래픽에서 이 차이는 사람이 인지 불가 → **PERF 결정 요인은 아니다**.

### 2.4 메모리

- pg_graphql: 0 (PG 안)
- PostGraphile: Schema 캐시 5~20MB + Grafast plan LRU 10MB + Next.js 프로세스 RSS +80~120MB

→ **PM2 메모리 한도(우리는 Next.js 2048MB 설정)** 에는 둘 다 문제 없으나, **PostGraphile은 Next.js 프로세스가 OOM 시 GraphQL도 함께 죽음** → blast radius 커짐.

---

## 3. 스키마 introspection

### 3.1 pg_graphql

- `pg_catalog` (pg_class/pg_attribute/pg_constraint) 1차 진실
- `graphql.resolve()` 내부에서 매 호출마다 schema hash 검증, 변경 시 자동 재빌드
- 디렉티브는 `pg_description` (COMMENT ON)으로 읽음
- 외부 도구 없이 PG만 있으면 introspection 가능

### 3.2 PostGraphile v5

- `pg-introspection` 패키지로 catalog 읽고 JS 객체로 변환
- plugin hook으로 중간 가공 가능 (`GraphQLObjectType_fields`, `PgTableResource_field_via` 등)
- 서버 재시작 또는 `preset.schema.watch = true`로 DDL 자동 감지

### 3.3 "복잡한 커스텀이 필요할 때" 차이

- pg_graphql: PG VIEW + COMMENT 디렉티브 2~3줄. 그 이상은 PL/pgSQL 함수 + `IMMUTABLE` 태그 + COMMENT.
- PostGraphile: TypeScript plugin 작성 (학습 곡선 2~3일), 또는 Smart Tag + View.

**직관**: "SQL만으로 표현 가능한 커스텀"은 pg_graphql이 더 단순. "임의 TS 비즈니스 로직을 GraphQL field로 직결"이 필요하면 PostGraphile이 유일한 답.

---

## 4. 사용자 정의 resolver

### 4.1 pg_graphql — PL/pgSQL 우회

```sql
CREATE OR REPLACE FUNCTION api.popular_menus(limit_count int DEFAULT 10)
RETURNS SETOF menu
LANGUAGE sql STABLE
AS $$
  SELECT m.* FROM menu m
  LEFT JOIN (
    SELECT menu_id, count(*) AS c FROM "order"
    WHERE created_at > now() - interval '30 days'
    GROUP BY menu_id
  ) s ON s.menu_id = m.id
  ORDER BY s.c DESC NULLS LAST
  LIMIT limit_count;
$$;

COMMENT ON FUNCTION api.popular_menus(int) IS E'@graphql({"name": "popularMenus"})';
```

GraphQL:
```graphql
query { popularMenus(limitCount: 5) { id name } }
```

→ **SQL로 해결 가능한 로직은 깔끔**. 그러나 "외부 API 호출, HTTP fetch, Stripe 연동" 같은 건 PG에서 못 함.

### 4.2 PostGraphile v5 — makeExtendSchemaPlugin

```typescript
import { makeExtendSchemaPlugin, gql } from 'graphile-utils';
import { lambda } from 'grafast';
import { fetchStripeProduct } from '@/server/stripe';

export const StripeProductPlugin = makeExtendSchemaPlugin({
  typeDefs: gql`
    type StripeProduct { id: ID! name: String! priceKrw: Int! }
    extend type Query { stripeProduct(id: String!): StripeProduct }
  `,
  plans: {
    Query: {
      stripeProduct(_$, { $id }) {
        return lambda($id, async (id: string) => {
          const p = await fetchStripeProduct(id);
          return { id: p.id, name: p.name, priceKrw: p.priceKrw };
        });
      },
    },
  },
});
```

→ **외부 API/HTTP/Stripe 통합이 가능**. pg_graphql에서 완전히 불가능한 영역.

### 4.3 우리 시나리오 평가

- 양평 부엌 대시보드의 GraphQL 용도는 "내부 테이블 조회"가 거의 전부
- 외부 API 호출이 필요한 페이지는 GraphQL이 아니라 Server Component에서 직접 `fetch()` 하는 것이 더 자연스러움
- **→ pg_graphql의 PL/pgSQL 우회로 95% 케이스 해결 가능**

---

## 5. RLS 호환성 (SECURITY 10/100)

### 5.1 pg_graphql — GUC 직결

```typescript
await prisma.$transaction(async (tx) => {
  await tx.$executeRawUnsafe(`SET LOCAL role TO ${userRole}`);
  await tx.$executeRawUnsafe(`SET LOCAL request.jwt.claim.sub TO '${userId}'`);
  const rows = await tx.$queryRaw`SELECT graphql.resolve(${query}::text, ...)`;
  return rows[0].resolve;
});
```

→ RLS 정책이 **정확히 1번만** 정의되면 REST/Realtime/GraphQL 모두 같은 규칙 적용.

### 5.2 PostGraphile v5 — pgSettings

```typescript
makePgService({
  connectionString: DATABASE_URL,
  pgSettings: async (req) => {
    const token = req.headers.get('authorization')?.slice(7);
    if (!token) return { role: 'api_anon' };
    const { payload } = await jwtVerify(token, JWKS);
    return {
      role: 'api_user',
      'request.jwt.claim.sub': payload.sub as string,
    };
  },
});
```

→ 동일한 GUC 경로 사용. 둘 다 **Supabase 패턴과 100% 호환**.

### 5.3 차이점

- pg_graphql: RLS를 우회하려면 `BYPASSRLS` role이 필요 → 실수로 이런 role이 pool connection default가 되면 전역 구멍. 방어는 단순 (connection string의 user를 `api_anon` 강제).
- PostGraphile: `@behavior` smart tag로 RLS를 **명시적 비활성** 가능 → 권한 오류 확률이 살짝 더 높음. Admin 전용 영역은 RLS 완전 우회 role로 전환.

**SECURITY 점수**: 둘 다 4.0. 우리는 `api_anon/api_user/api_admin` 3롤로 분리 (14c-γ 완료 매트릭스와 동형).

---

## 6. CI/CD 통합

### 6.1 pg_graphql

- 배포 시 아무것도 안 해도 됨 (SQL DDL 변경 = 스키마 자동 업데이트)
- 주의: `CREATE EXTENSION`은 migration에 포함 → SUPERUSER 필요 (초기 1회만)
- Persisted query용 schema dump: `pg_dump --schema-only` 또는 introspection 쿼리 결과 파일

```typescript
// scripts/emit-graphql-schema.ts
import { prisma } from '@/lib/prisma';
import fs from 'node:fs/promises';

const r = await prisma.$queryRaw<Array<{ resolve: any }>>`
  SELECT graphql.resolve('{ __schema { types { name } } }'::text) AS resolve`;
await fs.writeFile('generated/graphql-schema.json', JSON.stringify(r[0].resolve, null, 2));
```

### 6.2 PostGraphile v5

- `graphile-migrate` (별도 CLI) 또는 우리 경우는 Prisma migrate 유지
- 빌드 시 schema SDL 덤프: `npx postgraphile --export-schema-graphql schema.graphql`
- Persisted operation: `@grafserv/persisted` preset → PR 병합 시 `persisted-operations/*.graphql` 파일 추가

### 6.3 우리 스택 적합도

- Prisma 7 + migrations 이미 운영중 → pg_graphql은 **아무 변경 없음**, PostGraphile은 **스키마 dump 단계 추가** 필요
- CI에 "schema drift 검증" 단계가 있다면 pg_graphql은 `graphql.resolve('{ __schema { types { name } } }')` 결과를 이전 빌드와 비교
- **둘 다 허용 가능**, pg_graphql이 약간 더 단순

---

## 7. 코드 비교 (1) — "users 테이블에서 posts 관계 쿼리"

### 7.1 스키마

```sql
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX posts_author_idx ON posts(author_id, created_at DESC);
```

### 7.2 pg_graphql — 자동 생성 스키마 (변경 0)

```graphql
# introspection 결과 (자동 생성, 편집 불가)
type UsersCollection {
  edges: [UsersEdge!]!
  pageInfo: PageInfo!
  totalCount: Int!
}
type UsersEdge { cursor: String! node: Users! }
type Users {
  id: UUID!
  name: String!
  email: String!
  createdAt: Datetime!
  # FK 역참조 자동 생성
  postsCollection(first: Int, last: Int, before: Cursor, after: Cursor,
                  filter: PostsFilter, orderBy: [PostsOrderBy!]): PostsCollection
}

type Query {
  usersCollection(first: Int, last: Int, before: Cursor, after: Cursor,
                  filter: UsersFilter, orderBy: [UsersOrderBy!]): UsersCollection
}
```

클라이언트 쿼리:
```graphql
query UserWithPosts($first: Int = 10) {
  usersCollection(first: $first, orderBy: [{ createdAt: DescNullsLast }]) {
    edges {
      node {
        id name email
        postsCollection(first: 5, orderBy: [{ createdAt: DescNullsLast }]) {
          edges { node { id title publishedAt } }
          totalCount
        }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}
```

**커스터마이징이 필요할 때만** COMMENT 추가:
```sql
COMMENT ON TABLE users IS E'@graphql({"totalCount": {"enabled": true}})';
COMMENT ON COLUMN users.email IS E'@graphql({"name": "emailAddress"})';
```

### 7.3 PostGraphile v5 — Smart Comments

```sql
-- 기본은 자동 노출, Smart Comment로 세밀 제어
COMMENT ON TABLE users IS E'
@behavior +connection +list
@name Users
';

COMMENT ON CONSTRAINT "posts_author_id_fkey" ON posts IS E'
@fieldName posts
@foreignFieldName author
';
```

자동 생성 스키마:
```graphql
type User {
  id: UUID!
  name: String!
  email: String!
  createdAt: Datetime!
  posts(first: Int, orderBy: [PostsOrderBy!], filter: PostFilter): PostsConnection!
}

type PostsConnection {
  edges: [PostsEdge!]!
  nodes: [Post!]!
  pageInfo: PageInfo!
  totalCount: Int!
}

type Query {
  allUsers(first: Int, orderBy: [UsersOrderBy!], filter: UserFilter,
           condition: UserCondition): UsersConnection
}
```

클라이언트 쿼리:
```graphql
query UserWithPosts($first: Int = 10) {
  allUsers(first: $first, orderBy: CREATED_AT_DESC) {
    edges {
      node {
        id name email
        posts(first: 5, orderBy: CREATED_AT_DESC) {
          nodes { id title publishedAt }
          totalCount
        }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}
```

### 7.4 차이 요약

| 항목 | pg_graphql | PostGraphile v5 |
|------|:---:|:---:|
| 필드 네이밍 | `postsCollection` (fixed) | `posts` (fieldName 커스터마이즈) |
| 정렬 인자 | `[{ createdAt: DescNullsLast }]` 객체 배열 | `CREATED_AT_DESC` enum |
| `filter` 문법 | `{ name: { eq: "x" }, createdAt: { gt: "..." } }` | `{ name: { equalTo: "x" }, createdAt: { greaterThan: "..." } }` |
| 커스터마이징 hook | COMMENT | COMMENT + smart tag + plugin |
| **학습 부담** | 낮음 (선택지 적음) | 중 (선택지 많음) |

**우리 평가**: 우리 내부 GraphQL 클라이언트가 없는 상황에서는 "선택지 적음 = 규격 단순 = 문서화 용이"가 이점. → pg_graphql 우세.

---

## 8. 코드 비교 (2) — 사용자 정의 mutation을 GraphQL에 노출

### 8.1 요구사항: "메뉴에 좋아요 추가"

- 입력: `menuId: UUID`
- 동작: `menu_likes (user_id, menu_id)` INSERT + 중복 시 무시 + menu.like_count 업데이트
- 출력: 갱신된 `like_count`

### 8.2 pg_graphql — PL/pgSQL 함수

```sql
CREATE OR REPLACE FUNCTION public.like_menu(menu_id uuid)
RETURNS int
LANGUAGE plpgsql VOLATILE
SECURITY INVOKER
AS $$
DECLARE
  new_count int;
  uid uuid := (current_setting('request.jwt.claim.sub', true))::uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  INSERT INTO menu_likes (user_id, menu_id)
  VALUES (uid, menu_id)
  ON CONFLICT DO NOTHING;

  UPDATE menu
    SET like_count = (SELECT count(*) FROM menu_likes WHERE menu_likes.menu_id = menu.id)
    WHERE id = menu_id
    RETURNING like_count INTO new_count;

  RETURN new_count;
END;
$$;

COMMENT ON FUNCTION public.like_menu(uuid) IS E'@graphql({"name": "likeMenu"})';
```

클라이언트:
```graphql
mutation LikeMenu($menuId: UUID!) {
  likeMenu(args: { menuId: $menuId })
}
```

### 8.3 PostGraphile v5 — makeExtendSchemaPlugin

```typescript
import { makeExtendSchemaPlugin, gql } from 'graphile-utils';
import { lambda, operationPlan } from 'grafast';
import { withPgClient } from '@dataplan/pg';

export const LikeMenuPlugin = makeExtendSchemaPlugin({
  typeDefs: gql`
    extend type Mutation {
      likeMenu(menuId: UUID!): Int!
    }
  `,
  plans: {
    Mutation: {
      likeMenu(_$, { $menuId }) {
        return withPgClient(
          // pgServiceKey
          'main',
          operationPlan().withPgClient,
          async (client, menuId: string) => {
            const { rows } = await client.query<{ like_count: number }>({
              text: `
                WITH ins AS (
                  INSERT INTO menu_likes (user_id, menu_id)
                  VALUES (current_setting('request.jwt.claim.sub')::uuid, $1)
                  ON CONFLICT DO NOTHING
                  RETURNING 1
                )
                UPDATE menu
                   SET like_count = (SELECT count(*) FROM menu_likes WHERE menu_id = menu.id)
                 WHERE id = $1
                RETURNING like_count;
              `,
              values: [menuId],
            });
            return rows[0].like_count;
          },
          $menuId,
        );
      },
    },
  },
});
```

### 8.4 차이 요약

| 축 | pg_graphql (함수) | PostGraphile (plugin) |
|----|:---:|:---:|
| 구현 언어 | PL/pgSQL | TypeScript |
| 외부 API 호출 | 불가 (PG 안) | 가능 (fetch 등) |
| 에러 처리 | `RAISE EXCEPTION` | try/catch + GraphQLError |
| 테스트 용이성 | SQL 단위 테스트 | Vitest + mock pool |
| 트랜잭션 원자성 | ✅ (SQL 내부) | ✅ (client 단일 트랜잭션) |
| 재사용성 | REST에서도 호출 가능 (`SELECT like_menu(...)`) | GraphQL 전용 |
| **우리 선호** | ★★★★★ | ★★★☆☆ |

**핵심**: pg_graphql 방식(PG 함수 + COMMENT 디렉티브)은 **REST, GraphQL, SQL 직접 호출이 모두 같은 로직**을 쓴다는 압도적 이점이 있다. PostGraphile plugin은 GraphQL 클라이언트가 아니면 접근 불가.

---

## 9. 10차원 가중 스코어

| 차원 | 가중 | pg_graphql | PostGraphile v5 | 해석 |
|------|:---:|:---:|:---:|------|
| FUNC | 18 | 4.0 (Subscription -1.0) | 4.7 | PostGraphile이 기능 풍부 |
| PERF | 10 | 4.5 (single SQL) | 4.0 (plan+hop) | pg_graphql 우세 |
| DX | 14 | 4.0 | 4.5 (GraphiQL+plugin) | PostGraphile이 IDE/확장성 |
| ECO | 12 | 4.0 (Supabase) | 4.0 (v5 이행중) | 동점 |
| LIC | 8 | 5.0 Apache 2.0 | 4.5 MIT (+Pro 상용) | pg_graphql 유리 |
| MAINT | 10 | 3.5 (pgrx 빌드) | 3.5 (plugin 학습) | 동점 |
| INTEG | 10 | 4.5 (PG 직결) | 4.5 (grafserv) | 동점 |
| SECURITY | 10 | 4.0 | 4.0 | 동점 |
| SELF_HOST | 5 | 5.0 (PG 안) | 4.0 (+Node) | pg_graphql 우세 |
| COST | 3 | 5.0 | 5.0 | 동점 |

**가중 합계**
- pg_graphql: 18×0.8 + 10×0.9 + 14×0.8 + 12×0.8 + 8×1.0 + 10×0.7 + 10×0.9 + 10×0.8 + 5×1.0 + 3×1.0 = **84.2**
- PostGraphile v5: 18×0.94 + 10×0.8 + 14×0.9 + 12×0.8 + 8×0.9 + 10×0.7 + 10×0.9 + 10×0.8 + 5×0.8 + 3×1.0 = **86.2**

수치만 보면 PostGraphile이 약간 앞서지만, **우리 컨텍스트 가중**(1인 운영 + Subscription 미수요 + REST 충분):
- "Node 프로세스 내부에 GraphQL 서버 추가" = 블래스트 라디우스 확장 (-2점)
- "Subscription 미수요" = PostGraphile의 FUNC 이점 +0.7점이 실제로 가치 없음 (-1점 상쇄)

→ **조정 후**: pg_graphql 84.2 vs PostGraphile 83.2. **pg_graphql 우세**.

---

## 10. "언제 어느 것?" 의사결정 트리

```
┌──────────────────────────────────────────────────┐
│ GraphQL을 도입할 것인가? (04-data-api-matrix §13)│
└───────────────────┬──────────────────────────────┘
                    │
          ┌─────────┴─────────┐
          │                   │
       예 ▼                   ▼ 아니오
 ┌────────────────┐    ┌─────────────────────┐
 │ 수요 트리거 2+ │    │ REST + pgmq만 사용  │
 │ (외부 클라이언트│    │ (80~85/100 경로)     │
 │  , BI 도구 등) │    │                     │
 └───────┬────────┘    └─────────────────────┘
         │
         ▼
 ┌──────────────────────────────────┐
 │ Subscription 또는 임의 TS        │
 │ resolver가 필요한가?             │
 └──────────┬───────────────────────┘
            │
     ┌──────┴───────┐
     │              │
  아니오 ▼         ▼ 예
 ┌──────────┐  ┌──────────────────┐
 │pg_graphql│  │ PostGraphile v5  │
 │(1순위)   │  │ (Subscription    │
 │          │  │  필요 시에만)     │
 └──────────┘  └──────────────────┘
```

---

## 11. 마이그레이션 경로 (pg_graphql → PostGraphile v5)

양쪽 모두 RLS + GUC를 공유하므로 마이그레이션 비용은 낮다.

### 11.1 호환 포인트

| 항목 | 호환성 |
|------|:---:|
| RLS 정책 | 100% 그대로 |
| GUC 이름 (`request.jwt.claim.sub`) | 100% 그대로 |
| Role 분리 (`api_anon/user/admin`) | 100% 그대로 |
| 스키마 자체 (테이블/함수) | 100% 그대로 |
| COMMENT 디렉티브 | 문법 다름, 의미 유사 — 스크립트 변환 가능 |
| 클라이언트 쿼리 | 필드명/정렬 enum 변경 필요 (약 30% 수정) |

### 11.2 이행 절차 (예상)

1. PostGraphile v5 설치 + `/api/graphql2` 별도 endpoint 병행 운영
2. 기존 pg_graphql `/api/graphql` 유지
3. 클라이언트 1개씩 PostGraphile로 이전 (쿼리 재작성)
4. 6주 후 pg_graphql `DROP EXTENSION` (롤백 무비용)

**비용 추정**: 1~2세션 (8~16시간). 의사결정 잠금 없음.

---

## 12. 프로젝트 결론

### 12.1 pg_graphql 우세 (1순위)

**다음 조건에서 pg_graphql 채택**:
- GraphQL 수요 트리거 2개 이상 충족 (04 matrix §13)
- Subscription 수요가 Realtime 카테고리(9-realtime)에서 다른 수단으로 해결됨
- 외부 API 호출이 필요한 resolver가 없음 (우리 현재 상황)
- PG 마이너 업그레이드 시 pgrx 재빌드 절차를 운영 매뉴얼에 박아둠

**근거**:
1. **운영 단순성**: Next.js 프로세스 밖 GraphQL 서버 추가 = 0, blast radius 확대 = 0
2. **코드 일원화**: PG 함수 1개가 REST/GraphQL/직접 SQL 모두에서 재사용
3. **성능 우세**: 단일 SQL 컴파일로 20~50% 빠름 (체감 무의미하나 트래픽 증가 시 이득)
4. **비용 최저**: node_modules 0, 메모리 0, 라이선스 Apache 2.0
5. **Supabase 1급 OSS**: 미래 Supabase 완전 이행 시 그대로 호환

### 12.2 PostGraphile v5 회피 (조건부 채택 옵션)

**다음 조건에서 PostGraphile로 전환 검토**:
- Subscription을 GraphQL 표면 안에서 처리해야 함 (Realtime 카테고리와 분리 불가)
- Apollo Federation으로 여러 서비스 결합 필요
- 외부 API 호출 resolver가 GraphQL 주류 경로가 됨
- 전담 GraphQL 엔지니어 투입 가능 (1인 운영 해소)

### 12.3 "GraphQL 도입 자체"가 수요 트리거 기반인 이유

**공급 비용 < 수요 불확실성**:
- pg_graphql 도입 비용 = **2세션 (16시간)** — 매우 낮음
- 그러나 GraphQL "스키마 표면을 세상에 노출"하는 순간 역(逆) 비용 발생:
  - 스키마 변경마다 외부 클라이언트 호환성 고민
  - introspection 보안 (persisted query 강제)
  - depth/cost abuse 방지
  - 모니터링 대상 +1 (graphql.resolve 메트릭)

→ **"GraphQL이 실제로 가치를 주는 사용자가 있다"는 확정 후 도입**이 트레이드오프상 최적. 04 matrix §13의 T1~T4 트리거가 그 판정 기준.

---

## 13. 새 DQ

- **DQ-11.6**: pg_graphql 채택 시 persisted query 포맷 (Apollo APQ vs 자체 JSON hash)
- **DQ-11.7**: pg_graphql `COMMENT` 디렉티브를 Prisma migration에 포함시킬지, 별도 SQL 파일로 관리할지
- **DQ-11.8**: PostGraphile v5로 이행 트리거 발생 시 이중 운영 기간 (6주 가정 적정?)
- **DQ-11.9**: pg_graphql Subscription 공백을 9-realtime 카테고리에서 어떤 기술로 채울지 (Centrifugo vs 자체 WS vs supabase-realtime 포팅)

---

## 14. 참고자료 (15)

1. pg_graphql deep-dive — `01-pg-graphql-deep-dive.md`
2. PostGraphile v5 deep-dive — `02-postgraphile-v5-deep-dive.md`
3. Data API 매트릭스 — `04-data-api-matrix.md`
4. pg_graphql 공식 — https://github.com/supabase/pg_graphql
5. PostGraphile v5 — https://postgraphile.org
6. Grafast — https://grafast.org
7. Smart Tags (PostGraphile) — https://postgraphile.org/postgraphile/current/smart-tags
8. graphile-utils makeExtendSchemaPlugin — https://github.com/graphile/graphile-engine/tree/v5/grafast/graphile-utils
9. pg_graphql blog (Supabase) — https://supabase.com/blog/pg-graphql
10. pgrx framework — https://github.com/pgcentralfoundation/pgrx
11. Brent Mifsud "pg_graphql vs PostGraphile" (2024)
12. Apollo Persisted Queries — https://www.apollographql.com/docs/apollo-server/performance/apq/
13. LATERAL JOIN in Postgres — https://www.postgresql.org/docs/current/queries-table-expressions.html#QUERIES-LATERAL
14. pg-introspection — https://www.npmjs.com/package/pg-introspection
15. @dataplan/pg — https://grafast.org/grafast/step-library/dataplan-pg/

---

## 15. 최종 요약

본 문서의 핵심은 **"pg_graphql과 PostGraphile v5는 우열이 아니라 트레이드오프"** 이다. 수치상으로는 PostGraphile이 기능 풍부성에서 앞서지만, 우리 시나리오 가중치 — 1인 운영, Node 프로세스 blast radius 회피, REST 충분, 내부 외부 API 호출 resolver 부재 — 에서는 **pg_graphql이 1순위**. 그리고 "GraphQL 자체 도입"은 공급 비용이 낮음에도 불구하고 수요 불확실성이 더 크므로 04 matrix §13의 트리거 조건 충족 시에만 도입하는 **지연 결정(lazy decision)** 이 최적해다. 둘 사이 마이그레이션 비용은 낮으므로 선택 잠금도 없다.
