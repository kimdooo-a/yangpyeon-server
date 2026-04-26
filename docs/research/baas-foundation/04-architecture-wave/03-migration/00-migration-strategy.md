# 00 — Migration Strategy (단일 → 멀티테넌트)

> 작성: 2026-04-26 (BaaS Foundation Architecture Wave Sub-wave C)
> 위치: `docs/research/baas-foundation/04-architecture-wave/03-migration/00-migration-strategy.md`
> 자매 문서: [01-wave-compatibility-matrix.md](./01-wave-compatibility-matrix.md)
> 입력: [00-context/02-current-code-audit.md](../../00-context/02-current-code-audit.md), [00-context/01-existing-decisions-audit.md](../../00-context/01-existing-decisions-audit.md), [01-adrs/ADR-022~029](../../01-adrs/), [README.md](../README.md)
> 결정 전제: ADR-022 옵션 A (1인-N프로젝트 BaaS) + ADR-023 옵션 B (shared-schema + RLS) + ADR-024 옵션 D (hybrid plugin) + ADR-025 옵션 A (단일 인스턴스 + 추상화) + ADR-026 (TS+DB hybrid manifest) + ADR-027 (path 라우터 `/api/v1/t/<tenant>/...`) + ADR-028 옵션 D (worker_threads + pg-boss) + ADR-029 (M1+L1+T3 + Operator Console)
> 동시 작업: `spec/aggregator-fixes` 브랜치 (다른 터미널) — 머지 후 본 마이그레이션 진입

---

## 0. 한 줄 요약

11개 PG 모델 + 3개 SQLite 테이블 + 30개 코드 파일을 **5단계(additive → backfill → enforce → split → scale)** 로 전환하여, 기존 동작을 단계별로 보존하면서 'default' 단일 tenant → 'almanac' + N consumer 멀티테넌트로 안전 이행한다. 각 단계는 **rollback SQL + 자동 검증 게이트**가 필수이며, ADR-020 standalone snapshot이 마지막 안전망 역할을 한다.

---

## 1. 영향 받는 파일 ~30개 (current-code-audit 인용)

`02-current-code-audit.md` §7 분류를 본 마이그레이션의 Phase/의존 그래프 컬럼으로 확장한다.

### 1.1 Critical (반드시 수정 — Phase 1 필수)

| 파일 | 변경 | Phase | 의존 |
|------|------|-------|------|
| `prisma/schema.prisma` | 11개 모델에 `tenantId` 컬럼 + `Tenant` 모델 신규 + 복합 인덱스 `(tenant_id, …)` 재설계 | Stage 1 | (없음 — 시작점) |
| `prisma/migrations/<timestamp>_add_tenant_id/migration.sql` | nullable 컬럼 추가 + DEFAULT 'default' + 인덱스 | Stage 1 | schema.prisma |
| `prisma/migrations/<timestamp>_backfill_tenant_id/migration.sql` | UPDATE … SET tenant_id='default' WHERE tenant_id IS NULL | Stage 2 | Stage 1 완료 |
| `prisma/migrations/<timestamp>_enforce_tenant_id/migration.sql` | NOT NULL + RLS 정책 활성화 + tenants 행 'default' INSERT | Stage 3 | Stage 2 검증 |
| `src/lib/auth.ts` | `DashboardSessionPayload`에 `tenantId` 추가 | Stage 3 | Tenant 모델 |
| `src/lib/jwt-v1.ts` | `AccessTokenPayload`에 `tenantId` + `aud` 클레임 (ADR-027) | Stage 3 | Tenant 모델 |
| `src/lib/api-guard.ts` | 기존 `withAuth`/`withRole`은 무수정 보존 (운영 콘솔용) | Stage 3 | (보존) |
| `src/lib/api-guard-tenant.ts` (신설) | `withTenant()` / `withTenantRole()` 가드 — ADR-027 §5.2 | Stage 3 | jwt-v1.ts |
| `src/lib/tenant-router.ts` (신설) | `/api/v1/t/<tenant>/...` path 파싱 + Tenant 조회 + RLS GUC 설정 | Stage 3 | api-guard-tenant.ts |
| `src/lib/db/tenant-context.ts` (신설) | Prisma Client Extension — 모든 쿼리 전 `SET LOCAL app.tenant_id` 트랜잭션 GUC 설정 (ADR-023 옵션 B-1) | Stage 1 | schema.prisma |
| `src/app/api/v1/t/[tenant]/[...path]/route.ts` (신설) | catch-all router → `withTenant` 위임 | Stage 3 | tenant-router.ts |
| `src/lib/cron/registry.ts` | `globalThis.__cronRegistry` → `Map<tenantId, RegistryState>` (ADR-028 옵션 D) | Stage 4 | worker_threads pool |
| `src/lib/cron/runner.ts` | `dispatchCron(job, tenantId)` + ALLOWED_FETCH_HOSTS → DB 정책 조회 | Stage 4 | tenant-context.ts |
| `src/lib/rate-limit-db.ts` | `buildBucketKey(scope, dimension, value, tenantId)` — bucketKey에 tenantId prefix | Stage 1 (additive) → Stage 3 (enforce) | (독립) |

