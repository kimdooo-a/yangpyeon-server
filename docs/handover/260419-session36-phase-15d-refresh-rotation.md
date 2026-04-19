# 세션 36 — Phase 15-D Refresh Token Rotation + Cleanup 수동 실행 UI

> 일자: 2026-04-19
> 선행 세션: [세션 35](./260419-session35-cleanup-scheduler-ck-batch.md) — Cleanup Scheduler + CK 4건 + MFA QA 가이드
> 이 세션 위치: 세션 35 위임 우선순위 4·2·3 순차 처리. P1(MFA UI browser)과 P5(SP-013/016 물리 측정)는 환경/생체 인증 제약으로 실행 불가 → 사용자 위임
> 대화 저널: [journal-2026-04-19.md §세션 36](../logs/journal-2026-04-19.md) — 대화 흐름 전수 기록

---

## 1. 입수 시점 상태

### 1-1. 세션 35 commit `a29ac1b` 종료 시점

- `src/lib/cleanup-scheduler.ts` 완결 (KST 03:00 자동 스케줄 + `runCleanupsNow()` export만, UI 부재)
- vitest 188 PASS / tsc 0 / `/ypserver prod --skip-win-build` 통과
- CK 누적 23건
- 세션 35 위임 5건: P1 MFA UI browser / P2 cleanup 첫 실행 검증 / P3 Phase 15-D Refresh Rotation / P4 /api/admin/cleanup/run / P5 SP-013·016 물리 측정

### 1-2. 실행 가능성 판단

| P | 작업 | 실행 가능 | 결정 |
|---|------|----------|------|
| 1 | MFA UI 브라우저 | ❌ Touch ID/Hello 필수 | 다음 세션 사용자 직접 실행 |
| 2 | Cleanup 첫 실행 검증 | △ KST 03:00 대기 8h+ | P4 UI로 수동 트리거 조기 검증 |
| 3 | Phase 15-D Refresh | ✅ | **실행** |
| 4 | `/api/admin/cleanup/run` | ✅ | **실행** (먼저 수행, P2 의존) |
| 5 | SP-013/016 물리 측정 | ❌ 환경 미확보 | Pending 유지 |

순서: **P4 → P2 조기 검증(수동 트리거) → P3 → 배포 → E2E → 세션 마감**.

---

## 2. 본 세션 작업

### 2-1. P4 — `/api/admin/cleanup/run` 엔드포인트 + Settings UI

#### 설계 결정: `runCleanupsNow(actor?)` 확장

세션 35 `runCleanupsNow()` 는 audit log 에 `method: "SYSTEM"`, `ip: "127.0.0.1"` 을 고정으로 기록. 관리자 수동 트리거는 actor 정보(userId/email/ip)가 감사 추적에 필요.

```ts
// src/lib/cleanup-scheduler.ts 변경 (부분)
export interface CleanupActor { userId: string; email: string; ip: string; }
function writeCleanupAudit(action, summary, actor?: CleanupActor) {
  writeAuditLogDb({
    method: actor ? "POST" : "SYSTEM",
    path: actor ? "/api/admin/cleanup/run" : "/internal/cleanup-scheduler",
    ip: actor?.ip ?? "127.0.0.1",
    detail: JSON.stringify(actor ? { actor, summary } : summary),
    ...
  });
}
export async function runCleanupsNow(actor?: CleanupActor) { ... }
```

**하위 호환**: actor 생략 시 자동 스케줄러 기존 행동 동일. 기존 테스트 13건 회귀 0.

#### 엔드포인트

**`src/app/api/admin/cleanup/run/route.ts`** (신설)
- `POST` withRole(["ADMIN"]) → `runCleanupsNow({ userId: actor.sub, email: actor.email, ip: extractClientIp(headers) })`
- CSRF: proxy.ts Referer 검증에 위임 (`/api/*` 자동 처리, v1 아님)
- 응답: `{ success, data: { summary, executedAt } }`
- 실패 500 시 CLEANUP_FAILED 에러 코드

#### UI

**`src/app/(protected)/(admin)/settings/cleanup/page.tsx`** (신설)
- 카드 2개: (a) 자동 스케줄 정보 — 4종 대상 설명, (b) 즉시 실행 — 버튼 + 결과 표
- 결과 표: task 이름별 한국어 라벨 + `숫자 → <N>행 삭제 (초록)` / `문자열 → ERROR: ... (빨강, break-all)`
- 확인 다이얼로그 + busy 상태 + Sonner 토스트

