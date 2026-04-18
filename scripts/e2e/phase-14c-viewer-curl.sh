#!/bin/bash
# Phase 14c-VIEWER 회귀 검증 — USER × SELECT 매트릭스
# γ에서 USER GET이 403이었으나 VIEWER 확장 후 일반 테이블 200, 민감 테이블 403 확인
# 실행: wsl -e bash -c "bash /mnt/e/00_develop/260406_luckystyle4u_server/scripts/e2e/phase-14c-viewer-curl.sh"

set +e

DASH_BASE='http://localhost:3000'
ADMIN_EMAIL='kimdooo@stylelucky4u.com'
ADMIN_PASS='Knp13579!yan'
USER_EMAIL='gamma-user@test.local'
USER_PASS='GammaTest123!'

ADMIN_COOKIE=/tmp/dash-cookie-viewer-admin.txt
USER_COOKIE=/tmp/dash-cookie-viewer-user.txt
rm -f "$ADMIN_COOKIE" "$USER_COOKIE"

echo "===== Phase 14c-VIEWER 회귀 검증 ====="
echo

login_cookie() {
  local EMAIL="$1"; local PASS="$2"; local COOKIE="$3"
  local TOKEN=$(curl -s -X POST "$DASH_BASE/api/v1/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" \
    | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("data",{}).get("accessToken","") if d.get("success") else "")')
  if [ -z "$TOKEN" ]; then return 1; fi
  curl -s -c "$COOKIE" -X POST "$DASH_BASE/api/auth/login-v2" \
    -H 'Content-Type: application/json' \
    -H "Referer: $DASH_BASE" -H "Origin: $DASH_BASE" \
    -d "{\"accessToken\":\"$TOKEN\"}" -o /dev/null
  return 0
}

# ADMIN 로그인 + 테스트 USER 재활성화
if ! login_cookie "$ADMIN_EMAIL" "$ADMIN_PASS" "$ADMIN_COOKIE"; then
  echo "FAIL: ADMIN 로그인"; exit 1
fi
echo "OK: ADMIN 로그인"

# 기존 gamma-user 재활성화 (γ 스크립트가 비활성화했으므로)
USR_ID=$(curl -s -b "$ADMIN_COOKIE" "$DASH_BASE/api/settings/users" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(next((u['id'] for u in d.get('data',[]) if u['email']=='$USER_EMAIL'), ''))")
if [ -z "$USR_ID" ]; then
  # 없으면 신규 생성
  curl -s -b "$ADMIN_COOKIE" -X POST "$DASH_BASE/api/settings/users" \
    -H 'Content-Type: application/json' \
    -H "Referer: $DASH_BASE" -H "Origin: $DASH_BASE" \
    -d "{\"email\":\"$USER_EMAIL\",\"password\":\"$USER_PASS\",\"role\":\"USER\"}" -o /dev/null
  echo "SEED: USER 신규 생성 $USER_EMAIL"
else
  curl -s -b "$ADMIN_COOKIE" -X PATCH "$DASH_BASE/api/settings/users" \
    -H 'Content-Type: application/json' \
    -H "Referer: $DASH_BASE" -H "Origin: $DASH_BASE" \
    -d "{\"userId\":\"$USR_ID\",\"role\":\"USER\",\"isActive\":true}" -o /dev/null
  echo "SEED: USER 재활성화 $USER_EMAIL"
fi

if ! login_cookie "$USER_EMAIL" "$USER_PASS" "$USER_COOKIE"; then
  echo "FAIL: USER 로그인 — 비밀번호 불일치 가능. 스크립트 종료."; exit 1
fi
echo "OK: USER 로그인"
echo

check() {
  local NAME="$1"; local EXPECTED_CODE="$2"; local RES="$3"
  local CODE=$(echo "$RES" | grep -oP '__HTTP__\K\d+')
  if [ "$CODE" = "$EXPECTED_CODE" ]; then
    echo "PASS $NAME → $CODE"
  else
    echo "FAIL $NAME → expected $EXPECTED_CODE, got $CODE ($(echo "$RES" | grep -oP '"code":"[^"]*"' | head -1))"
  fi
}

# --- VIEWER 매트릭스 ---
echo "---- USER × SELECT 매트릭스 ----"

# V1: 일반 테이블 (folders) → 200
check "V1 USER GET /tables/folders" 200 \
  "$(curl -s -b "$USER_COOKIE" "$DASH_BASE/api/v1/tables/folders?limit=5" -w "\n__HTTP__%{http_code}")"

# V2: 일반 테이블 (files) → 200
check "V2 USER GET /tables/files" 200 \
  "$(curl -s -b "$USER_COOKIE" "$DASH_BASE/api/v1/tables/files?limit=5" -w "\n__HTTP__%{http_code}")"

# V3: 일반 테이블 (sql_queries) → 200
check "V3 USER GET /tables/sql_queries" 200 \
  "$(curl -s -b "$USER_COOKIE" "$DASH_BASE/api/v1/tables/sql_queries?limit=5" -w "\n__HTTP__%{http_code}")"

# V4~V6: 민감 테이블 FULL_BLOCK → 403
check "V4 USER GET /tables/users (민감)" 403 \
  "$(curl -s -b "$USER_COOKIE" "$DASH_BASE/api/v1/tables/users?limit=5" -w "\n__HTTP__%{http_code}")"
check "V5 USER GET /tables/api_keys (민감)" 403 \
  "$(curl -s -b "$USER_COOKIE" "$DASH_BASE/api/v1/tables/api_keys?limit=5" -w "\n__HTTP__%{http_code}")"
check "V6 USER GET /tables/_prisma_migrations" 403 \
  "$(curl -s -b "$USER_COOKIE" "$DASH_BASE/api/v1/tables/_prisma_migrations?limit=5" -w "\n__HTTP__%{http_code}")"

# V7: edge_function_runs (DELETE_ONLY) → USER 403 (운영자 전용)
check "V7 USER GET /tables/edge_function_runs" 403 \
  "$(curl -s -b "$USER_COOKIE" "$DASH_BASE/api/v1/tables/edge_function_runs?limit=5" -w "\n__HTTP__%{http_code}")"

# V8: USER 쓰기 작업은 여전히 차단 (회귀 가드)
USR_NEW_ID=$(python3 -c 'import uuid; print(uuid.uuid4())')
check "V8 USER POST /tables/folders (회귀 가드 — 여전히 403)" 403 \
  "$(curl -s -b "$USER_COOKIE" -X POST "$DASH_BASE/api/v1/tables/folders" \
    -H 'Content-Type: application/json' \
    -d "{\"values\":{\"id\":{\"action\":\"set\",\"value\":\"$USR_NEW_ID\"},\"name\":{\"action\":\"set\",\"value\":\"V8\"}}}" \
    -w "\n__HTTP__%{http_code}")"

# V9: ADMIN/MANAGER edge_function_runs SELECT → 200
check "V9 ADMIN GET /tables/edge_function_runs (운영자)" 200 \
  "$(curl -s -b "$ADMIN_COOKIE" "$DASH_BASE/api/v1/tables/edge_function_runs?limit=5" -w "\n__HTTP__%{http_code}")"

echo

# Cleanup — 테스트 계정 비활성
curl -s -b "$ADMIN_COOKIE" -X PATCH "$DASH_BASE/api/settings/users" \
  -H 'Content-Type: application/json' \
  -H "Referer: $DASH_BASE" -H "Origin: $DASH_BASE" \
  -d "{\"userId\":\"$USR_ID\",\"isActive\":false}" -o /dev/null
echo "Cleanup: USER 비활성"

echo
echo "===== VIEWER E2E 완료 ====="
