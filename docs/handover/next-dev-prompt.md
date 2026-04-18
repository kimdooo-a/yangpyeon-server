# 다음 세션 프롬프트

> 이 파일을 복사하여 새 세션 시작 시 Claude에게 전달합니다.
> 세션 종료 시 반드시 갱신합니다.

---

## 프로젝트 컨텍스트

- **프로젝트명**: 양평 부엌 서버 대시보드
- **스택**: Next.js 16 + TypeScript + Tailwind CSS 4 + PostgreSQL (Prisma 7) + SQLite (Drizzle)
- **설명**: WSL2 서버 모니터링 대시보드 (stylelucky4u.com)

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
| 로그인 | kimdooo@stylelucky4u.com / Knp13579!yan |

## 필수 참조 파일 ⭐ 세션 33 종료 시점 — Phase 15 Step 3-6 대부분 완료

```
CLAUDE.md
docs/status/current.md
docs/handover/260419-session33-phase15-step3-4-5.md              ⭐ 최신 (JWKS + TOTP MFA + WebAuthn + Step 6 병합)
docs/handover/260419-session32-phase15-step1-2.md                (세션 32 Prisma Session + argon2id)
docs/handover/260419-session31-cleanup-safeguard-adr-reflect.md  (세션 31 safeguard + ADR/DQ 반영)
docs/handover/260419-session30-spike-priority-set.md             (세션 30 스파이크 7건 완결)
docs/research/_SPIKE_CLEARANCE.md                                ⭐ 15 엔트리 (9 기존 + 7 세션30 신규)
docs/research/spikes/spike-014-jwks-cache-result.md              ⭐ 세션 33 구현 반영
docs/research/spikes/spike-015-session-index-result.md           ⭐ 세션 32 구현 반영
docs/research/spikes/spike-011-argon2-result.md                  ⭐ 세션 32 구현 반영
docs/research/spikes/spike-013-wal2json-slot-result.md           ⭐ Pending (물리 측정)
docs/research/spikes/spike-016-seaweedfs-50gb-result.md          ⭐ Pending (물리 측정)
docs/research/2026-04-supabase-parity/02-architecture/01-adr-log.md    ⭐ ADR-001~019
docs/research/2026-04-supabase-parity/02-architecture/03-auth-advanced-blueprint.md  ⭐ §7.2.1~7.2.3
docs/research/2026-04-supabase-parity/00-vision/07-dq-matrix.md       ⭐ DQ-AC-1/AC-2/4.1/12.4 Resolved
docs/solutions/2026-04-19-*.md (5건)                             ⭐ Compound Knowledge 5건
docs/security/skill-audit-2026-04-19.md                          ⭐ /ypserver safeguard 감사 PASS
docs/MASTER-DEV-PLAN.md
```

## 현재 상태 (세션 33 종료 시점)

### 완료된 Phase
- Phase 1~14c-γ 전부 완료
- **kdywave Wave 1-5 완주**: 123 문서 / 106,588줄
- **세션 30**: 우선 스파이크 7건 완결 (5 실측 + 2 축약)
- **세션 31**: safeguard + ADR/DQ 반영 + CK 5건 (타 터미널)
- **세션 32**: Phase 15 Step 1-2 — Prisma Session + argon2id 자동 재해시
- **세션 33** ⭐ — Phase 15 Step 3·4·5 서버측 완결 + 타 터미널 Step 6 병합
  - **Step 3 JWKS**: `JwksKey` Prisma 모델 + `/api/.well-known/jwks.json` + ES256 + kid 분기 + HS256 legacy fallback
  - **Step 4 TOTP MFA (FR-6.1)**: 3 모델 + `otplib@12.0.1` + `qrcode` + AES-256-GCM 암호화 + 10 recovery codes + 5분 challenge JWT + 5 API routes + E2E 6건 PASS
  - **Step 5 WebAuthn (FR-6.2)**: 2 모델 + `@simplewebauthn/server@10.0.1` + 4 API routes + login hasPasskey 분기
  - **Step 6 Rate Limit (FR-6.3)** [타 터미널]: `src/lib/mfa/lock-policy.ts` + `src/lib/rate-limit-guard.ts` + `rate-limit-db.ts` + login/challenge/assert-verify에 `applyRateLimit` 주입
  - **통합 결과**: tsc 0 / vitest 131→**175 PASS**(+44) / 3 migration 전 적용 / MFA_MASTER_KEY 64 hex 생성·배포

## 추천 다음 작업

### 우선순위 1: MFA UI 통합 ⭐ 즉시 착수 가능

