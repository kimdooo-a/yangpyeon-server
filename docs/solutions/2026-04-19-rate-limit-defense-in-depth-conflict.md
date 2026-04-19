---
title: "Rate Limit defense-in-depth 레이어 충돌 — single source of truth per route 패턴"
date: 2026-04-19
session: 34
tags: [rate-limit, middleware, proxy, single-source-of-truth, debugging]
category: pattern
confidence: high
---

## 문제

DB-backed rate limit (handler 레벨, max=10/min)을 적용했음에도 불구하고, **6번째 요청부터 429 차단**되는 현상. 즉 max=5처럼 동작.

**증상**:
```
req 1 → HTTP 401  # invalid credentials, rate limit 통과
req 2 → HTTP 401
req 3 → HTTP 401
req 4 → HTTP 401
req 5 → HTTP 401
req 6 → HTTP 429  # 차단! (max=10인데 5+1에서?)
req 7~12 → HTTP 429
```

**DB 카운터 직접 조회**:
```sql
SELECT bucket_key, hits FROM rate_limit_buckets WHERE bucket_key LIKE '%test%';
-- v1Login:email:ratelimit-test@example.com | 5  ← 5만 기록됨
-- v1Login:ip:::1                            | 5
```

DB는 5만 기록. 즉 **6~12번째 요청은 handler 도달 전에 다른 곳에서 429**가 반환된 것.

## 원인

`src/proxy.ts` (Next.js 16 middleware)가 인메모리 슬라이딩 윈도우 rate limit을 적용 중:

```typescript
// src/proxy.ts (수정 전)
function getRateLimitConfig(pathname: string, method: string) {
  if (pathname === "/api/v1/auth/login") return RATE_LIMITS.v1Login;  // 5/min
  // ...
}

// proxy 흐름
export async function proxy(request: NextRequest) {
  // 2. Rate Limit ← 여기서 5/min 인메모리로 차단
  const result = checkRateLimit(`${ip}:${pathname}`, 5, 60_000);
  if (!result.allowed) return NextResponse.json({ error: ... }, { status: 429 });
  // ...
}
```

본래 의도: **defense-in-depth** — 미들웨어 레이어에서 광역 보호 + 핸들러 레이어에서 정밀 제어.

문제: 두 layer가 **같은 정책을 다른 store(인메모리 vs DB)로 시행**하면 더 빡빡한 쪽이 보이는 동작 결정. 인메모리 layer(max=5)가 DB layer(max=10)를 가린다. 디버깅 시 "DB 카운터는 5인데 왜 6에서 차단?"로 혼란.

## 해결

**원칙**: **single source of truth per route**. 한 라우트의 rate limit 정책은 한 layer에서만 시행한다.

`src/proxy.ts`에 명시적 양도 Set을 추가:

```typescript
// src/proxy.ts (수정 후)
// Step 6 (2026-04-19): DB-backed rate limit으로 양도된 경로.
// 라우트 핸들러가 src/lib/rate-limit-guard.applyRateLimit() 으로 정밀 제한 (IP+email/user 분리).
// proxy 레이어 in-memory 와 중복 적용 시 둘 중 더 빡빡한 쪽이 먼저 차단되어 디버깅 혼란 → 단일 책임으로 양도.
const HANDLER_OWNED_RATE_LIMIT_PATHS = new Set([
  "/api/v1/auth/login",
  "/api/v1/auth/mfa/challenge",
  "/api/v1/auth/mfa/webauthn/assert-verify",
]);

function getRateLimitConfig(pathname: string, method: string) {
  if (HANDLER_OWNED_RATE_LIMIT_PATHS.has(pathname)) return null;  // ← handler가 처리
  if (pathname === "/api/auth/login") return RATE_LIMITS.login;
  // ...
}
```

기타 경로(/api/v1/api-keys 등)는 여전히 proxy의 인메모리 광역 보호를 받음 — 그쪽은 fine-grained 제어가 필요 없으니 OK.

### 검증
- Before: req 6 → 429 (proxy 차단, DB hits=5)
- After: req 1~10 → 401, req 11~12 → 429 (handler 차단, DB hits=11), `Retry-After: 60` 정확

## 교훈

### 패턴: defense-in-depth는 좋지만, **다른 정책**이어야 한다

좋은 defense-in-depth:
- L1 (proxy): 광역 IP rate limit (예: 1000 req/min IP) — DDoS 방어
- L2 (handler): 라우트별 정밀 제어 (예: login 10/min IP+email) — 비즈니스 로직

나쁜 defense-in-depth (이 사례):
- L1: login 5/min IP (인메모리)
- L2: login 10/min IP+email (DB)
- → 두 정책이 같은 dimension(login IP)을 다른 임계로 제어 → 더 빡빡한 쪽이 차단 결정

### 단일 책임 원칙

한 라우트의 rate limit 정책은 명시적으로 한 곳에서. 위반 시:
- 디버깅 어려움 (어느 layer가 차단했는지 불명확)
- 변경 누락 위험 (한 쪽만 수정하면 의도와 다른 동작)
- 테스트 복잡도 증가 (모킹 대상 ambiguity)

### 운영적 시그널

다음 패턴이 보이면 layer 충돌 의심:
1. **DB 카운터 < HTTP 응답 카운터** — handler 도달 전 차단 의심
2. **maxRequests보다 적은 요청 수에 차단** — 더 빡빡한 layer 의심
3. **카운터 리셋해도 여전히 빨리 차단** — 다른 layer의 별도 store 의심 (인메모리는 PG 카운터 리셋과 무관)

## 일반화

본 패턴은 rate limit뿐 아니라 모든 cross-cutting concern에 적용:
- **Auth 검증**: middleware + handler 둘 다 검증하면 디버깅 시 어느 단계 실패인지 불명확. 미들웨어는 통과 boolean만, handler는 RBAC 정밀 처리.
- **CORS**: middleware에서 강제, handler는 가정만.
- **CSRF**: middleware에서 시행, handler는 안전 가정.
- **Audit log**: 한 액션은 한 layer에서만 기록 (양쪽 기록 시 중복 + 실패 시 양쪽 누락 가능).

## 관련 파일

- `src/proxy.ts` — `HANDLER_OWNED_RATE_LIMIT_PATHS` Set + `getRateLimitConfig` 가드
- `src/lib/rate-limit-guard.ts` — handler 측 `applyRateLimit` (IP + identifier 두 차원)
- `src/lib/rate-limit.ts` — 인메모리 슬라이딩 윈도우 (proxy 잔여 경로용)
- `src/lib/rate-limit-db.ts` — DB-backed fixed-window (handler 양도 경로용)

## 관련 솔루션

- `2026-04-19-pg-timestamp-naive-js-date-tz-offset.md` (같은 디버깅 세션의 두 번째 발견)
