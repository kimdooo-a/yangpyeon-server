# 다음 세션 프롬프트 (세션 70)

> 이 파일을 복사하여 새 세션 시작 시 Claude에게 전달합니다.
> 세션 종료 시 반드시 갱신합니다.

---

## 프로젝트 컨텍스트 — 멀티테넌트 BaaS (세션 69 완료)

- **프로젝트명**: 양평 부엌 서버 — **1인 운영자의 멀티테넌트 백엔드 플랫폼** (stylelucky4u.com)
- **정체성**: closed multi-tenant BaaS (본인 소유 10~20개 프로젝트 공유 백엔드, 외부 가입 없음)
- **스택**: Next.js 16 + TypeScript + Tailwind CSS 4 + PostgreSQL 16 (Prisma 7) + SQLite (Drizzle)
- **첫 컨슈머**: Almanac (almanac-flame.vercel.app) — Phase 2 / T2.5 양평 측 인프라 100% 가동
- **세션 69 핵심**: 세션 66 미완 — Almanac aggregator Day 4 잔여 4 endpoint(contents/sources/today-top/items) + srv_almanac_* 키 발급 + 사전 결함 1건(withAuth tenant API key 분기 누락) fix — 모두 마무리. 평문 키 안전 채널 전달과 Almanac Vercel 측 env 등록만 남음.
- **Track B 병행**: 메신저 M2-Step1 (도메인 헬퍼 4개) — 다른 터미널이 진행 중. 영역 분리 보장됨 (`src/lib/messenger/`, `tests/messenger/`).

## 서버 실행 / 접속 정보

```bash
npm run dev
# WSL2 운영 배포 (ypserver 스킬 v2 — 세션 52~ 결정):
#   /ypserver                       # 전체 파이프라인 (rsync → npm ci → build → pack → deploy → PM2)
#   /ypserver --migrate             # 빌드 후 prisma migrate deploy 추가 실행
#   /ypserver --quick               # rsync/npm ci 스킵, 빠른 코드 패치 검증

# 마이그레이션만 즉시 적용 (Claude 직접 적용 정책 — CLAUDE.md "운영 환경 및 마이그레이션 정책"):
#   wsl -- bash -lic 'cd /mnt/e/00_develop/260406_luckystyle4u_server && \
#     DATABASE_URL="postgresql://postgres:<DB_PASSWORD>@localhost:5432/luckystyle4u?schema=public" \
#     npx prisma migrate deploy'

# tenant API 키 발급 (운영 콘솔 UI 도입 전 임시 절차, S69 신설):
#   wsl -- bash -lic 'cd ~/dev/ypserver-build && set -a && source ~/ypserver/.env && set +a && \
#     npx tsx scripts/issue-tenant-api-key.ts \
#       --tenant=<slug> --scope=pub|srv --name="<label>" --owner=<adminUserId> \
#       [--scopes=a,b,c]'
```

| 서비스 | URL |
|--------|-----|
| 로컬 | http://localhost:3000 |
| 외부 | https://stylelucky4u.com |
| 로그인 | kimdooo@stylelucky4u.com / <ADMIN_PASSWORD> |
| Almanac alias | https://stylelucky4u.com/api/v1/almanac/* (308 → /api/v1/t/almanac/*) |
| Almanac 정식 (5 endpoint) | https://stylelucky4u.com/api/v1/t/almanac/{categories,contents,sources,today-top,items/[slug]} |

---

## 운영 상태 (세션 69 종료 시점)

