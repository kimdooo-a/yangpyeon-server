#!/bin/bash
# Phase 14c-α 인라인 편집 낙관적 잠금 — API E2E
# 실행: wsl -e bash -c "bash /mnt/e/00_develop/260406_luckystyle4u_server/scripts/e2e/phase-14c-alpha-curl.sh"

DASH_EMAIL='kimdooo@stylelucky4u.com'
DASH_PASS='Knp13579!yan'
DASH_BASE='http://localhost:3000'
COOKIE=/tmp/dash-cookie-alpha.txt
rm -f "$COOKIE"

echo "===== Phase 14c-α E2E ====="
echo

# --- 로그인 ---
ACCESS_TOKEN=$(curl -s -X POST "$DASH_BASE/api/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$DASH_EMAIL\",\"password\":\"$DASH_PASS\"}" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["data"]["accessToken"])')
[ -z "$ACCESS_TOKEN" ] && { echo "FAIL: v1 로그인"; exit 1; }

curl -s -c "$COOKIE" -X POST "$DASH_BASE/api/auth/login-v2" \
  -H 'Content-Type: application/json' \
  -H "Referer: $DASH_BASE" \
  -H "Origin: $DASH_BASE" \
  -d "{\"accessToken\":\"$ACCESS_TOKEN\"}" -o /dev/null

OWNER_ID=$(curl -s -b "$COOKIE" "$DASH_BASE/api/auth/me" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["user"]["sub"])')
[ -z "$OWNER_ID" ] && { echo "FAIL: me"; exit 1; }
echo "OK: 로그인 (OWNER_ID=$OWNER_ID)"
echo

# --- seed: 테스트 folder 1개 INSERT + updated_at 수집 (RETURNING *) ---
TEST_ID=$(python3 -c 'import uuid; print(uuid.uuid4())')
INSERT_RES=$(curl -s -b "$COOKIE" -X POST "$DASH_BASE/api/v1/tables/folders" \
  -H 'Content-Type: application/json' \
  -d "{\"values\":{\"id\":{\"action\":\"set\",\"value\":\"$TEST_ID\"},\"name\":{\"action\":\"set\",\"value\":\"alpha-test\"},\"owner_id\":{\"action\":\"set\",\"value\":\"$OWNER_ID\"},\"is_root\":{\"action\":\"set\",\"value\":false}}}")
INITIAL_UPDATED_AT=$(echo "$INSERT_RES" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["data"]["row"]["updated_at"])')
[ -z "$INITIAL_UPDATED_AT" ] && { echo "FAIL: seed updated_at 추출 실패 — $INSERT_RES"; exit 1; }
echo "OK: seed folder $TEST_ID (updated_at=$INITIAL_UPDATED_AT)"
echo

# --- C1: 정상 PATCH (락 일치) ---
C1=$(curl -s -b "$COOKIE" -X PATCH "$DASH_BASE/api/v1/tables/folders/$TEST_ID" \
  -H 'Content-Type: application/json' \
  -d "{\"values\":{\"name\":{\"action\":\"set\",\"value\":\"alpha-C1\"}},\"expected_updated_at\":\"$INITIAL_UPDATED_AT\"}" \
  -w "\n__HTTP__%{http_code}")
if echo "$C1" | grep -q "__HTTP__200"; then
  echo "PASS C1: 정상 PATCH (락 일치) → 200"
  NEW_UPDATED=$(echo "$C1" | python3 -c 'import json,sys,re; s=sys.stdin.read(); b=s[:s.rfind("__HTTP__")]; print(json.loads(b)["data"]["row"]["updated_at"])')
else
  echo "FAIL C1: $C1"
fi
echo

# --- C2: CONFLICT (구 timestamp) ---
C2=$(curl -s -b "$COOKIE" -X PATCH "$DASH_BASE/api/v1/tables/folders/$TEST_ID" \
  -H 'Content-Type: application/json' \
  -d "{\"values\":{\"name\":{\"action\":\"set\",\"value\":\"alpha-C2\"}},\"expected_updated_at\":\"$INITIAL_UPDATED_AT\"}" \
  -w "\n__HTTP__%{http_code}")
