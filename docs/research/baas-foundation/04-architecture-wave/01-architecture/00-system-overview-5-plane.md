# 00 — System Overview (5-Plane Architecture)

> 작성: 2026-04-26 (BaaS Foundation Wave — Architecture Sub-agent #1)
> 상위: [CLAUDE.md](../../../../../CLAUDE.md) → [docs/research/baas-foundation/](../../) → [04-architecture-wave/01-architecture/](../) → **이 문서**
> 입력 ADR (모두 ACCEPTED 2026-04-26 세션 58):
> - [ADR-022](../../01-adrs/ADR-022-baas-identity-redefinition.md) BaaS 정체성 재정의 (옵션 A: closed multi-tenant)
> - [ADR-023](../../01-adrs/ADR-023-tenant-data-isolation-model.md) 데이터 격리 (옵션 B: shared schema + RLS)
> - [ADR-024](../../01-adrs/ADR-024-tenant-plugin-code-isolation.md) Plugin 코드 격리 (옵션 D: hybrid workspace+manifest)
> - [ADR-025](../../01-adrs/ADR-025-instance-deployment-model.md) 인스턴스 모델 (옵션 A: 단일 인스턴스 + 코드 추상화 5종)
> - [ADR-026](../../01-adrs/ADR-026-tenant-manifest-schema.md) Tenant Manifest (옵션 C: TS manifest.ts + DB 운영 토글)
> - [ADR-027](../../01-adrs/ADR-027-multi-tenant-router-and-api-key-matching.md) Router + API key (옵션 A path + K3 매칭)
> - [ADR-028](../../01-adrs/ADR-028-cron-worker-pool-and-per-tenant-isolation.md) Cron Worker Pool (옵션 D: hybrid worker_threads → pg-boss)
> - [ADR-029](../../01-adrs/ADR-029-per-tenant-observability.md) Observability (M1+L1+T3 → Phase 4 OTel)
> 컨텍스트:
> - [00-context/01-existing-decisions-audit.md](../../00-context/01-existing-decisions-audit.md)
> - [00-context/02-current-code-audit.md](../../00-context/02-current-code-audit.md)
> - [CLAUDE.md "멀티테넌트 BaaS 핵심 7원칙"](../../../../../CLAUDE.md)

---

## 0. TL;DR

8개 ACCEPTED ADR의 결정을 통합하면, yangpyeon-server는 다음 **5개 격리된 plane**으로 구성된다.

| Plane | 한 줄 정의 | 변경 빈도 | 핵심 ADR |
|-------|------------|----------|----------|
| ① **Tenant Manifest Registry** | "이 BaaS에 누가 살고, 무엇을 정의했는가"의 단일 진실 소스 | 컨슈머 추가 시 (월 0~1회) | ADR-026 |
| ② **Platform Core (불변 코어)** | Auth/Router/Cron Scheduler/Audit/RateLimit/Observability — 6개월에 한 번 변경 | 6개월 1회 | ADR-027/028/029 |
| ③ **Tenant Plugin System (가변 도메인)** | `packages/tenant-<id>/` workspace + `SimpleTenant` DB row의 hybrid | 컨슈머별 자유 | ADR-024 |
| ④ **Data Plane (격리 데이터)** | PostgreSQL 단일 인스턴스 + RLS + tenant_id 1급 컬럼 + SeaweedFS prefix 격리 | 마이그레이션 시 | ADR-023 |
| ⑤ **Operations Plane (1인 운영)** | Operator Console + Tenant Console + Auto-recovery + per-tenant SLO | 운영 진화 시 | ADR-025/029 |

**5-Plane이 함께 보장하는 7원칙** (CLAUDE.md):
1. Tenant 1급 시민 → Plane ④가 schema 강제, Plane ②가 router 강제
2. 플랫폼/컨슈머 영구 분리 → Plane ② vs Plane ③ 경계
3. 한 컨슈머 실패 격리 → Plane ②의 worker pool + Plane ④의 RLS
4. 컨슈머 추가 = 코드 0줄 → Plane ①의 manifest + Plane ②의 dynamic dispatch
5. 셀프 격리 + 자동 복구 + 관측성 3종 → Plane ② + Plane ⑤
6. 불변 코어, 가변 plugin → Plane ② vs Plane ③
7. 1인 운영 N=20 상한 → Plane ⑤의 자동화 도구 합

---

## 1. 5-Plane 통합 다이어그램

```
                                 외부 컨슈머 (Almanac SPA, JobBoard, ...)
                                              │
                                              ▼
                                  https://stylelucky4u.com
                                              │
                                              ▼
                       ┌──────────────────────────────────────────┐
                       │       Cloudflare Edge (Anycast)         │
                       │   Tunnel: 2e18470f-... (single ingress)  │
                       └──────────────────────────────────────────┘
                                              │
                                              ▼
                       ┌──────────────────────────────────────────┐
                       │   WSL2 Ubuntu (단일 호스트, ADR-025 A)   │
                       │   PM2 fork (→ Phase 16 cluster:4 진화)   │
                       └──────────────────────────────────────────┘
                                              │
                                              ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                       yangpyeon-server (단일 Next.js 앱)                            │
│                                                                                     │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │ ① TENANT MANIFEST REGISTRY                                                   │   │
│  │  ─────────────────────────────────────────────────────────────────────────  │   │
│  │   ┌─────────────────────────┐   ┌──────────────────────────────────────┐   │   │
│  │   │ packages/tenant-*/       │   │  DB: tenants 테이블 (운영 토글)      │   │   │
│  │   │   manifest.ts (정적)     │ + │   - status (active/suspended/...)   │   │   │
│  │   │   - id, owner, schemas  │   │   - cronOverrides JSONB             │   │   │
│  │   │   - cron[], routes[]    │   │   - quotaOverrides JSONB            │   │   │
│  │   │   - permissions, quota  │   │   - apiKeys 발급                    │   │   │
│  │   │   - hooks               │   │                                      │   │   │
│  │   └─────────────────────────┘   └──────────────────────────────────────┘   │   │
│  │              ↓                                  ↓                            │   │
│  │              └──────────► EffectiveConfig ◄────┘                            │   │
│  │                       (manifest ⊕ DB override)                              │   │
│  └──────────────────────────────────────────────────────────────────────────────┘   │
│                                              ↓ provides config to ↓                 │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │ ② PLATFORM CORE (불변, 6개월 1회 변경)                                       │   │
│  │  ─────────────────────────────────────────────────────────────────────────  │   │
│  │   Auth Layer        Router Layer        Scheduler Layer    Cross-cutting    │   │
│  │   ─────────         ─────────────       ─────────────      ──────────────   │   │
│  │   - withAuth        - /api/v1/t/        - 60s tick         - withTenant     │   │
│  │   - withRole        -   <tenant>/...    - main thread      - audit-log      │   │
│  │   - verifyJWT       - dynamic dispatch  - advisory lock    -   (fail-soft)  │   │
│  │   - K3 API key      - resolveTenant     -   (tenant,job)   - rate-limit-db  │   │
│  │     (prefix+FK+xv)  -   FromPath        - worker pool      -   (tenant key) │   │
│  │                     - withTenant guard  -   threads x 8    - observability  │   │
│  │                                         - per-tenant cap     (tenantId 1급) │   │
│  │                                         - circuit breaker                   │   │
│  └──────────────────────────────────────────────────────────────────────────────┘   │
│              ↓ dispatches to ↓                          ↓ reads/writes ↓            │
│  ┌────────────────────────────────────────┐   ┌──────────────────────────────────┐  │
│  │ ③ TENANT PLUGIN SYSTEM (가변 도메인)   │   │ ④ DATA PLANE (격리 데이터)        │  │
│  │ ────────────────────────────────────── │   │ ──────────────────────────────── │  │
│  │  Complex tier (workspace):              │   │  PostgreSQL 17 (단일 인스턴스)    │  │
│  │   packages/tenant-almanac/              │   │   public schema (단일)           │  │
│  │   ├── manifest.ts                       │   │   ├── tenants (Plane ① FK)       │  │
│  │   ├── prisma/fragment.prisma            │   │   ├── users (tenant_id, RLS)    │  │
│  │   ├── src/handlers/{rss,html,...}       │   │   ├── api_keys (tenant_id, RLS)  │  │
│  │   ├── src/routes/{contents,...}         │   │   ├── sessions (tenant_id, RLS) │  │
│  │   └── src/admin/{sources,...}           │   │   ├── cron_jobs (tenant_id, RLS)│  │
│  │   packages/tenant-jobboard/             │   │   ├── content_* (tenant_id, RLS)│  │
│  │   ...                                   │   │   ├── audit_logs (tenant_id)    │  │
│  │                                         │   │   └── rate_limit_buckets        │  │
│  │  Simple tier (manifest row):            │   │                                  │  │
│  │   simple_tenants 테이블                  │   │  RLS 정책 (모든 tenant 테이블):    │  │
│  │   - id, cronHandlers (JSON)             │   │   USING (tenant_id =             │  │
│  │   - routes (JSON)                       │   │     current_setting(             │  │
│  │   - isolated-vm v6 (보안)                │   │       'app.tenant_id')::uuid)   │  │
│  │                                         │   │   FORCE RLS (superuser 외 우회 X)│  │
│  │  Prisma schema 병합:                     │   │                                  │  │
│  │   pnpm tenant:assemble-schema            │   │  SQLite (audit/metrics):         │  │
│  │   → apps/web/prisma/schema.prisma       │   │   audit_logs (tenant_id 컬럼)    │  │
│  │   (codegen, gitignored)                 │   │   metrics_history (tenant_id)   │  │
│  │                                         │   │   tenant_metrics_history (신규) │  │
│  │  Cron registry 변경:                     │   │                                  │  │
│  │   kind === "TENANT" 분기                │   │  SeaweedFS (Storage):            │  │
│  │   → tenantRegistry.get(tenantId)        │   │   /<tenant_slug>/<file_id>       │  │
│  │     .cronHandlers[module]               │   │   prefix 격리                    │  │
│  └────────────────────────────────────────┘   └──────────────────────────────────┘  │
│                                              ↓ observed by ↓                        │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │ ⑤ OPERATIONS PLANE (1인 운영, ADR-025/029)                                   │   │
│  │  ─────────────────────────────────────────────────────────────────────────  │   │
│  │   Operator Console (글로벌 운영자)        Tenant Console (per-tenant)         │   │
│  │   ──────────────────────────────         ─────────────────────────────       │   │
│  │   /admin/tenants                          /admin/(<tenant>)/dashboard        │   │
│  │     - 모든 tenant health 한눈에            - tenant 자체 cron/api-key/log    │   │
│  │     - "어느 tenant가 아픈가" 30초 답       - quota 사용량                     │   │
│  │     - error rate 1h, p95, cron success    - emergency kill switch            │   │
│  │     - audit-failure 카운터 (ADR-021)                                         │   │
│  │                                                                              │   │
│  │   Auto-recovery (자동 복구):                                                  │   │
│  │     - audit fail-soft (ADR-021): 도메인 응답 깨지지 않음                     │   │
│  │     - migration self-heal (ADR-021 §2.2): 부팅 시 자동 적용                  │   │
│  │     - circuit breaker (ADR-028): 5회 연속 실패 시 cron 자동 비활성           │   │
│  │     - audit-failure 카운터 → Slack 알람                                      │   │
│  │                                                                              │   │
│  │   SLO (per-tenant):                                                          │   │
│  │     - api-availability 99.5% / 30d                                           │   │
│  │     - cron-success-rate 95% / 7d                                             │   │
│  │     - p95 latency < 200ms                                                    │   │
│  │     - error budget 추적 → 초과 시 운영자에게 표면화                          │   │
│  └──────────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 각 Plane 책임 정의

### Plane 1 — Tenant Manifest Registry

**책임**: "이 BaaS 위에 누가 살고, 그가 무엇을 정의했는가"의 단일 진실 소스. Plane ②~⑤의 모든 동작이 이 Registry를 입력으로 받는다.

**데이터** (ADR-026):
- **정적 (코드)**: `packages/tenant-<id>/manifest.ts` — `defineTenant({...})`로 선언
  - id (slug, immutable), name, owner, createdAt
  - data.schemas, data.isolation (`row-level-rls`)
  - cron[] (id, schedule, handler 함수 ref, payload, timeoutMs)
  - routes[] (method, path, handler 함수 ref, auth, rateLimit)
  - permissions (role → 권한 패턴)
  - quota (rateLimit, storage, cronTicks, llm, fetch.allowedHosts)
  - hooks (onProvision, onUpgrade, onDecommission)
- **동적 (DB `tenants` 테이블)**: 운영 토글
  - status (active/suspended/archived)
  - cronOverrides JSONB (job별 enabled toggle)
  - quotaOverrides JSONB (rate limit override)
  - apiKeys 발급 메타

**인터페이스**:
```typescript
// 정적 + 동적 merge
computeEffectiveConfig(manifest: TenantManifest, tenantRow: Tenant): EffectiveConfig
// Plane ②/③/⑤가 호출
resolveTenantFromPath(slug: string): Promise<EffectiveConfig | null>
listActiveTenants(): Promise<EffectiveConfig[]>
```

**의존성**: Plane ④(DB tenants 테이블)에 storage. Plane ②~⑤에 input 제공. **상위 의존 없음**.

**불변식**:
- 조직 3단계(Org/Project/Tenant) 도입 금지. tenant 1개 = 격리 단위 1개. (ADR-001 §3.2.4 정신 보존)
- 정의는 코드, 토글은 DB. 두 진실 소스가 책임 분리되며 서로의 영역을 침범하지 않는다.
- manifest.id (slug)는 immutable. 변경 시 K3 API key prefix 전체 재발급 필요.

---

### Plane 2 — Platform Core (불변 코어)

**책임**: 모든 tenant가 공유하는 인증·라우팅·스케줄링·감사·rate limit·observability. **6개월에 한 번만 변경**되는 안정 코어.

**구성 요소**:

| 모듈 | 위치 | 역할 |
|------|------|------|
| Auth Layer | `src/lib/auth.ts`, `src/lib/auth/keys.ts` | JWT 검증, K3 API key (prefix + DB FK + cross-validation) |
| Router Layer | `src/app/api/v1/t/[tenant]/[...path]/route.ts` | Next.js dynamic catch-all, `/api/v1/t/<tenant>/...` |
| Tenant Guard | `src/lib/api-guard-tenant.ts` | `withTenant()` 신규 가드 (ADR-027 §5.2). 기존 `withAuth`/`withRole`은 무수정 공존 |
| Scheduler | `src/lib/cron/registry.ts` (재구조화) | 60s tick, advisory lock `hash(tenantId, jobId)` 복합 키 |
| Worker Pool | `src/lib/cron/worker-pool.ts` (신규, Phase 1 ~40h) | `node:worker_threads` × 8, per-tenant concurrency cap, jobTimeoutMs, jobMemoryLimitMb, circuit breaker |
| Audit | `src/lib/audit-log-db.ts` (ADR-021) | `safeAudit(entry, context?)` — 시그니처 불변, 내부 자동 tenantId 주입 |
| Rate Limit | `src/lib/rate-limit-db.ts` | `buildBucketKey()`에 tenantId 차원 추가 (`<tenant>:v1Login:ip:1.2.3.4`) |
| Observability | `src/lib/audit-metrics.ts` (확장), 신규 `tenant-metrics-collector.ts` | tenant_id 1급 차원, MAX_BUCKETS_PER_TENANT 100 |

**인터페이스**:
- HTTP ingress: `withTenant(handler)` — request → resolveTenant → K3 verify → handler(request, user, tenant)
- Cron dispatch: `dispatchTenantJob(tenantId, job)` → 5단계 정책(circuit/concurrency/budget/exec/circuit-update)
- Data access: `withTenantTx(tenantId, async (tx) => ...)` — `SET LOCAL app.tenant_id = '<id>'` 후 RLS 강제

**의존성**:
- 입력: Plane ①(EffectiveConfig)
- 출력: Plane ③의 handler 함수 호출, Plane ④의 PG/SQLite 읽기/쓰기, Plane ⑤로 audit/metric 송출

**불변식**:
- `withTenant()` 가드 없이는 어떤 tenant 데이터도 접근 불가 (ESLint custom rule + e2e RLS 테스트로 강제)
- audit fail-soft 보존 (ADR-021): 도메인 임계 경로 응답을 절대 깨뜨리지 않음
- ADR-002 의존성 최소: Redis 등 외부 인프라 추가 금지 (worker pool은 Node 표준 `worker_threads`만 사용)

---

### Plane 3 — Tenant Plugin System (가변 도메인)

**책임**: 컨슈머별 도메인 코드(handler, route, admin UI, Prisma fragment)를 Plane ②와 영구 분리하여 격리한다. 6개월에 한 번 변경되는 코어와 달리 **컨슈머별 자유 진화**.

**구성 (ADR-024 hybrid)**:

| Tier | 정의 | 격리 방식 | 예시 |
|------|------|----------|------|
| **Complex** (workspace) | npm dep ≥1, Prisma model ≥2, 코드 ≥200줄, admin UI ≥1 | `packages/tenant-<id>/` workspace 패키지 | Almanac, JobBoard, DailyBriefing |
| **Simple** (manifest) | 위 4조건 모두 미달 | `simple_tenants` DB row + isolated-vm v6 (ADR-002 EdgeFunction 인프라 재활용) | StatusPing, PriceWatcher, FormCollector |

**Workspace 구조** (Complex):
```
packages/tenant-<id>/
├── manifest.ts              # Plane ① 정적 정의 (defineTenant)
├── prisma/fragment.prisma   # Plane ④ 데이터 정의 (tenant_<id>_* 또는 RLS 모델)
├── src/
│   ├── handlers/            # cron handler 함수 (Plane ②가 dynamic dispatch)
│   ├── routes/              # API route handler (Plane ②가 router 통해 dispatch)
│   ├── admin/               # Next.js admin UI page (route group으로 마운트)
│   └── seed.ts
└── package.json             # name: "@yangpyeon/tenant-<id>", workspace dep: "@yangpyeon/core"
```

**Prisma schema 병합**:
```bash
pnpm tenant:assemble-schema
# packages/core/prisma/schema.prisma + packages/tenant-*/prisma/fragment.prisma
# → apps/web/prisma/schema.prisma (codegen, gitignored)
pnpm prisma generate
```

**Admin UI 통합** (Next.js App Router):
```
apps/web/app/admin/
├── (core)/                  # /admin/tenants, /admin/users, /admin/audit-logs
├── (almanac)/               # @yangpyeon/tenant-almanac/admin/* re-export
└── (jobboard)/
```

**인터페이스 (Plane ②와의 계약)**:
```typescript
// packages/core/src/lib/cron/runner.ts
if (job.kind === "TENANT") {
  const handler = tenantRegistry.get(tenantId)?.cronHandlers[module];
  return await handler(payload, ctx);
}

// 라우트 등록은 manifest codegen으로 apps/web/app/api/v1/t/<tenant>/<path> 생성
```

**의존성**:
- 입력: Plane ②(`@yangpyeon/core`의 prisma client, withTenant, audit, rate-limit 등 import)
- 출력: Plane ④(자기 tenant scope 데이터 read/write), Plane ⑤(audit/metric 송출)
- **금지**: 다른 tenant의 코드/데이터 import 금지 (ESLint rule)

**불변식**:
- core가 tenant를 import하면 안 됨 (단방향 의존, manifest registry는 런타임 dynamic import만)
- tenant 코드가 `withTenant()` 가드를 우회하면 안 됨 (lint + e2e 테스트)
- Almanac은 v1.0 출시 후 Phase 16에서 `packages/tenant-almanac/`로 마이그레이션 (ADR-024 §4.3, ADR-027 §10)

---

### Plane 4 — Data Plane (격리 데이터)

**책임**: 단일 PostgreSQL/SQLite/SeaweedFS 위에서 N=10~20 tenant 데이터를 RLS로 격리. **schema 강제로 cross-tenant 유출 차단**.

**구성 (ADR-023 옵션 B)**:

| 저장소 | 격리 메커니즘 | 위치 |
|--------|--------------|------|
| **PostgreSQL 17** | shared schema + RLS (`USING (tenant_id = current_setting('app.tenant_id')::uuid)`) + FORCE RLS | 단일 인스턴스 (ADR-025 A) |
| **SQLite (audit/metrics)** | `tenant_id` 컬럼 + 인덱스 `(tenant_id, timestamp DESC)` | `data/yangpyeon.sqlite` |
| **SeaweedFS** | path prefix `/<tenant_slug>/<file_id>` | 단일 인스턴스 (Wave 1, ADR-008 보존) |

**핵심 패턴**:
```typescript
// Plane ②의 withTenantTx가 호출
await prisma.$transaction(async (tx) => {
  await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenantId}'`);
  return fn(tx);  // RLS가 모든 query에 자동 WHERE tenant_id = ?
});
```

**인덱싱 정책**:
- 모든 자주 쿼리되는 인덱스의 leading column = `tenant_id`
- 예: `(tenant_id, email)`, `(tenant_id, folder_id)`, `(tenant_id, user_id, expires_at)`
- 기존 `(user_id, ...)` 인덱스는 `(tenant_id, user_id, ...)`로 재설계 (SP-015 재실측 필요)

**보안 보강 (ADR-023 §10 결정 ~28h 추가 공수)**:
- `withTenant()` 래퍼 — 모든 query에 tenant_id WHERE 자동 추가
- ESLint custom rule — raw SQL에 tenant_id 누락 검출
- RLS 정책 e2e 테스트 — cross-tenant leak 방지 자동 검증
- `BYPASSRLS` 권한은 마이그레이션 role만 보유, app role 차단

**인터페이스**:
- Read/write: Plane ②의 `withTenantTx(tenantId, fn)` 경유 (직접 prisma 호출 금지)
- 마이그레이션: 표준 `prisma migrate deploy` (단일 schema이므로 runner 불요)
- 백업: 클러스터 단위 wal-g (테넌트 단위 export는 자체 스크립트 — ADR-023 §3.4 단점)

**의존성**:
- 입력: Plane ②의 query (모두 `app.tenant_id` GUC 설정 필수)
- 출력: 없음 (저장소)

**불변식**:
- Wave 1 SeaweedFS / wal2json 결정 변경 금지 (ADR-023 §1.2)
- 모든 비즈니스 모델에 `tenantId` 첫 컬럼 강제 (CLAUDE.md 7원칙 #1)
- `BYPASSRLS` role은 마이그레이션 시점에만 사용

---

### Plane 5 — Operations Plane (1인 운영)

**책임**: 1인 운영자가 N=20 tenant를 감당 가능하도록 가시성·자동복구·SLO 추적을 제공. "30초 안에 어느 tenant가 아픈지 답할 수 있는가?"

**구성**:

#### 5.1 Operator Console (글로벌 운영자, Phase 14.5 18h)
- `/admin/tenants` — 모든 tenant health 한눈에 (10~20 row 테이블)
- 컬럼: tenant_id, status, error_rate_1h, p95_latency, cron_success_rate, last_error, audit_failure_count
- 정렬: `error_rate_1h DESC` (아픈 tenant 상단)
- 1초 내 클릭으로 tenant detail로 점프

#### 5.2 Tenant Console (per-tenant, Phase 17~19)
- `/admin/(<tenant>)/dashboard` — tenant 자체 운영 화면
- cron 실행 로그, API key 사용량, quota 소진율
- emergency kill switch: `UPDATE tenants SET status='suspended' WHERE id='<tenant>'`

#### 5.3 Auto-recovery (ADR-021/028 통합)
- **audit fail-soft** (ADR-021): try/catch + safeAudit, 도메인 응답 깨지지 않음
- **migration self-heal** (ADR-021 §2.2): 부팅 시 `applyPendingMigrations()` 자동 실행
- **circuit breaker** (ADR-028 §6.2): consecutive_failures ≥ 5 시 cron 자동 비활성, 5분 cooldown 후 HALF_OPEN
- **audit-failure 카운터** (ADR-021 §amendment-1): `/api/admin/audit/health` → 1분당 5+ 시 Slack 알람

#### 5.4 Per-tenant SLO (ADR-029)
```yaml
tenant: almanac
slos:
  - name: api-availability
    target: 99.5%
    window: 30d
  - name: cron-success-rate
    target: 95%
    window: 7d
  - name: p95-latency
    target: 200ms
    window: 1h
