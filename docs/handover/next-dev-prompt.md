# 다음 세션 프롬프트 (세션 61)

> 이 파일을 복사하여 새 세션 시작 시 Claude에게 전달합니다.
> 세션 종료 시 반드시 갱신합니다.

---

## 프로젝트 컨텍스트 — 멀티테넌트 BaaS (세션 60: G1b 4 agent 병렬 발사 완료)

- **프로젝트명**: 양평 부엌 서버 — **1인 운영자의 멀티테넌트 백엔드 플랫폼** (stylelucky4u.com)
- **정체성**: closed multi-tenant BaaS (본인 소유 10~20개 프로젝트 공유 백엔드, 외부 가입 없음)
- **스택**: Next.js 16 + TypeScript + Tailwind CSS 4 + PostgreSQL (Prisma 7) + SQLite (Drizzle)
- **첫 컨슈머**: Almanac (almanac-flame.vercel.app) — spec/aggregator-fixes 브랜치 진행 중

## 서버 실행 / 접속 정보

```bash
npm run dev
# WSL2 배포 — /ypserver prod (세션 24e에서 5 갭 보강 완료):
#   /ypserver prod                      # Phase 1~5 자동 (Windows 빌드 → 복사 → migrate → PM2)
#   /ypserver prod --skip-win-build     # Windows 빌드 항상 실패 환경에서 사용
```

| 서비스 | URL |
|--------|-----|
| 로컬 | http://localhost:3000 |
| 외부 | https://stylelucky4u.com |
| 로그인 | kimdooo@stylelucky4u.com / <ADMIN_PASSWORD> |

---

## ⭐ 세션 61 우선 작업 — Phase 1 통합 부채 정리 (~5h) → T1.4 진입 가능

### P0 — 통합 부채 3건 (~5h)

**1. TenantMembership 모델 추가 + wiring (3-4h)**

`src/lib/tenant-router/membership.ts`이 현재 fail-closed (항상 null) → cookie 인증 경로 항상 403. 운영자 본인이 cookie로 컨슈머 라우트 접근 시 차단됨. 다음 단계로 즉시 보강:

```prisma
// prisma/schema.prisma 추가
model TenantMembership {
  id        String     @id @default(uuid())
  tenantId  String     @map("tenant_id") @db.Uuid
  userId    String     @map("user_id")
  role      TenantRole @default(MEMBER)
  createdAt DateTime   @default(now()) @map("created_at") @db.Timestamptz(3)

  tenant    Tenant     @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  user      User       @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([tenantId, userId])
  @@index([userId])
  @@map("tenant_memberships")
}

enum TenantRole {
  OWNER
  ADMIN
  MEMBER
  VIEWER

  @@map("tenant_role")
}
```

```typescript
// src/lib/tenant-router/membership.ts 본문 교체
import { prisma } from "@/lib/prisma";
import type { TenantRole } from "./roles";

export async function findTenantMembership(
  input: FindMembershipInput,
): Promise<TenantMembershipRow | null> {
  return prisma.tenantMembership.findUnique({
    where: { tenantId_userId: { tenantId: input.tenantId, userId: input.userId } },
    select: { role: true },
  });
}
```

**주의**: T1.2의 `src/lib/tenant-router/roles.ts`는 TS union으로 정의됨 — prisma enum과 정합 필요. 생성된 Prisma `$Enums.TenantRole`을 `roles.ts`에서 export 또는 동기화.

migration: `prisma/migrations/20260427T_add_tenant_membership/migration.sql` (additive). 운영자 본인 회원 row 1건 INSERT (default tenant 가입).

**2. keys-tenant.ts 단일 query 통합 (30분)**

T1.5가 ApiKey ↔ Tenant relation 추가 완료. T1.3의 2-query 우회를 단일 query로 합치기:

```typescript
// src/lib/auth/keys-tenant.ts §5 단계 통합
const dbKey = await prisma.apiKey.findUnique({
  where: { prefix: dbPrefix },
  include: { tenant: true },
});
if (!dbKey) return { ok: false, reason: "NOT_FOUND" };
// ... bcrypt + revoked + cross-validation 1: dbKey.tenant?.slug === prefixSlug
// ... cross-validation 2: dbKey.tenant?.slug === pathTenant.slug
```

기존 두 번째 query (`prisma.tenant.findUnique`)와 관련 분기 + `// NOTE(T1.5)` 주석 제거. 13개 vitest 모두 그대로 PASS 예상.

**3. with-request-context.ts.resolveTenantId() wiring (1h)**

stub → T1.2 path 추출 + Tenant 조회로 교체:

```typescript
// src/lib/with-request-context.ts
import { resolveTenantFromSlug } from "@/lib/tenant-router/manifest";

async function resolveTenantId(req: Request): Promise<string | undefined> {
  const url = new URL(req.url);
  const m = url.pathname.match(/^\/api\/v1\/t\/([^/]+)/);
  if (!m) return undefined;
  const tenant = await resolveTenantFromSlug(m[1].toLowerCase());
  return tenant?.id;
}
```

→ observability traceId + tenantId 양쪽 모두 자동 주입. ADR-029 §2.3.2 완성.

### P1 — Phase 1 마무리 (~28h)

**4. T1.4 RLS 정책 단일 'default' tenant (18h)** — ADR-023 옵션 B + e2e 5건

위 P0 3건 완료 후 진입 가능. 18 비즈니스 모델에 RLS 정책 SQL + Prisma client extension(`withRls()` 미들웨어 — `getCurrentTenant().tenantId`로 SET LOCAL) + e2e 5건 (cross-tenant SELECT 차단, INSERT auto-fill, UPDATE tenantId 변경 차단, DELETE 다른 tenant 0 영향, JOIN 격리). 잘못 적용 시 데이터 유출 위험 → 사용자 확인 필수.

**5. T1.6 Almanac backfill (10h)** — T1.4 후

content_* 테이블 tenant_id='almanac' migration + alias `/api/v1/almanac/*` → `/api/v1/t/almanac/*` (6개월 grace).

### P2 — M2 게이트 → Phase 2 진입

**M2 게이트 검증** (Phase 1 완료 신호):
```bash
curl -sf http://localhost:3000/api/v1/t/almanac/health  # → 200
sqlite3 data/audit.db "SELECT COUNT(*) FROM audit_logs WHERE tenant_id IS NULL"  # → 0
pm2 logs ypserver | grep "worker.dispatch"  # → tenantId 라벨 포함
pnpm test tests/e2e/rls/  # → 5/5 PASS
```

**Phase 2 진입** — T2.1 TenantManifestSchema (14h, ADR-026)

---

## 이월 사항

### 4 worktree 정리 (선택)
세션 60 cs 시점에 4 agent worktree(`worktree-agent-{a7efb1f9486158c38, aaa5a0e0691548048, aaf0f7f3c88814b34, aedadd4b9cd736e4e}`)가 lock 상태로 잔존. 시스템 자동 정리 또는 수동:
```bash
git worktree list  # 확인
git worktree remove --force .claude/worktrees/agent-<id>  # 4건
git branch -D worktree-agent-<id>  # 4건
```

### S57 이월: Almanac spec 적용
spec/aggregator-fixes 브랜치 v1.1 정합화 완료(81→0 에러). 사용자 결정 시 spec 적용:
1. `npm install rss-parser cheerio @google/genai`
2. `npx shadcn@latest add tabs table badge input select textarea checkbox switch label`
3. CronKind enum에 AGGREGATOR 추가 (수동) + schema-additions.prisma append
4. src/lib/aggregator/ + src/app/api/v1/almanac/ + src/app/admin/aggregator/ + api-guard-publishable.ts cp
5. cron/runner.ts + data-api/allowlist.ts + types/supabase-clone.ts 머지
6. `npx prisma generate` + `npx tsc --noEmit` (0 에러 기대)
7. (사용자 승인 후) prisma migrate dev / pm2 reload

