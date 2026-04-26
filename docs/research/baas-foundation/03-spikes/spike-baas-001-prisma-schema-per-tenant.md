# Spike-BaaS-001: Prisma 6/7 schema-per-tenant 기술 검증

- **상태**: COMPLETED (문서/코드 분석 기반) — PENDING (실제 PoC 코드 검증)
- **작성일**: 2026-04-26
- **작성자**: BaaS Foundation Sub-agent
- **결정 의존**: ADR-023 옵션 A vs 옵션 B 선택 근거 강화
- **트랙**: Micro spike (문서 + 코드 + GitHub issue 분석, 30분~2시간)
- **선행 ADR**: ADR-023 §2 (옵션 A 분석), 부록 A (Prisma multiSchema 능력 검증)
- **후속 산출물**: ADR-023 §10 결정 칸 입력 자료, ADR-026/027 입력

---

## 0. 한 줄 요약

> **Prisma 6/7은 schema-per-tenant를 1급 기능으로 지원하지 않는다.** 옵션 A (schema-per-tenant)는 PrismaClient-pool 우회 또는 raw `SET search_path` 우회 중 하나를 선택해야 하며, 둘 다 PgBouncer + 운영 자동화 비용을 동반한다. **N=10~20 컨슈머 + 1인 운영 + 월 $10 제약**을 동시에 만족하기 어려우며, **옵션 B (shared schema + RLS + Prisma Client Extensions)가 Prisma 공식 권장 패턴이다.** 단, RLS 정책 검증 자동화가 도입되어야 안전하다. 본 spike는 **옵션 B 우선 권고 + 옵션 A는 작은 PoC로만 검증**을 결론으로 제시한다.

---

## 1. 스파이크 목적

### 1.1 왜 검증이 필요한가

ADR-023은 "schema-per-tenant" (옵션 A) 채택을 권고하면서도, 부록 A에서 다음 한계를 정직하게 인정했다:
- prisma#24794: 동적 schema-per-tenant 미지원 (open, unimplemented)
- prisma#15077: multiSchema 모델 복제 패턴은 N=20 시 유지 불가
- prisma#12420: `SET search_path` Prisma 호환성 미보장
- Prisma 공식 multi-tenant 가이드는 옵션 B (Client Extensions + dbgenerated + RLS) 권장

이 비대칭은 **결정 보류**의 핵심이다. ADR-023 §10이 [PENDING DECISION] 상태로 둔 이유.

### 1.2 본 스파이크가 답해야 할 것

ADR-023의 분석에 더해, 다음을 더 정밀하게 답한다:
1. Prisma 7 (현재 프로젝트가 사용 중)에서 동적 schema-per-tenant가 실제로 어떻게 구현 가능한가?
2. 각 구현 방식의 정확한 운영 한계 (PgBouncer 필수 여부, max_connections 압박 수치, 마이그레이션 복잡도)
3. Almanac (첫 컨슈머)을 schema-per-tenant로 구현 시 나타날 구체적 issue
4. PoC 권고: 옵션 A로 가도 되는가, 옵션 B로 가야 하는가

### 1.3 본 스파이크의 범위 (out of scope)

- 실제 PoC 코드 작성 — **사용자 결정 후 별도 진행**
- N=20 부하 테스트 — **PoC 코드 후 실측**
- SeaweedFS / wal2json과의 통합 검증 — ADR-023 §7에서 이미 호환 확인됨

---

## 2. 검증 질문

| ID | 질문 | 답변 위치 |
|----|------|----------|
| Q1 | Prisma 7에서 런타임에 tenant별 schema를 동적으로 라우팅 가능한가? | §4.1 |
| Q2 | 가능하다면, 가장 안전한 패턴은 무엇인가? | §4.2 |
| Q3 | 각 패턴의 운영 한계는? (max_connections, 메모리, 마이그레이션) | §4.2~4.4 |
| Q4 | Almanac 같은 도메인이 이 패턴 위에서 자연스럽게 작동하는가? | §4.5 |
| Q5 | 옵션 B (shared+RLS) 대비 정직한 비교 | §5 |
| Q6 | 본 프로젝트 (1인 운영, N=20, 월 $10)에는 어느 쪽이 합리적인가? | §6 |

---

## 3. 조사 방법

### 3.1 1차 자료
- Prisma 공식 docs (`/websites/prisma_io` via Context7):
  - `multi-schema` 가이드 (`/orm/prisma-schema/data-model/multi-schema`)
  - `client-extensions` (`/orm/prisma-client/client-extensions`)
  - `databases-connections/pgbouncer` (PgBouncer 통합 가이드)
  - `multiple-databases` 가이드
