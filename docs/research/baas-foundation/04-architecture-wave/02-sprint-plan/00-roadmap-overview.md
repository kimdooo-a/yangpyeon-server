# 00 — Sprint Plan Overview (Phase 0~4)

> 작성: 2026-04-26 세션 58 (Sub-wave B)
> 입력: 8 ADR (022~029) ACCEPTED, spike-baas-001/002, ADR-021 cross-cutting audit, 04-architecture-wave/01-architecture/ 9개 impl spec
> 산출물: 본 문서(00-roadmap-overview.md) + `01-task-dag.md` (의존성 그래프)
> 목적: yangpyeon 단일테넌트 → closed multi-tenant BaaS (N=10~20) 전환을 위한 5단계 sprint plan + 마일스톤 + 리스크 관리

---

## 0. 한 줄 요약

> Phase 0(즉시 fix + 모노레포 + Tenant 모델, 1~2주, 10~20h) → Phase 1(Tenant 1급 + multi-tenant router + Almanac MVP, 4~6주, 120~160h) → Phase 2(Plugin system 1.0 + 2번째 컨슈머 게이트, 4~6주, 100~140h) → Phase 3(Self-service + Operator Console + SLO, 4~6주, 80~120h) → Phase 4(조건부, 가변, 50~80h). **총 380~480h(50~70주, 1인 운영자 기준), 크리티컬 패스: ADR-022 결정 → 모노레포 → Tenant 모델 → withTenant 가드 → Plugin loader → 2번째 컨슈머 게이트.**

---

## 1. 전체 일정 요약

| Phase | 기간 | 공수 | Exit Criteria | 게이트 (블록 시 다음 phase 보류) |
|-------|------|------|--------------|------------------------------|
| **0. Foundation** | 1~2주 | 10~20h | kdywave 산출물 검토 완료 + CLAUDE.md 정체성 패치 + spike-baas-002 부수 fix 3건 + 모노레포 골격 | M1: pnpm workspace 빌드 PASS |
| **1. Tenant 1급화** | 4~6주 | 120~160h | TenantContext 작동 + 모든 API에 `withTenant` 가드 + RLS 정책 단일 tenant `default` 가동 + Almanac MVP `/api/v1/t/almanac/*` 응답 200 | M2: e2e 테스트 통과 + RLS 누수 0건 |
| **2. Plugin 1.0** | 4~6주 | 100~140h | Almanac이 `packages/tenant-almanac/`에서 manifest로 동작 + 2번째 컨슈머가 manifest only로 코드 0줄 추가하여 가동 | **M3 (게이트)**: 2번째 컨슈머 add PR diff에 `apps/web/`, `prisma/schema.prisma` 변경 0줄 |
| **3. Self-service + 운영 가시화** | 4~6주 | 80~120h | Operator Console 가동 + tenant_slos CRUD + SLO breach 알림 + cardinality 정책 자동 + ESLint custom rule + RLS e2e 테스트 + audit-failure 메트릭 per-tenant | M4: Operator Console 9개 화면 + SLO 1건 이상 측정 |
| **4. 진화 옵션** (조건부) | 가변 | 50~80h | N=10 도달 측정 → 데이터 기반으로 옵션 D(worker tier) / 옵션 B(Tier 인스턴스) / OTel 도입 결정 | M5~M8: 트리거 조건 만족 시에만 |

**총 공수**: 360~520h (대략 50~70주, 주 8~10h 기준 1인 운영자) — README의 380~480h 추정과 일치.

---

## 2. Phase 0 상세 (즉시 시작, 1~2주, 10~20h)

> 목적: kdywave 산출물(8 ADR + 9 impl spec)을 코드 베이스에 안전하게 착륙시킬 수 있도록 토양 정비. **"멀티테넌트 변경 0줄, 인프라 정비 100%"** — Almanac spec과 충돌 없이 병행 가능.

### 0.1 spike-baas-002 부수 fix 3건 (즉시 적용, ~3h)

본 패치는 ADR-028 결정과 무관하게 현 코드의 명백한 결함 fix. **단독 PR**로 즉시 머지.

