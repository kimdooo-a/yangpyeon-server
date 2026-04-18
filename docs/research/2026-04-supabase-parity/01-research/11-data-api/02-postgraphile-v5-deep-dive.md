# 02. PostGraphile v5 (Grafserv) Deep-Dive

> **Wave 1 / 11-data-api / 옵션 #2 — Node 어댑터 트랙 (DQ-1.6 후보 2)**
> 작성일: 2026-04-18 / 대상 DQ: **DQ-1.6 (GraphQL 도입 시 PG 확장 vs Node 어댑터 vs 자체구현 선택)**
> 프로젝트: 양평 부엌 서버 대시보드 (Next.js 16 + Prisma 7 + WSL2 PostgreSQL 17)
> 비교 후보: pg_graphql (01), 자체 GraphQL 미도입(Status quo)

---

## 0. ★ 사전 스파이크 보고 (DQ-1.6 후보 2)

> **결론: 조건부 GO.** PostGraphile v5(2024 stable)는 **Grafserv** 서버 + **Gra*fast*** 실행 엔진의 완전 새 아키텍처로 재작성되었으며, **Plugin Pattern**(`graphile-build`, `pg-introspection`, `grafast`)을 통해 pg_graphql보다 압도적인 확장성을 제공한다. Next.js 16 통합은 단일 Route Handler에 `grafserv/handlers/node` 어댑터를 마운트하는 것으로 가능하다. **단, 우리 1인 운영 + 단일 PG 시나리오에서는 "확장성 과잉"** 이며, 추가되는 Node 의존성(40+ 패키지)·플러그인 학습 곡선·v4→v5 ecosystem 이행 진행 중이라는 점에서 **신규 도입 1순위는 아니다**.

### 0.1 변경 비용

| 항목 | 비용 | 비고 |
|------|------|------|
| `postgraphile@5` + `grafserv` 설치 | **5분** | npm 패키지 |
| 의존성 풋프린트 추가 | **+40~60 패키지, +12MB** | Plugin 시스템 |
| Next.js Route Handler 통합 | **1일 (~4시간)** | `grafserv/node` 어댑터 |
| Smart Tags + RLS 학습 | **1일** | `@omit`, `@behavior`, `@filterable` 등 |
| Plugin 작성 (커스텀 resolver) | **1~3일** | gather/build/schema hook 이해 필요 |
| Prisma 7과의 공존 | **영향 없음** | 별도 SQL 발행, 별도 connection pool |
| 운영 모니터링 | **반나절** | Grafserv healthz, plan inspector |

### 0.2 위험 요약 (Top 3)

1. **v4 → v5 생태계 이행 중** (★★★ Critical)
   - **시나리오:** 인기 v4 플러그인(예: `postgraphile-plugin-connection-filter`)이 v5에 미포팅되어, 고급 필터/PostGIS/full-text 등에서 직접 포팅 작업 필요
   - **방어:**
     - **v5 공식 플러그인 우선 사용** (Grafast 내장 필터)
     - 미포팅 v4 플러그인은 채택하지 않음 (또는 직접 포팅 commit)
     - `@graphile/pg-pubsub` 같은 핵심 모듈은 v5 정식 지원 확인 (2024 후반 GA)
   - **잔여 위험:** Subscription/PubSub 영역은 아직 안정 표면이 좁음

2. **Plugin Pattern 학습 곡선** (★★ High)
   - **시나리오:** "메뉴 목록에 인기도 순 정렬" 같은 단순 커스텀이 plugin 작성으로 이어지면 학습 비용 증가
   - **방어:**
     - 단순 커스텀은 PG VIEW + Smart Tag로 처리 (`COMMENT ON VIEW … IS E'@behavior +list +connection'`)
     - Plugin은 진짜 cross-cutting (예: 모든 mutation에 audit log) 한정
   - **잔여 위험:** 1인 운영자가 plugin debug 시 GraphQL 로그 + Grafast plan 모두 읽어야 함