서버측 Step 3-6 완결. 브라우저 WebAuthn API 연동만 남음:

- **설정 페이지** (`/settings/mfa`):
  - TOTP: `/api/v1/auth/mfa/enroll` 호출 → `qrDataUrl` 표시 → 사용자 Authenticator 앱 스캔 → 6자리 코드 입력 → `/confirm` 호출 → 복구 코드 10개 1회 노출
  - Passkey: `@simplewebauthn/browser` 설치 → `startRegistration()` → `/register-options` + `/register-verify` 흐름
  - MFA 해제: password + TOTP 재확인 → `/disable` (DELETE)
- **로그인 2FA 화면**:
  - `/login` POST 응답에 `mfaRequired: true, methods: ["totp", "recovery", "passkey"]` 있으면 별도 단계 렌더
  - methods 리스트 기반 탭(TOTP / Passkey / Recovery) 분기
  - Passkey: `startAuthentication()` → `/assert-options` + `/assert-verify` 흐름
  - TOTP/Recovery: 입력 → `/challenge` 흐름
- **Admin UI** (`/members/[id]`): MFA reset 버튼 (`/api/admin/users/[id]/mfa/reset`)

**DOD**: 브라우저 실제 WebAuthn authenticator(iCloud Keychain / Google Passkey / YubiKey) full round-trip PASS. 인증·등록·어설션 프로덕션 검증.

### 우선순위 2: Compound Knowledge 3건 작성 (30분)

세션 33 산출:
```
docs/solutions/2026-04-19-otplib-v13-breaking-noble-plugin.md
docs/solutions/2026-04-19-simplewebauthn-v10-api-shape.md
docs/solutions/2026-04-19-mfa-challenge-token-2fa-pattern.md
```

### 우선순위 3: Phase 15 Step 6 Rate Limit 마감 (잔여)

타 터미널이 시작한 `lock-policy` + `rate-limit-guard` + `rate-limit-db` 확장:
- login endpoint 자체 rate limit (IP + email 양면 카운트) — **이미 적용됨**
- MFA challenge `applyRateLimit` + `lockedUntil` UI 반영
- WebAuthn assert-verify rate limit — **이미 적용됨**
- audit log 액션 추가 (`MFA_LOCKED`, `LOGIN_RATE_LIMITED`)
- Blueprint §8.3 대조 완결

### 우선순위 4: SP-013/016 물리 측정 (13h, 환경 확보 시)
- **SP-013 wal2json** (5h): PG + wal2json 설치 + 30분 DML + 슬롯 손상 recovery
- **SP-016 SeaweedFS 50GB** (8h): weed 설치 + 50GB 디스크 + B2 오프로드

### 우선순위 5: 세션 32 Compound Knowledge 1건 (30분, 미작성)
```
docs/solutions/2026-04-19-bcrypt-argon2-progressive-rehash-merged-update.md
```
lastLoginAt update에 passwordHash 조건부 머지로 자동 재해시 round-trip 0개 압축.

### 우선순위 6: `/kdygenesis --from-wave` 연계
입력: `07-appendix/03-genesis-handoff.md` _PROJECT_GENESIS.md 초안 (85+ 태스크)
산출: 주간 실행 플로우

### 진입점 예시
```
# MFA UI 구현 (우선순위 1 Step a: TOTP 설정 페이지)
# 1. @simplewebauthn/browser 설치
# 2. /settings/mfa 페이지 생성 (클라이언트 컴포넌트)
# 3. /api/v1/auth/mfa/enroll + confirm 연결
# 4. 복구 코드 1회 노출 UI (복사 버튼 + 확인 체크)
# 5. Passkey 등록 (startRegistration → register-options → register-verify)
```

## 알려진 이슈 및 주의사항

### 세션 33 신규
- **MFA_MASTER_KEY 필수** — WSL2 `~/dashboard/.env`에 64 hex 설정 완료. 서버 재구축 시 동일 키 복원 필요 (기존 TOTP secret 전부 복호화 불가). PM2 `env_file` 또는 `/etc/luckystyle4u/secrets.env` 이전 권장
- **WebAuthn rpID 도메인 엄격** — production=`stylelucky4u.com`, localhost 분리. `WEBAUTHN_RP_ID`/`WEBAUTHN_ORIGIN`/`WEBAUTHN_RP_NAME` 오버라이드. 서브도메인·포트 변경 시 등록된 credential 전부 무효
- **otplib v13 금지** — v13은 `authenticator` export 제거 + Noble crypto plugin 의무 breaking. 패키지 업그레이드 시 v12 고정 유지 (`otplib@^12.0.1`). 이 프로젝트는 `@otplib/core` 에서 `HashAlgorithms` import
- **MFA 경로는 `/api/v1/auth/mfa/*`** — proxy.ts CSRF 체크 `/api/*`에 적용, `/api/v1/*`만 면제. Bearer 기반 관리 엔드포인트는 v1 네임스페이스 강제
- **WebAuthn challenge PG 저장** — 단일 노드 기준. 다중 노드 확장 시 Redis 이관 (Blueprint 명시)
- **HS256 legacy 쿠키 자연 만료** — 세션 33 이후 신 쿠키는 ES256(kid), 기 발급 HS256은 24h 만료까지 허용. AUTH_SECRET 제거 시점은 후속 세션

