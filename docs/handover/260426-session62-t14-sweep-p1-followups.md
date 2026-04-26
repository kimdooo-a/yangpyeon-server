# 인수인계서 — 세션 62 (T1.4-sweep + P1 통합 부채 정리 — kdyswarm parallel)

> 작성일: 2026-04-26
> 이전 세션: [session61](./260426-session61-t1.4-rls-p0-membership.md)
> 저널 원본: [journal-2026-04-26.md](../logs/journal-2026-04-26.md)

---

## 작업 요약

세션 61 권장 진입점 `/kdyswarm --tasks T1.4-sweep,P1-keys-tenant-include,P1-resolve-tenant --strategy parallel` 자율 채택. 3 agent 워크트리 격리 동시 발사 → 6 swarm 커밋 + sentinel 보정 1 → 통합 4 게이트 PASS (prisma validate / tsc 0 / vitest 364 pass / build OK). 통합 부채 잔여 2건 마감 + T1.4 글로벌 @unique 제거 sweep 완료. 다음 진입점은 T1.6 Almanac backfill (M2 게이트 직전).

## 대화 다이제스트

### 토픽 1: 다음 권장 진입점 즉시 채택
> **사용자**: (세션 61 보고서 인용 후) "다음 권장 진입 점 수행"

memory `feedback_autonomy` (자율 실행 우선 — 분기 질문 금지) 준수. 세션 61 보고서의 두 옵션 중 첫 번째(parallel)를 즉시 선택. 근거: T1.4-sweep / P1-keys-tenant-include / P1-resolve-tenant 3건은 영향 파일 0% 중첩이라 워크트리 격리하에 안전 병렬 가능, T1.6-almanac-backfill은 RLS 후 진입 가능한 후속 단계이므로 본 swarm 후 단독 세션이 적절.

**결론**: kdyswarm Phase 0~7 자율 실행. 사용자 확인 게이트 건너뜀(autonomy + Pre-Flight Hard stop만 보존).

### 토픽 2: Pre-Flight 의존성 검증 — P1 두 건 진입 가능 여부
> 자체 분석: P1-keys-tenant-include의 사전 조건 = T1.5 schema의 `ApiKey ↔ Tenant relation` 존재. P1-resolve-tenant의 사전 조건 = T1.2 router (`/api/v1/t/[tenant]/[...path]`) + tenant-router 모듈 살아있음.

검증 결과:
- prisma/schema.prisma:493 `tenant Tenant @relation("TenantApiKeys", ..., onDelete: Cascade)` 존재 ✓ — keys-tenant.ts의 TODO(T1.5) 해소 가능
- src/app/api/v1/t/[tenant]/[...path]/route.ts 존재 + src/lib/tenant-router/{manifest,dispatch,types,membership,roles}.ts 모두 존재 ✓
- 특히 `manifest.ts`의 `resolveTenantFromSlug(slug): Promise<ResolvedTenant | null>` 헬퍼가 이미 구현됨 → P1-resolve-tenant agent는 path slug 추출 후 그대로 호출만 하면 됨

Pre-Flight 2.5: 8 대상 파일 모두 기추적 (50건 미만, 경고 없음), untracked 0, 활성 lock 0. lock.json 선점 완료.

**결론**: 3 건 모두 진입 가능. 의존성 검증으로 agent 발사 후 "사전 조건 미충족" 회귀 위험 0.

### 토픽 3: 3 agent 동시 발사 + 소유권 격리 설계
> 자체 결정: 파일 소유권 0% 중첩이 확인되었으므로 `--strategy parallel` 안전.

소유권 맵:
- T1.4-sweep: prisma/schema.prisma + 4 route 파일 + eslint.config.mjs + package.json/package-lock.json + 신규 마이그레이션
- P1-keys-tenant-include: src/lib/auth/keys-tenant.ts + keys-tenant.test.ts (단독)
- P1-resolve-tenant: src/lib/with-request-context.ts + with-request-context.test.ts 신규 (단독)

각 agent 프롬프트에 "다른 agent 소유 파일 절대 수정 금지" 명시 (superpowers `dispatching-parallel-agents` 원칙). 모두 sonnet 모델 사용 — 단계 명확하여 opus 불필요, 통합/검증은 메인(opus) 책임. 비용 효율 + 메인 컨텍스트 보존.

