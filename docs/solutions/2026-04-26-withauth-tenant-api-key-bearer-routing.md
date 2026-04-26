---
title: 외부 가드의 Bearer 라우팅 누락 — wrapper 안의 분기가 도달 불가능한 경우
date: 2026-04-26
session: 69
tags: [auth, multi-tenant, api-key, jwt, bearer, guard, defense-in-depth]
category: bug-fix
confidence: high
---

## 문제

`/api/v1/t/<tenant>/categories` 같은 명시 라우트를 신규 발급한 tenant API key (`srv_almanac_*`) 로 호출하면, 키가 정상임에도 401 INVALID_TOKEN 이 반환되었다.

```
withTenant(handler)
  └─ withAuth(inner)             ← Bearer 추출 + verifyAccessToken (JWT)
        └─ INVALID_TOKEN (401)   ← srv_* 는 JWT 가 아니므로 즉시 거부

# inner 의 API key 분기는 영원히 도달 못함:
inner = async (request, user, context) => {
  const bearer = extractBearerToken(request);
  if (bearer && isApiKeyToken(bearer)) {
    // ← 여기까지 오지 못함. withAuth 가 401 로 차단.
    return await verifyApiKeyForTenant(...)
  }
  ...
};
```

증상:
- `Authorization: Bearer srv_almanac_xxx` → 401 INVALID_TOKEN
- `Authorization: Bearer <invalid_jwt>` → 401 INVALID_TOKEN
- 같은 인증 메시지가 두 가지 다른 흐름에서 나옴 — 디버깅 시 혼동 유발

## 원인

ADR-027 §4.2 가 정의한 의도는:

```
Bearer 토큰 ─┬─ pub_/srv_ 시작 → tenant API key K3 검증 → tenant context 주입
            └─ 그 외             → JWT verifyAccessToken
```

그러나 구현은 `withTenant` 가 `withAuth` 를 wrap 하는 구조라 외부 가드(`withAuth`)가 **모든** Bearer 를 JWT 로만 시도. 안쪽의 분기는 외부에서 통과한 후에야 실행되므로, JWT 가 아닌 토큰 형태(API key) 가 도달할 수 없다.

이 결함은 ADR-027 작성 시점부터 존재했으나 다음 조건이 동시 성립할 때만 표면화:
1. `/api/v1/t/<tenant>/...` 명시 라우트 (catch-all 아님)
2. 실제 `pub_/srv_` 키로 인증 시도

세션 66 까지는 명시 라우트가 0~1 개 + 인증 없는 401 만 검증해서 1년 가까이 잠복. 본 세션이 4 endpoint 추가 + 첫 키 발급 + 실키 호출을 동시에 수행하면서 표면화.

## 해결

외부 가드(`withAuth`)에 **Bearer prefix 라우팅** 분기 + scope 가드를 추가한다 (`src/lib/api-guard.ts`).

```typescript
export function withAuth(handler: AuthenticatedHandler) {
  return async (request, context) => {
    const bearerToken = extractBearerToken(request);
    if (bearerToken) {
      // ① tenant API key prefix → withTenant K3 가 담당하므로 placeholder 통과
      if (
        bearerToken.startsWith("pub_") ||
        bearerToken.startsWith("srv_")
      ) {
        // ② scope 가드: tenant key 는 /api/v1/t/* 에서만 유효
        const url = new URL(request.url);
        if (!url.pathname.startsWith("/api/v1/t/")) {
          return errorResponse(
            "INVALID_TOKEN",
            "tenant API key 는 /api/v1/t/* 라우트에서만 유효합니다",
            401
          );
        }
        // ③ placeholder payload — K3 통과 후 audit 식별자만으로 사용
        const apiKeyPlaceholder: AccessTokenPayload = {
          sub: "apikey",
          email: bearerToken.slice(0, 20),  // prefix 식별자
          role: "USER" as Role,
          type: "access",
        };
        return runHandler(handler, request, apiKeyPlaceholder, context);
      }
      // ④ 그 외 Bearer → JWT 검증 (기존 동작 유지)
      const payload = await verifyAccessToken(bearerToken);
      if (payload) return runHandler(handler, request, payload, context);
      return errorResponse("INVALID_TOKEN", "유효하지 않은 토큰입니다", 401);
    }
    // ⑤ Cookie/JWT fallback (기존 동작 유지)
    const cookieUser = await resolveCookieSession();
    if (cookieUser) return runHandler(handler, request, cookieUser, context);
    return errorResponse("UNAUTHORIZED", "인증 토큰이 필요합니다", 401);
  };
}
```

