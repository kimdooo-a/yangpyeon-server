#!/usr/bin/env bash
# 세션 43 — P2 Date 직렬화 수정 효과 E2E 검증 + P3 재현 확인
set -e
URL="http://localhost:3000"
source ~/dashboard/.env
: "${EMAIL:?EMAIL env required (admin login email — export 후 재실행)}"
: "${PASSWORD:?PASSWORD env required (시크릿은 코드에 박지 말 것)}"
# strip ?schema=public for psql
DB_URL_CLEAN=$(echo "$DATABASE_URL" | sed 's/?schema=public//')

echo "=== 1) login ==="
curl -sS -X POST "$URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
  -D /tmp/h.txt -o /tmp/b.json -w "HTTP=%{http_code}\n"

ACCESS=$(python3 - <<'PY'
import json
with open("/tmp/b.json") as f:
    d = json.load(f)
print(d["data"]["accessToken"])
PY
)
grep -i "set-cookie" /tmp/h.txt
grep -iE "^Date:" /tmp/h.txt

echo
echo "=== 2) GET /api/v1/auth/me ==="
curl -sS "$URL/api/v1/auth/me" -H "Authorization: Bearer $ACCESS" | python3 -m json.tool

echo
echo "=== 3) GET /api/v1/members?page=1&limit=5 ==="
curl -sS "$URL/api/v1/members?page=1&limit=5" -H "Authorization: Bearer $ACCESS" | python3 -m json.tool

echo
echo "=== 4) GET /api/v1/members/<my-id> ==="
MY_ID="c0c0b305-3b21-4ffa-b57a-5219f979b108"
curl -sS "$URL/api/v1/members/$MY_ID" -H "Authorization: Bearer $ACCESS" | python3 -m json.tool

echo
echo "=== 5) GET /api/settings/users (dashboard cookie 경로) ==="
curl -sS -X POST "$URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
  -c /tmp/dc.jar -o /tmp/dc_body.json -w "dashboard login HTTP=%{http_code}\n"
curl -sS "$URL/api/settings/users" -b /tmp/dc.jar | python3 -m json.tool

echo
echo "=== 6) PG authoritative (UTC ISO) ==="
psql "$DB_URL_CLEAN" -At -c "
  SELECT
    email,
    to_char(created_at    AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MSZ')     AS created_utc_iso,
    to_char(last_login_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MSZ')     AS last_login_utc_iso,
    to_char(updated_at    AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MSZ')     AS updated_utc_iso
  FROM users
  WHERE email='$EMAIL';
"
