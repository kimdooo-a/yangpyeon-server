# 01. 마일스톤 WBS — 양평 부엌 서버 대시보드 (Supabase 100점 동등성)

> ⚠️ **ADR-015 부분 대체 통지 (2026-04-25, 세션 51)**: 본 문서가 참조하는 *Capistrano-style symlink/releases* 배포 메커니즘은 [ADR-020](../02-architecture/01-adr-log.md) (Next.js standalone + rsync + pm2 reload, 세션 50)에 의해 부분 대체. PM2 cluster:4 / canary 서브도메인은 유효. 4 재진입 트리거(트래픽 100만+/팀 2명+/3환경/B2B) 충족 시 Capistrano 경로 재가동 가능.

> Wave 5 · R1-B 산출물 (Sonnet 분할 재발사)
> 작성일: 2026-04-18 (세션 28)
> 상위: [CLAUDE.md](../../../../CLAUDE.md) → [docs/research/](../../) → [2026-04-supabase-parity/](../) → [05-roadmap/](./) → **이 문서**
> 연관: [00-roadmap-overview.md](./00-roadmap-overview.md) · [../02-architecture/](../02-architecture/) 청사진 16건
> 입력: Wave 4 Blueprint 03~16 (Phase 15~22) + Vision 우선순위 문서

---

## 1. 요약

본 문서는 양평 부엌 서버 대시보드의 **Supabase 100점 동등성 달성을 위한 전체 마일스톤 WBS(Work Breakdown Structure)**이다. Wave 1~4에서 확정된 14개 카테고리 청사진을 기반으로, M1~M8 총 8개 마일스톤과 Phase 15~22의 세부 태스크를 단일 문서로 통합한다.

핵심 수치 요약:

- 마일스톤: **8개** (M1 Auth Advanced → M8 100점 보너스)
- 총 공수: **870~874h** (마이그레이션 35~39h 분산 포함)
- 전체 기간: **약 50~52주** (1인 운영, 주 17~18h 풀타임 기준) / **약 87~109주** (주 8~10h 사이드 기준)
- 릴리스 단계: v0.1.0 MVP (Phase 15~17) → v0.2.0 Beta (Phase 18~19) → v1.0.0 GA (Phase 20~22)
- 크리티컬 패스: M1→M2→M3 (MVP 18주) → M4 (Beta +22주) → M5→M6→M7→M8 (GA +12주)
- 14개 카테고리 전체 90점 이상 달성이 v1.0.0 GA 기준이며, Phase 22 보너스에서 100점 완성

---

## 2. 마일스톤 매트릭스

| ID | Phase | 카테고리 (점수 목표) | 공수 | 의존성 | 완료 기준 | 릴리스 태그 | 시작 가능 시점 |
|----|-------|-------------------|------|--------|----------|-----------|-------------|
| M1 | 15 | Auth Advanced (15→60점) | 22h | 없음 (Auth Core 70점 기존 운영 중) | TOTP/WebAuthn/Rate Limit E2E PASS, 백업 코드 8개 사용 확인 | v0.1.0-alpha | 즉시 착수 |
| M2 | 16 | Observability (65→85점) + Operations (80→95점) | 40h | M1 완료 (JWKS가 MFA 토큰 검증에 필요) | Vault AES-256-GCM PASS, JWKS 엔드포인트 활성, Capistrano dry-run 성공, PM2 cluster:4 가동 | v0.1.0-alpha | M1 완료 후 |
| M3 | 17 | Auth Core (70→90점) + Storage (40→90점) | 60h | M2 완료 (Vault MASTER_KEY 필요, 롤백 안전망 확보 후 대규모 배포) | Session 테이블+디바이스 관리 PASS, SeaweedFS 단일 인스턴스 가동, B2 오프로드 설정 완료 | v0.1.0 MVP | M2 완료 후 |
| M4 | 18 | SQL Editor (70→100점) + Table Editor (75→100점) | 400h | M3 완료 (Auth Core 기반 완성 후 에디터 구현) | 14c~14f 4단계 완료 (EXPLAIN 시각화 + AI 어시스턴트), Table Editor 14d/14e 완료, CSV import/export PASS | v0.2.0-beta | M3 완료 후 |
| M5 | 19 | Edge Functions (45→92점) + Realtime (55→100점) | 75h | M3+M4 완료 (Storage 접근 패턴 + spike-005/008 통과) | isolated-vm v6 L1 안정, Deno 사이드카 L2 가동, wal2json CDC 통합, 폴링 폴백 작동 확인 | v0.2.0-beta | spike-005/008 통과 후 |
| M6 | 20 | Schema Viz (65→95점) + DB Ops (60→95점) + Advisors (65→95점) | 198h | M4 완료 (Table Editor 컴포넌트 공유, SQL Editor 컨텍스트 활용) | 3 카테고리 모두 95점 이상, schemalint+squawk+splinter 3-Layer 통합, wal-g PITR 60s RPO 달성 | v1.0.0-rc | M5 완료 후 |
| M7 | 21 | Data API (45→85점) + UX Quality (75→95점) | 40h | M5+M6 완료 (Realtime CDC 채널 + 전체 기능 안정화 후 AI 어시스턴트 도입) | REST 강화+pgmq 워커 PASS, AI SDK v6 Studio Assistant 가동, 비용 가드 $5/월 상한 확인 | v1.0.0-rc | M6 완료 후 |
| M8 | 22 | 보너스 100점 완성 | ~30h | M7 완료 (전체 기능 완성 후 조건부 기능 추가) | pg_graphql 수요 트리거 2+ 충족 시 활성화, OAuth Naver/Kakao 연동, 잔여 갭 처리 | v1.0.0 GA | M7 완료 후 |

**공수 합계**: 22+40+60+400+75+198+40+30 = **865h + 마이그레이션 35~39h = 870~874h**

---

## 3. Phase 15 (Auth Advanced 22h) 정밀 WBS

### 3.1 Phase 15 개요

**목표**: Auth Advanced 15점 → 60점 (+45점, 총 22h, 5일)
**근거**: `03-auth-advanced-blueprint.md §1.2 Phase 15 목표 달성 경로`
**채택안**: otplib@12 (4.60/5) + SimpleWebAuthn@10 (4.64/5) + rate-limiter-flexible@5 (4.52/5)
**산출물 디렉토리**: `src/lib/auth/advanced/` (6개 모듈)

### 3.2 Phase 15-A: TOTP (4h) — Day 1

**달성 점수**: +12점 (15→27점)

| 태스크 ID | 태스크 명 | 공수 | 산출물 경로 |
|----------|---------|------|-----------|
| 15-A-1 | otplib@12 설치 + base32 secret 생성 모듈 구현 | 1h | `src/lib/auth/advanced/TOTPService.ts` |
| 15-A-2 | QR 코드 UI 컴포넌트 + Authenticator 앱 등록 흐름 (qrcode 라이브러리 연동) | 2h | `src/components/auth/TOTPEnrollModal.tsx` |
| 15-A-3 | TOTP 검증 로직 (window:1 허용, ±30초 drift) + 검증 API 라우트 | 1h | `src/app/api/v1/auth/mfa/totp/verify/route.ts` |

**DOD (Definition of Done)**: Google Authenticator 앱으로 등록 → 6자리 코드 입력 → 검증 성공. window:1 외 코드는 429 반환.

### 3.3 Phase 15-B: WebAuthn/Passkey (8h) — Day 2~3

**달성 점수**: +15점 (27→42점)

| 태스크 ID | 태스크 명 | 공수 | 산출물 경로 |
|----------|---------|------|-----------|
| 15-B-1 | @simplewebauthn/server@10 + @simplewebauthn/browser@10 설치, RP ID = `stylelucky4u.com` 설정, RP Name = `양평 부엌 서버` | 1h | `src/lib/auth/advanced/WebAuthnService.ts` |
| 15-B-2 | 등록 challenge 생성 API (`/api/v1/auth/mfa/webauthn/register-options`) + `verifyRegistrationResponse` 서버 검증 구현 | 3h | `src/app/api/v1/auth/mfa/webauthn/register-options/route.ts` |
| 15-B-3 | 인증 challenge 생성 API (`/api/v1/auth/mfa/webauthn/auth-options`) + `verifyAuthenticationResponse` 서버 검증 구현 | 3h | `src/app/api/v1/auth/mfa/webauthn/verify/route.ts` |
| 15-B-4 | Prisma `WebAuthnCredential` 모델 (userId, credentialId, publicKey, counter, deviceType) + 1인 최대 5 credential 등록 한도 강제 | 1h | `prisma/schema.prisma` 모델 추가 |

**DOD**: Touch ID (macOS/iOS), Windows Hello, YubiKey 5 NFC 세 종류 Authenticator 모두 등록+인증 PASS.

### 3.4 Phase 15-C: Rate Limit DB 기반 (6h) — Day 4

**달성 점수**: +10점 (42→52점)

| 태스크 ID | 태스크 명 | 공수 | 산출물 경로 |
|----------|---------|------|-----------|
| 15-C-1 | rate-limiter-flexible@5 설치, `RateLimiterPostgres` 어댑터 설정 (points:5, duration:5, insuranceLimiter: in-memory fallback) | 1h | `src/lib/auth/advanced/RateLimitGuard.ts` |
| 15-C-2 | Next.js 미들웨어 통합 + IP 키(`x-forwarded-for`) + 사용자 ID 키 이중 제한 구현, 제한 초과 시 `Retry-After` 헤더 반환 | 3h | `src/middleware.ts` 확장 |
| 15-C-3 | Brute-force 시나리오 E2E 테스트 (5초 5회 시도 → 6회 째 429 확인) + 제한 해제 대기 시간 검증 | 2h | `tests/e2e/rate-limit.spec.ts` |

**DOD**: 5초 이내 5회 로그인 실패 → 6회째 429 Too Many Requests, `Retry-After: 300` 응답. 6분 후 재시도 정상 진행.