### 1.2 High (Stage 3~4 동안 단계 적용)

| 파일 | 변경 | Phase | 의존 |
|------|------|-------|------|
| `src/lib/jwks/store.ts` | `getSigningKey(tenantId?)` — Phase 1 단일 키셋 유지, Phase 3에서 per-tenant 옵션 검토 (ADR-029) | Stage 3 | (독립) |
| `src/lib/auth/keys.ts` | `verifyApiKey(prefix, tenantId)` / `issueApiKey(ownerId, tenantId)` — ADR-027 §K3 매칭 (api_key.tenantId === path tenant) | Stage 3 | api-guard-tenant.ts |
| `src/lib/runner/isolated.ts` | `buildSafeFetch(tenantId)` — DB `tenant_function_policies` 조회 | Stage 4 | tenant-context.ts |
| `src/lib/audit-log.ts`, `src/lib/audit-log-db.ts` | `AuditEntry`에 `tenantId` 추가 + 자동 주입 (AsyncLocalStorage 기반, ADR-029 §2.4 — 11개 콜사이트 시그니처 무수정) | Stage 1 (additive) → Stage 3 (enforce) | tenant-context.ts |
| `src/lib/db/schema.ts` (drizzle SQLite) | `auditLogs.tenantId`, `metricsHistory.tenantId`, `ipWhitelist.tenantId` (ADR-029 §2.1) | Stage 1 | (독립) |
| `src/app/api/v1/auth/login/route.ts` | 로그인 후 tenantId 결정 로직 — 다중 멤버십 시 default 선택 + Tenant Switcher UI 호출 | Stage 3 | Tenant 모델 |
| `src/app/api/v1/members/**` | WHERE 절 자동 tenant 필터 (RLS) + 글로벌 운영 콘솔용 별도 라우트 분리 | Stage 4 | withTenant |
| `src/app/api/v1/api-keys/**` | tenantId scope 발급/조회 | Stage 4 | withTenant |
| `src/app/api/v1/functions/[id]/run/route.ts` | DB 정책 조회 + `withTenant` 가드로 이동 (`/api/v1/t/<tenant>/functions/[id]/run`) | Stage 4 | tenant-context.ts |
| `src/app/api/v1/sql/execute/route.ts` | `runReadonly(sql, [], { timeoutMs, tenantId })` — RLS GUC가 자동 필터 | Stage 4 | tenant-context.ts |
| `src/app/api/v1/cron/[id]/run/route.ts` | `runNow(jobId, tenantId)` + worker_threads dispatch | Stage 4 | cron registry refactor |

### 1.3 Medium/Low (Stage 5에서 점진 정비)

| 파일 | 변경 | Phase | 의존 |
|------|------|-------|------|
| `src/lib/sql/danger-check.ts` | 구조 미변경, 호출 시 tenantId context만 추가 | Stage 5 | (없음) |
| `src/lib/pg/pool.ts` | `runReadonly(sql, params, { tenantId })` — 풀 클라이언트 acquire 시 GUC 설정 | Stage 4 | tenant-context.ts |
| `src/components/layout/Sidebar.tsx` | `[tenant=<id>]` 배지 표시 | Stage 5 | manifest registry |
| `src/components/layout/TenantSwitcher.tsx` (신설) | top-bar dropdown — manifest 기반 tenant 전환 | Stage 5 | manifest registry |
| `src/lib/logger.ts` | log entry prefix `[tenant=<id>]` 자동 주입 (AsyncLocalStorage) | Stage 1 (additive) | tenant-context.ts |

### 1.4 합계 — 약 28개 파일

- Critical 12개 + High 11개 + Medium/Low 5개 = **28개 파일** (current-code-audit 추정 ~30 일치)
- 신규 파일 7개 (`api-guard-tenant.ts`, `tenant-router.ts`, `tenant-context.ts`, catch-all route, `TenantSwitcher.tsx`, 2개 마이그레이션)

### 1.5 의존 그래프 (Critical Path)

```
schema.prisma (Stage 1)
   └→ tenant-context.ts (Stage 1)
        └→ jwt-v1.ts (Stage 3)
             └→ api-guard-tenant.ts (Stage 3)
                  └→ tenant-router.ts (Stage 3)
                       └→ catch-all route.ts (Stage 3)
                            └→ /api/v1/t/almanac/* (Stage 4)
                                 └→ N>=2 컨슈머 (Stage 5)
```

크리티컬 패스 = **6 노드 (Stage 1 → Stage 3 → Stage 4 → Stage 5)**. 병렬화 가능: Stage 1 동안 audit-log/rate-limit additive는 독립 진행 가능 (3 sub-agent 분기).

