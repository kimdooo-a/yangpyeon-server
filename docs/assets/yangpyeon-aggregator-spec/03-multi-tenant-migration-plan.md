# Almanac 멀티테넌트 마이그레이션 계획 (T0.5)

> 작성: 2026-04-26 세션 59 (Phase 0.5)
> 트리거: 세션 58 ADR-022~029 ACCEPTED → Almanac 정체성 변경
> 상위: [aggregator-spec README](README.md) → [02-applying-the-patch](02-applying-the-patch.md) → 여기

---

## 한 줄 요약

> Almanac aggregator spec v1.0 은 **단일테넌트 가정 그대로** 출시한다. ADR-022~029 멀티테넌트 BaaS 전환 결정에도 불구하고 spec 차단 X. 출시 후 Phase 1.6(`tenant_id` backfill) → Phase 2.5(`packages/tenant-almanac/`로 코드 이동) 단계로 점진 마이그레이션. 본 문서는 그 변경 지점(diff hotspots)을 사전 표시한다.

---

## 왜 이 노트가 필요한가

- 현재 spec/aggregator-fixes 브랜치(다른 터미널)는 v1.1 정합화 완료, 사용자 결정 시 spec 적용 단계.
- 본 터미널(세션 58)에서 ADR-022~029 8건이 ACCEPTED 되면서 yangpyeon 정체성이 "닫힌 멀티테넌트 BaaS(N=10~20)"로 재정의됨.
- 두 터미널의 작업이 **충돌하지 않으면서**도, Almanac 출시 후 plugin 마이그레이션이 매끄럽게 이어지도록 **변경 지점**을 사전에 표시하는 것이 본 노트의 목적.

---

## 변경 지점 요약 (Phase 별)

| Phase | 시점 | 변경 영역 | 책임 |
|-------|------|----------|------|
| Phase 0.5 (지금) | spec 적용 직전 | 본 문서 추가 — 변경 지점 표시 only | 본 터미널 |
| Almanac v1.0 출시 | 사용자 결정 시점 | spec 그대로 적용 (`tenant_id` 부재 OK) | aggregator-fixes 터미널 |
| Phase 0.4 (~1주 후) | BaaS 진입 | `audit_logs.tenant_id` nullable 추가 | 본 터미널 |
| Phase 1.6 | Phase 1 후반 (~6주 후) | `content_*` 테이블에 `tenant_id` 추가 → backfill `'almanac'` → NOT NULL | 본 터미널 |
| Phase 2.5 | Phase 2 후반 (~12주 후) | `apps/web/`의 Almanac 코드 → `packages/tenant-almanac/` 이동 | 본 터미널 |
| Phase 2.5 완료 후 | M3 게이트 직전 | `/api/v1/almanac/*` alias 종료 (410 Gone) | 본 터미널 |

---

## 1. ADR-023 옵션 B (shared+RLS) 영향

Almanac이 사용하는 모든 비즈니스 테이블에 `tenant_id` 컬럼 + RLS 정책 필요.

### 영향 받는 테이블 (5종)

| 테이블 | 현재 spec | Phase 1.6 변경 |
|--------|----------|--------------|
| `content_sources` | tenant_id 없음 | `tenant_id String? @db.Uuid` 추가 → backfill `'almanac' UUID` → NOT NULL |
| `content_categories` | tenant_id 없음 | 동일 |
| `content_ingested_items` | tenant_id 없음 | 동일 |
| `content_items` | tenant_id 없음 | 동일 |
| `content_item_metrics` | tenant_id 없음 | 동일 (FK 통해 자동 격리) |

### RLS 정책 추가 (Phase 1.4)

```sql
ALTER TABLE content_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_sources FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_select ON content_sources
  FOR SELECT USING (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE POLICY tenant_isolation_insert ON content_sources
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

-- update/delete 동일 패턴 — content_categories/ingested_items/items/metrics 모두 동일
```

### Prisma client extension (Phase 1.4)

`packages/core/src/db/with-tenant.ts` (예정):
```ts
export const tenantExtension = Prisma.defineExtension({
  query: {
    $allModels: {
      async $allOperations({ args, query }) {
        const ctx = getCurrentTenant(); // AsyncLocalStorage
        if (!ctx) throw new Error("Tenant context required");
        // 자동 tenant_id 주입 / WHERE 추가
        return query(args);
      },
    },
  },
});
```

