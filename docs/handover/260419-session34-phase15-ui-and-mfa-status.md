# 세션 34 — Phase 15 UI 통합 (MFA 등록/해제 + 로그인 MFA 분기)

> 일자: 2026-04-19
> 선행 세션: [세션 33](./260419-session33-phase15-step3-4-5.md) — Phase 15 Step 3-6 백엔드 완결 (commit `58a517b`)
> 이 세션 위치: Phase 15 Auth Advanced **UI 통합** + 세션 33 잔여물 정리

---

## 1. 입수 시점 상태

### 1-1. 세션 33 commit `58a517b` 분석

세션 33이 다음을 모두 단일 커밋(`58a517b`)으로 완결한 상태로 본 세션 시작:

- **Step 3 JWKS endpoint** (SP-014 조건부 Go) — `JwksKey` 모델 + `/api/.well-known/jwks.json` + ES256 grace 회전
- **Step 4 TOTP MFA** (FR-6.1) — `MfaEnrollment`/`MfaRecoveryCode` + 5 API + AES-256-GCM 암호화 + 10 recovery codes
- **Step 5 WebAuthn** (FR-6.2) — `WebAuthnAuthenticator`/`WebAuthnChallenge` + 4 API + login route hasPasskey 분기
- **Step 6 Rate Limit** (FR-6.3) — `RateLimitBucket` 모델 + `lock-policy.ts` + `rate-limit-db.ts` + `rate-limit-guard.ts` + 라우트 3건 적용 + `service.ts` lockedUntil atomic increment

**검증 상태** (세션 33 마감 시점): tsc 0 / vitest **175 PASS** / 4 migration 적용 / WSL2 빌드·PM2 restart·Tunnel online.

### 1-2. UI 미통합

세션 33 종료 시점 결정사항: "WebAuthn navigator.credentials.create/get() 필요 → 대시보드 UI 연동은 별도 세션". 본 세션이 그 후속.

---

## 2. 본 세션 작업 — Phase 15 UI 통합

### 2-1. 신규 API (백엔드 보완)

#### `GET /api/v1/auth/mfa/status`
- 사용자별 MFA 상태 + Passkey 목록을 한 번에 조회 (UI 페이지 진입 시 단일 호출).
- 응답: `{ totp: { enrolled, confirmed, lockedUntil }, passkeys: [...], recoveryCodesRemaining }`.
- `withAuth` 가드 — 쿠키 세션 자동 인식.

#### `DELETE /api/v1/auth/mfa/webauthn/authenticators/{id}`
- 자기 Passkey 1건 삭제. `userId` 매칭으로 타 사용자 자격증명 보호.
- TypeScript 패턴: `{ params: Promise<{ id: string }> }` cast (다른 dynamic route와 동일).

### 2-2. UI 페이지 신규 — `(protected)/account/security/page.tsx`

- 위치: `(admin)` 그룹 **밖** — USER 포함 모든 사용자가 접근 가능 (`(protected)/layout.tsx`의 `requireSession()`만 통과).
- 컴포넌트 구성:
  - **TOTP Card** (3 stage 인라인 stepper): `idle` → `qr`(QR + secret + 6자리 입력) → `recovery`(10 코드 + 텍스트 다운로드).
  - **Passkey Card**: 등록된 Passkey 목록(이름/디바이스 타입/백업 상태/등록·마지막 사용 시각) + 삭제 버튼. 새 Passkey 등록(이름 입력 → `@simplewebauthn/browser` `startRegistration`).
  - **TOTP Disable**: `<details>` 접이식 — 비밀번호 + 현재 TOTP 코드 둘 다 요구 (강력 재인증).
- 토스트: `sonner` 사용 (기존 dependency).
- 에러 핸들링: `NotAllowedError`(브라우저 거부) 별도 메시지.

### 2-3. 사이드바 — "내 계정" 그룹 신설

`src/components/layout/sidebar.tsx`:
- 신규 `NavItem`: `{ href: "/account/security", label: "MFA & 보안", icon: <Lock />, group: "내 계정" }`.
- `GROUP_ORDER`에 `"내 계정"` 추가 (마지막 순서).
- `Lock` 아이콘 lucide-react import 추가.
- ADMIN_ONLY/MANAGER_PLUS 매트릭스에 포함하지 않음 → 모든 역할 표시.

### 2-4. 로그인 페이지 — MFA Challenge UI 분기

`src/app/login/page.tsx`:

#### 신규 상태 머신
```typescript
type MfaState =
  | { stage: "password" }
  | { stage: "challenge"; challenge: string; methods: ("totp"|"recovery"|"passkey")[] };
```