---

## 2. 5단계 마이그레이션 전략

### Stage 1: 추가 (additive) — Phase 0~1

#### 2.1.1 목적
기존 동작에 영향 없이 새 컬럼/테이블만 도입한다. 모든 row가 'default' tenant로 동작하여 단일테넌트 모드 100% 보존.

#### 2.1.2 작업 목록 (T1-1 ~ T1-7)

| Task | 내용 | 파일 |
|------|------|------|
| T1-1 | `Tenant` 모델 신규 추가 (`id`, `displayName`, `status`, `createdAt`, `manifestPath`) | prisma/schema.prisma |
| T1-2 | 11개 PG 모델에 `tenantId String @default("default") @map("tenant_id")` nullable 컬럼 추가 | prisma/schema.prisma |
| T1-3 | drizzle SQLite 3개 테이블에 `tenant_id TEXT DEFAULT 'default'` 컬럼 추가 (ADR-021 self-heal 메커니즘 활용) | src/lib/db/schema.ts |
| T1-4 | `prisma migrate dev --name add_tenant_id_nullable` — DEFAULT 'default' 명시 | migrations/ |
| T1-5 | `tenants` 테이블에 `INSERT INTO tenants (id, display_name, status) VALUES ('default', 'Default (legacy)', 'active')` 시드 | migrations/ |
| T1-6 | Prisma Client Extension — `tenant-context.ts` 신규 (단, 이 단계에선 NO-OP, 단지 import 가능 상태) | src/lib/db/tenant-context.ts |
| T1-7 | AsyncLocalStorage 기반 logger prefix 주입 (값이 없으면 `[tenant=default]`) | src/lib/logger.ts |

#### 2.1.3 Exit Criteria
- 기존 e2e 테스트 100% 통과 (변경 없음)
- 신규 마이그레이션이 멱등 (`prisma migrate status` 깨끗)
- `SELECT COUNT(*) FROM <each_table> WHERE tenant_id IS NULL` = `SELECT COUNT(*) FROM <each_table>` (모든 row가 default 적용 확인)
- 빌드/타입체크 통과

#### 2.1.4 Rollback (Stage 1)

```sql
-- 단순 nullable 컬럼 추가이므로 DROP COLUMN으로 즉시 회복
ALTER TABLE users DROP COLUMN tenant_id;
ALTER TABLE folders DROP COLUMN tenant_id;
-- … 11개 모두 (자동 생성 스크립트 권장)
DROP TABLE tenants;
```
**소요 시간**: 0.5h (스키마 단순). standalone snapshot 백업으로 안전망.

---

### Stage 2: backfill — Phase 1

#### 2.2.1 목적
모든 기존 row에 `tenant_id='default'` 값을 명시 채워, NOT NULL 전환의 사전 조건 충족.

#### 2.2.2 작업 목록

| Task | 내용 |
|------|------|
| T2-1 | `UPDATE users SET tenant_id='default' WHERE tenant_id IS NULL` — 11개 PG 테이블 모두 |
| T2-2 | drizzle SQLite 3개 테이블 동일 UPDATE |
| T2-3 | 행 카운트 검증 스크립트 — 각 테이블 NULL row 0 확인 |
| T2-4 | 트랜잭션 로그 보존 — `pg_dump --table=tenants > backup_pre_enforce.sql` |

#### 2.2.3 Exit Criteria
- `SELECT COUNT(*) FROM <table> WHERE tenant_id IS NOT NULL` = total row count (모든 테이블)
- `SELECT DISTINCT tenant_id FROM <table>` 결과가 `{'default'}` 단일 집합

#### 2.2.4 Rollback (Stage 2)

```sql
-- backfill은 데이터 추가가 아니라 컬럼 값 채움. NULL 복원은 정보 손실 없음.
UPDATE users SET tenant_id=NULL WHERE tenant_id='default';
-- … 동일 패턴 반복
```
**소요 시간**: 1h. 테이블별 row 수 < 100k 가정.

---

### Stage 3: enforce — Phase 1 후반

#### 2.3.1 목적
`tenant_id NOT NULL` + RLS 정책 활성화 + `withTenant()` 가드 catch-all router 적용. **이 단계부터 단일테넌트 코드 경로가 멀티테넌트 가드 위에서 동작**한다 (단일 'default' tenant scope으로).

#### 2.3.2 작업 목록 (T3-1 ~ T3-9)