**사이드바 통합**:
- `감사·설정` 그룹에 `Cleanup 실행` 엔트리 추가 (`Trash2` 아이콘)
- `ADMIN_ONLY_PATHS` 에 `/settings/cleanup` 추가

### 2-2. P2 — Cleanup 수동 트리거 조기 검증

P4 UI 배포 후 실측 1회. curl 매트릭스 결과:

```
=== [P2] POST /api/admin/cleanup/run ===
{
  "success": true,
  "data": {
    "summary": {
      "sessions": 0,
      "rate-limit": 0,
      "jwks": 0,
      "webauthn-challenges": 1
    },
    "executedAt": "2026-04-19T00:57:31.984Z"
  }
}
```

audit log 확인:
```
CLEANUP_EXECUTED_MANUAL | {"actor":{"userId":"c0c0b305...","email":"kimdooo@stylelucky4u.com","ip":"::1"},
                           "summary":{"sessions":0,"rate-limit":0,"jwks":0,"webauthn-challenges":1}}
```

**webauthn-challenges: 1 건 삭제** — 세션 33/35 이후 5분 만료분이 실제로 1건 남아있었음 → 실측으로 cleanup 로직 프로덕션 동작 확인.

**KST 03:00 자동 스케줄 관찰은 익일 여전히 유효** (1분 tick이 백그라운드 실행 중). 수동 트리거가 자동 스케줄을 대체하지 않고 병행.

### 2-3. P3 — Phase 15-D Refresh Token Rotation (Blueprint §7.2.2)

#### 배경: 세션 32 Sessions 테이블 인프라만 → 활성화

세션 32 `Session` 모델 + `cleanupExpiredSessions()` + 복합 인덱스는 Blueprint §7.2.2 준비용 인프라였음. 세션 36에서 실제 세션 lifecycle 로 활성화:

#### 설계 결정

| 축 | 선택 | 근거 |
|----|------|------|
| 토큰 형태 | Opaque 32 bytes hex (64 chars) | JWT stateless → revoke 불가. opaque + DB 매칭은 서버 제어 완벽 |
| 해시 | SHA-256 hex | 쿠키 평문을 저장하지 않음 (comparable in O(1) via unique index) |
| 만료 | 7일 (기존과 동일) | Blueprint §7.2.2 basis |
| Rotate 전략 | refresh 매 회 새 토큰 + 구 토큰 soft revoke | Reuse 탐지 가능성 확보 |
| Reuse 탐지 | 구 토큰 재사용 시 user 전체 revoke | Defense-in-depth (다른 기기까지 차단) |
| 쿠키 이름 | `v1_refresh_token` (기존 유지) | 마이그레이션 무중단 |
| Access token | 그대로 HS256 15분 (jwt-v1) | refresh 쪽만 변경 |

#### 신규 파일

**`src/lib/sessions/tokens.ts`** (196 줄)
- `generateOpaqueToken()` / `hashToken()` — 순수 crypto 유틸
- `issueSession(params)` — Session row insert
- `findSessionByToken(token)` — tokenHash 조회 + 상태 판별 (`active | revoked | expired | user_invalid | not_found`)
- `rotateSession(params)` — 단일 트랜잭션 (revoke 구 + insert 신)
- `revokeSession(id)` / `revokeAllUserSessions(userId)`
- `listActiveSessions(userId, currentSessionId?)` — UI 용 요약
- `touchSessionLastUsed(id)` — 미사용(향후 access 검증 시 활용 가능)
- 상수: `REFRESH_TOKEN_MAX_AGE_MS = 7d`, `REFRESH_TOKEN_MAX_AGE_SEC = 604800`

**`src/lib/sessions/login-finalizer.ts`** (77 줄)
- `finalizeLoginResponse(params)` — 3개 로그인 종료 경로 공통화
  1. `accessToken` 생성
  2. DB Session insert (`issueSession`)
  3. audit log `SESSION_LOGIN` 기록
  4. response JSON (`accessToken + user + extraData`)
  5. `v1_refresh_token` 쿠키 설정 (httpOnly, sameSite=lax, 7d)
- `LoginMethod = "password" | "totp" | "recovery" | "passkey"` — audit detail 에 기록
- `extraData` 파라미터로 `mfaMethod` 등 path별 추가 응답 필드 병합