#### 분기 흐름
1. 1차(password) 응답 `mfaRequired: true` 시 `MfaState`를 challenge로 전환 + 우선 method 선택(passkey > totp > recovery).
2. challenge stage UI:
   - **Method Tabs**: passkey/Authenticator/복구 코드 (사용 가능한 것만 노출).
   - **TOTP**: 6자리 숫자 입력(자동 비숫자 제거) → `POST /mfa/challenge { code }`.
   - **Recovery**: XXXXX-XXXXX 텍스트 입력 → `POST /mfa/challenge { recoveryCode }`.
   - **Passkey**: 버튼 → `POST /mfa/webauthn/assert-options` → `startAuthentication()` → `POST /mfa/webauthn/assert-verify`.
3. 모든 분기 성공 시 공통 `finalizeLogin(accessToken)` → `POST /api/auth/login-v2`(쿠키 변환) → `router.push("/")`.
4. "← 다른 계정으로 로그인" 버튼으로 `password` stage 복귀 (challenge 토큰 폐기).

#### 디자인 일관성 유지
- 기존 Warm Ivory 테마 (`#F8F6F1` 배경, `#2D9F6F` accent, `#1A1815` 텍스트) 그대로.
- 터미널 스테이터스 라인 + 배경 도트 패턴 유지.
- 6자리 입력은 `text-2xl font-mono tracking-widest` 로 시각적 강조.

### 2-5. 의존성 추가

`package.json`:
- `@simplewebauthn/browser@^10` — server v10과 페어. `startRegistration` / `startAuthentication` API.

---

## 3. 검증 결과

### 3-1. 정적 검증
- `npx tsc --noEmit` → **0 에러**.
- `npx vitest run` → **175 PASS** (회귀 0건).
- `npm install @simplewebauthn/browser` → 평이한 prebuilt 설치.

### 3-2. WSL2 빌드 + 배포
- `/ypserver prod --skip-win-build` 4회 수행 (Step 6 PG fix 1회 + UI 변경 2회 포함).
- 모든 라운드: 빌드 PASS / PM2 restart online / Tunnel online / health 200 또는 307.

### 3-3. 라우트 smoke (curl)

| URL | 결과 | 비고 |
|------|------|------|
| `GET /account/security` | **307** | 미인증 → /login redirect (auth guard 정상) |
| `GET /api/v1/auth/mfa/status` | **401** | 미인증 → withAuth 차단 (정상) |
| `GET /login` | **200** | 로그인 페이지 렌더 |

### 3-4. Step 6 Rate Limit 라이브 검증

| 테스트 | 기대 | 실측 |
|--------|------|------|
| login 11회 시도 (max=10) | 1~10: 401 / 11~12: 429 | ✅ 정확히 11번째 차단 |
| `Retry-After` 헤더 | ≤60초 | ✅ 60초 (PG `EXTRACT(EPOCH ...)` 직접 계산) |
| MFA verify lockedUntil | 5회 실패 → 락 | 단위 테스트 7건 PASS |

**핵심 디버깅** (본 세션 중 발견·해결):
- (1) **proxy.ts 인메모리 5/min vs handler DB-backed 10/min 충돌** — 6번째 요청에서 proxy가 먼저 차단했음. `HANDLER_OWNED_RATE_LIMIT_PATHS` Set으로 v1 auth 경로를 handler에 양도하여 single source of truth 확보.
- (2) **Postgres TIMESTAMP(3) timezone-naive + JS Date 변환 시 KST↔UTC 9시간 오프셋 누적** — 클라이언트 elapsed 계산 대신 `EXTRACT(EPOCH FROM (window_start + INTERVAL - NOW())) * 1000` 으로 PG가 직접 잔여 ms 계산하도록 변경. `Retry-After: 32453s` (9h) → `60s`.

---

## 4. 알려진 제약 / 다음 세션 위임

### 4-1. 브라우저 E2E 미실행
- `navigator.credentials.create()` / `get()` 호출은 실제 브라우저 환경 + 사용자 인터랙션(생체 인증 등) 필요.
- WebAuthn virtual authenticator (Chrome devtools `cdp.WebAuthn.addVirtualAuthenticator`) 또는 SimpleWebAuthn devtools 확장으로 자동화 가능.
- **권장**: 다음 세션에서 사용자가 stylelucky4u.com 접속 → /account/security 진입 → TOTP 등록 + Passkey 등록 → /login 다시 접속 → MFA challenge 흐름 수동 검증.