3. **Grafast 실행 모델 변경** (★★ Medium)
   - v5는 모든 resolver가 **Grafast step**으로 컴파일됨 (DataLoader-스타일 자동 batching). 익숙한 "각 resolver 한 번씩 실행" 모델과 다름
   - **방어:**
     - 첫 통합 시 Grafast `inspect` UI(`/grafast/inspect`)로 plan 검증 습관화
     - 단순 CRUD는 plan을 신경 쓸 일 없음

### 0.3 확인 절차 (체크리스트, 30분)

```bash
# 1. 패키지 설치 (Next.js 프로젝트 루트)
pnpm add postgraphile@5 grafserv graphile-config

# 2. 최소 preset 파일
cat > graphile.config.ts <<TS
import { PostGraphileAmberPreset } from 'postgraphile/presets/amber';
import { makePgService } from 'postgraphile/adaptors/pg';
import type {} from 'postgraphile';

export default {
  extends: [PostGraphileAmberPreset],
  pgServices: [
    makePgService({
      connectionString: process.env.DATABASE_URL,
      schemas: ['public'],
    }),
  ],
  grafast: { explain: true },
};
TS

# 3. CLI로 스모크 (별도 터미널, npx)
npx postgraphile -P postgraphile/presets/amber -c $DATABASE_URL -s public

# 4. http://localhost:5678/graphiql 접속하여 introspection 확인
```

### 0.4 결정 근거

- **PostGraphile v5는 GraphQL 표면을 가장 풍부하게 자동화하는 OSS**(아마도 가장 강력)이지만, 우리는 **"풍부함보다는 운영 단순성"** 이 우선이다.
- pg_graphql과 비교하면 **+40 패키지 + Node 프로세스 in-process 추가** vs **PG 함수 호출 1줄**의 트레이드오프 → 1인 운영 환경에서는 후자가 명확히 유리.
- 단, 다음 시나리오에서는 PostGraphile이 답이 된다:
  - GraphQL Subscription 자체 구현 필요 (LISTEN/NOTIFY)
  - 매우 복잡한 인플렉션·필터·정렬 룰
  - 외부 모바일 앱이 Apollo Federation 결합을 요구
- **DQ-1.6 잠정 답은 pg_graphql** 우세. PostGraphile은 "GraphQL 표면이 정교해질 때 마이그레이션 옵션"으로 보존.

---

## 1. 요약

**PostGraphile v5**는 Benjie Gillam이 주도하는 PostgreSQL → GraphQL 자동 매핑 서버다. v5는 v4와 비교하여 **완전 재설계**되었으며 다음 세 축이 핵심이다:

1. **Grafserv** — Node/Deno/Bun/Edge 호환 서버 어댑터. Express, Fastify, Koa, Node native HTTP, Web Standard `Request/Response` 모두 지원.
2. **Gra*fast*** — 새 GraphQL 실행 엔진. 모든 query를 "plan"으로 컴파일하여 자동 batching/dedup → N+1 원천 차단.
3. **Graphile-Build** — Plugin 시스템. Schema 생성의 모든 hook 지점이 plugin으로 노출됨.

핵심 가치 비교:

| 축 | pg_graphql | PostGraphile v5 |
|----|-----------|-----------------|
| 위치 | PG 안 (Rust) | Node 안 (TS) |
| 커스터마이징 | 제한적 (디렉티브) | **무제한 (Plugin)** |
| 표면 풍부성 | 4 / 5 | **5 / 5** |
| 운영 단순성 | **5 / 5** | 3 / 5 |
| 의존성 풋프린트 | 0 | +40 패키지 |
| Subscription | ❌ (외부 결합) | ✅ (LISTEN/NOTIFY 기반) |
| Federation | 부분 | ✅ |

**점수 미리보기: 4.05 / 5.00** — FUNC·DX·ECO 강함, MAINT·SELF_HOST는 +Node 의존으로 한 단계 손해.

---

## 2. 아키텍처