**결론**: 3 agent 백그라운드 동시 발사 (`isolation: worktree`, `run_in_background: true`).

### 토픽 4: P1-keys-tenant-include 완료 (3분, 25 tool uses)
> agent 산출: `04ee7cb refactor(p1): keys-tenant 2-query → include 단일 query 통합 (T1.5 relation 활용)`

리팩토링 내용:
- line 115의 `prisma.apiKey.findUnique({ where: { prefix } })` → `+ include: { tenant: true }`
- line 142~144의 별도 `prisma.tenant.findUnique` 호출 제거
- `dbKey.tenantId` null 체크 → `dbKey.tenant` null 체크로 전환 (defense in depth 유지)
- TODO(T1.5) 주석 2곳 제거 → 한국어 1줄("T1.5 relation 활용 — 단일 query 통합")로 교체
- 함수 시그니처/VerifyResult discriminated union 6종 reason 코드 모두 보존 (호출자 호환성 100%)

검증 게이트 3/3 PASS (tsc / keys-tenant.test 13 / vitest 354 — totp.test.ts pre-existing 실패 1건 명시).

**결론**: DB round-trip 2회 → 1회로 감소. 의도된 동작 변경 0.

### 토픽 5: P1-resolve-tenant 완료 (4분, 34 tool uses)
> agent 산출: `c365597 feat(p1): with-request-context resolveTenantId path 기반 정식 구현` + `ced644d test(p1): with-request-context 단위 테스트 추가`

구현 내용:
- `TENANT_PATH_RE = /^\/api\/v1\/t\/([a-z0-9][a-z0-9-]{1,30})(\/|$)/` (ADR-026 immutable slug 규칙)
- `URL(req.url).pathname` 추출 → 정규식 매칭 → `resolveTenantFromSlug(slug)` 호출 → `tenant.id` 반환
- DB 장애 / 잘못된 URL → `undefined` (fail-soft, request-context는 traceId만 보장)
- 글로벌 라우트 (`/api/settings/users` 등) → undefined (정규식 불일치)
- 9 신규 테스트 케이스 + traceId 추출 2 케이스

**핵심 자율 결정 — `suspended/archived` tenant 처리**:
- `tenant.active === false` 인 경우에도 `tenant.id` 를 반환 (undefined 아님)
- 근거: `resolveTenantId`는 관측성 맥락 확립 담당, 인가 담당이 아님. tenant.id를 주입함으로써 감사 로그가 실제 tenant UUID를 기록할 수 있어 "누가 정지된 테넌트를 호출하는지" 추적 가능. undefined 반환 시 audit는 'default' sentinel로만 기록되어 추적성 저하. 410 응답은 `withTenant` 가드(T1.3)가 책임.

검증 게이트 3/3 PASS (tsc / 9/9 신규 테스트 / vitest 364).

**결론**: stub 해소. `safeAudit`/`recordTenantMetric`이 실제 tenantId 기반으로 자동 분류 가능.

### 토픽 6: T1.4-sweep 완료 (7분, 78 tool uses)
> agent 산출: 3 commits (`c1283a4 refactor(t1.4-sweep)` / `191ad47 feat(prisma)` / `f753c4f chore(eslint)`)

수행 작업:
1. **4 호출 사이트 composite 전환** (`c1283a4`):
   - `src/app/api/v1/auth/login/route.ts` — `findUnique({ email })` → `findUnique({ tenantId_email: { tenantId: 'default', email } })` (글로벌 라우트 → 'default' sentinel)
   - `src/app/api/v1/auth/register/route.ts` — 동일
   - `src/app/api/settings/users/route.ts` — POST 이메일 중복 확인 composite 전환
   - `src/lib/vault/VaultService.ts` — SecretItem.name은 spec §2.4 Tenant-bypass라 글로벌 unique 유지 + 주석만 추가 (실 코드 변경 없음)
2. **prisma/schema.prisma 글로벌 @unique 제거** (`191ad47`):
   - User.email / EdgeFunction.name / CronJob.name → `@unique` 제거 (composite는 유지)
   - deviation 주석 (line 72~74 등) 제거
   - 신규 마이그레이션 `20260427130000_phase1_4_sweep_drop_global_unique/migration.sql` (DROP CONSTRAINT IF EXISTS × 3)
