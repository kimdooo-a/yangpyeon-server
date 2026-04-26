# 다음 세션 프롬프트 (세션 63)

> 이 파일을 복사하여 새 세션 시작 시 Claude에게 전달합니다.
> 세션 종료 시 반드시 갱신합니다.

---

## 프로젝트 컨텍스트 — 멀티테넌트 BaaS (세션 62 완료: T1.4-sweep + P1 통합 부채 정리)

- **프로젝트명**: 양평 부엌 서버 — **1인 운영자의 멀티테넌트 백엔드 플랫폼** (stylelucky4u.com)
- **정체성**: closed multi-tenant BaaS (본인 소유 10~20개 프로젝트 공유 백엔드, 외부 가입 없음)
- **스택**: Next.js 16 + TypeScript + Tailwind CSS 4 + PostgreSQL (Prisma 7) + SQLite (Drizzle)
- **첫 컨슈머**: Almanac (almanac-flame.vercel.app) — spec/aggregator-fixes 브랜치 진행 중

## 서버 실행 / 접속 정보

```bash
npm run dev
# WSL2 배포 — /ypserver prod:
#   /ypserver prod                      # Phase 1~5 자동 (Windows 빌드 → 복사 → migrate → PM2)
#   /ypserver prod --skip-win-build     # Windows 빌드 항상 실패 환경에서 사용
```

| 서비스 | URL |
|--------|-----|
| 로컬 | http://localhost:3000 |
| 외부 | https://stylelucky4u.com |
| 로그인 | kimdooo@stylelucky4u.com / <ADMIN_PASSWORD> |

---

## ⭐ 세션 63 우선 작업 P0: T1.6 Almanac backfill (10h)

세션 62에서 통합 부채 잔여 2건 (keys-tenant.ts 2-query 통합, with-request-context.ts.resolveTenantId() wiring) 모두 완료. T1.4 글로벌 @unique sweep도 완료. 이제 Almanac을 'almanac' tenant로 backfill 진입 가능.

1. content_* 테이블 (content_items, content_categories, content_tags, content_revisions, content_ingested_items) 에 tenant_id 추가 (nullable → backfill → NOT NULL — Stage 3 동일 패턴).
2. 'almanac' tenant row 생성 (`INSERT INTO tenants (id, slug, display_name) VALUES (gen_random_uuid(), 'almanac', 'Almanac')`).
3. 모든 기존 content_* row를 almanac tenant 로 backfill.
4. 라우터 alias: `/api/v1/almanac/*` → `/api/v1/t/almanac/*` 임시 redirect (Phase 2 plugin 마이그레이션 전 호환).
5. M2 게이트 검증: `/api/v1/t/almanac/health` 200 + audit_logs.tenant_id NULL 0.

---

## P1: 운영자 배포 작업 (T1.4 + P0-membership + T1.4-sweep 누적)

본 세션 + 세션 61 commits 운영 반영 시:

1. **마이그레이션 적용** (3건 누적):
   ```bash
   npx prisma migrate deploy
   # 20260427110000_phase1_4_rls_stage3       (S61)
   # 20260427120000_p0_tenant_membership      (S61)
   # 20260427130000_phase1_4_sweep_drop_global_unique  (S62 신규)
   ```

2. **Role 패스워드 placeholder 교체** (S61):
   - `migration.sql` 의 `'CHANGE_ME_APP_MIGRATION_PASSWORD'` / `'CHANGE_ME_APP_RUNTIME_PASSWORD'` → Vault 시크릿

3. **DATABASE_URL 전환** (S61):
   - 일반 핸들러는 `app_runtime` role 사용 (BYPASSRLS 없음 → RLS 적용)
   - 마이그레이션 runner 만 `app_migration` role (BYPASSRLS)

