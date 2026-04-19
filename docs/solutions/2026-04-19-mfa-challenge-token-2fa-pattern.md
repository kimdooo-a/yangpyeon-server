---
title: "MFA Challenge-Token 2FA 패턴 — password 통과 후 short-lived JWT로 2차 factor 교환"
date: 2026-04-19
session: 33
tags: [auth, mfa, 2fa, jwt, webauthn, totp, pattern, security]
category: pattern
confidence: high
---

## 문제

2FA(TOTP/Passkey/Recovery)를 기존 로그인 엔드포인트에 붙일 때 다음 질문이 발생한다:

**"`/api/v1/auth/login` 에서 password 검증 성공 직후 세션 쿠키(access+refresh)를 발급하고, 2차 인증은 이후 별도 엔드포인트에서 "옵션"으로 처리해도 되는가?"**

증상/리스크:
- password 가 유출된 경우 공격자가 **이미 로그인 상태** 로 진입 → 2FA 의미 상실 (session fixation 유사 벡터)
- 1차 응답에 access token 이 있으면 "2FA 건너뛰기" UI 버그가 치명적 취약점으로 전이
- TOTP / WebAuthn / Recovery 의 **여러 2차 factor** 를 한 요청에 난입시키면 라우트 분기가 폭발 (password+code XOR password+passkey XOR password+recovery …)
- Supabase GoTrue 의 `aal`(Authenticator Assurance Level) 은 서버 세션 상태를 추적 — 우리는 stateless JWT 만 쓰므로 단순화 필요

즉, **1차 응답 스키마** 와 **2차 factor 다형성** 을 동시에 해결하는 패턴이 필요.

## 원인 (설계 선택의 핵심)

2FA 의 실제 의미는 "두 factor **모두** 통과해야 접근 권한 발급" 이다. 한 factor 통과만으로 세션을 발급하면 이는 정의상 1FA 이다. 따라서:

1. **password-only session 발급 금지** — 1차 성공 시점에 access/refresh 를 주면 안 된다
2. **상태 이월 수단 필요** — 1차 통과 사실을 서버가 기억해야 2차 검증 시 사용자를 특정 가능
3. **state 는 서버 DB 가 아니라 서명된 토큰에 넣는다** — 프로젝트는 stateless JWT 아키텍처 (Phase 15-D Refresh rotation 이전). 세션 테이블에 pending 레코드를 만들면 정리 비용/경쟁 조건 발생
4. **access/refresh 와 혼용 방지** — 중간 토큰이 실수로 protected resource 검증에 통과하면 안 된다 → 별도 `purpose` claim 필수
5. **2차 factor 다형성은 body discriminator 로** — challenge 토큰이 "누가" 를, body 가 "무엇으로" 를 결정

## 해결

### 구조 — 두 엔드포인트 + 5분 challenge JWT

```
1차: POST /api/v1/auth/login
     body: { email, password }
     성공 (MFA 없는 사용자): { accessToken, user } + refresh 쿠키
     성공 (MFA 있는 사용자): { mfaRequired: true, methods, challenge, challengeExpiresIn }
                              — access 미발급, refresh 쿠키 미설정

2차: POST /api/v1/auth/mfa/challenge  (TOTP / recovery)
     POST /api/v1/auth/mfa/webauthn/assert-options  (Passkey — options 발급)
     POST /api/v1/auth/mfa/webauthn/assert-verify   (Passkey — 서명 검증)
     body: { challenge, code? , recoveryCode? , response? }
     성공: { accessToken, user, mfaMethod } + refresh 쿠키
```

### Challenge 토큰 발급 (`src/lib/mfa/challenge.ts`)

```typescript
const CHALLENGE_MAX_AGE = 5 * 60; // 5분
const CHALLENGE_PURPOSE = "mfa_challenge" as const;

export async function issueMfaChallenge(userId: string): Promise<string> {
  return new SignJWT({ purpose: CHALLENGE_PURPOSE })
    .setSubject(userId)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${CHALLENGE_MAX_AGE}s`)
    .sign(getChallengeSecret());
}

export async function verifyMfaChallenge(token: string): Promise<MfaChallengePayload | null> {
  const { payload } = await jwtVerify(token, getChallengeSecret(), { algorithms: ["HS256"] });
  if (payload.purpose !== CHALLENGE_PURPOSE) return null;  // ← 엄격 검증
  if (!payload.sub) return null;
  return { sub: payload.sub as string, purpose: CHALLENGE_PURPOSE };
}
```

핵심: `purpose !== "mfa_challenge"` 이면 즉시 null. access/refresh 토큰이 실수로 흘러들어와도 거부.

### 1차 분기 (`src/app/api/v1/auth/login/route.ts`)

```typescript
const [enrollment, passkeyCount] = await Promise.all([
  prisma.mfaEnrollment.findUnique({ where: { userId: user.id }, select: { confirmedAt: true } }),
  prisma.webAuthnAuthenticator.count({ where: { userId: user.id } }),
]);
const hasTotp = user.mfaEnabled && Boolean(enrollment?.confirmedAt);
const hasPasskey = passkeyCount > 0;