```
- error budget 추적 → 초과 시 운영자 표면화 (Operator Console 빨간 표시)

#### 5.5 Observability 3-pillar (M1+L1+T3, ADR-029)
- **Metrics (M1)**: SQLite `tenant_metrics_history` (신규) + `metrics_history` 확장. 1분 aggregate 30d, 1h aggregate 1y, 1d aggregate 5y
- **Logs (L1)**: SQLite `audit_logs` + tenant_id 컬럼 (ADR-021 amendment-2)
- **Traces (T3)**: `x-request-id` + AsyncLocalStorage correlation. 의존성 0
- **Phase 4 진화**: N=10 도달 또는 cross-tenant 유출 의심 인시던트 발생 시 OTel SDK + Jaeger/Tempo 도입

**의존성**:
- 입력: Plane ②의 audit/metric/cron 이벤트, Plane ④의 SQLite/PG row count
- 출력: 인간 운영자 (UI), Slack 알람

**불변식**:
- "tenant 차원이 없는 신호는 1인 운영자에게 무용하다" (ADR-029 first-class invariant)
- ADR-021 cross-cutting fail-soft 100% 보존 — observability가 도메인 응답을 깨면 안 됨

---

## 3. Plane 간 통신 패턴

### 3.1 요청 → 응답 시퀀스 (Almanac `/api/v1/t/almanac/contents` GET 예시)

```
[Client]
  GET /api/v1/t/almanac/contents
  Authorization: Bearer pub_alm_a1b2c3d4...
  X-Request-Id: req-abc-123
       │
       ▼