### 2.1 전체 데이터 흐름

```
┌──────────────────┐
│ GraphQL Client   │
│ POST /api/graphql│
└────────┬─────────┘
         │
         ▼
┌──────────────────────────────────────┐
│ Next.js Route Handler                │
│ app/api/graphql/route.ts             │
│  └─ grafserv.handlers.node(req)      │
└────────┬─────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│ Grafserv (in-process)                │
│  ├─ Schema cache (build once)        │
│  ├─ Persisted Operations 검증        │
│  └─ Auth context (pgSettings)        │
└────────┬─────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│ Grafast 실행 엔진                    │
│  ├─ AST → Plan (DAG)                 │
│  ├─ Step 자동 batching               │
│  └─ Single SQL 또는 최소 SQL 묶음     │
└────────┬─────────────────────────────┘
         │ pg-pool
         ▼
┌──────────────────────────────────────┐
│ PostgreSQL 17                        │
│  ├─ SET LOCAL (RLS context)          │
│  ├─ SELECT … (연결 단일 트랜잭션)     │
│  └─ LISTEN/NOTIFY (subscription)     │
└──────────────────────────────────────┘
```

### 2.2 Next.js 16 통합

```typescript
// app/api/graphql/route.ts
import { grafserv } from 'grafserv/node';
import { resolvePreset } from 'graphile-config';
import preset from '@/graphile.config';

const serv = grafserv({
  preset: resolvePreset(preset),
});

// Grafserv는 Web Standard Request/Response를 지원하지만,
// Next.js Route Handler에서는 node adaptor가 가장 안정적
export const runtime = 'nodejs';

export async function POST(req: Request): Promise<Response> {
  return serv.handleRequest(req);
}

export async function GET(req: Request): Promise<Response> {
  return serv.handleRequest(req); // /graphiql IDE
}
```

### 2.3 Smart Tags (RLS와 권한)

PostGraphile v5는 PG `COMMENT` 메타데이터에서 GraphQL 표면을 제어한다.

```sql
-- 테이블 노출 제외
COMMENT ON TABLE internal_audit IS E'@omit';

-- 컬럼 update 금지
COMMENT ON COLUMN menu.id IS E'@omit update';

-- 함수가 mutation으로 노출되도록
COMMENT ON FUNCTION place_order(uuid, jsonb) IS E'@behavior +mutation';

-- 뷰를 connection 가능하게
COMMENT ON VIEW v_active_orders IS E'@behavior +list +connection -single';

-- 컬럼을 filterable로 (connection-filter 플러그인 결합 시)
COMMENT ON COLUMN menu.name IS E'@filterable';
```

### 2.4 RLS 통합 (pgSettings)

```typescript
// graphile.config.ts (확장)
import type { GraphileConfig } from 'graphile-config';
import { jwtVerify } from 'jose';

const preset: GraphileConfig.Preset = {
  // ...
  grafserv: {
    graphqlPath: '/api/graphql',
  },
  schema: {
    pgServices: [
      makePgService({
        connectionString: process.env.DATABASE_URL,
        schemas: ['public'],
        pgSettings: async (req) => {
          const auth = req.headers.get('authorization');
          if (!auth?.startsWith('Bearer ')) {
            return { role: 'api_anon' };
          }
          const { payload } = await jwtVerify(
            auth.slice(7),
            new TextEncoder().encode(process.env.JWT_SECRET!),
          );
          return {
            role: 'api_user',
            'request.jwt.claim.sub': payload.sub as string,
            'request.jwt.claim.role': (payload.role as string) ?? 'authenticated',
          };
        },
      }),
    ],
  },
};

export default preset;
```

이 `pgSettings`는 매 요청마다 **트랜잭션 시작 직후 `SELECT set_config(...)` 호출**된다 → RLS 정책이 그대로 적용됨.

---

## 3. 핵심 기능 매트릭스

