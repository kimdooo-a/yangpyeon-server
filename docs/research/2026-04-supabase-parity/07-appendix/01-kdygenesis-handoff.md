# 01. kdygenesis 인수인계 — Phase 15 즉시 착수 청사진

> ⚠️ **ADR-015 부분 대체 통지 (2026-04-25, 세션 51)**: 본 문서가 참조하는 *Capistrano-style symlink/releases* 배포 메커니즘은 [ADR-020](../02-architecture/01-adr-log.md) (Next.js standalone + rsync + pm2 reload, 세션 50)에 의해 부분 대체. PM2 cluster:4 / canary 서브도메인은 유효. 4 재진입 트리거(트래픽 100만+/팀 2명+/3환경/B2B) 충족 시 Capistrano 경로 재가동 가능.
> ⚠️ **ADR 번호 placeholder 충돌 정정 (2026-04-25)**: 본 문서 §6.1의 "ADR-020 후보(PM2 cluster:4 + cron-worker fork 분리)"는 실제 ADR-020(standalone+rsync+pm2 reload, 세션 50)과 충돌. PM2 cluster vs cron-worker 분리 후보는 향후 **ADR-021** 슬롯으로 재할당 권장.

> **Wave 5 · A1 (Tier 2) 산출물**
> 작성일: 2026-04-18 (세션 28, kdywave Wave 5 A1 Agent — sonnet)
> 상위: [CLAUDE.md](../../../../CLAUDE.md) → [docs/research/](../../) → [2026-04-supabase-parity/](../) → [07-appendix/](./) → **이 문서**
> 연관:
> - [../05-roadmap/00-release-plan.md](../05-roadmap/00-release-plan.md) — 3릴리스 계획
> - [../05-roadmap/01-milestones-wbs.md](../05-roadmap/01-milestones-wbs.md) — M1~M8 / 870~874h
> - [../06-prototyping/spike-009-totp-webauthn-mvp.md](../06-prototyping/spike-009-totp-webauthn-mvp.md) — Phase 15 직전 스파이크
> - [../02-architecture/01-adr-log.md](../02-architecture/01-adr-log.md) — ADR 18건

---

## 개요

본 문서는 **kdywave Wave 1~5 종합 연구 결과물을 기반으로 kdygenesis가 즉시 실행 가능한 Phase 15 착수 청사진**이다. 양평 부엌 서버 대시보드는 이미 존재하므로 신규 프로젝트가 아니라 "**Phase 15 시작용 git worktree + 스캐폴딩**" 형태로 매핑한다.

---

## 1. kdywave 산출물 → kdygenesis 입력 매핑표

| kdywave 산출물 | kdygenesis 입력 필드 | 매핑 방식 | 신뢰도 |
|--------------|-------------------|----------|--------|
| Wave 1-2 카테고리별 1위 채택안 | 기술 스택(tech_stack) | 1위 직접 반영 (Wave 1 점수 최고점 채택안) | 95% |
| Wave 4 Blueprint 14건 (9-레이어) | 디렉토리 구조(directory_structure) | L1~L9 레이어 → src/ 하위 폴더 매핑 | 90% |
| Wave 4 `02-data-model-erd.md` | 초기 마이그레이션(migrations) | Prisma schema 직접 변환 가능 | 95% |
| Wave 3 `02-functional-requirements.md` | 백로그(backlog) | FR ID → kdygenesis 태스크 형식 | 85% |
| Wave 5 `00-release-plan.md` | 릴리스 계획(release_plan) | v0.1.0/v0.2.0/v1.0.0 3단계 직접 매핑 | 95% |
| Wave 5 `01-milestones-wbs.md` | 마일스톤(milestones) | M1~M8, Phase 15~22, 870~874h | 95% |
| Wave 5 `spike-005~010` 5건 | 사전 스파이크(pre_spikes) | kdyspike 명령어 연계 | 90% |
| Wave 5 `02-tech-debt-strategy.md` | 기술부채 레지스트리(tech_debt) | TD-001~022 직접 참조 | 90% |
| Wave 5 `03-risk-register.md` | 리스크 레지스터(risk_register) | R-001~035 직접 참조 | 90% |
| Wave 4 `01-adr-log.md` (ADR 18건) | 의사결정 로그(decisions) | ADR 형식 → kdygenesis decisions 섹션 | 95% |
| Wave 3 NFR 38건 | 성능 기준(performance_targets) | NFR-PERF/SEC/OPS → 수치 직접 반영 | 85% |
| Wave 5 `07-success-metrics-kpi.md` | KPI(success_metrics) | 127개 KPI → Phase별 목표 수치 | 80% |