- **PM2**: ypserver online (~/ypserver/server.js, **restart #6**, pid 93211) + cloudflared online (24h+ uptime) + pm2-logrotate
- **PostgreSQL 16**: 38 테이블 RLS enabled + tenant_id 첫 컬럼 + dbgenerated COALESCE fallback
- **Tenants**: 'default' (00000000-0000-0000-0000-000000000000) + 'almanac' (00000000-0000-0000-0000-000000000001) — both `status='active'`
- **Almanac 콘텐츠 데이터**: 37 카테고리 (build 7 / 5 트랙 6) + 60 소스 (RSS 46 / HTML 3 / API 7 / FIRECRAWL 4) — **모두 active=FALSE**. ContentItem **0건** (cron 전).
- **Almanac 명시 라우트** (S69 4개 추가): `/api/v1/t/almanac/{categories,contents,sources,today-top,items/[slug]}` 5개 모두 가동.
- **API 키** (NEW S69): `srv_almanac_4EJMXSLc...` 발급 완료 (scopes=read:contents/sources/categories/items/today-top, owner=kimdooo@). 평문은 운영자가 안전 채널로 직접 보관 — handover/journal 미기재.
- **Roles**: app_migration / app_runtime / app_admin 생성 (32바이트 랜덤 패스워드, **현재 미사용** — DATABASE_URL은 postgres superuser. role 분리는 N>1 시)
- **마이그레이션**: 모두 적용 완료 (`prisma migrate status` = up to date, 28 마이그)
- **ESLint**: 0 violations / TSC: 0 errors / Vitest: 372 pass + 33 skipped

---

## ⭐ 세션 70 우선 작업 P0: Almanac Vercel env 등록 + 가시화 검증

### P0-0 — Almanac 측 env 등록 (양평 측 작업 0)

세션 69 발급 평문 키를 Almanac Vercel 측에:
1. Production env 추가: `ALMANAC_TENANT_KEY=srv_almanac_*` (운영자가 갖고 있는 평문)
2. Production env 추가: `NEXT_PUBLIC_AGGREGATOR_ENABLED=true`
3. Vercel Redeploy
4. /explore 카드 표시 시작 (Almanac 측 SSR/ISR 5분 캐시 활용)

당장은 ContentItem 0건이라 카드는 안 보이지만, aggregator 비즈니스 로직 + cron 등록 후 첫 카드부터 자동 노출.

### P0-1 — Aggregator 비즈니스 로직 이식 (~28h, T2.5 본체)

spec 의 10 모듈을 multi-tenant adaptation 으로 이식:
- 모든 Prisma 호출에 `prismaWithTenant` 또는 `withTenantTx`
- runner.ts 진입점에 `runWithTenant({ tenantId }, ...)` 한 번 SET
- cron AGGREGATOR kind 분기 (`src/lib/cron/runner.ts`)
- 위치: `packages/tenant-almanac/aggregator/` (T2.5 plugin 패턴) 또는 `src/lib/aggregator/` (M3 게이트 이전 임시)
- spec 파일: `docs/assets/yangpyeon-aggregator-spec/code/src/lib/aggregator/*` (10 파일)

이후 Cron 6종 등록 (rss-fetch / html-scrape / api-poll / classify / promote / cleanup) → 소스 5개 점진 활성화 → 24h 관찰 → 첫 카드.

---

## P0-2: 메신저 M2-Step1 (Track B 병행 가능)

`docs/research/messenger/m2-detailed-plan.md` §3 도메인 헬퍼 4개 시그니처 그대로. Track A(aggregator) 와 폴더 분리:
- Track A: `src/app/api/v1/t/[tenant]/{categories,contents,sources,today-top,items}/`, `src/lib/aggregator/`
- Track B: `src/lib/messenger/`, `src/lib/schemas/messenger/`, `tests/messenger/`

영역 분리로 commit 시 명시 파일 지정만 하면 충돌 0.

---

## P1: 소스 점진 활성화 (60 → 5씩, 24h 관찰)

aggregator 비즈니스 로직 + cron 후 진행. 첫 묶음 권장:

```sql
SET LOCAL app.tenant_id = '00000000-0000-0000-0000-000000000001';
UPDATE content_sources
SET active = TRUE
WHERE slug IN ('openai-blog', 'anthropic-news', 'huggingface-blog', 'hn-frontpage', 'arxiv-cs-cl');
```

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

- **Tenant context missing 1건 (S66 leftover)**: 어떤 코드 경로가 withTenant 가드 밖에서 prismaWithTenant 호출했는지 추적 미완
- **sticky-notes / messenger 별도 작업 통합**: 세션 63/64 untracked 파일 + Track B(S69 untracked) 본 브랜치 commit 또는 별도 브랜치 분리
- **/logs?_rsc=dy0du 404**: 사이드바 또는 RSC prefetch가 `/logs` 라우트 참조하나 페이지 부재 — 메뉴 정리 또는 페이지 생성
- **03:00 KST cron 정상화 1주 관찰** (세션 54 이월)
- **filebox MIME 화이트리스트 확장 검토**: text/javascript / text/typescript 등 코드 텍스트 (보안 검토 필요)
- **CK +1 후보 평가**: withAuth tenant API key 분기 패턴 (S69) — 다른 SDK/스택에서도 반복될 가능성. 재사용 가치 검토 → CK 작성 여부 결정.

---

## P2 (이월): Phase 2 Plugin 시스템 (T2.1~2.6, ~100h)

M3 게이트 = 2번째 컨슈머가 코드 0줄 추가로 가동되는 것 = closed multi-tenant BaaS 정체성 입증.

`docs/research/baas-foundation/04-architecture-wave/02-sprint-plan/01-task-dag.md` 참조.

---

## 이월 (S65+ 누적)

- **세션 69 미터치**: Almanac Vercel env 등록(외부 작업) / aggregator 비즈니스 로직 이식 (~28h) / cron AGGREGATOR 분기 + 6종 등록 / 소스 5개씩 점진 활성화 / 관리자 UI 4페이지
- **세션 69 미해결 이월**: PM2 로그 `Tenant context missing` 1건 (timestamp 20:16:10, S66 leftover) — 추적 미완
- packages/tenant-almanac/ plugin 마이그레이션 (T2.5 본체, ~28h, M3 게이트)
- 메신저 M2-Step1/2/3 (Track B)
- 스티커 메모 / 메신저 untracked 통합 (sticky-notes/messenger 별도 작업)
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

## 필수 참조 파일 ⭐ 세션 69 종료 시점

```
CLAUDE.md (프로젝트 루트) ⭐⭐⭐ — 세션 64에서 "운영 환경 및 마이그레이션 정책" + 운영 위치 정합 추가
docs/status/current.md (세션 69 행 추가)
docs/handover/260426-session69-aggregator-day2.md ⭐⭐⭐ 직전 세션 인수인계 (NEW)
docs/handover/260426-session66-aggregator-day1.md ⭐⭐⭐ Track A 1차 (S66, /categories endpoint)
docs/handover/260426-session68-messenger-m2-plan.md ⭐⭐ Track B 정밀 계획
docs/handover/260426-almanac-tenant-integration.md ⭐⭐⭐ Almanac 컨슈머 통합 가이드 (10 섹션)
docs/assets/260427-yangpyeon-phase2-aggregator-handover.md ⭐⭐⭐ Almanac → 양평 Phase 2 인수인계
docs/assets/yangpyeon-aggregator-spec/ ⭐⭐ spec 패키지 42 파일
docs/assets/yangpyeon-aggregator-spec/code/src/lib/aggregator/*.ts ⭐ aggregator 비즈니스 로직 spec (10 파일, 다음 P0-1)

# 세션 69 핵심 산출물
src/app/api/v1/t/[tenant]/contents/route.ts (cursor pagination + 6 필터 + sort 3종)
src/app/api/v1/t/[tenant]/sources/route.ts (active=true + kind/country)
src/app/api/v1/t/[tenant]/today-top/route.ts (ContentItemMetric.itemId 정합 정정)
src/app/api/v1/t/[tenant]/items/[slug]/route.ts (composite tenantId_slug 명시)
scripts/issue-tenant-api-key.ts (운영 콘솔 UI 도입 전 임시 절차)
src/lib/api-guard.ts (tenant API key Bearer 분기 + scope 가드)

# 결정 근거
docs/research/baas-foundation/01-adrs/ (8 ADR ACCEPTED + ADR-030 메신저)
docs/research/baas-foundation/04-architecture-wave/02-sprint-plan/01-task-dag.md
docs/research/messenger/_index.md (메신저 PRD)
docs/research/messenger/m2-detailed-plan.md (M2 정밀 계획, 655줄)
```

---

## 직전 세션들 요약

- **세션 69** (2026-04-26): Track A 완성 — Almanac aggregator 잔여 4 endpoint + srv_almanac_* 키 발급 + withAuth fix (현재)
- **세션 68** (2026-04-26): 메신저 M1 점검 9/9 PASS + M2 정밀화 산출물 (655줄, 코드 0)
- **세션 67** (2026-04-26): 메신저 Phase 1 M1 — 9 모델 + 6 enum + 6 마이그 + RLS 테스트 + S66 정합성 정리
- **세션 66** (2026-04-26): Phase 2 / T2.5 Day 1 시동 — Almanac aggregator 시드(37+60) + /categories endpoint + 운영 배포
- **세션 65** (2026-04-26): 옵션 A+B 6 agent 병렬 + 운영 배포 + filebox/PG16 일괄 fix — 6 commits, 50 파일, 마이그레이션 8건 적용, CK +2

---

## 세션 70 시작 시 추천 첫 액션

1. **본 next-dev-prompt + handover/260426-session69-aggregator-day2.md 읽기** (세션 69 결정 흡수)
2. **현 운영 상태 확인** (1주 관찰):
   - filebox 업로드 정상화 유지
   - 03:00 KST cron 정상 동작
   - audit_logs.tenant_id NULL 0
   - PM2 ypserver 상태 (restart 횟수, 메모리)
3. **P0 진입 결정 — 세 갈래**:
   - Track A 다음: aggregator 비즈니스 로직 이식 (~28h) — spec 10 모듈, packages/tenant-almanac/ 또는 src/lib/aggregator/
   - Track B 진입: M2-Step1 도메인 헬퍼 4개 — m2-detailed-plan §3 시그니처 그대로
   - 잡일 정리: Tenant context missing 추적 / Track B untracked commit / sticky-notes 통합 / filebox-db.ts 패턴 4