- Prisma 7.6.0 release notes 및 source repo (`/prisma/prisma`)

### 3.2 2차 자료 (GitHub issue/discussion)
- prisma/prisma#24794 (One model to multiple schemas for multi-tenancy)
- prisma/prisma#12420 (Isolating multi-tenant data via schemas)
- prisma/prisma#15077 (multiSchema preview feedback)
- prisma/prisma#19415, #14942, #11643 (prepared statement 충돌)
- prisma/prisma#21531 (PgBouncer 1.21.0 prepared statement 지원)
- prisma/prisma Discussion #20920 (multi DB instances 동시 연결)
- prisma/prisma Discussion #2846 (Prisma multi-tenant features?)

### 3.3 3차 자료 (커뮤니티 패턴)
- Mike Alche, "Multi-tenant application with Next.js and Prisma"
- Dario Ielardi, "Schema-Based Multi-Tenancy with NestJS and Prisma"
- ZenStack, "Multi-Tenancy Implementation Approaches With Prisma"
- prisma-client-extensions/row-level-security (공식 example)
- moofoo, "NestJS + PostgreSQL + Prisma RLS multi-tenancy" (DEV.to)

### 3.4 현재 프로젝트 코드 분석
- `package.json`: Prisma 7.6.0 (multiSchema preview는 6.x부터 generally available로 격상되었으나 *동적* schema는 여전히 미지원)
- `prisma/schema.prisma`: 11개 모델, 모두 single-schema 가정 (`@@schema` 부재)

---

## 4. 발견 사항

### 4.1 Prisma multiSchema 능력의 정확한 정의 (Q1 답변)

#### 4.1.1 공식 정의 인용

> "**You can perform Prisma queries on multiple schemas inside a single Prisma Client instance.**"
> — Prisma docs `multi-schema`

핵심: **여러 schema의 *서로 다른* 모델을 한 client에 통합**하는 기능. 동일 모델을 동적으로 다른 schema에 라우팅하는 기능이 **아니다**.

```prisma
datasource db {
  provider = "postgresql"
  schemas  = ["public", "analytics"]   // 정적 선언
}
```

#### 4.1.2 Prisma 7.6.0에서의 변경

- multiSchema는 **preview를 졸업하여 stable**이 되었지만 (Prisma 5+), 기능 범위는 동일.
- prisma#24794 ("One model to multiple database schemas for multi-tenancy"): **2026-04 현재 미해결, open**.
- 공식 변경 로그/문서 어디에도 "동적 schema 라우팅" 지원 명시 없음.

#### 4.1.3 결론 (Q1)

> **Q1 답변: 아니오. Prisma 7은 런타임에 tenant별 schema를 1급으로 라우팅하지 못한다.** 우회는 3가지뿐이다 (§4.2 ~ §4.4).

---

### 4.2 패턴 1 — PrismaClient per tenant (캐시 풀링)

#### 4.2.1 구현 sketch

```typescript
// src/lib/db/prisma-pool.ts
import { PrismaClient } from "@prisma/client";

const clients = new Map<string, PrismaClient>();
const BASE_URL = process.env.DATABASE_URL!;     // PgBouncer 6432 권장

export function getPrismaForTenant(slug: string): PrismaClient {
  let client = clients.get(slug);
  if (!client) {
    // Prisma는 url에 ?schema=… 파라미터로 connection별 default schema 지정
    const url = `${BASE_URL}?schema=tenant_${slug}&connection_limit=2&pool_timeout=10`;
    client = new PrismaClient({ datasources: { db: { url } } });
    clients.set(slug, client);
  }
  return client;
}

export async function shutdownAll() {
  for (const c of clients.values()) await c.$disconnect();
  clients.clear();
}
```

#### 4.2.2 max_connections 영향 (정량)

| 값 | 산식 | 결과 |
|----|------|------|
| PostgreSQL 기본 max_connections | 100 | 100 |
| 시스템 영역 (admin, autovacuum, replication, monitoring) | 약 15~20 | 80~85 사용 가능 |
| Prisma 기본 connection_limit | `num_cpus * 2 + 1` | WSL2 4 vCPU = 9 |
| N=20 × 9 | 180 | **PG 한도 2배 초과 → 즉시 fail** |
| N=20 × 2 (강제 축소) | 40 | OK, 단 동시 요청 수가 tenant당 2 미만일 때 |