---

## 2. ADR-024 옵션 D (hybrid plugin) 영향

Almanac aggregator 코드를 `packages/tenant-almanac/`로 이동.

### 이동 대상 (Phase 2.5)

| 현재 위치 (apps/web/) | Phase 2.5 위치 (packages/tenant-almanac/) |
|--------------------|-----------------------------------------|
| `src/lib/aggregator/` | `packages/tenant-almanac/src/aggregator/` |
| `src/app/api/v1/almanac/*` | `packages/tenant-almanac/src/routes/*` (manifest 등록) |
| `src/app/admin/aggregator/*` | `packages/tenant-almanac/src/admin/*` (manifest 등록) |
| `prisma/schema.prisma` 의 `content_*` 5 모델 | `packages/tenant-almanac/prisma/fragment.prisma` |
| `package.json` 의 `rss-parser`, `cheerio`, `@google/genai` | `packages/tenant-almanac/package.json` |

### 새 파일 (Phase 2.5)

```ts
// packages/tenant-almanac/manifest.ts
import { defineTenant } from "@yangpyeon/core/tenant";

export default defineTenant({
  id: "almanac",
  displayName: "Almanac",
  routes: [
    { path: "/contents", method: "GET", handler: "./src/routes/contents" },
    { path: "/categories", method: "GET", handler: "./src/routes/categories" },
    { path: "/sources", method: "GET", handler: "./src/routes/sources" },
    { path: "/today-top", method: "GET", handler: "./src/routes/today-top" },
    { path: "/items/[slug]", method: "GET", handler: "./src/routes/item-by-slug" },
  ],
  crons: [
    { name: "rss-collect", schedule: "*/15 * * * *", handler: "./src/cron/rss-collect" },
    { name: "classify", schedule: "*/30 * * * *", handler: "./src/cron/classify" },
    { name: "promote", schedule: "0 * * * *", handler: "./src/cron/promote" },
  ],
  prismaFragment: "./prisma/fragment.prisma",
  allowedFetchHosts: [
    "feed.example.com",
    "news.ycombinator.com",
    "reddit.com",
    "producthunt.com",
    "arxiv.org",
    // ... RSS 60+ 호스트 + Firecrawl
  ],
  policy: {
    cron: {
      maxConcurrent: 2,
      timeout: 60_000,
      circuitBreaker: { failureThreshold: 5, openDuration: 300_000 },
    },
  },
  adminPages: [
    { path: "/dashboard", handler: "./src/admin/dashboard" },
    { path: "/sources", handler: "./src/admin/sources" },
    { path: "/categories", handler: "./src/admin/categories" },
    { path: "/items", handler: "./src/admin/items" },
  ],
});
```

---

## 3. ADR-027 옵션 A (path router) 영향

라우트 경로 변경: `/api/v1/almanac/*` → `/api/v1/t/almanac/*`.

### 마이그레이션 전략

| 시점 | `/api/v1/almanac/*` | `/api/v1/t/almanac/*` |
|------|---------------------|----------------------|
| v1.0 출시 (즉시) | 200 OK (기존 spec 그대로) | 404 (아직 없음) |
| Phase 1.2 (router 도입 직후) | 200 OK (alias 유지, 2주) | 200 OK (path router 신규) |
| Phase 2.5 완료 후 | **410 Gone** (alias 종료) | 200 OK (정식) |

### Almanac 클라이언트(`almanac-flame.vercel.app`) 영향

- v1.0 출시 시점: 기존 `/api/v1/almanac/*` URL 그대로 사용 (변경 0줄)
- Phase 2.5 완료 1주 전: Almanac 클라이언트 코드의 base URL 을 `/api/v1/t/almanac/*` 로 변경하는 PR 발행 (deprecation 안내)
- Phase 2.5 완료 후: 410 Gone — Almanac 클라이언트는 이미 신규 path 로 전환되어 있음

---

## 4. ADR-028 옵션 D (worker pool) 영향

Almanac cron 3종(rss-collect, classify, promote)을 `TenantWorkerPool` 위에서 실행.

### 변경 지점 (Phase 2.4)

