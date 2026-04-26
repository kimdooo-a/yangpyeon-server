# ADR-023 — Tenant 데이터 격리 모델

> 상태: **ACCEPTED (2026-04-26, 옵션 B로 변경)**
> 작성: 2026-04-26 (BaaS Foundation Sub-agent #3)
> 상위 ADR: ADR-001 (single-tenant 결정, supersede 대상의 일부)
> 자매 ADR: ADR-022 (1인-N프로젝트 BaaS 정체성), ADR-024 (Plugin/코드 격리), ADR-025 (인스턴스 모델), ADR-026 (Tenant Manifest)
> 관련 Wave: Wave 1-5 (특히 Storage = SeaweedFS, Realtime = wal2json — **변경 금지**)
> 관련 Spike: SP-013 (wal2json), SP-016 (SeaweedFS) — Pending. 본 ADR은 두 결정과 호환되는 격리만 제시한다.

---

## 0. 한 줄 요약

PostgreSQL 단일 인스턴스 위에서 1인 운영자가 N=10~20 컨슈머(프로젝트)를 호스팅할 때, **schema-per-tenant** / **shared-schema + RLS** / **DB-per-tenant** 중 어느 격리 모델을 채택할지를 결정한다. 본 문서는 3안을 깊이 비교하고 사용자 결정을 기다린다.

---

## 1. 컨텍스트

### 1.1 트리거

ADR-001이 명시적으로 "Multi-tenancy 미지원"으로 결정하면서 4가지 재검토 트리거를 정의했다 (`docs/research/2026-04-supabase-parity/00-vision/09-multi-tenancy-decision.md`). 그 중 두 가지가 발동:
1. 사용자 2명+ 6개월 이상 지속 ✅ (10~20개 프로젝트 영구 운영)
2. "독립 팀/조직 관리" FR 신규 추가 ✅

→ ADR-001을 ADR-022가 supersede. 본 ADR-023은 그 첫 번째 하위 결정 (데이터 계층).

### 1.2 운영 전제 (변경 불가)

| 전제 | 출처 | 비고 |
|------|------|------|
| 단일 PostgreSQL 17 인스턴스 | ADR-001 §3.1.3, AP-1 | DB instance를 N개로 늘리는 것은 1인 운영 가능성 위배 |
| 단일 WSL2 노드 | AP-1 (00-system-overview §1.2) | Kubernetes/멀티노드 거부 |
| 단일 Next.js 앱 | AP-4 | 단일 `package.json` |
| Prisma 7 ORM | 02-data-model-erd §1.1 | DB 접근의 단일 진실 소스. raw SQL은 예외 (PG pool 직접) |
| SeaweedFS (Storage) | Wave 1, ADR-008 | **변경 금지** — 본 ADR이 다루는 격리는 PG 한정 |
| wal2json (Realtime CDC) | ADR-010, SP-013 | **변경 금지** — replication slot 모델 종속 |
| 월 운영비 ≤ $10 | AP-5 | DB instance N배 = ASM-8 위배 |

### 1.3 현재 코드의 단일테넌트 가정 요약

(`00-context/02-current-code-audit.md` 인용)
- 모든 PG 모델(11개)에 `tenant_id` 컬럼 부재
- 모든 SQLite 테이블(audit, metrics 등)도 동일
- ownerId/userId 만으로 사용자 수준 분리. 조직(테넌트) 계층 부재
- JWT payload에 `tenant`/`aud` 클레임 없음
- ApiKey/Session/JwksKey 모두 글로벌
- Cron registry는 `globalThis` 싱글톤
- ALLOWED_FETCH_HOSTS 등 정책이 전역 상수

### 1.4 결정해야 할 질문

> "1 PostgreSQL instance 위에서 N=10~20 tenant의 데이터를 어떻게 분리할 것인가?"

부속 질문:
- Q1. 격리 강도를 얼마나 가져갈 것인가? (cross-tenant 유출 최소화 vs 운영 단순성)
- Q2. Prisma의 강점(타입 안전, 마이그레이션)을 얼마나 보존할 것인가?
- Q3. 컨슈머 1개를 백업/복원/제거할 때 다른 컨슈머에 영향이 없어야 하는가?
- Q4. noisy neighbor (한 컨슈머의 거대 쿼리가 옆 컨슈머에 미치는 영향)를 어떻게 다룰 것인가?
- Q5. 마이그레이션 (스키마 변경) 시 N개 모두에 자동 적용되는가, manifest 기반인가?

---

## 2. 옵션 A — Schema-per-tenant

### 2.1 모델

```
PostgreSQL: ypbaas (단일 cluster, 단일 database)
├── public                 ← 시스템 전역 (tenants 레지스트리, jwks_keys, vault, …)
├── tenant_almanac         ← 컨슈머 1
│   ├── users
│   ├── folders
│   ├── files
│   ├── sql_queries
│   ├── edge_functions
│   └── …
├── tenant_foo             ← 컨슈머 2 (스키마 동일 구조)
├── tenant_bar             ← 컨슈머 3
└── … (N=20)
```

원칙:
- 시스템 전역 (전사 공통: tenant 레지스트리, JWKS, vault, IdP) → `public`
- 컨슈머별 비즈니스 데이터 → `tenant_<slug>`
- 모든 `tenant_*` 스키마는 **동일한 DDL 구조**

### 2.2 격리 메커니즘

#### 2.2.1 런타임 라우팅 (3가지 후보)

**옵션 A-1: PrismaClient per tenant (캐시 풀링)**

```typescript
// src/lib/db/prisma-pool.ts
const clients = new Map<string, PrismaClient>();

export function getPrismaForTenant(slug: string): PrismaClient {
  let client = clients.get(slug);
  if (!client) {
    client = new PrismaClient({
      datasources: { db: { url: `${BASE_URL}?schema=tenant_${slug}` } }
    });
    clients.set(slug, client);
  }
  return client;
}
```

- **문제**: PrismaClient 1개 = pool 1개 (기본 connection_limit ≈ num_cpus * 2 + 1).
  N=20 컨슈머 × pool 10 = **PG max_connections 200 압박**.
- **해결**: `connection_limit=2` 강제 + PgBouncer transaction-pooling 전치.
- **메모리**: 각 PrismaClient ≈ 50MB heap. 20 × 50MB = 1GB 추가.
- **장점**: Prisma 타입 시스템 100% 보존. middleware 불필요.
- **단점**: 신규 tenant 추가 시 PrismaClient 인스턴스화 cold start (~300ms).

**옵션 A-2: Raw SQL `SET search_path` (단일 PrismaClient)**

```typescript
const prisma = new PrismaClient(); // 단일 인스턴스
async function withTenant<T>(slug: string, fn: () => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL search_path = "tenant_${slug}", public`);
    // 주의: tx 내부에서만 search_path 유효. tx 종료 시 자동 reset.
    return fn();  // ⚠ tx 안에서 prisma.* 호출은 그대로 search_path 적용
  });
}
```

- **함정 1**: Prisma는 `@@map` / `@@schema`를 컴파일 시점에 결정한다. 즉, 모델에 `@@schema("tenant_almanac")`을 박아두면 search_path와 충돌. → `@@schema` **사용 금지**, 모델 정의는 schema 미지정 (public 가정) + 런타임 search_path 우회.
- **함정 2**: Prisma는 prepared statement에 schema를 fully-qualify할 수 있다 (드라이버 동작). search_path가 무시되는 케이스 다수 보고 (issue #12420).
- **함정 3**: 트랜잭션 외부 쿼리 (`prisma.user.findMany()`)는 search_path 미적용 — connection을 다른 요청이 쓰면 leak.
- **현실**: Prisma 6에서 안전하게 작동한다는 **공식 문서 없음**. raw `$queryRaw` 위주로 써야 함 → Prisma 가치 50% 상실.

**옵션 A-3: 모델 복제 (multiSchema 정공법)**

```prisma
generator client {
  previewFeatures = ["multiSchema"]
}
datasource db {
  provider = "postgresql"
  schemas  = ["public", "tenant_almanac", "tenant_foo", "tenant_bar"]
}

