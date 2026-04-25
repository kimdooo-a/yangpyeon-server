# 01. 릴리스 계획 — 양평 부엌 서버 대시보드 (Supabase 100점 동등성)

> ⚠️ **ADR-015 부분 대체 통지 (2026-04-25, 세션 51)**: 본 문서가 참조하는 *Capistrano-style symlink/releases* 배포 메커니즘은 [ADR-020](../02-architecture/01-adr-log.md) (Next.js standalone + rsync + pm2 reload, 세션 50)에 의해 부분 대체. PM2 cluster:4 / canary 서브도메인은 유효. 4 재진입 트리거(트래픽 100만+/팀 2명+/3환경/B2B) 충족 시 Capistrano 경로 재가동 가능.

> **Wave 5 · R1 (Roadmap Lead) 산출물 2/3**
> 작성일: 2026-04-18 (세션 28, Wave 5 Tier 1)
> 상위: [CLAUDE.md](../../../../CLAUDE.md) → [docs/research/](../../) → [2026-04-supabase-parity/](../) → [05-roadmap/](./) → **이 문서**
> 연관: [00-roadmap-overview.md](./00-roadmap-overview.md) (선행) · [02-milestones.md](./02-milestones.md) (병렬) · [../02-architecture/01-adr-log.md](../02-architecture/01-adr-log.md) · [../04-integration/02-cloudflare-deployment-integration.md](../04-integration/02-cloudflare-deployment-integration.md)

---

## 1. 릴리스 전략

### 1.1 전략 요약

양평 부엌 서버 대시보드는 **1인 운영 컨텍스트**와 **Cloudflare Tunnel 배포 아키텍처(ADR-015)**를 전제로 한 **저위험·빠른 롤백 중심 릴리스 전략**을 채택한다. 주요 특성 5가지:

1. **3-채널 배포** (internal → canary → production) — Capistrano-style symlink swap으로 **5초 롤백**
2. **Semantic Versioning** — v0.1.0~v1.0.0 + pre-release 태그 (alpha/beta/rc)
3. **Feature Flags by env** — LaunchDarkly 등 SaaS 미채택(CON-9 비용 상한), env 토글로 기능 활성/비활성
4. **한국어 릴리스 노트** — CLAUDE.md 루트 규칙 준수
5. **Cloudflare Worker 기반 트래픽 분할** — `cf-ray` 해시로 10% → 50% → 100% 시간차 롤아웃

### 1.2 버저닝 규약