**`src/lib/sessions/tokens.test.ts`** (+8 tests / 196 → 204)
- `generateOpaqueToken`: 길이 64 / hex 포맷 / 100회 고유성
- `hashToken`: 결정성 / 충돌 회피 / 64 hex / empty string SHA-256 상수
- `REFRESH_TOKEN_MAX_AGE`: MS / SEC 일치성

**`src/app/api/v1/auth/refresh/route.ts`** (신설)
- rate limit 60/min (v1Refresh scope)
- 쿠키 없음 → 401 NO_REFRESH_TOKEN
- `findSessionByToken`:
  - `revoked` → **reuse 탐지** → `revokeAllUserSessions(userId)` + audit `SESSION_REUSE_DETECTED` + 쿠키 제거 + 401 SESSION_REVOKED
  - `expired / user_invalid / not_found` → 쿠키 제거 + 401 INVALID_REFRESH_TOKEN
  - `active` → `rotateSession` + audit `SESSION_ROTATE` + 새 access + 새 쿠키

**`src/app/api/v1/auth/sessions/route.ts`** (신설)
- `GET` withAuth — 현재 사용자 활성 세션 목록
- 현재 쿠키 매칭 시 `current: true` (UI 에서 본인 세션 표시)

**`src/app/api/v1/auth/sessions/[id]/route.ts`** (신설)
- `DELETE` withAuth — 자기 세션 revoke
- `userId` 매칭 강제 (타 사용자 세션 은폐 위해 404)
- 이미 revoked → 멱등 200
- audit `SESSION_REVOKE` detail.reason = "self"

#### 수정 파일

**`src/app/api/v1/auth/login/route.ts`**
- `createAccessToken + createRefreshToken + V1_REFRESH_COOKIE + REFRESH_MAX_AGE` import 제거
- 성공 종료부를 `finalizeLoginResponse({ request, user, method: "password" })` 한 줄로 교체

**`src/app/api/v1/auth/mfa/challenge/route.ts`**
- 동일 패턴 — `method: result.method as LoginMethod` + `extraData: { mfaMethod: result.method }`

**`src/app/api/v1/auth/mfa/webauthn/assert-verify/route.ts`**
- 동일 패턴 — `method: "passkey"` + `extraData: { mfaMethod: "passkey" }`

**`src/app/api/v1/auth/logout/route.ts`**
- 기존: 쿠키 제거만 (stateless JWT → 서버 revoke 불가)
- 신규: 쿠키 토큰으로 Session 조회 → `revokeSession(id)` + audit `SESSION_REVOKE` detail.reason = "logout"
- 쿠키 없는 경우 기존과 동일 (idempotent)

**`src/components/layout/sidebar.tsx`**
- 로그아웃 클릭: `Promise.allSettled([fetch("/api/v1/auth/logout"), fetch("/api/auth/logout")])` 로 v1 + dashboard 쿠키 모두 revoke
- 사이드바 메뉴에 `/settings/cleanup` 엔트리 추가 + `ADMIN_ONLY_PATHS` 확장

**`src/app/(protected)/account/security/page.tsx`**
- `sessions: SessionInfo[] | null` state 추가
- `loadSessions()` / `revokeSessionById(id)` 함수
- 3번째 카드 "활성 세션":
  - 빈 상태 메시지
  - 세션별 행: IP / User-Agent / 시작·마지막 사용·만료 / `현재 세션` 배지 / "종료" 버튼
  - 종료 버튼 confirm + API DELETE + loadSessions() 재호출 + Sonner 토스트

**`src/lib/jwt-v1.ts`** (감소 — 미사용 export 정리)
- `createRefreshToken` / `verifyRefreshToken` / `RefreshTokenPayload` / `REFRESH_MAX_AGE` / `getRefreshSecret` 제거
- 주석: "Phase 15-D 이후: Refresh 는 DB-backed opaque (src/lib/sessions/tokens.ts) 으로 이관"
- 남는 export: `V1_REFRESH_COOKIE` (쿠키 이름), `createAccessToken`, `verifyAccessToken`, `AccessTokenPayload`, `ACCESS_MAX_AGE`

#### 감사 로그 이벤트 (신규 4종)

| action | 발생 시점 | detail |
|--------|----------|--------|
| `SESSION_LOGIN` | finalizeLoginResponse (password/totp/recovery/passkey) | userId, sessionId, method |
| `SESSION_ROTATE` | /api/v1/auth/refresh 성공 | userId, oldSessionId, newSessionId |
| `SESSION_REVOKE` | /api/v1/auth/logout 또는 DELETE /sessions/[id] | userId, sessionId, reason="logout"\|"self" |
| `SESSION_REUSE_DETECTED` | /api/v1/auth/refresh 시 구 토큰 재사용 | userId, revokedSessionsCount |