---

## 2. `_PROJECT_GENESIS.md` 초안 — Phase 15 착수용

```markdown
# 양평 부엌 서버 대시보드 — Phase 15 (Auth Advanced) 제네시스

> 문서 유형: kdygenesis 입력 (_PROJECT_GENESIS.md)
> 기반: kdywave Wave 1-5 종합 연구 (2026-04-18, 123 문서 / 106,588줄)
> 목적: git worktree phase-15-auth-advanced 생성 + 스캐폴딩
> 최종 갱신: 2026-04-18

---

## 기술 스택 (Wave 1-4 확정, 변경 금지)

| 레이어 | 기술 | 버전 | Wave 결정 |
|--------|------|------|----------|
| 프레임워크 | Next.js (App Router) | 16.x | Wave 1 확정 |
| 언어 | TypeScript | 5.5+ | 프로젝트 시작 시 |
| ORM / DB | Prisma | 7.x | Wave 1 확정 |
| 주 DB | PostgreSQL | 17 | Wave 1 확정 |
| 보조 DB | SQLite + Drizzle | 최신 | Wave 1 확정 |
| 인증 코어 | jose JWT + Lucia 패턴 | jose^5 | ADR-006 |
| 인증 고급 (신규) | otplib@12 + SimpleWebAuthn@10 + rate-limiter-flexible@5 | 명시 버전 | ADR-007 |
| Vault | node:crypto AES-256-GCM envelope | Node 내장 | ADR-013 |
| 스타일링 | Tailwind CSS | 4.x | 프로젝트 시작 시 |
| UI 컴포넌트 | shadcn/ui | 최신 | spike-004 |
| 차트 | Recharts | 최신 | Wave 4 Tier 3 |
| 테이블 | TanStack Table v8 | 8.x | ADR-002 |
| 알림 | Sonner | 최신 | Wave 4 Tier 3 |
| 프로세스 관리 | PM2 | 최신 | 프로젝트 시작 시 |
| 터널 | Cloudflare Tunnel (cloudflared) | 최신 | 프로젝트 시작 시 |

> Phase 17 이후 추가 예정: SeaweedFS, isolated-vm v6, Deno embed, wal2json, pgmq

---

## Phase 15 신규 의존성

```bash
# Phase 15 필수 (npm install)
npm install otplib@12
npm install @simplewebauthn/server@10 @simplewebauthn/browser@10
npm install rate-limiter-flexible@5
npm install qrcode qrcode-terminal  # TOTP QR 생성

