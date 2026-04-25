# 03. kdygenesis 핸드오프 (Genesis Handoff) — 양평 부엌 서버 대시보드

> ⚠️ **ADR-015 부분 대체 통지 (2026-04-25, 세션 51)**: 본 문서가 참조하는 *Capistrano-style symlink/releases* 배포 메커니즘은 [ADR-020](../02-architecture/01-adr-log.md) (Next.js standalone + rsync + pm2 reload, 세션 50)에 의해 부분 대체. PM2 cluster:4 / canary 서브도메인은 유효. 4 재진입 트리거(트래픽 100만+/팀 2명+/3환경/B2B) 충족 시 Capistrano 경로 재가동 가능.

> Wave 5 · Tier 2 (A1) 산출물 — kdywave W5-A1 (Agent Appendix-1)
> 작성일: 2026-04-18 (세션 28+)
> 상위: [CLAUDE.md](../../../../CLAUDE.md) → [docs/research/](../../) → [2026-04-supabase-parity/](../) → [07-appendix/](./) → **이 문서**
> 연관: [01-glossary.md](./01-glossary.md) · [02-dq-final-resolution.md](./02-dq-final-resolution.md)

---

## 목차

- [1. kdygenesis 연계 개요](#1-kdygenesis-연계-개요)
- [2. _PROJECT_GENESIS.md 초안](#2-_project_genesismd-초안)
- [3. 증분 개선 모드 매핑](#3-증분-개선-모드-매핑)
- [4. kdygenesis 실행 시나리오 3가지](#4-kdygenesis-실행-시나리오-3가지)
- [5. kdywave → kdygenesis 산출물 매핑 테이블](#5-kdywave--kdygenesis-산출물-매핑-테이블)
- [6. 신규 페이지 스캐폴드 목록](#6-신규-페이지-스캐폴드-목록)
- [7. 초기 DB 마이그레이션 목록](#7-초기-db-마이그레이션-목록)
- [8. 초기 태스크 큐 (최초 20개)](#8-초기-태스크-큐-최초-20개)
- [9. kdyswarm 병렬 개발 시나리오](#9-kdyswarm-병렬-개발-시나리오)
- [10. 후속 세션 명령 예시](#10-후속-세션-명령-예시)
- [11. CLAUDE.md 업데이트 제안](#11-claudemd-업데이트-제안)
- [12. 인수인계서 초안](#12-인수인계서-초안)

---

## 1. kdygenesis 연계 개요

### 1.1 배경

`kdywave`가 Wave 1-5를 거쳐 **98+ 문서 / 86,460+줄**의 리서치·설계 산출물을 생성했다. 이 산출물은 "무엇을 어떻게 만들 것인가"를 완결하지만, 실제 코드 스캐폴드/디렉토리 구조/첫 커밋까지의 "실행 착수" 단계는 별도 스킬이 담당한다. 이 역할이 **kdygenesis**.

### 1.2 kdywave vs kdygenesis 관할 분리

| 단계 | 담당 스킬 | 산출물 |
|------|---------|-------|
| **리서치** (Wave 1) | kdywave | 1-3 deep-dive per 카테고리 |
| **비교** (Wave 2) | kdywave | 매트릭스 + 1:1 비교 |
| **비전/요구사항** (Wave 3) | kdywave | Vision Suite + FR/NFR/CON/ASM |
| **아키텍처** (Wave 4) | kdywave | ADR + Blueprint 14개 |
| **로드맵** (Wave 5) | kdywave | Release plan + 우선 스파이크 |
| **→ 여기부터 kdygenesis →** | | |
| **스캐폴드** | kdygenesis | `src/` 디렉토리 · `package.json` · 첫 마이그레이션 |
| **Phase 15 착수** | kdygenesis + 코드 | Auth Advanced 실제 구현 |
| **후속 병렬 개발** | kdyswarm + kdygenesis | N-에이전트 DAG |

### 1.3 본 문서의 목적

본 문서는 kdygenesis가 **즉시 실행 가능한 상태로** 인수받을 자료를 집약한다:
- Wave 1-5 산출물의 요약 포인터
- 프로젝트 스캐폴드 초안 (`_PROJECT_GENESIS.md` 구조)
- 실행 명령어 3가지 시나리오
- 최초 20개 태스크 큐
- 후속 세션에서 바로 붙여넣기 가능한 명령 예시 10개+

이 문서를 받는 순간 kdygenesis는 "무엇을 만들지 추측할 필요가 없다" — Wave 1-5가 결정을 끝냈기 때문이다.

---

## 2. _PROJECT_GENESIS.md 초안

다음은 kdygenesis가 프로젝트 루트에 생성/갱신할 `_PROJECT_GENESIS.md`의 초안. Wave 1-5 산출물의 **요약 포인터** 역할을 하며, 향후 개발자가 "어디서 시작해야 하나"를 한 눈에 파악하기 위한 단일 진입점.

```markdown
# _PROJECT_GENESIS.md — 양평 부엌 서버 대시보드

> kdygenesis 생성: 2026-04-18 (Wave 5 완료 직후)
> 원본 리서치: docs/research/2026-04-supabase-parity/ (98+ 문서 / 86,460+줄)
> 스킬 체인: kdywave → kdygenesis → kdyswarm → 코드

---

## 프로젝트 메타

- **이름**: 양평 부엌 서버 대시보드 (yangpyeong-dashboard)
- **도메인**: stylelucky4u.com
- **목표**: Supabase Cloud 100점 동등 자체호스팅 대시보드
- **규모**: L (14 카테고리 / 1인 운영 / Multi-tenancy 제외)
- **시작일**: 2026-04-06
- **MVP 예상**: 2026-06 (Phase 15-17)
- **v1.0 예상**: 2027-04 (Phase 20-22)

## 기술 스택 (Wave 2 비교 매트릭스 기준 1순위만 기록)

### 런타임/언어
- Node.js 24 LTS (`.nvmrc` = 24.2.0)
- TypeScript (strict 모드)
- Next.js 16 (App Router)
- React 19

### 데이터베이스
- PostgreSQL 17 + Prisma 7 (트랜잭션)
- SQLite + Drizzle ORM (관측/캐시)
- SeaweedFS (Apache-2.0, 객체 스토리지)
- Backblaze B2 (백업/콜드 스토리지, $0.005/GB/월)

### 인증/보안
- jose (JWT ES256)
- bcryptjs → @node-rs/argon2 (Phase 17+ 전환)
- otplib (TOTP)
- @simplewebauthn/server + /browser (WebAuthn)
- rate-limiter-flexible (Prisma 어댑터)
- node:crypto (Vault envelope AES-256-GCM)

### UI
- Tailwind CSS v4
- shadcn/ui
- TanStack Table v8
- Monaco Editor
- @xyflow/react + elkjs (ERD)
- Recharts (차트)
- Sonner (토스트)
- cmdk (Command Palette)

### 실시간/큐
- wal2json (CDC, Slot 1)
- supabase-realtime 포팅 (Channel, Slot 2)
- pgmq (메시지 큐)
- pg_notify (신호)

### Edge/Functions
- isolated-vm v6 (L1, 짧은 JS)
- Deno embed (L2, npm 호환)
- Vercel Sandbox (L3, 위임)

### AI/UX
- Vercel AI SDK v6
- Anthropic Claude (BYOK, Haiku 기본 + Sonnet 승격)
- mcp-luckystyle4u (자체 MCP 서버)

### 운영
- PM2 cluster:4 (fork cron-worker 분리)
- Cloudflare Tunnel (cloudflared)
- GitHub Actions self-hosted runner (WSL2)
- Capistrano-style symlink 배포
- node-cron (`Asia/Seoul` 강제)
- wal-g (PITR 백업)

### Advisors
- schemalint (TS 포팅) — Layer 1
- squawk (CI) — Layer 2
- splinter 38룰 (TS 포팅) — Layer 3

## 아키텍처 계층 (9-레이어, ADR-018)

```
L0 인프라 (WSL2 + PostgreSQL + SeaweedFS + cloudflared)
L1 관측/운영 (node:crypto Vault / JWKS / Capistrano / PM2)
L2 Auth Core (jose JWT / Session / bcrypt → argon2id)
L3 Auth Advanced (TOTP / WebAuthn / Rate Limit)
L4 저장 (SeaweedFS + B2 Hot/Cold)
L5 Compute (wal2json / Edge 3층 / pgmq)
L6 Dev Tools (SQL Editor / Schema Viz / Table Editor / Advisors)
L7 Data API (REST+PostgREST 방언 + pgmq, 조건부 pg_graphql)
L8 UX (3-pane 다크 테마 + AI SDK v6 + Cmd+K)
```

## 디렉토리 구조 제안

```
src/
├── app/                          Next.js 16 App Router
│   ├── (public)/
│   │   └── login/
│   ├── (auth)/
│   │   └── logout/
│   ├── admin/                    관리 대시보드 전역
│   │   ├── layout.tsx            3-pane 레이아웃 + Sidebar
│   │   ├── page.tsx              /admin 홈 (메트릭 요약)
│   │   ├── database/             L6 Dev Tools
│   │   │   ├── tables/           Table Editor
│   │   │   ├── sql/              SQL Editor
│   │   │   ├── schema/           Schema Visualizer (ERD)
│   │   │   ├── policies/         RLS 정책 편집
│   │   │   ├── functions/        DB Functions
│   │   │   ├── triggers/         Triggers
│   │   │   └── advisors/         3-Layer Advisor
│   │   ├── auth/                 L2/L3 Auth
│   │   │   ├── users/            사용자 관리
│   │   │   ├── sessions/         세션 목록
│   │   │   ├── mfa/              MFA 등록/관리
│   │   │   └── providers/        OAuth (Phase 18+)
│   │   ├── storage/              L4 Storage
│   │   │   ├── buckets/
│   │   │   └── files/
│   │   ├── edge/                 L5 Edge Functions
│   │   │   └── [function]/
│   │   ├── realtime/             L5 Realtime
│   │   │   └── channels/
│   │   ├── api/                  L7 Data API 관리
│   │   │   └── keys/
│   │   ├── vault/                L1 Vault
│   │   ├── jwks/                 L1 JWKS 키 관리
│   │   ├── ops/                  L1 운영
│   │   │   ├── cron/
│   │   │   ├── webhooks/
│   │   │   ├── backups/
│   │   │   └── deployments/
│   │   ├── ai-usage/             L8 AI 비용 모니터링
│   │   └── canary/               L1 canary 상태
│   └── api/
│       ├── auth/                 NextAuth 패턴 차용 엔드포인트
│       ├── webauthn/
│       ├── totp/
│       ├── sql/                  SQL 실행 API
│       ├── edge/                 Edge Fn 실행
│       ├── realtime/             SSE + WS
│       └── rest/                 PostgREST 방언
│           └── [...path]/
│
├── components/                   재사용 UI
│   ├── ui/                       shadcn/ui 기본
│   ├── data/                     foreign-key-picker 등
│   ├── editor/                   Monaco / Plan Visualizer
│   ├── schema/                   xyflow ERD
│   └── ai/                       useChat / MCP UI
│
├── lib/
│   ├── auth/                     JWT / Session / MFA
│   ├── crypto/                   node:crypto envelope
│   ├── db/                       Prisma/Drizzle 래퍼
│   │   ├── prisma.ts
│   │   └── schema.ts             (Drizzle SQLite)
│   ├── realtime/                 wal2json 소비 + Channel 서버
│   ├── edge/                     decideRuntime()
│   ├── storage/                  SeaweedFS 클라이언트
│   ├── ai/                       AI SDK v6 래퍼 + MCP 서버
│   ├── advisors/                 3-Layer 구현
│   └── cron/                     node-cron 정의
│
├── workers/
│   ├── cron-worker/              PM2 fork 모드 cron
│   ├── realtime-worker/          PM2 cluster 또는 단일
│   └── pgmq-worker/              pgmq consumer
│
└── mcp-luckystyle4u/             자체 MCP 서버
    ├── server.ts
    └── tools/

prisma/
├── schema.prisma                 PG 29 테이블 (Wave 4 확정)
└── migrations/                   19개 신규 (Wave 4 02-data-model-erd §6)

drizzle/
├── schema.ts                     SQLite 6 테이블
└── migrations/                   3개 신규

docs/                             기존 유지
scripts/
├── deploy-capistrano.sh          symlink 배포
├── wal-g-backup.sh
├── wal-g-restore.sh
└── canary-switch.sh

.github/
└── workflows/
    ├── ci.yml                    schemalint + squawk + test
    ├── deploy-prod.yml
    └── deploy-canary.yml

ecosystem.config.js               PM2 cluster:4 + cron-worker fork + realtime + pgmq
.nvmrc                            24.2.0
```

## 초기 생성 파일 (kdygenesis가 스캐폴드)

1. `.nvmrc` = `24.2.0`
2. `ecosystem.config.js` (PM2 정의 4 앱: app / cron-worker / realtime-worker / pgmq-worker)
3. `prisma/schema.prisma` Phase 15 기준 (User/Folder/File 유지 + auth-related 19개)
4. `drizzle/schema.ts` Phase 15 기준 (metrics 3개 + challenge 3개 신규)
5. `src/lib/auth/jwt.ts` (jose wrapper)
6. `src/lib/crypto/envelope.ts` (node:crypto AES-256-GCM)
7. `src/lib/auth/totp.ts` (otplib wrapper)
8. `src/lib/auth/webauthn.ts` (@simplewebauthn wrapper)
9. `src/lib/auth/rate-limit.ts` (rate-limiter-flexible + Prisma adapter)
10. `.github/workflows/ci.yml` (schemalint + squawk + playwright 스모크)

## 초기 태스크 (Phase 15 Auth Advanced 22h WBS)

Wave 4 `03-auth-advanced-blueprint.md §7 WBS` 12개 태스크 그대로 인수. §8 상세 참조.

## 의존성 목록 (package.json 추가 대상, Phase 15 착수 기준)

**runtime**:
- `@simplewebauthn/server`
- `@simplewebauthn/browser`
- `otplib`
- `rate-limiter-flexible`
- `ua-parser-js`
- `jose` (이미 있음)
- `bcryptjs` (이미 있음)
- `zod` (validation)

**dev**:
- `@playwright/test`
- `schemalint` (TS 포팅 결과)

## 외부 서비스 준비 항목

- [ ] Cloudflare Turnstile 사이트 키/시크릿 발급
- [ ] Anthropic API 키 (BYOK)
- [ ] Backblaze B2 버킷 + 액세스 키 (이미 있음)
- [ ] Cloudflare Tunnel 설정 (이미 있음)

## 리서치 자료 포인터

- **마스터 인덱스**: `docs/research/2026-04-supabase-parity/README.md`
- **체크포인트**: `docs/research/2026-04-supabase-parity/_CHECKPOINT_KDYWAVE.md`
- **비전**: `docs/research/2026-04-supabase-parity/00-vision/00-product-vision.md`
- **ADR 로그**: `docs/research/2026-04-supabase-parity/02-architecture/01-adr-log.md`
- **데이터 모델**: `docs/research/2026-04-supabase-parity/02-architecture/02-data-model-erd.md`
- **14 Blueprint**: `docs/research/2026-04-supabase-parity/02-architecture/03~16`
- **UI/UX 5문서**: `docs/research/2026-04-supabase-parity/03-ui-ux/`
- **Integration 4문서**: `docs/research/2026-04-supabase-parity/04-integration/`
- **로드맵**: `docs/research/2026-04-supabase-parity/05-roadmap/` (Wave 5 Tier 1)
- **DQ 최종**: `docs/research/2026-04-supabase-parity/07-appendix/02-dq-final-resolution.md`

---

> _PROJECT_GENESIS.md 끝. kdygenesis가 이 파일을 읽어 프로젝트 상태를 1-2분 내 완전 이해 가능.
```

---

## 3. 증분 개선 모드 매핑

### 3.1 "새 프로젝트" vs "증분 개선" 모드 차이

kdygenesis의 기본 동작은 **"새 프로젝트 생성"** (빈 디렉토리에 스캐폴드 작성)이다. 그러나 양평은 **이미 존재하는 기존 프로젝트** (2026-04-06 시작, 28+ 세션 진행, 기존 Prisma schema 10 테이블 / SQLite 3 테이블 / Next.js 앱 일부 구현 완료).

따라서 kdygenesis는 **증분 개선 모드 (incremental mode)**로 동작해야 한다. 구체적 차이:

| 동작 | 새 프로젝트 모드 | 증분 개선 모드 (양평 적용) |
|------|-----------------|------------------------|
| 디렉토리 생성 | `mkdir -p src/app/admin/...` 전수 | **기존 디렉토리 보존**, 누락 페이지만 추가 |
| `package.json` | 신규 작성 | 기존 보존, 의존성만 `--save` 추가 |
| `prisma/schema.prisma` | 신규 작성 | 기존 10 테이블 유지, 19 신규 추가 |
| `CLAUDE.md` | 신규 | 기존 파일에 섹션 추가 |
| `docs/` | 신규 구조 | 기존 `docs/` 유지, `research/` 하위만 유효 |

### 3.2 기존 자산 목록 (증분 개선 시 보존 대상)

Wave 4 `02-data-model-erd.md §2`에 기록된 현재 상태:

**PostgreSQL 10 테이블 (기존)**:
- User / Folder / File / FileVersion / Sharing
- AuditLog / SystemSetting / MigrationHistory
- UserPreference / NotificationTemplate

**SQLite 3 테이블 (기존)**:
- metrics_history / request_audit / ip_allowlist

**Next.js 기존 라우트 (확인 필요)**:
- `/` (홈)
- `/login` · `/logout`
- `/admin` (부분 구현)
- `/admin/files` · `/admin/users` (부분)

### 3.3 증분 개선의 금지 원칙

kdygenesis가 증분 개선 모드에서 **절대 하지 말아야 할 것**:

1. **기존 테이블 DROP/RENAME 금지** — 마이그레이션 롤백 불가.
2. **기존 Next.js 라우트 삭제 금지** — 실사용 중일 수 있음.
3. **기존 `.env` 덮어쓰기 금지** — 운영 시크릿 손실.
4. **기존 `package.json` 덮어쓰기 금지** — Append 전용.
5. **기존 커밋 이력 rebase 금지** — 역사 삭제 금지 원칙.

대신 **부가(additive)** 변경만 허용:
- 신규 파일 생성 (확인 후)
- 기존 파일에 섹션 추가 (편집자 확인 후)
- 신규 마이그레이션 파일 순차 추가
- 신규 디렉토리 생성

---

## 4. kdygenesis 실행 시나리오 3가지

### 4.1 시나리오 (a): 자동 적용 모드

```bash
/kdygenesis --from-wave ./docs/research/2026-04-supabase-parity/
```

**동작**:
1. `_CHECKPOINT_KDYWAVE.md` 읽기 → Wave 1-5 완료 확인
2. `07-appendix/03-genesis-handoff.md`(이 문서) 읽기 → _PROJECT_GENESIS 초안 추출
3. 기존 프로젝트 자산 스캔 → 증분 개선 모드 자동 활성
4. Phase 15 WBS 12 태스크 자동 실행
   - 스파이크 우선 세트(SP-010~016) 먼저
   - 그 후 Auth Advanced 실제 구현
5. 자동 커밋 + 푸시 (사용자 확인 1회)

**적용 대상**: Wave 1-5가 완벽히 검증되고, 오너가 빠른 진행을 원할 때.
**리스크**: 자동 실행 중 파괴적 변경 위험 → 증분 모드 강제 필수.

### 4.2 시나리오 (b): 수동 검토 후 적용

```bash
/kdygenesis --from-genesis ./docs/research/2026-04-supabase-parity/07-appendix/03-genesis-handoff.md --review
```

**동작**:
1. 본 문서의 `_PROJECT_GENESIS.md 초안`(§2) 추출
2. 프로젝트 루트에 `_PROJECT_GENESIS.md` 생성 (기존 있으면 `_PROJECT_GENESIS.draft.md`)
3. 사용자에게 diff 제시 → 승인 요청
4. 승인 후 Phase 15 시작 태스크만 실행 (WBS 12개 중 첫 3개)

**적용 대상**: 오너가 각 단계를 확인하며 진행하고 싶을 때 (권장).

### 4.3 시나리오 (c): 수동 단계별 적용

사용자가 kdygenesis 자동화 없이 직접 제어:

```bash
# 1단계: 스파이크 우선 세트 실행 (Phase 15 진입 전)
/kdyspike --full "SP-010 WebAuthn 브라우저 호환 검증" --max-hours 4
/kdyspike --full "SP-011 otplib + QR 코드 생성 파이프라인" --max-hours 2
/kdyspike --full "SP-012 rate-limiter-flexible Prisma adapter 검증" --max-hours 3
/kdyspike --full "SP-013 node:crypto envelope vs PG pgsodium 벤치" --max-hours 4
/kdyspike --full "SP-014 jose JWKS 3분 grace TTL 동작 검증" --max-hours 2
/kdyspike --full "SP-015 PM2 cluster:4 + Session 공유 검증" --max-hours 3
/kdyspike --full "SP-016 Capistrano-style 5초 롤백 dry-run" --max-hours 4

# 2단계: Phase 15 Auth Advanced 착수
cd /mnt/e/00_develop/260406_luckystyle4u_server
nvm use
pnpm add @simplewebauthn/server @simplewebauthn/browser otplib rate-limiter-flexible ua-parser-js zod

# 3단계: 스키마 업데이트
# prisma/schema.prisma에 Wave 4 §3.1 신규 모델 추가
pnpm prisma migrate dev --name phase15-auth-advanced

# 4단계: UI 스캐폴드
# src/app/admin/auth/mfa/page.tsx 등 생성

# 5단계: PM2 앱 재시작
pm2 reload ecosystem.config.js
```

**적용 대상**: 오너가 학습 + 통제를 병행할 때. 초기 1-2 Phase에 권장.

---

## 5. kdywave → kdygenesis 산출물 매핑 테이블

Wave 1-5 산출물이 kdygenesis 실행 시 구체적으로 어디에 매핑되는지 명시.

| Wave 산출물 | 경로 | kdygenesis 매핑 대상 |
|-----------|------|---------------------|
| 기술 스택 결론 | Wave 2 7 Agent 매트릭스 | `package.json` 의존성 라인 |
| 9-레이어 아키텍처 | `02-architecture/00-system-overview.md §2` | `src/app/admin/` 디렉토리 구조 + 페이지 계층 |
| 데이터 모델 ERD | `02-architecture/02-data-model-erd.md` | `prisma/schema.prisma` (19 신규) + `drizzle/schema.ts` (3 신규) |
| FR 55건 | `00-vision/02-functional-requirements.md` | `docs/backlog.md` 태스크 목록 (또는 GitHub Issues) |
| NFR 38건 | `00-vision/03-non-functional-requirements.md` | CI 테스트 기준 + 모니터링 대시보드 항목 |
| CON/ASM 24건 | `00-vision/04-constraints-assumptions.md` | `CLAUDE.md` 프로젝트 규칙 섹션 |
| 100점 정의 | `00-vision/05-100점-definition.md` | `docs/milestones.md` (카테고리별 4단계) |
| 페르소나 3 | `00-vision/06-operational-persona.md` | `CLAUDE.md` 타겟 사용자 섹션 |
| DQ 64 전수 | `00-vision/07-dq-matrix.md` | 문서 주석 링크 + `docs/decisions/` |
| STRIDE 29+5 위협 | `00-vision/08-security-threat-model.md` | `tests/security/` 시나리오 + `docs/security/threat-model.md` |
| ADR-001 (Multi-tenancy) | `00-vision/09-multi-tenancy-decision.md` | `CLAUDE.md` 핵심 원칙 섹션 |
| 카테고리 우선순위 | `00-vision/10-14-categories-priority.md` | Phase 15-22 GitHub Milestones |
| ADR 18건 | `02-architecture/01-adr-log.md` | `docs/adr/` 각 ADR 별 파일 또는 단일 파일 유지 |
| 14 Blueprint | `02-architecture/03~16-*-blueprint.md` | Phase별 상세 WBS → GitHub Issues 그룹 |
| 디자인 시스템 hex | `03-ui-ux/00-design-system.md` | `tailwind.config.ts` + `src/styles/tokens.css` |
| 3-pane 레이아웃 | `03-ui-ux/01-layout-navigation.md` | `src/app/admin/layout.tsx` |
| Table/Form 패턴 | `03-ui-ux/02-table-and-form-patterns.md` | `src/components/data/*` 재사용 |
| Auth UI 플로우 | `03-ui-ux/03-auth-ui-flows.md` | `src/app/(public)/login/*` + `src/app/admin/auth/mfa/*` |
| Editor 컴포넌트 | `03-ui-ux/04-editor-components.md` | `src/components/editor/*` |
| 통합 개요 | `04-integration/00-integration-overview.md` | 내부 24쌍 통합 계약 → 인터페이스 정의 |
| PG 확장 | `04-integration/01-postgres-extensions-integration.md` | `scripts/install-pg-extensions.sh` |
| Cloudflare 배포 | `04-integration/02-cloudflare-deployment-integration.md` | `cloudflared config.yml` + `.github/workflows/deploy-*.yml` |
| 외부 서비스 | `04-integration/03-external-services-integration.md` | `.env.example` + `src/lib/external/*` |
| 우선 스파이크 | `06-prototyping/spike-005~010` | `spikes/` 디렉토리 실행 대상 |
| 릴리스 계획 | `05-roadmap/00-release-plan.md` | GitHub Milestones v0.15 ~ v1.0 |
| 마일스톤 WBS | `05-roadmap/01-milestones-wbs.md` | GitHub Issues 개별 |
| Go/No-Go | `05-roadmap/04-go-no-go-checklist.md` | Phase 진입 체크리스트 |
| 용어집 | `07-appendix/01-glossary.md` | 개발자 온보딩 필독 |
| DQ 최종 | `07-appendix/02-dq-final-resolution.md` | 향후 DQ 재발 시 참조 |

---

## 6. 신규 페이지 스캐폴드 목록

Phase 15-17 MVP에서 필요한 신규 `/admin` 페이지 (증분 개선 대상) + 기존 페이지 업그레이드.

### 6.1 신규 페이지 (Phase 15-17)

**Phase 15 (Auth Advanced)**:
- `src/app/admin/auth/mfa/page.tsx` — MFA 등록/관리 홈
- `src/app/admin/auth/mfa/totp/page.tsx` — TOTP 등록 QR 표시
- `src/app/admin/auth/mfa/webauthn/page.tsx` — Passkey 등록
- `src/app/admin/auth/mfa/backup-codes/page.tsx` — 백업 코드 발급
- `src/app/admin/auth/sessions/page.tsx` — 활성 세션 목록 (Lucia 패턴)
- `src/app/admin/auth/rate-limits/page.tsx` — Rate limit 대시보드

**Phase 16 (Observability + Operations)**:
- `src/app/admin/vault/page.tsx` — Vault 시크릿 목록
- `src/app/admin/vault/[id]/page.tsx` — 시크릿 상세 / 회전
- `src/app/admin/jwks/page.tsx` — JWKS 키 관리 / 회전
- `src/app/admin/ops/canary/page.tsx` — 카나리 상태 / 트래픽 전환
- `src/app/admin/ops/deployments/page.tsx` — 배포 이력 / 롤백 UI
- `src/app/admin/ops/backups/page.tsx` — wal-g 백업 목록 / 복원 미리보기

**Phase 17 (Auth Core + Storage 확장)**:
- `src/app/admin/auth/users/page.tsx` — 사용자 CRUD (기존 확장)
- `src/app/admin/auth/providers/page.tsx` — OAuth Provider (Phase 18+ 활성)
- `src/app/admin/storage/buckets/page.tsx` — SeaweedFS 버킷 관리
- `src/app/admin/storage/b2-sync/page.tsx` — B2 오프로드 상태

### 6.2 기존 페이지 업그레이드 대상

- `src/app/admin/page.tsx` — 메트릭 요약 대시보드 (Recharts + SQLite metrics 조회)
- `src/app/admin/files/page.tsx` — SeaweedFS 통합 + File 모델 확장
- `src/app/admin/users/page.tsx` — Session/MFA 컬럼 추가

### 6.3 Phase 18+ 예정 (참고)

**Phase 18 (SQL + Table Editor)**:
- `/admin/database/tables` · `/admin/database/sql` (14c-α 기반 확장)

**Phase 19 (Edge + Realtime)**:
- `/admin/edge/[function]` · `/admin/realtime/channels`

**Phase 20 (Schema + DB Ops + Advisors)**:
- `/admin/database/{schema,policies,functions,triggers,advisors}`

**Phase 21 (Data API + UX Quality)**:
- `/admin/api/{keys,docs}` · `/admin/ai-usage`

---

## 7. 초기 DB 마이그레이션 목록

### 7.1 PostgreSQL (Prisma 7) — 19개 신규 마이그레이션

Wave 4 `02-data-model-erd.md §3` 기준. Phase 15-22에 걸쳐 순차 추가.

**Phase 15 (Auth Advanced — 6 마이그레이션)**:
1. `20260420_add_user_sessions` — Session 테이블 (Lucia 패턴, revokedAt + tokenFamily)
2. `20260421_add_totp_secrets` — TOTP 시드 (Vault 암호화 참조)
3. `20260422_add_webauthn_credentials` — Passkey 공개키
4. `20260423_add_backup_codes` — 백업 코드 해시
5. `20260424_add_rate_limit_events` — RL 카운터 테이블
6. `20260425_add_rate_limit_blocked` — 잠긴 계정 테이블

**Phase 16 (Observability — 3 마이그레이션)**:
7. `20260501_add_secret_items` — Vault 시크릿 (envelope 암호화)
8. `20260502_add_jwks_keys` — JWKS 키 메타 + kid
9. `20260503_add_audit_log_enhanced` — 관리자 감사 로그 확장

**Phase 17 (Auth Core + Storage — 3 마이그레이션)**:
10. `20260510_add_oauth_accounts` — Account linking (Phase 18 활성)
11. `20260511_extend_files_storage` — File 테이블에 SeaweedFS fid + b2_key + hot_until 컬럼
12. `20260512_add_upload_sessions` — 대용량 업로드 청크 추적

**Phase 18 (SQL + Table Editor — 2 마이그레이션)**:
13. `20260601_add_saved_queries` — SQL 저장 쿼리
14. `20260602_add_user_preferences` — ERD 레이아웃 / 테이블 설정 (DQ-3.4)

**Phase 19 (Edge + Realtime — 2 마이그레이션)**:
15. `20260610_add_edge_function_code` — Edge Fn 코드 + 런타임 메타
16. `20260611_add_realtime_subscriptions` — Channel 구독 관리

**Phase 20 (Schema + DB Ops + Advisors — 3 마이그레이션)**:
17. `20260620_add_cron_jobs` — CronJob + CronJobRun
18. `20260621_add_webhook_defs` — WebhookDef + WebhookDelivery
19. `20260622_add_advisor_findings` — Advisor 발견 기록

**Phase 21 (Data API + UX — 조건부)**:
- (옵션) `20260701_add_pg_graphql` — pg_graphql 확장 도입 시 (ADR-016 트리거 충족 필요)
- `20260702_add_ai_threads` — AiThread + AiMessage (DQ-AI-1)
- `20260703_add_pgmq_tables` — pgmq 확장 설치 + 큐 정의

### 7.2 SQLite (Drizzle) — 3개 신규 마이그레이션

**Phase 15**:
1. `20260420_add_webauthn_challenges` — WebAuthn Challenge TTL 60s
2. `20260421_add_mfa_enrollment_state` — 등록 중간 상태

**Phase 19**:
3. `20260610_add_edge_function_cache` — Edge Fn 실행 캐시

### 7.3 마이그레이션 실행 순서 원칙

1. **Phase 진입 시 한 번에 다중 마이그레이션**: Phase 15는 6개 PG 마이그레이션 + 2개 SQLite 마이그레이션을 동시 실행.
2. **점진적 롤아웃**: 각 마이그레이션은 개별 커밋 + PR. CI에서 squawk DDL 검사 통과 후 머지.
3. **Downtime 0 규칙**: 모든 마이그레이션은 online 가능 (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN NULLABLE` 우선). DROP은 2 Phase 전환 후 별도 정리.
4. **롤백 스크립트**: 각 마이그레이션에 대응하는 `down.sql` 작성 필수. Prisma `--create-only` + 수동 검토.

---

## 8. 초기 태스크 큐 (최초 20개)

개발 시작 시 즉시 실행할 태스크 순번.

```
[Phase 15 진입 전 — 우선 스파이크]

1. SP-010: WebAuthn 브라우저 호환 검증 (4h) — Chrome/Safari/FF에서 @simplewebauthn 등록/로그인
2. SP-011: otplib + QR 코드 생성 파이프라인 (2h) — QR 생성 → Authy/Google Authenticator 스캔 검증
3. SP-012: rate-limiter-flexible Prisma adapter 검증 (3h) — PG counter 동시성 테스트
4. SP-013: node:crypto envelope vs PG pgsodium 벤치 (4h) — 성능 + 보안 증거 (ADR-013 재확인)
5. SP-014: jose JWKS 3분 grace TTL 동작 검증 (2h) — kid 순환 / 기존 토큰 검증 유지
6. SP-015: PM2 cluster:4 + Session 공유 검증 (3h) — Session 테이블 기반 cluster 호환
7. SP-016: Capistrano-style 5초 롤백 dry-run (4h) — symlink 전환 + PM2 graceful reload

[Phase 15 착수 — Auth Advanced 22h]

8. 마이그레이션 1-6 실행 + 스키마 검증 (2h) — prisma migrate dev
9. TOTP 등록 페이지 `/admin/auth/mfa/totp` 구현 (3h) — QR + otplib + 6자리 확인
10. TOTP 검증 미들웨어 + 로그인 플로우 통합 (2h)
11. WebAuthn 등록 페이지 `/admin/auth/mfa/webauthn` (3h) — @simplewebauthn 등록
12. WebAuthn 로그인 플로우 + Conditional UI (3h, DQ-AA-9)
13. 백업 코드 발급 UI + 한 번만 표시 (2h, DQ-AA-10)
14. Rate Limit 미들웨어 + 로그인 경로 적용 (2h)
15. Rate Limit 대시보드 `/admin/auth/rate-limits` (2h)
16. Session 관리 UI `/admin/auth/sessions` (2h)
17. Cloudflare Turnstile 통합 (로그인 페이지 1h)
18. Playwright E2E: TOTP + WebAuthn + RL 전 플로우 (4h)
19. Phase 15 통합 테스트 + 커버리지 (2h)
20. Phase 15 완료 커밋 + 인수인계서 작성 (1h)
```

**총 예상**: 스파이크 22h + Phase 15 구현 28h + 테스트/문서 6h = **56h** (2-3주 1인 작업).

---

## 9. kdyswarm 병렬 개발 시나리오

Phase 15의 TOTP/WebAuthn/Rate Limit은 독립 모듈이므로 kdyswarm으로 3 트랙 병렬 가능.

### 9.1 Phase 15 병렬 DAG 구성

```
Tier 0 (순차): 마이그레이션 1-6 실행 + 공통 lib 스캐폴드 (2h)
    │
    ▼
Tier 1 (병렬 3 에이전트):
    ├── Agent-T (TOTP)         → /admin/auth/mfa/totp + lib/auth/totp.ts (5h)
    ├── Agent-W (WebAuthn)     → /admin/auth/mfa/webauthn + lib/auth/webauthn.ts (6h)
    └── Agent-R (Rate Limit)   → /admin/auth/rate-limits + lib/auth/rate-limit.ts (4h)
    │
    ▼
Tier 2 (통합): 로그인 페이지 MFA 분기 + Playwright E2E (6h)
    │
    ▼
Tier 3: Phase 15 완료 커밋 + 인수인계
```

### 9.2 kdyswarm 호출 명령

```bash
/kdyswarm --phase 15 \
  --agents "T:TOTP,W:WebAuthn,R:RateLimit" \
  --tier1-dependencies "migration-complete" \
  --tier2-integration "login-mfa-branching" \
  --max-parallel 3 \
  --worktree-isolation true
```

### 9.3 병렬 실행 시 주의

- **공통 파일 충돌 방지**: `src/app/(public)/login/page.tsx`는 Tier 2 통합 단계에서만 3 에이전트가 동시 수정. Tier 1에서는 각자 독립 파일만 편집.
- **DB 스키마**: Tier 0에서 6개 마이그레이션 전부 실행 → Tier 1에서는 스키마 변경 금지.
- **CI 병렬**: schemalint + squawk 병렬, playwright 순차.

### 9.4 Phase 18 (SQL + Table Editor) 병렬 시나리오

```
Tier 1 (병렬 4 에이전트):
    ├── Agent-S (SQL Monaco)    → src/components/editor/*
    ├── Agent-E (EXPLAIN d3)    → src/components/plan-visualizer/*
    ├── Agent-T (Table 14c-α 확장) → src/app/admin/database/tables/*
    └── Agent-F (FK Picker cmdk)   → src/components/data/foreign-key-picker.tsx
```

### 9.5 Phase 20 (Schema + DB Ops + Advisors) 병렬 시나리오

```
Tier 1 (병렬 3 에이전트):
    ├── Agent-V (Schema Viz)   → /admin/database/{schema,policies,functions,triggers}
    ├── Agent-D (DB Ops)       → /admin/ops/{cron,webhooks,backups}
    └── Agent-A (Advisors)     → /admin/database/advisors + lib/advisors/*
```

---

## 10. 후속 세션 명령 예시

다음 세션에서 바로 붙여넣기 가능한 명령 모음. 진행 단계별로 그룹화.

### 10.1 즉시 실행 가능 명령 (다음 세션 첫 시도)

```bash
# 1. 세션 시작 — 상태 확인
cat docs/research/2026-04-supabase-parity/_CHECKPOINT_KDYWAVE.md | head -40
cat docs/status/current.md | tail -40
cat docs/handover/next-dev-prompt.md

# 2. kdygenesis 실행 (권장: 시나리오 b 수동 검토 모드)
/kdygenesis --from-genesis ./docs/research/2026-04-supabase-parity/07-appendix/03-genesis-handoff.md --review

# 3. 우선 스파이크 실행 (개별)
/kdyspike --full "SP-010 WebAuthn 브라우저 호환 검증" --max-hours 4
/kdyspike --full "SP-011 otplib + QR 코드 파이프라인" --max-hours 2
/kdyspike --full "SP-012 rate-limiter-flexible Prisma adapter" --max-hours 3

# 4. 스파이크 일괄 실행 (kdyswarm)
/kdyswarm --phase "spike-set-phase-15" \
  --agents "SP10,SP11,SP12,SP13,SP14,SP15,SP16" \
  --max-parallel 4

# 5. Phase 15 본격 착수
/kdywave --resume --phase 15
/kdyswarm --phase 15 --agents "T:TOTP,W:WebAuthn,R:RateLimit" --max-parallel 3

# 6. DB 마이그레이션
cd /mnt/e/00_develop/260406_luckystyle4u_server
nvm use
pnpm install
pnpm prisma migrate dev --name phase15-auth-advanced

# 7. 세션 종료
/cs
```

### 10.2 정기 운영 명령

```bash
# ADR 재검토 트리거 체크 (월간)
/kdyinvestigate "Wave 5 ADR 재검토 트리거 45건 현황 점검"

# DQ 남은 장기 열린 질문 리뷰 (분기별)
/kdywave --review-long-open-dq

# pg_graphql 도입 조건 연 1회 리뷰 (매년 4월)
/kdywave --annual-review ADR-016

# Advisors 3-Layer 스캔 (주간)
/kdyinvestigate "splinter TS 포팅 38룰 결과 리뷰"

# AI 비용 감시 (월간)
/kdyllmcost --check --adr 014
```

### 10.3 긴급 대응 명령

```bash
# 배포 롤백 (5초 SLA)
bash scripts/capistrano-rollback.sh

# Vault 키 회전 (긴급)
/kdyrunbook "vault-emergency-rotation"

# 세션 전체 무효화
/kdyinvestigate "긴급 JWKS 회전 + refresh_token session 버전 증가"

# SeaweedFS 장애
/kdyinvestigate "SeaweedFS restart failure 발생"
```

### 10.4 리팩토링 / 업그레이드 명령

```bash
# Node 26 LTS 릴리스 후 (2027 예상)
/kdywave --adr-review 006,015 "Node 26 LTS 이행 평가"

# PG 18 릴리스 후 (2026-Q4 예상)
/kdyspike --full "SP-027 PG 17→18 마이그레이션 영향 평가" --max-hours 8

# bcrypt → argon2id 마이그레이션 (Phase 17)
/kdyswarm --phase "argon2-migration" --agents "M:Migration,V:Validation"
```

---

## 11. CLAUDE.md 업데이트 제안

Wave 5 완료를 반영하기 위해 프로젝트 루트 `CLAUDE.md`에 추가할 섹션 초안. 기존 `CLAUDE.md 관리 규칙 (이 섹션 삭제 금지)` 바로 다음에 삽입 권장.

```markdown
## 프로젝트 상태 (Wave 5 완료 — 2026-04-18)

### Wave 리서치 상태
- **Wave 1-5 완료**: 98+ 문서 / 86,460+줄 / `docs/research/2026-04-supabase-parity/`
- **ADR 18건 누적**: `docs/research/2026-04-supabase-parity/02-architecture/01-adr-log.md`
- **DQ 74건 전수 답변**: `docs/research/2026-04-supabase-parity/07-appendix/02-dq-final-resolution.md`
- **재검토 트리거 45건**: 프로덕션 운영 중 자동 감시 필요

### 다음 실행 단계
- **Phase 15 (Auth Advanced, 22h)** 즉시 착수 가능. Blueprint `03-auth-advanced-blueprint.md`.
- **우선 스파이크 7건**: SP-010 ~ SP-016 (총 22h 스파이크). Phase 15 진입 전 수행.
- **병렬 개발 활용**: kdyswarm으로 TOTP/WebAuthn/RL 3 트랙 동시 진행.

### 핵심 아키텍처 결정 (Wave 4 ADR-018 및 Wave 5 재확인)

#### 9-레이어 구조 (상향 의존 금지, 같은 레이어 수평 허용, 스킵 의존 허용)
- L0 인프라 → L1 관측/운영 → L2 Auth Core/Vault → L3 Auth Advanced → L4 저장 → L5 Compute → L6 Dev Tools → L7 Data API → L8 UX

#### 거부된 기술 (재검토 조건 명시)
- **AWS/GCP 관리형 서비스**: 월 $10 한도 (AP-5) 위배
- **Kubernetes**: 1인 운영 (AP-1) 위배
- **Docker Compose (8+ 컨테이너)**: Supabase Self-Hosted 실패 지점
- **MinIO**: 2026-02-12 AGPL 전환 (CON-11 위배)
- **LangChain**: AI SDK v6 대비 33% 무거움
- **pg_cron**: Node 핸들러 80% 비중 / SUPERUSER 요구
- **BullMQ + Redis**: 1인 운영 부담 + PG 트랜잭션 일관성 상실
- **pgsodium**: SUPERUSER + Prisma 비호환
- **AG Grid**: $999 상용 라이선스 (CON-7)
- **Prisma Studio / drizzle-kit Studio 임베드**: INTEG/SEC -2.5

#### 채택된 핵심 기술
- **Next.js 16 App Router + Server Components** (RPC-less)
- **PostgreSQL 17 + Prisma 7** (트랜잭션) / **SQLite + Drizzle** (관측)
- **SeaweedFS + B2 오프로드** (Storage)
- **isolated-vm v6 + Deno + Sandbox** 3층 하이브리드 (Edge Fn)
- **wal2json + supabase-realtime 포팅** 2계층 (Realtime)
- **jose JWT ES256 + Lucia/Auth.js 패턴 15개 차용** (Auth Core)
- **TOTP + WebAuthn + Rate Limit** 동시 (Auth Advanced)
- **node:crypto AES-256-GCM envelope** (Vault)
- **PM2 cluster:4 + Capistrano-style symlink** (Operations)

### 월 $10 이하 운영 비용 (NFR-COST)
- 도메인 $1/월 + B2 백업 $0.3/월 + AI BYOK $2.5/월 + 전기세 = **~$4/월** (여유 $6)

### 재검토 트리거 감시 대상 (상시)
- **ADR-008**: SeaweedFS restart >1/week → Garage 백업안 전환
- **ADR-014**: AI 비용 >$8/월 2개월 → LangChain/모델 재평가
- **ADR-015**: 월간 트래픽 >100만 → Docker/K8s 검토
- **ADR-016**: pg_graphql 4 수요 트리거 중 2+ → 도입
- **ADR-001**: 사용자 2명+ 6개월 지속 → Multi-tenancy 재검토

### Wave 5 이후 권장 명령 순서
```bash
# 1. 우선 스파이크 수행
/kdyspike --full "SP-010 WebAuthn 검증"  # 7건 순차 또는 kdyswarm 병렬

# 2. kdygenesis로 스캐폴드
/kdygenesis --from-genesis ./docs/research/2026-04-supabase-parity/07-appendix/03-genesis-handoff.md

# 3. Phase 15 착수
/kdyswarm --phase 15 --agents "T:TOTP,W:WebAuthn,R:RateLimit"
```
```

---

## 12. 인수인계서 초안

`docs/handover/` 에 "Wave 5 완료 → Phase 15 시작" 인수인계서 초안. 파일명 예: `2026-04-18-wave5-to-phase15.md`.

```markdown
# 인수인계서: Wave 5 완료 → Phase 15 착수

> 작성일: 2026-04-18
> 세션: 28+ (kdywave Wave 5 완료)
> 다음 세션 담당: kdygenesis + 실구현

---

## 세션 요약

### 완료된 작업 (세션 28+)
- Wave 5 Tier 1 (5 에이전트 병렬): 05-roadmap 6 문서 + 06-prototyping 5 스파이크 문서
- Wave 5 Tier 2 (A1): 07-appendix 3 문서 (용어집 200+ / DQ 74 / genesis handoff)
- ADR Log 최종 형태 확정 (18건, 재검토 트리거 45건)
- DQ 74건 전수 답변 완료 (폐기 4건 포함)

### 누적 성과
- 총 문서: **~111** (Wave 1+2+3+4+5)
- 총 줄 수: **~95,000+**
- 에이전트 실행: 30+ 라운드
- 역방향 피드백: 0건 (채택안 전부 Wave를 거듭하며 강화 확인)
- 공수 추정: Phase 15-22 = **~870h** (Wave 3 992h preview 대비 -12% 정밀화)
- 3년 TCO 절감: **$950~2,150** (Supabase Cloud 대비)

---

## 다음 세션 시작 체크리스트

### 필수 확인
- [ ] `docs/research/2026-04-supabase-parity/README.md` 상단 진행 상태 대시보드 확인
- [ ] `docs/research/2026-04-supabase-parity/07-appendix/03-genesis-handoff.md` 전체 정독
- [ ] `docs/handover/next-dev-prompt.md` 확인
- [ ] ADR 18건 중 Phase 15 해당 항목 확인 (ADR-007 Auth Advanced)

### 실행 순서
1. **스파이크 먼저**: SP-010 ~ SP-016 (7건, 22h)
   - kdyswarm 병렬 실행 권장 (`--max-parallel 4`)
2. **kdygenesis 실행**: 시나리오 b(수동 검토) 권장
   ```bash
   /kdygenesis --from-genesis ./docs/research/2026-04-supabase-parity/07-appendix/03-genesis-handoff.md --review
   ```
3. **Phase 15 착수**: Auth Advanced 22h WBS 12 태스크
   - Blueprint `03-auth-advanced-blueprint.md §7 WBS` 참조
4. **kdyswarm 병렬**: TOTP / WebAuthn / RateLimit 3 트랙

---

## 주의 사항

### 증분 개선 모드 강제
- kdygenesis가 "새 프로젝트 모드"로 동작하지 않도록 **`--mode incremental` 플래그 명시**.
- 기존 Prisma 10 테이블 / SQLite 3 테이블 / Next.js 라우트 **절대 삭제 금지**.

### 보안 주의
- Phase 15 구현 중 MASTER_KEY 파일 (`/etc/luckystyle4u/secrets.env`) 생성 확인
- bcrypt → argon2id 전환은 Phase 17로 연기 (DQ-AC-1 최종 답변 참조)
- Cloudflare Turnstile 사이트 키/시크릿 사전 발급 (로그인 페이지 필수)

### 운영 주의
- Phase 15 완료 후 PM2 cluster:4 설정 갱신 필요 (cron-worker 별도 fork 앱)
- 세션 테이블은 현재 SQLite → Phase 16~17 PG 전환 고려 (DQ-AC-2 참조)
- canary.stylelucky4u.com 서브도메인 설정 (Phase 16 전 Cloudflare DNS 등록)

---

## 열린 질문 (Long-Open DQ)

Wave 5 이후 답변 불가능한 항목들. 프로덕션 운영 중 지속 관찰:

- OQ-1 (SeaweedFS 50GB 장기 안정성) — 6개월 운영 후
- OQ-2 (wal-g 100GB 실 복원 시간) — 첫 실제 백업 후
- OQ-5 (PG 18 Prisma 7 공식 호환) — Prisma 팀 로드맵
- OQ-9 (B2B SaaS 전환) — 장기 비즈니스 결정
- OQ-12 (pg_graphql 도입 조건 2+ 충족) — 연 1회 4월 정기 리뷰

---

## 문서 포인터

- **체크포인트**: `docs/research/2026-04-supabase-parity/_CHECKPOINT_KDYWAVE.md`
- **마스터 인덱스**: `docs/research/2026-04-supabase-parity/README.md`
- **최우선 읽기**: `07-appendix/03-genesis-handoff.md` (이 문서의 상위)
- **다음 실행 스파이크**: `06-prototyping/spike-005 ~ 010`
- **Phase 15 WBS**: `02-architecture/03-auth-advanced-blueprint.md §7`

---

## 서명

- **작성자**: kdywave W5-A1 (Opus 4.7 1M)
- **검토자**: 프로젝트 오너 (김도영)
- **승인**: 2026-04-18

> 이 인수인계서로 Wave 5 리서치 단계가 공식 종료된다. 다음 세션부터는 **실구현**이다.
```

---

## 부록: Genesis 태스크 요약

본 문서 작성 결과 **총 초기 태스크 항목 수**:

```
§6 신규 페이지 스캐폴드:     16개 (Phase 15-17)
§6 기존 페이지 업그레이드:    3개
§7 PG 마이그레이션:         19개 (신규)
§7 SQLite 마이그레이션:      3개 (신규)
§8 초기 태스크 큐:          20개 (스파이크 7 + Phase 15 구현 13)
§9 kdyswarm 병렬 시나리오:   4개 (Phase 15 + 18 + 20 + argon2)
§10 후속 명령 예시:          30+ 개
────────────────────────────────
Genesis 직접 실행 대상 태스크: 85+ 항목
```

---

> **Genesis Handoff 문서 끝**. Wave 5 · A1 · 2026-04-18 · 양평 부엌 서버 대시보드 — kdywave 완료, kdygenesis로 인계 준비 완료.
>
> **다음 스킬**: `/kdygenesis --from-genesis ./docs/research/2026-04-supabase-parity/07-appendix/03-genesis-handoff.md --review`