model TenantAlmanacUser {
  id    String @id
  email String @unique
  @@map("users")
  @@schema("tenant_almanac")
}
model TenantFooUser {
  id    String @id
  email String @unique
  @@map("users")
  @@schema("tenant_foo")
}
// … N=20 × 11 모델 = 220 model 정의
```

- **결정타**: prisma/prisma#24794 ("One model to multiple database schemas for multi-tenancy") 미해결. multiSchema는 "**정적**으로 알려진 schema 집합의 모델을 한 client에 통합"만 지원.
- 신규 tenant 추가 = schema.prisma 수정 + `prisma generate` + 재배포. 동적이지 않음.
- N=20일 때 schema.prisma 수만 줄. 유지 불가.

#### 2.2.2 권장 라우팅 조합 (옵션 A 채택 시)

| 사용 사례 | 라우팅 | 근거 |
|----------|--------|------|
| Prisma 타입 안전 query (95% 케이스) | A-1 (PrismaClient per tenant + PgBouncer) | 안전, 검증 가능 |
| SQL Editor / runReadonly | A-2 (search_path SET LOCAL in tx) | 사용자 임의 SQL이라 PrismaClient 무용 |
| 마이그레이션 | runner script (§2.4) | 어차피 raw SQL |

### 2.3 백업/복원

```bash
# 단일 tenant 덤프
pg_dump -h localhost -U postgres ypbaas \
  --schema=tenant_almanac \
  --schema=public \
  -F c -f almanac-2026-04-26.dump

