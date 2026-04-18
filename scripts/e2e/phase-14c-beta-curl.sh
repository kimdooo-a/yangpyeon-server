#!/bin/bash
# Phase 14c-β 복합 PK 지원 — E2E
# 실행: wsl -e bash -c "bash /mnt/e/00_develop/260406_luckystyle4u_server/scripts/e2e/phase-14c-beta-curl.sh"
#
# Setup: _test_composite 임시 테이블 생성 (postgres 수퍼유저 필요)
# Teardown: 스크립트 종료 시 테이블 DROP

DASH_EMAIL='kimdooo@stylelucky4u.com'
DASH_PASS='Knp13579!yan'
DASH_BASE='http://localhost:3000'
COOKIE=/tmp/dash-cookie-beta.txt
rm -f "$COOKIE"

echo "===== Phase 14c-β E2E ====="

# --- Setup: _test_composite 테이블 생성 ---
sudo -u postgres psql -d luckystyle4u <<'SQL' 2>&1 | tail -3
DROP TABLE IF EXISTS _test_composite;
CREATE TABLE _test_composite (
  tenant_id UUID NOT NULL,
  item_key TEXT NOT NULL,
  value TEXT,
  updated_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (tenant_id, item_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON _test_composite TO app_readwrite;
GRANT SELECT ON _test_composite TO app_readonly;
SQL
echo "SETUP: _test_composite 테이블 생성"
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
echo "OK: 로그인"
echo

# --- seed 1 row via INSERT (POST /tables/_test_composite) ---
TENANT_ID=$(python3 -c 'import uuid; print(uuid.uuid4())')
INSERT_RES=$(curl -s -b "$COOKIE" -X POST "$DASH_BASE/api/v1/tables/_test_composite" \
  -H 'Content-Type: application/json' \
  -d "{\"values\":{\"tenant_id\":{\"action\":\"set\",\"value\":\"$TENANT_ID\"},\"item_key\":{\"action\":\"set\",\"value\":\"k1\"},\"value\":{\"action\":\"set\",\"value\":\"initial\"}}}")
INITIAL_UPDATED_AT=$(echo "$INSERT_RES" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["data"]["row"]["updated_at"])' 2>/dev/null)
[ -z "$INITIAL_UPDATED_AT" ] && { echo "FAIL: seed INSERT — $INSERT_RES"; sudo -u postgres psql -d luckystyle4u -c "DROP TABLE _test_composite;"; exit 1; }
echo "OK: seed (tenant_id=$TENANT_ID, item_key=k1, updated_at=$INITIAL_UPDATED_AT)"
echo

# --- B1 정상 PATCH (락 일치) ---
B1=$(curl -s -b "$COOKIE" -X PATCH "$DASH_BASE/api/v1/tables/_test_composite/_composite" \
  -H 'Content-Type: application/json' \
  -d "{\"pk_values\":{\"tenant_id\":\"$TENANT_ID\",\"item_key\":\"k1\"},\"values\":{\"value\":{\"action\":\"set\",\"value\":\"B1\"}},\"expected_updated_at\":\"$INITIAL_UPDATED_AT\"}" \
  -w "\n__HTTP__%{http_code}")
if echo "$B1" | grep -q "__HTTP__200"; then
  echo "PASS B1: 정상 PATCH (락 일치) → 200"
else
  echo "FAIL B1: $B1"
fi
echo

# --- B2 CONFLICT (구 timestamp) ---
B2=$(curl -s -b "$COOKIE" -X PATCH "$DASH_BASE/api/v1/tables/_test_composite/_composite" \
  -H 'Content-Type: application/json' \
  -d "{\"pk_values\":{\"tenant_id\":\"$TENANT_ID\",\"item_key\":\"k1\"},\"values\":{\"value\":{\"action\":\"set\",\"value\":\"B2\"}},\"expected_updated_at\":\"$INITIAL_UPDATED_AT\"}" \
  -w "\n__HTTP__%{http_code}")
if echo "$B2" | grep -q "__HTTP__409" && echo "$B2" | grep -q '"code":"CONFLICT"'; then
  echo "PASS B2: CONFLICT → 409 + 코드 일치"
else
  echo "FAIL B2: $B2"
fi
echo

# --- B3 NOT_FOUND (존재하지 않는 pk_values) ---
FAKE_TENANT=$(python3 -c 'import uuid; print(uuid.uuid4())')
B3=$(curl -s -b "$COOKIE" -X PATCH "$DASH_BASE/api/v1/tables/_test_composite/_composite" \
  -H 'Content-Type: application/json' \
  -d "{\"pk_values\":{\"tenant_id\":\"$FAKE_TENANT\",\"item_key\":\"nope\"},\"values\":{\"value\":{\"action\":\"set\",\"value\":\"x\"}}}" \
  -w "\n__HTTP__%{http_code}")
if echo "$B3" | grep -q "__HTTP__404"; then
  echo "PASS B3: NOT_FOUND → 404"
else
  echo "FAIL B3: $B3"
fi
echo

# --- B4 PK_VALUES_INCOMPLETE ---
B4=$(curl -s -b "$COOKIE" -X PATCH "$DASH_BASE/api/v1/tables/_test_composite/_composite" \
  -H 'Content-Type: application/json' \
  -d "{\"pk_values\":{\"tenant_id\":\"$TENANT_ID\"},\"values\":{\"value\":{\"action\":\"set\",\"value\":\"x\"}}}" \
  -w "\n__HTTP__%{http_code}")
if echo "$B4" | grep -q "__HTTP__400" && echo "$B4" | grep -q "PK_VALUES_INCOMPLETE"; then
  echo "PASS B4: PK_VALUES_INCOMPLETE → 400"
else
  echo "FAIL B4: $B4"
fi
echo

# --- B5 UNKNOWN_PK_COLUMN ---
B5=$(curl -s -b "$COOKIE" -X PATCH "$DASH_BASE/api/v1/tables/_test_composite/_composite" \
  -H 'Content-Type: application/json' \
  -d "{\"pk_values\":{\"tenant_id\":\"$TENANT_ID\",\"item_key\":\"k1\",\"bogus\":\"x\"},\"values\":{\"value\":{\"action\":\"set\",\"value\":\"x\"}}}" \
  -w "\n__HTTP__%{http_code}")
if echo "$B5" | grep -q "__HTTP__400" && echo "$B5" | grep -q "UNKNOWN_PK_COLUMN"; then
  echo "PASS B5: UNKNOWN_PK_COLUMN → 400"
else
  echo "FAIL B5: $B5"
fi
echo

# --- B6 NOT_COMPOSITE (단일 PK 테이블에 /_composite 호출) ---
B6=$(curl -s -b "$COOKIE" -X PATCH "$DASH_BASE/api/v1/tables/folders/_composite" \
  -H 'Content-Type: application/json' \
  -d "{\"pk_values\":{\"id\":\"whatever\"},\"values\":{\"name\":{\"action\":\"set\",\"value\":\"x\"}}}" \
  -w "\n__HTTP__%{http_code}")
if echo "$B6" | grep -q "__HTTP__400" && echo "$B6" | grep -q "NOT_COMPOSITE"; then
  echo "PASS B6: NOT_COMPOSITE → 400"
else
  echo "FAIL B6: $B6"
fi
echo

# --- B7 LEGACY GUARD (복합 PK 테이블에 /[pk] 호출) ---
B7=$(curl -s -b "$COOKIE" -X PATCH "$DASH_BASE/api/v1/tables/_test_composite/dummy" \
  -H 'Content-Type: application/json' \
  -d "{\"values\":{\"value\":{\"action\":\"set\",\"value\":\"x\"}}}" \
  -w "\n__HTTP__%{http_code}")
if echo "$B7" | grep -q "__HTTP__400" && echo "$B7" | grep -q "COMPOSITE_PK_UNSUPPORTED"; then
  echo "PASS B7: LEGACY GUARD → 400 COMPOSITE_PK_UNSUPPORTED"
else
  echo "FAIL B7: $B7"
fi
echo

# --- B8 DELETE (복합 PK) ---
B8=$(curl -s -b "$COOKIE" -X DELETE "$DASH_BASE/api/v1/tables/_test_composite/_composite" \
  -H 'Content-Type: application/json' \
  -d "{\"pk_values\":{\"tenant_id\":\"$TENANT_ID\",\"item_key\":\"k1\"}}" \
  -w "\n__HTTP__%{http_code}")
if echo "$B8" | grep -q "__HTTP__200" && echo "$B8" | grep -q '"deleted":true'; then
  echo "PASS B8: DELETE → 200 deleted:true"
else
  echo "FAIL B8: $B8"
fi
echo

# --- B9 감사 로그 확인 ---
AUDIT=$(curl -s -b "$COOKIE" "$DASH_BASE/api/audit?limit=50")
UPDATE_COUNT=$(echo "$AUDIT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(sum(1 for l in d['logs'] if l.get('action')=='TABLE_ROW_UPDATE' and '_test_composite' in l.get('path','')))")
CONFLICT_COUNT=$(echo "$AUDIT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(sum(1 for l in d['logs'] if l.get('action')=='TABLE_ROW_UPDATE_CONFLICT' and '_test_composite' in l.get('path','')))")
DELETE_COUNT=$(echo "$AUDIT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(sum(1 for l in d['logs'] if l.get('action')=='TABLE_ROW_DELETE' and '_test_composite' in l.get('path','')))")
if [ "$UPDATE_COUNT" -ge 1 ] && [ "$CONFLICT_COUNT" -ge 1 ] && [ "$DELETE_COUNT" -ge 1 ]; then
  echo "PASS B9: 감사 로그 — UPDATE=$UPDATE_COUNT, CONFLICT=$CONFLICT_COUNT, DELETE=$DELETE_COUNT"
else
  echo "FAIL B9: UPDATE=$UPDATE_COUNT, CONFLICT=$CONFLICT_COUNT, DELETE=$DELETE_COUNT"
fi
echo

# --- Teardown ---
sudo -u postgres psql -d luckystyle4u -c "DROP TABLE _test_composite;" > /dev/null
echo "TEARDOWN: _test_composite 테이블 DROP"