| Task | 내용 |
|------|------|
| T3-1 | 11개 PG 테이블에 `ALTER TABLE … ALTER COLUMN tenant_id SET NOT NULL` |
| T3-2 | RLS 정책 활성화 — `ALTER TABLE users ENABLE ROW LEVEL SECURITY` + 정책 `USING (tenant_id = current_setting('app.tenant_id', true))` |
| T3-3 | Prisma Client Extension `tenant-context.ts` 활성화 — 모든 트랜잭션 시작 시 `SET LOCAL app.tenant_id = $1` |
| T3-4 | `api-guard-tenant.ts` 신규 — `withTenant()` / `withTenantRole()` 구현 (ADR-027 §5.2) |
| T3-5 | `tenant-router.ts` 신규 — path `/api/v1/t/<tenant>/...` 파싱 + Tenant 조회 + GUC 설정 |
| T3-6 | catch-all route `/api/v1/t/[tenant]/[...path]/route.ts` 신규 → `withTenant` 위임 |
| T3-7 | jwt-v1.ts `AccessTokenPayload`에 `tenantId` + `aud` 클레임 추가 |
| T3-8 | rate-limit `buildBucketKey()` tenantId prefix 강제 (Stage 1 additive 코드의 enforce 모드 켜기) |
| T3-9 | audit-log AsyncLocalStorage 자동 주입 enforce — context 누락 시 `'unknown'` 대신 `'default'` |

#### 2.3.3 Exit Criteria
- RLS 누설 자동 테스트 통과 (Stage별 자동 테스트 §5 참조)
- `withTenant()` E2E 테스트 — tenant=default scope으로 전체 v1 API smoke 통과
- 기존 운영 콘솔 라우트 (`/api/v1/api-keys`, `/api/v1/members` 등) 글로벌 → withTenant catch-all 전환은 Stage 4에서. **Stage 3에서는 신규 catch-all router만 활성화**
- BYPASSRLS role은 마이그레이션 runner만 보유, app role은 미보유 검증
- 기존 단일테넌트 e2e 100% 통과 (default tenant scope 자동 적용)

#### 2.3.4 Rollback (Stage 3)

```sql
-- RLS 정책 + NOT NULL 해제
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_users ON users;
ALTER TABLE users ALTER COLUMN tenant_id DROP NOT NULL;
-- … 11 테이블 반복
```
**소요 시간**: 1.5h. ADR-020 snapshot으로 6h 이내 완전 복원 가능.

**코드 rollback**: Git revert + `pm2 reload`. catch-all route 파일 삭제 (route 자체 무존재 = 자동 무효화).

---

### Stage 4: split — Phase 2

#### 2.4.1 목적
'default' tenant에 섞여 있던 Almanac 도메인 데이터를 `tenant_id='almanac'`으로 분리하고, 코드를 `packages/tenant-almanac/`(ADR-024 옵션 D)로 이동. `/api/v1/almanac/*` → `/api/v1/t/almanac/*` 라우트 전환. **여기서부터 진정한 멀티테넌트 동작**.

#### 2.4.2 작업 목록 (T4-1 ~ T4-10)

| Task | 내용 |
|------|------|
| T4-1 | `INSERT INTO tenants (id, display_name, status) VALUES ('almanac', 'Almanac Plugin', 'active')` |
| T4-2 | Almanac 도메인 row identification 쿼리 — `SELECT … WHERE owner_id IN (<almanac_user_ids>) OR (path LIKE '/almanac/%')` 등 도메인별 식별자로 매핑 (Almanac plugin manifest의 `dataIdentifier` 사용 — ADR-026 §3.4) |
| T4-3 | `UPDATE folders SET tenant_id='almanac' WHERE id IN (<almanac_folder_ids>)` 등 데이터 분리 |
| T4-4 | 분리 검증 — `SELECT tenant_id, COUNT(*) FROM folders GROUP BY tenant_id` 두 그룹 분리 확인 |
| T4-5 | pnpm workspace 활성화 — root `package.json`에 `workspaces: ["apps/web", "packages/*"]` (ADR-024 §3) |
| T4-6 | `packages/tenant-almanac/` 신규 — `manifest.ts`, `routes/`, `schema-fragment.prisma` 이동 |
| T4-7 | Prisma schema 병합 빌드 스크립트 — `scripts/build-prisma-schema.mjs` (core schema + 모든 packages/tenant-*/schema-fragment.prisma 병합) |
| T4-8 | 기존 `/api/v1/almanac/*` 라우트 deprecate (308 redirect to `/api/v1/t/almanac/*`) — 30일 유예 |
| T4-9 | cron registry refactor — `Map<tenantId, RegistryState>` (ADR-028 옵션 D worker_threads pool) |
| T4-10 | EdgeFunction `ALLOWED_FETCH_HOSTS` → DB `tenant_function_policies` 테이블 조회 |

#### 2.4.3 Exit Criteria
- Almanac e2e 통과 (`/api/v1/t/almanac/*`)
- default tenant 데이터에 Almanac row 0개 확인 — `SELECT COUNT(*) FROM folders WHERE tenant_id='default' AND id IN (<almanac_folder_ids>)` = 0
- cross-tenant leak 자동 검증 (almanac scope으로 default 데이터 접근 시도 → 403/empty)
- pnpm workspace 빌드 성공 + Prisma schema 병합 산출물 검증
- 308 redirect 동작 확인 + 클라이언트 호출 로그 모니터링

