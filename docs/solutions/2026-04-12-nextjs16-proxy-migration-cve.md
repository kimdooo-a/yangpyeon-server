---
title: Next.js 16 middleware.ts → proxy.ts 근본 마이그레이션 (CVE-2025-29927 방어)
date: 2026-04-12
session: 18
tags: [nextjs16, proxy, middleware, cve-2025-29927, auth, route-group, layout]
category: architecture
confidence: high
---

## 문제

Next.js 16이 `middleware.ts` → `proxy.ts` 리네임을 deprecation 경고와 함께 권장한다. 단순 파일/함수명 리네임만 수행하면 경고는 사라지지만 **CVE-2025-29927**의 구조적 취약 패턴을 그대로 proxy에 옮기게 된다.

CVE-2025-29927은 `x-middleware-subrequest` HTTP 헤더를 조작해 Next.js middleware의 인증 로직 자체를 우회할 수 있었던 실제 취약점이다. middleware/proxy 파일에서 JWT 검증·RBAC·권한 분기를 수행하면 이 우회 경로가 계속 존재한다.

또한 proxy.ts에는 **route segment config 선언이 금지**된다 (`export const runtime`, `dynamic` 등). 암시적으로 Node.js 런타임에서만 동작하며 `runtime = "nodejs"`를 명시적으로 선언하면 빌드 오류 발생:
```
Error: Route segment config is not allowed in Proxy file at "./src/proxy.ts".
Proxy always runs on Node.js runtime.
```

## 원인

1. **middleware 레벨 버그**: Next.js 내부의 `x-middleware-subrequest` 체크 로직 결함. middleware가 이 헤더를 보고 "내부 재요청"으로 간주해 인증 스킵.
2. **proxy는 여전히 동일 경로**: Next.js 16에서 proxy.ts로 이름만 바꿔도 middleware 런타임 동일. auth 로직을 proxy에 두면 CVE의 여파를 그대로 이어받음.
3. **공식 docs 권고**: "proxy.ts는 네트워크 경계 용도(rewrites/headers/IP/rate limit 등)이며 auth는 Layout이나 Route Handler에서 수행하라."

## 해결

### 1. auth 책임 이관

| 책임 | 이전 위치 | 이후 위치 |
|---|---|---|
| IP 화이트리스트 | middleware | **proxy** (유지) |
| Rate Limit | middleware | **proxy** (유지) |
| CORS/CSRF | middleware | **proxy** (유지) |
| 감사 로그 (네트워크) | middleware | **proxy** (유지) |
| JWT 쿠키 검증 | middleware | **Layout (`requireSession`)** |
| RBAC 체크 | middleware | **Layout (`requireRole`) + Route Handler (`requireRoleApi`)** |

### 2. 보호 라우트 그룹 `(protected)` 도입

```
src/app/
├── layout.tsx                      (Root, 공개)
├── login/                           (공개)
├── api/                             (Route Handler 레벨 보호)
└── (protected)/                     ← 신규
    ├── layout.tsx                   ← await requireSession()
    ├── page.tsx, processes/, logs/, ... (MANAGER+ 보호 페이지 13개)
    └── (admin)/
        ├── layout.tsx               ← await requireRole("ADMIN")
        └── audit/, settings/        (ADMIN 전용 2개)
```

`git mv`로 물리 이동 → 히스토리 보존. Route group은 URL에 미반영 → 사이드바/북마크 영향 0.

### 3. auth-guard 헬퍼 설계 (CVE 구조적 차단)

```ts
// src/lib/auth-guard.ts
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth";

// Layout용 — cookies() 직접 호출로 x-middleware-subrequest 우회 차단
export async function requireSession() {
  const session = await getSessionFromCookies();
  if (!session) redirect("/login");
  return session;
}

// Route Handler용 — discriminated union으로 핸들러에서 session 검증 누락 불가
type AuthApiResult =
  | { session: DashboardSessionPayload; response?: never }
  | { session?: never; response: NextResponse };

export async function requireSessionApi(): Promise<AuthApiResult> {
  const session = await getSessionFromCookies();
  if (!session) {
    return { response: NextResponse.json({ error: "인증 필요" }, { status: 401 }) };
  }
  return { session };
}
```

**핵심 포인트**:
- `NextRequest` 인자 **받지 않음** → `cookies()` 직접 호출 → `x-middleware-subrequest` 헤더가 미치는 경로 자체를 배제
- Discriminated union `{session}|{response}` 반환으로 타입 시스템이 "auth 없이 session 사용" 구조적 차단

### 4. proxy.ts 작성 시 route segment config 금지

```ts
// src/proxy.ts
import { NextRequest, NextResponse } from "next/server";

// ❌ 금지: export const runtime = "nodejs"; → 빌드 오류
// ✅ Next.js 16 proxy는 암시적 Node.js 런타임

export async function proxy(request: NextRequest) {
  // IP/Rate Limit/CORS/CSRF/감사로그만 수행. auth 체크 없음.
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

### 5. 롤백 안전성

각 단계를 독립 커밋으로 쪼개면 D1-1~D1-5 어느 단계든 `git revert` 1회로 복원 가능. DB 스키마 변경 0건.

## 교훈

- **"이름만 바꾸면 되는 deprecation 경고"의 배경에 아키텍처 변경이 숨어 있는 경우가 있다**. 공식 docs의 전환 근거(CVE, 보안 등)를 반드시 읽자.
- **CVE가 middleware 레벨 버그임을 인지하는 것이 핵심**: Route Handler의 `cookies()`/`request.cookies` 직접 읽기는 영향권 밖. 따라서 "Bearer 전용"으로 과도하게 좁힐 필요가 없었음(세션 18 D1-5 초판이 대시보드 30여 페이지를 파손한 원인).
- **라우트 그룹 `(protected)`는 "보호 의도"를 파일 시스템에 명시하는 가장 강력한 수단**. Layout 상속으로 신규 페이지도 자동 보호 — 휴먼 에러 방지.
- **discriminated union 반환 패턴**은 "auth 체크 누락"을 타입 시스템이 잡아낸다. `result.session` 접근 전 `result.response` 분기를 강제.
- **proxy.ts = 네트워크 경계, Layout/Handler = 프레임워크 경계**. 역할 분리가 CVE 방어의 구조적 핵심.

## 관련 파일

- `src/proxy.ts` — Next.js 16 proxy (네트워크 경계)
- `src/lib/auth-guard.ts` — Layout/Handler용 재검증 헬퍼
- `src/app/(protected)/layout.tsx` — 보호 라우트 그룹 Layout
- `src/app/(protected)/(admin)/layout.tsx` — ADMIN 전용 Layout
- `src/lib/auth.ts` — `getSessionFromCookies()` (재사용)
- `docs/handover/260412-session18-auth-refactor.md` — 세션 18 인수인계서
