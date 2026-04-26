# 다음 세션 프롬프트 (세션 62)

> 이 파일을 복사하여 새 세션 시작 시 Claude에게 전달합니다.
> 세션 종료 시 반드시 갱신합니다.

---

## 프로젝트 컨텍스트 — 멀티테넌트 BaaS (세션 61 완료: T1.4 RLS Stage 3 + P0-membership)

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

## ⭐ 세션 62 우선 작업 P0: 통합 부채 잔여 2건 (~1.5h)

### 1. keys-tenant.ts 2-query → include 단일 query (30분)

T1.5가 ApiKey ↔ Tenant relation 추가 완료(prisma/schema.prisma `apiKeys @relation("TenantApiKeys")`). T1.3의 2-query 분리를 단일 query로 통합:

```typescript
// src/lib/auth/keys-tenant.ts §5 검증 단계
const dbKey = await prisma.apiKey.findUnique({
  where: { prefix: dbPrefix },
  include: { tenant: true },
});
if (!dbKey) return { ok: false, reason: "NOT_FOUND" };
// cross-validation 1: dbKey.tenant?.slug === prefixSlug
// cross-validation 2: dbKey.tenant?.slug === pathTenant.slug
```

테스트(keys-tenant.test.ts) 13건 모두 PASS 유지 — 2-query 분리에서 단일 query로의 리팩터는 mock 시그니처 변경 필요.

### 2. with-request-context.ts.resolveTenantId() wiring (1h)

T1.7의 `src/lib/with-request-context.ts` 가 traceId 자동 주입 완료. tenantId는 stub(default 반환). T1.2 router (`/api/v1/t/[tenant]/[...path]/route.ts`) 가 추출한 slug → tenant.id 변환 후 RequestContext 에 주입:

```typescript
// src/lib/with-request-context.ts
async function resolveTenantId(request: NextRequest): Promise<string | null> {
  const match = request.nextUrl.pathname.match(/^\/api\/v1\/t\/([^/]+)/);
  if (!match) return null;
  const slug = match[1];
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
  return tenant?.id ?? null;
}
```

이후 audit-metrics byTenant 차원이 default 가 아닌 실제 tenantId로 분류됨.

---

## ⭐ 세션 62 우선 작업 P0 (다음): T1.6 Almanac backfill (10h)

T1.4 (RLS) + P0-membership 완료 후 Almanac을 'almanac' tenant로 backfill:

1. content_* 테이블 (content_items, content_categories, content_tags, content_revisions, content_ingested_items) 에 tenant_id 추가 (nullable → backfill → NOT NULL — Stage 3 동일 패턴).
2. 'almanac' tenant row 생성 (`INSERT INTO tenants (id, slug, display_name) VALUES (gen_random_uuid(), 'almanac', 'Almanac')`).
3. 모든 기존 content_* row를 almanac tenant 로 backfill.
4. 라우터 alias: `/api/v1/almanac/*` → `/api/v1/t/almanac/*` 임시 redirect (Phase 2 plugin 마이그레이션 전 호환).
5. M2 게이트 검증: `/api/v1/t/almanac/health` 200 + audit_logs.tenant_id NULL 0.

---

## P1: 운영자 배포 작업 (T1.4 + P0-membership)

본 세션 commits 운영 반영 시:

1. **마이그레이션 적용** (2건):
   ```bash
   npx prisma migrate deploy
   # 20260427110000_phase1_4_rls_stage3
   # 20260427120000_p0_tenant_membership
   ```

2. **Role 패스워드 placeholder 교체**:
   - `migration.sql` 의 `'CHANGE_ME_APP_MIGRATION_PASSWORD'` / `'CHANGE_ME_APP_RUNTIME_PASSWORD'` → Vault 시크릿
   - 파일을 직접 수정하여 마이그레이션 적용 또는 별도 secret-update 단계

3. **DATABASE_URL 전환**:
   - 일반 핸들러는 `app_runtime` role 사용 (BYPASSRLS 없음 → RLS 적용)
   - 마이그레이션 runner 만 `app_migration` role (BYPASSRLS)