| # | 파일 | 결함 | 수정 | 공수 |
|---|------|------|------|------|
| 1 | `src/lib/cron/runner.ts:72` | WEBHOOK `fetch()` 호출에 timeout 부재, 60초+ hang 가능 | `AbortController` + `AGGREGATOR_FETCH_TIMEOUT` (기본 30s, 환경변수 override) | 1h |
| 2 | `src/lib/cron/registry.ts:135` | `runJob` catch 블록이 `// 무시` — 실패 원인 추적 불가 | structured log + `audit("cron.failure.silent", { jobId, error })` (CK-38 패턴 적용, ADR-021 §보완 메트릭 포함) | 1h |
| 3 | `src/lib/cron/runner.ts:21` | `DEFAULT_ALLOWED_FETCH` 하드코딩, 멀티테넌트 전환 시 대체 불가 | env 기반 fallback + 주석으로 "Phase 1.6에서 tenant manifest로 이전" TODO 명시 | 1h |

**상태**: 3건 모두 ADR-021 amendment-1(audit-failure 카운터)와 정합. spike-baas-002 §5.3 + ADR-028 §11 권고 → **Phase 0 진입 즉시 처리**.

### 0.2 모노레포 변환 (pnpm workspace + turborepo, ~6h)

**현재**: `package.json`에 `workspaces` 필드 부재 → 단일 패키지.
**목표 구조** (ADR-024 옵션 D 채택 직후):

```
yangpyeon/
├── apps/
│   └── web/                       ← 기존 src/ 일부 + Next.js
├── packages/
│   ├── core/                      ← Prisma client + cron/audit/ratelimit 등 공통
│   ├── ui/                        ← (옵션) shadcn 기반 공통 컴포넌트
│   └── tenant-almanac/            ← Phase 2.5에서 합류, Phase 0~1은 자리만
├── pnpm-workspace.yaml
├── turbo.json
└── package.json (root)
```

**작업**:
- `pnpm-workspace.yaml` 작성 (`apps/*`, `packages/*` 패턴)
- `turbo.json` 작성 (build/test/lint 파이프라인 + remote cache 옵션)
- `apps/web/`로 src/, public/, app/ 등 이동 (기존 코드 변경 0줄)
- `packages/core/` 골격만 (실제 추출은 Phase 1.0에서)
- 빌드 PASS 확인 → **M1**

**제약**: 기존 `pack-standalone.sh` (memory MEMORY.md 참조, 2026-04-19 reversal)와의 호환성 확인. PM2 standalone 모드는 그대로 작동해야 함.

### 0.3 Tenant Prisma 모델 + 마이그레이션 (~4h)

```prisma
model Tenant {
  id          String   @id @default(uuid()) @db.Uuid
  slug        String   @unique           // URL path: /api/v1/t/<slug>
  displayName String
  status      String   @default("active") // active | suspended | archived
  createdAt   DateTime @default(now())
  // Phase 2 확장 예정: manifest, plan, isolationProfile
}
```

**`tenant_id` 컬럼 추가 (nullable)**: 모든 비즈니스 모델에 `tenantId String? @db.Uuid` 추가. Phase 1에서 backfill + NOT NULL 전환.

**마이그레이션**:
- `prisma migrate dev --name add_tenant_model`
- seed: `tenant 'default'` 1행 (모든 기존 row의 backfill 대상)

### 0.4 ADR-021 amendment-2: `audit_logs.tenant_id` 추가 (~2h)

ADR-021 cross-cutting audit가 멀티테넌트 차원과 결합되도록 amendment 작성:
- `audit_logs` 테이블에 `tenant_id` 컬럼 추가 (nullable, Phase 0에서는 null 허용)
- audit-metrics bucketName 함수에 tenant prefix 옵션 (cardinality 정책은 Phase 3에서 강제)
- 기존 audit 호출부는 변경 0줄 (TenantContext 도입은 Phase 1)

### 0.5 Almanac spec 동기화 (다른 터미널 작업) (~2h)

`spec/aggregator-fixes` 브랜치에서 Almanac 통합이 진행 중 (다른 터미널). **충돌 회피 전략**:

- Almanac v1.0 출시: `tenant_id` 컬럼 부재 그대로 진행 (현재 진행 중인 spec 차단 X)
- 출시 후 v1.1 패치: `content_*` 테이블에 `tenant_id` nullable 추가 → backfill `'almanac'` → NOT NULL
- Phase 2.5에서 `packages/tenant-almanac/`으로 마이그레이션