**ADR-022~029 결정 적용 후 처리**: Almanac은 spec v1.0 그대로 출시, 출시 후 `packages/tenant-almanac/`로 마이그레이션.

### S56 이월: 03:00 KST cleanup cron 결과 확인
```bash
wsl -- bash -lic 'pm2 logs ypserver --lines 80 --nostream | grep -A2 "audit log write failed"'
# → 5일 연속 발생하던 audit log write failed 가 사라져야 함
curl -H 'Authorization: Bearer <ADMIN>' http://localhost:3000/api/admin/audit/health
# → §보완 1 카운터 (ok: true / failed: 0)
```

### S56 이월: ADR-021 placeholder 충돌 6 위치 cascade 정정

세션 56 §보완 2 §D 표 참조:
- 02-architecture/01-adr-log.md §1029 (Realtime 백프레셔)
- 02-architecture/16-ux-quality-blueprint.md §1570 (AI 챗 영구 저장)
- 05-roadmap/03-risk-register.md §649·651 (Next.js 17 업그레이드)
- 07-appendix/01-kdygenesis-handoff.md §4 (PM2 cluster vs cron-worker)
- 07-appendix/02-final-summary.md §4 (동일)
- 07-appendix/02-dq-final-resolution.md §591-592 (Next.js 17 + 마이그레이션 롤백 5초)

### S55·54·53 잔존 6항
- 다른 글로벌 스킬 drift 점검 (`kdyship`/`kdydeploy`/`kdycicd`)
- `_test_session` drop / DATABASE_URL rotation / MFA biometric / SP-013·016 / Windows 재부팅 실증

---

## 필수 참조 파일 ⭐ 세션 60 종료 시점

```
CLAUDE.md (4개 섹션 갱신: 프로젝트 정보, 문서 체계, 7원칙, 운영 규칙) ⭐⭐⭐
docs/status/current.md (세션 60 행 추가)
docs/handover/260426-session60-g1b-parallel-merge.md ⭐⭐⭐ 직전 세션 인수인계
docs/handover/260426-session59-phase0-foundation.md (Phase 0 결정)
docs/handover/260426-session58-baas-foundation.md (정체성 재정의)

# Phase 1 마무리 진입 시 참조
docs/research/baas-foundation/04-architecture-wave/01-architecture/
  02-adr-023-impl-spec.md (RLS 구현, 1005줄) ⭐ T1.4 진입 시
  03-adr-024-impl-spec.md (모노레포 변환 5단계, 618줄)
  06-adr-027-impl-spec.md (router + K3, 745줄) ✅ T1.2/T1.3 적용 완료
  07-adr-028-impl-spec.md (cron worker pool, 1053줄) ✅ T1.5 적용 완료
  08-adr-029-impl-spec.md (observability M1+L1+T3, 733줄) ✅ T1.7 적용 완료
docs/research/baas-foundation/04-architecture-wave/02-sprint-plan/00-roadmap-overview.md
docs/research/baas-foundation/04-architecture-wave/02-sprint-plan/01-task-dag.md
docs/research/baas-foundation/04-architecture-wave/03-migration/00-migration-strategy.md

# 본 세션 산출물
prisma/schema.prisma (T1.5 적용 — TenantCronPolicy + relations + circuit breaker cols)
prisma/migrations/20260427100000_phase1_5_tenant_cron_isolation/migration.sql
src/lib/cron/{policy,lock,circuit-breaker,worker-pool,worker-script}.ts (T1.5)
packages/core/src/cron/{lock-key,circuit-breaker-state,index}.ts (T1.5 pure)
src/lib/auth/{keys-tenant,keys-tenant-issue}.ts (T1.3)
src/lib/api-guard-tenant.ts + src/app/api/v1/t/[tenant]/[...path]/route.ts (T1.2)
src/lib/tenant-router/{types,manifest,dispatch,membership,roles}.ts (T1.2)
src/lib/audit/safe.ts (T1.2 어댑터)
src/lib/{request-context,with-request-context,cardinality-guard}.ts (T1.7)
src/lib/db/migrations/{0002_tenant_metrics,0003_audit_trace}.sql (T1.7)
```