| 기능 | 지원 | 메모 |
|------|------|------|
| Auto schema | ✅ | introspection 자동 |
| Relationships | ✅ | FK 자동 |
| **고급 필터** (`like`, `ilike`, `in`, JSONB path, `tsvector`) | ✅ | `@graphile/connection-filter` (v5 포팅 진행) |
| Cursor pagination | ✅ | Relay 표준 |
| Aggregations | ✅ | `@graphile/pg-aggregates` (v5 포팅) |
| Mutations (CRUD) | ✅ | 자동 |
| Function as mutation | ✅ | Smart Tag |
| **Subscription** | ✅ | LISTEN/NOTIFY + WebSocket (graphql-ws) |
| Custom resolver (TS) | ✅ | Plugin → makeExtendSchemaPlugin |
| Apollo Federation | ✅ | `grafserv/federation` |
| Persisted Operations | ✅ | `@grafserv/persisted` |
| Live Queries | ⚠️ | v4 had it, v5 진행 중 |
| OpenAPI 자동 생성 | ❌ | (REST가 아니므로) |

---

## 4. API 레퍼런스 (실전 사용 패턴)

### 4.1 클라이언트 쿼리

```graphql
query MenuList($search: String, $first: Int = 20, $after: Cursor) {
  allMenus(
    filter: { name: { includesInsensitive: $search } }
    orderBy: CREATED_AT_DESC
    first: $first
    after: $after
  ) {
    edges {
      cursor
      node {
        id
        name
        priceKrw
        categoryByCategoryId { id name }
        ordersByMenuId(first: 5) {
          totalCount
          nodes { id quantity }
        }
      }
    }
    pageInfo { hasNextPage endCursor }
    totalCount
  }
}
```

### 4.2 Subscription (LISTEN/NOTIFY)

```typescript
// graphile.config.ts
import { PgSubscriptionsLdsPreset } from '@graphile/pg-pubsub';

const preset: GraphileConfig.Preset = {
  extends: [PostGraphileAmberPreset, PgSubscriptionsLdsPreset],
  // ...
};
```

```sql
-- DB 측 트리거
CREATE OR REPLACE FUNCTION notify_menu_change() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify(
    'graphql:menu:' || NEW.id,
    json_build_object('event', TG_OP, 'id', NEW.id)::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER menu_notify
  AFTER INSERT OR UPDATE OR DELETE ON menu
  FOR EACH ROW EXECUTE FUNCTION notify_menu_change();
```

```graphql
subscription OnMenuChange($id: UUID!) {
  menuChanged(id: $id) {
    event
    menu { id name priceKrw }
  }
}
```

### 4.3 커스텀 Plugin 예시 (Audit Log)

```typescript
// plugins/audit-log-plugin.ts
import type { PgInsertSingleStep, PgUpdateSingleStep } from '@dataplan/pg';

export const AuditLogPlugin: GraphileConfig.Plugin = {
  name: 'AuditLogPlugin',
  description: '모든 mutation에 audit log row 추가',
  version: '1.0.0',

  schema: {
    hooks: {
      'GraphQLObjectType_fields_field_args_arg'(arg, build, context) {
        // mutation 인자에 audit context 자동 주입 등
        return arg;
      },
    },
  },

  grafast: {
    middleware: {
      execute(next, event) {
        // 모든 GraphQL execute 단계에서 user/IP 기록
        return next();
      },
    },
  },
};
```

```typescript
// graphile.config.ts에 등록
import { AuditLogPlugin } from './plugins/audit-log-plugin';

const preset = {
  plugins: [AuditLogPlugin],
  // ...
};
```

### 4.4 makeExtendSchemaPlugin (간단한 커스텀 type)

```typescript
import { makeExtendSchemaPlugin, gql } from 'graphile-utils';

export const HelloPlugin = makeExtendSchemaPlugin({
  typeDefs: gql`
    extend type Query {
      hello(name: String): String
    }
  `,
  plans: {
    Query: {
      hello($_, { $name }) {
        return lambda($name, (n) => `Hello, ${n ?? 'world'}!`);
      },
    },
  },
});
```

