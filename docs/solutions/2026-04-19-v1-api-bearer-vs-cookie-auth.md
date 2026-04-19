---
title: /api/v1/auth/* 는 Bearer 전용 — 쿠키 인증 불가
date: 2026-04-19
session: 48
tags: [auth, api, v1, bearer, cookie, regression-guard, verify-script]
category: bug-fix
confidence: high
---

## 문제

`phase16-vault-verify.sh` 2단계 실행 결과:

```
--- 1) 로그인 ---
{"test":"login","pass":true}
--- 2) MFA status 조회 ---
{"test":"mfa_status","pass":false,"response":{"success":false,"error":{"code":"UNAUTHORIZED","message":"인증 토큰이 필요합니다"}}}
```

로그인은 성공했는데 **직후 GET `/api/v1/auth/mfa/status` 호출이 UNAUTHORIZED**. 쿠키 파일(`-c $JAR`)로 login 응답의 Set-Cookie 를 저장하고, 다음 호출에 `-b $JAR` 로 동일 쿠키를 보냈음에도 인증 실패.

## 원인

이 프로젝트는 **두 개의 독립 auth 경로**를 운영한다:

| 경로 | 용도 | 인증 방식 | 토큰 출처 |
|------|------|----------|----------|
| `/login` 웹 페이지, dashboard 대시보드 | Next.js App Router 페이지 | httpOnly 쿠키 `dashboard_session` (JWT, ES256/JWKS) | proxy + (protected) layout 재검증 |
| `/api/v1/auth/*` (v1 API) | 외부 API 클라이언트 (curl, 모바일 등) | **`Authorization: Bearer <accessToken>` 헤더** | login 응답의 `data.accessToken` (HS256) |

login 엔드포인트는 양쪽 소비자 모두를 위해 **쿠키 + accessToken** 을 동시에 반환하지만, `/api/v1/auth/*` 의 `withAuth` 가드는 **Bearer 헤더만 확인** 한다. 세션 36 `jwt-v1.ts` 설계 이후 이 이원성이 고착.

쿠키만 보내면 v1 API 는 "토큰 없음" 으로 판단 → UNAUTHORIZED. 쿠키는 대시보드 페이지 가드 전용이며 v1 API 에서 참조되지 않는다.

## 해결

verify 스크립트를 **Bearer 방식** 으로 재작성:

```bash
LOGIN=$(curl -s -X POST "$BASE/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")

TOKEN=$(echo "$LOGIN" | node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(j.data && j.data.accessToken || '')")

STATUS=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/auth/mfa/status")
```

성공 조건도 실제 응답 shape 로 강화:

```bash
# Before (막연한 grep)
echo "$STATUS" | grep -q '"enabled"'

# After (응답 구조 명시 검증)
node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(j.success===true && !!j.data && typeof j.data.totp === 'object')"
```

## 교훈

- **v1 API 스모크 스크립트는 Bearer 헤더만 사용** — 쿠키 기반 스크립트는 dashboard HTML 페이지 (307 리다이렉트) 용도로 한정.
- **회귀 가드 스크립트 자체도 "첫 작성 직후 dry-run" 필수**. 테스트가 없는 쉘 스크립트는 실제 prod 호출 전까지 버그 자각 못함. S48 에서 이 스크립트는 tsc / vitest 대상이 아니었기에 배포 후에야 드러났다.
- 유사 리스크: `/ypserver` 스킬의 헬스체크는 `/` 에 대한 HTTP 307(로그인 리다이렉트)을 성공으로 판정 — 이것도 대시보드 페이지 전제. API 계층의 E2E 스모크는 별도 Bearer 시나리오 필요.
- **회귀 가드 스크립트 리뷰 체크리스트**:
  1. 대상 URL path 가 `/api/*` 인가 `/` / `/login` 같은 페이지인가?
  2. `/api/*` 이면 Bearer 필요, `/*` 페이지면 쿠키 가능
  3. 성공 판정이 응답 "shape" 기반인가, 막연한 문자열 grep 인가?
  4. 실패 시 response body 를 로그에 포함하는가? (디버깅 위해 필수)

## 관련 파일

- `scripts/phase16-vault-verify.sh` (S48 Task 48-6, 버그 픽스 `effaf52`)
- 참고 패턴: `scripts/session44-verify.sh` (v1 login → Bearer 추출 패턴 이미 확립)
- `src/lib/api-guard.ts` — v1 API `withAuth` 가드 (Bearer 전용)
- `src/lib/auth-guard.ts` / proxy.ts — 대시보드 페이지 가드 (쿠키 기반)

## 관련 CK

- `docs/solutions/2026-04-19-session-revoke-user-intent-vs-defense.md` (S37) — 쿠키/토큰 이중 인증 체계의 revoke 의도 구분 패턴 (연관 설계 원칙)

## 관련 세션

- 세션 36: jwt-v1.ts + /api/v1/auth/login 도입 (이중 auth 경로 탄생)
- 세션 48 (본): phase16-vault-verify.sh 배포 후 UNAUTHORIZED 발견 → Bearer 픽스