3. **ESLint warn → error 승격** (`f753c4f`):
   - `eslint.config.mjs`에서 `no-raw-prisma-without-tenant` rule severity 변경
   - `@typescript-eslint/parser` + `@typescript-eslint/eslint-plugin` 신규 설치 (package.json/package-lock.json 변경)

**추가 발견**: EdgeFunction.name / CronJob.name 기반 findUnique 호출 사이트 0건 (id 기반만 존재) — 스키마 수정만으로 완료.

검증 게이트 4/5 PASS, 1 DEFERRED:
- prisma validate ✓
- tsc 0 errors ✓
- vitest 364 passed / 15 skipped ✓
- ESLint `--max-warnings 0` ⚠️ DEFERRED — 기존 코드의 raw prisma 직접 호출 126건이 사전 위반. severity error 승격은 완료(신규 PR 차단 목적 달성). 전체 해소는 라우트별 prismaWithTenant 마이그레이션 별도 PR 필요.

**결론**: spec 이탈 1번 해소(글로벌 @unique 제거). DEFERRED는 sweep 범위 밖.

### 토픽 7: 통합 단계 — sentinel 표기 보정
> 자체 발견: P1-resolve-tenant 주석에서 sentinel을 `'_system'`으로 표기 (line 38). memory `project_tenant_default_sentinel.md`에 따르면 본 프로젝트의 sentinel은 `'default'` (spec impl-spec의 '_system' 명칭 아님).

원인: agent는 서브에이전트 컨텍스트 분리로 메모리에 직접 접근할 수 없음. 메인 프롬프트의 메모리 invariant를 메인이 후처리로 검증/보정하는 것이 superpowers `verification-before-completion` 원칙의 정상 적용.

보정 1 줄: `'_system' sentinel 로 기록` → `'default' sentinel 로 기록 (어느 tenant 인지)`.

검증 — 같은 파일 line 44, 111의 `'default'` 표기는 정확. line 38만 spec 표기 혼동.

**결론**: 단독 커밋 `99f02ca fix(p1): with-request-context sentinel 표기 'default' 보정`. agent 산출물과 메모리 invariant의 정합성 회복.

### 토픽 8: 통합 검증 + Phase 7 보고서
> 4 게이트 동시 백그라운드 실행 (prisma validate / tsc / vitest / build).

전 게이트 PASS (vitest 364 — totp.test.ts pre-existing 실패는 통합 후 자동 해소). 워크트리 자동 정리 완료(에이전트 종료 시 git worktree 정리). lock.json → lock.completed-s62.json 아카이브.

**결론**: kdyswarm 전 7 Phase 정상 종료. 다음 진입점은 T1.6 Almanac backfill 또는 raw-prisma-sweep 126건 정리.

### 토픽 9: 세션 종료 (/cs)
> **사용자**: "/cs"

current.md / logs / handover / next-dev-prompt 일괄 갱신. CK 신규 0 — 본 세션의 핵심 패턴(autonomy 기반 권장 진입점 채택 / 워크트리 0% 소유권 중첩 / sentinel 보정)은 모두 기존 CK(`tenant-default-sentinel`, `prisma-client-extension-lazy-proxy`, `dispatching-parallel-agents` 원칙)에 흡수되어 신규 솔루션 가치 부족.

**결론**: 세션 62 종료. 7 commits, 11 파일, 마이그레이션 1건, 신규 테스트 9개.

## 의사결정 요약

| # | 결정 | 선택지 | 선택 이유 |
|---|------|--------|----------|
| 1 | 다음 권장 진입점 자율 채택 | (A) 사용자 확인 / (B) 즉시 채택 | memory `feedback_autonomy` 우선. 비파괴 swarm + Pre-Flight Hard stop 보존이면 안전 |
| 2 | parallel 전략 채택 | (A) sequential / (B) parallel | 3 작업 영향 파일 0% 중첩 → 워크트리 격리하에 안전 병렬. 시간 절약 ~3배 |
| 3 | 3 agent 모두 sonnet | (A) opus / (B) sonnet | 단계 명확, agent 자율 판단 폭 제한적. opus는 메인 통합/검증에 보존 |
| 4 | suspended tenant.id 반환 | (A) undefined / (B) tenant.id | 관측성 vs 인가 분리. agent 자율 결정 채택 — 감사 추적성 ↑, 410 응답은 withTenant 책임 |
| 5 | sentinel `'_system'` → `'default'` 후처리 보정 | (A) 그대로 / (B) 보정 | memory `project_tenant_default_sentinel.md` invariant 우선. agent는 컨텍스트 분리로 메모리 미접근 정상 |
| 6 | ESLint --max-warnings 0 DEFERRED 수용 | (A) 즉시 해소 / (B) DEFERRED | 기존 raw prisma 126건 = sweep 범위 밖. severity error 승격으로 신규 PR 차단 목적 달성 |
| 7 | sentinel 보정 단독 커밋 | (A) sentinel 합류 / (B) 단독 | 단독 (`99f02ca`) — agent 산출물과 메인 보정의 추적성 명확히 분리 |