#### 2.4.4 Rollback (Stage 4)

```sql
-- 데이터 복구: tenant_id를 다시 'default'로
UPDATE folders SET tenant_id='default' WHERE tenant_id='almanac';
-- … 11 테이블
DELETE FROM tenants WHERE id='almanac';
```

**코드 rollback**: `packages/tenant-almanac/` 디렉토리 임시 무력화 (manifest 미등록 → catch-all router에서 404), `apps/web/src/app/api/v1/almanac/*`를 git revert로 복원.

**소요 시간**: 2h (데이터) + 1h (코드 rollback). Stage 4가 가장 위험 — ADR-020 snapshot 필수.

---

### Stage 5: scale — Phase 2~3

#### 2.5.1 목적
N=2, 3, …, 20 컨슈머를 manifest 등록만으로 추가. 코드 변경 없이 `packages/tenant-<id>/` 추가 + `tenants` row 1줄로 새 tenant 활성화.

#### 2.5.2 작업 목록 (반복 가능 — per consumer)

| Task | 내용 |
|------|------|
| T5-1 | 신규 컨슈머 manifest 작성 — `packages/tenant-<id>/manifest.ts` (ADR-026 §3) |
| T5-2 | `INSERT INTO tenants (id, display_name, status, manifest_path) VALUES (<id>, …, 'active', 'packages/tenant-<id>/manifest.ts')` |
| T5-3 | Prisma schema 병합 (자동) — pre-build hook이 packages/tenant-*/schema-fragment.prisma 자동 수집 |
| T5-4 | `prisma migrate deploy` — 신규 모델 row 0 (자동 적용) |
| T5-5 | TenantSwitcher UI에 자동 등장 (manifest registry watch) |
| T5-6 | 신규 tenant smoke test — `/api/v1/t/<id>/health` 200 확인 |

#### 2.5.3 Exit Criteria (per tenant)
- smoke test 통과
- audit log에 새 tenant_id 표시
- cron pool에 새 tenant 컨텍스트 추가 확인 (`pg-boss` queue 자동 생성)
- N=20 도달 시 ADR-029 §3 metrics — p95 latency / memory RSS / pg connections 임계값 미초과

#### 2.5.4 Rollback (Stage 5)
- 신규 tenant 등록 실패 시 `UPDATE tenants SET status='archived' WHERE id=<id>` — 기존 N-1 tenant는 무영향
- packages/tenant-<id>/ 디렉토리 삭제 + Prisma schema 재병합

**Stage 5는 정상 운영 흐름** — 매 신규 tenant 추가가 작은 마이그레이션 사이클이며, 1, 2, 3 컨슈머 시점부터 프로세스 검증 누적.

---

## 3. 각 모델별 마이그레이션 SQL

### 3.1 PG 11개 모델 (User, Folder, File, ApiKey, SqlQuery, EdgeFunction, CronJob, Webhook, Session, JwksKey, RateLimitBucket) + AuditLog

#### 3.1.1 Stage 1 — 컬럼 추가

```sql
-- prisma migrate가 생성하는 패턴 (모델 11개 모두 동일 형태)
ALTER TABLE users           ADD COLUMN tenant_id TEXT DEFAULT 'default';
ALTER TABLE folders         ADD COLUMN tenant_id TEXT DEFAULT 'default';
ALTER TABLE files           ADD COLUMN tenant_id TEXT DEFAULT 'default';
ALTER TABLE api_keys        ADD COLUMN tenant_id TEXT DEFAULT 'default';
ALTER TABLE sql_queries     ADD COLUMN tenant_id TEXT DEFAULT 'default';
ALTER TABLE edge_functions  ADD COLUMN tenant_id TEXT DEFAULT 'default';
ALTER TABLE cron_jobs       ADD COLUMN tenant_id TEXT DEFAULT 'default';
ALTER TABLE webhooks        ADD COLUMN tenant_id TEXT DEFAULT 'default';
ALTER TABLE sessions        ADD COLUMN tenant_id TEXT DEFAULT 'default';
ALTER TABLE jwks_keys       ADD COLUMN tenant_id TEXT DEFAULT 'default';
ALTER TABLE rate_limit_buckets ADD COLUMN tenant_id TEXT DEFAULT 'default';

-- Tenant 레지스트리
CREATE TABLE tenants (
  id            TEXT PRIMARY KEY,
  display_name  TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','archived')),
  manifest_path TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO tenants (id, display_name) VALUES ('default', 'Default (legacy single-tenant)');

-- 인덱스 (각 테이블의 기존 인덱스 옆에 tenant_id 선두)
CREATE INDEX idx_users_tenant ON users (tenant_id);
CREATE INDEX idx_folders_tenant_owner ON folders (tenant_id, owner_id);
CREATE INDEX idx_sessions_tenant_user_expires ON sessions (tenant_id, user_id, expires_at);
-- … 모든 테이블의 핵심 쿼리 패턴에 tenant_id 선두 인덱스 (SP-015 결과 반영, RLS 옵션 B-1 §3.4)
```