if (hasTotp || hasPasskey) {
  const methods: ("totp" | "recovery" | "passkey")[] = [];
  if (hasTotp) methods.push("totp", "recovery");
  if (hasPasskey) methods.push("passkey");

  const challenge = await issueMfaChallenge(user.id);
  return NextResponse.json({
    success: true,
    data: { mfaRequired: true, methods, challenge, challengeExpiresIn: CHALLENGE_MAX_AGE },
  });
  // ← 여기서 accessToken 미발급, refresh 쿠키 미설정
}
// MFA 없는 사용자만 여기부터 access/refresh 발급
```

### 2차 검증 (`src/app/api/v1/auth/mfa/challenge/route.ts`)

```typescript
const challengePayload = await verifyMfaChallenge(parsed.data.challenge);
if (!challengePayload) {
  return errorResponse("INVALID_CHALLENGE", "챌린지 토큰이 유효하지 않거나 만료되었습니다", 401);
}
const user = await prisma.user.findUnique({ where: { id: challengePayload.sub } });
// ...
const result = await verifyMfaSecondFactor(user.id, {
  code: parsed.data.code,
  recoveryCode: parsed.data.recoveryCode,
});
if (!result.ok) { /* INVALID_CODE 또는 MFA_LOCKED + Retry-After */ }

// 이 시점에만 access/refresh 발급
const accessToken = await createAccessToken({ userId: user.id, ... });
response.cookies.set(V1_REFRESH_COOKIE, refreshToken, { httpOnly: true, ... });
```

### WebAuthn 은 이중 challenge 검증

Passkey 경로는 challenge 가 두 종류 존재한다:
1. **MFA challenge JWT** — 1차 통과 증거 (5분, purpose=mfa_challenge)
2. **WebAuthn challenge** — `navigator.credentials.get()` clientDataJSON 내부의 서명 대상 (60초, DB single-use)

`assert-verify` 는 **둘 다** 검증하고 **소유자 일치** 를 강제한다. 어느 한 쪽만 재사용되면 거부.

### 클라이언트 패턴 — Discriminated Union

```typescript
type LoginResult =
  | { mfaRequired: false; accessToken: string; user: User }
  | { mfaRequired: true; methods: ("totp" | "recovery" | "passkey")[]; challenge: string; challengeExpiresIn: number };

// UI 상태 전환이 명료 — password 화면 → 2FA 선택 화면 → factor 입력 화면
```

### 검증 (세션 33 E2E 6건 PASS)

- enroll → confirm → 재로그인 시 `mfaRequired=true + challenge 207 chars + accessToken 미포함` 확인
- challenge + TOTP → `mfaMethod=totp`, accessToken 260 chars 발급
- challenge + recovery `P7QDM-WTJQP` → `mfaMethod=recovery`, DB `used_at count=1`
- 동일 recovery 재사용 → **INVALID_CODE 거부** (일회성 증명)
- purpose claim 불일치 토큰 → INVALID_CHALLENGE (access 토큰 오용 차단)

## 재발 방지

1. **신규 2차 factor 추가 시 동일 패턴 유지** — SMS/이메일 OTP 등 도입 시에도 `methods` 배열 확장 + challenge 토큰 재사용. 별도 "shortcut" 엔드포인트 금지
2. **challenge TTL 5분 상한 유지** — 길게 가면 토큰 탈취 창 확대. 짧으면 UX 저하. 5분은 TOTP 입력 + 네트워크 + 사용자 망설임 포함 상한
3. **`purpose` claim 엄격 검증 필수** — `payload.purpose !== "mfa_challenge"` 는 즉시 null 반환. 이 한 줄이 없으면 access 토큰으로 2FA 우회 가능
4. **1차 응답에 절대 refresh 쿠키 금지** — `response.cookies.set(V1_REFRESH_COOKIE, ...)` 은 MFA 분기 후에만 호출. 코드 리뷰 체크리스트 항목
5. **WebAuthn 은 이중 challenge** — MFA challenge 단독으로는 Passkey 진입 불가. clientDataJSON 의 DB-backed challenge 도 소비
6. **서버 state 테이블 유혹 거부** — "pending_logins" 같은 테이블 도입 시 정리 비용 / 경쟁 조건 / cross-node 동기화 문제 발생. 서명된 토큰으로 충분

## 관련 구조

### 파일
- `src/lib/mfa/challenge.ts` — `issueMfaChallenge` / `verifyMfaChallenge` + `CHALLENGE_MAX_AGE`
- `src/app/api/v1/auth/login/route.ts` — 1차 분기 (hasTotp || hasPasskey → challenge 발급)
- `src/app/api/v1/auth/mfa/challenge/route.ts` — 2차 검증 (TOTP / recovery)
- `src/app/api/v1/auth/mfa/webauthn/assert-options/route.ts` — Passkey 옵션 (MFA challenge 검증 후 allowCredentials scope)
- `src/app/api/v1/auth/mfa/webauthn/assert-verify/route.ts` — Passkey 서명 (이중 challenge 검증)
- `src/lib/mfa/service.ts` — `verifyMfaSecondFactor` (code / recoveryCode 분기 + lockedUntil)
- `src/lib/schemas/mfa.ts` — `mfaChallengeSchema` (XOR refine)

### 참조
- Auth Advanced Blueprint §7.2.3 (MFA 설계) / §7.3 (STRIDE S3 — challenge 재전송 방어)
- 세션 33 handover (`docs/handover/260419-session33-phase15-step3-4-5.md`) 토픽 3·4
- ADR-019 (argon2id) — 패스워드 검증 경로 전제
- Supabase GoTrue `aal` 패턴 — 본 패턴은 state 를 JWT 에 넣어 한 단계 단순화
- 관련 CK: `2026-04-19-simplewebauthn-v10-api-shape.md` (WebAuthn 경로 구현 세부)

### 일반화

이 패턴은 2FA 뿐 아니라 모든 "1차 통과 → 중간 단계 → 2차 승인" 흐름에 적용 가능:
- **Step-up auth** — 민감 작업(비밀번호 변경, 삭제) 직전 재인증. `purpose=stepup_challenge` 로 분리
- **OAuth consent** — authorization code 교환이 실질적으로 같은 패턴 (short-lived code → access token)
- **Magic link** — 이메일 링크 = challenge 토큰. 링크 클릭 → session 발급