#### 프로덕션 E2E 검증 (curl, 9 시나리오 전 PASS)

```
[1] POST /login                 → 200 accessToken + v1_refresh_token 쿠키 (opaque 64 hex)
    DB: sessions 1행 (ip=::1, user_agent=curl/8.5.0, revoked_at=NULL)
[2] GET /api/v1/auth/sessions   → 200 1건 (current: true)
[3] POST /api/v1/auth/refresh   → 200 새 accessToken + 새 쿠키
    DB: 구 세션 revoked_at SET, 신 세션 insert
[4] POST /refresh (구 쿠키)     → 401 SESSION_REVOKED (reuse 탐지)
    audit: SESSION_REUSE_DETECTED (revokedSessionsCount: 1)
    DB: 모든 사용자 세션 revoked_at SET (신 세션까지 revoke = defense-in-depth)
[5] 재로그인 → 신 세션 → DELETE 다른 세션 → 활성 1건 감소
[6] DELETE /api/v1/auth/sessions/[id]  → 200 success
[7] POST /api/v1/auth/logout     → 200 success + 쿠키 제거
[8] POST /refresh (logout 후)    → 401 SESSION_REVOKED
[9] audit log 누적:
    SESSION_LOGIN × 3 / SESSION_REVOKE × 2 / SESSION_REUSE_DETECTED × 2 /
    SESSION_ROTATE × 1 / CLEANUP_EXECUTED_MANUAL × 1
```

### 2-4. 미실행 작업 (사용자 위임)

#### P1 — MFA UI 브라우저 round-trip
**환경 제약**: WebAuthn `navigator.credentials.create/get()` 는 Touch ID / Windows Hello / USB 보안키 등 OS 생체 인증 prompt 필수 → Claude 환경에서 자동화 불가.
**가이드**: `docs/guides/mfa-browser-manual-qa.md` 8 시나리오 SOP. 사용자 1-2h 직접 실행 필요.

#### P5 — SP-013 wal2json / SP-016 SeaweedFS 50GB
**환경 제약**: wal2json PG 확장 설치 + 30분 DML 부하 주입 필요, SeaweedFS weed 바이너리 + 50GB 디스크 + B2 오프로드 자격증명 필요.
**현재**: `docs/research/_SPIKE_CLEARANCE.md` Pending 유지.

---

## 3. 변경 파일 요약

### 신규 (12)
```
src/lib/sessions/tokens.ts                                   (227줄, revokeAllExceptCurrent 포함)
src/lib/sessions/login-finalizer.ts                           (77줄)
src/lib/sessions/tokens.test.ts                               (+13 tests, 188→201 PASS)
src/app/api/admin/cleanup/run/route.ts                        (관리자 수동 cleanup)
src/app/api/v1/auth/refresh/route.ts                          (rotate + reuse 탐지)
src/app/api/v1/auth/sessions/route.ts                         (GET 활성 세션 + touchSessionLastUsed)
src/app/api/v1/auth/sessions/[id]/route.ts                    (DELETE 자기 세션 revoke)
src/app/api/v1/auth/sessions/revoke-all/route.ts              (POST 현재 세션 외 모두 revoke)
src/app/(protected)/(admin)/settings/cleanup/page.tsx         (수동 cleanup UI)
docs/handover/260419-session36-phase-15d-refresh-rotation.md  (이 파일)
docs/solutions/2026-04-19-opaque-refresh-rotation-reuse-detection.md  (CK, /cs 단계 작성)
```

### 수정 (8)
```
src/lib/cleanup-scheduler.ts                    — CleanupActor 인터페이스 + runCleanupsNow(actor?) 확장
src/lib/jwt-v1.ts                                — createRefreshToken/verifyRefreshToken/REFRESH_MAX_AGE 제거
src/app/api/v1/auth/login/route.ts               — finalizeLoginResponse 사용
src/app/api/v1/auth/logout/route.ts              — 서버측 Session revoke + audit
src/app/api/v1/auth/mfa/challenge/route.ts       — finalizeLoginResponse 사용
src/app/api/v1/auth/mfa/webauthn/assert-verify/route.ts — finalizeLoginResponse 사용
src/app/(protected)/account/security/page.tsx    — 활성 세션 카드 (3번째)
src/components/layout/sidebar.tsx                — v1 logout 병행 + /settings/cleanup 엔트리
```