# Phase 15 devDependency
npm install -D @types/qrcode
```

---

## Phase 15 디렉토리 신규/확장

```
src/
├── lib/
│   └── auth/
│       └── advanced/                    ← 신규 (Phase 15 핵심)
│           ├── TOTPService.ts           ← otplib 래퍼 (1h)
│           ├── WebAuthnService.ts       ← SimpleWebAuthn 래퍼 (2h)
│           ├── RateLimitService.ts      ← rate-limiter-flexible 래퍼 (1h)
│           ├── BackupCodeService.ts     ← bcrypt 기반 8개 코드 (1h)
│           ├── MFAOrchestrator.ts       ← TOTP/WebAuthn 통합 흐름 (2h)
│           └── index.ts                ← 공개 API
├── app/
│   ├── api/
│   │   └── v1/
│   │       └── auth/
│   │           └── mfa/                ← 신규 API 라우트 디렉토리
│   │               ├── totp/
│   │               │   ├── enroll/route.ts      ← TOTP 등록 (1h)
│   │               │   └── verify/route.ts      ← TOTP 검증 (0.5h)
│   │               ├── webauthn/
│   │               │   ├── register/
│   │               │   │   ├── options/route.ts ← 등록 옵션 생성 (1h)
│   │               │   │   └── verify/route.ts  ← 등록 검증 (1h)
│   │               │   └── authenticate/
│   │               │       ├── options/route.ts ← 인증 옵션 생성 (1h)
│   │               │       └── verify/route.ts  ← 인증 검증 (1h)
│   │               ├── backup-codes/
│   │               │   ├── generate/route.ts    ← 백업 코드 생성 (0.5h)
│   │               │   └── verify/route.ts      ← 백업 코드 검증 (0.5h)
│   │               └── status/route.ts          ← MFA 현황 조회 (0.5h)
│   └── (dashboard)/
│       └── settings/
│           └── security/
│               └── mfa/                ← 신규 UI 라우트
│                   ├── page.tsx        ← MFA 설정 메인 (2h)
│                   ├── TOTPSetup.tsx   ← TOTP 등록 UI (2h)
│                   ├── WebAuthnSetup.tsx ← 패스키 등록 UI (2h)
│                   └── BackupCodes.tsx ← 백업 코드 UI (1h)
prisma/
└── migrations/
    └── 20260418000001_phase_15_auth_advanced/
        └── migration.sql               ← 5개 테이블/컬럼 (1h)
