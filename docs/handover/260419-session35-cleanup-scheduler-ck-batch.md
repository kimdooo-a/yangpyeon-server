# 세션 35 — Cleanup Scheduler + CK 4건 + MFA QA 가이드

> 일자: 2026-04-19
> 선행 세션: [세션 34](./260419-session34-phase15-ui-and-mfa-status.md) — Phase 15 UI 통합 + 라이브 디버깅 2건
> 이 세션 위치: 세션 34 위임 4건 순차 처리 (MFA UI QA / cleanup cron / SP-013·16 확인 / CK 6건)

---

## 1. 입수 시점 상태

### 1-1. 세션 34 commit `9a6b4ff` 종료 시점

- Phase 15 Auth Advanced Step 1~6 + UI 통합 완료 (tsc 0 / vitest 175 PASS / 프로덕션 배포)
- 라이브 디버깅 2건 완결 (rate limit layer conflict + PG TIMESTAMP timezone-naive offset)
- unstaged 파일 2건: `docs/logs/journal-2026-04-19.md` (M) + `docs/solutions/2026-04-19-pg-timestamp-naive-js-date-tz-offset.md` (??)
- 다음 세션 위임 4건: MFA UI 브라우저 / cleanup cron / SP-013·16 / CK 6건

### 1-2. 확인 결과

- `docs/solutions/2026-04-19-rate-limit-defense-in-depth-conflict.md` 도 이미 작성되어 있음 (세션 34 말미)
- 즉 CK 6건 중 2건은 기작성 → **실질 4건만 신규 작성 필요**

---

## 2. 본 세션 작업 — 순차 4단계

### 2-1. 우선순위 1 — MFA UI 브라우저 QA 체크리스트 (`docs/guides/mfa-browser-manual-qa.md` 신규)

**판단 근거**: WebAuthn `navigator.credentials.create/get()` 은 사용자 Touch ID / Windows Hello 입력 필수 → 본 세션 자동화 불가. 대신 **다음 세션에서 사용자가 직접 실행할 수 있는 SOP** 문서화가 결정적 산출물.

**체크리스트 구성 (8 시나리오)**:
1. TOTP Enroll (idle → qr+secret+6자리 → recovery 10코드)
2. Login MFA Challenge (TOTP)
3. Passkey Enroll (WebAuthn Register + biometric)
4. Login via Passkey (WebAuthn Assert)
5. Passkey Delete (자기 자격증명 — `userId` 매칭 강제)
6. Recovery Code 사용 + 재사용 거부
7. (선택) Rate Limit 차단 + `Retry-After: 60` 회귀 가드
8. TOTP Disable (비밀번호 + 현재 TOTP 모두 요구)

각 시나리오에 **단계 + DOD** 명시. 실패 시 진단 순서 + 관련 CK 교차 참조 포함. `guides/README.md` 가이드 목록에 엔트리 추가.

### 2-2. 우선순위 2 — Cleanup Scheduler 신설 + 프로덕션 배포

#### 설계 결정: 신규 `src/lib/cleanup-scheduler.ts` — `cron/registry.ts` 와 분리

**근거**:
- `cron/registry.ts` 는 DB `CronJob` 레코드 기반 (UI CRUD 대상) + `SQL/FUNCTION/WEBHOOK` kind 한정
- cleanup 은 시스템 내부 유지보수 — 코드 하드코딩 + prisma 함수 직접 호출
- 두 개념을 섞으면 UI CRUD에서 내부 task 오작동 유발 가능

**4종 대상 (모두 기존 구현 재사용)**:
| 대상 | 함수 | 조건 | 세션 |
|------|------|------|------|
| sessions | `cleanupExpiredSessions()` | `expires_at < NOW() - INTERVAL '1 day'` | 32 |
| rate-limit-buckets | `cleanupExpiredRateLimitBuckets()` | `window_start < NOW() - INTERVAL '1 day'` | 34 |
| jwks RETIRED | `cleanupRetiredKeys()` | `retireAt < NOW()` (grace 24h+4m 경과) | 33 |
| webauthn-challenges | `cleanupExpiredChallenges()` | `expiresAt < NOW()` (5분 만료) | 33 |

#### 구현 핵심

**`computeCleanupWindow(now, kstHour=3)` 순수 함수**:
- 시스템 timezone 의존 없이 UTC 연산만 사용 (세션 34 TIMESTAMP-naive 버그 교훈 반영)
- `match: boolean` + `key: "YYYY-MM-DD-HH"` (dedupe 용)
- 월/년 경계 자동 처리