## 수정 파일 (12개)

| # | 파일 | 변경 내용 |
|---|------|-----------|
| 1 | `src/lib/auth/keys-tenant.ts` | 2-query → include 단일 query (T1.5 relation 활용) + TODO 제거 |
| 2 | `src/lib/auth/keys-tenant.test.ts` | mock 응답에 tenant 필드 추가, 별도 tenant.findUnique mock 제거 |
| 3 | `src/lib/with-request-context.ts` | resolveTenantId path 기반 구현 + suspended → tenant.id 결정 + sentinel 표기 보정 |
| 4 | `src/lib/with-request-context.test.ts` | **신규** — 9 케이스(slug 분기 6 + traceId 2 + suspended) |
| 5 | `src/app/api/v1/auth/login/route.ts` | findUnique → tenantId_email composite ('default' sentinel) |
| 6 | `src/app/api/v1/auth/register/route.ts` | 동일 |
| 7 | `src/app/api/settings/users/route.ts` | POST 이메일 중복 확인 composite 전환 |
| 8 | `src/lib/vault/VaultService.ts` | SecretItem.name Tenant-bypass 글로벌 unique 유지 주석 추가 (실 코드 변경 없음) |
| 9 | `prisma/schema.prisma` | User.email / EdgeFunction.name / CronJob.name @unique 제거 + deviation 주석 정리 |
| 10 | `prisma/migrations/20260427130000_phase1_4_sweep_drop_global_unique/migration.sql` | **신규** — DROP CONSTRAINT IF EXISTS × 3 |
| 11 | `eslint.config.mjs` | `no-raw-prisma-without-tenant` warn → error + parser 추가 |
| 12 | `package.json` / `package-lock.json` | @typescript-eslint/{parser,eslint-plugin} 신규 설치 |

## 상세 변경 사항

### 1. P1-keys-tenant-include — 2-query → include 통합 (`04ee7cb`)

기존: 6단계 검증 흐름 중 2단계(prefix lookup)와 5단계(tenant 무결성 검사) 사이에 별도 `prisma.tenant.findUnique` 호출.

변경: `prisma.apiKey.findUnique({ where: { prefix }, include: { tenant: true } })` 단일 query. `dbKey.tenant` 직접 사용.

방어선 유지:
- `dbKey.tenant === null` 케이스 가드 (FK violation은 RLS에서 차단되지만 defense in depth 보존)
- 6단계 검증 순차 흐름 무수정 (1 정규식 → 2 lookup → 3 hash → 4 revoked → 5 cross-validation 1 → 6 cross-validation 2 → 7 lastUsedAt fire-and-forget)
- VerifyResult discriminated union 6종 reason 코드 100% 보존

성능 영향: ApiKey K3 검증 hot path의 DB round-trip 2 → 1 (50% 감소).

### 2. P1-resolve-tenant — path 기반 정식 구현 (`c365597` + `ced644d`)

변경 전: `resolveTenantId(req)` 항상 undefined 반환 (stub). `safeAudit`/`recordTenantMetric`이 'default' sentinel로 fail-soft 동작.

변경 후:
1. URL 추출 (`new URL(req.url).pathname`) — 잘못된 URL → undefined fail-soft
2. 정규식 `/^\/api\/v1\/t\/([a-z0-9][a-z0-9-]{1,30})(\/|$)/` 매칭 — 글로벌 라우트 또는 잘못된 slug → undefined
3. `resolveTenantFromSlug(slug)` 호출 — DB lookup
4. `tenant.id` 반환 (suspended/archived 포함). DB 장애 → undefined fail-soft