# 단일 tenant 복원 (다른 클러스터, 다른 schema 명으로도 가능)
pg_restore -d ypbaas_staging --schema=tenant_almanac almanac-2026-04-26.dump
```

- ✅ **컨슈머 단위 백업/복원**: tenant 1개만 복원 가능 (다른 컨슈머 영향 0)
- wal-g (PITR)은 클러스터 단위 → tenant 1개만 PITR은 불가 (논리 dump로만 복원)
- 보존 정책 차등 가능: tenant_a는 7일, tenant_b는 30일

### 2.4 마이그레이션 전략

```
prisma/schema.prisma         ← 기준 schema (단일 정의)
├── prisma/migrations/
│   ├── 20260426_init/
│   │   └── migration.sql    ← search_path 미지정. CREATE TABLE users (…)
│   └── 20260427_add_x/

src/lib/db/migration-runner.ts
└── for each tenant in tenants_registry:
      execute migration.sql with `SET search_path = tenant_<slug>`
```

- **장점**: schema 정의 1개 + N개 적용
- **단점**:
  - 신규 tenant 등록 시 모든 과거 마이그레이션 순차 실행 (~수 초)
  - 일부 tenant 실패 → 부분 적용 상태 → manifest로 tenant별 migration_version 추적 필요 (ADR-026과 연계)
  - Prisma `prisma migrate dev`는 단일 schema 가정 → 자체 runner 필요

### 2.5 GRANT/권한 분리

```sql
CREATE ROLE tenant_almanac_app LOGIN PASSWORD '…';
GRANT USAGE ON SCHEMA tenant_almanac TO tenant_almanac_app;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA tenant_almanac
  TO tenant_almanac_app;

-- public.tenants 등 시스템 테이블은 별도 ROLE
```

- 컨슈머별 Postgres role 분리 가능 → app 레벨 버그가 cross-tenant에 도달하지 못함 (DB-level safety net)
- 1인 운영자는 superuser로 접근

### 2.6 장점 요약
- 격리 강도 **강** (잘못된 쿼리도 다른 schema 침범 불가, role 분리 시 더 강함)
- 백업/복원/제거가 컨슈머 단위로 가능 (운영 친화)
- 백업 dump 파일 자체가 자연스러운 "내보내기" 산출물
- noisy neighbor 영향: WAL/CPU는 공유, **lock contention은 schema 분리로 약간 감소**
- migration 실행 N번이지만 manifest 기반 runner로 통제 가능

### 2.7 단점 요약 (정직)
- **Prisma 사용 매우 까다로움**: 위 §2.2.2 조합 필요. 어느 후보도 "Prisma 공식 권장"이 아님.
- 신규 tenant 등록 = schema CREATE + 모든 과거 migration 적용 + PrismaClient 인스턴스화. 자동화 스크립트 필수 (= ADR-026 manifest와 결합 강제)
- DB max_connections 압박: PrismaClient pool 곱하기 N → PgBouncer 필수 (인프라 1개 추가, AP-1 부담 +α)
- PostgreSQL `pg_dump --schema` 사용 시 cross-schema FK가 있으면 dump 실패 → public.tenants↔tenant_*.users FK 설계 신중히
- statement_timeout, work_mem, lock 등 GUC는 클러스터/role 단위만. tenant별 정책 한계 (role 분리 시 부분 해결)

---

## 3. 옵션 B — Shared schema + RLS (Supabase 방식)

### 3.1 모델

```
PostgreSQL: ypbaas (단일 cluster, 단일 database, 단일 schema "public")
└── public
    ├── tenants               (id, slug, name, …)
    ├── users                 (id, tenant_id, email, …)   ← 모든 row에 tenant_id
    ├── folders               (id, tenant_id, …)
    ├── files                 (id, tenant_id, …)
    ├── sql_queries           (id, tenant_id, …)
    ├── edge_functions        (id, tenant_id, …)
    └── … (모든 비즈니스 테이블에 tenant_id 컬럼 추가)