### 3.5 Phase 15-D: 백업 코드 + 감사 로그 (4h) — Day 5

**달성 점수**: +8점 (52→60점)

| 태스크 ID | 태스크 명 | 공수 | 산출물 경로 |
|----------|---------|------|-----------|
| 15-D-1 | 8개 백업 코드 생성 (`node:crypto.randomBytes(10)` base32), SHA-256 해시 DB 저장, 사용 후 `used: true` + `usedAt` 기록, 재발급 API | 2h | `src/lib/auth/advanced/MFABackupCodeService.ts` |
| 15-D-2 | 감사 로그 이벤트 3종 기록: `MFA_REGISTERED` (방식, userId), `MFA_VERIFIED` (방식, 소요ms), `MFA_FAILED` (방식, 사유, IP) — PG `audit_log` 테이블 append-only | 2h | `src/lib/audit/AuditLogger.ts` 확장 |

**DOD**: 백업 코드 1개 사용 → 감사 로그 `MFA_VERIFIED` 기록 확인, 동일 코드 재사용 시 `MFA_FAILED` 기록 + 코드 거부.

### 3.6 Phase 15 태스크 합계

- 총 태스크 수: **12개** (15-A: 3 + 15-B: 4 + 15-C: 3 + 15-D: 2)
- 총 공수: **22h**
- 점수 달성: 15 → **60점** (+45점)

---

## 4. Phase 16 (Observability 20h + Operations 20h = 40h) WBS

### 4.1 Phase 16 개요

**목표**: Observability 65→85점, Operations 80→95점 (총 40h, 6주 병렬 진행)
**근거**: `04-observability-blueprint.md §12` + `05-operations-blueprint.md §12`
**채택안**: node:crypto AES-256-GCM + jose JWKS ES256 (Observability) / Capistrano-style + PM2 cluster:4 (Operations)

### 4.2 Observability Phase 16-A: node:crypto Vault 구현 (8h)

**달성 점수**: Observability +10점

| 태스크 ID | 태스크 명 | 공수 | 비고 |
|----------|---------|------|------|
| 16-A-1 | KEK(Key Encryption Key)/DEK(Data Encryption Key) 모듈 구현 (AES-256-GCM, IV 96bit 랜덤, 태그 128bit), `VaultService.ts` 코어 작성 | 3h | `src/lib/vault/VaultService.ts` |
| 16-A-2 | MASTER_KEY 로딩 경로 구현: `/etc/luckystyle4u/secrets.env` (chmod 0640, owner root, group ypb-runtime), 미존재 시 서버 시작 거부 | 2h | `src/lib/vault/MasterKeyLoader.ts` |
| 16-A-3 | PM2 `ecosystem.config.js`의 `env_file` 옵션으로 secrets.env 주입, 프로세스 환경변수 경유 — git 저장소 외부 관리 | 1h | `ecosystem.config.js` 수정 |
| 16-A-4 | Vault 마이그레이션: `SecretItem` Prisma 모델 (id, name, encryptedValue, iv, tag, createdAt, rotatedAt), 기존 `.env` 시크릿 Vault로 이전 스크립트 | 2h | `prisma/schema.prisma` + 마이그 스크립트 |

### 4.3 Observability Phase 16-B: jose JWKS ES256 (12h)

**달성 점수**: Observability +10점 (합산 65→85점)

| 태스크 ID | 태스크 명 | 공수 | 비고 |
|----------|---------|------|------|
| 16-B-1 | ES256 키쌍 생성 (`jose.generateKeyPair('ES256')`), `KID = SHA-256(publicKey)[0:8]`, 90일 주기 회전 cron 등록 (`node-cron '0 0 1 */3 *'`) | 4h | `src/lib/auth/jwks/JWKSService.ts` |
| 16-B-2 | `/auth/.well-known/jwks.json` GET 엔드포인트 구현: 현재 활성 KID + grace 기간 내 구 KID 목록 반환, Cache-Control max-age=3600 | 3h | `src/app/auth/.well-known/jwks.json/route.ts` |
| 16-B-3 | refresh JWKS 동기화 로직: 키 회전 시 신규 KID 즉시 활성화 + 구 KID 3분 grace 유지 (DQ-12.13), 긴급 회전 시 세션 버전 무효화 | 3h | `src/lib/auth/jwks/JWKSRotation.ts` |
| 16-B-4 | JWKS 키쌍 Vault 암호화 저장 (`JWKSKey` 테이블, KEK 90일 회전 연동 — DQ-1.18 확정), Infrastructure UI에 JWKS KID 현황 카드 추가 | 2h | Vault 통합 + UI 카드 |

### 4.4 Operations Phase 16-C: Capistrano-style 배포 구조 (10h)

**달성 점수**: Operations +8점

| 태스크 ID | 태스크 명 | 공수 | 비고 |
|----------|---------|------|------|
| 16-C-1 | `releases/` 디렉토리 생성 (타임스탬프 네이밍 `YYYYMMDD-HHMMSS`), 릴리스별 빌드 아티팩트 배치, `current/` symlink 최초 생성 | 3h | 배포 스크립트 `scripts/deploy.sh` |
| 16-C-2 | `current` symlink 5초 atomic swap 스크립트 (`ln -sfn releases/<new>/ current && pm2 reload --update-env`), swap 실패 시 자동 이전 symlink 복원 | 2h | `scripts/rollback.sh` |
| 16-C-3 | `shared/` 디렉토리 구조 (env 파일 symlink, logs/ symlink, uploads/ symlink) — 빌드별 재생성 없이 유지 | 2h | 디렉토리 구조 설정 |
| 16-C-4 | 최신 5 release만 유지하는 rotate cleanup cron (`pm2 cron-worker` 또는 배포 후 자동 실행), 오래된 릴리스 자동 삭제 | 1h | `scripts/cleanup-releases.sh` |
| 16-C-5 | `/ypserver` 스킬 Deployment 페이지 연동 (`/dashboard/settings/deployments`) — 배포 이력 5건 + 롤백 버튼 UI | 2h | `src/app/dashboard/settings/deployments/page.tsx` |

### 4.5 Operations Phase 16-D: PM2 cluster + canary 배포 (10h)

**달성 점수**: Operations +7점 (합산 80→95점)

| 태스크 ID | 태스크 명 | 공수 | 비고 |
|----------|---------|------|------|
| 16-D-1 | PM2 `ecosystem.config.js` cluster:4 설정 (`instances: 4, exec_mode: 'cluster'`), cron-worker는 fork 모드 분리 | 2h | `ecosystem.config.js` |
| 16-D-2 | graceful reload 구현 (`SIGTERM` 핸들러 → 신규 요청 거부 → 처리 중 요청 완료 대기 → 종료), `/api/health` 응답 포함 ready 시그널 | 3h | `src/server.ts` + API 라우트 |
| 16-D-3 | canary 서브도메인 (`canary.stylelucky4u.com`) Cloudflare Tunnel에 추가, PM2 `canary` 앱 설정 (cluster:1, 구 버전 유지), Cloudflare Rule로 10% 트래픽 분산 | 2h | cloudflared config + CF 대시보드 |
| 16-D-4 | canary 메트릭 임계 설정 (에러율 2%+ 또는 p95 > 2s 5분 유지 → 자동 롤백), 자동 promotion 조건 충족 시 current symlink swap | 3h | `src/lib/deploy/CanaryRouter.ts` |

### 4.6 Phase 16 태스크 합계

- 총 태스크 수: **16개** (16-A: 4 + 16-B: 4 + 16-C: 5 + 16-D: 4 — 단, 16-D는 4개)
- 총 공수: **40h** (Observability 20h + Operations 20h)
- 점수 달성: Observability 65→**85점**, Operations 80→**95점**

---

## 5. Phase 17 (Auth Core 30h + Storage 30h = 60h) WBS

### 5.1 Phase 17 개요

**목표**: Auth Core 70→90점 (+20점, 30h), Storage 40→90점 (+50점, 30h)
**근거**: `06-auth-core-blueprint.md §1.2` + `07-storage-blueprint.md §1.2`
**병렬 실행 가능**: Auth Core와 Storage는 상호 의존 없음 → 두 서브태스크 동시 진행

### 5.2 Auth Core 17-A: Session + 패스워드 정책 (15h)

| 태스크 ID | 태스크 명 | 공수 | 근거/비고 |
|----------|---------|------|---------|
| 17-A-1 | `UserSession` Prisma 모델 생성: `id(SHA-256해시)`, `tokenFamily(UUID)`, `revokedAt(DateTime?)`, `lastSeenAt`, `deviceFingerprint`, `userAgent`, `ipAddress` — Lucia 패턴 5종 적용 (DQ-AA-8) | 5h | `prisma/schema.prisma` + `src/lib/auth/core/SessionService.ts` |
| 17-A-2 | 디바이스 관리 UI (`/dashboard/settings/sessions`): 활성 세션 목록 카드 (디바이스명, 마지막 접근, IP), 개별 세션 종료 버튼, 전체 세션 종료 버튼 | 3h | `src/app/dashboard/settings/sessions/page.tsx` |
| 17-A-3 | bcryptjs 패스워드 정책 강화: 복잡도 규칙 (8자+, 대소문자+숫자+특수문자), HIBP(HaveIBeenPwned) k-anonymity API 체크 (선택 — 외부 요청 허용 시), Zod 스키마 검증 | 4h | `src/lib/auth/core/PasswordPolicy.ts` |
| 17-A-4 | Refresh Token rotation reuse detection: `tokenFamily` 기준 가족 단위 무효화, 재사용 탐지 시 해당 family 전체 revoke + `SECURITY_TOKEN_REUSE` 감사 로그 | 3h | `src/lib/auth/core/RefreshTokenService.ts` |