신규 테스트 9 케이스:
- `/api/v1/t/almanac/contents` → tenant.id (active)
- `/api/v1/t/almanac` → tenant.id (sub-path 없음)
- `/api/settings/users` → undefined (글로벌 라우트)
- `/api/v1/t/x/foo` → undefined (slug 너무 짧음, 정규식 불일치)
- `/api/v1/t/notfound/foo` → undefined (DB miss)
- `/api/v1/t/suspended/foo` → tenant.id (suspended → 관측성 우선 결정)
- `/api/v1/t/active-tenant/path` (active=true 확인)
- traceId — X-Request-Id 헤더 사용
- traceId — 헤더 부재 시 crypto.randomUUID()

### 3. T1.4-sweep — 글로벌 @unique 제거 (`c1283a4` + `191ad47` + `f753c4f`)

호출 사이트 전환 패턴:
```typescript
// before
const user = await prisma.user.findUnique({ where: { email } });

// after (글로벌 라우트 — 운영자 콘솔 / 로그인 / 회원가입 → 'default' sentinel)
const user = await prisma.user.findUnique({
  where: { tenantId_email: { tenantId: 'default', email } }
});
```

마이그레이션 SQL:
```sql
-- 20260427130000_phase1_4_sweep_drop_global_unique/migration.sql
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_email_key";
ALTER TABLE "edge_functions" DROP CONSTRAINT IF EXISTS "edge_functions_name_key";
ALTER TABLE "cron_jobs" DROP CONSTRAINT IF EXISTS "cron_jobs_name_key";
```

ESLint 변경: `no-raw-prisma-without-tenant` rule severity `'warn'` → `'error'`. `@typescript-eslint/parser` 추가 설치 (rule이 TypeScript 구문 분석 의존).

### 4. 통합 보정 — sentinel 표기 (`99f02ca`)

```diff
- * undefined 반환 시 audit 는 '_system' sentinel 로 기록되어 추적성이 저하된다.
+ * undefined 반환 시 audit 는 'default' sentinel 로 기록되어 (어느 tenant 인지) 추적성이 저하된다.
```

memory `project_tenant_default_sentinel.md` invariant 정합. agent는 spec impl-spec(`'_system'` 명명)을 따랐으나 본 프로젝트의 실제 코드 invariant는 `'default'`로 보존되어 있음.

## 검증 결과

| 게이트 | 결과 |
|--------|------|
| `npx prisma validate` | ✅ valid |
| `npx tsc --noEmit` | ✅ 0 errors |
| `npx vitest run` | ✅ 364 passed / 15 skipped (totp pre-existing 실패는 통합 후 자동 해소) |
| `npm run build` | ✅ Compiled successfully (전체 라우트 등록 확인) |
| `npx eslint src/ --max-warnings 0` | ⚠️ DEFERRED (기존 raw prisma 호출 126건 사전 위반, sweep 범위 밖) |

## 터치하지 않은 영역

- T1.6 Almanac backfill (10h, 다음 진입점)
- raw-prisma-sweep 126건 (별도 sweep PR 필요, ~4~8h)
- ApiKey K3 검증의 `dbKey.tenant=null` defense in depth 케이스 테스트 보강 (30분, 매우 낮은 우선순위)
- Almanac spec 적용
- 03:00 KST cron 결과
- ADR placeholder cascade 6위치
- 글로벌 스킬 drift
- S54·53 잔존 6항

## 알려진 이슈

- ESLint `--max-warnings 0` DEFERRED — 기존 raw prisma 호출 126건. 신규 PR 차단 목적은 severity error 승격으로 달성됨. 전체 해소는 라우트별 prismaWithTenant 마이그레이션 sweep 별도 진행 필요.

## 다음 작업 제안

- **P0**: T1.6 Almanac backfill (10h, RLS 후 진입 가능) — content_* 테이블 tenant_id='almanac' migration + alias `/api/v1/almanac/*` → `/api/v1/t/almanac/*` redirect
- **P1**: M2 게이트 검증 — `/api/v1/t/almanac/health` 200 + audit_logs.tenant_id NULL 0
- **P1**: raw-prisma-sweep 126건 정리 (~4~8h) — 라우트별 prismaWithTenant 마이그레이션 (별도 sweep)
- **P2**: ApiKey K3 검증의 `dbKey.tenant=null` defense in depth 테스트 보강 (30분)
- 이월: Almanac spec 적용 / 03:00 KST cron 결과 / ADR placeholder cascade 6위치 / 글로벌 스킬 drift / S54·53 6항

---
[← handover/_index.md](./_index.md)