**병행 신호**: Almanac PR 리뷰 시 본 ADR-022~029 결정사항(특히 router 경로 `/api/v1/t/almanac/*`) 노트 추가.

### Phase 0 Exit Criteria (M1)

- [ ] spike-baas-002 부수 fix 3건 머지
- [ ] `pnpm install && pnpm build` 루트에서 PASS
- [ ] `prisma migrate status` clean
- [ ] PM2 standalone 헬스 200 (헬스체크 회귀 0)
- [ ] Almanac spec 충돌 0건

---

## 3. Phase 1 상세 (Tenant 1급화, 4~6주, 120~160h)

> 목적: `withTenant` 가드 + RLS + Multi-tenant router + Almanac MVP 가동. **단일 tenant `'default'` + Almanac 1개로 운영하면서 점진적 전환**.

### 1.1 TenantContext (AsyncLocalStorage) — 8h

`packages/core/src/tenant/context.ts`:
```typescript
import { AsyncLocalStorage } from 'node:async_hooks';
const tenantContext = new AsyncLocalStorage<TenantContextValue>();
export function runWithTenant<T>(value: TenantContextValue, fn: () => T): T;
export function getCurrentTenant(): TenantContextValue;
```

- 단위 테스트: nested context, async boundary, error 전파
- 모든 layer에서 호출: route → service → repository → audit

### 1.2 `withTenant()` 가드 + catch-all router — 16h

ADR-027 (옵션 A) 구현:
- `apps/web/app/api/v1/t/[tenant]/[...path]/route.ts` (catch-all)
- `withTenant(handler)` HOC: tenant slug 추출 → DB 조회 → status 검증 → `runWithTenant`로 실행 → SET LOCAL `app.tenant_id`
- 가드 누락 시 build 시점 에러 (Phase 3.5 ESLint rule로 강제)

### 1.3 ApiKey K3 매칭 (prefix + FK + 검증) — 12h

ADR-027 §K3:
- ApiKey 테이블에 `tenant_id` FK + `prefix` 인덱스
- `Authorization: Bearer ya_<prefix>_<secret>` 파싱
- 검증: prefix 매칭 → tenant 매칭 → secret hash 검증 (constant-time compare)
- 잘못된 tenant↔key 조합 시 403 + audit

### 1.4 RLS 정책 적용 (단일 tenant `'default'` 시작) — 18h

ADR-023 옵션 B 구현:
- 모든 비즈니스 테이블에 RLS 정책: `tenant_id = current_setting('app.tenant_id')::uuid`
- `withTenantTx()` 래퍼: 트랜잭션 시작 시 `SET LOCAL`
- Prisma Client Extension: tenantId 자동 주입 + 누락 검증
- 단일 tenant `'default'`로 모든 기존 데이터 backfill
- e2e 테스트 5건: tenant A 데이터에 tenant B로 접근 → 0건 반환

### 1.5 TenantWorkerPool (worker_threads) — 30h

ADR-028 옵션 D + spike-baas-002 §6 sketch 코드 기반:
- `packages/core/src/cron/worker-pool.ts` (TenantWorkerPool 클래스)
- `packages/core/src/cron/worker-script.ts` (worker entry)
- `packages/core/src/cron/policy.ts` (TenantCronPolicy 로드/캐시)
- `packages/core/src/cron/circuit-breaker.ts` (CLOSED/OPEN/HALF_OPEN)
- `registry.ts` 리팩토링: `Map<tenantId, RegistryState>`로 변경
- Prisma 마이그레이션: `CronJob.tenantId`, `consecutiveFailures`, `circuitState`, `circuitOpenedAt`
- TDD: dispatcher 단위 테스트 (cap/timeout/circuit 분기)

### 1.6 Almanac을 tenant_id='almanac' 으로 backfill (출시 후) — 10h

- `content_*` 테이블에 `tenant_id` 컬럼 NOT NULL 전환 (Phase 0에서 nullable로 추가됨)
- backfill: 모든 기존 row → `'almanac'`
- Almanac route를 `/api/v1/t/almanac/*`로 마이그레이션 (alias 기간 2주 유지)

### 1.7 audit-metrics tenant 차원 — 6h

ADR-029 §3, ADR-021 amendment-1 통합:
- bucketName 함수에 tenant prefix 자동 적용
- audit-failure 카운터 per-tenant 분리
- 단, MAX_BUCKETS=200 cardinality cap은 Phase 3.4까지 유지 (N=20 × 6 = 120 < 200)