### 4-2. SP-013 / SP-016 별도 환경 필요
- SP-013 wal2json: PG + wal2json 익스텐션 + 30분 DML 부하 — 별도 DB 환경 필요.
- SP-016 SeaweedFS 50GB: 50GB 디스크 + B2 오프로드 — 별도 스토리지 환경 필요.
- 본 세션은 환경 미확보로 deferral 처리. _SPIKE_CLEARANCE.md 의 Pending 엔트리 유지.

### 4-3. cleanupExpiredRateLimitBuckets 미스케줄
- 함수만 정의 (`src/lib/rate-limit-db.ts`). cron 등록은 후속 (sessions cleanup과 함께 일괄 처리 권장 — 둘 다 일 1회 windowStart/expires_at 기반).

### 4-4. /api/auth/login (legacy)는 인메모리 그대로
- v1 라우트만 DB-backed 전환. legacy 라우트는 `loginAttempts: Map` 패턴 유지 (deprecated 메시지 출력 중이라 별도 마이그레이션 불필요).

---

## 5. 파일 변경 요약 (본 세션)

```
M  package.json                                                    +1 (@simplewebauthn/browser)
M  package-lock.json                                               + (의존성)
M  src/app/login/page.tsx                                          ~+150 lines (MFA 분기)
M  src/components/layout/sidebar.tsx                               +3 lines (Lock + 항목 + 그룹)
A  src/app/(protected)/account/security/page.tsx                   ~340 lines
A  src/app/api/v1/auth/mfa/status/route.ts                         ~50 lines
A  src/app/api/v1/auth/mfa/webauthn/authenticators/[id]/route.ts   ~30 lines
```

선행 세션 33 커밋 `58a517b`:
```
3,384 insertions / 144 deletions, 41 files
```

---

## 6. 다음 세션 우선순위

### 우선순위 1: MFA UI 브라우저 검증 (1-2h)
1. https://stylelucky4u.com/login 접속 (admin 계정).
2. `/account/security` 진입 → "MFA 등록 시작" → Authenticator 앱(예: Google Authenticator)으로 QR 스캔 → 6자리 입력 → 복구 코드 다운로드.
3. 로그아웃 → 다시 로그인 → MFA challenge UI 표시 확인 → TOTP 코드로 인증.
4. 다시 `/account/security` → "새 Passkey 등록" → 기기 이름 입력 → Touch ID/Windows Hello/Passkey manager → 등록 완료 메시지.
5. 로그아웃 → 다시 로그인 → Passkey 탭 선택 → 인증.
6. (선택) 복구 코드로 로그인 → 사용한 코드 재사용 거부 확인.

### 우선순위 2: 운영 cron 일괄 등록 (1h)
- `cleanupExpiredSessions` (세션 32 정의)
- `cleanupExpiredRateLimitBuckets` (본 세션 정의)
- JWKS `cleanup` (세션 33 `src/lib/jwks/store.ts`)
- WebAuthnChallenge `cleanupExpiredChallenges` (세션 33)

후보: `instrumentation.ts`의 cron 부트스트랩에 통합 또는 별도 `src/lib/cleanup-scheduler.ts` 신설.

### 우선순위 3: SP-013 / SP-016 (환경 확보 시 13h)

### 우선순위 4: Phase 15 D Refresh Rotation (다음 Phase)
- Sessions 테이블 INSERT 시작 + opaque refresh token 회전 + revoke 흐름.
- 본 세션의 `account/security` 페이지에 "활성 세션" 카드 추가 가능.

---

## 7. 참고 — 디버깅 인사이트 (Compound Knowledge 후보)

### CK 후보: "PG TIMESTAMP(3) timezone-naive + JS Date elapsed 계산의 9시간 오프셋"
- 본 세션 §3.4 (2) 디버깅 결과.
- 대안: TIMESTAMPTZ 컬럼 사용 OR PG 측 `EXTRACT(EPOCH ...)` 직접 계산 위임.
- 권장 패턴: "시간 계산은 가능한 한 DB 한 곳에 위임 — 클라이언트 시간대 변환이 끼어들면 디버깅 지옥".

### CK 후보: "defense-in-depth rate limit 레이어 충돌 — single source of truth per route"
- 본 세션 §3.4 (1) 디버깅 결과.
- 두 layer가 같은 정책을 다른 store로 시행하면 더 빡빡한 쪽이 보이는 동작 결정 → 의도치 않은 차단 임계.
- 권장: `HANDLER_OWNED_RATE_LIMIT_PATHS` Set 패턴으로 명시적 양도.

(다음 세션에서 `docs/solutions/2026-04-19-*.md` 형식으로 정식 작성 권장)

---

[← handover/_index.md](./_index.md)