[Cloudflare Edge → Tunnel → WSL2 PM2]
       │
       ▼
[Next.js dispatch]
  apps/web/app/api/v1/t/[tenant]/contents/route.ts
       │
       ▼
[Plane ② Router Layer — withTenant 가드]
  1. params.tenant = "almanac" 추출
  2. resolveTenantFromPath("almanac")  ─────────► [Plane ① Manifest Registry]
                                                   manifest.ts + tenants row → EffectiveConfig
  3. K3 API key 검증:
     - prefix 파싱: pub_alm_*
     - DB lookup: prisma.apiKey.findUnique({prefix})
     - argon2.verify(hash, rawKey)
     - cross-validation: prefix slug == DB tenant slug == path tenant
     - 실패 시 audit("cross_tenant_attempt") + 403
  4. AsyncLocalStorage에 traceId(req-abc-123) + tenantId 주입
       │
       ▼
[Plane ② Audit] safeAudit({event: "api.request", tenantId, ...})  (fail-soft)
       │
       ▼
[Plane ③ Tenant Plugin — Almanac handler 호출]
  packages/tenant-almanac/src/routes/contents.ts → GET()
       │
       ▼
[Plane ② withTenantTx 래퍼]
  prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '<almanac uuid>'`);
       │
       ▼
[Plane ④ Data Plane — RLS 강제]
  SELECT * FROM contents WHERE ...
  ↓ RLS 자동 추가:
  AND tenant_id = current_setting('app.tenant_id')::uuid
       │
       ▼
[Plane ② audit/metric 송출]  ─────► [Plane ⑤ Operations]
  - audit_logs INSERT (tenant_id, event, traceId)
  - tenant_metrics_history bucket++
       │
       ▼
[Response] 200 OK { items: [...], tenant: "almanac" }
```