### Phase 1 Exit Criteria (M2)

- [ ] e2e 테스트 통과: 5/5 RLS 누수 시나리오 0건
- [ ] `/api/v1/t/almanac/health` 응답 200
- [ ] cron 작업 5건 worker_threads에서 격리 실행 (PM2 process 안에서)
- [ ] audit_logs.tenant_id 채워짐 검증 쿼리 PASS
- [ ] standalone build + PM2 cluster:4 회귀 0

**위험 신호**: Almanac MVP 가동 후 1주 동안 RLS 정책 위반 (audit) 발생 → **Phase 2 진입 보류**, ESLint custom rule (Phase 3.5)을 Phase 1 말미로 앞당김.

---

## 4. Phase 2 상세 (Plugin system 1.0, 4~6주, 100~140h)

> 목적: Almanac을 `packages/tenant-almanac/`로 마이그레이션 + manifest 기반 등록 시스템 + **2번째 컨슈머를 코드 0줄 추가로 가동** (게이트).

### 2.1 TenantManifestSchema + `defineTenant()` — 14h

ADR-026 옵션 C (TS+DB hybrid):
- `packages/core/src/tenant/manifest.ts`: Zod 스키마 + `defineTenant()` 헬퍼
- 필드: `id`, `displayName`, `routes[]`, `crons[]`, `prismaFragment` (선택), `allowedFetchHosts[]`, `policy.cron`, `adminPages[]`
- DB 운영 토글: `Tenant` 테이블에 `runtimeOverrides Json` 컬럼 (manifest의 일부 필드 hot-override)

### 2.2 Manifest loader + Prisma schema 병합 스크립트 — 18h

- `scripts/merge-tenant-prisma-fragments.ts`: 빌드 시 `packages/tenant-*/prisma/fragment.prisma` 수집 → `prisma/schema.prisma`에 append
- `scripts/load-tenant-manifests.ts`: 부팅 시 `packages/tenant-*/manifest.ts` import → 검증 → 레지스트리 등록
- 충돌 검사: 동일 모델/route/cron ID 중복 시 빌드 실패

### 2.3 Plugin route handler 등록 — 16h

- `apps/web/app/admin/[tenant]/[...path]/page.tsx`: tenant manifest의 `adminPages[]`를 codegen으로 매핑
- catch-all route가 manifest의 routes[]에 dispatch
- middleware: tenant slug → manifest lookup → handler 호출

### 2.4 Cron module dispatcher (TENANT kind) — 12h

ADR-028 + ADR-026 통합:
- `CronJob.kind` enum에 `TENANT` 추가
- TENANT kind 처리 시 manifest의 cron handler 호출 (worker_threads 내부)
- registry.ts의 module dispatcher table에 TENANT 케이스 추가

### 2.5 Almanac을 packages/tenant-almanac/으로 마이그레이션 — 28h

- `apps/web/`의 Almanac 코드 (~aggregator/feeds/normalizer 등) → `packages/tenant-almanac/src/`로 이동
- `manifest.ts` 작성: routes/crons/prisma fragment 등록
- `package.json` 작성: dependencies 분리 (rss-parser, cheerio 등)
- 기존 `/api/v1/t/almanac/*` 응답 동일성 회귀 테스트
- alias 기간 종료 (`/api/v1/almanac/*` → 410 Gone)

### 2.6 2번째 컨슈머 (가상 또는 실제) manifest only 추가 — **M3 게이트** — 12h

후보:
- **가상 컨슈머**: `tenant-jobboard` (RSS 채용공고 수집) — Almanac과 유사 구조로 manifest만 다름
- **실제 컨슈머**: 사용자 다른 프로젝트 1개 선정

**게이트 조건** (PR diff 검증):
- `apps/web/` 변경 0줄
- `prisma/schema.prisma` 변경 0줄 (fragment만 추가)
- 빌드 PASS + 가동 후 1주 audit 위반 0건
- → M3 통과 시 **"yangpyeon = closed multi-tenant BaaS" 정체성 입증 완료**

### Phase 2 Exit Criteria (M3 — 게이트)