---

## 멀티테넌트 BaaS 핵심 7원칙 (ADR-022 ACCEPTED 2026-04-26)

이 7원칙은 **양보 불가**. 새 코드/PR이 위반하면 reject:

1. **Tenant는 1급 시민, prefix가 아니다.** 모든 신규 모델/route/cron/log에 `tenant_id` 첫 컬럼.
2. **플랫폼 코드와 컨슈머 코드 영구 분리.** yangpyeon 코드베이스 = 플랫폼만.
3. **한 컨슈머의 실패는 다른 컨슈머에 닿지 않는다.** worker pool 격리.
4. **컨슈머 추가는 코드 수정 0줄.** TS manifest + DB row만으로.
5. **셀프 격리 + 자동 복구 + 관측성 = 3종 세트 동시.**
6. **불변 코어, 가변 plugin.** 코어는 6개월에 한 번.
7. **모든 결정은 "1인 운영 가능한 N의 상한"으로 검증.** N=20에서 1인 운영 가능성이 머지 게이트.

---

## 직전 세션들 요약

- **세션 60** (2026-04-26): G1b 4 agent 병렬 발사 + DAG 통합 — T1.2/T1.3/T1.5/T1.7 일괄 완료, 285→355 tests (+24%) (현재)
- **세션 59** (2026-04-26): Phase 0 Foundation 7 task 완료 + M1 게이트 통과 + Phase 1.1 TenantContext
- **세션 58** (2026-04-26): BaaS Foundation 설계 — ADR-022~029 ACCEPTED + spike 2건 + CLAUDE.md 정체성 재정의
- **세션 57** (2026-04-26): Almanac aggregator spec v1.0 → v1.1 정합화 (81→0 에러)
- **세션 56** (2026-04-25): cleanup cron audit silent failure 진단 + ADR-021
- **세션 55** (2026-04-25): ypserver 글로벌 스킬 v1→v2 전면 리팩터
- **세션 50** (2026-04-19): Next.js standalone 재도입 + ADR-020

---

## 세션 61 시작 시 추천 첫 액션

1. **CLAUDE.md, current.md, 본 next-dev-prompt 읽기** (변경 영역 파악)
2. **docs/handover/260426-session60-g1b-parallel-merge.md 읽기** (직전 세션 결정 흡수)
3. **`git worktree list`로 잔존 worktree 확인 후 정리** (4건, 선택)
4. **P0 통합 부채 3건 처리** (TenantMembership → keys-tenant 단일 query → resolveTenantId wiring) → 약 5h
5. **T1.4 RLS 정책 진입 검토** — ADR-023 impl-spec §2 + e2e 5건 (18h, 사용자 확인 필요)

---

## 본 세션 산출물 (세션 60)

**9 commits**:
```
6c9f631 chore(integrate): G1b 통합 — stub 제거 + import 교체 + standalone tsc exclude
46d43f9 merge(T1.2): withTenant 가드 + catch-all router 통합
416c10f merge(T1.3): ApiKey K3 매칭 통합
0487e45 merge(T1.7): audit-metrics byTenant + request-context + cardinality 통합
7cdd5c3 merge(T1.5): TenantWorkerPool + circuit breaker + TenantCronPolicy 통합
2bc35da feat(cron): T1.5 (Agent A3, 1351줄)
3714073 feat(observability): T1.7 (Agent A4)
cb7e298 feat(router): T1.2 (Agent A1, 895줄)
6645f28 feat(auth): T1.3 (Agent A2, 614줄)
```

**검증 게이트**: tsc 0 / packages/core tsc 0 / vitest **355/355** / npm run build PASS / prisma validate PASS / ADR-021 invariant 11 콜사이트 변경 0 검증.