**DOD**: 로그인 → 세션 생성 확인, 디바이스 목록 UI 표시, 개별 로그아웃 세션 즉시 무효화, 패스워드 재사용 탐지 후 전체 세션 무효화.

### 5.3 Auth Core 17-B: Anonymous role + RBAC 정밀화 (15h)

| 태스크 ID | 태스크 명 | 공수 | 근거/비고 |
|----------|---------|------|---------|
| 17-B-1 | Anonymous role 구현: `User.role` enum에 `GUEST` 추가, `User.isAnonymous Boolean @default(false)` 컬럼, `/api/v1/auth/anonymous` POST 엔드포인트 (이메일 불필요 임시 계정 생성), 7일 만료 cron | 5h | `prisma/schema.prisma` + 마이그 (DQ-AC-3 Phase 17 답변) |
| 17-B-2 | RBAC 정책 매트릭스 정밀화: `ADMIN/MANAGER/USER/GUEST` 4역할 × 14 카테고리 기능 권한 표 확정, RLS 정책 PG 뷰 기반 적용 | 4h | `src/lib/auth/rbac/PolicyMatrix.ts` |
| 17-B-3 | Lucia v4 패턴 15개 차용 통합: Custom Claims JWT Composer (`role`, `isAnonymous`, `sessionId`, `mfaVerified` 클레임 자동 주입), Account Linking 준비 컬럼 (`oauthProvider`, `oauthId`) | 6h | `src/lib/auth/core/JWTService.ts` 확장 |

**DOD**: Anonymous 사용자 생성 → JWT 발급 → `GUEST` role 권한 범위 내 API 접근 가능, 7일 후 cron에서 자동 삭제 확인.

### 5.4 Storage 17-C: SeaweedFS 단일 인스턴스 (15h)

| 태스크 ID | 태스크 명 | 공수 | 근거/비고 |
|----------|---------|------|---------|
| 17-C-1 | SeaweedFS 3.x 다운로드 + WSL2 설치 (`master`, `volume`, `filer` 3프로세스), PM2에 `seaweedfs-master`, `seaweedfs-volume`, `seaweedfs-filer` 등록, `/opt/seaweedfs/vol` 데이터 디렉토리 | 3h | `ecosystem.config.js` + 설치 스크립트 |
| 17-C-2 | 파일 업로드 API: `POST /api/v1/storage/buckets/[bucket]/objects` — multipart/form-data, 10MB 제한 (Content-Length 검사), SeaweedFS S3 호환 API 위임, Prisma `StorageFile` 메타데이터 기록 | 4h | `src/app/api/v1/storage/buckets/[bucket]/objects/route.ts` |
| 17-C-3 | 파일 다운로드 API + signed URL 생성: `GET /api/v1/storage/buckets/[bucket]/objects/[key]` — RBAC 권한 체크 + JWT signed URL (1시간 유효), 버킷 퍼블릭 정책 시 인증 bypass | 3h | `src/lib/storage/StorageService.ts` |
| 17-C-4 | 버킷 관리 UI (`/dashboard/storage`): 버킷 생성/삭제/목록, 파일 브라우저 (목록/업로드/삭제), 드래그&드롭 업로드 지원 | 3h | `src/app/dashboard/storage/page.tsx` |
| 17-C-5 | Storage 감사 로그 통합: `STORAGE_UPLOAD`, `STORAGE_DOWNLOAD`, `STORAGE_DELETE`, `STORAGE_BUCKET_CREATE`, `STORAGE_BUCKET_DELETE` 이벤트 → PG `audit_log` append-only | 2h | `src/lib/audit/AuditLogger.ts` 확장 |

**DOD**: 버킷 생성 → 파일 업로드 (10MB 이하) → 다운로드 signed URL 생성 → 7일 내 접근 가능 → 감사 로그 확인.

### 5.5 Storage 17-D: B2 오프로드 (15h)

| 태스크 ID | 태스크 명 | 공수 | 근거/비고 |
|----------|---------|------|---------|
| 17-D-1 | Backblaze B2 Node SDK 설치 (`backblaze-b2@1.x`) + 라이프사이클 정책 설정: B2 버킷 `luckystyle4u-cold` 생성, `LIFECYCLE_DAYS=30` 환경변수 | 4h | `src/lib/storage/B2OffloadService.ts` |
| 17-D-2 | 30일 미접근 파일 자동 B2 이동 cron (`0 2 * * *` Asia/Seoul): `StorageFile.lastAccessedAt` 기준, SeaweedFS → B2 복사 후 SeaweedFS 원본 삭제, DB `tier: 'COLD'` 업데이트 | 4h | `src/lib/storage/TieringCron.ts` |
| 17-D-3 | B2 → SeaweedFS 복원 API: 사용자 요청 시 B2에서 다운로드 → SeaweedFS 재업로드 → `tier: 'HOT'` + `lastAccessedAt` 갱신, p50 복원 시간 < 30s 목표 | 3h | `src/lib/storage/RestoreService.ts` |
| 17-D-4 | SigV4 호환 레이어 구현 (`src/lib/storage/S3CompatLayer.ts`): AWS SDK S3 클라이언트가 SeaweedFS 엔드포인트를 대상으로 동작하도록 endpoint override + credential 설정 (Storage Blueprint §6 인용) | 4h | `src/lib/storage/S3CompatLayer.ts` |

**DOD**: 30일 미접근 테스트 파일 → cron 실행 후 B2 이동 확인, B2 복원 API 호출 → 30초 이내 SeaweedFS 복원 확인.

### 5.6 Phase 17 태스크 합계

- 총 태스크 수: **17개** (17-A: 4 + 17-B: 3 + 17-C: 5 + 17-D: 4 — 17-D는 4개)
- 총 공수: **60h** (Auth Core 30h + Storage 30h)
- 점수 달성: Auth Core 70→**90점**, Storage 40→**90점**

---

## 6. Phase 18 (SQL Editor 320h + Table Editor 80h = 400h) WBS

### 6.1 Phase 18 개요

**목표**: SQL Editor 70→100점 (+30점, 320h, 40일), Table Editor 75→100점 (+25점, 80h)
**근거**: `08-sql-editor-blueprint.md §1.1` + `09-table-editor-blueprint.md §0.2`
**핵심 특징**: 전체 14 카테고리 중 최대 공수 (400h = 전체의 46%). 4단계 세분화 필수.

### 6.2 SQL Editor 14c — Foundation (80h, 10일)

**달성 점수**: SQL Editor 70→80점

| 태스크 ID | 태스크 명 | 공수 |
|----------|---------|------|
| 14c-SQL-1 | Monaco Editor 심화 설정: `editor.addAction()` F5(실행), Ctrl+Enter(선택 실행), Ctrl+S(저장), Ctrl+/(주석) 액션 등록 + 커서 위치 선택 실행 로직 | 15h |
| 14c-SQL-2 | Row Limit 1000 가드 (`SELECT` 결과 1000행 초과 시 경고 모달), 파괴적 쿼리 확인 모달 (`DROP/TRUNCATE/DELETE without WHERE` 감지 → 확인 필요) | 10h |
| 14c-SQL-3 | AI Assistant 기본 구현 (14c 수준): 스키마 컨텍스트 자동 주입 (테이블명+컬럼명), Claude Haiku BYOK 설정 UI, SSE 스트리밍 응답 표시 | 20h |
| 14c-SQL-4 | sql-formatter 서버 라우트 (`POST /api/v1/sql/format`) + Ctrl+Shift+F 키바인딩 연동 (DQ-2.5 확정 경로) | 10h |
| 14c-SQL-5 | 단탭 저장/삭제 API 안정화, 실행 이력 영속화 (`SqlQueryHistory` 테이블, 최근 100건), 실행 시간 표시 | 15h |
| 14c-SQL-6 | Apache-2.0 헤더 추가 (supabase-studio 패턴 인용 파일 전체), 기존 70점 자산과 통합 테스트 | 10h |

**DOD**: Monaco 에디터에서 SQL 작성 → F5 실행 → Row Limit 적용 결과 표시 → Ctrl+Shift+F 포맷 → 저장 → 이력 확인.

### 6.3 SQL Editor 14d — 폴더 구조 + 멀티탭 (80h, 10일)

**달성 점수**: SQL Editor 80→90점

| 태스크 ID | 태스크 명 | 공수 |
|----------|---------|------|
| 14d-SQL-1 | `SqlQueryFolder` Prisma 모델 (id, name, parentId 자기참조, userId) + 사이드바 폴더 트리 컴포넌트 (드래그&드롭, 폴더 생성/삭제/이름 변경) | 25h |
| 14d-SQL-2 | 멀티탭 구현: Zustand 탭 상태 store (열린 탭 ID 배열, 활성 탭 ID, 저장 상태 dot indicator), 탭 헤더 UI, 탭 닫기 (미저장 확인 모달) | 25h |
| 14d-SQL-3 | 공유 URL 기능: `SqlQuery.isShared Boolean` + `shareToken UUID` 컬럼, `/sql/share/[token]` 퍼블릭 라우트 (읽기 전용 뷰어) | 15h |
| 14d-SQL-4 | 스키마 기반 자동완성 (Monaco `CompletionItemProvider`): Prisma DMMF에서 테이블명/컬럼명/함수명 추출 → 동적 주입, 타이핑 중 실시간 제안 | 15h |

**DOD**: 폴더 생성 → 쿼리 폴더 이동 → 멀티탭 열기 → 공유 URL 생성 → 자동완성 테이블명 제안 확인.

### 6.4 SQL Editor 14e — EXPLAIN Visualizer + Result Grid (80h, 10일)

**달성 점수**: SQL Editor 90→97점

