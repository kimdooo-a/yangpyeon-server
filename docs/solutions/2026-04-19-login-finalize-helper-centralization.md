---
title: "로그인 종료 helper 중앙화 — 3+ 경로의 access/refresh/audit/cookie 묶음 단일화"
date: 2026-04-19
session: 36-37
tags: [auth, refactoring, dry, session-management, helper, api-design]
category: pattern
confidence: high
---

## 문제

2FA 도입 후 로그인 경로가 단일(POST /login) → 다중(password / TOTP / Passkey) 로 분기되면서 동일한 "로그인 완결" 로직이 복제됨:

1. `POST /api/v1/auth/login` — 비밀번호만 (MFA 없는 사용자)
2. `POST /api/v1/auth/mfa/challenge` — TOTP / recovery 검증 통과 후
3. `POST /api/v1/auth/mfa/webauthn/assert-verify` — Passkey 서명 검증 통과 후

각 경로에서 공통으로 수행해야 할 작업:

- `createAccessToken({userId,email,role})` — 15분 JWT 발급
- `issueSession({userId,ip,userAgent})` — Prisma Session row insert + opaque 토큰
- `writeAuditLogDb({action:"SESSION_LOGIN", detail:{method,sessionId}})` — 감사
- `NextResponse.json({accessToken, user, ...extras})` — 응답 바디
- `response.cookies.set(V1_REFRESH_COOKIE, ...)` — httpOnly 쿠키

**증상/리스크**:

- 3 경로 × 5 단계 = 15개 구현 포인트. 한 곳만 바꾸면 drift 발생.
- Phase 15-D Refresh Rotation 도입 시 쿠키 전략 변경(stateless JWT → opaque) 필요 — 3 경로 모두 동시 수정하지 않으면 일부 경로만 마이그레이션된 중간 상태 생김.
- 감사 로그 필드 확장 시 (예: `SESSION_LOGIN detail.deviceFingerprint`) 한 경로에서 누락되면 분석 일관성 깨짐.
- 실수로 Passkey 경로에서만 refresh 쿠키 maxAge 를 다르게 설정하면 "왜 Passkey 만 로그아웃 주기가 다르지?" 같은 원인 불명 버그.

## 원인

분기 지점이 **인증 방법**에 있지 **로그인 결과**에 있지 않음에도, 각 라우트 핸들러가 자기 "인증 방법" 책임 + "로그인 결과 확정" 책임을 함께 가짐.

→ **Single Responsibility Principle 위반**. 인증 방법 변경(새 factor 추가) 과 로그인 결과 확정 변경(쿠키 정책/감사 스키마) 이 같은 파일에서 섞임.

## 해결

### `finalizeLoginResponse(params): Promise<NextResponse>` 추출

경로: `src/lib/sessions/login-finalizer.ts` (세션 36 신설)

```ts
export interface FinalizeLoginParams {
  request: NextRequest;
  user: { id: string; email: string; name: string | null; role: Role };
  method: "password" | "totp" | "recovery" | "passkey";
  /** method 고유 추가 필드 (예: mfaMethod) */
  extraData?: Record<string, unknown>;
}

export async function finalizeLoginResponse(
  params: FinalizeLoginParams,
): Promise<NextResponse> {
  const ip = extractClientIp(params.request.headers);
  const userAgent = params.request.headers.get("user-agent") ?? null;

  const accessToken = await createAccessToken({
    userId: params.user.id,
    email: params.user.email,
    role: params.user.role,
  });
  const session = await issueSession({ userId: params.user.id, ip, userAgent });

  writeAuditLogDb({
    timestamp: new Date().toISOString(),
    method: "POST",
    path: params.request.nextUrl.pathname,
    ip,
    action: "SESSION_LOGIN",
    userAgent: userAgent ?? undefined,
    detail: JSON.stringify({
      userId: params.user.id,
      sessionId: session.sessionId,
      method: params.method,
    }),
  });

  const response = NextResponse.json({
    success: true,
    data: {
      accessToken,
      user: {
        id: params.user.id,
        email: params.user.email,
        name: params.user.name,
        role: params.user.role,
      },
      ...(params.extraData ?? {}),
    },
  }, { status: 200 });

  response.cookies.set(V1_REFRESH_COOKIE, session.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: REFRESH_TOKEN_MAX_AGE_SEC,
    path: "/api/v1/",
  });

  return response;
}
```

### 3 경로의 수렴

