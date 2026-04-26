# 다음 세션 프롬프트 (세션 66)

> 이 파일을 복사하여 새 세션 시작 시 Claude에게 전달합니다.
> 세션 종료 시 반드시 갱신합니다.

---

## 프로젝트 컨텍스트 — 멀티테넌트 BaaS (세션 65 완료)

- **프로젝트명**: 양평 부엌 서버 — **1인 운영자의 멀티테넌트 백엔드 플랫폼** (stylelucky4u.com)
- **정체성**: closed multi-tenant BaaS (본인 소유 10~20개 프로젝트 공유 백엔드, 외부 가입 없음)
- **스택**: Next.js 16 + TypeScript + Tailwind CSS 4 + PostgreSQL 16 (Prisma 7) + SQLite (Drizzle)
- **첫 컨슈머**: Almanac (almanac-flame.vercel.app) — spec/aggregator-fixes 브랜치 v1.0 출시 후 packages/tenant-almanac/ 마이그레이션 (T2.5)
- **세션 65 핵심**: T1.6 aggregator + raw-prisma sweep 130건 통합(`0d910e8`) → 운영 적용(7 + 1 마이그레이션) → PG 16 호환성 + DB drift fix(`f0d4443`) → filebox MIME + dbgenerated 결함 일괄 fix(`e61a496`/`3e6a366`/`f8ef8a7`) → standalone 정합성(`138edbe`) + leftover 134.6MB 정리

## 서버 실행 / 접속 정보

```bash
npm run dev
# WSL2 운영 배포 (ypserver 스킬 v2 — 세션 52~ 결정):
#   /ypserver                       # 전체 파이프라인 (rsync → npm ci → build → pack → deploy → PM2)
#   /ypserver --migrate             # 빌드 후 prisma migrate deploy 추가 실행
#   /ypserver --quick               # rsync/npm ci 스킵, 빠른 코드 패치 검증

# 마이그레이션만 즉시 적용 (Claude 직접 적용 정책 — CLAUDE.md "운영 환경 및 마이그레이션 정책"):
#   wsl -- bash -lic 'cd /mnt/e/00_develop/260406_luckystyle4u_server && \
#     DATABASE_URL="postgresql://postgres:Knp13579yan@localhost:5432/luckystyle4u?schema=public" \
#     npx prisma migrate deploy'
```

| 서비스 | URL |
|--------|-----|
| 로컬 | http://localhost:3000 |
| 외부 | https://stylelucky4u.com |
| 로그인 | kimdooo@stylelucky4u.com / Knp13579!yan |
| Almanac alias | https://stylelucky4u.com/api/v1/almanac/* (308 → /api/v1/t/almanac/*) |
| Almanac 정식 | https://stylelucky4u.com/api/v1/t/almanac/* (인증 필요) |

---

## 운영 상태 (세션 65 종료 시점)

- **PM2**: ypserver online (~/ypserver/server.js, restart 3회) + cloudflared online (22h+ uptime) + pm2-logrotate
- **PostgreSQL 16**: 22 테이블 RLS enabled + tenant_id 첫 컬럼 + dbgenerated default (COALESCE fallback)
- **Tenants**: 'default' (00000000-0000-0000-0000-000000000000) + 'almanac' (00000000-0000-0000-0000-000000000001)
- **Roles**: app_migration / app_runtime / app_admin 생성 (32바이트 랜덤 패스워드, **현재 미사용** — DATABASE_URL은 postgres superuser. role 분리는 N>1 시)
- **마이그레이션**: 모두 적용 완료 (`prisma migrate status` = up to date)
- **ESLint**: 0 violations / TSC: 0 errors / Vitest: 364 pass

---

## ⭐ 세션 66 우선 작업 P0: M3 게이트 준비 — packages/tenant-almanac/ plugin 마이그레이션 (T2.5, ~28h)

T1.6에서 Almanac aggregator schema + tenant + alias만 적용. **비즈니스 로직(runner/classify/promote/dedupe)이 미구현**.