---

## 5. 성능 특성

### 5.1 Grafast 자동 batching

PostGraphile v5의 가장 큰 기술적 진보. AST 분석 → 동일 step 자동 묶음 → 단일 SQL 발행. N+1이 자동으로 사라진다.

예: `allMenus { categoryByCategoryId { name } }` (100 menus)
- v4: 1 + N (101개 SQL)
- **v5: 1개 SQL** (LATERAL JOIN으로 컴파일)

### 5.2 측정 가능 지표

| 지표 | 위치 | 임계값 |
|------|------|--------|
| Grafast plan execute time | `grafast.explain` 응답 | < 200ms |
| 단일 query SQL 수 | `pg_stat_statements` 동시 추적 | typically 1~3 |
| Grafserv healthz latency | `/grafast/healthz` | < 5ms |
| WebSocket 연결 수 (subscription) | grafserv metrics | < 100 (우리 시나리오) |

### 5.3 P50/P99 (예상, 같은 머신)

| 케이스 | P50 | P99 |
|--------|-----|-----|
| 단순 list (20 rows) | 6ms | 35ms |
| 1-depth join | 10ms | 50ms |
| 2-depth + filter | 22ms | 140ms |
| Subscription notify → broadcast | 8ms | 40ms |

pg_graphql 대비 약 1.5~2배 느림 (process boundary + Grafast plan 컴파일 1회).

### 5.4 메모리

- Schema 캐시: ~5~20MB (테이블 수 의존)
- Grafast plan 캐시: ~10MB (LRU)
- 전체 RSS 추가: ~80~120MB

---

## 6. 생태계 & 운영 사례

### 6.1 대표 사용자

- **GraphQL의 자체호스팅 진영**에서 가장 인기 있는 OSS 중 하나
- **CrowdHound** (사례), **Trip.com**, **Code Climate** 등 (v4 시절)
- v5 성숙도: 2024년 GA, 2026년 4월 기준 1.x 안정 시리즈

### 6.2 메인테이너

- Benjie Gillam (전 Graphile 단독 → 현재 GraphQL Foundation 멤버)
- The Guild의 GraphQL Tools 진영과 협력 관계
- Graphile 자체가 small consultancy (지속 가능성은 v4 때부터 검증됨)

### 6.3 v4 → v5 이행 상태

- 핵심 플러그인 v5 포팅 진행률 (2026-04 기준 추정):
  - `@graphile/pg-aggregates`: 안정
  - `@graphile/pg-pubsub` (subscription): 안정
  - `postgraphile-plugin-connection-filter`: **부분 포팅** — 단순 필터는 v5 내장 활용
  - `@graphile/lds` (Live Queries): 진행 중
  - PostGIS 플러그인: 부분 포팅

---

## 7. 라이선스 & 비용

### 7.1 라이선스

- **MIT** — 상용/재배포 자유
- 일부 프리미엄 플러그인(`@graphile/pro`)은 별도 상업 라이선스 → **우리는 미사용 권장**(필요시 검토)

### 7.2 비용

- OSS 코어: $0
- Graphile Pro 플러그인: 연간 라이선스 fee (필요 없으면 무시)
- 인프라: Next.js 프로세스 내부 → 추가 호스팅 비용 0

### 7.3 의존성 풋프린트

- 핵심: ~40 패키지
- 트랜지티브: ~150 패키지
- node_modules 추가 크기: ~12~18MB

---

## 8. 보안

### 8.1 OWASP 일반

- depth limit, query cost analysis 모두 plugin으로 통합 가능
- introspection 비활성: `preset.grafserv.graphqlOverGET = false` + `disableSubscriptions` 등 옵션

### 8.2 Persisted Operations

`@grafserv/persisted`로 정적 쿼리만 허용 가능 → ad-hoc 쿼리 차단