**핵심 결정 4가지**:

1. **Placeholder payload 통과** — 외부 가드는 "토큰 형태가 우리가 아는 것 중 하나" 만 보장. 실 K3 검증(해시 + FK + slug 일치)은 이미 `withTenant` §3a 에 잘 작성되어 있으므로 재구현 금지. 책임 분리.
2. **Scope 가드** — `/api/v1/t/` 외부에서 tenant key 사용 시 즉시 401. `/api/v1/api-keys` 같은 글로벌 운영자 라우트가 tenant key 로 흉내 못함.
3. **placeholder.role = USER** — `withRole(["ADMIN"])` 가드가 자동으로 거부. 권한 상승 차단.
4. **placeholder.email = bearerToken.slice(0, 20)** — audit 로그 식별자 (`srv_almanac_4EJMXSLc7j` 형태). DB lookup 가능 prefix 정보 충분, 평문 random 32자 노출 안 함.

검증 매트릭스 (5+2 케이스):

| 케이스 | 결과 | 검증 항목 |
|---|---|---|
| 정상 키 + tenant 일치 라우트 | 200 | withAuth fix + K3 통과 |
| 정상 키 + cross-tenant 라우트 | 403 FORBIDDEN | K3 path slug ≠ key slug |
| 정상 키 + 글로벌 라우트 | 401 INVALID_TOKEN | scope 가드 |
| 위조 키 (random 추측) | 401 INVALID_HASH | bcrypt 검증 |
| 폐기 키 | 401 REVOKED | revokedAt 검증 |
| 잘못된 JWT | 401 INVALID_TOKEN | 기존 흐름 유지 |
| 인증 없음 | 401 UNAUTHORIZED | 기존 흐름 유지 |

## 교훈

1. **wrapper 안의 분기는 외부 가드의 흐름이 모든 형태를 통과시킨다는 가정에 의존한다.** 외부가 좁으면(JWT 만), 내부 분기(API key)는 dead code. 외부 가드 작성 시 "이 토큰이 우리가 아는 어떤 형태(JWT/API key/임시토큰)에 해당하는지" 를 prefix 로 1차 식별하고, 분류된 흐름으로 분기시켜야 한다.

2. **인프라 통합도가 임계점을 넘을 때만 보이는 결함이 있다.** ADR 작성과 구현이 분리되면 의도-구현 정합성 검증이 늦어진다. 본 결함은 "명시 라우트 + 실키 호출" 조합이 처음 등장한 세션에서야 표면화. 이런 류의 결함을 빠르게 발견하려면 ADR 의 시나리오 매트릭스(§8) 을 PR-단위로 통합 테스트 화하는 게 정공법.

3. **scope 가드는 placeholder 통과의 안전 역할을 한다.** 외부 가드에서 placeholder 로 통과시키더라도, URL pathname 으로 본 키가 유효한 라우트 영역을 명시 제한하면 권한 상승이 차단된다. multi-tenant 환경에서 키 노출 사고 시 피해 영역도 제한.

4. **Defense in depth — placeholder.role = USER**. tenant key 가 placeholder 로 통과되어 글로벌 ADMIN 라우트에 닿더라도, role 이 USER 라 `withRole(["ADMIN"])` 가 자동 거부. 1중(scope 가드) + 2중(role 가드) + 3중(K3) 으로 cross-realm 누설 방지.

## 관련 파일

- `src/lib/api-guard.ts` — withAuth fix 적용
- `src/lib/api-guard-tenant.ts` — withTenant K3 검증 흐름 (§3a)
- `src/lib/auth/keys-tenant.ts` — verifyApiKeyForTenant K3 본문
- `src/lib/auth/keys-tenant-issue.ts` — issueTenantApiKey (prefix 형식 정의)
- `scripts/issue-tenant-api-key.ts` — 운영 키 발급 임시 절차 (S69)
- `docs/research/baas-foundation/01-adrs/ADR-027-multi-tenant-router.md` §4.2, §5.1, §8
- `docs/handover/260426-session69-aggregator-day2.md` — 본 결함 발견·수정 세션 인수인계