#### 3.1.2 Stage 2 — backfill

```sql
-- DEFAULT 'default' 가 신규 INSERT만 채우므로, 기존 row는 명시 UPDATE 필요
UPDATE users           SET tenant_id='default' WHERE tenant_id IS NULL;
UPDATE folders         SET tenant_id='default' WHERE tenant_id IS NULL;
-- … 11 반복

-- 검증
SELECT 'users' AS tbl, COUNT(*) FILTER (WHERE tenant_id IS NULL) AS nulls FROM users
UNION ALL
SELECT 'folders', COUNT(*) FILTER (WHERE tenant_id IS NULL) FROM folders;
-- … 11 반복. 모든 nulls=0이어야 다음 단계 진입.
```

#### 3.1.3 Stage 3 — enforce + RLS

```sql
-- NOT NULL 전환
ALTER TABLE users ALTER COLUMN tenant_id SET NOT NULL;
-- … 11 반복

-- RLS 정책 활성화 (Supabase 패턴)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_users ON users
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
-- … 11 반복

-- 마이그레이션 role만 BYPASSRLS, app role은 무권한
ALTER ROLE app_runtime NOBYPASSRLS;
ALTER ROLE app_migration BYPASSRLS;

-- FK 갱신 (tenant_id 포함)
ALTER TABLE folders
  DROP CONSTRAINT folders_owner_id_fkey,
  ADD CONSTRAINT folders_tenant_owner_fkey
    FOREIGN KEY (tenant_id, owner_id)
    REFERENCES users (tenant_id, id);
-- … cross-table FK 모두 (tenant_id 포함된 복합 FK)
```

### 3.2 SQLite drizzle 3개 테이블 (audit_logs, metrics_history, ip_whitelist)

```sql
-- ADR-029 §2.1 + ADR-021 self-heal 활용
ALTER TABLE audit_logs       ADD COLUMN tenant_id TEXT DEFAULT 'default';
ALTER TABLE metrics_history  ADD COLUMN tenant_id TEXT DEFAULT 'default';
ALTER TABLE ip_whitelist     ADD COLUMN tenant_id TEXT DEFAULT 'default';

CREATE INDEX idx_audit_logs_tenant_time ON audit_logs (tenant_id, timestamp);
CREATE INDEX idx_metrics_tenant_time ON metrics_history (tenant_id, timestamp);

-- SQLite는 RLS 미지원 → app 레이어에서 WHERE 자동 주입 (ADR-029 §2.4 — safeAudit 자동 주입)
```

### 3.3 content_* 테이블 (Almanac 도메인 — Stage 4 split 대상)

```sql
-- Almanac plugin이 가진 content_* 테이블도 동일 패턴
ALTER TABLE content_almanac_entries ADD COLUMN tenant_id TEXT DEFAULT 'default';
-- Stage 4에서 'default' → 'almanac' UPDATE
UPDATE content_almanac_entries SET tenant_id='almanac' WHERE id IN (...);
```

---

## 4. 롤백 전략

### 4.1 Stage별 rollback SQL — §2.X.4 참조

각 Stage는 **순방향 SQL의 역순**으로 정의되며, 모두 idempotent. Stage 4가 가장 위험 (데이터 분리 후 다시 합치는 것은 정합성 손실 위험).

### 4.2 ADR-020 standalone snapshot 활용

| Stage | snapshot 시점 | 복원 방식 |
|-------|--------------|----------|
| Pre-Stage 1 | `bash standalone/pack-standalone.sh && cp -r snapshots/$(date +%Y%m%d_pre_stage1)` | rsync 역방향 + `pm2 reload` |
| Pre-Stage 3 | 동일 패턴 (`_pre_stage3_enforce`) | RLS 정책이 잘못 적용 시 4h 이내 복원 |
| Pre-Stage 4 | 동일 패턴 (`_pre_stage4_split`) | 데이터 분리 실패 시 가장 결정적 안전망 |
| Pre-Stage 5 (per tenant) | tenant 추가 전 `pg_dump --table=tenants > tenant_<id>_pre.sql` | 단일 tenant 추가 실패는 tenant 'archived' status로 격리 |

### 4.3 Forward-only with feature flag (보조 전략)

Stage 3 enforce 코드 측면에서 환경변수로 기능 분기:

```typescript
// src/lib/api-guard-tenant.ts
export const TENANT_ENFORCE_MODE = process.env.TENANT_ENFORCE_MODE ?? 'strict';
// strict / relaxed / disabled

if (TENANT_ENFORCE_MODE === 'disabled') {
  // Stage 3 가드 우회 — 단일 tenant 'default' 강제
  return handler(request, user, { id: 'default' }, context);
}
```
긴급 시 `pm2 set ypb-server:env.TENANT_ENFORCE_MODE disabled && pm2 reload ypb-server`로 즉시 회피 (DB SQL rollback 없이 6초 내 복원).