4. **검증**:
   ```sql
   -- RLS 활성화 확인 (15 row, S61)
   SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
     WHERE relname IN ('users','sessions','folders','files','api_keys',
                       'sql_queries','edge_functions','edge_function_runs',
                       'cron_jobs','webhooks','mfa_enrollments','mfa_recovery_codes',
                       'webauthn_authenticators','rate_limit_buckets','log_drains');

   -- 정책 존재 확인 (15 row, S61)
   SELECT schemaname, tablename, policyname FROM pg_policies WHERE policyname = 'tenant_isolation';

   -- TenantMembership OWNER 시드 확인 (S61)
   SELECT count(*) FROM tenant_memberships WHERE tenant_id = '00000000-0000-0000-0000-000000000000';
   -- → 활성 사용자 수와 동일

   -- 글로벌 @unique 부재 + composite 존재 확인 (S62 sweep)
   \d users          -- email NOT @unique, (tenant_id, email) UNIQUE
   \d edge_functions -- name NOT @unique, (tenant_id, name) UNIQUE
   \d cron_jobs      -- name NOT @unique, (tenant_id, name) UNIQUE
   ```

5. **PM2 reload** (S62) — Prisma Client 재생성 필요 (composite unique 변경 반영).

---

## P2 (이월): Phase 2 Plugin 시스템 (T2.1~2.6, ~100h)

M3 게이트 = 2번째 컨슈머가 코드 0줄 추가로 가동되는 것 = closed multi-tenant BaaS 정체성 입증.

`docs/research/baas-foundation/04-architecture-wave/02-sprint-plan/01-task-dag.md` 참조.

---

## 이월 (S60+ 누적)

- ~~TenantMembership 모델 + migration + wiring~~ ✅ (S61 완료)
- ~~T1.4 RLS 정책~~ ✅ (S61 완료)
- ~~keys-tenant.ts 2-query → include 단일 query~~ ✅ (S62 완료, `04ee7cb`)
- ~~with-request-context resolveTenantId wiring~~ ✅ (S62 완료, `c365597 + ced644d`)
- ~~T1.4 sweep (글로벌 @unique 제거)~~ ✅ (S62 완료, `c1283a4 + 191ad47 + f753c4f`)
- T1.6 Almanac backfill (10h, P0)
- raw-prisma-sweep 126건 (4~8h, P1) — 라우트별 prismaWithTenant 마이그레이션
- ApiKey K3 dbKey.tenant=null defense in depth 테스트 보강 (30분, P2)
- Almanac spec 적용 (S57 이월) — v1.0 그대로 출시 → packages/tenant-almanac/ 마이그레이션 (~5~7일)
- 03:00 KST cron 결과 확인 (S56 이월)
- ADR-021 placeholder cascade 6위치 (S56 이월)
- 글로벌 스킬 drift (S55 이월)
- S54·53 잔존 6항 (`_test_session` drop / DATABASE_URL rotation / 브라우저 E2E CSRF / MFA biometric / SP-013·016 / Windows 재부팅 실증)

---

## 멀티테넌트 BaaS 핵심 7원칙 (ADR-022 ACCEPTED 2026-04-26)

1. **Tenant는 1급 시민, prefix가 아니다.** 모든 신규 모델/route/cron/log에 `tenant_id` 첫 컬럼.
2. **플랫폼 코드와 컨슈머 코드 영구 분리.** yangpyeon = 플랫폼만.
3. **한 컨슈머의 실패는 다른 컨슈머에 닿지 않는다.** worker pool 격리.
4. **컨슈머 추가는 코드 수정 0줄.** TS manifest + DB row만으로.
5. **셀프 격리 + 자동 복구 + 관측성 = 3종 세트 동시.**
6. **불변 코어, 가변 plugin.** 코어는 6개월에 한 번.
7. **모든 결정은 "1인 운영 가능한 N의 상한"으로 검증.** N=20에서 1인 운영 가능성이 머지 게이트.

---

## 필수 참조 파일 ⭐ 세션 62 종료 시점