**`runCleanupTasks(tasks)`**:
- 각 task 독립 `try/catch` — 한 개 실패가 뒤 task 블로킹 안 함
- 실패는 `summary[name] = "ERROR: <msg>"` 로 기록
- 빈 배열 / string throw / 순서 보존 모두 테스트

**`ensureCleanupScheduler()` 멱등**:
- 1분 tick (`setInterval`) + 기동 직후 5초 후 1회 tick
- `lastRunKey` 같은 시간대 중복 실행 방지
- `state()` 는 `globalThis.__cleanupScheduler` — HMR/PM2 restart 안전

**Audit 통합**:
- 실행마다 `writeAuditLogDb({ action: "CLEANUP_EXECUTED", detail: JSON.stringify(summary), ... })`
- audit write 자체가 실패해도 cleanup 루프 유지 (try/catch + 콘솔 경고)

**instrumentation.ts 통합**:
```ts
const { ensureCleanupScheduler } = await import("@/lib/cleanup-scheduler");
ensureCleanupScheduler();
```
기존 `ensureStarted()` (cron registry) 다음 줄에 추가.

**수동 실행 export**:
- `runCleanupsNow()` — 후속 `/api/admin/cleanup/run` 엔드포인트용. 본 세션은 함수 export만 (UI 미구현)

#### 유닛 테스트 (`src/lib/cleanup-scheduler.test.ts`, 13 case)

- `computeCleanupWindow` 7 case: KST 03:00 정각 / 03:30 / 02:59 / 04:00 / 월 경계(UTC 말일→KST 익월 1일) / kstHour 커스텀 / 상수 확인
- `runCleanupTasks` 5 case: summary 매핑 / 실패 격리 / string throw / 빈 배열 / 순서 보존
- 순수 함수만 테스트 — prisma call 은 통합 테스트로 이관 (배포 후 실측으로 검증)

#### 검증 결과

- **vitest**: 175 → **188 PASS** (+13 신규, 회귀 0)
- **tsc --noEmit**: 0 에러
- **`/ypserver prod --skip-win-build`**: 통과
  - PM2 dashboard online (restart ↺=1)
  - Cloudflare Tunnel running
  - curl `http://localhost:3000` → **HTTP 307** (로그인 리다이렉트, 정상)
  - PM2 로그에 instrumentation 에러 없음

#### 운영 관찰 (실측)

- PM2 restart 직후 `Next.js Ready in 79ms` — instrumentation 등록이 서버 준비 지연을 유발하지 않음
- KST 03:00 창은 본 세션 시점(KST 09:30) 과 별개 — 익일 03:00 첫 실행 예정
- 첫 실행 후 `sudo -u postgres psql -d dashboard` 로 각 테이블 만료 행 수 확인 + audit log `CLEANUP_EXECUTED` 엔트리 확인 권장 (다음 세션 운영 체크리스트)

### 2-3. 우선순위 3 — SP-013 / SP-016 deferral 유지 확인

**판단**: 물리 측정 환경 미확보 (wal2json 익스텐션 설치 + 30분 DML 부하 / 50GB 디스크 + B2 오프로드) — 본 세션도 환경 미확보 → **현 상태 유지**.

`docs/research/_SPIKE_CLEARANCE.md` 마지막 2행:
- `SP-013 wal2json 슬롯` — `Pending (축약)` → ADR-010 측정 대기
- `SP-016 SeaweedFS 50GB` — `Pending (축약)` → ADR-008 측정 대기

수정 불필요. 다음 세션 위임 유지.

### 2-4. 우선순위 4 — Compound Knowledge 6건 (실질 4건 신규 작성)