```

---

## Phase 15 Prisma 마이그레이션 (신규 5개)

```sql
-- 1. TOTP Secret 테이블
CREATE TABLE "TOTPSecret" (
  "id"        TEXT NOT NULL PRIMARY KEY,
  "userId"    TEXT NOT NULL UNIQUE REFERENCES "User"("id") ON DELETE CASCADE,
  "secret"    TEXT NOT NULL,               -- base32 암호화 저장
  "verified"  BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

-- 2. WebAuthn Credential 테이블
CREATE TABLE "WebAuthnCredential" (
  "id"              TEXT NOT NULL PRIMARY KEY,
  "userId"          TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "credentialId"    TEXT NOT NULL UNIQUE,  -- base64url
  "publicKey"       TEXT NOT NULL,         -- COSE 공개키
  "counter"         INTEGER NOT NULL DEFAULT 0,
  "transports"      TEXT[],                -- ["internal","hybrid"] etc.
  "deviceType"      TEXT,                  -- "multiDevice" | "singleDevice"
  "backedUp"        BOOLEAN NOT NULL DEFAULT false,
  "name"            TEXT,                  -- 사용자 지정 장치명
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt"      TIMESTAMP(3)
);

-- 3. Rate Limit Event 테이블
CREATE TABLE "RateLimitEvent" (
  "id"         TEXT NOT NULL PRIMARY KEY,
  "key"        TEXT NOT NULL,              -- "login:userId" or "ip:x.x.x.x"
  "points"     INTEGER NOT NULL DEFAULT 0,
  "expire"     TIMESTAMP(3),
  "updatedAt"  TIMESTAMP(3) NOT NULL
);
CREATE INDEX "RateLimitEvent_key_idx" ON "RateLimitEvent"("key");
CREATE INDEX "RateLimitEvent_expire_idx" ON "RateLimitEvent"("expire");

-- 4. MFA Challenge (WebAuthn 챌린지 임시 저장)
CREATE TABLE "MFAChallenge" (
  "id"        TEXT NOT NULL PRIMARY KEY,
  "userId"    TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "type"      TEXT NOT NULL,              -- "webauthn-register" | "webauthn-auth"
  "challenge" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "MFAChallenge_userId_idx" ON "MFAChallenge"("userId");

-- 5. User 테이블 확장 (백업 코드 + MFA 상태)
ALTER TABLE "User"
  ADD COLUMN "mfaEnabled"   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "mfaType"      TEXT,          -- "totp" | "webauthn" | "both"
  ADD COLUMN "backupCodes"  TEXT[],        -- bcrypt 해시 8개
  ADD COLUMN "backupCodesGeneratedAt" TIMESTAMP(3);
```

---

## Phase 15 백로그 (FR 21건 → 태스크 매핑)

### Phase 15-A: TOTP MFA (4h) — Day 1

| FR ID | 태스크 | 공수 | 파일 |
|-------|--------|------|------|
| FR-6.1.1 | otplib@12 설치 + base32 secret 생성 모듈 | 1h | `src/lib/auth/advanced/TOTPService.ts` |
| FR-6.1.2 | QR 코드 UI + Authenticator 앱 등록 흐름 | 2h | `src/components/auth/TOTPEnrollModal.tsx` |
| FR-6.1.3 | TOTP 검증 API (window:1, ±30초 drift) | 1h | `src/app/api/v1/auth/mfa/totp/verify/route.ts` |

### Phase 15-B: WebAuthn 패스키 (8h) — Day 2-3

| FR ID | 태스크 | 공수 | 파일 |
|-------|--------|------|------|
| FR-6.2.1 | SimpleWebAuthn@10 서버 SDK 설치 + 초기화 | 1h | `src/lib/auth/advanced/WebAuthnService.ts` |
| FR-6.2.2 | 패스키 등록 옵션 생성 API | 1h | `.../webauthn/register/options/route.ts` |
| FR-6.2.3 | 패스키 등록 검증 API + DB 저장 | 2h | `.../webauthn/register/verify/route.ts` |
| FR-6.2.4 | 패스키 인증 옵션 생성 API | 1h | `.../webauthn/authenticate/options/route.ts` |
| FR-6.2.5 | 패스키 인증 검증 API + counter 업데이트 | 1h | `.../webauthn/authenticate/verify/route.ts` |
| FR-6.2.6 | Conditional UI (autocomplete="webauthn") | 1h | `src/app/(dashboard)/settings/security/mfa/WebAuthnSetup.tsx` |
| FR-6.2.7 | 장치 목록 UI + 장치 삭제 | 1h | 동일 파일 |

### Phase 15-C: Rate Limit (6h) — Day 4

| FR ID | 태스크 | 공수 | 파일 |
|-------|--------|------|------|
| FR-6.3.1 | rate-limiter-flexible@5 + PostgreSQL 어댑터 설정 | 2h | `src/lib/auth/advanced/RateLimitService.ts` |
| FR-6.3.2 | 로그인 Rate Limit 미들웨어 (5회/15분, 계정 잠금) | 2h | `src/middleware.ts` 확장 |
| FR-6.3.3 | IP 기반 Rate Limit (글로벌 100회/분) | 1h | 동일 미들웨어 |
| FR-6.3.4 | Rate Limit 초과 UI 메시지 + 재시도 타이머 | 1h | `src/components/auth/RateLimitBanner.tsx` |

### Phase 15-D: 백업 코드 (4h) — Day 5

| FR ID | 태스크 | 공수 | 파일 |
|-------|--------|------|------|
| FR-6.4.1 | 8개 백업 코드 생성 + bcrypt 해시 저장 | 2h | `src/lib/auth/advanced/BackupCodeService.ts` |
| FR-6.4.2 | 백업 코드 UI (표시 + 재생성 + 사용 이력) | 2h | `src/app/(dashboard)/settings/security/mfa/BackupCodes.tsx` |

### Phase 15 완료 기준 (Exit Gate)

- [ ] TOTP 등록→검증 E2E PASS (Google Authenticator 기준)
- [ ] WebAuthn 등록→인증 E2E PASS (Chrome 패스키 기준)
- [ ] Rate Limit 5회 초과 → 계정 잠금 15분 PASS
- [ ] 백업 코드 8개 생성 → 1개 사용 → 잔여 7개 확인 PASS
- [ ] MFA 비활성화 시 백업 코드 무효화 PASS
- [ ] p95 < 200ms (MFA 검증 API 기준)
- [ ] 마이그레이션 롤백 dry-run PASS

---

## 3. Phase 16~22 후속 제네시스 (요약)

### Phase 16 — Observability + Operations (40h)

**신규 디렉토리**:
```
src/lib/vault/                     ← AES-256-GCM envelope 구현
src/lib/jwks/                      ← jose JWKS 엔드포인트
scripts/deploy/                    ← Capistrano-style symlink 스크립트
scripts/canary/                    ← canary 배포 자동화
```

**신규 의존성**: 추가 없음 (jose, node:crypto 내장)

**신규 마이그레이션**:
```sql
CREATE TABLE "VaultSecret" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL UNIQUE,
  "encryptedValue" TEXT NOT NULL,  -- AES-256-GCM + KEK
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
```

**사전 스파이크**: 없음 (argon2 WSL2 빌드만 조건부, spike-011 후보)

**완료 기준**:
- [ ] Vault AES-256-GCM 암호화·복호화 단위 테스트 PASS
- [ ] JWKS 엔드포인트 `/.well-known/jwks.json` 응답 확인
- [ ] Capistrano symlink swap dry-run (5초 롤백 측정)
- [ ] PM2 cluster:4 포트 3000 기동 확인
- [ ] canary.stylelucky4u.com 포트 3002 분리 확인

---

### Phase 17 — Auth Core (30h) + Storage (30h) = 60h

**신규 디렉토리**:
```
src/lib/auth/session/              ← Session 테이블 + 디바이스 관리
src/lib/storage/                   ← SeaweedFS 클라이언트
src/lib/storage/b2/                ← B2 오프로드 클라이언트
```

**신규 의존성**:
```bash
npm install @aws-sdk/client-s3     # SeaweedFS + B2 SigV4 호환
npm install multer                 # 파일 업로드 미들웨어
```

**신규 마이그레이션**:
```sql
CREATE TABLE "Session" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "token" TEXT NOT NULL UNIQUE,
  "deviceName" TEXT,
  "deviceFingerprint" TEXT,
  "ipAddress" TEXT,
  "lastActiveAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_token_idx" ON "Session"("token");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
```

**사전 스파이크**: spike-007-seaweedfs-50gb (12h, Phase 17 Entry Gate)

---

### Phase 18 — SQL Editor + Table Editor (400h)

**신규 디렉토리**:
```
src/lib/sql/                       ← SQL 파서, EXPLAIN 분석기
src/components/editor/sql/         ← Monaco 기반 SQL Editor 컴포넌트
src/components/editor/table/       ← TanStack v8 Table Editor 컴포넌트
src/app/(dashboard)/editor/        ← 에디터 라우트
```

**신규 의존성**:
```bash
npm install @monaco-editor/react
npm install @tanstack/react-table@8
npm install @tanstack/react-virtual
npm install sql-formatter           # SQL 포맷터
```

**신규 마이그레이션**:
```sql
CREATE TABLE "SavedQuery" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "sql" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
```

**사전 스파이크**: 없음 (Monaco + TanStack spike-004에서 확인 완료)

**주의**: Phase 18은 전체 공수의 46%(400/870h). kdyswarm 5-에이전트 병렬 권장 (14c/14d/14e/14f/Table Editor 분할).

---

### Phase 19 — Edge Functions + Realtime (75h)

**신규 디렉토리**:
```
src/lib/edge/                      ← Edge Fn 3층 아키텍처
src/lib/edge/l1-isolated-vm/       ← isolated-vm v6 래퍼
src/lib/edge/l2-deno/              ← Deno 사이드카 IPC 클라이언트
src/lib/realtime/                  ← wal2json CDC 리스너
src/lib/realtime/channels/         ← supabase-realtime 포팅 채널 관리
```

**신규 의존성**:
```bash
npm install isolated-vm@6          # 버전 정확히 고정 필수 (TD-007)
# Deno sidecar: 별도 deno 바이너리 설치 (WSL2 내)
```

**사전 스파이크**:
- spike-005-edge-functions-deep (16h, Phase 19 Entry Gate 필수)
- spike-008-wal2json-pg-version-matrix (8h, Phase 19 Entry Gate 필수)

---

### Phase 20 — Schema Viz + DB Ops + Advisors (198h)

**신규 디렉토리**:
```
src/lib/schema-viz/                ← Prisma DMMF → xyflow 변환기
src/lib/db-ops/                    ← wal-g 백업 스크립트 래퍼
src/lib/advisors/                  ← 3-Layer Advisor 엔진
src/lib/advisors/schemalint/       ← schemalint 래퍼
src/lib/advisors/squawk/           ← squawk DDL 검사기
src/lib/advisors/splinter/         ← 38룰 Node.js 포팅
```

**신규 의존성**:
```bash
npm install @xyflow/react           # Schema Visualizer
npm install elkjs                   # 자동 레이아웃
npm install schemalint              # Advisors L1
npm install squawk-cli              # Advisors L2 (global or project)
```

**사전 스파이크**: TD-016 해소(splinter 38룰 포팅 완성도 검증) 先

---

### Phase 21 — Data API + UX Quality (40h)

**신규 디렉토리**:
```
src/lib/data-api/                  ← REST 자동생성 (DMMF 기반)
src/lib/queue/                     ← pgmq 워커
src/lib/ai/                        ← AI SDK v6 래퍼
src/app/(dashboard)/assistant/     ← Studio Assistant UI
```

**신규 의존성**:
```bash
npm install ai                      # Vercel AI SDK v6
npm install @anthropic-ai/sdk       # Anthropic BYOK
```

---

### Phase 22 — 보너스 100점 완성 (~30h)

**조건부 태스크** (수요 트리거 충족 시만 실행):

| 트리거 | 태스크 | 공수 |
|--------|--------|------|
| pg_graphql 수요 트리거 2+ 충족 | pg_graphql 도입 + GraphQL 엔드포인트 | 15h |
| OAuth 요청 | Naver/Kakao OAuth (PKCE) | 8h |
| 100점 미달 카테고리 보완 | 잔여 갭 처리 | ~7h |

---

## 4. kdygenesis 실행 예시

### 4.1 Phase 15 worktree 생성

```bash
# 현재 브랜치: main (양평 대시보드 기존 코드)
# Phase 15용 git worktree 생성
git worktree add ../yangpyeong-phase-15-auth-advanced -b phase-15-auth-advanced

# worktree 진입 (VS Code 별도 창으로 열기)
code ../yangpyeong-phase-15-auth-advanced
```

### 4.2 Phase 15 청사진 기반 스캐폴딩

```bash
# kdygenesis로 Phase 15 스캐폴딩 (worktree 내에서 실행)
/kdygenesis "phase-15-auth-advanced" \
  --from-genesis ./docs/research/2026-04-supabase-parity/07-appendix/01-kdygenesis-handoff.md \
  --phase 15 \
  --worktree

# 또는 단축형
/kdygenesis --from-genesis 07-appendix/01-kdygenesis-handoff.md --phase 15
```

### 4.3 사전 스파이크 실행 (Phase 15 직전 권장)

```bash
# spike-009: TOTP + WebAuthn MVP 검증 (8h, Phase 15 Entry Gate 권장)
/kdyspike --full totp-webauthn-mvp \
  --max-hours 8 \
  --input 06-prototyping/spike-009-totp-webauthn-mvp.md

# 결과 기록 위치
# docs/research/2026-04-supabase-parity/06-prototyping/spike-009-result.md
```

### 4.4 Phase 15 착수 (executing-plans)

```bash
# Wave 5 WBS 기반 Phase 15 실행
/superpowers:executing-plans \
  05-roadmap/01-milestones-wbs.md#phase-15-auth-advanced-22h

# 또는 Phase별 순차 실행
/superpowers:executing-plans \
  05-roadmap/01-milestones-wbs.md \
  --phase 15 --milestone M1
```

### 4.5 TD-019 + TD-022 우선 해소 (Phase 15 착수 전 5h)

```bash
# Phase 15 착수 전 고심각도 부채 우선 해소 (R2 권고)
# TD-019: MASTER_KEY 백업 절차서 (3h)
/kdyrunbook "master-key-backup-procedure" \
  --output docs/guides/master-key-backup.md

# TD-022: CVE 추적 자동화 (2h)
# npm audit CI 설정 + GitHub Dependabot 활성화
```

---

## 5. kdyswarm 병렬 실행 가이드

### 5.1 Phase 18 (SQL + Table Editor, 400h) — 5 에이전트 병렬

Phase 18은 전체 공수의 46%를 차지. 단일 에이전트 순차 실행 시 병목. **5개 에이전트로 분할 병렬** 권장.

```
/kdyswarm --agents 5 --phase 18 "SQL Editor + Table Editor 병렬 구현"

Agent 분할:
├── Agent 14c-α: Monaco 기본 SQL Editor + 읽기전용 모드 (80h)
├── Agent 14c-β: SQL 자동완성 + EXPLAIN 시각화 (100h)
├── Agent 14d:   Table Editor 기본 + CRUD (80h)
├── Agent 14e:   TanStack Virtual + CSV 가져오기/내보내기 (80h)
└── Agent 14f:   AI 어시스턴트 통합 + 단위 테스트 (60h)

의존성:
- 14c-α 완료 → 14c-β 시작 (Monaco 기반 공유)
- 14d, 14e 독립 병렬 가능
- 14f → 14c-β + 14d + 14e 완료 후 시작
```

### 5.2 Phase 16 (Obs + Ops, 40h) — 4 에이전트 병렬

```
/kdyswarm --agents 4 --phase 16 "Vault + JWKS + Capistrano + canary 병렬"

Agent 분할:
├── Agent Vault:      node:crypto envelope + Vault API (10h)
├── Agent JWKS:       jose ES256 키 쌍 + JWKS 엔드포인트 (10h)
├── Agent Capistrano: symlink 배포 스크립트 (10h)
└── Agent canary:     PM2 cluster:4 + canary 서브도메인 설정 (10h)

의존성:
- Vault → JWKS (KEK 공유): Vault 먼저 완료 후 JWKS 시작
- Capistrano ↔ canary: 독립 병렬 가능
```

### 5.3 Phase 17 (Auth Core + Storage, 60h) — 4 에이전트 병렬

```
/kdyswarm --agents 4 --phase 17 "Session + Anonymous + SeaweedFS + B2 병렬"
(spike-007 통과 선행 조건)

Agent 분할:
├── Agent Session:    Session 테이블 + 디바이스 관리 (15h)
├── Agent Anonymous:  Anonymous 세션 지원 (10h)
├── Agent SeaweedFS:  SeaweedFS 단일 인스턴스 + S3 API (25h)
└── Agent B2:         B2 오프로드 클라이언트 + 임계치 모니터링 (10h)

의존성:
- Session → Anonymous (세션 기반 의존)
- SeaweedFS → B2 (파티셔닝 전략 공유)
```

### 5.4 Phase 19 (Edge + Realtime, 75h) — 4 에이전트 병렬

```
/kdyswarm --agents 4 --phase 19 "Edge Fn 3층 + Realtime CDC 병렬"
(spike-005 + spike-008 통과 선행 조건)

Agent 분할:
├── Agent L1-isolated-vm: isolated-vm v6 L1 샌드박스 (20h)
├── Agent L2-Deno:        Deno 사이드카 IPC 클라이언트 (15h)
├── Agent CDC:            wal2json 리스너 + 이벤트 파이프라인 (20h)
└── Agent Channels:       supabase-realtime 채널 관리 포팅 (20h)

의존성:
- L1 ↔ L2: 독립 병렬 (인터페이스 계약 선행 정의)
- CDC → Channels: CDC 이벤트 형식 공유
```

### 5.5 Phase 20 (Schema + DB Ops + Advisors, 198h) — 4 에이전트 병렬

```
/kdyswarm --agents 4 --phase 20 "Schema Viz + DB Ops + 3-Layer Advisors 병렬"

Agent 분할:
├── Agent Schema-Viz:    xyflow + elkjs Schema Visualizer (60h)
├── Agent DB-Ops:        wal-g + PITR + 자동 백업 (60h)
├── Agent Advisors-L1L2: schemalint + squawk 통합 (40h)
└── Agent Advisors-L3:   splinter 38룰 Node.js 포팅 (38h)

의존성:
- Schema-Viz ↔ DB-Ops: 독립 병렬
- Advisors-L1L2 → Advisors-L3: 공통 인터페이스 선행 정의
```

---

## 6. 역방향 피드백 반영 사항

Wave 5 R2 에이전트가 발견한 3건의 역방향 피드백이 본 청사진에 반영되었습니다.

### 6.1 ADR-020 후보: PM2 cluster:4 + cron-worker fork 분리

- **발견**: ADR-015(메인 앱 cluster:4) ↔ ADR-005(cron-worker fork 전용) 충돌
- **해결 반영**: Phase 16 `Capistrano + PM2` 태스크에서 **메인 앱 cluster:4 + cron-worker 별도 PM2 앱(fork)** 명시
- **PM2 설정 예시**:
```json
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "yangpyeong-main",
      script: "./.next/standalone/server.js",
      instances: 4,
      exec_mode: "cluster",
      env: { PORT: 3000 }
    },
    {
      name: "yangpyeong-cron-worker",
      script: "./src/workers/cron-worker.ts",
      instances: 1,
      exec_mode: "fork",
      env: { PORT: 3001 }
    }
  ]
}
```

### 6.2 spike-011 후보: argon2 WSL2 네이티브 빌드 검증

- **발견**: TD-008 — Phase 17 전에 Phase 16에서 argon2 WSL2 네이티브 빌드 검증 필요
- **해결 반영**: Phase 16 완료 기준에 조건부 사전 spike-011 포함
- **추가 위치**: Phase 16 Entry Gate `[조건부] spike-011-argon2-wsl2-build (3h)`

### 6.3 Phase 15 착수 전 우선 해소: TD-019 + TD-022 (5h)

- **발견**: 고 심각도 부채 5건 동시(TD-005/006/007/019/022) → 임계치 초과
- **해결 반영**: Phase 15 착수 전 TD-019(MASTER_KEY 백업 절차서, 3h) + TD-022(CVE 추적 자동화, 2h) 우선 해소
- **구체 명령**: `4.5 TD-019 + TD-022 우선 해소` 섹션 참조

---

## 변경 이력

| 버전 | 날짜 | 작성자 | 변경 내용 |
|------|------|--------|----------|
| v1.0 | 2026-04-18 | Wave 5 A1 sonnet | 초판 작성. Phase 15~22 전체 + kdyswarm 가이드 + 역방향 피드백 3건 반영. |

---

*상위 인덱스: [07-appendix 인덱스](./) · [Wave 5 README](../README.md) · [마일스톤 WBS](../05-roadmap/01-milestones-wbs.md)*