### 3.2 Cron 실행 시퀀스 (Almanac rss-fetch 매 15분)

```
[Plane ② Scheduler] (60s setInterval tick)
  - prisma.cronJob.findMany() — due jobs 추출
  - 각 job에 대해:
       │
       ▼
[Plane ② Advisory Lock]
  - lockKey = hash("tenant:almanac:job:rss-fetch")  # ADR-028 전략 1
  - SELECT pg_try_advisory_lock($lockKey)
  - false → 다른 PM2 worker가 잡음, 종료
  - true → dispatch
       │
       ▼
[Plane ② Worker Pool — dispatchTenantJob]
  1. circuit breaker 체크 (OPEN → skip)
  2. concurrency cap (countRunning ≥ maxConcurrent → skip)
  3. daily budget (countTicksToday ≥ ticksPerDay → skip)
  4. dispatch to worker_thread
       │
       ▼
[Plane ③ Tenant Handler — worker thread 내부]
  packages/tenant-almanac/src/handlers/rss-fetcher.ts
  - resourceLimits.maxOldGenerationSizeMb = 128
  - timeout 5min
  - allowedFetchHosts = manifest.quota.fetch.allowedHosts
       │
       ▼
[Plane ② Worker thread → Plane ④ DB write]
  - withTenantTx → INSERT INTO content_ingested_items
       │
       ▼
[Plane ② Circuit update + audit]
  - 성공: consecutiveFailures = 0
  - 실패/타임아웃: consecutiveFailures++; if ≥ 5 then OPEN
  - safeAudit({event: "cron.complete", tenantId, jobId, duration})
       │
       ▼
[Plane ⑤ Operator Console 갱신]
  - cron_success_rate 계산 → SLO 비교 → 빨간 표시 가능
```