| 태스크 ID | 태스크 명 | 공수 |
|----------|---------|------|
| 14e-SQL-1 | `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` 실행 후 JSON 파싱, 자체 @xyflow/react 트리 렌더링 (노드 타입별 색상: SeqScan=빨강, IndexScan=초록, Hash Join=파랑) (DQ-2.4 확정) | 35h |
| 14e-SQL-2 | EXPLAIN Plan 경고 룰셋 (Sequential Scan on large table, Hash Batches > 1, Sort spill to disk, Rows 추정 오차 10x+) → 경고 배지 표시 | 15h |
| 14e-SQL-3 | Result Grid 구현: TanStack Table v8 헤드리스, 컬럼 리사이즈, 정렬, JSON/JSONB 컬럼 확장 뷰, NULL 표시 스타일 | 20h |
| 14e-SQL-4 | CSV export (`DownloadResultsButton`) + Apache-2.0 헤더 추가 (supabase-studio 패턴 인용) | 10h |

**DOD**: `SELECT * FROM large_table` 실행 → EXPLAIN 탭에서 xyflow 트리 확인, SeqScan 경고 배지 표시, 결과 CSV 다운로드.

### 6.5 SQL Editor 14f — AI 보조 / 보너스 (80h, 10일)

**달성 점수**: SQL Editor 97→100점

| 태스크 ID | 태스크 명 | 공수 |
|----------|---------|------|
| 14f-SQL-1 | Claude Haiku BYOK 완전 구현: `AiUsageEvent` 영속화, 월별 토큰 집계, 비용 가드 ($5/월 상한, DQ-UX-3), 비용 초과 시 AI 기능 비활성화 | 20h |
| 14f-SQL-2 | AI 컨테이너 격리 (DQ-2.6): AI 라우트에서 `app_readonly` 역할 + `BEGIN READ ONLY` + `statement_timeout 5000` 삼중 가드, AI 생성 SQL 실행 전 DRY-RUN `SAVEPOINT` | 25h |
| 14f-SQL-3 | Snippet 라이브러리: 공개 Snippet 갤러리 (`SqlQuery.scope = 'COMMUNITY'`), 태그 검색, 즐겨찾기 (`FAVORITE` scope), 1-click 에디터 삽입 | 20h |
| 14f-SQL-4 | AI DiffEditor Accept/Reject 흐름 (supabase-studio AI Assistant v2 패턴 인용): AI 제안 SQL → Monaco DiffEditor 표시 → 사용자 Accept/Reject | 15h |

**DOD**: AI SQL 생성 → DiffEditor 표시 → Accept 후 실행 → 비용 가드 $5 상한 확인 → Snippet 저장 확인.

### 6.6 Table Editor Phase 18 WBS (80h)

**달성 점수**: Table Editor 75→100점 (+25점)

| 태스크 ID | 태스크 명 | 공수 | 근거 |
|----------|---------|------|------|
| 14c-TE-1 | Phase 14c-β 잔여 구현 완료 (VIEWER 권한 분리, 읽기 전용 모드 강제) | 5h | 세션 24 미완료 항목 |
| 14d-TE-1 | cmdk FK selector: FK 컬럼 편집 시 Command Palette UI로 참조 테이블 검색+선택 (DQ-1.11) | 20h | ADR-002 패턴 |
| 14d-TE-2 | Papa Parse CSV import (DQ-1.12): `POST /api/v1/tables/[table]/import` — 스키마 컬럼 타입 매핑, 오류 행 리포트, 10MB 제한 | 20h | ADR-002 |
| 14e-TE-1 | TanStack Virtual 가상 스크롤 (10만 행+ 렌더링 최적화, DQ-2.3), `useVirtualizer` 연동 | 20h | ADR-002 |
| 14e-TE-2 | TanStack Query 캐시 레이어: `QueryClient` 전역 설정, 낙관적 업데이트 (PATCH 즉시 UI 반영 → 서버 응답 후 검증), Stale-While-Revalidate | 15h | ADR-002 |

**DOD**: 10만 행 테이블에서 가상 스크롤 60fps 확인, CSV 1000행 import 오류 없음, FK selector로 외래키 값 선택 가능.

### 6.7 Phase 18 태스크 합계

- SQL Editor 태스크: **24개** (14c: 6 + 14d: 4 + 14e: 4 + 14f: 4)
- Table Editor 태스크: **5개** (14c: 1 + 14d: 2 + 14e: 2)
- 총 태스크 수: **29개**
- 총 공수: **400h** (SQL Editor 320h + Table Editor 80h)
- 점수 달성: SQL Editor 70→**100점**, Table Editor 75→**100점**

---

## 7. Phase 19 (Edge Functions 40h + Realtime 35h = 75h) WBS

### 7.1 Phase 19 개요

**목표**: Edge Functions 45→92점 (+47점, 40h), Realtime 55→100점 (+45점, 35h)
**근거**: `10-edge-functions-blueprint.md §1.2` + `11-realtime-blueprint.md §0.3`
**전제 조건**: spike-005(isolated-vm v6 검증) + spike-008(wal2json PG 호환 매트릭스) 완료 후 착수

### 7.2 Edge Functions — Layer 1 isolated-vm v6 (15h)

**달성 점수**: +20점 (45→65점)

| 태스크 ID | 태스크 명 | 공수 | 비고 |
|----------|---------|------|------|
| 19-A-1 | `decideRuntime()` 함수 구현: 함수 메타데이터(신뢰도, 예상 실행시간, npm 의존성) 기반 L1/L2/L3 라우팅 결정, 단위 테스트 100% 커버리지 | 5h | `src/lib/edge-functions/RuntimeDecider.ts` |
| 19-A-2 | isolated-vm v6 context 풀링 (CPU 코어 수 기준, 최소 2 / 최대 8), context 재사용으로 cold start 5ms 달성, `Isolate.compileScript()` 사전 컴파일 | 5h | `src/lib/edge-functions/IsolatedVMPool.ts` |
| 19-A-3 | graceful shutdown 구현 (`SIGTERM` → 실행 중 함수 완료 대기 최대 10초 → 강제 종료), 함수 timeout 5s 강제 (`Isolate.runWithTimeout()`) | 5h | `src/lib/edge-functions/RuntimeGuard.ts` |

**DOD**: 간단한 Hello World Edge Function 등록 → isolated-vm 내부 실행 → 결과 반환, 5초 초과 함수 자동 종료 확인.

### 7.3 Edge Functions — Layer 2 Deno 사이드카 (12h)

**달성 점수**: +12점 (65→77점)

| 태스크 ID | 태스크 명 | 공수 | 비고 |
|----------|---------|------|------|
| 19-B-1 | PM2 `deno-sidecar` 프로세스 등록 (`deno run --allow-net --allow-read`), Deno 설치 스크립트 (WSL2), 사이드카 헬스체크 엔드포인트 | 4h | `ecosystem.config.js` + `sidecar/deno-server.ts` |
| 19-B-2 | HTTP RPC 라우터: Next.js API → Deno 사이드카 `POST /invoke` (함수 코드 + 입력 데이터), 결과 JSON 반환, 10s timeout | 4h | `sidecar/deno-server.ts` + `src/lib/edge-functions/DenoClient.ts` |
| 19-B-3 | `decideRuntime()` Layer 1→2 fallback: isolated-vm 실패(메모리 초과/timeout) 또는 npm 의존성 감지 시 자동 Deno 사이드카 위임 | 4h | `src/lib/edge-functions/RuntimeDecider.ts` 확장 |

**DOD**: npm 패키지 의존 함수 → Deno 사이드카 자동 선택 → 실행 결과 반환.

### 7.4 Edge Functions — Layer 3 Vercel Sandbox 위임 (8h)

**달성 점수**: +5점 (77→82점)

| 태스크 ID | 태스크 명 | 공수 | 비고 |
|----------|---------|------|------|
| 19-C-1 | Vercel Sandbox SDK 통합 (`@vercel/sandbox`), API 키 Vault 저장, `SandboxClient.ts` 추상화 레이어 구현 | 4h | `src/lib/edge-functions/SandboxClient.ts` |
| 19-C-2 | Layer 2→3 fallback: Deno 사이드카 실패 또는 "신뢰 불가 코드" 플래그 감지 시 Vercel Sandbox 위임, 결과 스트리밍 반환 | 4h | `src/lib/edge-functions/RuntimeDecider.ts` 확장 |

### 7.5 Edge Functions — 운영 가드 (5h)

**달성 점수**: +10점 (82→92점)

| 태스크 ID | 태스크 명 | 공수 | 비고 |
|----------|---------|------|------|
| 19-D-1 | 메모리 사용량 모니터링: isolated-vm `Isolate.getHeapStatistics()` 50MB+ 시 경고 알림 + 100MB+ 시 함수 중단, PM2 메트릭 연동, 함수 배포/버전 관리 UI (`/dashboard/edge-functions`) + Monaco 에디터 연동 + 로그 스트림 SSE | 5h | `src/lib/edge-functions/MemoryGuard.ts` + UI |

### 7.6 Realtime — wal2json CDC 계층 (15h)

**달성 점수**: Realtime +15점 (55→70점)

| 태스크 ID | 태스크 명 | 공수 | 비고 |
|----------|---------|------|------|
| 19-E-1 | PG replication slot 설정 (`CREATE_REPLICATION_SLOT luckystyle4u_cdc LOGICAL wal2json`), wal2json 확장 활성화, `wal_level=logical` 확인 | 3h | DB 설정 + `src/lib/realtime/ReplicationSlot.ts` |
| 19-E-2 | wal2json 페이로드 파싱 → 내부 JSON 이벤트 변환 (`CdcEvent`: schema, table, op, pk, old, new, lsn), `WALConsumer.ts` 구현 | 4h | `src/lib/realtime/WALConsumer.ts` |
| 19-E-3 | presence_diff 이벤트 처리 (DQ-RT-3): 채널 가입/탈퇴 시 presence 상태 diff 계산 + 브로드캐스트 | 4h | `src/lib/realtime/PresenceStore.ts` |
| 19-E-4 | PG 버전 호환 매트릭스 (DQ-RT-6): wal2json PG 14/15/16 각 버전별 페이로드 포맷 차이 처리 — spike-008 결과 반영 | 4h | `src/lib/realtime/VersionCompat.ts` |