```

### 3.2 격리 메커니즘

#### 3.2.1 RLS 정책

```sql
-- 모든 비즈니스 테이블에 일괄 적용
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;  -- superuser 외 우회 불가

CREATE POLICY tenant_isolation ON users
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);
```

#### 3.2.2 매 요청 SET LOCAL

```typescript
// src/lib/api-guard.ts (확장)
export async function withTenantTx<T>(
  tenantId: string,
  fn: (tx: PrismaClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SET LOCAL app.tenant_id = '${tenantId}'`
    );
    return fn(tx as unknown as PrismaClient);
  });
}
```

- 트랜잭션 종료 시 GUC 자동 reset (connection 재사용 안전)
- 트랜잭션 외부 query (`prisma.user.findMany()`)는 GUC 미설정 → RLS가 모든 row 차단 또는 통과 (USING 정책에 따라)
- **함정**: 깜박하고 `withTenantTx` 안 감싸면 → app.tenant_id 미설정 → `current_setting('app.tenant_id', true)` NULL → 정책에 따라 0건 반환 또는 모든 row 노출

#### 3.2.3 Prisma 친화 패턴

옵션 B-1: Prisma Client Extensions (5.x+)

```typescript
const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ args, query, model }) {
        const tenantId = getCurrentTenantContext();
        if (!tenantId) throw new Error("Tenant context missing");
        // tenant_id를 자동 주입
        if (args.where) args.where = { ...args.where, tenantId };
        if (args.data) args.data = { ...args.data, tenantId };
        return query(args);
      }
    }
  }
});
```

- Prisma의 [Multi-tenant 가이드](https://www.prisma.io/docs/orm/prisma-client/client-extensions/middleware/use-cases-and-best-practices) 패턴
- `current_setting('app.current_company_id')`을 컬럼 default로 활용하는 dbgenerated 패턴도 지원

옵션 B-2: 모델에 default dbgenerated

```prisma
model User {
  id        String @id @default(uuid())
  tenantId  String @default(dbgenerated("(current_setting('app.tenant_id'))::uuid")) @map("tenant_id") @db.Uuid
  email     String
  …
  @@unique([tenantId, email])  // 글로벌 unique → tenant scoped unique
}
```

- INSERT 시 자동으로 현재 GUC의 tenant_id 채움
- 기존 `email @unique`는 `(tenant_id, email) @unique`로 변경 필수

### 3.3 인덱싱

```sql
-- 모든 자주 조회 인덱스에 tenant_id를 leading column으로
CREATE INDEX idx_users_tenant_email ON users(tenant_id, email);
CREATE INDEX idx_files_tenant_folder ON files(tenant_id, folder_id);
CREATE INDEX idx_sessions_tenant_user_exp ON sessions(tenant_id, user_id, expires_at);
```

- 기존 `(user_id, revoked_at, expires_at)` 인덱스는 `(tenant_id, user_id, revoked_at, expires_at)`로 재설계 (이미 `01-existing-decisions-audit.md` §2에서 언급)
- query plan에서 partition pruning 효과 (tenant_id 카디널리티 = N=20)

### 3.4 백업/복원

- `pg_dump` 기본은 클러스터 전체 → tenant 1개 dump 불가
- 우회: `pg_dump --where='tenant_id = ...'` 미지원 (table 단위 WHERE 필요)
- 대안 1: `COPY (SELECT * FROM users WHERE tenant_id = $1) TO STDOUT` 11개 테이블 × 수동 — 운영 부담 큼
- 대안 2: 자체 export 스크립트 (Prisma + JSON dump)
- ❌ **컨슈머 단위 PITR 불가**

### 3.5 마이그레이션 전략

- 단일 schema → 표준 `prisma migrate deploy` 그대로 사용
- 신규 tenant 등록 = `INSERT INTO tenants(...)` 1줄 + 첫 사용자 생성
- 기존 데이터 백필 시 모든 row에 tenant_id 추가 (다운타임 또는 deferred constraint)

### 3.6 장점 요약
- **Prisma 자연스러움** (Client Extensions, dbgenerated 모두 공식 지원)
- 마이그레이션 단순 (`prisma migrate deploy` 1회)
- 신규 tenant 등록 ms 단위
- query plan 최적화 좋음 (단일 schema 통계, planner 친화)
- Supabase의 검증된 패턴 (10만+ 프로덕션 사례)
- DB max_connections 압박 없음 (PrismaClient 1개)

### 3.7 단점 요약 (정직)
- **RLS 정책 검증 어려움**: USING/WITH CHECK 잘못 작성 시 데이터 유출. `pg_policies` 일일 점검 + 자동화 테스트 필수.
- **app code bug 시 cross-tenant 유출**: `withTenantTx` 안 감싸면 즉시 사고. 모든 핸들러 lint rule + e2e 테스트로 강제해야 함.
- **superuser 우회 가능**: `BYPASSRLS` 권한 보유 role 사용 시 정책 무시 → 마이그레이션 runner의 권한 분리 신중.
- **백업/복원 어려움**: 컨슈머 1개 export = 자체 도구 필요. 자연스러운 "내보내기" 미존재.
- **Noisy neighbor 그대로**: 단일 GUC, 단일 statement_timeout, 단일 work_mem. 한 컨슈머의 거대 query가 옆 컨슈머에 직접 영향.
- **GDPR right-to-be-forgotten**: 컨슈머 1개 완전 삭제 시 모든 테이블 × N rows DELETE. CASCADE FK 신중 설계.
- 인덱스 재설계 (모든 인덱스 leading=tenant_id) → 마이그레이션 무거움

---

## 4. 옵션 C — DB-per-tenant

### 4.1 모델

```
PostgreSQL cluster (단일 process)
├── ypbaas_system            ← 시스템 (tenants, jwks, vault)
├── ypbaas_almanac           ← 컨슈머 1 (DB 1개)
├── ypbaas_foo               ← 컨슈머 2 (DB 1개)
├── ypbaas_bar               ← 컨슈머 3
└── … (N=20개 database)
```

### 4.2 격리

- Database 단위 = 완전한 catalog 분리. cross-DB query 불가 (FDW 제외).
- PrismaClient N개 (각 DB 별 connection string)
- max_connections 압박 가장 큼 (각 DB의 pool × N)

### 4.3 백업/복원

- ✅ `pg_dump <db_name>` per database. 가장 자연스러움.
- wal-g도 클러스터 전체이지만 dump+restore 시나리오 깔끔

### 4.4 장점
- 격리 매우 강 (catalog 분리)
- GRANT/role 분리 자연스러움
- 백업/복원 가장 깔끔
- statement_timeout 등 일부 GUC를 ALTER DATABASE로 분리 가능

### 4.5 단점 (이게 결정타)
- **운영 부담 N배**:
  - 마이그레이션 N번 (옵션 A와 동등)
  - 모니터링 N개 DB
  - PrismaClient 인스턴스 N개 + connection pool N배
- **cross-tenant join 영구 불가** (시스템-tenant 관계도 FDW 필요)
- **신규 tenant 등록 = CREATE DATABASE + extension 설치 + role 생성 + …** (수십 초)
- 1인 운영 한계 도달

---

## 5. 옵션 D — Hybrid (RLS 기본 + 큰 데이터만 schema 분리)

### 5.1 모델

```
public                  ← 시스템 + 빈도 높은 작은 테이블 (RLS)
├── tenants
├── users (tenant_id, RLS)
├── sessions (tenant_id, RLS)
├── api_keys (tenant_id, RLS)
└── audit_logs (tenant_id, RLS)

tenant_almanac_data     ← 컨슈머별 큰 테이블만 분리
├── files
├── folders
├── edge_function_runs
└── webhook_deliveries
```

### 5.2 평가
- 두 모델의 함정을 모두 떠안음 (RLS 누락 + schema 라우팅 누락)
- "적절히" 어느 테이블이 큰지 사전 판단 필요 → 잘못 분류 시 이전 비용 큼
- 신규 컨슈머 등록도 양쪽 다 트리거
- ❌ **권장하지 않음** (복잡도 ROI 낮음)

---

## 6. 비교 매트릭스

### 6.1 차원별 비교

| 차원 | A schema-per-tenant | B shared+RLS | C DB-per-tenant | D hybrid |
|------|---------------------|--------------|-----------------|----------|
| 격리 강도 | 강 | 중 | 매우 강 | 중 |
| Prisma 호환성 | 약 (pool N개 + raw SQL) | 강 (Extensions, dbgenerated) | 약 (pool N개 + 라우팅) | 약 (양쪽 다) |
| 마이그레이션 복잡도 | 중 (runner + manifest) | 약 (`migrate deploy`) | 강 (runner × N DB) | 강 |
| 신규 tenant 등록 비용 | 수 초 (schema + 과거 migration) | ms (INSERT) | 수십 초 (CREATE DATABASE) | 수 초 |
| 백업 단위 | 좋음 (`pg_dump --schema`) | 어려움 (커스텀 dump) | 매우 좋음 (`pg_dump <db>`) | 어려움 |
| Cross-tenant 유출 위험 | 매우 낮음 (DB 정책 + role) | 중 (RLS 정책 버그 시) | 매우 낮음 | 중 |
| Noisy neighbor 격리 | 약간 (lock 일부 분리) | 없음 | 약간 (DB-level GUC) | 없음 |
| max_connections 압박 | 강 (PgBouncer 필수) | 약 (단일 pool) | 매우 강 | 강 |
| 1인 운영 적합 | △ (운영 자동화 필수) | ✅ | ❌ | ❌ |
| N=20 운영 부담 | 중 | 저 | 고 | 고 |
| Wave 호환성 (SeaweedFS / wal2json) | ✅ (§7) | ✅ (§7) | △ (§7) | △ |
| Supabase parity | △ | ✅ (정확히 같은 방식) | ❌ | △ |
| 코드 변경량 | 중 (라우팅 계층 + manifest) | 매우 큼 (모든 모델 + 인덱스 + 핸들러) | 매우 큼 | 매우 큼 |

### 6.2 NFR 영향

| NFR | A | B | C |
|-----|---|---|---|
| NFR-COST.1 (월 $10) | OK (PgBouncer 메모리만) | OK | NG (메모리 N배, 스왑 위험) |
| NFR-PERF.1 (p95 200ms) | OK | OK | OK |
| NFR-SEC.4 (cross-tenant 0건) | 강 (DB 강제) | 중 (코드 강제) | 매우 강 |
| NFR-MNT.1 (1인 운영) | △ | ✅ | ❌ |
| NFR-DAT.1 (PITR 30일) | 클러스터만 | 클러스터만 | DB별 가능 |

---

## 7. Wave 1-5 산출물과의 호환성

| Spike/결정 | 옵션 A | 옵션 B | 옵션 C |
|----------|--------|--------|--------|
| **SP-013 wal2json (Realtime CDC)** | replication slot은 클러스터 전체 → wal2json 출력에 schema 정보 포함 → consumer가 schema → tenant 매핑 필요. 1 슬롯 + 모든 tenant CDC. | row의 `tenant_id` 컬럼이 그대로 출력 → consumer 자동 라우팅 가장 단순. | DB별 슬롯 N개 → `max_replication_slots = 10` 한도 위협 (N=20 시 한도 초과). |
| **SP-016 SeaweedFS (Storage)** | files 테이블의 path를 `/<tenant_slug>/<file_id>` prefix로 저장. SeaweedFS는 단일 인스턴스 유지. 본 ADR과 직교. | 동일 (path prefix만 변경). | 동일. |
| **SP-014 JWKS cache** | jwks_keys는 `public` (시스템 schema)에 보관. 단일 키셋 + tenant claim으로 식별. | 동일. | 시스템 DB 분리. cross-DB query 부재. |
| **SP-015 Session 인덱스** | Session 테이블이 schema 분리 → `(user_id, …)` 그대로 유효. SP-015 결과 변경 없음. | `(tenant_id, user_id, revoked_at, expires_at)`로 재설계 필요. SP-015 재실측 권장. | 옵션 A와 동등. |
| **PM2 cluster:4 (SP-010)** | advisory lock key를 `<tenant>:<job>` 형식으로 변경 (ADR-028). | 동일. | 동일. |
| **SeaweedFS 결정** | **변경 없음** (본 ADR이 다루는 것은 PG만). 본 ADR 어떤 옵션이든 SeaweedFS 결정 보존. | 동일. | 동일. |

→ **세 옵션 모두 Wave 1-5 결정과 충돌 없음**. 단, 옵션 C는 wal2json `max_replication_slots` 한도 충돌 위험.

---

## 8. 비결정 사항 (양쪽 결정 후 추가 ADR 필요)

| 항목 | 옵션 A 채택 시 | 옵션 B 채택 시 |
|------|---------------|---------------|
| Tenant 식별 방법 | subdomain / path / JWT claim 중 → ADR-027 | 동일 |
| Tenant 등록 자동화 | manifest + migration runner → ADR-026 | manifest만 (migration runner 불필요) |
| Cron worker isolation | 테넌트별 schema에 cron 정의 → registry per schema | tenant_id 차원 추가 (ADR-028) |
| Audit log | tenant schema에 audit_logs 분산 또는 public 통합 | 단일 audit_logs + tenant_id (ADR-029) |
| Connection pooling | **PgBouncer 강제** (transaction-mode) | optional |
| `BYPASSRLS` 권한 운영 | N/A | 마이그레이션 role만 보유, app role 차단 |

---

## 9. 권고 (저자 의견)

**저자(이 sub-agent)의 의견: 옵션 A (Schema-per-tenant) 우선 채택을 권한다. 단, 결정은 사용자.**

이유 4가지:

1. **격리 강도가 1인 운영에 더 친화적이다.** 1인 운영자는 모든 코드를 직접 작성·검토하지 못한다. RLS 정책의 USING/WITH CHECK 버그는 코드 리뷰만으로 잡기 어렵고, 한 번 누출되면 회복 불가능하다. Schema 분리는 DB가 강제하므로 app bug에 대한 안전망이 한 겹 더 있다.

2. **백업/복원/내보내기가 자연스러운 운영 산출물이다.** N=20 컨슈머 환경에서 "컨슈머 1개만 내보내달라" / "컨슈머 1개를 어제 시점으로 복원해달라" 요구는 빈번하다. `pg_dump --schema=tenant_X`는 1줄. RLS 옵션은 자체 도구 + 11개 테이블 × WHERE COPY를 짜야 한다.

3. **Prisma의 어려움은 자동화로 해결 가능하다.** §2.2.2 권장 조합 (PrismaClient pool + PgBouncer + raw SQL for SQL Editor)은 1회 구축 비용이 크지만 N=20에 비례하지 않는다. 한 번 만들어두면 신규 tenant 등록은 ADR-026 manifest 한 줄.

4. **Supabase parity와 1인 운영 가능성의 trade-off.** 옵션 B는 Supabase가 검증한 패턴이지만, Supabase는 plate-team + 운영 SRE가 RLS 정책을 일일 점검한다. 1인 운영자가 같은 안전성을 유지하려면 추가 자동화 도구 (pg_policies linter, e2e cross-tenant 침투 테스트)가 필요하다.

**옵션 B를 권장하는 카운터 근거** (사용자가 검토할 가치):
- 신규 tenant 등록 ms vs 수 초의 차이가 빈번한 등록 시나리오에서 결정적이라면
- Supabase parity (`@supabase/supabase-js` 호환성 95%)가 핵심 가치라면
- 마이그레이션 자체 runner를 만들 여력이 절대 부족하다면

---

## 10. 결정 (ACCEPTED 2026-04-26)

> 채택안: **옵션 B (shared schema + RLS)**
>
> [ ] A. Schema-per-tenant
> [x] B. Shared schema + RLS
> [ ] C. DB-per-tenant
> [ ] D. Hybrid

### 결정 (2026-04-26 세션 58)

**채택**: 옵션 B (shared schema + RLS)

**권고 변경 근거**: 본 ADR 초안은 옵션 A (schema-per-tenant)를 권고했으나, spike-baas-001 결과 다음 5가지 결정적 사실 발견:
1. Prisma 7.6도 동적 schema-per-tenant 1급 미지원 (issue #24794 still open)
2. `SET search_path` 패턴은 prepared statement caching과 silent 충돌 → 데이터 유출 위험
3. PrismaClient-pool 패턴: N=20 × 9 = 180 connection 즉시 max_connections(100) 초과
4. Almanac plugin 모델(ADR-024/026)은 옵션 A와 본질적 충돌 (runtime plugin vs build-time generate)
5. Prisma 공식 권장 = 옵션 B (`prisma-client-extensions/row-level-security`)

**필수 보강 (옵션 B 채택의 조건)**: ~28h 추가 공수
- `withTenant()` 래퍼 (모든 query에 tenant_id WHERE 자동 추가)
- ESLint custom rule (raw SQL에 tenant_id 누락 검출)
- RLS 정책 e2e 테스트 (cross-tenant leak 방지 자동 검증)
- PostgreSQL `app.tenant_id` session variable 패턴

**참조**: docs/research/baas-foundation/03-spikes/spike-baas-001-prisma-schema-per-tenant.md

### 결정 후 갱신할 항목
- 본 §10 결정 칸
- §2/§3 §1.4 Q1~Q5 답변 명시
- ADR-026 (Manifest) 입력으로 본 결정 인용
- ADR-027 (Router) 입력으로 본 결정 인용
- ADR-028 (Cron Pool) advisory lock key 형식 결정
- ADR-029 (Observability) audit_logs 위치 결정
- prisma/schema.prisma 1차 변경 spec 작성

### 결정 후 수행 작업 (참고 — 본 ADR 범위 외)
| Task | 옵션 A | 옵션 B |
|------|-------|-------|
| 모델 변경 | tenants 테이블 + role 분리 | 모든 비즈 모델에 tenantId + RLS 정책 11개 |
| 인덱스 재설계 | 거의 변경 없음 | 모든 자주 쿼리 인덱스 leading=tenant_id |
| 라우팅 계층 | PrismaClient pool + PgBouncer + getPrismaForTenant | withTenantTx + Client Extension |
| 마이그레이션 runner | 자체 작성 (manifest 기반) | `prisma migrate deploy` |
| 테스트 | tenant cross-access 차단 e2e (PG role로 강제) | RLS 정책 e2e + linter (Critical) |
| 신규 tenant 등록 자동화 | `/api/admin/tenants` POST → schema 생성 + migration 실행 | INSERT 1줄 |
| 운영 도구 | `pg_dump --schema` 래퍼 | 자체 export 스크립트 |
| 추정 작업 시간 | 80~100h | 100~140h (RLS 검증 자동화 포함) |

---

## 11. 변경 이력

| 일자 | 작성자 | 내용 |
|------|--------|------|
| 2026-04-26 | Sub-agent #3 (BaaS Foundation) | PROPOSED 초안. 3 옵션 비교 + Prisma 6 multiSchema 한계 분석 + Wave 1-5 호환성 검증. PENDING. |
| 2026-04-26 | 세션 58 | ACCEPTED — spike-baas-001 결과로 권고가 옵션 A → 옵션 B로 변경. RLS 보강 도구 ~28h 추가 공수 확정. |

---

## 부록 A — Prisma 6 multiSchema 능력 검증 인용

### A.1 공식 문서 인용
- Prisma docs `multi-schema`: "**You can perform Prisma queries on multiple schemas inside a single Prisma Client instance.**" — 즉 **여러 schema의 모델 통합**이지, 동일 모델을 동적으로 다른 schema에 라우팅하는 기능 아님.
- Prisma client extensions 가이드: tenancy 패턴 = `current_setting('app.current_company_id')` + dbgenerated default. **= 옵션 B 패턴**. Prisma 공식이 추천하는 multi-tenant는 옵션 B.

### A.2 GitHub Issue/Discussion 인용
- prisma/prisma#24794 ("One model to multiple database schemas for multi-tenancy"): **미해결, open**. 본 ADR-023 옵션 A를 정식 지원 요청. 2026-04 현재 미구현.
- prisma/prisma#15077 (multiSchema preview feedback): "frustration with multiSchema is that you would need to have a model with a unique name defined for each tenant" → **옵션 A-3 (모델 복제)는 N=20 시 유지 불가**.
- prisma/prisma#12420 (data isolation via schemas): `SET search_path` Prisma 호환성 미보장 보고 다수 → **옵션 A-2 신중**.
- prisma/prisma 토론 #20920 (multi DB instances 동시 연결): PrismaClient per tenant 패턴이 사실상의 답변 → **옵션 A-1 / 옵션 C 둘 다 PrismaClient pool 패턴 동일**.

### A.3 결론
- Prisma 6은 동적 schema-per-tenant를 **공식 지원하지 않는다**. 옵션 A 채택 시 PrismaClient pool 패턴 (A-1) + raw SQL 우회 (A-2)의 조합이 사실상 유일한 길이며, 검증 부담이 크다.
- Prisma 공식이 권장하는 multi-tenant는 **옵션 B** (Client Extensions + dbgenerated + RLS).
- 이 비대칭이 본 ADR의 핵심 trade-off다.

---

## 부록 B — 참고 출처

- `docs/research/baas-foundation/00-context/01-existing-decisions-audit.md` (재검토 트리거, ADR-001 supersede)
- `docs/research/baas-foundation/00-context/02-current-code-audit.md` (단일테넌트 가정 매핑)
- `docs/research/2026-04-supabase-parity/02-architecture/02-data-model-erd.md` (현재 11 테이블 + Wave 4 신규 15+)
- `docs/research/2026-04-supabase-parity/02-architecture/00-system-overview.md` (AP-1 ~ AP-5)
- `docs/research/2026-04-supabase-parity/00-vision/09-multi-tenancy-decision.md` (ADR-001 원문)
- `prisma/schema.prisma` (현재 schema)
- `docs/research/spikes/spike-013-wal2json-slot-result.md` (CDC 설계 영향)
- `docs/research/spikes/spike-016-seaweedfs-50gb-result.md` (Storage 보존)
- Prisma docs (multiSchema, Client Extensions, Multiple Databases): https://www.prisma.io/docs/orm/prisma-schema/data-model/multi-schema
- prisma/prisma GitHub Issues: #24794, #15077, #12420, Discussion #20920
- Supabase RLS 패턴 (참고): https://supabase.com/docs/guides/database/postgres/row-level-security