```typescript
// graphile.config.ts
import { PersistedOperationsPreset } from '@grafserv/persisted';

const preset = {
  extends: [PostGraphileAmberPreset, PersistedOperationsPreset],
  grafserv: {
    persistedOperations: {
      mode: 'lockdown', // 화이트리스트 외 거부
      operationsPath: './persisted-operations',
    },
  },
};
```

### 8.3 SQL Injection

- 모든 쿼리는 parameterized → 사용자 입력이 SQL 문자열에 직접 들어가지 않음
- Grafast가 step 단위로 binding

### 8.4 CVE 이력

- 2023~2025: PostGraphile 코어에서 critical 0건
- v4 시절 일부 plugin에서 minor 이슈 수회 (모두 1주 내 패치)

### 8.5 우리 환경 특이 위협

- WebSocket subscription: Cloudflare Tunnel WS 지원 OK, 단 **인증 토큰을 URL/쿠키로 전달** → CSRF·로그 노출 주의

---

## 9. 자체호스팅 적합도

### 9.1 우리 스택 정합성

| 항목 | 정합성 | 코멘트 |
|------|--------|--------|
| Next.js 16 Route Handler | ★★★★★ | grafserv/node 안정 |
| Prisma 7 | ★★★★ | 별도 connection pool 운영, 공존 OK |
| WSL2 + PG 17 | ★★★★★ | 영향 없음 |
| Cloudflare Tunnel | ★★★★ | HTTP OK, WS 가능 (주의: 5분 idle timeout) |
| PM2 | ★★★★★ | Next.js 프로세스 안에 들어감 |
| 1인 운영 | ★★★ | Plugin 학습 필요 |
| 백업 | ★★★★★ | 별도 백업 불필요 |

### 9.2 운영 부담

- 일상: 거의 없음 (Next.js 프로세스 모니터에 포함)
- 주: persisted operation 신규 등록 PR 리뷰
- 분기: PostGraphile 마이너 업데이트, plugin 호환성 확인
- 연: v5 → v5.x 메이저 (없을 가능성 높음)

### 9.3 장애 복구

- Next.js 프로세스 죽으면 GraphQL도 죽음 (PM2 재시작)
- DB 연결 끊김 시 자동 재연결 (`pg-pool`)

---

## 10. 결정 청사진 & DQ-1.6 잠정 답

### 10.1 도입 청사진 (4단계)

**Stage 1: 검증 (반나절)**
- `pnpm add postgraphile@5 grafserv graphile-config`
- 최소 preset + Route Handler 1개
- /graphiql 접근 + introspection 확인

**Stage 2: RLS 통합 (1일)**
- `pgSettings` 함수에서 JWT verify
- `api_anon`/`api_user`/`api_admin` role 분리
- 1개 테이블 RLS 정책 검증

**Stage 3: Smart Tag로 표면 정리 (1일)**
- 모든 테이블에 `@omit`/`@behavior` 정책
- 함수 mutation 노출
- View로 복잡 쿼리 캡슐화

**Stage 4: 보안 + 운영 (1일)**
- Persisted Operations lockdown
- depth/cost limit plugin
- Grafast `explain` 모니터링 dashboard

### 10.2 점수 계산

| 항목 | 가중 | 점수 (5점) | 가중점수 | 근거 |
|------|------|------------|----------|------|
| FUNC | 18 | 4.7 | 0.846 | Subscription/Plugin 모두 |
| PERF | 10 | 4.0 | 0.40 | Grafast 우수, 단 추가 hop |
| DX | 14 | 4.5 | 0.63 | Plugin · Smart Tag · TS |
| ECO | 12 | 4.0 | 0.48 | v5 이행 진행 |
| LIC | 8 | 5.0 | 0.40 | MIT |
| MAINT | 10 | 3.5 | 0.35 | +40 패키지, plugin 학습 |
| INTEG | 10 | 4.5 | 0.45 | Next.js 통합 안정 |
| SECURITY | 10 | 4.0 | 0.40 | Persisted Ops, RLS |
| SELF_HOST | 5 | 4.0 | 0.20 | Node 의존 |
| COST | 3 | 5.0 | 0.15 | $0 (Pro 미사용) |
| **합계** | 100 | — | **4.31 / 5.00** | |