```
CLAUDE.md (프로젝트 루트) ⭐⭐⭐
docs/status/current.md (세션 62 행 추가)
docs/handover/260426-session62-t14-sweep-p1-followups.md ⭐⭐⭐ 직전 세션 인수인계
docs/handover/260426-session61-t1.4-rls-p0-membership.md ⭐⭐ S61 T1.4 RLS + P0-membership

# T1.4 sweep + P1 산출물 (S62)
prisma/schema.prisma (User.email/EdgeFunction.name/CronJob.name @unique 제거 완료)
prisma/migrations/20260427130000_phase1_4_sweep_drop_global_unique/migration.sql ⭐⭐
src/lib/auth/keys-tenant.ts (include 단일 query)
src/lib/with-request-context.ts (resolveTenantId path 기반 정식 구현)
src/lib/with-request-context.test.ts (9 신규 테스트)
eslint.config.mjs (no-raw-prisma-without-tenant warn → error)

# T1.4 / P0-membership 산출물 (S61)
prisma/migrations/20260427110000_phase1_4_rls_stage3/migration.sql ⭐⭐⭐
prisma/migrations/20260427120000_p0_tenant_membership/migration.sql ⭐⭐⭐
src/lib/db/prisma-tenant-client.ts (Prisma Extension lazy Proxy)
src/lib/tenant-router/membership.ts (P0 wiring 완료)
eslint-rules/no-raw-prisma-without-tenant.cjs (severity error 승격, S62)
tests/rls/cross-tenant-leak.test.ts (env-gated)

# CK 46 (변경 없음 — S62 +0)
docs/solutions/2026-04-26-prisma-client-empty-pnpm-workspace.md (S61)
docs/solutions/2026-04-26-prisma-client-extension-lazy-proxy-test.md (S61)

# 결정 근거 (필요 시)
docs/research/baas-foundation/04-architecture-wave/01-architecture/02-adr-023-impl-spec.md (RLS 1005줄)
docs/research/baas-foundation/01-adrs/ (8 ADR ACCEPTED)
```

---

## 직전 세션들 요약

- **세션 62** (2026-04-26): T1.4-sweep + P1 통합 부채 정리 — kdyswarm parallel, 7 commits, 4/5 게이트 PASS (eslint --max-warnings 0 DEFERRED), CK +0 (현재)
- **세션 61** (2026-04-26): T1.4 RLS Stage 3 + P0-membership 통합 — kdyswarm sequential, 8 commits, 5/5 게이트 PASS, CK +2
- **세션 60** (2026-04-26): G1b 4 agent 병렬 발사 + 통합 — Phase 1 본진(T1.2/T1.3/T1.5/T1.7) 일괄 완료
- **세션 59** (2026-04-26): Phase 0 Foundation 7 task + M1 게이트 통과 + T1.1 TenantContext
- **세션 58** (2026-04-26): BaaS Foundation 설계 — ADR-022~029 ACCEPTED + spike 2건

---

## 세션 63 시작 시 추천 첫 액션

1. **본 next-dev-prompt + handover/260426-session62* 읽기** (세션 62 결정 흡수)
2. **T1.6 Almanac backfill 진입** (10h) — content_* 5 테이블 (content_items / content_categories / content_tags / content_revisions / content_ingested_items) 에 tenant_id 추가 → 'almanac' tenant row 생성 → 기존 row backfill → 라우터 alias `/api/v1/almanac/*` → `/api/v1/t/almanac/*` redirect → M2 게이트 검증
3. **또는 raw-prisma-sweep 126건** (4~8h, P1) — 라우트별 prismaWithTenant 마이그레이션 (병렬 가능 — `/kdyswarm --tasks raw-prisma-sweep --strategy parallel --agents 5`)
4. 또는 사용자 우선순위 따라 운영자 배포 작업 (P1, 마이그레이션 3건 누적) 먼저 수행