Before (3 경로 × ~40줄 중복):
```ts
// login/route.ts
const accessToken = await createAccessToken(...);
const session = await issueSession(...);
writeAuditLogDb(...);
const res = NextResponse.json({...});
res.cookies.set(V1_REFRESH_COOKIE, ...);
return res;

// mfa/challenge/route.ts — 위와 동일 + method:"totp"
// webauthn/assert-verify/route.ts — 위와 동일 + method:"passkey"
```

After (3 경로 모두 한 줄):
```ts
return finalizeLoginResponse({
  request,
  user,
  method: "password",  // 또는 "totp" / "passkey" / "recovery"
  extraData: { mfaMethod: "totp" },  // method 고유 필드만
});
```

## 결과

### 이점

1. **변경 비용 O(1)** — 쿠키 path, maxAge, audit 필드, 응답 스키마 변경 시 1 파일만 수정.
2. **새 factor 추가 비용 O(1) in 결과 확정** — "WebAuthn 추가" 시 `method: "passkey"` 한 줄만 확장. 쿠키/감사/응답 자동 동기화.
3. **회귀 방지** — Phase 15-D 에서 `createRefreshToken` → `issueSession` 교체 시 3 경로 모두 한 커밋에 동기 전환.
4. **테스트 표면 축소** — 3 경로의 "결과 확정" 시나리오를 1 함수에 대한 유닛/통합 테스트로 통합 가능.

### 검증 (세션 36 E2E)

- password 로그인 → `SESSION_LOGIN detail.method="password"` 감사 기록 + refresh 쿠키 set
- TOTP MFA 통과 → `method="totp"` + 동일 쿠키 전략
- Passkey assert → `method="passkey"` + 동일 쿠키 전략
- 3 경로 모두 동일한 Prisma Session row schema / 동일 쿠키 속성 / 동일 access token 구조

## 일반화 원칙

### 추출 판단 기준 (DRY 을 맹목적으로 따르지 말고)

| 조건 | 추출 | 추출 안 함 |
|------|------|-----------|
| 단순 반복 (같은 줄 3회) | △ | ○ (인라인 유지) |
| 3+ 경로 공통 | ○ | - |
| 공통 부분에 **정책** 포함 (쿠키 속성, audit 스키마) | ○ 필수 | - |
| 변경 시 **동기 수정 필수** | ○ 필수 | - |
| 경로별로 살짝씩 다른 로직 (80% 공통 + 20% 분기) | ○ + extraData 파라미터 | △ |

**요지**: "중복 줄 수" 가 아니라 **"변경 시 drift 위험"** 이 추출 신호.

### 안티패턴 회피

- **모든 분기를 helper 안에 밀어넣기 금지** — `method` 별 if/else 가 helper 내부에서 폭발하면 새 factor 추가가 helper 수정을 강제 → 추출 이점 사라짐. **method 고유 로직은 호출 측에, 공통 결과 확정만 helper 에**.
- **helper 가 부작용 순서에 의존하면 문서화 필수** — 현재 helper 는 (access token 생성 → session insert → audit → 응답) 순. 이 순서가 바뀌면 audit 누락 시나리오 발생 가능.

## 관련 패턴

- **Template Method 패턴** — 호출 측이 "언제" helper 를 부를지 결정, helper 는 "무엇을" 표준화.
- **Facade 패턴** — 여러 subsystem (JWT + Prisma + audit + NextResponse) 을 한 인터페이스로 감춤.
- **라우트 레벨 middleware 와의 차이** — middleware 는 요청 전처리, helper 는 응답 확정. Next.js proxy/middleware 에서 refresh 쿠키 set 이 불가하므로 helper 접근이 더 자연스러움.

## 교차 참조

- `docs/solutions/2026-04-19-opaque-refresh-rotation-reuse-detection.md` (세션 36 — 이 helper 의 쿠키 전략이 의존)
- `docs/solutions/2026-04-19-mfa-challenge-token-2fa-pattern.md` (세션 33 — 3 경로 분기의 원인)
- `src/lib/sessions/login-finalizer.ts` (세션 36 구현)
- `src/app/api/v1/auth/login/route.ts` (password 경로 호출자)
- `src/app/api/v1/auth/mfa/challenge/route.ts` (TOTP/recovery 경로 호출자)
- `src/app/api/v1/auth/mfa/webauthn/assert-verify/route.ts` (Passkey 경로 호출자)

## 메타

- **발견 세션**: 36 (Phase 15-D 구현 중 — stateless JWT refresh → opaque token 교체 시 3 경로 동기 수정 필요성)
- **재사용 가치**: 높음 — 다중 factor 인증 / 여러 로그인 방법(OAuth + 이메일 + SSO) 도입하는 모든 앱에 적용 가능
- **검증 수준**: 프로덕션 E2E 9 시나리오 PASS (세션 36)
