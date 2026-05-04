#!/bin/bash
# Phase 14c-γ 권한 매트릭스 E2E — ADMIN/MANAGER/USER × SELECT/INSERT/UPDATE/DELETE
# 실행: wsl -e bash -c "bash /mnt/e/00_develop/260406_luckystyle4u_server/scripts/e2e/phase-14c-gamma-curl.sh"

set +e  # 중간 실패에도 계속 진행

DASH_BASE='http://localhost:3000'
: "${ADMIN_EMAIL:?ADMIN_EMAIL env required (운영자 로그인 — export 후 재실행)}"
: "${ADMIN_PASS:?ADMIN_PASS env required (시크릿은 코드에 박지 말 것 — .env.test.local 사용)}"
: "${MANAGER_EMAIL:=gamma-manager@test.local}"
: "${MANAGER_PASS:?MANAGER_PASS env required (테스트 매니저 비밀번호 — export 후 재실행)}"
: "${USER_EMAIL:=gamma-user@test.local}"
: "${USER_PASS:?USER_PASS env required (테스트 유저 비밀번호 — export 후 재실행)}"

ADMIN_COOKIE=/tmp/dash-cookie-γ-admin.txt
MANAGER_COOKIE=/tmp/dash-cookie-γ-manager.txt
USER_COOKIE=/tmp/dash-cookie-γ-user.txt
rm -f "$ADMIN_COOKIE" "$MANAGER_COOKIE" "$USER_COOKIE"

echo "===== Phase 14c-γ 권한 매트릭스 E2E ====="
echo

# 로그인 헬퍼
login_cookie() {
  local EMAIL="$1"; local PASS="$2"; local COOKIE="$3"
  local TOKEN=$(curl -s -X POST "$DASH_BASE/api/v1/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" \
    | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("data",{}).get("accessToken","") if d.get("success") else "")')
  if [ -z "$TOKEN" ]; then
    return 1
  fi
  curl -s -c "$COOKIE" -X POST "$DASH_BASE/api/auth/login-v2" \
    -H 'Content-Type: application/json' \
    -H "Referer: $DASH_BASE" -H "Origin: $DASH_BASE" \
    -d "{\"accessToken\":\"$TOKEN\"}" -o /dev/null
  return 0
}

# ADMIN 로그인
if ! login_cookie "$ADMIN_EMAIL" "$ADMIN_PASS" "$ADMIN_COOKIE"; then
  echo "FAIL: ADMIN 로그인"; exit 1
fi
echo "OK: ADMIN 로그인"

# Seed — MANAGER/USER 계정 (이미 있으면 skip)
seed_user() {
  local EMAIL="$1"; local PASS="$2"; local ROLE="$3"
  local RES=$(curl -s -b "$ADMIN_COOKIE" -X POST "$DASH_BASE/api/settings/users" \
    -H 'Content-Type: application/json' \
    -H "Referer: $DASH_BASE" -H "Origin: $DASH_BASE" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"role\":\"$ROLE\"}" \
    -w "\n__HTTP__%{http_code}")
  local CODE=$(echo "$RES" | grep -oP '__HTTP__\K\d+')
  if [ "$CODE" = "201" ] || [ "$CODE" = "200" ]; then
    echo "SEED OK: $ROLE $EMAIL (신규 생성)"
  elif [ "$CODE" = "409" ]; then
    # 이미 존재 — 활성화 + 역할 재설정 (PATCH로 id 필요)
    local USER_ID=$(curl -s -b "$ADMIN_COOKIE" "$DASH_BASE/api/settings/users" \
      | python3 -c "import json,sys; d=json.load(sys.stdin); print(next((u['id'] for u in d.get('data',[]) if u['email']=='$EMAIL'), ''))")
    if [ -n "$USER_ID" ]; then
      curl -s -b "$ADMIN_COOKIE" -X PATCH "$DASH_BASE/api/settings/users" \
        -H 'Content-Type: application/json' \
        -H "Referer: $DASH_BASE" -H "Origin: $DASH_BASE" \
        -d "{\"userId\":\"$USER_ID\",\"role\":\"$ROLE\",\"isActive\":true}" -o /dev/null
      echo "SEED OK: $ROLE $EMAIL (재활성화 + 역할 재설정)"
    else
      echo "SEED FAIL: $ROLE $EMAIL — ID 조회 실패"
    fi
  else
    echo "SEED FAIL: $ROLE $EMAIL — HTTP $CODE ($(echo "$RES" | head -c 200))"
  fi
}
seed_user "$MANAGER_EMAIL" "$MANAGER_PASS" "MANAGER"
seed_user "$USER_EMAIL" "$USER_PASS" "USER"
echo

# 비밀번호는 변경할 수 없으므로 첫 생성 시 설정된 값이 유지됨.
# 이미 존재했던 계정이 다른 비밀번호로 등록되어 있다면 로그인 실패 가능 — 그 경우 해당 시나리오 SKIP.