플로우:
1. **T2.1 ManifestSchema** (14h) — `packages/core/src/tenant/manifest.ts` (Zod TenantManifest + defineTenant 헬퍼)
2. **T2.2 Manifest loader** (18h) — `scripts/merge-tenant-prisma-fragments.ts` + `scripts/load-tenant-manifests.ts`
3. **T2.3 Plugin route handler** (16h) — `apps/web/app/admin/[tenant]/*` codegen
4. **T2.4 Cron TENANT dispatcher** (12h) — registry.ts + worker-script.ts TENANT case
5. **T2.5 Almanac → packages/tenant-almanac/** (28h) — 비즈니스 로직 + manifest + fragment.prisma
6. **T2.6 M3 게이트** (12h) — 2번째 컨슈머 manifest only로 코드 0줄 입증

근거: `docs/research/baas-foundation/04-architecture-wave/02-sprint-plan/01-task-dag.md`

---

## P0-1: 메신저 도메인 Phase 1 진입 (별도 트랙)

세션 64에서 ADR-030 ACCEPTED + PRD 18섹션 + 7 산출물 신설. 이월 작업:
- **kdyspike #1** (PG NOTIFY+SSE 정합성, 30분)
- **Phase 1 M1**: 데이터 모델 시작 (메신저 마이그레이션 6건)
- **결정 대기**: Q1 / Q4 / Q6

근거: `docs/research/messenger/_index.md`

---

## P1: filebox-db.ts 패턴 4 마이그레이션 (~4h)

세션 65 B-5 agent가 filebox-db.ts 26 위반을 패턴 3 (eslint-disable)로 처리.
패턴 4 (시그니처에 tenantId 추가)로 전환하여 명시적 multi-tenant 지원:
- 호출자 6파일(api/v1/filebox/*) 영향
- runWithTenant + prismaWithTenant 전환
- ADR-024 부속 결정

DEFERRED 사유: 호출자 변경 영향 범위 + sweep 1차 범위 외.

---

## P2: 운영 부채 정리

- **sticky-notes / messenger 별도 작업 통합**: 세션 63/64의 untracked 파일 (스키마 + UI + 마이그레이션) 본 브랜치 commit 또는 별도 브랜치 분리
- **/logs?_rsc=dy0du 404**: 사이드바 또는 RSC prefetch가 `/logs` 라우트 참조하나 페이지 부재 — 메뉴 정리 또는 페이지 생성
- **03:00 KST cron 정상화 1주 관찰** (세션 54 이월)
- **filebox MIME 화이트리스트 확장 검토**: text/javascript / text/typescript 등 코드 텍스트 (보안 검토 필요)

---

## P2 (이월): Phase 2 Plugin 시스템 (T2.1~2.6, ~100h)

M3 게이트 = 2번째 컨슈머가 코드 0줄 추가로 가동되는 것 = closed multi-tenant BaaS 정체성 입증.

`docs/research/baas-foundation/04-architecture-wave/02-sprint-plan/01-task-dag.md` 참조.

---

## 이월 (S64+ 누적)

- packages/tenant-almanac/ plugin 마이그레이션 (T2.5)
- Almanac aggregator 비즈니스 로직 적용 (runner/classify/promote/dedupe)
- 메신저 Phase 1 M1 (마이그 6건) + kdyspike #1
- 스티커 메모 / 메신저 untracked 통합
- filebox-db.ts 패턴 4 (호출자 6파일)
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

## 운영 환경 정책 (CLAUDE.md "운영 환경 및 마이그레이션 정책" 섹션 + 메모리)

- **모든 DB 마이그레이션은 Claude Code가 직접 실행/적용**. 운영자 위임 금지.
- 신규 마이그레이션 작성 즉시 `npx prisma migrate deploy` 실행 → 결과 보고.
- 실패 시 rollback SQL까지 실행하고 원인 분석.
- WSL 경유 필요 시 `wsl -- bash -lc '...'`.
- 예외: 사용자가 명시적으로 "지금은 적용하지 마"라고 지시한 경우만 보류.