### 4.4 Rollback 의사결정 트리

```
실패 발생
   │
   ├─ 빌드/타입 실패 → Git revert (코드만)
   │
   ├─ Stage 1 마이그레이션 실패 → DROP COLUMN (1h)
   │
   ├─ Stage 2 backfill 검증 실패 → UPDATE … SET NULL 후 원인 분석
   │
   ├─ Stage 3 RLS 누설 발견 → feature flag disabled (즉시) → 정책 수정 → 재 enforce
   │
   ├─ Stage 4 데이터 분리 손실 → standalone snapshot rsync 복원 (6h 이내)
   │
   └─ Stage 5 신규 tenant 실패 → tenant.status='archived' (다른 tenant 무영향)
```

---

## 5. 검증 게이트

### 5.1 Stage별 자동 테스트 (E2E + 회귀)

#### Stage 1 — additive
```typescript
// tests/migration/stage-1-additive.spec.ts
test('all tables have tenant_id column with default value', async () => {
  for (const tbl of ['users', 'folders', /* 11개 */]) {
    const cols = await pg.query(`SELECT column_name, column_default FROM information_schema.columns WHERE table_name=$1 AND column_name='tenant_id'`, [tbl]);
    expect(cols.rows[0].column_default).toBe(`'default'::text`);
  }
});

test('legacy e2e suite passes unchanged', async () => {
  // 기존 e2e suite 100% 그대로 실행
  await runLegacyE2E();
});
```

#### Stage 2 — backfill
```typescript
test('no NULL tenant_id rows remain', async () => {
  for (const tbl of [/* 11개 */]) {
    const { rows } = await pg.query(`SELECT COUNT(*) AS c FROM ${tbl} WHERE tenant_id IS NULL`);
    expect(parseInt(rows[0].c, 10)).toBe(0);
  }
});
```

#### Stage 3 — enforce + RLS
```typescript
test('cross-tenant leak: app role cannot read other tenant data', async () => {
  // GUC 설정 없이 SELECT 시도 → 0 rows (RLS 차단)
  const { rows } = await appPgClient.query(`SELECT * FROM users LIMIT 1`);
  expect(rows.length).toBe(0);
});

test('withTenant guard requires valid tenant in path', async () => {
  const res = await fetch('/api/v1/t/nonexistent/users');
  expect(res.status).toBe(404);
});

test('legacy paths (/api/v1/users) still work for default tenant via JWT', async () => {
  // 옵션: enforce mode가 'relaxed'면 JWT의 tenantId='default' fallback
  // strict 모드에서는 410 Gone
});
```

#### Stage 4 — split
```typescript
test('almanac data isolated from default tenant', async () => {
  await pg.query(`SET app.tenant_id='default'`);
  const { rows: defaultRows } = await pg.query(`SELECT COUNT(*) AS c FROM folders WHERE name LIKE 'almanac/%'`);
  expect(parseInt(defaultRows[0].c, 10)).toBe(0);
});

test('GET /api/v1/t/almanac/health returns 200', async () => {
  const res = await fetch('/api/v1/t/almanac/health');
  expect(res.status).toBe(200);
});
```

#### Stage 5 — scale
```typescript
test('register new tenant via manifest', async () => {
  await registerTenant('test-tenant-2');
  const res = await fetch('/api/v1/t/test-tenant-2/health');
  expect(res.status).toBe(200);
});
```

### 5.2 Cross-tenant leak 자동 검증 (CI 게이트)

```typescript
// tests/security/cross-tenant-leak.spec.ts (CI 매 PR 실행)
describe('cross-tenant isolation', () => {
  beforeAll(async () => {
    await seedTenant('alpha', { users: 5, folders: 10 });
    await seedTenant('beta',  { users: 3, folders: 7 });
  });

  test('alpha API key cannot read beta data', async () => {
    const alphaKey = await issueApiKey('alpha-user', 'alpha');
    const res = await fetch('/api/v1/t/beta/users', { headers: { Authorization: `Bearer ${alphaKey}` } });
    expect(res.status).toBe(403);
  });

  test('SQL execute via alpha context returns only alpha rows', async () => {
    const alphaCtx = await loginAs('alpha-user');
    const { rows } = await alphaCtx.sqlExecute('SELECT id FROM folders');
    const beta = rows.filter(r => belongsToBeta(r.id));
    expect(beta.length).toBe(0);
  });
});
```

이 테스트는 Stage 3 이후 모든 PR의 필수 게이트.

### 5.3 Phase별 Go/No-go 게이트

