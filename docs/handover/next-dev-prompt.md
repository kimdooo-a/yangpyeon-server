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

## 필수 참조 파일 ⭐ 세션 34 종료 시점 — Phase 15 Step 1~6 + UI 통합 완료

```
CLAUDE.md
docs/status/current.md
docs/handover/260419-session34-phase15-ui-and-mfa-status.md      ⭐ 최신 (UI 통합 + 라이브 디버깅 2건)
docs/handover/260419-session33-phase15-step3-4-5.md              (JWKS + TOTP + WebAuthn + Step 6 백엔드)
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

## 현재 상태 (세션 34 종료 시점)

### 완료된 Phase
- Phase 1~14c-γ 전부 완료
- **kdywave Wave 1-5 완주**: 123 문서 / 106,588줄
- **세션 30**: 우선 스파이크 7건 완결 (5 실측 + 2 축약)
- **세션 31**: safeguard + ADR/DQ 반영 + CK 5건 (타 터미널)
- **세션 32**: Phase 15 Step 1-2 — Prisma Session + argon2id 자동 재해시
- **세션 33**: Phase 15 Step 3·4·5·6 서버측 일괄 완결 (commit `58a517b`)
- **세션 34** ⭐ — Phase 15 **UI 통합** + 라이브 디버깅 2건
  - 신규 통합 페이지 `(protected)/account/security` — TOTP 3-stage stepper + Passkey list/enroll/delete + Disable
  - 신규 API 2건: `GET /mfa/status` + `DELETE /mfa/webauthn/authenticators/[id]`
  - 로그인 페이지 MFA Challenge UI — `MfaState` discriminated union + Method Tabs + Passkey `startAuthentication()`
  - 사이드바 "내 계정" 그룹 신설 + `@simplewebauthn/browser@^10` 설치
  - **Step 6 라이브 디버깅 2건** (다음 세션 CK 후보):
    - proxy 인메모리 vs handler DB rate limit 충돌 → `HANDLER_OWNED_RATE_LIMIT_PATHS` 양도
    - PG TIMESTAMP(3) timezone-naive + JS Date 9시간 오프셋 → `EXTRACT(EPOCH...)` PG 직접 계산
  - **검증**: tsc 0 / vitest 175 PASS / `/ypserver` 4회 / curl smoke 307·401·200

## 추천 다음 작업

### 우선순위 1: MFA UI 브라우저 검증 ⭐ 즉시 착수 가능 (1-2h)

서버측·UI 모두 완결. 실제 브라우저 + 사용자 인터랙션으로 round-trip 검증만 남음:

1. https://stylelucky4u.com/login (admin 로그인)
2. `/account/security` 진입
3. **TOTP enroll**: "MFA 등록 시작" → Authenticator 앱(Google Auth/1Password 등)으로 QR 스캔 → 6자리 입력 → 복구 코드 10개 텍스트 다운로드
4. 로그아웃 → 다시 로그인 → MFA challenge UI 확인 → TOTP 코드로 인증 → 메인 진입
5. **Passkey enroll**: `/account/security` → "새 Passkey 등록" → 기기 이름 → Touch ID/Windows Hello/Passkey manager
6. 로그아웃 → 다시 로그인 → Passkey 탭 → 인증 → 메인 진입
7. (선택) 복구 코드로 로그인 → 사용한 코드 재사용 거부 확인

**DOD**: 6 시나리오 모두 PASS. 발견된 이슈는 새 세션 권장사항 1순위로 즉시 수정.

### 우선순위 2: Cleanup cron 일괄 등록 (1h)

다음 4종 cleanup 함수가 정의만 되고 스케줄 미등록 — `instrumentation.ts` cron bootstrap 또는 신설 `src/lib/cleanup-scheduler.ts`로 통합:
- `cleanupExpiredSessions` (세션 32, `src/lib/sessions/cleanup.ts`)
- `cleanupExpiredRateLimitBuckets` (세션 34, `src/lib/rate-limit-db.ts`)
- `cleanupExpiredJwksKeys` (세션 33, `src/lib/jwks/store.ts`)
- `cleanupExpiredChallenges` (세션 33, `src/lib/mfa/webauthn.ts`)

권장: 일 1회 03:00 KST 일괄 실행. 실패는 audit log + Sentry 후속.

### 우선순위 3: Compound Knowledge 5건 작성 (1h)

세션 33 산출 3건:
```
docs/solutions/2026-04-19-otplib-v13-breaking-noble-plugin.md
docs/solutions/2026-04-19-simplewebauthn-v10-api-shape.md
docs/solutions/2026-04-19-mfa-challenge-token-2fa-pattern.md
```

세션 32 미작성:
```
docs/solutions/2026-04-19-bcrypt-argon2-progressive-rehash-merged-update.md
```

세션 34 신규 (라이브 디버깅 2건 — 본 세션 §3 핵심 자산):
```
docs/solutions/2026-04-19-pg-timestamp-naive-js-date-tz-offset.md
docs/solutions/2026-04-19-rate-limit-defense-in-depth-conflict.md
```

### 우선순위 4: SP-013/016 물리 측정 (13h, 환경 확보 시)
- **SP-013 wal2json** (5h): PG + wal2json 설치 + 30분 DML + 슬롯 손상 recovery
- **SP-016 SeaweedFS 50GB** (8h): weed 설치 + 50GB 디스크 + B2 오프로드

### 우선순위 5: Phase 15-D Refresh Rotation
세션 32 Sessions 테이블 인프라(미사용) 활성화. opaque refresh token 회전 + revoke + UI "활성 세션" 카드.

### 우선순위 6: `/kdygenesis --from-wave` 연계
입력: `07-appendix/03-genesis-handoff.md` _PROJECT_GENESIS.md 초안 (85+ 태스크)
산출: 주간 실행 플로우

### 진입점 예시
```
# 우선순위 1 — MFA UI 브라우저 검증
# 1. https://stylelucky4u.com/login 로 admin 로그인
# 2. 사이드바 "내 계정 > MFA & 보안" 클릭
# 3. TOTP 등록 흐름 6단계 + Passkey 등록 흐름 (등록 → 로그아웃 → 재로그인)
# 4. 발견된 UI 이슈 수정 → /ypserver prod --skip-win-build 재배포

# 또는 우선순위 2 — Cleanup cron
# instrumentation.ts 의 기존 cron 부트스트랩에 4종 cleanup 추가
# /api/cron/cleanup 엔드포인트 신설 + audit log
```

## 알려진 이슈 및 주의사항

### 세션 34 신규
- **MFA UI는 코드만 완결, 브라우저 round-trip 미실행** — 실제 WebAuthn `navigator.credentials.create/get()` 호출은 사용자 인터랙션 필요. 다음 세션 우선순위 1
- **proxy.ts `HANDLER_OWNED_RATE_LIMIT_PATHS` Set** — v1 auth 경로 3건은 handler가 DB-backed로 처리, proxy 인메모리 미적용. 새 v1 auth 경로 추가 시 이 Set 검토
- **PG TIMESTAMP(3) timezone-naive 함정** — Sessions/RateLimitBucket 등 모두 같은 컬럼 타입. 클라이언트 측 elapsed 계산 금지 — PG `EXTRACT(EPOCH ...)` 직접 위임이 안전
- **rate-limit-db `$queryRaw`의 `reset_ms` string 반환** — Postgres NUMERIC → Prisma string 직렬화. `parseFloat` 필수
- **Phase 15 UI 페이지는 (admin) 그룹 밖** — `(protected)/account/security`. USER 포함 모든 사용자 접근. 이 패턴은 사용자별 self-service 모든 페이지의 표준

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