[Semantic Versioning 2.0.0](https://semver.org/) 채택. Phase 완료 시 태그 생성 → 릴리스 노트 작성.

```
MAJOR . MINOR . PATCH [-PRE_RELEASE] [+BUILD]
  │       │       │          │             │
  │       │       │          │             └── Git 해시 단축 (자동)
  │       │       │          └── alpha.N / beta.N / rc.N
  │       │       └── 하위 호환 버그 수정 (Phase 내부 핫픽스)
  │       └── 하위 호환 기능 추가 (Phase 완료 → FR 단위)
  └── 비호환 변경 (GA 진입, 파괴적 마이그레이션)
```

**Pre-release 단계 규칙**:

| Pre-release | 의미 | 허용 Phase | 예시 |
|-------------|-----|----------|------|
| `alpha.N` | 내부 검증 전용 (MVP 진행 중) | Phase 15~17 | v0.1.0-alpha.1 |
| `beta.N` | 외부 검증 가능 (운영자 1~3명 사용) | Phase 18~19 | v0.5.0-beta.2 |
| `rc.N` | 기능 동결 (버그 수정만) | Phase 20~21 | v0.9.0-rc.1 |
| (없음) | GA 확정 | Phase 22 | v1.0.0 |

**자동 태그 생성 스크립트** (Phase 완료 시 실행):

```bash
# scripts/release-tag.sh
PHASE=$1          # 예: 15
VERSION=$2        # 예: 0.1.0-alpha.1
CODENAME=$3       # 예: "Nocturne"

git tag -a "v${VERSION}" -m "Phase ${PHASE} 완료 - ${CODENAME}"
git push origin "v${VERSION}"
# CHANGELOG.md 자동 업데이트 (conventional-changelog 사용 시)
```

### 1.3 배포 채널 상세

ADR-015 (`02-architecture/01-adr-log.md`) 확정: **Capistrano-style + PM2 cluster:4 + canary.stylelucky4u.com 시간차**.

#### 1.3.1 internal (개발·검증)

- **URL**: `http://localhost:3000` (WSL2 내부만)
- **PM2**: `fork` 모드 × 1 인스턴스 (메모리 400MB)
- **DB**: dev PostgreSQL (별도 포트 5433) + dev SQLite
- **용도**: 브랜치별 빠른 검증, E2E 테스트 실행, Playwright smoke
- **승격 조건**: `npm test` + `npm run test:e2e` 통과 + `pnpm lighthouse` 80+ 점수

#### 1.3.2 canary (시간차 프로덕션)

- **URL**: `https://canary.stylelucky4u.com`
- **PM2**: `cluster:2` (메모리 400MB × 2)
- **DB**: production DB 공유 (read + 제한적 write)
- **트래픽**: Cloudflare Worker `cf-ray` 해시 → 10% 트래픽 분기
- **용도**: 프로덕션 데이터 환경에서 실제 요청 패턴 검증
- **체류 시간**: 최소 **72시간** (3일)
- **승격 조건**: Sentry 0 crash + p95 <500ms + 404률 <0.1%

#### 1.3.3 production (정식 서비스)

- **URL**: `https://stylelucky4u.com`
- **PM2**: `cluster:4` (메모리 400MB × 4)
- **DB**: production PostgreSQL + production SQLite
- **트래픽**: canary 통과 후 점진 전환 (50% 24h → 100%)
- **롤백**: symlink swap 5초 (ADR-015 §롤백 절차)

#### 1.3.4 3-채널 배포 흐름도

```
[로컬 개발] → [Git push]
                │
                ▼
          [GitHub Actions CI]
          ├── npm test (unit)
          ├── npm run test:e2e (Playwright smoke)
          ├── npx playwright test --project=chromium
          └── pnpm lighthouse (80+ 필수)
                │
                ▼ 통과
          [WSL2 internal 배포]
          └── pm2 start (fork) → localhost:3000
                │
                ▼ 개발자 검증 완료
          [canary 배포]
          ├── Capistrano symlink 생성
          ├── pm2 reload (cluster:2)
          └── Cloudflare Worker 10% 분기 ON
                │
                ▼ 72h 관측 통과
          [canary 50% 전환 → 24h 관측]
                │
                ▼ 통과
          [production 100% 전환]
          └── Cloudflare Worker 분기 OFF
                │
                ▼
          [previous release 3일 보관]
          └── 롤백 필요 시 symlink 복원 (5초)
```

### 1.4 피처 플래그 정책

LaunchDarkly, Flagsmith 등 SaaS 플래그 서비스는 **CON-9(운영 비용 $10/월 상한)** 준수 불가로 미채택. **Env 토글 + Admin UI**로 대체.

#### 1.4.1 플래그 카테고리

| 카테고리 | 예시 | 저장 위치 |
|---------|-----|---------|
| 릴리스 플래그 | `FEATURE_MFA_WEBAUTHN=1` (Phase 15-B 활성화) | `/etc/luckystyle4u/secrets.env` |
| 실험 플래그 | `EXPERIMENT_AI_SUGGESTS=0.5` (50% 사용자 A/B) | DB `feature_flags` 테이블 |
| Kill Switch | `KILL_REALTIME=1` (장애 시 즉시 비활성) | Admin UI + Redis-less 캐시 |
| 권한 게이트 | `FEATURE_SUPERADMIN_SQL=0` (추후 확장) | Session 기반 (플래그 아님) |

#### 1.4.2 Env 토글 구현 (Wave 2 D 매트릭스 확정)

```typescript
// src/lib/feature-flags/env.ts
export const featureFlags = {
  mfaTotp: process.env.FEATURE_MFA_TOTP === '1',
  mfaWebauthn: process.env.FEATURE_MFA_WEBAUTHN === '1',
  mfaRateLimit: process.env.FEATURE_MFA_RATE_LIMIT === '1',
  sqlAiAssist: process.env.FEATURE_SQL_AI_ASSIST === '1',
  realtimePresence: process.env.FEATURE_REALTIME_PRESENCE === '1',
  pgGraphql: process.env.FEATURE_PG_GRAPHQL === '1',  // ADR-016 수요 트리거
  canaryMode: process.env.CANARY_MODE === '1',
} as const;

// 사용
if (featureFlags.mfaWebauthn) {
  // WebAuthn 등록 플로우 표시
}
```

#### 1.4.3 플래그 라이프사이클

```
[플래그 추가] → [코드에 분기] → [릴리스] → [2주 관측] → [플래그 제거(코드 정리)]
```

**플래그 수 제한**: Phase당 최대 5개. 카디널리티 초과 시 Phase 22 정리.

### 1.5 롤백 정책 (Capistrano 5초 롤백)

#### 1.5.1 자동 롤백 트리거

| 지표 | 임계값 | 자동 동작 |
|------|-------|---------|
| HTTP 5xx 비율 | >1% (5분 윈도우) | 자동 symlink 되돌림 + Slack 알림 |
| p95 응답 시간 | >2000ms (5분 윈도우) | 자동 symlink 되돌림 + Sentry 이벤트 |
| PM2 crash 카운트 | >3회 / 10분 | 자동 symlink 되돌림 + PagerDuty |
| 메모리 사용 | >90% (5분 지속) | 자동 symlink 되돌림 + OOM 알림 |

#### 1.5.2 수동 롤백 절차

```bash
# 단계 1: 현재 릴리스 확인
ls -la /var/www/luckystyle4u/current

# 단계 2: previous 심링크로 전환 (5초)
cd /var/www/luckystyle4u/releases
PREVIOUS=$(readlink ../previous)
ln -sf "$PREVIOUS" ../current

# 단계 3: PM2 리로드
pm2 reload luckystyle4u-dashboard --update-env

# 단계 4: 상태 확인
pm2 status
curl https://stylelucky4u.com/api/health

# 단계 5: Slack 알림
node scripts/notify-rollback.js --from v0.3.0 --to v0.2.1
```

#### 1.5.3 DB 마이그레이션 롤백 (별도 절차)

DB 스키마 변경은 **forward-only**가 기본이지만, Phase 22 마이그 19개 전부 **-down 스크립트** 유지. 롤백 방법:

```bash
# Prisma 마이그레이션 롤백 (파괴적 — 데이터 손실 가능)
npx prisma migrate resolve --rolled-back 20260418_01_create_vault_secrets

# wal-g 기반 PITR (RPO 60초)
wal-g backup-fetch /tmp/restore LATEST
wal-g wal-fetch --target-time="2026-04-18 14:30:00+09" LATEST
```

---

## 2. 릴리스 개요 테이블 (v0.1.0~v1.0.0)

### 2.1 전체 릴리스 목록

| 버전 | 코드명 | 타겟 주차 | Phase | FR 범위 (P0/P1/P2) | 핵심 산출물 | 릴리스 채널 | 상태 |
|------|-------|---------|-------|------------------|-----------|-----------|------|
| **v0.1.0-alpha.1** | Nocturne | 4 | 15 | MFA 3건 (FR-6.1~6.3) | TOTP + WebAuthn + RL | canary 3일 → production | 계획 |
| **v0.2.0-alpha.2** | Vanguard | 10 | 16 | Vault + JWKS + Ops (FR-12.1~5, 14.1~4) | node:crypto envelope + JWKS + Capistrano | canary 3일 → production | 계획 |
| **v0.3.0 (Alpha/MVP)** | Keystone | 18 | 17 | Auth Core + Storage (FR-5.1~8, 7.1~6) | jose JWT + SeaweedFS | canary 5일 → production | 계획 |
| **v0.4.0-beta.1** | Monolith | 34 | 18 | SQL+Table Editor (FR-1.1~9, 2.1~12) | supabase-studio 패턴 + TanStack | canary 7일 → production | 계획 |
| **v0.5.0 (Beta)** | Torrent | 42 | 19 | Edge+Realtime (FR-8.1~4, 9.1~6) | 3층 Edge + CDC+Channel | canary 7일 → production | 계획 |
| **v0.6.0-rc.1** | Atlas | 46 | 20 | Schema+DB Ops+Advisors (FR-3.1~5, 4.1~8, 10.1~4) | xyflow + node-cron + 3-Layer | canary 5일 → production | 계획 |
| **v0.9.0-rc.2** | Meridian | 48 | 21 | Data API + UX (FR-11.1~4, 13.1~6) | REST+pgmq + AI SDK v6 | canary 3일 → production | 계획 |
| **v1.0.0 (GA)** | Centurion | 50 | 22 | 잔여 + 하드닝 | Prisma 마이그 + 보안 재검증 | canary 14일 → production | 계획 |
| **v1.0.1** | (핫픽스) | +2주 | — | 버그 수정 | — | canary 1일 → production | 조건부 |
| **v1.1.0** | Solstice | +12주 | 22+ | P2 백로그 (FIDO MDS, Capacitor) | pg_graphql(조건부) + FIDO MDS | canary 7일 → production | 조건부 |

### 2.2 릴리스 코드명 체계

각 Phase의 성격을 반영한 한국어+영어 코드명:

- **Nocturne**(야상곡) — Phase 15: 보안 기반, "어둠 속 첫 빛"
- **Vanguard**(선봉) — Phase 16: 기반 시설, "최전선 보호"
- **Keystone**(쐐기돌) — Phase 17: MVP, "핵심 완성"
- **Monolith**(단일석) — Phase 18: SQL/Table Editor 대규모, "거대한 한 덩어리"
- **Torrent**(급류) — Phase 19: Realtime/Edge, "빠른 흐름"
- **Atlas**(지도책) — Phase 20: Schema 시각화 중심, "전체 지도"
- **Meridian**(자오선) — Phase 21: Data API 경계선, "접점"
- **Centurion**(백부장) — Phase 22: GA, "완성된 방어"

---

## 3. 릴리스 상세 스펙

### 3.1 v0.1.0-alpha.1 (Nocturne) — Phase 15

**목표**: Auth Advanced MVP — MFA 기반 확립 (15→60점)

| 항목 | 값 |
|------|-----|
| 타겟 일정 | Week 1~4 |
| 기간 | 4주 |
| FR 범위 | P0: FR-6.1(TOTP), FR-6.2(WebAuthn), FR-6.3(Rate Limit) / P1: FR-6.4(백업코드), FR-6.5(감사) |
| NFR 범위 | NFR-SEC.4(MFA 강제), NFR-SEC.5(시도 제한), NFR-PERF.7(MFA <200ms) |
| 공수 | 22h (Phase 15-A 4h + 15-B 8h + 15-C 6h + 15-D 4h) |
| 핵심 산출물 | `03-auth-advanced-blueprint.md §12` WBS 12 태스크 |
| 배포 채널 | canary 3일(10%→50%) → production |
| 대상 사용자 | 페르소나 1 (김도영, 1인 운영자) |
| ADR 변경 | ADR-007 구현 시작 |
| DQ 해결 | DQ-AA-1, DQ-AA-2, DQ-AA-4, DQ-AA-5, DQ-AA-6, DQ-AA-7 (Wave 4에서 답변된 DQ 실구현) |

#### 3.1.1 기능 백로그

| 우선순위 | FR | 기능 | 예상 공수 | WBS |
|---------|----|------|---------|-----|
| P0 | FR-6.1 | TOTP MFA 등록 (QR 코드) | 2h | T2 |
| P0 | FR-6.1 | TOTP MFA 검증 + enable/disable | 2h | T3 |
| P0 | FR-6.2 | WebAuthn 등록 (`@simplewebauthn/server`) | 4h | T4 |
| P0 | FR-6.2 | WebAuthn 인증 | 4h | T5 |
| P0 | FR-6.3 | Rate Limit DB 기반 (IP + 사용자) | 3h | T6 |
| P0 | FR-6.3 | Rate Limit 미들웨어 통합 | 3h | T7 |
| P1 | FR-6.4 | 백업 코드 8개 생성/사용 | 2h | T8 |
| P1 | FR-6.5 | MFA 이벤트 감사 로그 | 2h | T9 |

#### 3.1.2 릴리스 기준 체크리스트

```
□ WBS 12 태스크 모두 완료 (03-auth-advanced-blueprint.md §12.2)
□ 4개 신규 테이블 마이그레이션 성공 (totp_secrets, webauthn_credentials, rate_limits, backup_codes)
□ Playwright E2E: 로그인 → TOTP 등록 → 로그아웃 → 재로그인 + TOTP 코드 입력
□ Playwright E2E: WebAuthn 등록 → Passkey 인증 (Safari/Chrome/Firefox)
□ 부하 테스트: Rate Limit 1분당 10회 차단 검증
□ 감사 로그: mfa_enabled, mfa_disabled, mfa_bypass 이벤트 기록 확인
□ canary 트래픽 10% (72h) p95 <200ms, error <0.1%
□ canary 트래픽 50% (24h) p95 <200ms, error <0.1%
□ 릴리스 노트 작성 (한국어)
□ ADR-007 상태: Proposed → Accepted 유지 (구현 시작)
```

---

### 3.2 v0.2.0-alpha.2 (Vanguard) — Phase 16

**목표**: Observability 강화 + Operations 보강 (65→85 / 80→95)

| 항목 | 값 |
|------|-----|
| 타겟 일정 | Week 5~10 |
| 기간 | 6주 |
| FR 범위 | P0: FR-12.1(Vault), FR-12.2(JWKS), FR-14.1(Capistrano), FR-14.2(롤백) / P1: FR-12.3(감사), FR-14.3(Canary), FR-14.4(헬스) |
| NFR 범위 | NFR-SEC.1(JWT ES256), NFR-SEC.6(시크릿 관리), NFR-UPTIME.1(99.5%), NFR-UPTIME.2(5초 롤백) |
| 공수 | 40h (Obs 20h + Ops 20h) |
| 핵심 산출물 | `04-observability-blueprint.md §12`, `05-operations-blueprint.md §12` |
| 배포 채널 | canary 3일 → production |
| 대상 사용자 | 페르소나 1 + 페르소나 2 (박민수, DevOps) |
| ADR 변경 | ADR-013 구현 시작, ADR-015 구현 시작 |
| DQ 해결 | DQ-12.3(확정), DQ-12.4(JWKS 캐시), DQ-12.8, DQ-12.14, DQ-4.1(cluster) — 마일스톤 M3에서 확정, DQ-OPS-3(Node 버전) |

#### 3.2.1 기능 백로그

| 우선순위 | FR | 기능 | 예상 공수 | 담당 영역 |
|---------|----|------|---------|---------|
| P0 | FR-12.1 | `node:crypto` AES-256-GCM envelope | 6h | Observability |
| P0 | FR-12.1 | MASTER_KEY 로딩 (/etc/luckystyle4u/secrets.env) | 2h | Observability |
| P0 | FR-12.1 | VaultService API (set/get/rotate) | 4h | Observability |
| P0 | FR-12.2 | jose JWKS ES256 키쌍 생성 | 2h | Observability |
| P0 | FR-12.2 | `/.well-known/jwks.json` 엔드포인트 | 2h | Observability |
| P0 | FR-12.2 | JWKS 3분 grace period (DQ-1.19) | 2h | Observability |
| P1 | FR-12.3 | Vault 감사 로그 (set/rotate) | 2h | Observability |
| P0 | FR-14.1 | Capistrano symlink 디렉토리 구조 | 4h | Operations |
| P0 | FR-14.1 | PM2 ecosystem.config.js cluster:4 | 2h | Operations |
| P0 | FR-14.2 | 5초 롤백 스크립트 | 4h | Operations |
| P1 | FR-14.3 | Canary 10%→50%→100% 자동화 | 6h | Operations |
| P1 | FR-14.4 | `/api/health` 엔드포인트 | 2h | Operations |
| P1 | FR-14.4 | 자동 롤백 트리거 (p95/5xx/crash) | 2h | Operations |

#### 3.2.2 릴리스 기준 체크리스트

```
□ Vault 3개 API (set/get/rotate) 통과
□ JWKS 엔드포인트 존재 + ES256 검증
□ MASTER_KEY 권한 0640 + root:ypb-runtime
□ PM2 cluster:4 zero-downtime reload 확인
□ Capistrano release 디렉토리 구조 구현 (current/previous/releases)
□ 5초 롤백 드릴 성공 (staging)
□ Canary Cloudflare Worker cf-ray 해시 분기 검증
□ /api/health JSON 응답 + 롤백 트리거 통과
□ 릴리스 노트 작성
□ ADR-013/015 Accepted 유지
```

---

### 3.3 v0.3.0 (Keystone) — Phase 17 / **Alpha MVP 완성**

**목표**: Auth Core 완성 + Storage 기반 구축 (70→90 / 40→90)

| 항목 | 값 |
|------|-----|
| 타겟 일정 | Week 11~18 |
| 기간 | 8주 |
| FR 범위 | P0: FR-5.1~8, FR-7.1~6 전부 / P1: FR-5.9(Anonymous role) |
| NFR 범위 | NFR-PERF.4(bcrypt cost 12), NFR-UX.3(로그인 <1s), NFR-PERF.5(파일 업로드 10MB) |
| 공수 | 60h (Auth Core 30h + Storage 30h) |
| 핵심 산출물 | `06-auth-core-blueprint.md §11`, `07-storage-blueprint.md §13` |
| 배포 채널 | canary 5일 → production |
| 대상 사용자 | 페르소나 1, 2 (첫 외부 검증 단계) |
| ADR 변경 | ADR-006 구현 시작, ADR-008 구현 시작 |
| DQ 해결 | DQ-AC-1(argon2), DQ-AC-2(Session 인덱스), DQ-1.15~17(Storage 50GB) |

#### 3.3.1 기능 백로그

| 우선순위 | FR | 기능 | 예상 공수 | 담당 영역 |
|---------|----|------|---------|---------|
| P0 | FR-5.1 | bcrypt 해시 (cost 12) | 2h | Auth Core |
| P0 | FR-5.2 | Session 테이블 + 디바이스 관리 | 4h | Auth Core |
| P0 | FR-5.3 | JWT refresh token 회전 (tokenFamily) | 4h | Auth Core |
| P0 | FR-5.4 | 로그아웃 + 모든 세션 종료 | 2h | Auth Core |
| P0 | FR-5.5 | 비밀번호 정책 + 복잡도 | 2h | Auth Core |
| P0 | FR-5.6 | 비밀번호 재설정 토큰 | 3h | Auth Core |
| P0 | FR-5.7 | 이메일 인증 토큰 | 3h | Auth Core |
| P0 | FR-5.8 | RLS 정책 베이스 (ypb_user_id) | 4h | Auth Core |
| P1 | FR-5.9 | Anonymous role (제한 범위) | 6h | Auth Core |
| P0 | FR-7.1 | SeaweedFS 단일 인스턴스 배포 | 4h | Storage |
| P0 | FR-7.2 | 파일 업로드 API (10MB) | 4h | Storage |
| P0 | FR-7.3 | 파일 다운로드 + signed URL | 4h | Storage |
| P0 | FR-7.4 | 버킷 생성/삭제 UI (Admin) | 6h | Storage |
| P0 | FR-7.5 | B2 오프로드 자동화 (Hot/Cold) | 8h | Storage |
| P1 | FR-7.6 | 사용량 대시보드 | 4h | Storage |

#### 3.3.2 릴리스 기준 체크리스트 (MVP 필수)

```
□ Auth Core 모든 FR P0 완료 (5.1~5.8)
□ Storage 모든 FR P0 완료 (7.1~7.5)
□ MFA(v0.1.0) + Vault(v0.2.0) + Auth Core + Storage 통합 E2E
□ 로그인 → MFA → 파일 업로드 → 다운로드 → 로그아웃 전체 플로우
□ bcrypt 성능: 비밀번호 검증 <200ms
□ 파일 업로드 성능: 10MB <3s (WSL2 로컬)
□ B2 오프로드: Hot 7일 경과 자동 이동 검증
□ SeaweedFS 부하 테스트: 50GB 데이터 + 100 동시 요청 (spike-007 결과 반영)
□ Session 관리: 디바이스별 강제 종료 가능
□ Anonymous role: 특정 URL에서만 동작 확인
□ 가중평균 점수: 69.6점 달성
□ 릴리스 노트 "Alpha(MVP) 완성" 명시
□ ADR-006/008 Accepted 유지
```

#### 3.3.3 MVP 완성 선언 기준 (10개+)

1. ✅ MFA 3종(TOTP/WebAuthn/RL) 작동 (Phase 15)
2. ✅ Vault 암호화된 시크릿 관리 (Phase 16)
3. ✅ JWKS ES256 서명 작동 (Phase 16)
4. ✅ Capistrano 5초 롤백 드릴 성공 (Phase 16)
5. ✅ Auth Core 90점 달성 (Phase 17)
6. ✅ Storage 90점 달성 (Phase 17)
7. ✅ 운영자가 실제 고객 데이터 저장 가능
8. ✅ 로그인 플로우 전체 P95 <1s
9. ✅ 파일 업로드 10MB <3s
10. ✅ 감사 로그 14일 보관 검증
11. ✅ Prisma 마이그레이션 3개 이상 성공 (down 가능)
12. ✅ canary 5일 (10% → 50%) 에러 <0.1%

---

### 3.4 v0.4.0-beta.1 (Monolith) — Phase 18

**목표**: SQL Editor + Table Editor 완성 (70→100 / 75→100)

| 항목 | 값 |
|------|-----|
| 타겟 일정 | Week 19~34 |
| 기간 | 16주 (전체 최대) |
| FR 범위 | P0: FR-1.1~9(Table) + FR-2.1~12(SQL) / P1: FR-1.10(가상스크롤), FR-2.13(AI), FR-2.14(Plan Viz) |
| NFR 범위 | NFR-PERF.1(SQL <500ms), NFR-PERF.2(Table 1만행 <500ms), NFR-DX.1(Monaco 통합), NFR-A11Y.1(WCAG 2.2 AA) |
| 공수 | 400h (SQL 320h + Table 80h) |
| 핵심 산출물 | `08-sql-editor-blueprint.md §13`, `09-table-editor-blueprint.md §11` |
| 배포 채널 | canary 7일 → production |
| 대상 사용자 | 페르소나 1, 2, 3 (외부 운영자 2~3명) |
| ADR 변경 | ADR-002, ADR-003 구현 |
| DQ 해결 | DQ-2.4~2.6, DQ-1.10~1.12, DQ-2.1~2.3 |

#### 3.4.1 4단계 내부 릴리스 (14c-γ/14d/14e/14f)

SQL Editor는 `08-sql-editor-blueprint.md §13`에 따라 **내부 4단계** 릴리스:

| 내부 단계 | 기간 | 공수 | 버전 | 특징 |
|---------|-----|-----|-----|------|
| 14c-γ | Week 19~24 | 120h | v0.4.0-beta.1 | Monaco + BEGIN READ ONLY + 히스토리 |
| 14d | Week 25~28 | 80h | v0.4.1-beta.2 | 포매터 + auto-complete + schema 토큰 |
| 14e | Week 29~32 | 80h | v0.4.2-beta.3 | AI 보조 (Anthropic Haiku BYOK) |
| 14f | Week 33~34 | 40h | v0.4.3-beta.4 | Plan Visualizer + 편집 락 |

Table Editor는 **내부 2단계**:

| 내부 단계 | 기간 | 공수 | 버전 | 특징 |
|---------|-----|-----|-----|------|
| 14c-β | Week 31~33 | 40h | v0.4.2~3 | RLS UI + 외래키 표시 (P18 후반) |
| 14d/14e | Week 33~34 | 40h | v0.4.3-beta.4 | Papa Parse CSV + cmdk FK |

#### 3.4.2 기능 백로그 (주요)

| 우선순위 | FR | 기능 | 공수 | 내부 단계 |
|---------|----|------|-----|---------|
| P0 | FR-2.1 | Monaco Editor 통합 | 8h | 14c-γ |
| P0 | FR-2.2 | BEGIN READ ONLY wrapping | 4h | 14c-γ |
| P0 | FR-2.3 | SQL 실행 API + app_readonly role | 16h | 14c-γ |
| P0 | FR-2.4 | 쿼리 히스토리 (SQLite) | 12h | 14c-γ |
| P0 | FR-2.5 | Snippet 관리 (폴더 구조) | 24h | 14c-γ |
| P0 | FR-2.6 | sql-formatter 통합 | 16h | 14d |
| P0 | FR-2.7 | Auto-complete (스키마 토큰) | 40h | 14d |
| P1 | FR-2.13 | AI 보조 (Anthropic Haiku BYOK) | 80h | 14e |
| P1 | FR-2.14 | Plan Visualizer (자체 d3) | 40h | 14f |
| P0 | FR-1.1 | TanStack Table v8 베이스 | 8h | 14c-β |
| P0 | FR-1.2 | CRUD 모달 + Zod 검증 | 16h | 14c-β |
| P0 | FR-1.3 | 필터/정렬/페이지네이션 | 16h | 14c-β |
| P0 | FR-1.4 | RLS 정책 UI | 16h | 14c-β |
| P0 | FR-1.5 | Papa Parse CSV import | 16h | 14d |
| P0 | FR-1.6 | cmdk FK selector | 8h | 14d |

#### 3.4.3 릴리스 기준 체크리스트

```
□ SQL Editor: 4단계 14c-γ/14d/14e/14f 모두 통과
□ Table Editor: 14c-β + 14d/14e 완성
□ SQL 쿼리 p95 <500ms (10만행 EXPLAIN)
□ Table 페이지 로드 1만행 <500ms
□ WCAG 2.2 AA 감사 통과 (키보드 + 스크린리더)
□ Playwright E2E: SQL 작성 → 실행 → 결과 CSV 다운로드
□ Playwright E2E: Table 행 추가 → 필터 → 편집 → FK 선택 → 저장
□ AI 보조: $1 한도 초과 시 차단 검증 (사용자 BYOK)
□ canary 7일 에러 <0.1%, p95 <500ms
□ 릴리스 노트 "Beta 진입" 표시
□ 외부 운영자 2~3명 접근 승인 (페르소나 3)
```

---

### 3.5 v0.5.0 (Torrent) — Phase 19 / **Beta 완성**

**목표**: Edge Functions + Realtime (45→92 / 55→100)

| 항목 | 값 |
|------|-----|
| 타겟 일정 | Week 35~42 |
| 기간 | 8주 |
| FR 범위 | P0: FR-8.1~4(Edge Fn), FR-9.1~6(Realtime) / P1: FR-8.5(Sandbox 위임) |
| NFR 범위 | NFR-PERF.6(Edge Fn <100ms), NFR-PERF.7(Realtime latency <200ms), NFR-SCALE.1(100 동시 채널) |
| 공수 | 75h (Edge 40h + Realtime 35h) |
| 핵심 산출물 | `10-edge-functions-blueprint.md §13`, `11-realtime-blueprint.md §12` |
| 배포 채널 | canary 7일 → production |
| 대상 사용자 | 페르소나 1, 2, 3 |
| ADR 변경 | ADR-009, ADR-010 구현 |
| DQ 해결 | DQ-1.12~14, DQ-RT-3(presence_diff), DQ-RT-4 |

#### 3.5.1 Edge Functions 단계적 롤아웃 (ADR-009 3층)

```
Week 35~36: Layer 1 (isolated-vm) 단독 배포
           ├── decideRuntime() 단위 테스트 100%
           └── P0 요청 (CPU <100ms, 메모리 <32MB) 처리만
Week 37:    Layer 1 안정화 관측 (canary 10% / 3일)
Week 38~39: Layer 2 (Deno 사이드카) 추가
           └── P1 요청 (npm: 패키지 필요) 라우팅
Week 40:    Layer 1+2 통합 관측
Week 41~42: Layer 3 (Sandbox 위임) 인터페이스만 준비
           └── 실제 Vercel Sandbox 연동은 Phase 22 이연
```

#### 3.5.2 Realtime 2계층 롤아웃 (ADR-010)

```
Week 35~37: CDC 계층 (wal2json)
           ├── PostgreSQL replication slot 2개 (logical_repl, audit_repl)
           └── slot lag 모니터링 (archive_timeout 60s)
Week 38:    CDC → Event Bus 소비자 구현
Week 39~41: Channel 계층 (supabase-realtime 포팅)
           ├── Channel 생성 API
           ├── 구독/해지 API
           └── presence 이벤트 (DQ-RT-3 답변)
Week 42:    E2E + 백프레셔 테스트
```

#### 3.5.3 릴리스 기준 체크리스트

```
□ Edge Fn Layer 1(isolated-vm) 프로덕션 배포
□ Edge Fn Layer 2(Deno) 프로덕션 배포
□ decideRuntime() P0>P1 라우팅 검증
□ Realtime CDC 이벤트 latency <200ms
□ Realtime Channel 100 동시 구독 부하 테스트
□ presence_diff 이벤트 작동 (DQ-RT-3)
□ wal2json PG 14/15/16 매트릭스 테스트 (spike-008)
□ canary 7일 0 crash, p95 <500ms
□ 릴리스 노트 "Beta 완성" 표시
□ ADR-009/010 Accepted 유지
```

---

### 3.6 v0.6.0-rc.1 (Atlas) — Phase 20

**목표**: Schema Viz + DB Ops + Advisors (65/60/65 → 95/95/95)

| 항목 | 값 |
|------|-----|
| 타겟 일정 | Week 38~44 (P18 후반과 중첩) |
| 기간 | 6주 (겹침 2주 제외) |
| FR 범위 | P0: FR-3.1~5(Schema Viz), FR-4.1~8(DB Ops), FR-10.1~4(Advisors) |
| 공수 | 198h (Schema 50h + DB Ops 68h + Advisors 80h) |
| 핵심 산출물 | `12-schema-visualizer-blueprint.md §11`, `13-db-ops-blueprint.md §11`, `14-advisors-blueprint.md §10` |
| 배포 채널 | canary 5일 → production |
| ADR 변경 | ADR-004, ADR-005, ADR-011 구현 |
| DQ 해결 | DQ-4.1(cluster), DQ-4.2(pg_cron 재검토), DQ-4.3(BullMQ), DQ-4.22(복원 속도), DQ-ADV-1 |

#### 3.6.1 기능 백로그 요약

| FR | 기능 | 공수 | 카테고리 |
|----|------|-----|---------|
| FR-3.1 | @xyflow + elkjs ERD 뷰어 | 16h | Schema Viz |
| FR-3.2 | RLS 정책 페이지 (/database/policies) | 12h | Schema Viz |
| FR-3.3 | Trigger 페이지 | 10h | Schema Viz |
| FR-3.4 | Function 페이지 | 8h | Schema Viz |
| FR-3.5 | 레이아웃 저장 (per-user) | 4h | Schema Viz |
| FR-4.1 | node-cron 스케줄러 | 16h | DB Ops |
| FR-4.2 | Webhook 등록 + retry | 10h | DB Ops |
| FR-4.3 | wal-g 백업 자동화 | 16h | DB Ops |
| FR-4.4 | PITR 복원 드릴 | 9h | DB Ops |
| FR-4.5 | archive_timeout=60s | 4h | DB Ops |
| FR-4.6 | RPO/RTO 대시보드 | 4h | DB Ops |
| FR-4.7 | Advisory lock (분산 잠금) | 4h | DB Ops |
| FR-4.8 | 실패 잡 90일 보관 | 5h | DB Ops |
| FR-10.1 | schemalint (컨벤션) | 8h | Advisors |
| FR-10.2 | squawk (DDL 검사) | 8h | Advisors |
| FR-10.3 | splinter 38룰 Node TS 포팅 | 30h | Advisors |
| FR-10.4 | Advisor 결과 UI + PR 차단 | 14h | Advisors |

#### 3.6.2 릴리스 기준 체크리스트

```
□ Schema Viz 100+ 테이블 렌더링 < 3초
□ DB Ops: Cron 1개 매 15분 동작 7일 연속
□ DB Ops: wal-g 복원 드릴 성공 (RTO <30분)
□ Advisors 3-Layer 작동 (schemalint + squawk + splinter)
□ Advisors P0 12룰 PR 차단 동작
□ canary 5일 에러 <0.1%
□ 릴리스 노트 "RC 단계" 표시
```

---

### 3.7 v0.9.0-rc.2 (Meridian) — Phase 21

**목표**: Data API + UX Quality (45→85 / 75→95)

| 항목 | 값 |
|------|-----|
| 타겟 일정 | Week 45~46 |
| 기간 | 4주 (전체 중 가장 짧음) |
| FR 범위 | P0: FR-11.1~4(Data API), FR-13.1~6(UX) / P1: FR-11.5(pg_graphql 조건부) |
| 공수 | 40h (Data API 25h + UX 15h) |
| 핵심 산출물 | `15-data-api-blueprint.md §11`, `16-ux-quality-blueprint.md §12` |
| 배포 채널 | canary 3일 → production |
| ADR 변경 | ADR-012, ADR-014 구현. ADR-016 수요 트리거 재평가 |
| DQ 해결 | DQ-1.25~1.34(pg_graphql 관련) — 조건부 |

#### 3.7.1 기능 백로그

| 우선순위 | FR | 기능 | 공수 |
|---------|----|------|-----|
| P0 | FR-11.1 | REST API 강화 (OpenAPI 3.1) | 8h |
| P0 | FR-11.2 | pgmq 메시지 큐 | 8h |
| P0 | FR-11.3 | SQLite 보조 큐 (오프라인) | 4h |
| P0 | FR-11.4 | Outbox 패턴 (트랜잭션 일관성) | 5h |
| P1 | FR-11.5 | pg_graphql (조건부, ADR-016) | +20h 이연 |
| P0 | FR-13.1 | `/dashboard/assistant` AI Studio | 4h |
| P0 | FR-13.2 | Vercel AI SDK v6 통합 | 2h |
| P0 | FR-13.3 | Anthropic BYOK 키 관리 | 2h |
| P0 | FR-13.4 | 자체 MCP `mcp-luckystyle4u` | 3h |
| P1 | FR-13.5 | 페이지별 AI 임베드 | 2h |
| P1 | FR-13.6 | 대화 히스토리 (DQ-UX-2) | 2h |

#### 3.7.2 릴리스 기준 체크리스트

```
□ REST OpenAPI 3.1 문서 자동 생성
□ pgmq 메시지 1000 TPS 처리 (벤치마크)
□ Outbox 트랜잭션 일관성 E2E
□ AI Studio Assistant 응답 <3s (Anthropic Haiku)
□ MCP 도구 호출 작동 (`mcp-luckystyle4u`)
□ BYOK 키 비용 가드 ($1/월 초과 시 차단)
□ canary 3일 에러 <0.1%
□ 릴리스 노트
```

---

### 3.8 v1.0.0 (Centurion) — Phase 22 / **GA**

**목표**: 14 카테고리 100점 동등 + 하드닝

| 항목 | 값 |
|------|-----|
| 타겟 일정 | Week 47~50 |
| 기간 | 4주 |
| FR 범위 | 잔여 P0 잠재 + P1/P2 선별 |
| 공수 | ~35h (Prisma 마이그 20h + Auth Advanced 보너스 10h + 하드닝 5h) |
| 핵심 산출물 | Prisma 마이그 19개 통합 + 보안 재검증 + GA 체크리스트 |
| 배포 채널 | canary 14일 → production |
| ADR 변경 | ADR-018 Accepted 최종화 |
| DQ 해결 | DQ-1.13(AG Grid 재검토), DQ-1.14(Enterprise), DQ-AA-3(FIDO MDS), DQ-AA-9(Conditional UI), DQ-RT-6(PG 18 업그레이드), DQ-12.5(Capacitor 재평가) |

#### 3.8.1 GA 목표 기능

| 항목 | 내용 |
|------|-----|
| Auth Advanced 60→100 | OAuth Providers(ADR-017 조건부), Turnstile CAPTCHA, FIDO MDS, Conditional UI |
| Advisors PG Advisor | splinter 미포팅 룰 PL/pgSQL 경로 (DQ-ADV-1) |
| Prisma 마이그 통합 | 19개 마이그 전수 통합 + down 스크립트 검증 |
| STRIDE 재검증 | 34 위협 전수 재검토 + TOP 10 완화 검증 |
| NFR 38 충족 검증 | 자동 테스트 + 수동 검증 |
| 문서 최종화 | CLAUDE.md + README.md 최종 업데이트 |

#### 3.8.2 GA 릴리스 기준 체크리스트

```
□ 14 카테고리 전부 90점 이상
□ 가중평균 100/100 달성
□ FR 55건 전수 구현
□ NFR 38건 전수 충족
□ STRIDE 34 위협 TOP 10 완화 검증
□ 3년 TCO 절감 $950~2,150 실측 확인 (운영 비용 $0~10/월)
□ RPO 60초 / RTO 30분 실제 드릴 통과
□ Playwright 전체 시나리오 50+ 통과
□ Lighthouse 95+ (홈/대시보드/Editor)
□ WCAG 2.2 AA 최종 감사
□ 외부 운영자 리뷰 (페르소나 3) 피드백 반영
□ canary 14일 0 crash, p95 <500ms
□ 모든 ADR Accepted 최종화
□ ADR-001 재검토 트리거 미발동 확인
□ CLAUDE.md "v1.0.0 GA" 표시
□ Git 태그 v1.0.0
□ 릴리스 노트 "v1.0.0 GA" + 50주 회고
```

---

## 4. 릴리스 간 의존성 (블로킹 그래프)

### 4.1 의존성 다이어그램 (릴리스 레벨)

```
   v0.1.0-alpha.1 (Nocturne, Phase 15)
           │
           │ MFA 시드 → Vault 보관 필수
           ▼
   v0.2.0-alpha.2 (Vanguard, Phase 16)
           │
           │ JWKS ES256 → Auth Core JWT 서명
           │ Capistrano → 모든 후속 배포 안전망
           ▼
   v0.3.0 (Keystone, Phase 17, MVP)
           │
           ├─────────────────┐
           │                 │
           │ 세션 기반         │ Storage 버킷
           │ 권한 검증         │ 접근 패턴
           ▼                 ▼
   v0.4.x-beta.N    v0.5.0 (Torrent, Phase 19)
   (Monolith, P18)         │
           │                 │ Realtime CDC → Data API 구독
           │                 │ Edge Fn 보안 격리 → 외부 요청
           │                 │
           └────────┬────────┘
                    │
                    │ Table Editor RLS UI → Schema Viz 재사용
                    │ SQL Editor 쿼리 컨텍스트 → Advisors 38룰
                    ▼
            v0.6.0-rc.1 (Atlas, Phase 20)
                    │
                    │ Advisors 38룰 → Data API 스키마 검증
                    ▼
            v0.9.0-rc.2 (Meridian, Phase 21)
                    │
                    │ 전 기능 완성 → 하드닝·잔여 갭
                    ▼
              v1.0.0 (Centurion, GA)
                    │
                    │ 2주 운영 관측 후 조건부
                    ▼
              v1.0.1 (핫픽스, 선택적)
                    │
                    ▼
              v1.1.0 (Solstice, P22+)
                    └── P2 백로그 (FIDO MDS, Capacitor)
```

### 4.2 블로킹 의존성 세부

| 후행 | 선행 | 차단 조건 | 릴리스 가능 시점 |
|------|-----|---------|-------------|
| v0.2.0 | v0.1.0 | Vault 없이는 MFA 시드 평문 저장 | v0.1.0 production 배포 + 3일 관측 |
| v0.3.0 | v0.2.0 | Auth Core JWT가 JWKS ES256 서명 | v0.2.0 JWKS 엔드포인트 검증 통과 |
| v0.4.0 | v0.3.0 | SQL Editor가 Auth Core Session 권한 필요 | v0.3.0 MVP 선언 |
| v0.5.0 | v0.3.0 | Edge Fn이 Storage 버킷 접근 패턴 사용 | v0.3.0 Storage 90점 확인 |
| v0.6.0 | v0.4.0 | Schema Viz RLS UI가 Table Editor 컴포넌트 재사용 | v0.4.3-beta.4 Table Editor 100점 |
| v0.6.0 | v0.5.0 | Advisors 런타임 룰이 Realtime CDC 이벤트 분석 | v0.5.0 Realtime 100점 |
| v0.9.0 | v0.5.0 | Data API 구독이 Realtime Channel 사용 | v0.5.0 Channel API 안정 |
| v0.9.0 | v0.6.0 | Data API 스키마 검증이 Advisors 38룰 사용 | v0.6.0 Advisors 95점 |
| v1.0.0 | v0.9.0 | 전 기능 완성 후 2주 하드닝 | v0.9.0 관측 2주 |

### 4.3 Beta 피드백 의존성

**Beta(v0.5.0) → GA(v1.0.0)**의 의존은 단순 기술적 블로킹이 아니라 **사용자 피드백 통합** 포함:

- Beta 진입 후 페르소나 2 (박민수, DevOps) 2주 사용 피드백
- Beta 진입 후 페르소나 3 (이수진, 외부 운영자) 4주 사용 피드백
- Phase 20/21 우선순위 결정에 피드백 반영 (예: "Advisors보다 Data API 먼저")
- 피드백 수집 방법: GitHub Discussion + 주 1회 운영자 회의 + Slack 스레드

---

## 5. MVP 검증 기준 (Phase 17 GA 전 필수 달성)

Alpha(MVP) = v0.3.0 공개 전에 **반드시 달성할 12가지 조건**. `00-vision/10-14-categories-priority.md §7` + `05-100점-definition.md`.

### 5.1 필수 달성 기준 12개

1. **MFA 3종 완전 작동** — TOTP/WebAuthn/Rate Limit 동시 활성 + 백업 코드 8개 플로우
2. **시크릿 평문 제로** — VaultService를 거치지 않은 시크릿이 DB/로그에 존재 0건
3. **JWKS 서명 체인 완전** — Auth JWT가 JWKS ES256 키로만 서명 + `/.well-known/jwks.json` 엔드포인트 응답 검증
4. **5초 롤백 드릴 성공** — canary 환경에서 Capistrano symlink swap 실측 ≤5s
5. **Auth Core 90점** — Session/Password/Anonymous/RLS 기본 완성
6. **Storage 90점** — SeaweedFS + 10MB 업로드 + B2 오프로드
7. **감사 로그 14일 보관** — mfa_enabled, login, file_upload 등 이벤트 영구 기록
8. **로그인 전체 P95 <1s** — 비밀번호 → MFA → Session 생성 전체
9. **파일 업로드 10MB <3s** — WSL2 로컬 측정 (Cloudflare Tunnel 포함 <5s)
10. **Prisma 마이그 3개 이상 성공** — 15-A(totp) + 15-B(webauthn) + 16(vault_secrets) down 가능
11. **NFR-SEC.1~10 전수 충족** — Wave 3 보안 NFR 10건
12. **canary 5일 관측 통과** — 10%→50% 점진, p95 <500ms, error <0.1%

### 5.2 권장 기준 (선택적, GA까지 누적)

- Playwright E2E 15개 이상
- Lighthouse 90+ (홈/대시보드/로그인)
- WCAG 2.2 AA 초기 감사 통과
- 외부 운영자 1명 사전 사용 (피드백)
- Sentry 통합 (에러 0건 확인)

### 5.3 MVP 선언 권한자

- **1인 운영자** (페르소나 1, 김도영) — 실제 운영 적용 결정
- 체크리스트 12건 중 11+ 달성 + 선언 문서 커밋 → `_CHECKPOINT_KDYWAVE.md wave_5_mvp_declared` 필드 추가

---

## 6. Canary 배포 프로토콜 상세

### 6.1 3-단계 점진 롤아웃

```
[v0.X.Y 빌드] → canary.stylelucky4u.com 배포 (0% → 10% 즉시)
                              │
                              ▼ 72h 관측
                      [10% 단계 통과 조건]
                      - p95 <500ms
                      - error <0.1%
                      - 0 crash
                              │
                              ▼ 자동 전환
                      [50% 단계 24h 관측]
                              │
                              ▼ 통과
                      [production 100% 전환]
                              │
                              ▼ 즉시 symlink swap
                      [previous release 3일 보관]
                      → 3일 후 자동 삭제 (디스크 절약)
```

### 6.2 Cloudflare Worker 트래픽 분할 구현

```typescript
// cloudflare-worker/traffic-split.ts
// 10% canary 예시
const CANARY_PERCENT = Number(env.CANARY_PERCENT || 0);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cfRay = request.headers.get('cf-ray') ?? '';
    const hash = await sha256(cfRay);
    const bucket = parseInt(hash.slice(0, 2), 16) % 100; // 0~99

    const target = bucket < CANARY_PERCENT
      ? 'https://canary.stylelucky4u.com'
      : 'https://stylelucky4u.com';

    return fetch(new Request(target + new URL(request.url).pathname, request));
  }
};
```

`04-integration/02-cloudflare-deployment-integration.md §Canary` 상세.

### 6.3 시간차 롤아웃 정책

| 릴리스 유형 | 10% 체류 | 50% 체류 | 100% 전환 |
|----------|--------|--------|---------|
| alpha (v0.1~0.2) | 72h | 24h | 전환 |
| beta (v0.4~0.5) | 168h (7일) | 48h | 전환 |
| rc (v0.6~0.9) | 120h (5일) | 24h | 전환 |
| GA (v1.0) | 336h (14일) | 72h | 전환 |
| 핫픽스 (v1.0.1) | 24h | 12h | 전환 |

### 6.4 Canary 지표 모니터링

```
┌─────────────────────────────────────────────────┐
│  canary.stylelucky4u.com 실시간 모니터링         │
├─────────────────────────────────────────────────┤
│ 지표                  │ 임계값      │ 동작        │
│ HTTP 5xx 비율         │ >0.1%      │ 자동 롤백   │
│ p95 응답 시간         │ >500ms     │ 경보       │
│ p99 응답 시간         │ >2000ms    │ 자동 롤백   │
│ PM2 crash 카운트      │ >3 / 10m   │ 자동 롤백   │
│ 메모리 사용           │ >90%       │ 자동 롤백   │
│ Sentry 에러 신규 발견 │ >10 / 1h   │ 경보       │
│ Core Web Vitals       │ LCP >4s    │ 경보       │
│ 404 비율              │ >0.5%      │ 경보       │
└─────────────────────────────────────────────────┘
```

경보 채널: Slack `#canary-alerts`. 자동 롤백 후 즉시 Slack 메시지 + 운영자에게 이메일 발송 (env `CANARY_ALERT_EMAIL`).

---

## 7. 릴리스 노트 템플릿

### 7.1 표준 릴리스 노트 포맷

```markdown
# v{VERSION} ({CODENAME}) — {DATE}

## 릴리스 메타

- **버전**: v{VERSION}
- **코드명**: {CODENAME}
- **Phase**: {PHASE_NUMBER}
- **릴리스 날짜**: {DATE}
- **채널**: {CHANNEL} (canary 통과 후 production)
- **Git 태그**: https://github.com/...tree/v{VERSION}

## 주요 기능 (FR 단위)

### 새 기능
- FR-6.1 TOTP MFA 지원 (PR #NN) — otplib 기반, QR 코드 UI 포함
- FR-6.2 WebAuthn/Passkey 인증 (PR #NN) — @simplewebauthn/server
- FR-6.3 Rate Limit 기본 구현 (PR #NN) — DB 기반 (IP+사용자)

### 개선
- (해당 릴리스의 개선점)

### 버그 수정
- (해당 릴리스의 수정점)

## 아키텍처 결정 (ADR) 변경

- ADR-007 (Auth Advanced TOTP+WebAuthn+RL) — 구현 시작
- ADR-XXX — 새 ADR 등록

## 해결된 DQ

- DQ-AA-1 TOTP 시드 저장 위치 → Vault 연동 (Phase 16)
- DQ-AA-4 백업 코드 생성 수량 → 8개 확정

## 성능 벤치마크

| 지표 | 이전 버전 | v{VERSION} | 변화 |
|------|---------|-----------|------|
| 로그인 p95 | — | 180ms | 신규 |
| MFA 검증 p95 | — | 150ms | 신규 |

## 알려진 이슈

- (해당 릴리스 시점 미해결 이슈)

## 마이그레이션 가이드

### DB 마이그레이션

```bash
npx prisma migrate deploy
```

### 환경 변수 추가

```bash
FEATURE_MFA_TOTP=1
FEATURE_MFA_WEBAUTHN=1
FEATURE_MFA_RATE_LIMIT=1
```

### 롤백 방법

```bash
./scripts/rollback.sh v{PREVIOUS_VERSION}
```

## 감사

- 1인 운영자: 김도영
- Wave 1-4 에이전트 기여

---

릴리스 담당: 김도영 ([GitHub](https://github.com/kimdooo-a))
```

### 7.2 릴리스 노트 작성 체크리스트

```
□ 메타 정보 완성 (버전, 코드명, 날짜)
□ 새 기능 FR 번호 명시
□ 개선/버그 섹션 구분
□ ADR 변경 추적
□ DQ 해결 목록 명시
□ 벤치마크 표 (이전 버전 대비)
□ 알려진 이슈 정직하게 기록
□ 마이그레이션 가이드 (DB + env)
□ 롤백 명령 명시
□ 한국어 (CLAUDE.md 규칙)
□ Git 태그 링크
```

### 7.3 릴리스 노트 배포 위치

- **GitHub Release**: 각 버전 Git 태그에 첨부
- **CHANGELOG.md**: 프로젝트 루트 (누적)
- **운영자 Slack**: `#releases` 채널 자동 포스팅
- **Website**: `stylelucky4u.com/changelog` (선택적, Phase 21에서 UX Quality)

---

## 8. 릴리스 회고 프로세스

각 릴리스 후 **2주 내 회고 미팅** (1인 운영이지만 문서 회고):

### 8.1 회고 체크리스트

```
□ 계획 공수 vs 실제 공수 (±% 차이)
□ 발견된 버그 건수 (canary / production)
□ 자동 롤백 발동 여부
□ 사용자 피드백 요약
□ DQ 신규 발생 여부 (있으면 07-dq-matrix.md 업데이트)
□ ADR 재검토 트리거 발동 여부
□ 다음 릴리스에 반영할 학습 사항
□ _CHECKPOINT_KDYWAVE.md 업데이트
```

### 8.2 회고 결과 기록 위치

- `docs/logs/YYYY-MM.md` — 세션별 상세 로그
- `docs/status/current.md` — 세션 요약표 1행 추가
- `docs/handover/YYYY-MM-DD-release-v{VERSION}.md` — 인수인계서

---

## 9. 비상 릴리스 프로토콜 (핫픽스)

### 9.1 핫픽스 트리거

- Production 크리티컬 버그 (데이터 손실, 보안 취약점, 100% 장애)
- STRIDE TOP 10 위협 실현
- 외부 의존성 긴급 패치 (CVE, Node.js 보안 패치)

### 9.2 핫픽스 절차

```
1. 브랜치 생성: hotfix/v{VERSION}-{ISSUE}
2. 최소 변경 (1~3 파일)
3. 단위 테스트 + E2E smoke 통과
4. 패치 버전 증가 (v1.0.0 → v1.0.1)
5. canary 24h 단축 (emergency 시 12h)
6. production 전환
7. PIR (Post-Incident Review) 2주 내
```

### 9.3 Emergency 롤백 (30초 이내)

```bash
# /etc/luckystyle4u/scripts/emergency-rollback.sh
#!/bin/bash
cd /var/www/luckystyle4u
PREVIOUS=$(readlink previous)
ln -sf "$PREVIOUS" current
pm2 reload luckystyle4u-dashboard --update-env
curl -X POST https://hooks.slack.com/... -d '{"text":"EMERGENCY ROLLBACK"}'
```

---

## 10. 릴리스 전략 거버넌스

### 10.1 릴리스 승인권

| 릴리스 유형 | 승인권자 | 근거 |
|----------|--------|-----|
| alpha/beta/rc | 1인 운영자 단독 | 내부·테스트 용도 |
| GA (v1.0.0) | 1인 운영자 + MVP 체크리스트 12건 달성 | 프로덕션 전환 |
| 핫픽스 | 1인 운영자 단독 (emergency 가능) | 긴급 대응 |
| 메이저(v2.0.0) | 1인 운영자 + ADR 재검토 4건+ | 파괴적 변경 |

### 10.2 릴리스 문서 유지 정책

- 릴리스 노트는 GitHub Release + CHANGELOG.md 이중 기록
- **역사 삭제 금지** (CLAUDE.md 루트 원칙)
- Git 태그는 영구 보존
- 롤백 당한 버전도 태그 유지 + 릴리스 노트에 "롤백됨" 주석

### 10.3 릴리스 실패 정의

릴리스를 **실패**로 간주하는 조건:

- canary 단계에서 자동 롤백 발생 → 릴리스 노트에 "롤백됨" 표시
- production 전환 후 48시간 내 핫픽스 필요 → 부분 실패
- production 전환 후 7일 내 롤백 → 완전 실패

실패 발생 시 `docs/handover/YYYY-MM-DD-release-failure-v{VERSION}.md` 인수인계 작성 필수.

---

## 11. 릴리스 노트 예시 (v0.1.0-alpha.1 Nocturne 샘플)

아래는 Phase 15 완료 시 작성할 **실제 릴리스 노트 예시**:

```markdown
# v0.1.0-alpha.1 (Nocturne) — 2026-05-16

## 릴리스 메타

- **버전**: v0.1.0-alpha.1
- **코드명**: Nocturne (야상곡, 보안 기반 첫 빛)
- **Phase**: 15 (Auth Advanced MVP)
- **릴리스 날짜**: 2026-05-16 (Week 4 종료)
- **채널**: canary 3일 관측 후 production 전환
- **Git 태그**: https://github.com/.../tree/v0.1.0-alpha.1

## 주요 기능 (FR 단위)

### 새 기능
- FR-6.1 TOTP MFA 지원 — otplib 기반, QR 코드 UI, 백업 코드 8개
- FR-6.2 WebAuthn/Passkey 인증 — @simplewebauthn/server 7.x
- FR-6.3 Rate Limit DB 기반 — IP + 사용자 2중 제한 (15분 슬라이딩 윈도우)
- FR-6.5 MFA 이벤트 감사 로그 — mfa_enabled/disabled 기록

## 아키텍처 결정 (ADR) 변경

- ADR-007 (Auth Advanced TOTP+WebAuthn+RL) — Accepted + 구현 시작

## 해결된 DQ

- DQ-AA-4: 백업 코드 수량 → 8개 확정 (Wave 4 B1)
- DQ-AA-8: JWT refresh revokedAt+tokenFamily 하이브리드 (Wave 4 B1)

## 성능 벤치마크

| 지표 | 목표 | 실측 | 판정 |
|------|-----|-----|-----|
| 로그인 p95 | <1000ms | 180ms | ✅ |
| MFA 검증 p95 | <200ms | 150ms | ✅ |
| Rate Limit 차단 | 1분당 >10회 | 10회 차단 | ✅ |

## 알려진 이슈

- MFA 시드는 임시 평문 저장 (Phase 16 Vault 완성 후 암호화 마이그)
- WebAuthn Conditional UI 미지원 (Phase 22 이연, DQ-AA-9)

## 마이그레이션 가이드

### DB 마이그레이션

```bash
npx prisma migrate deploy
# 생성: totp_secrets, webauthn_credentials, rate_limits, backup_codes
```

### 환경 변수

```bash
# /etc/luckystyle4u/secrets.env
FEATURE_MFA_TOTP=1
FEATURE_MFA_WEBAUTHN=1
FEATURE_MFA_RATE_LIMIT=1
```

### 롤백

```bash
./scripts/rollback.sh v0.0.0
# 주의: MFA 등록 사용자의 시드가 유지되지만, 애플리케이션은 검증 불가
```

## 감사

- 운영자: 김도영
- Wave 1-4 에이전트 (B1, Tier 2 보안)

---

릴리스 담당: 김도영
```

---

## 12. 릴리스 계획 확정 사항

본 문서에서 명시적으로 확정하는 릴리스 결정:

### 결정 1: 9개 릴리스 (v0.1.0~v1.1.0) 명칭 고정

- 근거: Phase 15~22 + GA + 선택적 P2 백로그
- 재검토 트리거: Phase 종료 공수 ±30% 이탈

### 결정 2: canary 체류 시간 단계별 차등

- 근거: 릴리스 위험도에 따라 3일(alpha) / 7일(beta) / 5일(rc) / 14일(GA)
- 재검토 트리거: canary에서 자동 롤백 3회+ 발생 시 기간 2배 연장

### 결정 3: 피처 플래그 env 토글 채택

- 근거: Wave 2 D 매트릭스, CON-9 비용 상한
- 재검토 트리거: Phase 20+ 실험 수 >20 시 SaaS 플래그 재검토

### 결정 4: 릴리스 노트 한국어

- 근거: CLAUDE.md 루트 규칙
- 재검토 트리거: 외부 기여자 3명+ 시 이중 언어

### 결정 5: 5초 롤백 SLA

- 근거: ADR-015 Capistrano 5초 롤백
- 재검토 트리거: 실제 롤백 시간 >10s 2회 연속 발생

---

> **작성**: Wave 5 R1 (Roadmap Lead) · 2026-04-18
> **총 줄 수 목표**: ~800줄 이상
> **근거 문서**: `00-roadmap-overview.md` (본 릴리스 계획의 상위) + Wave 1-4 전체
> **다음 문서**: [02-milestones.md](./02-milestones.md) — M1~M16 마일스톤 + 크리티컬 패스 + 간트
