---
title: /api/settings/* 엔드포인트는 Referer/Origin 헤더 필수 — /api/v1/*와 다른 CSRF 정책
date: 2026-04-18
session: 24-γ
tags: [csrf, security, curl, e2e, api-policy, phase-14c]
category: pattern
confidence: high
---

## 컨텍스트

세션 24-γ Phase 14c-γ(VIEWER 계정 + 권한 매트릭스 E2E)를 위해 curl로 테스트 계정 seed 작업 시도. ADMIN 쿠키로 `POST /api/settings/users`를 호출해 MANAGER/USER 계정을 생성하려 했음.

기존 `2026-04-17-curl-e2e-recipe-dashboard.md` 레시피는 `/api/v1/*`(Bearer 면제) + `/api/auth/login-v2`(Referer 필요)에 대해서만 다뤘고, `/api/settings/*`은 누락.

## 증상

ADMIN으로 정상 로그인한 쿠키를 사용해도 `/api/settings/users` POST가 403:

```bash
curl -s -b "$ADMIN_COOKIE" -X POST "$DASH_BASE/api/settings/users" \
  -H 'Content-Type: application/json' \
  -d '{"email":"gamma-manager@test.local","password":"GammaTest123!","role":"MANAGER"}' \
  -w "\n__HTTP__%{http_code}"
# → HTTP 403
# → {"error":"CSRF 차단"}
# → __HTTP__403
```

쿠키는 정상(`/api/auth/me`로 검증 OK), payload도 정상. 차이는 단 하나 — `/api/v1/*`가 아닌 `/api/settings/*` 경로.

## 진단

`src/proxy.ts` L78-117 검토:

```typescript
// 3. CORS/CSRF + 상태변경 감사 로그 (대시보드 API만, v1 제외 — v1은 Bearer 기반)
if (pathname.startsWith("/api/") && !pathname.startsWith("/api/v1/")) {
  // CORS 검증
  if (origin && !origin.includes(host ?? "")) { /* allowlist 체크 */ }

  // CSRF 검증 (POST만)
  if (request.method === "POST") {
    const referer = request.headers.get("referer") || origin || "";
    const isValid =
      referer.includes("stylelucky4u.com") ||
      referer.includes("localhost:3000");
    if (!isValid) {
      writeAuditLog({ /* ..., action: "CSRF_BLOCKED" */ });
      return NextResponse.json({ error: "CSRF 차단" }, { status: 403 });
    }
  }
}
```

조건은 명확: **`/api/`로 시작하고 `/api/v1/`이 아니면 CSRF 검증 적용**. `/api/settings/*`, `/api/auth/*`, `/api/audit`, `/api/filebox/*` 등 모두 해당.

## 근본 원인

프로젝트 CSRF 정책은 **경로 prefix별 차등**:

| 경로 | 인증 모델 | CSRF | 필요 헤더 (curl) |
|------|----------|------|----------------|
| `/api/v1/*` | Bearer accessToken | 면제 (Bearer는 자동 전송 안 됨 → CSRF 자체가 불가능) | Authorization 또는 쿠키 |
| `/api/auth/login-v2` | (쿠키 발급) | 적용 | `Referer`, `Origin` |
| `/api/auth/*` (그 외) | 쿠키 세션 | 적용 | `Referer`, `Origin` |
| `/api/settings/*` | 쿠키 세션 | 적용 | `Referer`, `Origin` |
| `/api/audit` | 쿠키 세션 (GET) | 적용 (POST 시) | GET은 무관 |
| `/api/filebox/*` | 쿠키 세션 | 적용 | `Referer`, `Origin` |

브라우저는 자동으로 Referer/Origin을 붙이므로 UI 호출은 무관. **curl/스크립트만 명시적으로 헤더를 추가**해야 함.

## 해결

세션 24-γ E2E 스크립트에 헤더 추가:

```bash
seed_user() {
  local EMAIL="$1"; local PASS="$2"; local ROLE="$3"
  local RES=$(curl -s -b "$ADMIN_COOKIE" -X POST "$DASH_BASE/api/settings/users" \
    -H 'Content-Type: application/json' \
    -H "Referer: $DASH_BASE" -H "Origin: $DASH_BASE" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"role\":\"$ROLE\"}" \
    -w "\n__HTTP__%{http_code}")
  ...
}
```

PATCH (재활성화/역할 변경)도 동일:

```bash
curl -s -b "$ADMIN_COOKIE" -X PATCH "$DASH_BASE/api/settings/users" \
  -H 'Content-Type: application/json' \
  -H "Referer: $DASH_BASE" -H "Origin: $DASH_BASE" \
  -d "{\"userId\":\"$USER_ID\",\"role\":\"$ROLE\",\"isActive\":true}" -o /dev/null
```

세션 24-γ E2E 결과: G1~G11c 시나리오 정상 진행. seed/cleanup 모두 통과.

## 검증

`/api/settings/users` POST 호출 시:
- Referer/Origin 없음 → 403 CSRF_BLOCKED
- Referer만 있음 (`http://localhost:3000`) → 200/201/409 (정상 처리)
- Referer + Origin 둘 다 → 200/201/409 (정상 처리)

`proxy.ts`는 `referer || origin` 둘 중 하나만 매치하면 통과 (위 코드의 `||` 참조). 안전하게 둘 다 보내는 것을 권장.

## 재발 방지

### curl E2E 경로별 CSRF 헤더 매트릭스

새 E2E 스크립트 작성 시 호출 경로에 따른 헤더를 다음 표로 결정:

```bash
# ── /api/v1/* (CSRF 면제 — 쿠키만으로 충분) ───────────────────
curl -b "$COOKIE" -X POST "$BASE/api/v1/tables/folders" \
  -H 'Content-Type: application/json' \
  -d '...'
# 또는 Authorization Bearer 사용

# ── /api/auth/login-v2 (CSRF 대상 — 쿠키 발급 경로) ───────────
curl -c "$COOKIE" -X POST "$BASE/api/auth/login-v2" \
  -H 'Content-Type: application/json' \
  -H "Referer: $BASE" -H "Origin: $BASE" \
  -d '...'

# ── /api/settings/* (CSRF 대상) ─────────────────────────────
curl -b "$COOKIE" -X POST "$BASE/api/settings/users" \
  -H 'Content-Type: application/json' \
  -H "Referer: $BASE" -H "Origin: $BASE" \
  -d '...'

# ── /api/filebox/* (CSRF 대상) ──────────────────────────────
curl -b "$COOKIE" -X POST "$BASE/api/filebox/upload" \
  -H "Referer: $BASE" -H "Origin: $BASE" \
  -F 'file=@./local.txt'

# ── GET (HTTP 메서드 자체로 CSRF 무관) ────────────────────────
curl -b "$COOKIE" "$BASE/api/audit?limit=20"
# Referer 불필요
```

### 체크리스트 (curl 스크립트 작성 시)

1. POST/PATCH/DELETE인가? → 그렇다면 CSRF 검증 대상 가능성 높음
2. 경로가 `/api/v1/*`인가? → 면제 (쿠키 또는 Bearer)
3. 그 외 `/api/*` POST/PATCH/DELETE → **항상 `-H "Referer: $BASE" -H "Origin: $BASE"` 추가**
4. 403에 `{"error":"CSRF 차단"}`이 보이면 즉시 헤더 누락 의심

### 정책 변경 시 단일 진실 소스

CSRF 정책의 진실 소스는 `src/proxy.ts` L78-117. 정책 변경 시:
1. proxy.ts 수정
2. 본 솔루션 매트릭스 갱신
3. `2026-04-17-curl-e2e-recipe-dashboard.md`에 cross-link 갱신

## 교훈

1. **단일 보안 정책 안에 경로별 차등이 있는 시스템은 cheatsheet가 필수**. "전체 정책"만 기억하면 해당 안 되는 사례를 놓친다 — 각 prefix별 매트릭스를 코드 옆에 배치.
2. **Bearer 토큰과 쿠키 세션의 CSRF 위험도가 다르다는 사실을 의식적으로 분리**. Bearer는 헤더로 명시 전송 → 자동 전송이 없어 CSRF 자체가 성립 안 함. 쿠키는 자동 전송 → CSRF 가드 필수.
3. **403 응답의 메시지를 정확히 읽기**. "CSRF 차단" / "OPERATION_DENIED" / "FORBIDDEN" / "권한 부족"은 모두 다른 원인. "CSRF 차단"이 보이면 인증 문제가 아니라 헤더 문제.

## 관련 파일

- `src/proxy.ts` (L78-117: CSRF/CORS 판정 로직 — 단일 진실 소스)
- `scripts/e2e/phase-14c-gamma-curl.sh` (L48-66, 175-180: settings POST/PATCH 헤더 사용 사례)
- `src/app/api/settings/users/route.ts` (대상 엔드포인트)
- `src/app/api/auth/login-v2/route.ts` (CSRF 적용 첫 사례)

## 관련 솔루션

- [`2026-04-17-curl-e2e-recipe-dashboard.md`](./2026-04-17-curl-e2e-recipe-dashboard.md) — 로그인/쿠키/v1 호출 기본 레시피 (본 문서의 모체 — 매트릭스 확장)
- [`2026-04-17-information-schema-role-filtering-pk-regression.md`](./2026-04-17-information-schema-role-filtering-pk-regression.md) — 역할 기반 권한 사례 (γ 권한 매트릭스 E2E와 직접 연관)