- [ ] Almanac이 `packages/tenant-almanac/`에서 manifest로 동작
- [ ] 2번째 컨슈머 PR diff: `apps/web/` 0줄, `prisma/schema.prisma` 0줄
- [ ] 2번째 컨슈머 가동 후 1주 audit 위반 0건
- [ ] CI에서 manifest 충돌 검사 통과

---

## 5. Phase 3 상세 (Self-service + 운영 가시화, 4~6주, 80~120h)

> 목적: 1인 운영자가 N=10~20 컨슈머를 hands-off로 운영 가능하도록 가시화 + 안전망 완비.

### 3.1 Operator Console (18h, ADR-029 Phase 1)

ADR-029 §2.6 9개 화면:
1. Tenant 목록 (status, last activity, audit failure rate)
2. Tenant 상세 (manifest 토글, runtime override)
3. Cron jobs per tenant (consecutiveFailures, circuitState)
4. Recent audit (filter by tenant)
5. SLO breach (Phase 3.3)
6. Worker pool 현황 (inFlight, queue depth)
7. Rate limit hits (per tenant)
8. Storage usage (per tenant)
9. Config (cardinality cap, env)

### 3.2 Tenant Console (옵션) — 16h

- 컨슈머 자기 관리 화면 (1인 운영자 본인용이지만, 미래 외부 컨슈머 수용 대비)
- API key 회전, manifest override 토글, audit/log 조회 (자기 tenant only — RLS 강제)

### 3.3 SLO 정의 + tenant_slos 모델 + alert 알림 — 14h

ADR-029 §2.5 + Phase 1 작업표:
- `tenant_slos` 테이블 + CRUD endpoint (3h)
- yaml fallback (1h)
- breach detection cron job (5h)
- Operator Console drill-down (1h)
- Discord/email 알림 webhook (4h)

### 3.4 Cardinality 정책 자동 적용 — 8h

ADR-029 §2.4 정책 C1:
- bucketName에 tenant 차원 추가 시 카운터 (현재 series 수 측정)
- 임계 (180/200) 도달 시 자동 cap 강화 + Operator Console 경고
- N=20 × 6 = 120 series 가정으로 출발, N=30 도달 시 정책 재평가

### 3.5 ESLint custom rule + RLS e2e 테스트 — 24h

- `eslint-plugin-yangpyeon/no-prisma-without-tenant`: Prisma client 직접 사용 시 `withTenant`/`runWithTenant` 컨텍스트 필수 강제 (CI 차단)
- RLS e2e 테스트 20건: 모든 비즈니스 테이블 × cross-tenant access → 0건 반환
- migration 검증: 새 테이블 추가 시 RLS 정책 누락 자동 차단

### Phase 3 Exit Criteria (M4)

- [ ] Operator Console 9개 화면 가동
- [ ] SLO 1건 이상 측정 + breach 알림 1회 이상 검증
- [ ] ESLint rule 머지 + 위반 0건
- [ ] RLS e2e 20/20 PASS

---

## 6. Phase 4 상세 (조건부 진화 옵션, 가변, 50~80h)

> 트리거: N=10 도달 또는 워크로드 성장 신호. **조건 미충족 시 미실행**.

### 4.1 N=10 도달 측정 → 데이터 수집 (~5h)

- Operator Console에 "scaling signals" 패널 추가
- 측정: PM2 worker pool 포화율, max_connections 압박, audit-metrics latency p99, RLS 검증 비용

### 4.2 옵션 D (worker tier 분리) 또는 옵션 B (Tier 인스턴스) 결정 (~10h)

ADR-025 §6 트리거:
- **옵션 D 트리거**: cron worker pool이 1개 노드에서 부족 → cron 전용 PM2 instance 분리
- **옵션 B 트리거**: 큰 tenant 1~2개가 작은 tenant N개를 starve → Tier별 인스턴스 (FREE/PRO/VIP) 분리

### 4.3 OpenTelemetry 도입 (M3+T2) (~30h)

ADR-029 §6 트리거 B:
- audit-metrics를 OTel에 미러 (병행 운용)
- distributed tracing: tenant_id를 trace attribute로 전파
- Prom/Grafana 또는 SaaS (e.g. Honeycomb)로 export

### 4.4 DB-per-tenant (큰 tenant 한정) — 옵션 C 부분 적용 (~25h)