---

## 4. 검증 결과

### 4-1. 단위 + 타입

| 항목 | 결과 |
|------|------|
| `npx tsc --noEmit` | 0 에러 |
| `npx vitest run` | **188 → 201 PASS** (+13, 회귀 0) |
| 신규 테스트 | tokens.test.ts 13 케이스 (generateOpaqueToken 2 / hashToken 4 / 상수 2 / revokeAllExceptCurrent 5 with Prisma mock) |

### 4-2. 배포

| 단계 | 결과 |
|------|------|
| Windows 빌드 | ⏭ `--skip-win-build` (lightningcss 이슈 환경) |
| Prisma migrate deploy | ℹ "No pending migrations" (Session 테이블 세션 32부터 존재) |
| WSL 빌드 | ✅ 성공 (Next.js 16 + Turbopack, 경로 41개 정상 출력) |
| Drizzle db:migrate | ✅ "migrations applied successfully" |
| PM2 restart dashboard | ✅ online, ↺=1 |
| Cloudflare Tunnel | ✅ running |
| curl localhost:3000 | ✅ HTTP 307 (로그인 리다이렉트) |

### 4-3. E2E curl (9 시나리오 전 PASS)

§ 2-3 #프로덕션 E2E 참조.

---

## 5. 알려진 이슈 및 주의사항

### 5-1. 본 세션 신규

- **기 발급 v1_refresh_token (stateless JWT) 은 더 이상 refresh 불가** — 세션 36 배포 시점 기준. 해당 쿠키 소지자는 refresh 시 `INVALID_REFRESH_TOKEN` 401 → 재로그인 유도 (SESSION_REVOKED 와 구분 코드). 프로덕션 admin 외 사용자 없으므로 영향 없음.
- **dashboard_session 쿠키 (24h ES256) 는 별개** — v1 refresh rotation 과 무관. 로그아웃 시 `Promise.allSettled` 로 양쪽 모두 처리.
- **`touchSessionLastUsed` 는 미사용 export** — 향후 access 검증 시점에 `lastUsedAt` 갱신을 원하면 활용. 현재는 rotate 할 때 새 row 가 `lastUsedAt` NOW() 로 시작하므로 자연 갱신.
- **Session DB 커밋 race** — `rotateSession` 트랜잭션 내에서 구 session 이 이미 revoke 된 상태일 경우 update 는 단순 타임스탬프 덮어쓰기 (동작상 문제 없음).
- **`/api/v1/auth/sessions` GET Bearer 선호** — 쿠키 session 경유 시 currentSessionId 를 v1_refresh_token 쿠키로 판별. Bearer 단독 사용 시 `current: false` 로 표시됨 (올바른 동작).
- **`revokeAllUserSessions` 는 reuse 탐지 전용** — 사용자가 `/account/security` 에서 "모든 세션 종료" 버튼을 원한다면 별도 endpoint 필요 (후속).

### 5-2. 세션 35 유지

- Cleanup scheduler 자동 실행 (KST 03:00) 은 **이번 세션에서 변경 없음** — P4 수동 트리거는 병행 제공. 익일 03:00 관찰 권장 (audit `CLEANUP_EXECUTED` 확인).
- `globalThis.__cleanupScheduler` 단일 프로세스 전제 — PM2 cluster 전환 시 advisory_lock 보강 필요 (현 fork 모드 무관).

### 5-3. 세션 34 유지

- proxy.ts `HANDLER_OWNED_RATE_LIMIT_PATHS` — v1 auth 경로 3건은 handler rate-limit. 본 세션 `/api/v1/auth/refresh` 도 handler에서 `applyRateLimit(v1Refresh, 60/min)` 적용 — proxy 중복 방지 불필요 (v1 일반 구간 rate-limit 는 분당 100 rps 정도로 refresh 60 보다 넉넉).
- PG TIMESTAMP(3) timezone-naive — Sessions 테이블도 같은 컬럼 타입. 단 현 Phase 15-D 는 모든 시간 비교를 PG `NOW()` 에 위임 (서버 시계 단일 권위) → 오프셋 버그 재발 없음.

---

## 6. 다음 세션 권장

### 우선순위 1: MFA UI 브라우저 round-trip 직접 실행 ⭐ 즉시 착수 가능 (1-2h)