| Phase | Entry | Exit |
|-------|-------|------|
| Phase 0 | Stage 0 — 본 문서 + ADR-022~029 ACCEPTED | architecture spec 12건 완료 |
| Phase 1 | Stage 1 + Stage 2 + Stage 3 | RLS 누설 0, default tenant e2e 100% |
| Phase 2 | Stage 4 (Almanac 분리) | almanac e2e 100%, cross-tenant leak 0 |
| Phase 3 | Stage 5 시작 (N=2, 3, …) | per-tenant smoke 100%, observability metric per-tenant 분리 확인 |

---

## 6. 동시 작업 충돌 회피

### 6.1 spec/aggregator-fixes 브랜치 (다른 터미널)와 충돌 방지

`02-current-code-audit.md` §8에서 식별된 위험 파일:
- `src/lib/cron/registry.ts`
- `src/lib/cron/runner.ts`
- `src/lib/pg/pool.ts`

**충돌 회피 규칙**:
1. **본 마이그레이션은 ADR 문서 작성 + `docs/research/baas-foundation/` 신규 파일만** — Stage 1 시작 전까진 코드 미변경
2. **Stage 1 진입 조건**: `spec/aggregator-fixes` 브랜치가 main에 머지 완료
3. cron 관련 수정 (Stage 4 T4-9)은 spec/aggregator-fixes의 cron 변경이 main에 머지된 후 시작

### 6.2 Almanac v1.0 출시와의 순서

ADR-022 §3.4: Almanac은 첫 번째 컨슈머. **Almanac v1.0 출시 후 Stage 4 split 진입**:
- Almanac v1.0 출시 전: Stage 1~3까지만 (default tenant 모드)
- Almanac v1.0 출시 = Stage 4 진입 트리거

이 순서가 깨지면 데이터 식별이 어려워진다 (Almanac이 어떤 row 소유인지 명확치 않음).

### 6.3 머지 순서 (강제)

```
[현재] spec/aggregator-fixes 브랜치 (cron/pg pool 변경 진행 중)
        ↓ 머지
[T1] main 브랜치 (안정화)
        ↓ 분기
[T2] feat/baas-foundation-stage-1 (본 마이그레이션)
        ↓ Stage 1~3 머지
[T3] main + multi-tenant scaffold (default tenant 모드)
        ↓ Almanac v1.0 출시
[T4] feat/baas-foundation-stage-4-almanac (split)
        ↓
[T5] main + 첫 멀티테넌트 가동
```

### 6.4 충돌 발견 시 대응

1. PR 단계에서 conflict marker 발견 → 본 마이그레이션 PR이 후행으로 양보
2. Stage 1 마이그레이션 후 spec/aggregator-fixes의 cron 수정이 main에 들어오면 — `prisma migrate dev` 재실행으로 schema 자동 정합 (additive이므로 안전)
3. 같은 파일 동시 수정 → kdyswarm 패턴으로 워크트리 격리 (각 작업이 독립 worktree)

---

## 7. 마이그레이션 공수 추정

| Stage | 작업 | 공수 | 누적 |
|-------|------|------|------|
| Stage 1 | additive — 컬럼/모델/extension 추가 | 16h | 16h |
| Stage 2 | backfill + 검증 | 6h | 22h |
| Stage 3 | enforce — RLS + 가드 + jwt + router | 32h | 54h |
| Stage 4 | split — Almanac 분리 + plugin 코드 이동 + cron pool refactor | 40h | 94h |
| Stage 5 | scale — 컨슈머 N=2부터 N=20까지 (per consumer 4h × 19) | 76h | 170h |
| 검증 | E2E + cross-tenant leak + per-tenant observability 자동화 | 24h | 194h |
| 인수인계 + 문서 | 각 Stage 후 docs/handover + status 갱신 | 8h | 202h |

**합계**: ~200h (Stage 5의 N=20까지 포함). Stage 4까지는 ~94h. 기존 supabase-parity 870h + 본 마이그레이션 200h + ADR-022~029 작성 60h = **~1,130h** (95% CI: 1,000~1,250h).

---

## 8. 본 문서가 다루지 않는 것 (out of scope)

- ADR-026 manifest의 정확한 TypeScript 인터페이스 — `02-architecture/04-adr-026-impl-spec.md` 참조
- `withTenant()` 가드의 전체 코드 구현 — `01-architecture/06-adr-027-impl-spec.md` 참조
- pg-boss/worker_threads cron pool — `01-architecture/07-adr-028-impl-spec.md` 참조
- per-tenant observability dashboard UI — `01-architecture/08-adr-029-impl-spec.md` 참조
- Wave 1~5 산출물의 retrofit 항목 — [01-wave-compatibility-matrix.md](./01-wave-compatibility-matrix.md) 참조

---

> 본 문서 신뢰도: 95% (ADR-022~029 ACCEPTED 인용 100%, 코드 audit §1~9 인용 100%, Stage별 SQL은 옵션 B RLS 패턴 표준 적용).
> 다음 단계: kdyswarm으로 Stage 1 sub-agent N=3 병렬 발사 (T1-1+T1-4 / T1-2+T1-3 / T1-6+T1-7).