4. **검증**:
   ```sql
   -- RLS 활성화 확인 (15 row)
   SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
     WHERE relname IN ('users','sessions','folders','files','api_keys',
                       'sql_queries','edge_functions','edge_function_runs',
                       'cron_jobs','webhooks','mfa_enrollments','mfa_recovery_codes',
                       'webauthn_authenticators','rate_limit_buckets','log_drains');

   -- 정책 존재 확인 (15 row)
   SELECT schemaname, tablename, policyname FROM pg_policies WHERE policyname = 'tenant_isolation';

   -- TenantMembership OWNER 시드 확인
   SELECT count(*) FROM tenant_memberships WHERE tenant_id = '00000000-0000-0000-0000-000000000000';
   -- → 활성 사용자 수와 동일

   -- 관리자 본인 OWNER 확인
   SELECT u.email, m.role FROM users u
     JOIN tenant_memberships m ON m.user_id = u.id
     WHERE u.email = 'kimdooo@stylelucky4u.com';
   ```

---

## P2 (이월): Phase 2 Plugin 시스템 (T2.1~2.6, ~100h)

M3 게이트 = 2번째 컨슈머가 코드 0줄 추가로 가동되는 것 = closed multi-tenant BaaS 정체성 입증.

`docs/research/baas-foundation/04-architecture-wave/02-sprint-plan/01-task-dag.md` 참조.

---

## 이월 (S60+ 누적)

- ~~TenantMembership 모델 + migration + wiring~~ ✅ (S61 완료)
- ~~T1.4 RLS 정책~~ ✅ (S61 완료)
- keys-tenant.ts 2-query → include 단일 query (S62 P0)
- with-request-context resolveTenantId wiring (S62 P0)
- T1.6 Almanac backfill (10h)
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

## 필수 참조 파일 ⭐ 세션 61 종료 시점

```
CLAUDE.md (프로젝트 루트) ⭐⭐⭐
docs/status/current.md (세션 61 행 추가)
docs/handover/260426-session61-t1.4-rls-p0-membership.md ⭐⭐⭐ 직전 세션 인수인계
docs/handover/260426-session60-g1b-parallel-merge.md ⭐⭐ S60 4 agent 병렬 + 통합 부채

# T1.4 / P0-membership 산출물
prisma/schema.prisma (17 모델 Stage 3 + TenantMembership)
prisma/migrations/20260427110000_phase1_4_rls_stage3/migration.sql ⭐⭐⭐
prisma/migrations/20260427120000_p0_tenant_membership/migration.sql ⭐⭐⭐
src/lib/db/prisma-tenant-client.ts (Prisma Extension lazy Proxy)
src/lib/tenant-router/membership.ts (P0 wiring 완료)
eslint-rules/no-raw-prisma-without-tenant.cjs (severity warn 롤아웃)
tests/rls/cross-tenant-leak.test.ts (env-gated)

# CK +2 (44→46)
docs/solutions/2026-04-26-prisma-client-empty-pnpm-workspace.md
docs/solutions/2026-04-26-prisma-client-extension-lazy-proxy-test.md

# 결정 근거 (필요 시)
docs/research/baas-foundation/04-architecture-wave/01-architecture/02-adr-023-impl-spec.md (RLS 1005줄)
docs/research/baas-foundation/01-adrs/ (8 ADR ACCEPTED)
```

---

## 직전 세션들 요약

- **세션 61** (2026-04-26): T1.4 RLS Stage 3 + P0-membership 통합 — kdyswarm sequential, 8 commits, 5/5 게이트 PASS, CK +2 (현재)
- **세션 60** (2026-04-26): G1b 4 agent 병렬 발사 + 통합 — Phase 1 본진(T1.2/T1.3/T1.5/T1.7) 일괄 완료
- **세션 59** (2026-04-26): Phase 0 Foundation 7 task + M1 게이트 통과 + T1.1 TenantContext
- **세션 58** (2026-04-26): BaaS Foundation 설계 — ADR-022~029 ACCEPTED + spike 2건
- **세션 57** (2026-04-26): Almanac aggregator spec v1.0 → v1.1 정합화

---

## 세션 62 시작 시 추천 첫 액션

1. **본 next-dev-prompt + handover/260426-session61* 읽기** (세션 61 결정 흡수)
2. **통합 부채 잔여 2건 즉시 처리** (~1.5h, 단일 세션 내):
   - keys-tenant.ts 단일 query 통합 (30분)
   - with-request-context.ts.resolveTenantId() wiring (1h)
3. **T1.6 Almanac backfill 진입** (10h) — 별도 세션 권장
4. 또는 사용자 우선순위 따라 운영자 배포 작업 (P1) 먼저 수행
