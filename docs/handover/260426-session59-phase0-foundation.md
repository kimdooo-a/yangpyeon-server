# 인수인계서 — 세션 59 (Phase 0 Foundation 완료)

> 작성일: 2026-04-26
> 이전 세션: [session58](./260426-session58-baas-foundation.md)
> 상위: [CLAUDE.md](../../CLAUDE.md) → [current.md](../status/current.md) → 여기

---

## 작업 요약

세션 58에서 ACCEPTED 된 ADR-022~029 + kdywave 산출물 위에서 **Phase 0 Foundation 7 task 순차 완료**. 7 commits, M1 게이트 모든 정적 검증 통과. Phase 1 진입 준비 완료 (사용자 이미 T1.1 TenantContext 시작).

## 대화 다이제스트

### 토픽 1: 진입점 + Phase 0 순차 진행 요청

> **사용자**: "다음 세션 진입점 및 phase 0 부터 모두 순차적 진행"

세션 58 산출물(31파일 16,826줄 baas-foundation/) untracked 상태 → 사용자 자율 실행 우선 메모리 준수. Phase 0 task DAG 확인 → 7개 task 분해 (진입점 commit / T0.1 / T0.5 / T0.2 / T0.3 / T0.4 / M1).

**결정**: 분기 질문 없이 즉시 실행. 단 T0.2 monorepo는 "사용자 확인 필수" task였으나 사용자 명시 지시로 진행 권한 부여 받음.

### 토픽 2: T0.1 — spike-baas-002 부수 fix 3건

> Sprint plan §0.1: 즉시 적용 가능한 ADR-028 결정 무관 결함 fix.

3건 모두 `src/lib/cron/`에 위치:

1. **runner.ts:21** — `DEFAULT_ALLOWED_FETCH` 하드코딩 → `loadAllowedFetchHosts()` env 기반 (`CRON_ALLOWED_FETCH_HOSTS` 콤마 구분) + Phase 1.6 TODO 주석 (ADR-024 옵션 D + ADR-026 manifest 이전 마커).
2. **runner.ts:72** — WEBHOOK fetch에 `AbortController` + `WEBHOOK_FETCH_TIMEOUT_MS` (env override, 기본 30s) + try/finally clearTimeout. AbortError 명시적 catch → status: "TIMEOUT" 반환 (에러 메시지 명확화).
3. **registry.ts:135** — `} catch { /* 무시 */ }` → structured `console.warn` + `safeAudit("cron.runjob.failure")`. ADR-021 cross-cutting fail-soft + 세션 54 CK-38 패턴 (글로벌 cron 모듈에서 silent failure 패턴 마지막 1곳 제거).

**검증**: `npx tsc --noEmit` src/ 0 에러. M1 grep 검증 3종 모두 매칭.

**결론**: 단독 commit `619a952`. ADR-021 cross-cutting의 "사일런트 실패 패턴 sweep" 완성.

### 토픽 3: T0.5 — Almanac spec 동기화 노트

> Sprint plan §0.5 + §9 시점 표 — 본 터미널과 aggregator-fixes 터미널의 작업 분리.

`docs/assets/yangpyeon-aggregator-spec/03-multi-tenant-migration-plan.md` 247줄 신설:

- Phase 별 변경 지점 매트릭스 (Phase 0.5/v1.0/0.4/1.6/2.5/2.5+)
- ADR-023 옵션 B 영향: `content_*` 5 테이블에 `tenant_id` + RLS 정책 (Phase 1.4)
- ADR-024 옵션 D 영향: aggregator 코드 → `packages/tenant-almanac/` (Phase 2.5)
- ADR-027 영향: `/api/v1/almanac/*` → `/api/v1/t/almanac/*` (alias 2주, 종료 시 410 Gone)
- ADR-028 영향: cron 3종(rss-collect/classify/promote)을 `TenantWorkerPool`에서 실행
- 충돌 회피 매트릭스 (T0.1 영향 0 / T0.2 spec 적용 후 / T0.3·T0.4 즉시 머지 OK / Phase 1.6·2.5 출시 후)
- Phase 2.5 완료 검증 체크리스트 6 시나리오 (코드 위치 / Prisma fragment 머지 / Manifest 등록 / Router 회귀 / RLS 격리 / PR diff M3 게이트)