### 3.3 신규 tenant 등록 시퀀스 (운영자 작업)

```
[운영자]
  1. packages/tenant-jobboard/manifest.ts 작성 (defineTenant)
  2. packages/tenant-jobboard/prisma/fragment.prisma 작성
  3. pnpm tenant:assemble-schema
  4. pnpm prisma generate
  5. pnpm prisma migrate deploy  (RLS 정책 추가 마이그레이션)
  6. git commit + push
  7. ADR-020 standalone + rsync + pm2 reload
  8. INSERT INTO tenants (id, status, owner_id) VALUES ('jobboard', 'active', '...')
       │
       ▼
[Plane ② startup hook — manifest registry 재로드]
  - packages/tenant-*/manifest.ts glob → registry 갱신
  - cron registry에 jobboard 추가
  - router catch-all이 /api/v1/t/jobboard/* 자동 인식
       │
       ▼
[Plane ⑤ Operator Console]
  - /admin/tenants에 jobboard row 추가
  - SLO 적용 시작
```

→ **"컨슈머 추가 = 코드 수정 0줄"** 원칙 (CLAUDE.md #4) 충족. core 코드 변경 없음.

---

## 4. 7원칙 매핑

| # | CLAUDE.md 원칙 | 어느 Plane이 보장 | 메커니즘 |
|---|--------------|---------------|---------|
| 1 | Tenant는 1급 시민, prefix가 아니다 | Plane ④ + Plane ② | 모든 모델에 tenant_id 컬럼 + RLS USING/WITH CHECK + withTenant 가드 + ESLint custom rule |
| 2 | 플랫폼 코드와 컨슈머 코드 영구 분리 | Plane ② vs Plane ③ | `packages/core` (불변) vs `packages/tenant-*` (가변), 단방향 의존, manifest registry는 런타임 dynamic import만 |
| 3 | 한 컨슈머 실패는 다른 컨슈머에 닿지 않는다 | Plane ② + Plane ④ | worker_threads pool isolation + per-tenant concurrency cap + circuit breaker + RLS FORCE + worker.terminate() 5초 강제 |
| 4 | 컨슈머 추가는 코드 수정 0줄 | Plane ① + Plane ② | manifest.ts + DB row 추가 만으로 router(catch-all)/cron(dynamic dispatch)/auth(K3 prefix) 자동 구성 |
| 5 | 셀프 격리 + 자동 복구 + 관측성 = 3종 세트 동시 | Plane ② + Plane ⑤ | (격리) worker pool + RLS / (복구) circuit breaker + audit fail-soft + migration self-heal / (관측성) tenant_id 1급 + Operator Console |
| 6 | 불변 코어, 가변 plugin | Plane ② vs Plane ③ | core는 6개월 1회 변경, plugin은 컨슈머별 자유 진화. core가 plugin import 금지 (단방향) |
| 7 | 1인 운영 N=20 상한 | Plane ⑤ + Plane ① | manifest 자동화 + Operator Console 30초 답 + auto-recovery + per-tenant SLO 추적 |

---

## 5. 8 ADR과 5-Plane 매핑

| ADR | 주제 | 결정 (옵션) | 어느 Plane | Plane 내 역할 |
|-----|------|-----------|-----------|--------------|
| **ADR-022** | BaaS 정체성 재정의 | A: closed multi-tenant | (전 plane) | 5-Plane 구조 자체의 정당성. ADR-001 §3.1, §3.2.1~3.2.5, §6.1, §6.3 부분 supersede |
| **ADR-023** | 데이터 격리 | B: shared schema + RLS | Plane ④ | RLS 정책 + tenant_id 컬럼 + `app.tenant_id` GUC. withTenant 래퍼 ~28h 보강 |
| **ADR-024** | Plugin 코드 격리 | D: hybrid (workspace + manifest) | Plane ③ | Complex = `packages/tenant-*/` workspace, Simple = `simple_tenants` row + isolated-vm |
| **ADR-025** | 인스턴스 모델 | A: 단일 인스턴스 (Phase 1~3) | (전 plane 토폴로지) | 단일 PM2 + 단일 PG + 단일 Tunnel 유지. §5.2 코드 추상화 5종 즉시 도입 (tenant context / plugin / cron worker / getPool / observability tenantId) |
| **ADR-026** | Tenant Manifest | C: TS manifest.ts + DB 운영 토글 | Plane ① | `defineTenant()` + Tenant 모델 + computeEffectiveConfig() |
| **ADR-027** | Multi-tenant Router | A (path) + K3 (prefix+FK+xv) | Plane ② | `/api/v1/t/<tenant>/...` + withTenant() 신규 가드 + verifyApiKey 3중 방어 |
| **ADR-028** | Cron Worker Pool | D: hybrid (worker_threads → pg-boss) | Plane ② | `node:worker_threads` × 8 + per-tenant cap + circuit breaker + advisory lock `hash(tenantId, jobId)` |
| **ADR-029** | Per-tenant Observability | M1+L1+T3 → Phase 4 OTel | Plane ⑤ | SQLite metrics + audit_logs.tenant_id (ADR-021 amendment-2) + AsyncLocalStorage traceId |

**보존되는 기존 ADR** (모두 무효화 없음):
- ADR-002 (Supabase 적응 — 의존성 최소): Plane ② worker pool은 `worker_threads`만 사용, Redis 거부
- ADR-018 (9-레이어 아키텍처): 전 plane에 보존, 각 레이어에 tenant 차원만 주입
- ADR-020 (standalone + rsync + pm2 reload): Plane ⑤ 배포 메커니즘으로 100% 보존
- ADR-021 (audit cross-cutting fail-soft): Plane ② audit 모듈이 그대로 사용, amendment-2로 tenant_id 자동 주입

---

## 6. Tech Stack 통합

| Plane | 기술 | 라이브러리 | 의존성 (신규/기존) |
|-------|------|-----------|------------------|
| ① Manifest Registry | TypeScript + Zod | `zod` | 기존 |
| ② Platform Core — Auth | jose JWT (ES256), argon2id (SP-011) | `jose`, `@node-rs/argon2` | 기존 |
| ② Platform Core — Router | Next.js 16 dynamic catch-all | `next` | 기존 |
| ② Platform Core — Scheduler | node-cron (matchesSchedule), PG advisory lock | `node-cron`, `pg` | 기존 |
| ② Platform Core — Worker Pool | `node:worker_threads` (Node 표준) | (Node built-in) | **신규** (라이브러리 추가 0) |
| ② Platform Core — Audit | Drizzle ORM (SQLite) | `drizzle-orm`, `better-sqlite3` | 기존 |
| ② Platform Core — Rate Limit | Drizzle (PG 또는 SQLite) | `drizzle-orm` | 기존 |
| ③ Tenant Plugin | pnpm workspaces + Turborepo | `pnpm`, `turbo` | **신규** (모노레포 도입) |
| ③ Tenant Plugin — Edge (Simple) | isolated-vm v6 (ADR-002 보존, SP-012) | `isolated-vm` | 기존 |
| ④ Data Plane — PostgreSQL | Prisma 7 + Client Extensions + RLS | `prisma`, `@prisma/client` | 기존 |
| ④ Data Plane — SQLite | Drizzle (audit/metrics) | `drizzle-orm`, `better-sqlite3` | 기존 |
| ④ Data Plane — Storage | SeaweedFS (ADR-008, Wave 1) | (HTTP API) | 기존 |
| ④ Data Plane — Realtime CDC | wal2json (ADR-010, SP-013) | (PG extension) | 기존 |
| ⑤ Operations — Console | React Server Component + shadcn/ui | `next`, `@radix-ui/*` | 기존 |
| ⑤ Operations — Observability (Phase 1~3) | SQLite + AsyncLocalStorage | (Node built-in) | 기존 |
| ⑤ Operations — Observability (Phase 4) | OpenTelemetry SDK + Jaeger/Tempo | `@opentelemetry/sdk-node`, `@opentelemetry/auto-instrumentations-node` | **Phase 4 신규** (트리거 기반 예약) |
| 인프라 | WSL2 Ubuntu + PM2 + Cloudflare Tunnel | `pm2`, `cloudflared` | 기존 |

**ADR-002 의존성 정책 준수 검증**: Phase 1~3에 추가되는 신규 의존성은 `pnpm`/`turbo`(빌드 도구) + Node 표준 `worker_threads`(라이브러리 0). Redis/BullMQ/Prometheus 등 외부 인프라 추가 없음.

---

## 7. Almanac 첫 컨슈머 적용 시나리오

Almanac은 본 BaaS의 **첫 번째 Complex tier 컨슈머**다. 5-Plane 위에서 어떻게 위치하는지 시퀀스로 정리한다.

### 7.1 등록 절차 (코드 수정 0줄, Phase 16 마이그레이션 시점)

**Step 1 — Plane ③에 workspace 패키지 생성**:
```
packages/tenant-almanac/
├── manifest.ts             # ADR-026 §6 예시 그대로
├── prisma/fragment.prisma  # ContentSource, ContentItem 등 6개 모델
├── src/handlers/
│   ├── rss-fetcher.ts      # spec/aggregator-fixes의 src/lib/aggregator/fetchers/rss.ts에서 이동
│   ├── html-scraper.ts
│   ├── api-poller.ts
│   ├── classifier.ts       # Gemini Flash 호출
│   └── promoter.ts
├── src/routes/
│   ├── contents.ts
│   ├── categories.ts
│   ├── sources.ts
│   ├── today-top.ts
│   └── items.ts
├── src/admin/{sources,categories,items,dashboard}/
└── package.json            # rss-parser, cheerio, @google/genai
```

**Step 2 — Plane ① manifest 작성** (`manifest.ts`):
```typescript
export default defineTenant({
  id: "almanac",
  name: "Almanac Content Aggregator",
  owner: { userId: "<admin-uuid>", email: "smartkdy7@naver.com" },
  data: { schemas: ["./prisma/fragment.prisma"], isolation: "row-level-rls" },
  cron: [
    { id: "rss-fetch", schedule: "*/15 * * * *", handler: rssFetcher, timeoutMs: 5*60_000 },
    { id: "classify",  schedule: "*/5 * * * *",  handler: classifier,  timeoutMs: 4*60_000 },
    // ...
  ],
  routes: [
    { method: "GET", path: "/contents",   handler: contentsRoute.GET, auth: "publishable", rateLimit: { rpm: 600 } },
    // ...
  ],
  permissions: { publishable: ["read:contents", ...], admin: ["read:*", ...] },
  quota: { rateLimit: { withApiKey: 600 }, fetch: { allowedHosts: ["*.openai.com", ...] } },
});
```

**Step 3 — Plane ④ schema 마이그레이션**:
```bash
pnpm tenant:assemble-schema    # core + almanac fragment → apps/web/prisma/schema.prisma
pnpm prisma generate           # client 재생성
pnpm prisma migrate deploy     # content_* 테이블 + RLS 정책 적용
```

**Step 4 — Plane ① DB row 추가**:
```sql
INSERT INTO tenants (id, status, owner_id) VALUES ('almanac', 'active', '<admin-uuid>');
```

**Step 5 — Plane ⑤ 배포**:
```bash
# ADR-020 standalone + rsync + pm2 reload (8단계 wsl-build-deploy.sh)
```

→ **core 코드 변경 0줄**. Plane ②의 router catch-all + cron registry가 manifest를 자동 인식.

### 7.2 첫 요청 흐름 (`GET /api/v1/t/almanac/contents`)

§3.1 시퀀스 그대로 적용. Almanac SPA가 `Authorization: Bearer pub_alm_<random>` 헤더로 호출 → withTenant 가드 통과 → Almanac handler 호출 → `withTenantTx`로 RLS 강제 → 응답.

### 7.3 첫 cron 실행 (`rss-fetch` 매 15분)

§3.2 시퀀스 그대로. main thread scheduler tick → advisory lock `hash("tenant:almanac:job:rss-fetch")` → worker_thread dispatch → Almanac rssFetcher 함수 호출 → 60+ RSS source fetch → `withTenantTx`로 `INSERT INTO content_ingested_items` (RLS 자동 tenant_id 주입).

### 7.4 운영자 모니터링 (`/admin/tenants`)

Plane ⑤ Operator Console에 `almanac` row 표시:
```
| tenant   | status | err_1h | p95   | cron_success | last_error                   |
|----------|--------|--------|-------|--------------|------------------------------|
| almanac  | active | 0.2%   | 145ms | 98.3%        | rss-fetch: timeout (15:00)   |
```
"어느 tenant가 아픈가?" 질문에 30초 안에 답.

### 7.5 spec/aggregator-fixes와의 관계

- **현재 (2026-04-26)**: Almanac이 spec/aggregator-fixes 브랜치에서 `src/lib/aggregator/`, `src/app/api/v1/almanac/`, `src/app/admin/aggregator/`에 직접 통합 중
- **Almanac v1.0 출시**: spec 그대로 출시 (충돌 회피)
- **Phase 16 마이그레이션**: 위 §7.1 절차로 `packages/tenant-almanac/`로 이전 (~5 작업일, ADR-024 §4.1)
- **URL 변경**: `/api/v1/almanac/*` → `/api/v1/t/almanac/*` (ADR-027 §10 결정)

---

## 8. 향후 ADR-030+ 후보 (5-Plane 진화)

본 5-Plane 구조는 Phase 1~3을 완성한다. 다음은 Phase 4 이후 잠재적 ADR 후보 — **현재 결정 사항 아님**, 트리거 기반 예약.

### 8.1 ADR-030 후보 — DB Tier 분리 (Plane ④ 진화)
- **트리거**: ADR-022 §9.2 (단일 PG connection pool 80% 초과 OR p95 200ms sustained 1주)
- **검토 옵션**: VIP tenant만 별도 PG 인스턴스 (ADR-025 옵션 B-2), 또는 read replica 도입
- **영향 plane**: Plane ④ (저장소 분리), Plane ②(`getPool(tenantId)` 추상화 활용)

### 8.2 ADR-031 후보 — Worker Tier 분리 (Plane ② 진화)
- **트리거**: ADR-025 §8 트리거 1 (PM2 cluster:4 적용 후 p95 200ms sustained 1주) OR cron worker pool 포화
- **검토 옵션**: ADR-028 Phase 3 (pg-boss 단계적 결합), 또는 별도 worker tier (ADR-025 옵션 D worker pool 진화)
- **영향 plane**: Plane ② Worker Pool, Plane ⑤ Operator Console (worker tier 별 health)

### 8.3 ADR-032 후보 — OpenTelemetry 도입 (Plane ⑤ 진화)
- **트리거**: ADR-029 §6.4 트리거 D ((a) cross-tenant 유출 의심 인시던트 OR (b) p99 root cause 식별 실패 월 3회+ OR (c) tenant N ≥ 10)
- **검토 옵션**: Phase 4 OTel SDK + Jaeger/Tempo (ADR-029 §5 Phase 4 결정)
- **영향 plane**: Plane ⑤ (Tracing 추가), Plane ② (auto-instrumentation overhead +5~10ms p99)

### 8.4 ADR-033 후보 — Tier 분리 (Plane 전체)
- **트리거**: ADR-025 §8 트리거 2 (VIP tenant 명시적 분리 요구)
- **검토 옵션**: ADR-025 옵션 B (free/vip 인스턴스 2개) 또는 옵션 C (per-consumer 인스턴스)
- **영향 plane**: Plane ②/④ 모두 영향 (Cloudflare Tunnel ingress 추가, DB 분리, ecosystem.config.cjs 2개)

### 8.5 ADR-034 후보 — Open SaaS 진화
- **트리거**: ADR-022 §9.3 트리거 A3 (한 tenant가 외부 사용자에게 공개 SaaS로 노출 결정)
- **검토 옵션**: 해당 tenant만 옵션 B 부분 도입 (per-tenant SaaS 모드) — 결제, SLA, 법적 문서
- **영향 plane**: 전 plane (특히 Plane ⑤에 결제/SLA/Support 추가)

### 8.6 ADR-035 후보 — Tenant 간 데이터 공유 시나리오
- **트리거**: ADR-027 §9.2 Q-2 (almanac → recipe로 data export 요구 발생)
- **검토 옵션**: Plane ③에 tenant 간 명시적 export API 정의, 또는 별도 plugin 시스템
- **영향 plane**: Plane ③ (plugin 인터페이스), Plane ④ (cross-tenant 명시 view), Plane ② (audit 강화)

---

## 부록 A — 5-Plane 격리 검증 체크리스트

| # | 검증 항목 | 어느 plane | 검증 방법 |
|---|----------|----------|----------|
| 1 | tenant_id 컬럼 누락 모델 0개 | Plane ④ | `pnpm db:check-tenant-id` (스크립트 신설) |
| 2 | RLS 정책 누락 테이블 0개 | Plane ④ | `SELECT tablename FROM pg_tables WHERE schemaname='public' AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = pg_tables.tablename)` |
| 3 | `withTenant()` 가드 누락 라우트 0개 | Plane ② | ESLint custom rule + e2e 테스트 |
| 4 | core가 packages/tenant-*를 import하는 코드 0개 | Plane ② vs ③ | ESLint import-order rule |
| 5 | cross-tenant API key 시도 audit 발생 0건 (정상 운영) | Plane ② + ⑤ | `SELECT count(*) FROM audit_logs WHERE event='cross_tenant_attempt' AND timestamp > NOW() - INTERVAL '7 days'` |
| 6 | per-tenant cron success rate ≥ 95% | Plane ⑤ | Operator Console SLO row |
| 7 | Operator Console "어느 tenant가 아픈가" 30초 내 답 가능 | Plane ⑤ | 운영자 직접 검증 |
| 8 | 컨슈머 추가 시 core 코드 변경 0줄 | Plane ① + ② | git log review |

---

## 부록 B — 변경 이력

- **2026-04-26 v1.0** (BaaS Foundation Wave Architecture sub-agent #1): 8 ADR ACCEPTED 결과 통합. 5-Plane 청사진 초안 작성. 후속 sub-agent들(데이터 모델, route layout, cron worker pool, observability schema 등)의 참조 단일 진실 소스.

---

> 본 문서는 5-Plane 경계 정의의 **단일 진실 소스**. 이후 04-architecture-wave/ 산출물(데이터 모델, route layout, sprint plan, migration plan 등)은 모두 본 문서를 참조한다. plane 경계의 실질적 변경이 필요하면 새 ADR로 갱신.