- 워크로드 큰 tenant 1~2개를 별도 PG 인스턴스로 분리
- 작은 tenants는 shared+RLS 유지 → 옵션 D(hybrid) 사실상 도입

### Phase 4 Exit Criteria (M5~M8 — 조건부)

- [ ] M5: N=10 도달 (트리거)
- [ ] M6: scaling signals 데이터 4주 수집
- [ ] M7: 진화 옵션 1개 선택 + ADR-025 amendment 작성
- [ ] M8: 진화 적용 후 회귀 0

---

## 7. 마일스톤 정의

| ID | 정의 | 시점 | 검증 |
|----|------|------|------|
| **M1** | Phase 0 완료 — 모노레포 빌드 PASS | 2주차 | `pnpm build` + PM2 헬스 200 |
| **M2** | Phase 1 완료 — RLS + router + Almanac MVP | 8주차 | e2e 5/5 + RLS 누수 0건 |
| **M3** | **Phase 2 게이트** — 2번째 컨슈머 코드 0줄 추가 | 14주차 | PR diff 검증 + 1주 audit 0건 |
| **M4** | Phase 3 완료 — Operator Console + SLO + ESLint | 20주차 | 9개 화면 + 1건 SLO 측정 + lint 위반 0 |
| **M5** | N=10 도달 (Phase 4 트리거) | 가변 | tenant 카운트 |
| **M6** | scaling signals 4주 수집 | M5 + 4주 | 데이터 패널 4주치 |
| **M7** | 진화 옵션 결정 + ADR-025 amendment | M6 + 2주 | ADR 머지 |
| **M8** | 진화 적용 + 회귀 0 | M7 + 가변 | 회귀 테스트 |

---

## 8. 리스크 + 완화

| ID | 리스크 | 영향 | 확률 | 완화 |
|----|--------|------|------|------|
| R1 | RLS 누락 시 데이터 유출 | **치명** | 중 | Phase 1.4 e2e 5건 + Phase 3.5 ESLint rule + RLS e2e 20건 + 회귀 CI |
| R2 | Almanac spec과 ADR 결정 충돌 | 중 | 중 | Phase 0.5 alias 기간 + Phase 1.6 backfill + Phase 2.5 마이그레이션 |
| R3 | worker_threads 격리 부족 (native OOM) | 중 | 저 | spike-baas-002 §3.1 한계 인지 + isolated-vm L1 (ADR-009) 유지 + memory limit 모니터링 |
| R4 | pnpm workspace 도입 시 standalone build 회귀 | 중 | 중 | Phase 0.2 PM2 standalone 회귀 테스트 필수 + ypserver 스킬 검증 |
| R5 | 2번째 컨슈머 게이트 미달성 (manifest로 부족) | **블로커** | 중 | Phase 2.6 후보 2개 준비 (가상+실제) + Phase 2.1~2.5에서 Almanac 자체 dogfooding |
| R6 | cardinality 폭증 (N=20 × series) | 중 | 저 | Phase 3.4 자동 정책 + ADR-029 §2.4 정책 C1 + N=30 시 OTel 검토 |
| R7 | 모노레포 빌드 시간 증가로 dev 경험 저하 | 저 | 고 | turborepo remote cache + 영향 받는 패키지만 빌드 (`turbo run build --filter=...`) |
| R8 | 1인 운영자 번아웃 (총 380~480h) | 중 | 중 | Phase별 게이트 명확 + 회고 (각 phase 종료 시 1h) + 자율 실행 우선 (memory feedback_autonomy 준수) |

---

## 9. spec/aggregator-fixes 브랜치 동기화

현재 다른 터미널에서 Almanac 통합이 진행 중. **충돌 회피 + 점진적 통합** 전략:

| 시점 | 액션 | 책임 터미널 |
|------|------|------------|
| 즉시 (Phase 0 진입 시) | Almanac PR에 ADR-022~029 결정 + Phase 1.6 마이그레이션 계획 노트 추가 | 본 터미널 |
| Almanac v1.0 출시 → main 머지 | tenant_id 부재 그대로 출시 (차단 X) | aggregator-fixes 터미널 |
| Phase 0.4 완료 후 | `audit_logs.tenant_id` 마이그레이션 머지 | 본 터미널 |
| Phase 1.6 (Phase 1 후반) | content_* 테이블 tenant_id NOT NULL + backfill `'almanac'` | 본 터미널 |
| Phase 2.5 (Phase 2 후반) | `apps/web/`의 Almanac 코드 → `packages/tenant-almanac/`으로 이동 | 본 터미널 |
| Phase 2.5 완료 후 | `/api/v1/almanac/*` alias 종료 (410 Gone) | 본 터미널 |