**결론**: commit `66dd62e`. Almanac v1.0 spec 차단 0, Phase 2.5 마이그레이션 시점 사전 정의.

### 토픽 4: T0.2 — Incremental monorepo (src 이동 보류 결정)

> Sprint plan §0.2가 명시한 src/, public/, app/ 이동은 6h + `pack-standalone.sh` 강결합.

**위험 분석**:
- `scripts/pack-standalone.sh` Line 17: `SRC=$ROOT/.next/standalone` — 현 루트 구조 가정.
- `wsl-build-deploy.sh`, `pack-standalone.sh`, `ecosystem.config.cjs`, `next.config.ts` 등 4-5개 파일이 src/ 위치를 강결합.
- 한 세션에 6h 작업 + 빌드 깨짐 위험 + PM2 standalone 회귀 가능.

**결정 — Incremental approach**:
- 본 PR: pnpm-workspace.yaml + turbo.json + packages/core/ 골격만 (additive only)
- 별도 PR (보류): src/ → apps/web/ 이동
- 별도 PR (보류): npm → pnpm lockfile 전환

**산출 4 파일** (187줄):
- `pnpm-workspace.yaml` — apps/* + packages/* 패턴
- `turbo.json` — build/test/lint/dev/db:generate 파이프라인 + CRON_ALLOWED_FETCH_HOSTS / CRON_WEBHOOK_FETCH_TIMEOUT_MS env 화이트리스트
- `packages/core/{package.json, src/index.ts, tsconfig.json, README.md}` — 4 불변 인터페이스 로드맵 stub (withTenant / withTenantTx / dispatchTenantJob / computeEffectiveConfig)

**tsconfig.json 변경**: exclude에 `packages/**`, `apps/**` 추가 — 이중 typecheck 방지.

**검증**: 루트 + packages/core/ 양쪽 `tsc --noEmit` 0 에러.

**결론**: commit `d24ea37`. packages/core README의 4 불변 인터페이스 로드맵이 Phase 1 sub-agent들의 "부재한 알람" — 다른 시그니처 작성 시 즉시 충돌.

### 토픽 5: T0.3 — Tenant 모델 + Stage 1 additive 마이그레이션

> Sprint plan §0.3 + Migration Strategy §2.1.

**스키마 결정**:
- **Tenant 모델 신설** — id UUID PK + slug TEXT UNIQUE + displayName + status + runtimeOverrides Json + timestamps
- **18개 비즈니스 모델 일괄** — `tenantId String? @map("tenant_id") @db.Uuid` (nullable, no default)
- 관계 필드 미추가 (Stage 3 enforce 시 FK + relation)
- 인덱스 미추가 (Stage 3 RLS 활성화 시)

**식별자 결정** (Sprint plan §0.3 vs Migration Strategy 충돌 해결):
- Sprint plan: UUID + slug 분리
- Migration Strategy: `tenantId String @default("default")` (UUID 와 충돌)
- **채택**: Sprint plan 형식 — Tenant.id UUID, slug TEXT URL 식별자, 비즈니스 tenantId UUID (FK는 Stage 3)

**마이그레이션** `prisma/migrations/20260427000000_add_tenant_model_stage1/migration.sql` (146줄):
1. CREATE TABLE tenants (UUID PK + slug UNIQUE + status + runtime_overrides + timestamps)
2. INSERT 'default' tenant — 고정 UUID `00000000-0000-0000-0000-000000000000` (Phase 1 backfill 대상, slug='default')
3. ALTER TABLE × 18 — ADD COLUMN tenant_id UUID NULL

**Rollback** (Stage 1 즉시 회복 가능):
```sql
ALTER TABLE users DROP COLUMN tenant_id; -- × 18
DROP TABLE tenants;
```

**검증**: `npx prisma validate` ✓ valid / `npx prisma generate` ✓ Prisma Client 7.7.0 / `tsc --noEmit` src/ 0 에러 (기존 코드의 PrismaClient 사용 무수정 호환).

**결론**: commit `89ea7e4`. Stage 1 additive의 위력 — 18개 모델에 tenant_id 추가했지만 회귀 0 (nullable + 기존 코드 경로 무수정).

### 토픽 6: T0.4 — ADR-021 §amendment-2 (audit Tenant 차원)

> Migration Strategy §1.2 H1: SQLite 3 테이블 (auditLogs / metricsHistory / ipWhitelist) tenant_id 추가.

**결정 D-1~D-4** (ADR-021 §amendment-2 신설, ~140줄):

#### D-1. SQLite 3 테이블 — `tenantId text DEFAULT 'default'` 일괄 추가

```ts
// src/lib/db/schema.ts
auditLogs.tenantId = text('tenant_id').default('default');
metricsHistory.tenantId = text('tenant_id').default('default');
ipWhitelist.tenantId = text('tenant_id').default('default');
```

마이그레이션 `0001_add_tenant_id.sql`: ALTER TABLE × 3 (TEXT DEFAULT 'default').

`_journal.json` entry idx 1 추가. ADR-021 §amendment-1 self-heal 메커니즘이 부팅 시 자동 적용.

#### D-2. 식별자 — slug (TEXT) 채택

| 측면 | PG (UUID) | audit (slug TEXT) |
|------|-----------|-------------------|
| 형식 | `00000000-...000` | 'default' / 'almanac' |
| 용도 | RLS GUC, FK | dashboard 표시, byBucket prefix |
| 가독성 | 운영자 불투명 | 즉시 인식 |

**근거**: audit dashboard는 사람이 읽음. UUID 변환 비용 < 가독성 가치. PG-SQLite 의도적 별개. 통일은 next-gen audit 백엔드(ClickHouse 등) 시 재검토.

#### D-3. safeAudit 시그니처 불변 보장

- Phase 0.4 시점: 시그니처 변경 0, 11 도메인 콜사이트 무수정.
- Phase 1.7: AsyncLocalStorage 자동 주입 — `getCurrentTenant()?.slug ?? 'default'`. 콜사이트 여전히 무수정.

```ts
// Phase 1.7 시점 — 시그니처 동일, 내부에서 자동 주입
export function safeAudit(entry: AuditEntry, context?: string): void {
  const ctx = context ?? entry.action ?? `${entry.method} ${entry.path}`;
  const tenantId = getCurrentTenant()?.slug ?? 'default'; // ← 자동 주입
  try {
    writeAuditLogDb({ ...entry, tenantId });
    recordAuditOutcome(true, ctx);
  } catch (err) {
    recordAuditOutcome(false, ctx, err);
    console.warn("[audit] write failed", { context: ctx, error: ... });
  }
}
```

#### D-4. MAX_BUCKETS=200 cap 유지

§amendment-1의 cardinality cap 유지:
- N=20 컨슈머 × 6 버킷 = 120 series < 200 안전
- Phase 3.4 자동 정책 (180/200 임계 도달 시 자동 cap 강화 + Operator 경고)
- N=30 도달 시 OTel 검토 (ADR-029 §6 트리거 B)

bucketName tenant prefix 패턴 (Phase 1.7):
- "almanac:cron.runjob.failure"
- "default:session.login"

**검증**: `tsc` 0 에러 + `vitest audit-metrics.test.ts` 9/9 PASS (회귀 0).

**결론**: commit `5a06c96`. cross-cutting의 cross-cutting — 11 콜사이트 영향 0으로 멀티테넌트 audit 도입.

### 토픽 7: M1 게이트 — `npm run build` PASS

> M1 exit criteria 8종 검증 (Sprint Plan §00 + Task DAG §8.1).

**문제 발견**: 첫 `npm run build` 실패:
```
./docs/assets/yangpyeon-aggregator-spec/code/prisma/seed-aggregator.ts:300:30
Type error: Property 'contentCategory' does not exist on type 'PrismaClient'.
```

**근본 원인 분석**: `git stash` + 재시도로 베이스라인도 동일 실패 → **사전 존재 이슈** (세션 57 spec/aggregator-fixes 작업물). 본 세션 변경분과 무관 — `docs/assets/yangpyeon-aggregator-spec/code/`의 미적용 Almanac spec 코드가 typecheck 단계에 끼어듦.

**해결**: `tsconfig.json` exclude에 `docs/assets/**` 추가. `packages/**` + `apps/**` 와 동일 패턴. spec 코드는 사용자 spec 적용 PR 시점에만 typecheck 받음.

**최종 검증**:
- ✓ `npm run build` Compiled successfully + 모든 라우트 빌드
- ✓ `npx prisma validate` valid
- ✓ `npx prisma generate` Prisma Client 7.7.0
- ✓ `npx tsc --noEmit` src/ 0 에러
- ✓ `vitest audit-metrics.test.ts` 9/9 PASS
- ✓ T0.1 spike fix grep × 3 매칭 (AbortController / cron.runjob.failure / Phase 1.6)
- ✓ 모노레포 인프라 4 파일 존재
- ✓ Tenant 모델 + 18 tenantId 컬럼 매칭

**남은 검증** (배포 환경 필요):
- ⚠ `prisma migrate status` clean (PG 연결 필요)
- ⚠ PM2 standalone 헬스 200 (WSL 배포 시 검증 — drizzle 0001 self-heal 자동 적용)

**결론**: commit `d65cfce`. M1 게이트 모든 정적 검증 통과. Phase 0 완료.

## 의사결정 요약

| # | 결정 | 선택지 | 선택 이유 |
|---|------|--------|----------|
| 1 | T0.2 src 이동 보류 | A) 6h 풀 마이그레이션 / **B) Incremental** | `pack-standalone.sh` 강결합 + 4-5 스크립트 동시 갱신 위험. 빌드 100% 호환 우선. |
| 2 | Tenant 식별자 — UUID + slug | A) UUID only / B) slug only / **C) UUID PK + slug** | URL은 slug 가독, FK는 UUID 정합. Sprint plan §0.3 그대로. |
| 3 | 비즈니스 tenantId nullable, no default | A) NOT NULL with default / **B) Nullable** | Stage 1 additive 본질 — Stage 2에서 backfill, Stage 3에서 NOT NULL. |
| 4 | PG-SQLite tenant_id 분리 | A) 둘 다 UUID / **B) PG=UUID, SQLite=slug** | audit dashboard 가독성 > UUID 변환 비용. |
| 5 | safeAudit 시그니처 불변 | A) entry.tenantId 추가 / **B) AsyncLocalStorage 자동 주입 (Phase 1.7)** | §amendment-1 invariant 보존. 콜사이트 누락 시 default fallback이 더 안전. |
| 6 | MAX_BUCKETS=200 유지 | A) tenant 차원 도입 후 상향 / **B) 200 유지** | N=20 × 6 = 120 < 200 안전. Phase 3.4 자동 정책으로 동적 조정. |
| 7 | tsconfig docs/assets/** exclude | A) spec 파일 typecheck 강제 / **B) exclude** | 사전 존재 이슈, 빌드 차단. spec 적용 PR 시점에만 typecheck. |

## 수정 파일 (12개)

| # | 파일 | 변경 내용 |
|---|------|-----------|
| 1 | `src/lib/cron/runner.ts` | `loadAllowedFetchHosts()` env 기반 + AbortController + WEBHOOK_FETCH_TIMEOUT_MS |
| 2 | `src/lib/cron/registry.ts` | runJob catch silent failure → safeAudit + structured warn |
| 3 | `pnpm-workspace.yaml` | 신규 — apps/* + packages/* |
| 4 | `turbo.json` | 신규 — build/test/lint 파이프라인 + CRON_* env |
| 5 | `packages/core/package.json` | 신규 — @yangpyeon/core skeleton |
| 6 | `packages/core/src/index.ts` | 신규 — CORE_VERSION + 4 불변 인터페이스 로드맵 |
| 7 | `packages/core/tsconfig.json` | 신규 — composite + 루트 상속 |
| 8 | `packages/core/README.md` | 신규 — 4 불변 인터페이스 + Phase 1.1~2.1 일정 |
| 9 | `prisma/schema.prisma` | Tenant 모델 신설 + 18 모델 tenantId nullable |
| 10 | `prisma/migrations/20260427000000_add_tenant_model_stage1/migration.sql` | 신규 — Stage 1 additive |
| 11 | `src/lib/db/schema.ts` | 3 테이블 tenantId 추가 |
| 12 | `src/lib/db/migrations/0001_add_tenant_id.sql` | 신규 — Stage 1 additive |
| 추가 | `src/lib/db/migrations/meta/_journal.json` | entry idx 1 추가 |
| 추가 | `tsconfig.json` | exclude packages/** + apps/** + docs/assets/** |
| 추가 | `docs/assets/yangpyeon-aggregator-spec/03-multi-tenant-migration-plan.md` | 신규 — 마이그레이션 계획 |
| 추가 | `docs/research/decisions/ADR-021-audit-cross-cutting-fail-soft.md` | §amendment-2 추가 |

## 상세 변경 사항

### 1. T0.1 — spike-baas-002 부수 fix (commit `619a952`)

`src/lib/cron/runner.ts`:
- 21~33: `loadAllowedFetchHosts()` env 기반 fallback. `CRON_ALLOWED_FETCH_HOSTS` 콤마 구분.
- 35~41: `WEBHOOK_FETCH_TIMEOUT_MS` env override (기본 30,000ms).
- 87~118: WEBHOOK case에 AbortController + try/finally clearTimeout. AbortError → "TIMEOUT" 분기.

`src/lib/cron/registry.ts`:
- 1~3: `import { safeAudit } from "@/lib/audit-log-db"` 추가.
- 134~158: catch 블록 — structured `console.warn` + `safeAudit("cron.runjob.failure")`.

### 2. T0.5 — Almanac sync 노트 (commit `66dd62e`)

`docs/assets/yangpyeon-aggregator-spec/03-multi-tenant-migration-plan.md` 신설 247줄.

### 3. T0.2 — 모노레포 incremental (commit `d24ea37`)

7 파일 187줄 신규. 자세한 내용은 토픽 4 참조.

### 4. T0.3 — Tenant 모델 + Stage 1 마이그레이션 (commit `89ea7e4`)

`prisma/schema.prisma`:
- Tenant 모델 신설 (~10줄 + 주석 ~20줄).
- 18 모델에 `tenantId String? @map("tenant_id") @db.Uuid` 일괄 추가 + 주석 (모델당 1줄 + 주석).

`prisma/migrations/20260427000000_add_tenant_model_stage1/migration.sql` 146줄 신규.

### 5. T0.4 — ADR-021 §amendment-2 (commit `5a06c96`)

`src/lib/db/schema.ts` — 3 테이블에 tenantId.
`src/lib/db/migrations/0001_add_tenant_id.sql` 신규.
`src/lib/db/migrations/meta/_journal.json` entry 추가.
`docs/research/decisions/ADR-021-audit-cross-cutting-fail-soft.md` §amendment-2 신설 ~140줄.

### 6. M1 게이트 fix (commit `d65cfce`)

`tsconfig.json` exclude에 `docs/assets/**` 추가.

## 검증 결과

- `npx tsc --noEmit -p tsconfig.json` (src/) — **0 errors**
- `npx tsc --noEmit -p packages/core/tsconfig.json` — **0 errors**
- `npx prisma validate --schema=prisma/schema.prisma` — **The schema is valid**
- `npx prisma generate` — **Generated Prisma Client (7.7.0)**
- `npx vitest run src/lib/audit-metrics.test.ts` — **9/9 PASS** (333ms)
- `npm run build` — **Compiled successfully** (Next.js standalone build, 모든 라우트)

남은 검증 (배포 환경):
- `prisma migrate deploy` — 운영 DB 적용 필요 (Phase 1 진입 시)
- `pm2 logs ypserver` audit log write failed grep — 04-26 03:00 KST cron 첫 정상 실행 확인 필요

## 터치하지 않은 영역

### 사용자/다른 터미널 진행 중 (cs commit 미반영)
- `packages/core/src/tenant/{context.ts, index.ts}` — 사용자가 Phase 1.1 TenantContext 시작
- `packages/core/src/index.ts` — Phase 1.1 export 추가 (`getCurrentTenant`, `runWithTenant`, `TenantContext`)
- `packages/core/tsconfig.json` — `"types": ["node"]` 추가
- `vitest.config.ts` — Phase 1.1 테스트 셋업

→ 다음 세션에서 별도 PR로 검증/머지 권장. cs 작업과 분리.

### 사전 존재 이슈
- `standalone/README.md` — 세션 시작 전부터 modified 상태 (마크다운 구조 일부 손상). 본 세션 작업과 무관, 보존.

### 의도적 보류 (Phase 1+ 별도 PR)
- src/ → apps/web/ 이동 (`scripts/pack-standalone.sh` 영향 분석 필요)
- npm → pnpm lockfile 전환 (점진 전환)
- Stage 2 backfill (`UPDATE × 18 SET tenant_id = default UUID`) — Phase 1.4
- safeAudit AsyncLocalStorage 자동 주입 — Phase 1.7
- packages/tenant-almanac/ 신설 — Phase 2.5

## 알려진 이슈

- 사용자가 cs 시점에 packages/core/src/tenant/ + 관련 파일을 working tree로 추가 → 다음 세션에서 별도 PR로 검증.
- standalone/README.md 마크다운 손상 (사전 존재) — 별도 세션에서 재정비 필요.
- M1 검증 중 배포 환경 의존 2건 (`prisma migrate status`, PM2 헬스) — Phase 1 진입 후 deploy 시 자동 검증.

## 다음 작업 제안

### P0: Phase 1 진입 — T1.1 검증/머지 + T1.2 시작

1. **T1.1 TenantContext** (사용자 진행 중) — 머지 검증:
   - `getCurrentTenant`, `getCurrentTenantOrNull`, `runWithTenant` API 일관성
   - AsyncLocalStorage nested context 단위 테스트
   - error 전파 및 async boundary 동작
2. **T1.2 withTenant 가드 + catch-all router** (16h, T1.1 의존):
   - `apps/web/app/api/v1/t/[tenant]/[...path]/route.ts` 신설 (catch-all)
   - `withTenant(handler)` HOC: tenant slug 추출 → DB 조회 → status 검증 → `runWithTenant` → SET LOCAL
   - 가드 누락 시 build 시점 에러 (Phase 3.5 ESLint rule로 강제)

### P1: T1.3 + T1.5 + T1.7 병렬 (T1.2와 동시)

3. **T1.3 ApiKey K3 매칭** (12h) — prefix + FK + 검증 3중. ADR-027 §K3.
4. **T1.5 TenantWorkerPool** (30h) — spike-baas-002 §6 sketch 시작점 -8h. registry.ts → `Map<tenantId, RegistryState>`.
5. **T1.7 audit-metrics tenant 차원** (6h) — bucketName tenant prefix + audit-failure per-tenant.

### P2: T1.4 RLS 정책 (T1.2 + T1.3 머지 후)

6. **T1.4 RLS 정책 단일 'default'** (18h) — `withTenantTx()` 래퍼 + Prisma Client Extension + e2e 5건.

### P3 (이월)

7. Almanac spec 적용 (사용자 결정 시 — 02-applying-the-patch 그대로)
8. 04-26 03:00 KST cron 결과 확인 (`audit log write failed` 0건 검증)
9. ADR placeholder cascade 6위치 정정 (S56 §보완 2 §D)
10. 다른 글로벌 스킬 audit drift (kdyship/kdydeploy 등)
11. S54·53 잔존 6항

### 사전 권장: kdyswarm Phase 1 본격 발사

Sprint Plan §9 G1b — T1.2 / T1.3 / T1.5 / T1.7 4 agent 병렬 발사. 각 다른 디렉토리 (apps/web/, packages/core/auth/, packages/core/cron/, packages/core/audit/) 충돌 안전.

---

## 참조

- [세션 58 인수인계서](./260426-session58-baas-foundation.md)
- [Sprint Plan Overview](../research/baas-foundation/04-architecture-wave/02-sprint-plan/00-roadmap-overview.md)
- [Task DAG](../research/baas-foundation/04-architecture-wave/02-sprint-plan/01-task-dag.md)
- [Migration Strategy](../research/baas-foundation/04-architecture-wave/03-migration/00-migration-strategy.md)
- [ADR-021 §amendment-2](../research/decisions/ADR-021-audit-cross-cutting-fail-soft.md)
- [세션 59 저널](../logs/journal-2026-04-26.md#세션-59)

[← handover/_index.md](./_index.md)
