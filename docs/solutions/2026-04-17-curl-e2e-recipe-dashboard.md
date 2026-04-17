---
title: 대시보드 curl E2E 레시피 (로그인 + CSRF + /tmp 휘발 회피)
date: 2026-04-17
session: 23
tags: [e2e, curl, csrf, wsl2, authentication, testing]
category: pattern
confidence: high
---

## 문제

대시보드 프로덕션(WSL2 PM2)에 curl 기반 E2E를 수행하려 할 때 세 가지 걸림돌:

1. **`/api/auth/login-v2`는 CSRF 적용 대상** — Session 22 journal에서 "v1은 Bearer 기반 CSRF 면제"라 기록했지만, 로그인 쿠키 발급 경로(`/api/auth/login-v2`)는 `/api/v1/*`가 아니므로 proxy.ts L101-116의 Referer 검증이 작동 → Referer 없이 curl하면 403 `CSRF_BLOCKED`.
2. **WSL auto-shutdown이 `/tmp`를 휘발** — 기본 설정의 WSL2는 idle 후 인스턴스를 shut down. `wsl -e bash -c "..."`를 여러 번 호출하면 사이사이 인스턴스가 종료/재시작되며 `/tmp/dash-cookie.txt` 같은 쿠키 파일이 사라진다.
3. **`/api/auth/me` 응답 형식 비표준** — `{success, data: {...}}` 래핑 없이 `{success, user: {sub, email, role}}` 직결. 사용자 ID는 `sub`(JWT 표준 claim 이름).

## 해결

**패턴: 단일 `wsl -e bash` 스크립트로 전 E2E 수행 + Referer/Origin 헤더 추가**

### 로그인 스텁 (핵심 형식)

```bash
#!/bin/bash
DASH_EMAIL='user@example.com'
DASH_PASS='<password>'
DASH_BASE='http://localhost:3000'
COOKIE=/tmp/dash-cookie.txt

# v1 로그인 (CSRF 면제) — Bearer accessToken 발급
ACCESS_TOKEN=$(curl -s -X POST "$DASH_BASE/api/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$DASH_EMAIL\",\"password\":\"$DASH_PASS\"}" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["data"]["accessToken"])')

# login-v2 (CSRF 대상 — Referer/Origin 필수)
curl -s -c "$COOKIE" -X POST "$DASH_BASE/api/auth/login-v2" \
  -H 'Content-Type: application/json' \
  -H "Referer: $DASH_BASE" \
  -H "Origin: $DASH_BASE" \
  -d "{\"accessToken\":\"$ACCESS_TOKEN\"}" -o /dev/null

# /me로 쿠키 검증 + sub 추출
OWNER_ID=$(curl -s -b "$COOKIE" "$DASH_BASE/api/auth/me" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["user"]["sub"])')
```

### /api/v1/* 호출 (CSRF 면제 → 쿠키만)

```bash
# POST folders — updated_at 생략 페이로드
curl -s -b "$COOKIE" -X POST "$DASH_BASE/api/v1/tables/folders" \
  -H 'Content-Type: application/json' \
  -d '{"values":{"id":{"action":"set","value":"<uuid>"},"name":{"action":"set","value":"x"},"owner_id":{"action":"set","value":"'$OWNER_ID'"},"is_root":{"action":"set","value":false}}}' \
  -w "\n__HTTP__%{http_code}"
```

### 감사 로그 조회 — `/api/audit` (v1 아님)

```bash
curl -s -b "$COOKIE" "$DASH_BASE/api/audit?limit=20" \
  | python3 -c "
import json, sys
d = json.load(sys.stdin)
logs = d['logs']
tr = [l for l in logs if l.get('action','').startswith('TABLE_ROW_')]
for l in tr[:5]: print(l['action'], l['timestamp'])"
```

응답 shape: `{logs: [...], pagination: {...}}` — `/api/v1/*` 관례(`{success, data}`)와 다름을 주의.

### 실행 방법 — 단일 wsl 호출

```bash
wsl -e bash -c "bash /mnt/c/Users/<user>/AppData/Local/Temp/e2e-full.sh"
```

스크립트 파일은 Windows 측에 배치하되, WSL이 `/mnt/c`를 통해 접근. 단일 `wsl -e bash` 호출 내부에서 스크립트가 전 시나리오를 실행해 WSL 인스턴스가 살아있는 동안 `/tmp` 상태 유지.

### `set -e` 주의

Bash `set -e`는 첫 실패에서 스크립트 종료. E2E는 중간 실패가 있어도 나머지 시나리오 평가가 필요하므로 `set -e`를 **쓰지 않고** 각 curl 결과를 `grep -oP '__HTTP__\K\d+'` + `if`로 판정하는 패턴이 낫다.

## 교훈

1. **CSRF 경로는 라우트 prefix로 결정 — `/api/v1/*`와 `/api/auth/*`는 다른 정책 영역**. 로그인 엔드포인트 한 개가 CSRF 적용되는 것만으로 전체 경로가 면제된다고 추정하면 안 된다. `src/proxy.ts`를 1차 진실 소스로 참조.
2. **응답 envelope 형식은 API별로 다를 수 있음**. `/api/v1/*`는 `{success, data, error}` 일관 적용이지만 `/api/auth/me`, `/api/audit` 등 레거시/dashboard 전용은 플랫 shape. 실제 응답을 먼저 관찰한 후 파싱.
3. **WSL 인스턴스 라이프사이클을 의식적으로 관리**. `/tmp` 파일을 생성하는 curl 파이프라인은 단일 호출 내부에서 끝내야 안전. `wsl --shutdown`은 모든 WSL 인스턴스를 즉시 종료한다.
4. **`jq` 미설치 환경에서 `python3 -c`로 대체 가능**. 단, heredoc(`<< 'EOF'`)와 pipe는 상호 배타적 — heredoc이 stdin을 점유하면 pipe가 무시된다.

## 관련 파일

- `src/proxy.ts` (L78-117: CSRF/CORS 판정 로직)
- `src/app/api/auth/me/route.ts` (응답 shape)
- `src/app/api/audit/route.ts` (감사 로그 엔드포인트, `/api/v1/` 아님)
- `src/app/api/v1/auth/login/route.ts` (Bearer accessToken 발급)
- `src/app/api/auth/login-v2/route.ts` (쿠키 세션 발급, CSRF 적용 대상)