if echo "$C2" | grep -q "__HTTP__409"; then
  echo "PASS C2: CONFLICT → 409"
  echo "$C2" | grep -q '"code":"CONFLICT"' && echo "       에러 코드 일치" || echo "FAIL: 에러 코드"
  echo "$C2" | grep -q '"current":{' && echo "       current 필드 포함" || echo "FAIL: current 누락"
else
  echo "FAIL C2: $C2"
fi
echo

# --- C3: NOT_FOUND (없는 PK) ---
FAKE_ID=$(python3 -c 'import uuid; print(uuid.uuid4())')
C3=$(curl -s -b "$COOKIE" -X PATCH "$DASH_BASE/api/v1/tables/folders/$FAKE_ID" \
  -H 'Content-Type: application/json' \
  -d "{\"values\":{\"name\":{\"action\":\"set\",\"value\":\"x\"}},\"expected_updated_at\":\"$NEW_UPDATED\"}" \
  -w "\n__HTTP__%{http_code}")
if echo "$C3" | grep -q "__HTTP__404"; then
  echo "PASS C3: NOT_FOUND → 404"
else
  echo "FAIL C3: $C3"
fi
echo

# --- C4: LEGACY (락 미제공) ---
C4=$(curl -s -b "$COOKIE" -X PATCH "$DASH_BASE/api/v1/tables/folders/$TEST_ID" \
  -H 'Content-Type: application/json' \
  -d "{\"values\":{\"name\":{\"action\":\"set\",\"value\":\"alpha-C4\"}}}" \
  -w "\n__HTTP__%{http_code}")
if echo "$C4" | grep -q "__HTTP__200"; then
  echo "PASS C4: LEGACY(락 없음) → 200"
else
  echo "FAIL C4: $C4"
fi
echo

# --- C5: MALFORMED expected_updated_at ---
C5=$(curl -s -b "$COOKIE" -X PATCH "$DASH_BASE/api/v1/tables/folders/$TEST_ID" \
  -H 'Content-Type: application/json' \
  -d "{\"values\":{\"name\":{\"action\":\"set\",\"value\":\"x\"}},\"expected_updated_at\":\"not-iso\"}" \
  -w "\n__HTTP__%{http_code}")
if echo "$C5" | grep -q "__HTTP__400"; then
  echo "PASS C5: MALFORMED → 400"
  echo "$C5" | grep -q "INVALID_EXPECTED_UPDATED_AT" && echo "       코드 일치" || echo "FAIL: 코드"
else
  echo "FAIL C5: $C5"
fi
echo

# --- C6: 감사 로그 2종 확인 ---
AUDIT=$(curl -s -b "$COOKIE" "$DASH_BASE/api/audit?limit=30")
UPDATE_COUNT=$(echo "$AUDIT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(sum(1 for l in d['logs'] if l.get('action')=='TABLE_ROW_UPDATE'))")
CONFLICT_COUNT=$(echo "$AUDIT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(sum(1 for l in d['logs'] if l.get('action')=='TABLE_ROW_UPDATE_CONFLICT'))")
if [ "$UPDATE_COUNT" -ge 1 ] && [ "$CONFLICT_COUNT" -ge 1 ]; then
  echo "PASS C6: 감사 로그 — UPDATE=$UPDATE_COUNT, UPDATE_CONFLICT=$CONFLICT_COUNT"
else
  echo "FAIL C6: UPDATE=$UPDATE_COUNT, CONFLICT=$CONFLICT_COUNT"
fi
echo

# --- 정리 ---
curl -s -b "$COOKIE" -X DELETE "$DASH_BASE/api/v1/tables/folders/$TEST_ID" -o /dev/null
echo "cleanup: folder $TEST_ID 삭제"
