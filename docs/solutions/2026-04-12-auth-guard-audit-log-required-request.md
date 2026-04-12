---
title: auth-guard API에 감사 로그 자동 기록 — request 필수화 패턴
date: 2026-04-12
session: 19
tags: [audit-log, auth-guard, security, nextjs, typescript, api-design]
category: pattern
confidence: high
---

## 문제

세션 18에서 CVE-2025-29927 구조적 방어를 위해 `requireSessionApi` / `requireRoleApi`를 Route Handler 레벨에 배치했지만, **auth 실패(401/403)에 대한 감사 로그가 남지 않는 문제**가 있었다. `/audit` 페이지에서 "비로그인 사용자의 설정 API 접근 시도" 같은 침투 시그널을 관측할 수 없음.

단순히 호출 지점마다 `writeAuditLog` 수동 호출을 요구하면 **신규 라우트가 추가될 때마다 감사 로그 누락**이 발생하기 쉽다.

## 원인

기존 API는 parameterless였다:
```ts
export async function requireSessionApi(): Promise<AuthApiResult>
export async function requireRoleApi(role: Role | Role[]): Promise<AuthApiResult>
```

감사 로그 기록에 필요한 정보(method / path / IP)는 `NextRequest`에 있는데, 함수 시그니처가 이를 받지 않아 **가드 함수 내부에서 감사 로그를 쓸 수 없다**. 결과적으로 각 호출 지점이 수동으로 감사 로그를 남겨야 하는데, 이는 누락되기 쉽다.

## 해결

**`request: NextRequest`를 첫 번째 필수 파라미터로 도입**해 타입 시스템에서 감사 로그 누락을 원천 차단:

```ts
// src/lib/auth-guard.ts
import { NextResponse, type NextRequest } from "next/server";
import { writeAuditLog, extractClientIp } from "@/lib/audit-log";

export async function requireSessionApi(
  request: NextRequest,
): Promise<AuthApiResult> {
  const session = await getSessionFromCookies();
  if (!session) {
    writeAuditLog({
      timestamp: new Date().toISOString(),
      method: request.method,
      path: request.nextUrl.pathname,
      ip: extractClientIp(request.headers),
      status: 401,
      action: "AUTH_FAILED",
      detail: "세션 없음 또는 만료",
    });
    return {
      response: NextResponse.json({ error: "인증 필요" }, { status: 401 }),
    };
  }
  return { session };
}

export async function requireRoleApi(
  request: NextRequest,
  role: Role | Role[],
): Promise<AuthApiResult> {
  const result = await requireSessionApi(request);
  if (result.response) return result;
  const allowed = Array.isArray(role) ? role : [role];
  if (!allowed.includes(result.session.role as Role)) {
    writeAuditLog({
      timestamp: new Date().toISOString(),
      method: request.method,
      path: request.nextUrl.pathname,
      ip: extractClientIp(request.headers),
      status: 403,
      action: "FORBIDDEN",
      detail: `${result.session.email} role=${result.session.role} required=${allowed.join("|")}`,
    });
    return {
      response: NextResponse.json({ error: "권한 부족" }, { status: 403 }),
    };
  }
  return { session: result.session };
}
```

**호출 지점**은 기존 `export async function GET()` 패턴을 `export async function GET(request: NextRequest)`로 통일:

```ts
// Before
export async function GET() {
  const auth = await requireRoleApi("ADMIN");
  ...
}

// After
export async function GET(request: NextRequest) {
  const auth = await requireRoleApi(request, "ADMIN");
  ...
}
```

Next.js App Router는 빈 파라미터 핸들러도 `request: NextRequest` 첫 파라미터를 받도록 허용하므로 **비파괴적**(런타임 동작 동일).

## 교훈

- **Optional 대신 Required**: "감사 로그 기록" 같은 횡단 관심사는 옵셔널로 두면 쉽게 누락된다. 필수 파라미터로 강제하면 컴파일러가 누락을 잡아낸다.
- **일괄 수정의 가치**: 14 호출처를 동시에 업데이트하는 비용은 1회성. 이후 신규 라우트 추가 시 IDE 자동완성이 `request` 파라미터를 요구 → 자동으로 감사 로그 포함.
- **감사 로그는 정책이 아닌 아키텍처**: 개발자가 "이 라우트는 감사 로그 필요한가?" 판단하게 만들면 실패한다. 타입 레벨에서 "인증 가드 통과 = 감사 로그 기록됨" 불변식을 보장.
- **AUTH_FAILED vs FORBIDDEN 분리**: 세션 부재(미로그인/만료)와 권한 부족(로그인 후 권한 위반)은 보안 맥락이 다르다. 전자는 크리덴셜 브루트포스, 후자는 내부 권한 오설정 또는 권한 승격 시도.

## 관련 파일

- `src/lib/auth-guard.ts` — 핵심 가드 함수
- `src/lib/audit-log.ts` — writeAuditLog + extractClientIp
- 호출 지점: `src/app/api/settings/*`, `src/app/api/pm2/*`
- `/audit` 페이지에서 `action=AUTH_FAILED` / `action=FORBIDDEN` 필터로 시그널 관측