# MANAGER/USER 로그인
if ! login_cookie "$MANAGER_EMAIL" "$MANAGER_PASS" "$MANAGER_COOKIE"; then
  echo "WARN: MANAGER 로그인 실패 — 이미 존재하는 계정과 비밀번호 불일치. 테스트 SKIP."
  MANAGER_LOGGED_IN=0
else
  echo "OK: MANAGER 로그인"; MANAGER_LOGGED_IN=1
fi
if ! login_cookie "$USER_EMAIL" "$USER_PASS" "$USER_COOKIE"; then
  echo "WARN: USER 로그인 실패 — 이미 존재하는 계정과 비밀번호 불일치. 테스트 SKIP."
  USER_LOGGED_IN=0
else
  echo "OK: USER 로그인"; USER_LOGGED_IN=1
fi
echo

# OWNER_ID (ADMIN sub) — seed folder에 필요
OWNER_ID=$(curl -s -b "$ADMIN_COOKIE" "$DASH_BASE/api/auth/me" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["user"]["sub"])')

# ADMIN seed folder
SEED_ID=$(python3 -c 'import uuid; print(uuid.uuid4())')
curl -s -b "$ADMIN_COOKIE" -X POST "$DASH_BASE/api/v1/tables/folders" \
  -H 'Content-Type: application/json' \
  -d "{\"values\":{\"id\":{\"action\":\"set\",\"value\":\"$SEED_ID\"},\"name\":{\"action\":\"set\",\"value\":\"γ-seed\"},\"owner_id\":{\"action\":\"set\",\"value\":\"$OWNER_ID\"},\"is_root\":{\"action\":\"set\",\"value\":false}}}" -o /dev/null
echo "OK: seed folder $SEED_ID"
echo

