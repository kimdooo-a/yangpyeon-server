#!/usr/bin/env bash
# 세션 44 검증 스크립트
# 0-row 테이블 (webhooks/cron_jobs/log_drains) 에 신규 INSERT 후 응답 createdAt 이
# PG authoritative UTC 와 일치하는지 확증.
#
# Prisma 7 adapter-pg parsing-side +9h KST 시프트가 fetchDateFieldsText 헬퍼로 회피되었음을
# 실측 검증한다. 회귀 시 diff != 0 발견 → 즉시 실패.
#
# 사용:
#   wsl -e bash -c "source ~/.nvm/nvm.sh && /mnt/e/00_develop/260406_luckystyle4u_server/scripts/session44-verify.sh"

set -euo pipefail

BASE="${BASE:-http://localhost:3000}"
EMAIL="${EMAIL:-kimdooo@stylelucky4u.com}"
PASSWORD="${PASSWORD:-<ADMIN_PASSWORD>}"

cd "$(dirname "$0")/.."
DSN="$(node -e "console.log(process.env.DATABASE_URL || require('dotenv').config().parsed.DATABASE_URL)" | sed 's/?schema=public//')"
[ -z "$DSN" ] && { echo "DATABASE_URL 비어있음"; exit 1; }

JAR="/tmp/session44-cookies.txt"
rm -f "$JAR"

echo "=== 1) v1 로그인 ==="
LOGIN=$(curl -s -c "$JAR" -X POST "$BASE/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
TOKEN=$(echo "$LOGIN" | node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(j.data.accessToken||'');")
[ -z "$TOKEN" ] && { echo "로그인 실패: $LOGIN"; exit 1; }
echo "TOKEN length=${#TOKEN}"

assert_iso_eq_pg() {
  local label="$1"
  local table="$2"
  local id="$3"
  local resp_iso="$4"
  local pg_iso
  pg_iso=$(psql "$DSN" -At -c "SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') FROM ${table} WHERE id='${id}'")
  local resp_ms
  local pg_ms
  resp_ms=$(node -e "console.log(new Date('$resp_iso').getTime())")
  pg_ms=$(node -e "console.log(new Date('$pg_iso').getTime())")
  local diff=$((resp_ms - pg_ms))
  echo "  [${label}] resp=$resp_iso pg=$pg_iso diff_ms=$diff"
  if [ "$diff" -lt -2 ] || [ "$diff" -gt 2 ]; then
    echo "  ❌ ${label}: diff > 2ms (시프트 회귀)"
    return 1
  fi
  echo "  ✓ ${label}: UTC 일치"
}

echo
echo "=== 2) POST /api/v1/webhooks (신규 1건) ==="
WH_RESP=$(curl -s -X POST "$BASE/api/v1/webhooks" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"session44-test","sourceTable":"users","event":"INSERT","url":"https://example.com/hook"}')
WH_ID=$(echo "$WH_RESP" | node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(j.data?.id||'');")
WH_CREATED=$(echo "$WH_RESP" | node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(j.data?.createdAt||'');")
[ -z "$WH_ID" ] && { echo "webhook 생성 실패: $WH_RESP"; exit 1; }
echo "  id=$WH_ID createdAt=$WH_CREATED"
assert_iso_eq_pg "webhook POST" "webhooks" "$WH_ID" "$WH_CREATED"

echo
echo "=== 3) GET /api/v1/webhooks/{id} (단건 조회) ==="
WH_GET=$(curl -s "$BASE/api/v1/webhooks/$WH_ID" -H "Authorization: Bearer $TOKEN")
WH_GET_CREATED=$(echo "$WH_GET" | node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(j.data?.createdAt||'');")
echo "  createdAt=$WH_GET_CREATED"
assert_iso_eq_pg "webhook GET single" "webhooks" "$WH_ID" "$WH_GET_CREATED"

echo
echo "=== 4) GET /api/v1/webhooks (목록) ==="
WH_LIST=$(curl -s "$BASE/api/v1/webhooks" -H "Authorization: Bearer $TOKEN")
WH_LIST_CREATED=$(echo "$WH_LIST" | node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8'));const f=j.data.find(x=>x.id==='$WH_ID');console.log(f?.createdAt||'');")
echo "  createdAt=$WH_LIST_CREATED"
assert_iso_eq_pg "webhook GET list" "webhooks" "$WH_ID" "$WH_LIST_CREATED"

echo
echo "=== 5) DELETE 정리 ==="
DEL_RESP=$(curl -s -X DELETE "$BASE/api/v1/webhooks/$WH_ID" -H "Authorization: Bearer $TOKEN")
echo "  $DEL_RESP"

echo
echo "=== 6) POST /api/v1/cron ==="
CRON_RESP=$(curl -s -X POST "$BASE/api/v1/cron" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"session44-cron","schedule":"* * * * *","kind":"SQL","payload":{},"enabled":false}')
CRON_ID=$(echo "$CRON_RESP" | node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(j.data?.id||'');")
CRON_CREATED=$(echo "$CRON_RESP" | node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(j.data?.createdAt||'');")
[ -z "$CRON_ID" ] && { echo "cron 생성 실패: $CRON_RESP"; exit 1; }
echo "  id=$CRON_ID createdAt=$CRON_CREATED"
assert_iso_eq_pg "cron POST" "cron_jobs" "$CRON_ID" "$CRON_CREATED"

echo
echo "=== 7) DELETE 정리 ==="
DEL2=$(curl -s -X DELETE "$BASE/api/v1/cron/$CRON_ID" -H "Authorization: Bearer $TOKEN")
echo "  $DEL2"

echo
echo "=== 8) POST /api/v1/log-drains ==="
LD_RESP=$(curl -s -X POST "$BASE/api/v1/log-drains" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"session44-drain","type":"HTTP","url":"https://example.com/log","filters":{},"enabled":false}')
LD_ID=$(echo "$LD_RESP" | node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(j.data?.id||'');")
LD_CREATED=$(echo "$LD_RESP" | node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(j.data?.createdAt||'');")
[ -z "$LD_ID" ] && { echo "log-drain 생성 실패: $LD_RESP"; exit 1; }
echo "  id=$LD_ID createdAt=$LD_CREATED"
assert_iso_eq_pg "log-drain POST" "log_drains" "$LD_ID" "$LD_CREATED"

echo
echo "=== 9) DELETE 정리 ==="
DEL3=$(curl -s -X DELETE "$BASE/api/v1/log-drains/$LD_ID" -H "Authorization: Bearer $TOKEN")
echo "  $DEL3"

echo
echo "=== ✅ 세션 44 검증 완료: 모든 응답 createdAt === PG UTC 일치 ==="