**DOD**: 테이블 INSERT → wal2json 이벤트 수신 → `CdcEvent` 변환 확인.

### 7.7 Realtime — Channel 계층 + 통합 (20h)

**달성 점수**: Realtime +30점 (70→100점)

| 태스크 ID | 태스크 명 | 공수 | 비고 |
|----------|---------|------|------|
| 19-F-1 | WebSocket 서버 (`ws@8`) PM2 `realtime-ws` 포크 모드 프로세스 등록, Next.js 앱과 포트 분리 (`localhost:3001`) | 3h | `realtime/ws-server.ts` + ecosystem.config.js |
| 19-F-2 | Channel 가입/탈퇴 프로토콜: `SUBSCRIBE` / `UNSUBSCRIBE` 메시지, `postgres_changes` 이벤트 구독 필터 (`table`, `schema`, `filter`), 채널별 구독자 맵 | 4h | `realtime/ChannelManager.ts` |
| 19-F-3 | Slot 2개 분리 (DQ-RT-5): `luckystyle4u_cdc` (CDC용) + `luckystyle4u_presence` (Presence/Broadcast용) 별도 slot, 슬롯 경합 방지 | 3h | DB slot 설정 + `ReplicationSlot.ts` |
| 19-G-1 | 큐 기반 버퍼링: `CdcBus` 이벤트 큐 구현, 클라이언트별 메시지 제한 (초당 100건), 백프레셔 (큐 1000건 초과 시 클라이언트 연결 드롭 경고) | 5h | `realtime/CdcBus.ts` |
| 19-G-2 | Realtime → 폴링 폴백: WS 연결 실패 시 5초 간격 SSE 폴링으로 자동 전환, 클라이언트 SDK 폴백 로직, Realtime 인스펙터 UI + RLS 시뮬레이션 | 5h | `src/lib/realtime/PollingFallback.ts` + UI |

**DOD**: 채널 구독 → DB INSERT → WS 이벤트 수신, WS 서버 다운 시 SSE 폴링 자동 전환.

### 7.8 Phase 19 태스크 합계

- Edge Functions 태스크: **12개** (19-A: 3 + 19-B: 3 + 19-C: 2 + 19-D: 1 + 기타 3)
- Realtime 태스크: **9개** (19-E: 4 + 19-F: 3 + 19-G: 2)
- 총 태스크 수: **21개**
- 총 공수: **75h** (Edge Functions 40h + Realtime 35h)
- 점수 달성: Edge Functions 45→**92점**, Realtime 55→**100점**

---

## 8. Phase 20 (Schema Viz 50h + DB Ops 68h + Advisors 80h = 198h) WBS

### 8.1 Phase 20 개요

**목표**: Schema Viz 65→95점 (+30점, 50h), DB Ops 60→95점 (+35점, 68h), Advisors 65→95점 (+30점, 80h)
**근거**: `12-schema-visualizer-blueprint.md` + `13-db-ops-blueprint.md` + `14-advisors-blueprint.md`
**병렬 실행**: 세 카테고리 상호 의존 없음 → 3개 서브태스크 동시 진행 가능

### 8.2 Schema Viz 20-A: schemalint + 자체 RLS/Function/Trigger UI (50h)

| 태스크 ID | 태스크 명 | 공수 | 근거 |
|----------|---------|------|------|
| 20-A-1 | schemalint TypeScript 커스텀 룰 작성 (DQ-3.13): snake_case 네이밍, `updated_at` 필수 컬럼, FK 인덱스 강제, RLS 활성화 강제 — 총 15개 컨벤션 룰 구현 | 10h | ADR-004 |
| 20-A-2 | PR 차단 CI 통합 (DQ-3.6): GitHub Actions 워크플로우에 schemalint 단계 추가, 위반 시 PR merge 차단, 경고 vs 오류 임계 설정 | 5h | `.github/workflows/db-lint.yml` |
| 20-A-3 | `/database/policies` UI (DQ-3.5/3.14): RLS 정책 목록/생성/편집/삭제, Monaco vs-dark PL/pgSQL 에디터, SAVEPOINT DRY-RUN 실행, 감사 로그 자동 기록 | 15h | `src/app/dashboard/database/policies/page.tsx` |
| 20-A-4 | `/database/functions` UI (DQ-3.10): PG Function 목록, `ALTER FUNCTION RENAME` 지원, PL/pgSQL Monaco 편집, 함수 시그니처 유효성 검사, 실행 테스트 패널 | 10h | `src/app/dashboard/database/functions/page.tsx` |
| 20-A-5 | `/database/triggers` UI (DQ-3.9): Trigger 목록/생성/비활성화 토글/삭제, BEFORE/AFTER/INSTEAD OF 지원, 감사 로그 `TRIGGER_CREATE/DROP` 기록 | 10h | `src/app/dashboard/database/triggers/page.tsx` |

**DOD**: 새 테이블 생성 → schemalint CI 실행 → snake_case 위반 시 PR 차단, `/database/policies`에서 RLS 정책 생성 → DRY-RUN PASS → 적용.

### 8.3 DB Ops 20-B: node-cron + wal-g PITR (68h)

| 태스크 ID | 태스크 명 | 공수 | 근거 |
|----------|---------|------|------|
| 20-B-1 | node-cron 잡 오케스트레이터: `CronOrchestrator.ts` 구현 (Asia/Seoul 타임존 강제, DQ-4.8), advisory lock 기반 중복 실행 방지, `CronJobRun` Prisma 모델 (잡 ID, 시작/종료, 상태, 결과 JSON) | 15h | `src/lib/cron/CronOrchestrator.ts` |
| 20-B-2 | 잡 실행 결과 영속화 정책: 성공 결과 30일 보관, 실패 결과 90일 보관 (DQ-4.4), 자동 정리 cron (`0 3 * * *`), `/dashboard/database/cron` UI에서 실행 이력 조회 | 10h | `src/lib/cron/JobResultRetention.ts` + UI |
| 20-B-3 | Webhook 알림 재사용 (DQ-4.5): 잡 실패 시 기존 `WebhookService.ts` 재사용 → Slack/Discord/일반 HTTP 웹훅 디스패치, 재시도 3회 지수 백오프 | 8h | `src/lib/cron/JobWebhookNotifier.ts` |
| 20-B-4 | wal-g + libsodium + B2 SSE 구현 (DQ-4.13): wal-g 설치(WSL2), B2 스토리지 설정, `WALG_LIBSODIUM_SECRET` Vault 저장, `archive_command` PG 설정, basebackup cron (`0 1 * * 0`) | 15h | `scripts/wal-g-setup.sh` + PG 설정 |
| 20-B-5 | 매월 1일 복원 검증 자동화 (DQ-4.11): `0 2 1 * *` cron → 별도 PG 인스턴스(포트 5433)에 최근 basebackup 복원 → 테이블 카운트 검증 → Slack 알림 → 임시 인스턴스 종료 | 10h | `src/lib/backup/RestoreVerification.ts` |
| 20-B-6 | `archive_timeout = 60s` PG 설정 (DQ-4.16): WAL 세그먼트 강제 생성 간격 60초, RPO 60초 달성 검증 | 5h | `postgresql.conf` 설정 |
| 20-B-7 | `audit_log` 보관 정책 강화 + `restore-event` 기록 (DQ-4.18): 감사 로그 PG PARTITION BY RANGE (월별), 복원 이벤트 `BACKUP_RESTORE_VERIFIED` 감사 로그 자동 기록 | 5h | DB 파티셔닝 + 감사 로그 확장 |

**DOD**: cron 잡 실행 → `CronJobRun` 기록 확인, wal-g basebackup → B2 업로드 확인, 복원 검증 cron → Slack 성공 알림.

### 8.4 Advisors 20-C: 3-Layer 통합 (80h)

| 태스크 ID | 태스크 명 | 공수 | 근거 |
|----------|---------|------|------|
| 20-C-1 | schemalint 컨벤션 룰 38개 구현 (Layer 1 확장): 네이밍 규칙 15개, FK 무결성 8개, RLS 강제 5개, 성능 관련 10개 — TypeScript 룰 플러그인 형태 | 15h | ADR-011 Layer 1 |
| 20-C-2 | squawk DDL CI 통합 (Layer 2): `pnpm add -D squawk-cli`, GitHub Actions에 squawk 단계 추가, DROP COLUMN/TABLE 경고, `NOT NULL` 컬럼 추가 경고 (락 없는 방식 안내), 위반 시 PR 코멘트 자동 게시 | 10h | ADR-011 Layer 2 |
| 20-C-3 | splinter 38룰 Node TypeScript 포팅 (Layer 3): 보안 룰 15개(SQL 인젝션 패턴, 와일드카드 SELECT, 슈퍼유저 함수 호출 등) + 성능 룰 13개(인덱스 미사용 패턴, N+1 가능성) + 유지보수 룰 10개(TODO 주석, deprecated 함수) — 일일 cron 실행 | 40h | ADR-011 Layer 3 |
| 20-C-4 | 3-Layer 통합 UI + Slack 알림 (DQ-ADV-2): `/dashboard/advisors` 페이지에 Layer 1/2/3 결과 탭 표시, Slack 채널별 알림 설정 (Layer 2/3 위반), severity 레벨별 색상 | 10h | `src/app/dashboard/advisors/page.tsx` |
| 20-C-5 | 룰 음소거 + WARN 승격 (DQ-ADV-5/6): 특정 룰 30일/영구 음소거 (`AdvisorMute` 모델), 음소거 만료 시 자동 재활성화, INFO → WARN 승격 임계 설정 (동일 룰 7일 연속 발화 시) | 5h | `src/lib/advisors/MuteService.ts` |

