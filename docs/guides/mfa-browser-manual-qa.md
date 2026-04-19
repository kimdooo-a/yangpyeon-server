# MFA UI 브라우저 수동 QA 체크리스트

> 상위: [CLAUDE.md](../../CLAUDE.md) → [guides/README.md](./README.md) → **여기**
>
> **세션 35 작성** — Phase 15 Auth Advanced UI 통합(세션 34)의 브라우저 round-trip 검증용.
> WebAuthn `navigator.credentials.create/get()` 는 사용자 기기 biometric 입력이 필수이므로
> 자동화 불가. 본 체크리스트는 수동 실행 SOP.

---

## 전제 조건

| 항목 | 값 |
|------|-----|
| 환경 | 프로덕션 (https://stylelucky4u.com) |
| 계정 | admin — kimdooo@stylelucky4u.com / <ADMIN_PASSWORD> |
| 클라이언트 | Chrome/Edge 최신 + Windows Hello(PIN/지문) 또는 Touch ID 또는 USB 보안키 |
| Authenticator 앱 | Google Authenticator / 1Password / Authy / Bitwarden 중 하나 |
| 배포 상태 | commit `9a6b4ff` 이상 (세션 34 MFA UI 통합 + rate limit DB-backed) |

### 시작 전 DB 스냅샷 확인 (선택)

```bash
# WSL2에서
cd ~/dashboard && sudo -u postgres psql -d dashboard -c "SELECT \"userId\", \"confirmedAt\" IS NOT NULL AS confirmed, \"failedAttempts\", \"lockedUntil\" FROM \"MfaEnrollment\";"
sudo -u postgres psql -d dashboard -c "SELECT \"userId\", \"friendlyName\", \"createdAt\" FROM \"WebAuthnAuthenticator\";"
```

DOD: admin 계정에 기존 enrollment 있으면 본 검증 후 롤백 결정(§8 참고).

---

## 시나리오 1 — TOTP Enroll (idle → qr+secret+6자리 → recovery)

### 단계

1. https://stylelucky4u.com/login 접속 → admin 로그인 → 메인 대시보드
2. 좌측 사이드바 **"내 계정 > MFA & 보안"** 클릭 → `/account/security` 로드
3. TOTP 카드: "MFA 등록 시작" 버튼 클릭
4. QR 영역 표시 + 수동 입력용 base32 secret + 6자리 입력 폼 표시됨 확인
5. Authenticator 앱으로 QR 스캔 (또는 secret 수동 입력)
6. 6자리 코드 입력 → "확인" 클릭
7. **복구 코드 10개** 표시됨 확인 (포맷 `XXXXX-XXXXX`)
8. "텍스트 다운로드" 클릭 → 로컬 `.txt` 다운로드 확인
9. "완료" 클릭 → 카드 상태 "활성화됨 (TOTP 등록 완료)"

### DOD

- [ ] QR 이미지가 정상 렌더링 (200x200 이상)
- [ ] Authenticator 앱에서 계정 라벨 `stylelucky4u.com (admin-email)` 확인
- [ ] 6자리 잘못 입력 시 "코드가 올바르지 않습니다" 에러 (연속 5회 이상 시 lockedUntil 설정 확인)
- [ ] 복구 코드 10개 모두 `^[A-Z0-9]{5}-[A-Z0-9]{5}$` 포맷
- [ ] 다운로드 파일에 10개 모두 포함
- [ ] `/account/security` 재진입 시 `GET /api/v1/auth/mfa/status` 응답 `totp.confirmed = true`

---

## 시나리오 2 — Login MFA Challenge (TOTP)

### 단계

1. 오른쪽 상단 프로필 메뉴 → "로그아웃" → `/login` 이동
2. admin 이메일 + 비밀번호 입력 → "로그인" 클릭
3. 1차 응답 확인: 페이지가 **challenge stage** 로 전환됨 (이메일/비밀번호 필드 대신 "인증 코드" + Method Tabs)
4. Method Tabs: `Authenticator` 탭 선택
5. Authenticator 앱에서 현 6자리 코드 확인 → 입력
6. "인증" 클릭 → 세션 쿠키 발급 → 메인 대시보드 진입

### DOD

- [ ] 1차 POST `/api/v1/auth/login` 응답 `mfaRequired: true` + `challengeToken` 동반
- [ ] 응답에 accessToken/세션 쿠키 **미포함** (세션 33 §5 E2E PASS 조건)
- [ ] 2차 POST `/api/v1/auth/mfa/challenge` 응답 `mfaMethod: "totp"` + 세션 쿠키 발급
- [ ] 네트워크 탭에서 첫 요청에 `challenge` 토큰 payload 확인 (JWT 디코드 `purpose: "mfa_challenge"`)
- [ ] "← 다른 계정으로" 버튼 → password stage 복귀 (동일 페이지 내)

---

## 시나리오 3 — Passkey Enroll (WebAuthn Register)

### 전제

- 브라우저가 Windows Hello / Touch ID / USB 보안키 지원
- OS 계정에 biometric 등록 완료

### 단계

1. `/account/security` → Passkey 카드 "새 Passkey 등록" 클릭
2. 친숙한 이름(friendlyName) 입력 (예: `Windows Hello - 업무용 노트북`)
3. "등록" 클릭 → 브라우저 Passkey prompt 노출
4. **Touch ID / PIN / 지문** 인증
5. 성공 토스트 + Passkey 목록에 새 항목 추가됨 확인

### DOD

- [ ] POST `/api/v1/auth/mfa/webauthn/register-options` 응답에 `rp.id: "stylelucky4u.com"` + `excludeCredentials` 배열
- [ ] `navigator.credentials.create()` 정상 수행 (NotAllowedError, NotSupportedError 등 없음)
- [ ] POST `/api/v1/auth/mfa/webauthn/register-verify` 응답 `success: true`
- [ ] `GET /api/v1/auth/mfa/status` 응답 `passkeys[]` 배열에 신규 항목 (deviceType, backedUp, createdAt)
- [ ] DB `WebAuthnAuthenticator` 테이블에 1행 추가 (counter=0 초기값)

---

## 시나리오 4 — Login via Passkey (WebAuthn Assert)

### 단계

1. 로그아웃 → `/login` 이동
2. 이메일 입력 → 비밀번호 입력 → "로그인" → challenge stage 전환
3. Method Tabs 중 **"Passkey"** 탭 선택
4. "Passkey 로 인증" 클릭 → 브라우저 Passkey picker 노출
5. 방금 등록한 Passkey 선택 → biometric 인증
6. 메인 대시보드 진입

### DOD

- [ ] POST `/api/v1/auth/mfa/webauthn/assert-options` 응답 `allowCredentials` 배열에 등록된 credentialID 포함
- [ ] `startAuthentication()` 결과 signature + clientDataJSON verify 후 counter bump
- [ ] `GET /api/v1/auth/mfa/status` 응답 `passkeys[].lastUsedAt` 업데이트 (현 시각 ± 수 초)
- [ ] DB counter 값 > 0

---

## 시나리오 5 — Passkey Delete (자기 자격증명 삭제)

### 단계

1. `/account/security` 접속
2. Passkey 목록 중 하나의 "삭제" 버튼 클릭
3. 확인 모달 → "삭제 확인"
4. 토스트 + 목록에서 제거 확인

### DOD

- [ ] DELETE `/api/v1/auth/mfa/webauthn/authenticators/[id]` 응답 200 `success: true`
- [ ] DB 해당 행 제거
- [ ] 다른 세션에서 삭제된 Passkey assert 시도 시 `allowCredentials` 에서 제외됨 (assert-options 응답 기준)
- [ ] TOTP 만 활성인 상태에서 마지막 Passkey 삭제 허용 (UI 경고 표시는 선택)

---

## 시나리오 6 — Recovery Code 사용 + 재사용 거부

### 단계

1. 로그아웃 → `/login` → challenge stage
2. Method Tabs **"복구 코드"** 선택
3. 시나리오 1에서 저장한 복구 코드 중 1개 입력 → "인증"
4. 메인 진입 확인
5. 로그아웃 → 같은 복구 코드 재입력 → "유효하지 않은 코드" 에러 확인

### DOD

- [ ] 첫 사용 시 POST `/api/v1/auth/mfa/challenge` 응답 `mfaMethod: "recovery"` + 세션 쿠키
- [ ] DB `MfaRecoveryCode.usedAt` 에 현 시각 기록
- [ ] 재사용 시 응답 `success: false` + `code: "INVALID_CODE"` (세션 33 §4 E2E PASS 조건 재현)
- [ ] `GET /api/v1/auth/mfa/status` 응답 `recoveryCodesRemaining` 카운트 9 (10 → 1 감소)

---

## 시나리오 7 (선택) — Rate Limit 차단 + Retry-After

### 단계

1. 로그아웃 → `/login` 에서 admin 이메일 고정 + **잘못된 비밀번호**로 11회 연속 제출
2. 11회차 응답 확인

### DOD

- [ ] 1~10회차: 401 `INVALID_CREDENTIALS`
- [ ] 11회차: 429 `RATE_LIMITED` + `Retry-After: 60` 헤더 (세션 34 §3 라이브 디버깅 결과)
- [ ] 응답에 `retryAfterSeconds` 필드 ≈ 60 (±2초 허용, timezone 오프셋 버그 회귀 가드)
- [ ] DB `RateLimitBucket` 에 `bucket_key = "v1Login:email:admin-email"` 행 hits=11, window_start ≤ 1분 전

---

## 시나리오 8 — TOTP Disable (비밀번호 + TOTP 모두 요구)

### 단계

1. `/account/security` → TOTP 카드 "MFA 비활성화" details 펼치기
2. 비밀번호 입력 + 현재 TOTP 6자리 입력
3. "비활성화" 클릭

### DOD

- [ ] POST `/api/v1/auth/mfa/disable` 응답 200 `success: true`
- [ ] DB `MfaEnrollment` 행 삭제 (또는 confirmedAt=null)
- [ ] 모든 `MfaRecoveryCode` 행 일괄 삭제 (recovery 코드도 무효화)
- [ ] 이후 로그인 시 challenge stage 발생하지 않음 (passkey 등록도 없다면)

---

## 실패 시 진단 순서

1. 브라우저 DevTools Network 탭 → 실패한 요청의 응답 body 확인
2. WSL2 `pm2 logs dashboard --lines 100` 에서 에러 스택 확인
3. `sudo -u postgres psql -d dashboard -c "SELECT * FROM \"MfaEnrollment\" WHERE ...;"` DB 상태 직접 확인
4. `docs/handover/260419-session34-phase15-ui-and-mfa-status.md` §3 라이브 디버깅 참고 (rate limit 충돌 / TIMESTAMP 오프셋)
5. 개발 디스패처: 세션 33/34 인수인계의 CK 후보 5건을 세션 35에서 작성함 — `docs/solutions/2026-04-19-*.md` 참고

---

## DOD (전체)

| 시나리오 | 통과 | 비고 |
|---------|------|------|
| 1. TOTP Enroll | ☐ | |
| 2. Login MFA (TOTP) | ☐ | |
| 3. Passkey Enroll | ☐ | |
| 4. Login via Passkey | ☐ | |
| 5. Passkey Delete | ☐ | |
| 6. Recovery Code 재사용 거부 | ☐ | |
| 7. Rate Limit (선택) | ☐ | |
| 8. TOTP Disable | ☐ | |

**통과 기준**: 1~6·8 필수, 7은 회귀 가드 (세션 34 디버깅 재발 방지).

---

## 발견 이슈 기록

이슈 발견 시 즉시 `docs/handover/` 에 날짜별 파일 생성 + 다음 세션 권장사항 1순위로 반영.

관련 CK: `docs/solutions/2026-04-19-pg-timestamp-naive-js-date-tz-offset.md`, `docs/solutions/2026-04-19-rate-limit-defense-in-depth-conflict.md`, `docs/solutions/2026-04-19-mfa-challenge-token-2fa-pattern.md`.

---
[← guides/README.md](./README.md)