**병행 신호**:
- 본 터미널에서 ADR/spec 변경 시 → aggregator-fixes 터미널에 노트
- aggregator-fixes 터미널에서 Almanac 모델 변경 시 → 본 터미널의 Phase 1.6 작업표 업데이트

---

## 10. 다음 단계

1. **사용자 검토**: 본 sprint plan 승인 → kdyswarm 호출 권한 부여
2. **Phase 0 즉시 진입**: spike-baas-002 부수 fix 3건 PR (단독, ~3h)
3. **kdyswarm 발사**: Phase 1.1~1.7 병렬 가능 task DAG (다음 문서 `01-task-dag.md` 참조)
4. **각 phase 종료 시**: 회고 1h + 다음 phase exit criteria 재검토 + 인수인계서 작성

---

## 11. Phase별 수용 기준 상세표 (NFR 포함)

각 phase 종료 시 반드시 측정해야 할 비기능 요구사항.

### Phase 0 NFR

| 항목 | 기준 | 측정 방법 |
|------|------|----------|
| 빌드 시간 | < 60s (cold), < 10s (cached) | `time pnpm build` |
| 헬스체크 회귀 | 0 (PM2 standalone 가동) | `curl /api/health` |
| 기존 Almanac 동작 | 0 회귀 | aggregator-fixes 테스트 PASS |
| Disk usage 증가 | < 200MB (node_modules monorepo) | `du -sh node_modules` |

### Phase 1 NFR

| 항목 | 기준 | 측정 방법 |
|------|------|----------|
| RLS 정책 누수 | **0건** (치명) | e2e 5건 + manual cross-tenant 시도 |
| API latency p95 | 기존 대비 +20% 이내 | k6 부하 테스트 |
| audit_logs cardinality | < 200 series (현재 cap) | audit-metrics endpoint |
| worker_threads 격리 | 1개 worker OOM 시 다른 worker 영향 0 | chaos test |
| Almanac MVP availability | 99.5% (1주 기준) | uptime 모니터링 |

### Phase 2 NFR

| 항목 | 기준 | 측정 방법 |
|------|------|----------|
| 2번째 컨슈머 add 시간 | < 4h (manifest 작성 + 배포) | 실제 측정 |
| 2번째 컨슈머 PR diff | apps/web/ 0줄, schema.prisma 0줄 | git diff |
| Manifest 충돌 검출 | 100% (CI 빌드 시) | validate-tenant-manifests.ts |
| Plugin route 등록 시간 | < 5s (tenant 1개 추가 시 hot-reload) | 시작 시간 측정 |
| Almanac 회귀 | 0 (마이그레이션 후 응답 동일) | snapshot test |

### Phase 3 NFR

| 항목 | 기준 | 측정 방법 |
|------|------|----------|
| Operator Console 응답 | < 500ms p95 | k6 + lighthouse |
| SLO breach 알림 지연 | < 60s (breach 발생 → Discord/email) | E2E test |
| ESLint rule 위반 | 0 (CI 차단) | `pnpm lint --max-warnings=0` |
| Cardinality cap 강제 | 자동 (180/200 도달 시) | metrics endpoint 모니터링 |
| RLS e2e cover | 20건 (모든 비즈니스 테이블 × 5 시나리오) | coverage report |

### Phase 4 NFR (조건부)

| 항목 | 기준 | 측정 방법 |
|------|------|----------|
| N=10 도달 시점 | M5 트리거 발생 | Operator Console 카운터 |
| scaling signal 데이터 | 4주 (2 cycle 측정) | 패널 데이터 export |
| 진화 옵션 결정 근거 | 정량 데이터 + ADR amendment | ADR-025 amendment 작성 |
| 진화 적용 후 회귀 | 0 (기존 N=10 영향 X) | regression test suite |

---

## 12. 변경 이력

- 2026-04-26 v0.1: 초안 작성 (Sub-wave B). 8 ADR + spike-baas-001/002 + ADR-021 amendment 통합 반영. Phase별 NFR 상세표 포함.