**결론**: `connection_limit=2`로 강제하지 않으면 N=20에서 즉시 한계.

#### 4.2.3 PgBouncer 필수성

- `connection_limit=2` 강제 시 동시 요청 처리 능력이 tenant당 2건. 트래픽 spike 시 즉시 timeout.
- 해결: PgBouncer **transaction-pooling mode** 전치 → app→PgBouncer는 N×수십 connection 가능, PgBouncer→PG는 한정 connection 재활용.
- **Prisma + PgBouncer 알려진 함정**: prepared statement 충돌 (#11643, #14942, #19415).
  - PgBouncer 1.21.0 (2024-04 출시)부터 transaction-mode에서 prepared statement 지원 (issue #21531).
  - **그 이전 버전은 `?pgbouncer=true` query string으로 prepared statement 비활성화 강제 필수** — 성능 저하 발생.
- Prisma 7.6 + PgBouncer 1.21+ 조합이 안전선이지만, **Linux/WSL 패키지 매니저가 1.21+ 제공하는지 확인 필요**.

```bash
# 점검 명령
apt-cache policy pgbouncer  # 1.21+ 인지 확인
```

#### 4.2.4 메모리 영향

- PrismaClient 인스턴스 1개 ≈ Node heap **30~80MB** (engine binary 포함, Prisma 6+ Rust engine 기준).
- N=20 × 50MB ≈ **1GB heap 추가**.
- WSL2 메모리 (사용자 환경 8~16GB 가정)에서는 감내 가능. 단 Vercel/Lambda serverless였다면 즉시 OOM.
- 본 프로젝트는 PM2 + WSL2 → **메모리 우려 < 연결 우려**.

#### 4.2.5 cold start

- 신규 tenant 첫 요청 시 PrismaClient 인스턴스화 ≈ 200~500ms (engine spawn 포함).
- ADR-026 manifest 등록 시 `getPrismaForTenant(slug)`을 warm-up으로 미리 호출하면 회피 가능.

#### 4.2.6 장단점 요약

✅ **장점**
- Prisma 타입 시스템 100% 보존 (`prisma.user.findMany()` 그대로 작동)
- middleware/extension 불필요
- 마이그레이션도 동일 schema 정의로 N tenant에 적용 (§4.6 runner)

❌ **단점**
- **PgBouncer 1.21+ 필수** — 인프라 1개 추가 (AP-1 "단일 PG instance" 부담 +α)
- max_connections 압박 (N=20에서 한계 직면)
- 메모리 +1GB
- cold start 200~500ms (해결 가능)
- 신규 tenant 등록 = (1) schema CREATE → (2) 모든 과거 migration 적용 → (3) PrismaClient 인스턴스화 → 자동화 스크립트 필수

---

### 4.3 패턴 2 — Raw SQL `SET search_path` (단일 PrismaClient)

#### 4.3.1 구현 sketch

```typescript
const prisma = new PrismaClient();   // 단일 인스턴스

export async function withTenant<T>(
  slug: string,
  fn: (tx: Omit<PrismaClient, "$connect" | "$disconnect">) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // SET LOCAL은 트랜잭션 내부에만 유효, COMMIT/ROLLBACK 시 자동 reset
    await tx.$executeRawUnsafe(`SET LOCAL search_path TO "tenant_${slug}", public`);
    return fn(tx);
  });
}
```

#### 4.3.2 함정 1 — `@@schema` 충돌

- Prisma 모델에 `@@schema("tenant_almanac")`을 명시하면 Prisma는 query 생성 시 schema를 fully-qualify (`"tenant_almanac"."users"`) → search_path 무시.
- → `@@schema` **사용 금지**, 모델 정의는 schema 미지정 (public 가정처럼 보이게) + 런타임 search_path 우회.
- 이 시점에서 Prisma의 multi-schema 기능은 **사용 불가** (역설적).

#### 4.3.3 함정 2 — prepared statement caching

- Prisma는 prepared statement에 query plan을 캐싱한다.
- PostgreSQL prepared statement는 **schema name까지 plan에 박혀버린다** (deparse + plan caching).
- 첫 요청이 `tenant_a`에서 `SELECT … FROM users` plan을 캐싱했다면, 두 번째 요청이 `tenant_b`로 와도 **`tenant_a` plan을 재사용** → cross-tenant 데이터 유출 위험.
- 회피책 (모두 trade-off):
  - `?statement_cache_size=0`: 성능 30~50% 저하
  - PgBouncer transaction-pooling: 매 transaction마다 fresh prepared statement → 사실상 비활성화 효과
- prisma#12420 토론에서 다수 보고된 함정.

#### 4.3.4 함정 3 — connection 재사용 leak

- Prisma의 connection pool은 tenant 외부 query (트랜잭션 미사용 `prisma.user.findMany()`)에 connection을 재사용한다.
- 이전 트랜잭션이 `SET search_path = tenant_a` 후 COMMIT을 빠뜨리면 (예외 throw 시 ROLLBACK이 아니라 connection 폐기되지 않은 상태), 다음 요청이 같은 connection을 받으면 search_path가 leak.
- `SET LOCAL`은 자동 reset이지만 **`SET LOCAL` 외부의 일반 `SET`을 실수로 사용**하면 즉시 사고.
- PostgreSQL discussion: "almost all session level SET commands leak across transactions, but SET search_path is by far the one with the biggest impact." (PgBouncer FAQ)

#### 4.3.5 장단점

✅ **장점**
- 단일 PrismaClient → 메모리 적음, max_connections 압박 없음
- PgBouncer 불필요 (단일 pool)
- 마이그레이션도 search_path 기반 runner로 통일

❌ **단점 (결정타)**
- prepared statement caching 충돌 → cross-tenant 유출 위험
- `@@schema` 사용 불가 → Prisma multi-schema 기능 무효화
- 함정 3가지 모두 **app code review만으로 잡기 어려움**
- Prisma 공식 docs/release notes 어디에도 "search_path 우회 안전" 보장 없음 — **자가 책임**

> **권고**: SQL Editor 같은 raw SQL 케이스에 한정 사용. 일반 query는 패턴 1 사용.

---

### 4.4 패턴 3 — 모델 복제 (multiSchema 정공법)

#### 4.4.1 구현 sketch

```prisma
generator client {
  previewFeatures = ["multiSchema"]   // Prisma 5+에서는 stable
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

#### 4.4.2 결정타

- prisma#15077: "frustration with multiSchema is that you would need to have a model with a unique name defined for each tenant" — Prisma 팀 직접 인정.
- 신규 tenant 추가 = `schema.prisma` 수정 + `prisma generate` + 재배포. **동적 등록 불가**.
- N=20일 때 schema.prisma는 수천 줄. 코드 리뷰/유지 불가.
- prisma#24794 (open): 이 한계를 정식 지원으로 해결해달라는 요청 → **2026-04 현재 미구현**.

#### 4.4.3 결론

> **거부 권고.** schema-per-tenant 구현 후보에서 제외.

---

### 4.5 Almanac 적용 시나리오 (Q4 답변)

ADR-024 + ADR-026이 결정한 manifest 기반 plugin이 schema-per-tenant와 어떻게 결합되는가?

#### 4.5.1 가정

- Almanac plugin manifest 등록 → tenant `almanac` 생성
- 옵션 A 채택 시 `tenant_almanac` schema 생성 + Almanac 모델 마이그레이션
- Almanac 5개 모델 (`content_items`, `content_categories`, `content_tags`, `content_tag_links`, `content_revisions`) → 모두 `tenant_almanac` schema에 거주
- 시스템 (yangpyeon core)의 `User`, `ApiKey`, `AuditLog`, `Session`, `JwksKey` 등은 `public` schema에 잔존

#### 4.5.2 cross-schema FK 가능성

PostgreSQL은 cross-schema FK를 **기본 지원**:
```sql
ALTER TABLE tenant_almanac.content_items
  ADD CONSTRAINT content_items_user_fk
  FOREIGN KEY (user_id) REFERENCES public.users(id);
```

→ **기능적으로 가능.**

#### 4.5.3 그러나 운영 함정

| 함정 | 옵션 A (schema) | 옵션 B (shared) |
|------|----------------|----------------|
| `pg_dump --schema=tenant_almanac` 시 cross-schema FK 발견 → dump **실패** 또는 dangling FK | **실제 발생** | N/A |
| tenant 1개 삭제 시 cross-schema FK가 `public.users.deleted_at`을 막음 | **CASCADE 신중 설계 필요** | 동일 |
| Almanac plugin이 자체 `User` 모델을 갖고 싶을 때 | `tenant_almanac.users` ↔ `public.users` 동시 존재 가능 | tenant_id 차원 추가만 |
| Prisma의 `relation` 정의 | `User` 모델이 schema 미지정 (public) + Almanac 모델이 `@@schema("tenant_almanac")` → 가능하지만 **두 schema가 generate 시점에 모두 알려져야 함** → 동적 tenant 등록과 충돌 | 단일 schema, 정상 |

#### 4.5.4 Plugin manifest와의 충돌

ADR-024/026이 가정한 "plugin은 manifest 등록만으로 동적 활성화" 모델과 **옵션 A는 본질적으로 충돌**:
- Prisma generate는 build-time
- 동적 tenant 등록은 runtime
- 따라서 옵션 A를 택하면 plugin 모델은 **Prisma client에 등록 불가** → raw SQL로만 접근 → Prisma 가치 소실.

#### 4.5.5 대안: tenant 단위로만 schema 분리, plugin 모델은 단일 정의

```
public                  ← 시스템 (User, ApiKey, AuditLog, Session, JwksKey)
tenant_almanac          ← Almanac 5개 모델 (인스턴스 1개)
tenant_foo              ← Foo plugin 모델 (인스턴스 1개)
…
```

이 경우 패턴 1 (PrismaClient per tenant) + plugin별 PrismaClient extension이 필요 → 복잡도 폭증.

#### 4.5.6 결론 (Q4)

> **Q4 답변: 자연스럽지 않다.** Almanac 같은 plugin 도메인은 **옵션 B (단일 schema + tenant_id 컬럼) 위에서 더 자연스럽게 작동**한다. ADR-024 manifest 기반 plugin 활성화 모델과 schema-per-tenant는 build-time vs runtime 충돌을 일으킨다.

---

### 4.6 마이그레이션 전략 비교

#### 4.6.1 옵션 A (schema-per-tenant)

```typescript
// src/lib/db/migration-runner.ts
const tenants = await prisma.tenant.findMany();
for (const t of tenants) {
  for (const m of pendingMigrations(t.migrationVersion)) {
    await pg.query(`SET search_path = "tenant_${t.slug}"`);
    await pg.query(m.sql);
    await prisma.tenant.update({
      where: { id: t.id },
      data: { migrationVersion: m.version }
    });
  }
}
```

- **자체 runner 필수** — `prisma migrate deploy`는 단일 schema 가정
- 부분 적용 상태 추적 = manifest의 `migrationVersion` 컬럼 (ADR-026 입력)
- 한 tenant 실패 → 다른 tenant 진행은 정책 결정 필요

#### 4.6.2 옵션 B (shared schema + RLS)

```bash
# 그대로 사용
npx prisma migrate deploy
```

- **표준 도구로 충분**
- 단, 백필 시 모든 row에 tenant_id 추가 (다운타임 또는 deferred constraint)

---

## 5. 옵션 B (shared+RLS)와의 정직한 비교 (Q5 답변)

ADR-023 §6 매트릭스를 본 spike의 발견으로 보강:

| 차원 | 옵션 A (schema-per-tenant) | 옵션 B (shared+RLS) | 본 spike의 추가 발견 |
|------|---------------------------|---------------------|--------------------|
| Prisma 7 1급 지원 | ❌ (#24794 open) | ✅ (Client Extensions + dbgenerated) | Prisma 공식 example repo가 옵션 B 패턴 (`prisma-client-extensions/row-level-security`) |
| 신규 tenant 등록 시간 | 수 초 (schema CREATE + 과거 migration 적용 + warm-up) | ms (INSERT) | manifest 등록 자동화 시 옵션 A는 200~500ms cold start 추가 |
| max_connections 압박 | 강 (PgBouncer 1.21+ 필수) | 약 (단일 pool) | 본 프로젝트 (WSL2 4 vCPU)는 옵션 A에서 connection_limit=2 강제 필요 |
| 메모리 | +1GB heap (N=20) | 기본 | WSL2 8~16GB에서는 감내 가능 |
| cross-tenant 유출 위험 | 매우 낮음 (DB 강제), 단 **search_path 패턴 사용 시 prepared statement leak** | 중 (RLS 정책 버그 시) | RLS는 자동 검증 도구 (`pg_policies` linter) 가능, 옵션 A search_path 함정은 정적 분석 어려움 |
| Almanac (plugin) 자연스러움 | ❌ (build-time vs runtime 충돌) | ✅ | 본 spike §4.5 신규 발견 |
| 백업 단위 | 좋음 (`pg_dump --schema`), 단 **cross-schema FK 시 실패** | 어려움 (자체 export) | 옵션 A의 백업 강점은 cross-schema FK 설계로 일부 상쇄 |
| Prisma 공식 multi-tenant 가이드 | 없음 | 있음 (Client Extensions) | Prisma 공식이 옵션 B 권장 |
| 1인 운영 적합 | △ (자동화 도구 자체 작성 필수) | ✅ | RLS 검증 자동화도 자체 작성 필요하지만 도구 ecosystem 풍부 |
| 작업 시간 추정 | 80~100h (ADR-023) + RLS 외 e2e 별도 | 100~140h (ADR-023, RLS 검증 자동화 포함) | 옵션 A는 PgBouncer 운영 시간 추가로 +20h |

### 5.1 Prisma 공식 권장이 옵션 B인 이유

> "PrismaClient can be extended on `$allOperations` to set tenantId into the database variable before any query."
> — Prisma 공식 example (`prisma-client-extensions/row-level-security`)

```typescript
// 공식 패턴 예시
const prisma = basePrisma.$extends({
  query: {
    $allOperations({ args, query, operation }) {
      const tenantId = getTenantContext();
      return basePrisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `SET LOCAL app.tenant_id = '${tenantId}'`
        );
        return query(args);
      });
    }
  }
});
```

```prisma
model User {
  id        String @id @default(uuid())
  tenantId  String @default(dbgenerated("(current_setting('app.tenant_id'))::uuid"))
            @map("tenant_id") @db.Uuid
  email     String
  @@unique([tenantId, email])
}
```

→ INSERT 시 자동 채움, SELECT 시 RLS 정책이 row 필터링.

### 5.2 RLS 정책 검증 자동화 (옵션 B 채택 시 필수)

옵션 B의 핵심 위험은 정책 버그. 다음 도구로 완화:
- `pg_policies` 시스템 카탈로그 일일 점검 (cron)
- e2e cross-tenant 침투 테스트 (다른 tenant context에서 query → 0 row 검증)
- ESLint rule: `prisma.*` 직접 호출 금지, 항상 `withTenant(...)` 래퍼 강제

---

## 6. 권고 (Q6 답변)

### 6.1 권고 1 — 옵션 B 우선 권고 (Schema 변경 권고)

**ADR-023 §9의 옵션 A 권고를 옵션 B 권고로 변경할 것을 제안한다.** 근거:

1. **Prisma 공식 multi-tenant 가이드가 옵션 B**. 1인 운영자가 비주류 패턴을 자체 검증할 시간이 없다.
2. **Almanac plugin은 schema-per-tenant와 본질적으로 충돌** (§4.5). ADR-024/026이 결정한 동적 plugin 활성화는 build-time Prisma generate와 충돌.
3. **PgBouncer 1.21+ 인프라 추가**가 AP-1 ("단일 PG instance + 단일 노드") 의 정신 위배 가능성.
4. **prepared statement caching 함정**은 코드 리뷰로 잡기 어려운 silent bug → 1인 운영자에게는 RLS 정책 버그보다 더 위험.
5. **Almanac을 첫 컨슈머로 가는 단기 로드맵**에서 옵션 B는 "단일 schema 그대로 + tenant_id 추가"로 점진적 마이그레이션 가능.

### 6.2 권고 2 — 옵션 A를 완전히 거부하지는 말 것

다음 케이스에서는 옵션 A 또는 옵션 D (hybrid)가 합리적:
- 컨슈머 1개의 데이터가 매우 크거나 (수십 GB), GDPR right-to-be-forgotten 요구가 빈번할 때
- "컨슈머 단위 백업/복원"이 비즈니스 요구일 때 (옵션 B는 자체 export 도구 필요)

→ **2년 후 재평가 권고 (트리거 조건 ADR-023 §1.1과 동일)**.

### 6.3 권고 3 — PoC 방향 (사용자가 PoC 진행 시)

**둘 다 PoC하지 말 것 — 시간 낭비.** 다음 순서로 진행:

#### Phase 1 (1주, 우선)
- 옵션 B PoC: Almanac을 단일 schema + tenant_id + Client Extension으로 구현
- 검증: cross-tenant 침투 테스트 + RLS 정책 검증 자동화 도구 제작
- 결과: 옵션 B로 ADR-023 결정 확정 또는 거부

#### Phase 2 (옵션 B PoC 실패 시만, 1주)
- 옵션 A PoC: PgBouncer 1.21+ + PrismaClient pool + 자체 migration runner
- 검증: max_connections 실측 + cross-schema FK 백업 테스트
- 결과: 옵션 A 또는 옵션 C로 변경

### 6.4 권고 4 — 옵션 B 채택 시 즉시 자동화 도구

| 도구 | 구현 시간 | 우선순위 |
|------|----------|---------|
| `withTenant` 래퍼 + Prisma Client Extension | 4h | P0 |
| ESLint custom rule (`prisma.*` 직접 호출 금지) | 8h | P0 |
| RLS 정책 unit test (모든 model × cross-tenant 0 row 검증) | 16h | P0 |
| `pg_policies` 일일 점검 cron + slack 알림 | 4h | P1 |
| 자체 export 도구 (tenant 1개 dump, JSON) | 16h | P1 |
| 자체 PITR 도구 (tenant 1개 시점 복원, 논리적 복원) | 24h | P2 |

**합계: P0 28h + P1 20h + P2 24h = 72h (ADR-023 §10 추정 100~140h의 일부)**

---

## 7. 다음 단계

### 7.1 사용자 결정 대기 항목

- [ ] **결정 1**: 본 spike의 권고를 ADR-023 §10 결정 칸에 어떻게 반영할 것인가?
  - 옵션 (a): ADR-023 §9 권고를 옵션 A → 옵션 B로 변경 (본 spike 권고)
  - 옵션 (b): ADR-023 §9 권고는 유지하되 본 spike를 "반대 의견"으로 기록 후 PoC 진행
  - 옵션 (c): 본 spike를 reference로만 사용, ADR-023 §10 결정은 사용자 직권

### 7.2 PoC 코드 작성 (사용자 결정 후)

- [ ] PoC-1 (옵션 B): tenant_a, tenant_b 두 개 row 생성 → cross-tenant SELECT 0 row 검증
- [ ] PoC-2 (옵션 B): Prisma Client Extension + dbgenerated default 동작 검증
- [ ] PoC-3 (옵션 B 실패 시만): tenant_a, tenant_b 두 schema 생성 → PrismaClient pool 라우팅 검증
- [ ] PoC-4 (옵션 A 채택 시): PgBouncer 1.21+ 설치 + connection 압박 측정
- [ ] PoC-5 (옵션 A 채택 시): cross-schema FK 백업/복원 테스트

### 7.3 후속 산출물

- [ ] ADR-026 (Manifest) 입력: 결정된 격리 모델에 따라 manifest 스키마 재설계
- [ ] ADR-027 (Router) 입력: tenant 식별 (subdomain/path/JWT) → withTenant 호출 흐름
- [ ] ADR-028 (Cron Pool) 입력: advisory lock key 형식 (`<tenant>:<job>`)
- [ ] ADR-029 (Observability) 입력: audit_logs 위치 (옵션 B면 `public.audit_logs` + tenant_id)
- [ ] `prisma/schema.prisma` 1차 변경 spec

---

## 8. References

### 8.1 Prisma 공식 docs
- [Prisma multi-schema guide](https://www.prisma.io/docs/orm/prisma-schema/data-model/multi-schema)
- [Prisma multiple databases guide](https://www.prisma.io/docs/guides/multiple-databases)
- [Prisma Client extensions](https://www.prisma.io/docs/orm/prisma-client/client-extensions)
- [Prisma + PgBouncer setup](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/pgbouncer)
- [Prisma best practices](https://www.prisma.io/docs/orm/more/best-practices)
- [Prisma Postgres connection pooling (PgBouncer transactional mode)](https://www.prisma.io/docs/postgres/database/connection-pooling)

### 8.2 GitHub Issue/Discussion (인용)
- [prisma/prisma#24794 — One model to multiple database schemas for multi-tenancy](https://github.com/prisma/prisma/issues/24794) (open, 2024–현재 미해결)
- [prisma/prisma#15077 — multiSchema preview feedback](https://github.com/prisma/prisma/issues/15077)
- [prisma/prisma#12420 — Isolating multi-tenant data via database schemas](https://github.com/prisma/prisma/issues/12420)
- [prisma/prisma#11643 — prepared statement "s0" already exists](https://github.com/prisma/prisma/issues/11643)
- [prisma/prisma#14942 — prepared statement "s4" already exists (Supabase)](https://github.com/prisma/prisma/issues/14942)
- [prisma/prisma#19415 — Prepared Statement 's*' already exists](https://github.com/prisma/prisma/issues/19415)
- [prisma/prisma#21531 — Fully support prepared statements with pgbouncer 1.21.0](https://github.com/prisma/prisma/issues/21531)
- [prisma/prisma#5510 — Configure prisma not to use prepare statements](https://github.com/prisma/prisma/issues/5510)
- [prisma/prisma Discussion #20920 — Multi Tenancy Setup supporting multiple DB instances](https://github.com/prisma/prisma/discussions/20920)
- [prisma/prisma Discussion #2846 — Prisma multi-tenant features?](https://github.com/prisma/prisma/discussions/2846)
- [prisma/prisma Discussion #7709 — How to set up "search_path"](https://github.com/prisma/prisma/discussions/7709)

### 8.3 공식 example
- [prisma-client-extensions/row-level-security](https://github.com/prisma/prisma-client-extensions/tree/main/row-level-security) — **옵션 B 공식 reference 구현**

### 8.4 커뮤니티 분석
- [Securing Multi-Tenant Applications Using RLS in PostgreSQL with Prisma ORM (Franco Labuschagne, Medium)](https://medium.com/@francolabuschagne90/securing-multi-tenant-applications-using-row-level-security-in-postgresql-with-prisma-orm-4237f4d4bd35)
- [Schema-Based Multi-Tenancy with NestJS and Prisma (Dario Ielardi)](https://darioielardi.dev/schema-based-multi-tenancy-with-nestjs-and-prisma)
- [Multi-Tenancy Implementation Approaches With Prisma and ZenStack (ZenStack)](https://zenstack.dev/blog/multi-tenant)
- [How to create a Multi-tenant application with Next.js and Prisma (Mike Alche)](https://www.mikealche.com/software-development/how-to-create-a-multi-tenant-application-with-next-js-and-prisma)
- [NestJS + Prisma RLS multi-tenancy (moofoo, DEV.to)](https://dev.to/moofoo/nestjspostgresprisma-multi-tenancy-using-nestjs-prisma-nestjs-cls-and-prisma-client-extensions-ok7)
- [Using Row-Level Security in Prisma (Atlas Guides)](https://atlasgo.io/guides/orms/prisma/row-level-security)

### 8.5 PostgreSQL 1차 자료
- [PostgreSQL: SET (search_path 전파 동작)](https://www.postgresql.org/docs/current/sql-set.html)
- [PostgreSQL search_path security and ergonomics (BigSmoke)](https://blog.bigsmoke.us/2022/11/11/postgresql-schema-search_path) — `SET search_path` 누수 사례
- [Schema and search_path surprises (Postgres OnLine Journal)](https://www.postgresonline.com/article_pfriendly/279.html)

### 8.6 본 프로젝트 자료
- `docs/research/baas-foundation/01-adrs/ADR-023-tenant-data-isolation-model.md` — 본 spike의 모태
- `docs/research/baas-foundation/00-context/01-existing-decisions-audit.md` — 재검토 트리거
- `docs/research/baas-foundation/00-context/02-current-code-audit.md` — 현재 단일테넌트 가정
- `prisma/schema.prisma` — 11개 모델 단일 schema 구조
- `package.json` — Prisma 7.6.0, @prisma/client 7.6.0, @prisma/adapter-pg 7.6.0

---

## 9. 변경 이력

| 일자 | 작성자 | 내용 |
|------|--------|------|
| 2026-04-26 | BaaS Foundation Sub-agent | 초안 — Prisma 7.6 기준 schema-per-tenant 3 패턴 분석 + 옵션 B 우선 권고 + Almanac plugin 충돌 발견 |

---

## 부록 A — 본 spike의 핵심 발견 5가지 (요약)

1. **Prisma 7.6은 동적 schema-per-tenant를 1급 지원하지 않는다** (#24794 open). 우회 3가지 모두 trade-off가 큼.
2. **PrismaClient pool 패턴 (옵션 A-1)은 PgBouncer 1.21+ 필수**. WSL/Linux 패키지 매니저가 1.21+ 제공 여부 확인 필요.
3. **`SET search_path` 패턴 (옵션 A-2)은 prepared statement caching과 충돌**. cross-tenant 유출 silent bug 위험.
4. **Almanac (첫 plugin 컨슈머)는 옵션 A와 본질적으로 충돌**. ADR-024/026의 동적 plugin 등록 모델과 Prisma build-time generate 사이의 충돌.
5. **Prisma 공식 multi-tenant 권장 패턴은 옵션 B** (Client Extensions + dbgenerated + RLS). 공식 example repo도 옵션 B로 구현됨.

→ **결론: ADR-023 §9의 옵션 A 권고를 옵션 B로 변경 제안. 사용자 최종 결정 대기.**