연관 메모리:
- `memory/feedback_migration_apply_directly.md` — Claude 직접 마이그레이션 적용 정책
- `memory/reference_db_role_passwords.md` — app_* role 패스워드 보존 위치 (현재 미사용)
- `memory/project_tenant_default_sentinel.md` — multi-tenant fallback은 'default' (spec '_system' 아님)
- `memory/feedback_autonomy.md` — 분기 질문 금지, 권장안 즉시 채택 (파괴적 행동만 예외)
- `memory/project_standalone_reversal.md` — standalone 모드 재도입 (2026-04-19 세션 3)

---

## 필수 참조 파일 ⭐ 세션 65 종료 시점

```
CLAUDE.md (프로젝트 루트) ⭐⭐⭐ — 세션 64에서 "운영 환경 및 마이그레이션 정책" + 운영 위치 정합 추가
docs/status/current.md (세션 65 행 추가)
docs/handover/260426-session65-deploy-filebox-standalone.md ⭐⭐⭐ 직전 세션 인수인계
docs/handover/260426-almanac-tenant-integration.md ⭐⭐⭐ Almanac 컨슈머 통합 가이드 (10 섹션)

# 세션 65 핵심 산출물
prisma/migrations/20260427110000_phase1_4_rls_stage3/migration.sql (PG 16 fix 보강)
prisma/migrations/20260428100000_fix_dbgenerated_missing_ok/migration.sql (COALESCE 정정)
prisma/migrations/20260427140000_t1_6_aggregator_with_tenant/migration.sql (T1.6)
prisma/migrations/20260427140001_seed_almanac_tenant/migration.sql (almanac seed)
src/lib/filebox-db.ts (MIME markdown + 확장자 fallback)
src/app/api/v1/almanac/[...path]/route.ts (308 alias)

# CK +2 (46→48)
docs/solutions/2026-04-26-pg16-bypassrls-revoke-syntax.md
docs/solutions/2026-04-26-prisma-dbgenerated-current-setting-missing-ok.md

# 결정 근거
docs/research/baas-foundation/01-adrs/ (8 ADR ACCEPTED + ADR-030 메신저)
docs/research/baas-foundation/04-architecture-wave/02-sprint-plan/01-task-dag.md
docs/research/messenger/_index.md (메신저 PRD)
```

---

## 직전 세션들 요약

- **세션 65** (2026-04-26): 옵션 A+B 6 agent 병렬 + 운영 배포 + filebox/PG16 일괄 fix — 6 commits, 50 파일, 마이그레이션 8건 적용, CK +2 (현재)
- **세션 64** (2026-04-26): 스티커 메모 + 메신저 도메인 PRD 산출 (계획 집중) — handover skip, `docs/research/messenger/` 7건 + ADR-030 ACCEPTED
- **세션 63** (2026-04-26): kdyswarm 6 agent 발사 + 통합 (옵션 A+B) — 본 세션 65의 1단계 (current.md row만 분리됨)
- **세션 62** (2026-04-26): T1.4-sweep + P1 통합 부채 정리 — kdyswarm parallel 7 commits, 364 tests, eslint warn → error
- **세션 61** (2026-04-26): T1.4 RLS Stage 3 + P0-membership 통합 — kdyswarm sequential, 8 commits, CK +2

---

## 세션 66 시작 시 추천 첫 액션

1. **본 next-dev-prompt + handover/260426-session65* 읽기** (세션 65 결정 흡수)
2. **세션 64 산출물 인지** — `docs/research/messenger/` + sticky-notes untracked 파일 (별도 브랜치 또는 본 브랜치 통합)
3. **운영 상태 확인** (1주 관찰):
   - filebox 업로드 정상화 유지
   - 03:00 KST cron 정상 동작
   - audit_logs.tenant_id NULL 0
4. **P0 진입 결정**: T2.5 (packages/tenant-almanac/) vs 메신저 Phase 1 M1 vs sticky-notes/messenger 통합