`docs/guides/mfa-browser-manual-qa.md` 의 8 시나리오 + **추가**: Phase 15-D 활성 세션 카드 검증 3 시나리오:
- (a) `/account/security` 하단 "활성 세션" 카드 노출 + 현재 세션 배지 표시
- (b) 다른 브라우저(또는 시크릿 창)에서 재로그인 → 활성 세션 2건 → 하나 "종료" 클릭 → 시크릿 창이 401 / 재로그인 강제되는지
- (c) 사이드바 "로그아웃" → /login 리다이렉트 + `curl /api/v1/auth/refresh` 로 기 쿠키가 401 응답하는지

**DOD**: 기존 1~6·8 필수 PASS + Phase 15-D 3 시나리오 PASS.

### 우선순위 2: Cleanup scheduler 자동 실행 (KST 03:00 관찰) — 수동 검증은 완결

KST 03:00 +1일 후에 `sudo -u postgres psql -d dashboard -c "SELECT * FROM auditLogs WHERE action='CLEANUP_EXECUTED' ORDER BY id DESC LIMIT 3"` — 자동 스케줄 tick 이 예상대로 동작하는지 확인. 실패 시 PM2 로그 예외 검사.

**본 세션 P2 는 수동 트리거로 완결** — 자동 tick 동작 자체는 관찰만 남음.

### 우선순위 3: Phase 15-D 잔여 보강 (~1h)

✅ `POST /api/v1/auth/sessions/revoke-all` — 현재 세션 보존 + 나머지 revoke. `/cs` 단계에서 추가 구현. UI 에 "다른 기기 모두 로그아웃" 버튼 연동 완료.
✅ `lastUsedAt` 갱신 — GET `/api/v1/auth/sessions` 진입 시 현재 세션 touch. `/cs` 단계에서 추가 구현. refresh 시점에 국한되지 않음.
⏳ `SESSION_EXPIRE` audit — cleanup 시 expired 개별 row 를 삭제하면서 건수 또는 개별 기록. `cleanupExpiredSessions` 를 BATCHED audit 형태로 확장.
⏳ `touchSessionLastUsed` 스로틀 — 매 GET 마다 DB write 는 과함. 5분 throttle 도입 (Redis 또는 in-memory Map).

### 우선순위 4: SP-013 wal2json / SP-016 SeaweedFS 물리 측정 (환경 확보 시, 13h)

환경 준비되면 `docs/research/spikes/` 아래 결과 문서 업데이트 + `_SPIKE_CLEARANCE.md` Accepted 전환 + ADR-008/010 반영.

### 우선순위 5: Compound Knowledge 2건 후보

본 세션 설계 패턴 중 재사용 가치 있는 것:
- **opaque token + DB session + SHA-256 hash vs stateless JWT refresh** — tradeoff 표 + reuse 탐지 defense-in-depth 패턴
- **공통 로그인 종료 helper (finalizeLoginResponse)** — 3+ 경로의 access/refresh/audit/cookie 묶음 중복 제거 패턴

---

## 7. 진입점 예시

```
# 우선순위 1 — MFA UI + Phase 15-D 활성 세션 카드 브라우저 직접 검증
# 1. https://stylelucky4u.com/login → admin 로그인
# 2. 사이드바 "내 계정 > MFA & 보안" → TOTP Enroll/Login/Passkey 등 1~6·8
# 3. 동일 페이지 하단 "활성 세션" 카드 확인:
#    - 현재 세션 배지 표시
#    - 다른 브라우저로 재로그인 → 2건 → 하나 "종료" → 해당 세션 즉시 401
# 4. 사이드바 로그아웃 → /login 리다이렉트
#    curl -sS -b <쿠키> -X POST /api/v1/auth/refresh → SESSION_REVOKED 확인

# 우선순위 2 — KST 03:00 +1일 자동 스케줄 검증
# wsl -e bash -c "sudo -u postgres psql -d dashboard -c \"SELECT timestamp, action, substr(detail, 1, 80) FROM auditLogs WHERE action='CLEANUP_EXECUTED' ORDER BY id DESC LIMIT 3\""
```

---

## 8. Compound Knowledge 누적

- **세션 35 이전**: 23건
- **세션 36**: +1 — `2026-04-19-opaque-refresh-rotation-reuse-detection.md` (architecture / high confidence). Stateless JWT vs Opaque+DB 트레이드오프 표 + rotate 트랜잭션 + reuse 탐지 defense-in-depth 패턴 정리. 잔여 CK 후보 1건(공통 로그인 종료 helper 패턴)은 다음 세션 우선순위 5 위임.

**누적 24건**.

---

[← handover/_index.md](./_index.md)