# --- 시나리오 함수 ---
check() {
  local NAME="$1"; local EXPECTED_CODE="$2"; local RES="$3"
  local CODE=$(echo "$RES" | grep -oP '__HTTP__\K\d+')
  if [ "$CODE" = "$EXPECTED_CODE" ]; then
    echo "PASS $NAME → $CODE"
  else
    echo "FAIL $NAME → expected $EXPECTED_CODE, got $CODE ($(echo "$RES" | grep -oP '"code":"[^"]*"' | head -1))"
  fi
}

# ADMIN 시나리오
echo "---- ADMIN ----"
check "G1 ADMIN GET /schema" 200 "$(curl -s -b "$ADMIN_COOKIE" "$DASH_BASE/api/v1/tables/folders/schema" -w "\n__HTTP__%{http_code}")"
check "G2 ADMIN GET /tables/folders" 200 "$(curl -s -b "$ADMIN_COOKIE" "$DASH_BASE/api/v1/tables/folders?limit=5" -w "\n__HTTP__%{http_code}")"
ADMIN_ID=$(python3 -c 'import uuid; print(uuid.uuid4())')
check "G3 ADMIN POST" 200 "$(curl -s -b "$ADMIN_COOKIE" -X POST "$DASH_BASE/api/v1/tables/folders" \
  -H 'Content-Type: application/json' \
  -d "{\"values\":{\"id\":{\"action\":\"set\",\"value\":\"$ADMIN_ID\"},\"name\":{\"action\":\"set\",\"value\":\"γ-ADMIN-INSERT\"},\"owner_id\":{\"action\":\"set\",\"value\":\"$OWNER_ID\"},\"is_root\":{\"action\":\"set\",\"value\":false}}}" -w "\n__HTTP__%{http_code}")"
check "G4 ADMIN PATCH" 200 "$(curl -s -b "$ADMIN_COOKIE" -X PATCH "$DASH_BASE/api/v1/tables/folders/$SEED_ID" \
  -H 'Content-Type: application/json' \
  -d '{"values":{"name":{"action":"set","value":"γ-ADMIN-UPDATE"}}}' -w "\n__HTTP__%{http_code}")"
echo

# MANAGER 시나리오
if [ "$MANAGER_LOGGED_IN" = "1" ]; then
  echo "---- MANAGER ----"
  check "G5 MANAGER GET /schema" 200 "$(curl -s -b "$MANAGER_COOKIE" "$DASH_BASE/api/v1/tables/folders/schema" -w "\n__HTTP__%{http_code}")"
  check "G6 MANAGER GET /tables/folders" 200 "$(curl -s -b "$MANAGER_COOKIE" "$DASH_BASE/api/v1/tables/folders?limit=5" -w "\n__HTTP__%{http_code}")"
  MGR_ID=$(python3 -c 'import uuid; print(uuid.uuid4())')
  check "G7 MANAGER POST" 200 "$(curl -s -b "$MANAGER_COOKIE" -X POST "$DASH_BASE/api/v1/tables/folders" \
    -H 'Content-Type: application/json' \
    -d "{\"values\":{\"id\":{\"action\":\"set\",\"value\":\"$MGR_ID\"},\"name\":{\"action\":\"set\",\"value\":\"γ-MGR-INSERT\"},\"owner_id\":{\"action\":\"set\",\"value\":\"$OWNER_ID\"},\"is_root\":{\"action\":\"set\",\"value\":false}}}" -w "\n__HTTP__%{http_code}")"
  check "G8 MANAGER PATCH" 200 "$(curl -s -b "$MANAGER_COOKIE" -X PATCH "$DASH_BASE/api/v1/tables/folders/$SEED_ID" \
    -H 'Content-Type: application/json' \
    -d '{"values":{"name":{"action":"set","value":"γ-MGR-UPDATE"}}}' -w "\n__HTTP__%{http_code}")"
  check "G9 MANAGER DELETE" 403 "$(curl -s -b "$MANAGER_COOKIE" -X DELETE "$DASH_BASE/api/v1/tables/folders/$MGR_ID" -w "\n__HTTP__%{http_code}")"
  # MANAGER가 넣은 행은 cleanup 단계에서 ADMIN이 삭제
  echo
fi

# USER 시나리오
if [ "$USER_LOGGED_IN" = "1" ]; then
  echo "---- USER ----"
  check "G10 USER GET /schema" 403 "$(curl -s -b "$USER_COOKIE" "$DASH_BASE/api/v1/tables/folders/schema" -w "\n__HTTP__%{http_code}")"
  check "G10b USER GET /tables/folders" 403 "$(curl -s -b "$USER_COOKIE" "$DASH_BASE/api/v1/tables/folders?limit=5" -w "\n__HTTP__%{http_code}")"
  USR_ID=$(python3 -c 'import uuid; print(uuid.uuid4())')
  check "G11 USER POST" 403 "$(curl -s -b "$USER_COOKIE" -X POST "$DASH_BASE/api/v1/tables/folders" \
    -H 'Content-Type: application/json' \
    -d "{\"values\":{\"id\":{\"action\":\"set\",\"value\":\"$USR_ID\"},\"name\":{\"action\":\"set\",\"value\":\"γ-USER\"},\"owner_id\":{\"action\":\"set\",\"value\":\"$OWNER_ID\"},\"is_root\":{\"action\":\"set\",\"value\":false}}}" -w "\n__HTTP__%{http_code}")"
  check "G11b USER PATCH" 403 "$(curl -s -b "$USER_COOKIE" -X PATCH "$DASH_BASE/api/v1/tables/folders/$SEED_ID" \
    -H 'Content-Type: application/json' \
    -d '{"values":{"name":{"action":"set","value":"nope"}}}' -w "\n__HTTP__%{http_code}")"
  check "G11c USER DELETE" 403 "$(curl -s -b "$USER_COOKIE" -X DELETE "$DASH_BASE/api/v1/tables/folders/$SEED_ID" -w "\n__HTTP__%{http_code}")"
  echo
fi

# Cleanup — ADMIN이 생성된 folder 행들 DELETE + 테스트 계정 isActive=false
echo "---- Cleanup ----"
curl -s -b "$ADMIN_COOKIE" -X DELETE "$DASH_BASE/api/v1/tables/folders/$SEED_ID" -o /dev/null && echo "cleanup folder: $SEED_ID"
[ -n "$ADMIN_ID" ] && curl -s -b "$ADMIN_COOKIE" -X DELETE "$DASH_BASE/api/v1/tables/folders/$ADMIN_ID" -o /dev/null && echo "cleanup folder: $ADMIN_ID"
[ -n "$MGR_ID" ] && curl -s -b "$ADMIN_COOKIE" -X DELETE "$DASH_BASE/api/v1/tables/folders/$MGR_ID" -o /dev/null && echo "cleanup folder: $MGR_ID"

# 테스트 계정 비활성
for EMAIL in "$MANAGER_EMAIL" "$USER_EMAIL"; do
  USER_ID=$(curl -s -b "$ADMIN_COOKIE" "$DASH_BASE/api/settings/users" \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print(next((u['id'] for u in d.get('data',[]) if u['email']=='$EMAIL'), ''))")
  if [ -n "$USER_ID" ]; then
    curl -s -b "$ADMIN_COOKIE" -X PATCH "$DASH_BASE/api/settings/users" \
      -H 'Content-Type: application/json' \
      -H "Referer: $DASH_BASE" -H "Origin: $DASH_BASE" \
      -d "{\"userId\":\"$USER_ID\",\"isActive\":false}" -o /dev/null
    echo "테스트 계정 비활성화: $EMAIL"
  fi
done

echo
echo "===== γ E2E 완료 ====="