세션 34에서 이미 작성된 2건 확인:
- `2026-04-19-pg-timestamp-naive-js-date-tz-offset.md` (세션 34 디버깅 #2)
- `2026-04-19-rate-limit-defense-in-depth-conflict.md` (세션 34 디버깅 #1)

신규 작성 4건 (Agent 2대 병렬 발사, 각각 2건씩 분담):

#### Agent A (세션 33 MFA 외부 라이브러리 함정 2건)

1. **`2026-04-19-otplib-v13-breaking-noble-plugin.md`** (142줄, category: bug-fix, confidence: high)
   - v13 breaking 3축(API 구조 · Noble crypto plugin 의무 · 호출 모델) 비교표
   - `package.json` `otplib@^12.0.1` 고정 스니펫
   - `src/lib/mfa/totp.ts` 의 `HashAlgorithms from @otplib/core` import 인용
   - 메이저 업그레이드 시 5단계 마이그레이션 플랜 + MFA_MASTER_KEY 재암호화 검토

2. **`2026-04-19-simplewebauthn-v10-api-shape.md`** (203줄, category: pattern, confidence: high)
   - v10 `registrationInfo` 평탄 shape / `authenticator` singular 필드 / `@simplewebauthn/types` 서브패키지 분리 / `counter` number↔BigInt 경계 4축 서술
   - `src/lib/mfa/webauthn.ts` 의 `persistAuthenticator` + `verifyAuthenticationResponse` 핵심 라인 인용
   - server/browser 버전 동기 락 + `d.ts` 직독 원칙

#### Agent B (세션 33 + 세션 32 설계 패턴 2건)

3. **`2026-04-19-mfa-challenge-token-2fa-pattern.md`** (183줄, category: pattern, confidence: high)
   - 1차 password 통과 직후 access 발급 **금지** → 5분 `purpose=mfa_challenge` HS256 JWT → 2차 factor(TOTP/recovery/passkey) 검증 후 access/refresh 발급
   - `challenge.ts` + login route + challenge route + WebAuthn 이중 challenge 검증 실제 코드 발췌
   - 클라이언트 discriminated union (`MfaState: password | challenge`) 패턴
   - Supabase GoTrue `aal` 비교 · step-up auth / OAuth consent / Magic link 일반화

4. **`2026-04-19-bcrypt-argon2-progressive-rehash-merged-update.md`** (175줄, category: pattern, confidence: high)
   - prefix(`$2` vs `$argon2id$`) 분기로 스키마 변경 0
   - `hashPassword` / `verifyPasswordHash` 시그니처 보존 (호출자 4곳 중 3곳 수정 0)
   - **lastLoginAt UPDATE에 `passwordHash?` 조건부 머지** — Blueprint §7.2.3 대비 round-trip 1회 절감
   - `password.ts` + login route + password.test.ts 실제 인용
   - SP-011 13× 성능 실측 + 프로덕션 kimdooo 계정 실전환 증적
   - key rotation / signing alg 전환 / JSON schema migration 일반화

**품질 후속 수정**: Agent B가 추가한 broken link (`상위: [solutions/_index.md](./_index.md)`) 를 기존 CK 패턴과 맞춰 제거. solutions 디렉토리에는 `_index.md` 부재.

---

## 3. 변경 파일 요약

### 신규 (8)
```
src/lib/cleanup-scheduler.ts                                             (143줄)
src/lib/cleanup-scheduler.test.ts                                        (99줄, 13 case)
docs/guides/mfa-browser-manual-qa.md                                     (200+줄, 8 시나리오)
docs/solutions/2026-04-19-otplib-v13-breaking-noble-plugin.md            (142줄)
docs/solutions/2026-04-19-simplewebauthn-v10-api-shape.md                (203줄)
docs/solutions/2026-04-19-mfa-challenge-token-2fa-pattern.md             (183줄)
docs/solutions/2026-04-19-bcrypt-argon2-progressive-rehash-merged-update.md (175줄)
docs/handover/260419-session35-cleanup-scheduler-ck-batch.md             (이 파일)
```

### 수정 (6)
```
src/instrumentation.ts                — ensureCleanupScheduler() 호출 + 주석 확장
docs/guides/README.md                 — 가이드 목록에 mfa-browser-manual-qa 엔트리
docs/status/current.md                — 세션 35 행 추가
docs/logs/journal-2026-04-19.md       — 세션 35 섹션 append
docs/logs/2026-04.md                  — 세션 35 요약
docs/handover/_index.md               — 세션 35 엔트리 추가
docs/handover/next-dev-prompt.md      — 세션 35 결과 반영 + 다음 세션 위임 재배치
```

### 세션 34 unstaged 포함 (2)
```
docs/solutions/2026-04-19-pg-timestamp-naive-js-date-tz-offset.md        (세션 34 디버깅 #2)
docs/solutions/2026-04-19-rate-limit-defense-in-depth-conflict.md        (세션 34 디버깅 #1)
```

---

## 4. 알려진 이슈 / 주의사항

### 4-1. Cleanup scheduler 첫 실행 관찰 필요

다음 KST 03:00 에 첫 실행 예정. 확인 항목:
- PM2 dashboard 로그에 예외 없음
- audit log `action = CLEANUP_EXECUTED` 최신 1행 존재 (SQLite `auditLogs` 테이블)
- `sessions` / `rate_limit_buckets` / `jwks_keys` (RETIRED 만료분) / `webauthn_challenges` 의 만료 행 수 감소 확인
- summary JSON 내 각 task 가 숫자(삭제 행 수) 인지 / "ERROR" 문자열 인지

만약 `ERROR: ...` 가 나오면 즉시 원인 조사 (가장 흔한 원인: prisma 쿼리 timeout / PG 연결 고갈).

### 4-2. instrumentation.ts 의 `NEXT_RUNTIME` 가드

`register()` 는 `process.env.NEXT_RUNTIME !== "nodejs"` 이면 조기 리턴. Edge/proxy 런타임에서는 cleanup scheduler 미시동 — 정상 동작 (instrumentation 자체가 Node.js 런타임 전용 보장).

### 4-3. `runCleanupsNow()` 는 함수 export 만

후속 `/api/admin/cleanup/run` 엔드포인트 + UI 버튼은 미구현. 현재는 REPL/테스트 도구용.

### 4-4. `state()` 멱등성 한계

`globalThis.__cleanupScheduler` 는 **단일 프로세스** 전제. PM2 cluster 모드(SP-010) 도입 시 워커마다 별도 scheduler → 중복 실행 발생. cluster 도입 전에 `advisory_lock` 또는 Redis 기반 리더 선출로 보강 필요. 현재 fork 모드에서는 무관.

### 4-5. Audit log `action` 필드 확장

`auditLogs` 테이블에 새 action 2종 (`CLEANUP_EXECUTED`, `CLEANUP_EXECUTED_MANUAL`) 추가됨. 기존 감사 로그 UI 필터 화면에서 자동 노출 (drizzle `like` 필터로 조회 가능).

---

## 5. 다음 세션 권장

### 우선순위 1: MFA UI 브라우저 round-trip 직접 실행

`docs/guides/mfa-browser-manual-qa.md` 의 8 시나리오 순차 수행. 발견된 이슈는 즉시 수정 + 이 가이드 업데이트. 특히 Passkey Enroll/Assert 는 본 세션에서 유일하게 검증 불가 구간.

### 우선순위 2: Cleanup scheduler 첫 실행 결과 검증

KST 03:00 +1일 후 시점에 PM2 로그 + audit log + 각 테이블 행 수 스냅샷 비교.

### 우선순위 3: SP-013 wal2json / SP-016 SeaweedFS 물리 측정

환경 확보 시 13h 소요. 산출: ADR-010 / ADR-008 Accepted 전환 + Compound Knowledge 2건.

### 우선순위 4: Phase 15-D Refresh Token Rotation

세션 32에서 구축한 `Sessions` 테이블 인프라 활성화. opaque refresh token + revoke + UI "활성 세션" 카드. Blueprint §7.2.2 구현.

### 우선순위 5: `/api/admin/cleanup/run` 엔드포인트 + UI 버튼

`runCleanupsNow()` 를 ADMIN role + csrf guard 로 래핑. Settings 페이지에 "지금 정리 실행" 버튼. audit log `CLEANUP_EXECUTED_MANUAL` 분기 이미 준비.

---

## 6. Compound Knowledge 누적

- **세션 31 이전**: 12건
- **세션 31**: +5 (외부 터미널 작성, `67731da`)
- **세션 34**: +2 (pg-timestamp-naive / rate-limit-defense-in-depth, unstaged 상태로 세션 34 마감)
- **세션 35**: +4 (otplib-v13 / simplewebauthn-v10 / mfa-challenge-token / bcrypt-argon2-rehash)

**누적 23건**. 세션 34·35 신규 6건은 Phase 15 Auth Advanced 의 전체 구현 과정에서 도출된 **라이브러리 함정(2) + 설계 패턴(2) + 디버깅 근본(2)** 를 균형 있게 포괄.

---

## 7. 세션 저널 (대화 다이제스트 원본)

본 세션의 토픽별 대화 흐름은 다음 파일에 영구 보존:

- **[docs/logs/journal-2026-04-19.md](../logs/journal-2026-04-19.md)** — 2026-04-19 일자 세션 30/34/35 통합 저널 (세션 35 섹션: 위임 4건 순차 처리 + 5 토픽 [1]~[5])

저널과 본 인수인계서는 상호 보완:
- 저널: 시간 순 대화 토픽, 의사결정 과정, 논의된 대안
- 인수인계: 변경 파일 요약, 설계 결정, 다음 세션 권장

---

[← handover/_index.md](./_index.md)