- `src/lib/cron/registry.ts` 의 module dispatcher 에 `TENANT` kind 추가 (T2.4)
- Almanac cron 3종을 `manifest.ts` 의 `crons[]` 에 등록
- `dispatchTenantJob({tenantId: 'almanac', jobName: 'rss-collect'})` 패턴으로 호출
- 격리: `policy.cron.maxConcurrent: 2` 로 다른 tenant 와 worker 슬롯 경쟁 방지

### Phase 0.1 부수 fix 와의 정합

T0.1 (`src/lib/cron/runner.ts:21,72`, `registry.ts:135`) 에서 적용한 3건은 Phase 1.5 TenantWorkerPool 도입 전까지의 임시 보강.
- `DEFAULT_ALLOWED_FETCH` env override → Phase 1.6 에 manifest 의 `allowedFetchHosts[]` 로 이전
- WEBHOOK fetch AbortController → TenantWorkerPool 의 timeout 정책에 흡수
- silent failure audit → ADR-021 cross-cutting 으로 이미 정합

---

## 5. 충돌 회피 매트릭스

| 본 터미널 작업 | aggregator-fixes 터미널 영향 | 회피 전략 |
|--------------|---------------------------|----------|
| T0.1 cron fix 3건 | 영향 없음 (cron 모듈은 spec 도입 후에도 동일) | 즉시 머지 OK |
| T0.2 모노레포 변환 | spec 적용 시점에 따라 충돌 가능 | spec 적용 = 머지 후 → 모노레포 진행 |
| T0.3 Tenant 모델 | 영향 없음 (additive, nullable) | 즉시 머지 OK |
| T0.4 audit_logs.tenant_id | 영향 없음 (nullable) | 즉시 머지 OK |
| Phase 1.6 content_* tenant_id | Almanac v1.0 출시 후만 진행 | 출시 게이트 통과 대기 |
| Phase 2.5 패키지 마이그레이션 | Almanac v1.0 운영 안정 후 | 회귀 테스트 전제 |

---

## 6. 검증 체크리스트 (Phase 2.5 완료 시)

```bash
# 1. 코드 위치
ls packages/tenant-almanac/src/aggregator/   # exist
ls apps/web/src/lib/aggregator/              # NOT exist (이동 완료)

# 2. Prisma fragment 머지
grep "model ContentSource" prisma/schema.prisma  # generated by merge script
grep "tenant_id" prisma/schema.prisma            # all content_* 모델에 존재

# 3. Manifest 등록
node -e "console.log(require('./packages/tenant-almanac/manifest').default.id)"
# expect: 'almanac'

# 4. Router 회귀
curl -s http://localhost:3000/api/v1/almanac/health
# expect: 410 Gone

curl -sf http://localhost:3000/api/v1/t/almanac/health
# expect: 200 OK

# 5. RLS 격리
psql -c "SELECT COUNT(*) FROM content_items"
# expect: 0 (DB role이 tenant_id 미설정 시)

# 6. PR diff (M3 게이트, 2번째 컨슈머 추가 PR 검증)
git diff main...feat/tenant-<2nd> -- 'apps/web/' 'prisma/schema.prisma'
# expect: empty
```

---

## 7. 변경 이력

- 2026-04-26 v0.1 (세션 59 Phase 0.5): 본 노트 신설. ADR-022~029 ACCEPTED 결정의 Almanac spec 영향을 phase 별로 사전 표시. 충돌 회피 매트릭스 + 검증 체크리스트 포함.

---

## 참조

- [ADR-022 BaaS 정체성 재정의](../../research/baas-foundation/01-adrs/ADR-022-baas-identity-redefinition.md)
- [ADR-023 데이터 격리 (shared+RLS)](../../research/baas-foundation/01-adrs/ADR-023-tenant-data-isolation-model.md)
- [ADR-024 Plugin 격리 (hybrid)](../../research/baas-foundation/01-adrs/ADR-024-tenant-plugin-code-isolation.md)
- [ADR-027 Multi-tenant Router](../../research/baas-foundation/01-adrs/ADR-027-multi-tenant-router-and-api-key-matching.md)
- [ADR-028 Worker Pool](../../research/baas-foundation/01-adrs/ADR-028-cron-worker-pool-and-per-tenant-isolation.md)
- [Sprint Plan §0.5](../../research/baas-foundation/04-architecture-wave/02-sprint-plan/00-roadmap-overview.md)
- [Migration Strategy](../../research/baas-foundation/04-architecture-wave/03-migration/00-migration-strategy.md)