### 세션 32 신규
- **Sessions 테이블 미사용 상태** — 인프라만. 첫 INSERT는 Phase 15-D Refresh Rotation 도입 시
- **`cleanupExpiredSessions()` 미스케줄** — Sessions INSERT 시작 시점에 node-cron 등록
- **`@node-rs/argon2` const enum 회피** — `const ARGON2ID_ALGORITHM = 2` 상수 캡슐화
- **자동 재해시 첫 1회 느림** — bcrypt 검증 + argon2 hash ≈ 190ms, 2차부터 argon2 verify ≈ 14ms
- **자동 재해시 round-trip 0개 압축** — lastLoginAt update에 머지. CK 후보 미작성

### 세션 31 신규
- **글로벌 스킬 git 미추적** — `~/.claude/skills/ypserver/SKILL.md` 수정은 저장소에 없음. `kdysync` 동기화 필요
- **병렬 터미널 분담 원칙** — 같은 파일 동시 편집 시 "File has been modified" 오류
- **`.playwright-mcp/` 기 tracked 파일 제거 완료** — `cadb8ad`로 저장소 정리

### 세션 30 신규
- ~~**⚠️ PM2 v6.0.14 `delete all --namespace X` 필터 무시 버그**~~ — **세션 31 `/ypserver` §4 safeguard 내재화**
- ~~**argon2 사실관계 정정**~~ — **세션 31 ADR-019 + ADR-006 보완**
- ~~**JWKS grace**~~ — **세션 31 Auth Advanced Blueprint §7.2.1 반영 + 세션 33 코드화**
- ~~**PG partial index + NOW()**~~ — **세션 31 DQ-AC-2 Resolved + Blueprint §7.2.2 + 세션 32 인덱스 적용**
- **N-API prebuilt** — argon2/isolated-vm/better-sqlite3 모두 3~5초 설치. CK `2026-04-19-napi-prebuilt-native-modules.md` 참조
- **SP-013/016 실측 대기** — `_SPIKE_CLEARANCE.md`에 Pending 엔트리

### 기존 (세션 29까지)
- **kdywave 완주**: Phase 0-4 전체. 123 문서 / 106,588줄
- **Wave 5 이중 관점 문서화**: 05-roadmap/ 4 파일 쌍(28-1 + 28-2) 병합 금지
- **DQ-12.3 MASTER_KEY**: `/etc/luckystyle4u/secrets.env` (root:ypb-runtime 0640) + PM2 `env_file`
- **Compound Knowledge 누적 12건** (외부 7 + 세션 30→31 5건)
- **raw SQL UPDATE auto-bump**: `src/app/api/v1/tables/[table]/[pk]/route.ts` PATCH
- **CSRF 경로 구분**: `/api/v1/*`만 CSRF 면제. `/api/auth/*`는 Referer/Origin 필수
- **WSL auto-shutdown + /tmp 휘발**: E2E 스크립트는 단일 호출 내부로 통합 필수
- **`DATABASE_URL?schema=public` 비호환**: psql 직접 호출 시 `sed 's/?schema=public//'` 전처리
- **Cloudflare Tunnel 간헐 530**: "100% 보증 아님, 확률적 매우 높음"
- **Vercel plugin 훅 false positive**: 프로젝트 Vercel 미사용
- **information_schema 롤 필터링**: introspection은 `pg_catalog` 사용
- **Windows `next build` 불가**: WSL2 빌드가 진실 소스 (`/ypserver --skip-win-build`)
- **proxy.ts `runtime` 선언 금지**: Next.js 16 proxy.ts는 암시적 Node.js 런타임

## 사용자 기록 (메모리)

- [자율 실행 우선](../../../../Users/smart/.claude/projects/E--00-develop-260406-luckystyle4u-server/memory/feedback_autonomy.md) — 분기 질문 금지, 권장안 즉시 채택 (파괴적 행동만 예외)

---
[← handover/_index.md](./_index.md)