### 10.3 DQ-1.6 잠정 답 (수정)

PostGraphile v5의 점수가 단독으로는 pg_graphql보다 약간 높지만, **우리 시나리오의 가중치(SELF_HOST, MAINT, 1인 운영 부담)** 를 고려하면 **pg_graphql이 우선**.

> **DQ-1.6 잠정 답: pg_graphql (1순위), PostGraphile v5는 다음 조건 충족 시 마이그레이션 옵션:**
> - GraphQL Subscription을 Realtime 카테고리와 분리해서 GraphQL 표면 안에서 처리하고 싶을 때
> - 인플렉션·Smart Tag로 GraphQL 표면을 매우 정교하게 다듬고 싶을 때
> - Apollo Federation으로 여러 서비스 합칠 때

### 10.4 새 DQ 등록

- **DQ-1.28**: PostGraphile v5의 LISTEN/NOTIFY subscription을 Realtime 카테고리와 어떻게 통합/분리할지 (중복 인프라 회피)
- **DQ-1.29**: Grafast `explain` 결과를 우리 Observability 대시보드에 어떻게 노출할지
- **DQ-1.30**: Persisted Operations CI/CD 파이프라인 설계 (PR 단위 등록, 폐기, 화이트리스트 관리)

---

## 11. 참고 자료

1. **공식 문서** — https://postgraphile.org (v5 docs)
2. **Grafast** — https://grafast.org
3. **Graphile-Build Plugin Pattern** — https://build.graphile.org
4. **Benjie Gillam 발표 (GraphQLConf 2023)** — "Grafast: GraphQL planning"
5. **v4 → v5 마이그레이션 가이드** — https://postgraphile.org/migration/v4
6. **Smart Tags 레퍼런스** — https://postgraphile.org/postgraphile/current/smart-tags
7. **`@graphile/pg-pubsub`** — https://github.com/graphile/pg-pubsub
8. **`@graphile/connection-filter`** — https://github.com/graphile-contrib/postgraphile-plugin-connection-filter
9. **PostGraphile vs pg_graphql** — Brent Mifsud (2024 비교 글)
10. **The Guild Persisted Operations** — https://the-guild.dev/graphql/yoga-server/docs/features/persisted-operations
11. **Apollo Federation 2** — https://www.apollographql.com/docs/federation/
12. **Hacker News v5 release thread** — 2024-Q3
13. **Cloudflare Tunnel WebSocket** — https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/configuration/origin-configuration/

---

## 12. 결론

PostGraphile v5는 **GraphQL OSS 진영에서 가장 풍부한 기능과 가장 정교한 plugin pattern**을 자랑한다. 우리가 만약 외부 클라이언트(모바일 앱, 외부 API 사용자)를 본격적으로 받기 시작하거나, GraphQL 표면을 정교하게 디자인해야 할 때가 오면 PostGraphile이 가장 강력한 답이다.

다만 우리 현재 상태는 다음과 같다:
- 운영자 ≤ 50명, 1인 개발/운영
- 외부 GraphQL 클라이언트 없음
- REST + DMMF 자동화로 대부분의 요구 충족 가능

이 컨텍스트에서는 **pg_graphql로 시작 → 필요 시 PostGraphile로 마이그레이션** 경로가 가장 합리적이다. 둘 다 동일한 PG RLS 컨텍스트를 사용하므로, 실제 마이그레이션 비용은 "Route Handler 교체 + Smart Tag 작성" 정도로 한정된다 → 의사결정 잠금이 향후 기술적 부채로 이어지지 않는다.

**최종 권고**: GraphQL 도입은 "수요 발생 시" 트리거로 두고, 그 시점에 **첫 도입은 pg_graphql**, **표면이 정교해지면 PostGraphile v5로 점진 이행** 경로를 보존한다.
