---
title: api-guard "첫 ADMIN 반환" authZ 버그 — 쿠키 fallback의 함정
date: 2026-04-12
session: 18
tags: [auth, authz, api-guard, cookie-fallback, prisma, session]
category: bug-fix
confidence: high
---

## 문제

`src/lib/api-guard.ts`의 `checkDashboardSession()` 함수가 **누가 로그인했든 관계없이 DB의 "첫 ADMIN 계정"을 반환**하는 authZ 결함.

```ts
// 기존 (버그)
async function checkDashboardSession(request: NextRequest) {
  const token = request.cookies.get("dashboard_session")?.value;
  if (!token) return null;
  try {
    await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET!));
    // ⚠️ 실제 세션의 sub/role을 무시하고 DB의 첫 ADMIN 반환
    const admin = await prisma.user.findFirst({
      where: { role: "ADMIN", isActive: true },
      select: { id: true, email: true, role: true },
    });
    if (!admin) return null;
    return { sub: admin.id, email: admin.email, role: admin.role, type: "access" };
  } catch { return null; }
}
```

**영향**: MANAGER/USER가 로그인한 쿠키로 `/api/v1/*` 호출 시 `withAuth`가 토큰 서명만 검증하고 DB에서 찾은 임의의 ADMIN으로 **role 상승(privilege escalation)**. 사실상 MANAGER도 ADMIN 권한으로 v1 API 접근 가능했음.

CVE-2025-29927과는 **별개의 결함** — middleware 우회가 아닌 순수 authZ 버그.

## 원인

- 초기 설계 시 "쿠키 기반 대시보드 사용자는 어차피 관리자뿐"이라는 암묵적 가정으로 작성된 fallback.
- 이후 세션 11~13에서 다중 사용자 + 역할(ADMIN/MANAGER/USER)이 도입됐지만 api-guard 쿠키 경로는 업데이트되지 않음.
- `jwtVerify`는 서명만 검증, 페이로드의 실제 `sub`/`role`을 읽지 않고 DB를 재조회하며 where 조건이 `role: "ADMIN"` 하드코딩.

## 해결

`resolveCookieSession`으로 교체 — **실제 세션 주체의 role을 사용**.

```ts
// 수정 (src/lib/api-guard.ts)
import { getSessionFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function resolveCookieSession(): Promise<AccessTokenPayload | null> {
  const session = await getSessionFromCookies();
  if (!session) return null;

  // 레거시 토큰 (sub === "legacy") — 30일 전환 기간
  if (session.sub === "legacy") {
    return {
      sub: "legacy",
      email: session.email,
      role: session.role as Role,
      type: "access",
    };
  }

  // DB 대조 + 비활성 계정 차단 + 실제 role 사용
  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { id: true, email: true, role: true, isActive: true },
  });
  if (!user || !user.isActive) return null;

  return {
    sub: user.id,
    email: user.email,
    role: user.role,  // ← 실제 세션 주체의 role
    type: "access",
  };
}

export function withAuth(handler: AuthenticatedHandler) {
  return async (request: NextRequest, context) => {
    const bearerToken = extractBearerToken(request);
    if (bearerToken) {
      const payload = await verifyAccessToken(bearerToken);
      if (payload) return runHandler(handler, request, payload, context);
      return errorResponse("INVALID_TOKEN", "유효하지 않은 토큰입니다", 401);
    }

    // Bearer 없으면 쿠키 fallback — 실제 세션 주체 기반
    const cookieUser = await resolveCookieSession();
    if (cookieUser) return runHandler(handler, request, cookieUser, context);

    return errorResponse("UNAUTHORIZED", "인증 토큰이 필요합니다", 401);
  };
}
```

**변경 포인트**:
1. `prisma.user.findFirst({ role: "ADMIN" })` → `prisma.user.findUnique({ id: session.sub })`
2. 페이로드의 `sub`로 **정확한 사용자 조회** 후 `isActive` 확인
3. `role: user.role` — DB의 실제 role을 반환 (하드코딩 ADMIN 금지)
4. 레거시 "sub=legacy" 토큰은 DB 조회 없이 통과 (30일 전환 기간 유지)

**CVE-2025-29927 영향 확인**: api-guard는 Route Handler 레벨에서 동작하며 `request.cookies` 직접 읽기는 middleware의 `x-middleware-subrequest` 헤더 우회 경로와 무관. 따라서 쿠키 fallback 자체는 구조적으로 안전하며 제거 대신 **올바르게 재구현**하는 것이 정답.

## 교훈

- **"서명 검증 = 인증 완료"가 아니다**: JWT 서명이 유효하더라도 페이로드의 `sub`/`role`을 실제로 사용하지 않으면 anyone-as-admin 구멍이 생긴다.
- **DB fallback 쿼리는 반드시 세션 주체 기반**: `findFirst({ role: "ADMIN" })`처럼 "아무 ADMIN"을 반환하는 패턴은 authZ 버그의 전형.
- **"CVE-2025-29927 방어" 요구사항이 있더라도 영향 범위를 정확히 식별해야 한다**: CVE는 middleware 레벨의 헤더 우회 버그이며, Route Handler 레벨의 쿠키 읽기는 영향권 밖. "Bearer 전용"으로 과도하게 좁히면 합법적 UI 호출 30여 곳이 파손될 수 있다(세션 18 D1-5 초판 회귀).
- **코드 회귀 탐색의 결정적 단서**: `grep "fetch.*api/v1"` + `credentials: "include"` 사용 여부 조사. same-origin fetch는 기본적으로 쿠키를 전송하므로 `credentials:"include"` 명시가 없어도 쿠키 인증에 의존할 수 있음.
- **문서화하지 않은 legacy fallback은 시한폭탄**: `sub === "legacy"` 분기는 30일 전환 후 제거 예정이라는 맥락이 인수인계서에만 기록돼 있음. 전환 종료일이 되면 잊지 말고 제거.

## 관련 파일

- `src/lib/api-guard.ts` — withAuth/withRole + resolveCookieSession
- `src/lib/auth.ts` — `getSessionFromCookies()` (재사용)
- `src/lib/auth-guard.ts` — Layout/Handler 직접 재검증 계층 (이번 세션 신규)
- `prisma/schema.prisma` — User.role enum (ADMIN/MANAGER/USER)
- `docs/handover/260412-session18-auth-refactor.md` — 세션 18 인수인계서