**DOD**: `SELECT *` 쿼리 포함 코드 → squawk 경고, splinter Layer 3 일일 cron 실행 → `/dashboard/advisors` 결과 표시, 룰 음소거 30일 적용 확인.

### 8.5 Phase 20 태스크 합계

- Schema Viz 태스크: **5개**
- DB Ops 태스크: **7개**
- Advisors 태스크: **5개**
- 총 태스크 수: **17개**
- 총 공수: **198h** (Schema Viz 50h + DB Ops 68h + Advisors 80h)
- 점수 달성: Schema Viz 65→**95점**, DB Ops 60→**95점**, Advisors 65→**95점**

---

## 9. Phase 21 (Data API 25h + UX Quality 15h = 40h) WBS

### 9.1 Phase 21 개요

**목표**: Data API 45→85점 (+40점, 25h), UX Quality 75→95점 (+20점, 15h)
**근거**: `15-data-api-blueprint.md §0.3` + `16-ux-quality-blueprint.md §0.3`
**전제 조건**: Realtime CDC(Phase 19) 완료 + 전체 기능 안정화 후 AI 어시스턴트 도입

### 9.2 Data API 21-A: REST 강화 + pgmq (25h)

| 태스크 ID | 태스크 명 | 공수 | 근거 |
|----------|---------|------|------|
| 21-A-1 | REST 응답 표준화: operator parser 구현 (`eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `like`, `ilike`, `in`, `is`, `cs`, `cd`, `ov` — PostgREST 호환), 낙관적 락 (`If-Match: ETag` 헤더), OpenAPI 3.1 스펙 자동 생성 | 5h | ADR-012 |
| 21-A-2 | pgmq 설치 및 큐 통합: `CREATE EXTENSION pgmq` + Prisma `$executeRaw`, `pgmq.send()` / `pgmq.read()` / `pgmq.archive()` 래퍼 구현, Outbox 패턴 워커 | 10h | ADR-012 |
| 21-A-3 | JSONB 응답 최적화 (DQ-11.1): `SELECT row_to_json()` 대신 `jsonb_build_object()` 활용, 중첩 관계 1단계 자동 포함 (`?select=*,profile(*)` 구문) | 3h | `src/lib/data-api/QueryBuilder.ts` |
| 21-A-4 | Persisted Query 구현 (DQ-1.25): `POST /api/v1/queries/persist` → `queryHash SHA-256` 저장, `GET /api/v1/queries/[hash]` 재실행, TTL 7일 | 4h | `src/app/api/v1/queries/` |
| 21-A-5 | pgmq dead-letter 처리 (DQ-1.32): 3회 실패 메시지 → dead-letter 큐 이동, `/dashboard/database/queues` UI에서 dead-letter 목록 확인 + 재시도 버튼 | 3h | `src/lib/data-api/DeadLetterService.ts` |

**DOD**: `GET /api/v1/data/users?email=eq.test@example.com` → 필터링 결과, pgmq 큐에 메시지 발행 → 워커 소비 → archive 확인.

### 9.3 UX Quality 21-B: AI SDK v6 Studio Assistant (15h)

| 태스크 ID | 태스크 명 | 공수 | 근거 |
|----------|---------|------|------|
| 21-B-1 | Vercel AI SDK v6 (`ai@^6`) 통합: `useChat` 훅 기반 `/dashboard/assistant` 전용 페이지, SQL Editor/Table Editor/Schema Viz 페이지별 임베드 패널 (우하단 Floating Button) | 5h | ADR-014 |
| 21-B-2 | Anthropic BYOK 완전 구현: `/dashboard/settings/ai` 페이지에서 API 키 입력 → Vault 암호화 저장, Haiku 기본 + Sonnet 조건부 승격 UI, 모델 전환 토글 | 3h | ADR-014 |
| 21-B-3 | 자체 MCP 서버 `mcp-luckystyle4u` 구현: `tools/` 디렉토리에 `executeSQL`, `listTables`, `getTableSchema`, `manageStorage`, `callEdgeFunction` 5개 도구 등록, MCP 표준 준수 (stdio + JSON-RPC), Claude Code/Desktop 재사용 가능 | 5h | ADR-014 |
| 21-B-4 | 비용 가드 강화 (DQ-UX-3): `AiUsageEvent` 테이블 월별 집계, 사용자별 $5/월 상한, 90% 도달 시 경고 배너, 100% 시 AI 기능 비활성화 + 관리자 알림 | 2h | `src/lib/ai/CostGuard.ts` |

**DOD**: `/dashboard/assistant`에서 "users 테이블 스키마 알려줘" 입력 → MCP `getTableSchema` 도구 호출 → 응답 스트리밍 표시.

### 9.4 Phase 21 태스크 합계

- Data API 태스크: **5개**
- UX Quality 태스크: **4개**
- 총 태스크 수: **9개**
- 총 공수: **40h** (Data API 25h + UX Quality 15h)
- 점수 달성: Data API 45→**85점**, UX Quality 75→**95점**

---

## 10. Phase 22 (보너스 ~30h) WBS

### 10.1 Phase 22 개요

**목표**: 전체 14 카테고리 100점 완성 (조건부 + 잔여 갭 처리)
**근거**: Vision 문서 `10-14-categories-priority.md §7.1` (v1.0 GA 기준)
**전제 조건**: M7 완료 (전체 기능 안정화 후)

### 10.2 Phase 22 보너스 태스크

| 태스크 ID | 태스크 명 | 공수 | 트리거 조건 |
|----------|---------|------|-----------|
| 22-A | **pg_graphql 조건부 구현** (10h): `CREATE EXTENSION pg_graphql`, `/api/graphql` 엔드포인트, Prisma 모델 기반 자동 스키마 생성, 구독(Realtime 연동) | 10h | 수요 트리거 4개 중 2개 이상 충족 시 (ADR-016): ①외부 클라이언트 GraphQL 요청 2건+, ②모바일 앱 개발 착수, ③팀 GraphQL 선호, ④REST 중복 엔드포인트 5개+ |
| 22-B | **OAuth Naver/Kakao 연동** (8h, DQ-AC-11): `passport-naver` + `passport-kakao` 설치, 콜백 라우트, 기존 Account Linking 컬럼 (`oauthProvider`, `oauthId`) 활용, 로그인 버튼 UI | 8h | Phase 17 Auth Core Account Linking 컬럼 준비 완료 시 |
| 22-C | **WebAuthn Conditional UI** (5h, DQ-AA-9): 브라우저 `PublicKeyCredential.isConditionalMediationAvailable()` 감지, 지원 브라우저에서 로그인 폼에 passkey 자동완성 제안 — spike-009 결과 의존 | 5h | spike-009 브라우저 호환성 검증 PASS 후 |
| 22-D | **Anonymous role 완성** (4h): Anonymous → 정식 계정 전환 UI (이메일+비밀번호 입력 → 계정 업그레이드), 전환 시 Anonymous 데이터 마이그레이션 (세션 히스토리 유지) | 4h | Phase 17 Anonymous 기본 구현 완료 후 |
| 22-E | **잔여 갭 처리** (3h): Storage Resumable Upload (TUS 프로토콜 기본), Data API pg_graphql 수요 미충족 시 대체 개선 (쿼리 빌더 UI 강화), 전체 E2E 통합 테스트 통과 확인 | 3h | Phase 22 착수 시점 갭 현황 기준 |

**DOD**: 전체 14 카테고리 100점 달성, E2E 통합 테스트 전 카테고리 PASS.

### 10.3 Phase 22 태스크 합계

- 총 태스크 수: **5개**
- 총 공수: **~30h**
- 점수 달성: 전체 14 카테고리 → **100점**

---

## 11. 데이터 모델 마이그레이션 35~39h 분해

### 11.1 마이그레이션 개요

`02-data-model-erd.md §6` 기준 Wave 4 신규 15+ 테이블을 Phase별로 분산 적용.
총 마이그레이션 파일 16~17개, 공수 35~39h.

### 11.2 Phase별 마이그레이션 파일 목록

**Phase 15 마이그레이션** (5h, 3 파일):

| 파일명 | 내용 | 공수 |
|-------|------|------|
| `20260418_01_add_webauthn_credential.sql` | `WebAuthnCredential` 테이블 (userId FK, credentialId UNIQUE, publicKey BYTEA, counter BIGINT, deviceType) + 인덱스 | 2h |
| `20260418_02_add_totp_secret.sql` | `TOTPSecret` 테이블 (userId UNIQUE FK, secret VARCHAR 암호화 텍스트, verified BOOLEAN) | 1.5h |
| `20260418_03_add_rate_limit_events.sql` | `rate_limit_events` UNLOGGED 테이블 (key VARCHAR, points INT, expire TIMESTAMPTZ) + PG UNLOGGED 설정 | 1.5h |

**Phase 16 마이그레이션** (4h, 2 파일):

| 파일명 | 내용 | 공수 |
|-------|------|------|
| `20260418_04_add_secret_item.sql` | `SecretItem` 테이블 (id UUID PK, name VARCHAR UNIQUE, encryptedValue TEXT, iv VARCHAR, tag VARCHAR, rotatedAt TIMESTAMPTZ) | 2h |
| `20260418_05_add_jwks_key.sql` | `JWKSKey` 테이블 (kid VARCHAR PK, algorithm VARCHAR, publicKey TEXT, privateKeyEncrypted TEXT, activeAt, expiresAt, isActive BOOLEAN) + `JWKSKeyRotation` 이력 테이블 | 2h |

**Phase 17 마이그레이션** (6h, 3 파일):

| 파일명 | 내용 | 공수 |
|-------|------|------|
| `20260418_06_extend_user_session.sql` | `UserSession` 테이블 신규 (revokedAt, tokenFamily, lastSeenAt, deviceFingerprint, userAgent, ipAddress), `User.isAnonymous`, `User.role` enum에 GUEST 추가 | 3h |
| `20260418_07_add_storage_bucket.sql` | `StorageBucket` 테이블 (id UUID PK, name VARCHAR UNIQUE, policy JSONB, public BOOLEAN, maxFileSize INT), `StorageFile` 테이블 (bucketId FK, key VARCHAR, size BIGINT, mimeType, tier ENUM, lastAccessedAt) | 2h |
| `20260418_08_add_storage_b2_tier.sql` | `StorageFile.tier` ENUM ('HOT','COLD') 추가, `StorageFile.b2Key VARCHAR`, `StorageFile.b2ETag VARCHAR` | 1h |

**Phase 18 마이그레이션** (6h, 3 파일):

| 파일명 | 내용 | 공수 |
|-------|------|------|
| `20260418_09_add_sql_snippet.sql` | `SqlQuery` 테이블 (id UUID PK, userId FK, folderId FK nullable, title, content TEXT, scope ENUM PRIVATE/SHARED/FAVORITE/COMMUNITY, shareToken UUID UNIQUE nullable), `SqlQueryFolder` (id, userId FK, parentId FK nullable, name) | 2h |
| `20260418_10_add_sql_history.sql` | `SqlQueryHistory` 테이블 (id, userId FK, sql TEXT, executedAt, durationMs INT, rowCount INT, error TEXT nullable) — 100건 한도 cron | 2h |
| `20260418_11_add_table_view_state.sql` | `TableViewState` 테이블 (userId FK, tableName VARCHAR, columnOrder JSONB, hiddenColumns JSONB, sortConfig JSONB, filterConfig JSONB) | 2h |

**Phase 19 마이그레이션** (5h, 2 파일):

| 파일명 | 내용 | 공수 |
|-------|------|------|
| `20260418_12_extend_edge_function_run.sql` | `EdgeFunctionRun` 테이블 확장 (layer ENUM L1/L2/L3, coldStartMs INT, memoryMB INT, runtime VARCHAR, sandboxId VARCHAR nullable) | 2.5h |
| `20260418_13_add_realtime_channel.sql` | `RealtimeChannel` 테이블 (id UUID PK, name VARCHAR, schema VARCHAR, table VARCHAR, filter JSONB, subscriberCount INT, createdAt), `RealtimeSubscription` 이력 | 2.5h |

**Phase 20 마이그레이션** (8h, 3 파일):

| 파일명 | 내용 | 공수 |
|-------|------|------|
| `20260418_14_add_db_policy_function.sql` | `DatabasePolicy` 테이블 (tableName, policyName, using TEXT, withCheck TEXT, command ENUM, roles JSONB), `DatabaseFunction` (name UNIQUE, signature TEXT, body TEXT, language ENUM) | 3h |
| `20260418_15_add_trigger_backup.sql` | `DatabaseTrigger` 테이블 (name, tableName, event JSONB, timing ENUM, functionName), `CronJobRun` 테이블 (jobId, startedAt, finishedAt, status, resultJson, errorText), `BackupEvent` (type ENUM, size BIGINT, b2Path, verifiedAt nullable) | 3h |
| `20260418_16_add_advisor_alert.sql` | `AdvisorAlert` 테이블 (layer INT, ruleId, severity ENUM, target, detail TEXT, firedAt, mutedUntil nullable), `AdvisorMute` (ruleId, target, muteUntil, reason) | 2h |

**Phase 21 마이그레이션** (3~7h, 1~2 파일):

| 파일명 | 내용 | 공수 |
|-------|------|------|
| `20260418_17_add_pgmq_feature_flag.sql` | pgmq 확장 활성화 스크립트 (`CREATE EXTENSION pgmq`), `FeatureFlag` 테이블 (key VARCHAR UNIQUE, enabled BOOLEAN, conditions JSONB, description TEXT), `PgmqDeadLetter` 이력 뷰 | 3~7h |

### 11.3 마이그레이션 합계

- 총 파일 수: **16~17개**
- 총 공수: **35~39h**
- 분산: Phase 15(5h) + 16(4h) + 17(6h) + 18(6h) + 19(5h) + 20(8h) + 21(3~7h)

---

## 12. 크리티컬 패스 다이어그램

### 12.1 의존성 레이어 구조

```
Layer 0 (기반 인프라 — 모든 기능의 전제)
┌──────────────────────────────────────────────────────────┐
│  Observability (Vault/JWKS) [M2 Phase 16]               │
│  Operations (Capistrano/PM2 cluster) [M2 Phase 16]      │
└──────────────────────────────────────────────────────────┘
                         ↑ M1 Auth Advanced 완료 후

Layer 1 (보안 핵심)
┌──────────────────────────────────────────────────────────┐
│  Auth Core (Session/RBAC/Anonymous) [M3 Phase 17]        │
│  Storage (SeaweedFS+B2) [M3 Phase 17]                   │
└──────────────────────────────────────────────────────────┘
                         ↑ M2 완료 후

Layer 2 (기능 심화 — 최대 공수 구간)
┌──────────────────────────────────────────────────────────┐
│  SQL Editor 14c~14f (320h) [M4 Phase 18]                │
│  Table Editor 14c-γ~14e (80h) [M4 Phase 18]            │
└──────────────────────────────────────────────────────────┘
                         ↑ M3 완료 후

Layer 3 (고급 기능 — Layer 2 의존)
┌──────────────────────────────────────────────────────────┐
│  Edge Functions 3층 [M5 Phase 19]                        │
│  Realtime CDC+Channel [M5 Phase 19]                     │
└──────────────────────────────────────────────────────────┘
                         ↑ M3+M4 완료 + spike-005/008 후

Layer 4 (DB 관리 통합)
┌──────────────────────────────────────────────────────────┐
│  Schema Viz + DB Ops + Advisors [M6 Phase 20]           │
└──────────────────────────────────────────────────────────┘
                         ↑ M4(Table Editor) 완료 후

Layer 5 (최종 통합)
┌──────────────────────────────────────────────────────────┐
│  Data API + UX Quality AI [M7 Phase 21]                 │
└──────────────────────────────────────────────────────────┘
                         ↑ M5+M6 완료 후

Layer 6 (보너스 완성)
┌──────────────────────────────────────────────────────────┐
│  pg_graphql + OAuth + WebAuthn Conditional [M8 Phase 22] │
└──────────────────────────────────────────────────────────┘
                         ↑ M7 완료 후
```

### 12.2 크리티컬 패스 3단계

**MVP 크리티컬 패스** (Phase 15→16→17):

```
M1 Auth Advanced (22h, 4주) ──→ M2 Obs+Ops (40h, 6주) ──→ M3 Core+Storage (60h, 8주)
                                                              = 합산 18주
```

**Beta 크리티컬 패스** (Phase 18→19):

```
M3 완료 ──→ M4 SQL+Table Editor (400h, 16주) ──→ M5 Edge+RT (75h, 6주)
                                                  = +22주 (누적 40주)
```

**GA 크리티컬 패스** (Phase 20→21→22):

```
M5 완료 ──→ M6 DB Mgmt (198h, 6주) ──→ M7 API+UX (40h, 4주) ──→ M8 Bonus (30h, 2주)
                                                                    = +12주 (누적 52주)
```

**총 기간**: 18 + 22 + 12 = **52주** (풀타임 주 17~18h 기준)
**사이드 기준**: 주 8~10h 기준 → 87~109주 (약 1.7~2년)

---

## 13. 간트 차트 (텍스트 표현)

```
주차    1   2   3   4   5   6   7   8   9  10  11  12  13  14  15  16  17  18
       ────┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬────
M1     ████████████████
M2                 ████████████████████████
M3                                     ████████████████████████████████

주차   19  20  21  22  23  24  25  26  27  28  29  30  31  32  33  34  35  36
       ────┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬────
M4     ████████████████████████████████████████████████████████████████████████
M5                                                                          (37~)

주차   37  38  39  40  41  42  43  44  45  46  47  48  49  50  51  52
       ────┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬────
M5     ████████████████████████
M6                             ████████████████████████
M7                                                     ████████████████
M8                                                                     ████

릴리스  │                  v0.1.0 MVP          v0.2.0 Beta         v1.0.0 GA
        │                  (주 18)             (주 40)             (주 52)
```

**릴리스 타임라인 요약**:

| 릴리스 | 예상 시점 | 포함 마일스톤 | 핵심 기능 |
|-------|---------|------------|---------|
| v0.1.0-alpha | 4주 차 | M1 | TOTP/WebAuthn MFA |
| v0.1.0 MVP | 18주 차 | M1+M2+M3 | 보안 기반 완성, SeaweedFS Storage |
| v0.2.0-beta | 40주 차 | +M4+M5 | SQL/Table Editor 100점, Realtime 100점 |
| v1.0.0 GA | 52주 차 | +M6+M7+M8 | 14개 카테고리 전체 90점 이상 |

---

## 14. 공수 요약표

| Phase | 카테고리 (목표점수) | 공수 | 누적 공수 | 누적 % | 릴리스 단계 | 핵심 리스크 |
|-------|-----------------|------|---------|-------|-----------|-----------|
| **15** | Auth Advanced (15→60) | 22h | 22h | 2.5% | MVP alpha | 낮음 |
| **16** | Observability (65→85) + Operations (80→95) | 40h | 62h | 7.1% | MVP | 낮음 |
| **17** | Auth Core (70→90) + Storage (40→90) | 60h | 122h | 14.0% | MVP v0.1.0 | 중간 (Storage 부하 미검증) |
| **18** | SQL Editor (70→100) + Table Editor (75→100) | 400h | 522h | 59.9% | Beta v0.2.0 | 낮음 (단일 최대 공수 구간) |
| **19** | Edge Functions (45→92) + Realtime (55→100) | 75h | 597h | 68.5% | Beta v0.2.0 | 높음 (3층 + CDC 복잡도) |
| **20** | Schema Viz (65→95) + DB Ops (60→95) + Advisors (65→95) | 198h | 795h | 91.3% | GA RC | 중간 (splinter 포팅) |
| **21** | Data API (45→85) + UX Quality (75→95) | 40h | 835h | 95.9% | GA RC | 낮음 |
| **22** | 보너스 100점 완성 (조건부) | ~30h | ~865h | 99.3% | GA v1.0.0 | 낮음 |
| **마이그(분산)** | Phase 15~21 DB 스키마 마이그레이션 16~17 파일 | 35~39h | **870~874h** | 100% | 전체 Phase 분산 | 낮음 |

**Phase별 공수 검증**:
- Phase 15: 4h + 8h + 6h + 4h = **22h** ✓
- Phase 16: 8h + 12h + 10h + 10h = **40h** ✓
- Phase 17: 15h + 15h + 15h + 15h = **60h** ✓
- Phase 18: 80h + 80h + 80h + 80h + 80h = **400h** ✓
- Phase 19: 15h + 12h + 8h + 5h + 15h + 20h = **75h** ✓
- Phase 20: 50h + 68h + 80h = **198h** ✓
- Phase 21: 25h + 15h = **40h** ✓
- Phase 22: **~30h** ✓
- 마이그레이션: 5h + 4h + 6h + 6h + 5h + 8h + 3~7h = **37~43h** (평균 **35~39h**) ✓

---

## 15. 위험 가중치 레지스터

| Phase | 마일스톤 | 리스크 등급 | 핵심 리스크 시나리오 | 발생 시 영향 | 완화 전략 |
|-------|---------|-----------|-----------------|-----------|---------|
| **15** | M1 | 낮음 | WebAuthn Safari iOS 16 이전 미지원 (브라우저 호환 gap) | Auth Advanced 점수 -5점 (92% 달성) | SimpleWebAuthn@10 자체 fallback, spike-009 브라우저 매트릭스 사전 확인 |
| **16** | M2 | 낮음 | MASTER_KEY 파일 권한 실수 (chmod 0644로 배포 시 노출) | 전체 Vault 시크릿 노출 위험 | dry-run 의무화, 배포 스크립트에 권한 검증 단계 추가 (`stat -c %a /etc/luckystyle4u/secrets.env` == 640) |
| **17** | M3 | 중간 | SeaweedFS 50GB+ 운영 시 메모리 부족 (GC 지연, OOM) | Storage 업로드 지연, 서비스 중단 | Phase 17 착수 전 spike-007 50GB 부하 테스트 필수, B2 오프로드 30일 자동화, 메모리 상한 경보 설정 |
| **18** | M4 | 낮음 | SQL Editor 4단계 중 14e EXPLAIN xyflow 렌더링 성능 (100노드+ 대형 쿼리 플랜) | EXPLAIN Visualizer 성능 저하, p50 > 2s | 50노드 이상 시 lazy 렌더링, 뷰포트 밖 노드 미렌더링, 100노드 상한 경고 |
| **19** | M5 | 높음 | isolated-vm v6 native addon 빌드 실패 (Node.js ABI 불일치, WSL2 환경) | Edge Functions L1 전체 비작동 | spike-005 Phase 19 착수 전 필수, 빌드 실패 시 Layer 1→2 fallback으로 Deno 사이드카 단독 운영 |
| **19** | M5 | 높음 | wal2json PG 버전 업그레이드 시 페이로드 포맷 변경 | Realtime CDC 이벤트 파싱 오류, 전체 Realtime 비작동 | spike-008에서 PG 14/15/16 버전 매트릭스 테스트, 폴링 폴백(5초 REST API) 반드시 구현 |
| **20** | M6 | 중간 | splinter 38룰 Node TypeScript 포팅 완성도 부족 (Rust 의미론 차이) | Advisors Layer 3 룰 누락, 점수 -5점 | squawk/schemalint Layer 1~2 먼저 배포 후 splinter 점진 포팅 (8룰씩 4주 분산), 미포팅 룰 "TODO" 아닌 "스킵 사유 문서화" |
| **21** | M7 | 낮음 | pg_graphql 수요 트리거 4개 미충족 (현재 단일 사용자 운영) | pg_graphql 미도입 → Data API 85점 유지 (100점 미달) | REST+pgmq로 85점 확보 후 GraphQL은 조건부 → Phase 22로 이월, 사용자 수요 추적 지표 설정 |
| **22** | M8 | 낮음 | 보너스 조건 중 OAuth Naver/Kakao 인증 정책 변경 (API 스펙 변동) | 소셜 로그인 비작동 | OAuth 연동은 M8 착수 시점에 최신 Naver/Kakao OAuth 2.0 문서 재확인, passport 라이브러리 버전 고정 |

### 15.1 위험 히트맵 요약

```
     발생 가능성
     높음  │  (M5) isolated-vm 빌드     (M5) wal2json PG 호환
           │  [고영향, 고발생]            [고영향, 중발생]
     중간  │  (M3) SeaweedFS 부하        (M6) splinter 포팅
           │  [중영향, 중발생]            [중영향, 중발생]
     낮음  │  (M1) Safari WebAuthn       (M4) EXPLAIN 성능
           │  [저영향, 저발생]            [저영향, 저발생]
           └────────────────────────────────────────────────
                저영향          중영향           고영향
```

---

## 16. 참조 문서 인덱스

본 WBS를 구성하는 데 사용된 입력 문서 목록. 개발자가 특정 Phase 착수 시 해당 Blueprint를 단일 참조 진실 소스로 사용한다.

| Phase | Blueprint 파일 | 핵심 참조 섹션 |
|-------|--------------|-------------|
| 15 | `02-architecture/03-auth-advanced-blueprint.md` | §1.2 Phase 15 목표 달성 경로, §3 컴포넌트 설계 |
| 16 (Obs) | `02-architecture/04-observability-blueprint.md` | §12 Phase 16 WBS, §5 데이터 모델 |
| 16 (Ops) | `02-architecture/05-operations-blueprint.md` | §12 Phase 16 WBS, §4 배포 플로우 |
| 17 (Auth) | `02-architecture/06-auth-core-blueprint.md` | §1.2 현재 자산과 갭, §4 API 설계 |
| 17 (Storage) | `02-architecture/07-storage-blueprint.md` | §1.2 Phase 17 MVP, §6 WBS |
| 18 (SQL) | `02-architecture/08-sql-editor-blueprint.md` | §1.1 4단계 로드맵, §6 보안 |
| 18 (Table) | `02-architecture/09-table-editor-blueprint.md` | §1.1 Phase 14c-α 완료 상태, §5 WBS |
| 19 (Edge) | `02-architecture/10-edge-functions-blueprint.md` | §1.3 역할 분담 원칙, §7 단계적 롤아웃 |
| 19 (RT) | `02-architecture/11-realtime-blueprint.md` | §0.3 100점 도달 경로, §4 2계층 WBS |
| 20 (Schema) | `02-architecture/12-schema-visualizer-blueprint.md` | §3 컴포넌트, §10 Phase 20 WBS |
| 20 (DBOps) | `02-architecture/13-db-ops-blueprint.md` | §1.1 현황, §6 Phase 20 WBS |
| 20 (Advisors) | `02-architecture/14-advisors-blueprint.md` | §1.2 3-Layer, §8 Phase 20 WBS |
| 21 (Data API) | `02-architecture/15-data-api-blueprint.md` | §0.3 85점 경로, §7 Phase 21 WBS |
| 21 (UX) | `02-architecture/16-ux-quality-blueprint.md` | §0.3 ADR-014, §12 Phase 21 WBS |
| 전체 | `02-architecture/02-data-model-erd.md` | §3 Wave 4 신규 테이블, §6 마이그레이션 순서 |
| 우선순위 | `00-vision/10-14-categories-priority.md` | §4 Phase 매핑, §7 MVP 범위 |

**ADR 참조**:

| ADR | 결정 내용 | 관련 Phase |
|-----|---------|-----------|
| ADR-007 | TOTP + WebAuthn + Rate Limit 동시 채택 | 15 |
| ADR-013 | node:crypto AES-256-GCM + MASTER_KEY 위치 | 16 |
| ADR-015 | Capistrano-style + PM2 cluster:4 + canary | 16 |
| ADR-006 | jose JWT + Lucia 패턴 차용, Auth.js 거부 | 17 |
| ADR-008 | SeaweedFS 단독 + B2 오프로드 | 17 |
| ADR-003 | supabase-studio Apache-2.0 3중 흡수 | 18 |
| ADR-002 | TanStack Table v8 헤드리스 자체구현 | 18 |
| ADR-009 | 3층 하이브리드 Edge Functions | 19 |
| ADR-010 | wal2json + supabase-realtime 포팅 하이브리드 | 19 |
| ADR-004 | schemalint + 자체 RLS + @xyflow | 20 |
| ADR-005 | node-cron + wal-g, pg_cron 거부 | 20 |
| ADR-011 | 3-Layer Advisors 아키텍처 | 20 |
| ADR-012 | REST 강화 + pgmq, pg_graphql 조건부 | 21 |
| ADR-014 | Vercel AI SDK v6 + Anthropic BYOK + 자체 MCP | 21 |
| ADR-016 | pg_graphql 수요 트리거 4개 정량화 | 22 |

---

> 작성: Wave 5 R1-B 에이전트 (Claude Sonnet 4.6 — kdywave W5-R1-B)
> 근거: Wave 4 Blueprint 03~16 (14건) + Wave 3 Vision 우선순위 (`10-14-categories-priority.md`)
> 이전 문서: [`05-roadmap/00-roadmap-overview.md`](./00-roadmap-overview.md)
> 다음: [`05-roadmap/02-tech-debt-strategy.md`](./02-tech-debt-strategy.md) (기술 부채 전략)
