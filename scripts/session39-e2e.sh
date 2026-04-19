#!/usr/bin/env bash
# 세션 39 E2E — SESSION_EXPIRE per-row audit + 관리자 forced revoke 검증.
# 전제: ~/dashboard 에서 실행. dashboard PM2 online. kimdooo admin 계정 존재.

set -u
cd ~/dashboard
source ~/.nvm/nvm.sh

BASE=http://localhost:3000
ORIGIN="-H Origin:http://localhost:3000 -H Referer:http://localhost:3000/login"
EMAIL=kimdooo@stylelucky4u.com
PASS='<ADMIN_PASSWORD>'
COOKIES_A=/tmp/session39-ck-A.txt
COOKIES_B=/tmp/session39-ck-B.txt
HELPER=/mnt/e/00_develop/260406_luckystyle4u_server/scripts/session39-helper.cjs

rm -f $COOKIES_A $COOKIES_B

echo "=== [S1] 관리자 id 조회 ==="
ADMIN_ID=$(node $HELPER get-admin-id "$EMAIL")
echo "  adminId=$ADMIN_ID"

echo
echo "=== [S2] 로그인 #1 (cookieA) + #2 (cookieB) ==="
curl -sS -c $COOKIES_A -H "Content-Type: application/json" -H "Origin: $BASE" -H "Referer: $BASE/login" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" $BASE/api/auth/login -o /tmp/login-A.json
echo "  login #1 resp:"; cat /tmp/login-A.json | head -c 180; echo
curl -sS -c $COOKIES_B -H "Content-Type: application/json" -H "Origin: $BASE" -H "Referer: $BASE/login" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" $BASE/api/auth/login -o /tmp/login-B.json
echo "  login #2 resp:"; cat /tmp/login-B.json | head -c 180; echo

echo
echo "=== [S3] 활성 세션 count (최소 2 기대) ==="
node $HELPER count-active-sessions "$ADMIN_ID"

echo
echo "=== [S4] DELETE /api/admin/users/:id/sessions — cookieA 주체로 admin 자신 대상 revoke ==="
REVOKE=$(curl -sS -X DELETE -b $COOKIES_A -H "Origin: $BASE" -H "Referer: $BASE/account/security" \
  $BASE/api/admin/users/$ADMIN_ID/sessions)
echo "  resp: $REVOKE"

echo
echo "=== [S5] 활성 세션 count (0 기대 — 전부 revoked) ==="
node $HELPER count-active-sessions "$ADMIN_ID"

echo
echo "=== [S6] cookieB /api/v1/auth/refresh — admin revoked 이므로 reason='admin' 분기로 조용히 401 기대 ==="
REFRESH_B=$(curl -sS -X POST -b $COOKIES_B $BASE/api/v1/auth/refresh)
echo "  resp: $REFRESH_B"

echo
echo "=== [S7] audit_logs SESSION_ADMIN_REVOKE_ALL + SESSION_REFRESH_REJECTED 최근 5건 ==="
node -e "const d=require('better-sqlite3')('data/dashboard.db',{readonly:true}); const r=d.prepare(\"SELECT id,action,substr(detail,1,200) AS detail FROM audit_logs WHERE action IN ('SESSION_ADMIN_REVOKE_ALL','SESSION_REFRESH_REJECTED','SESSION_REVOKE') ORDER BY id DESC LIMIT 5\").all(); console.log(JSON.stringify(r,null,2));"

echo
echo "=== [S8] SESSION_EXPIRE 검증 준비 — admin 재로그인 ==="
rm -f $COOKIES_A
curl -sS -c $COOKIES_A -H "Content-Type: application/json" -H "Origin: $BASE" -H "Referer: $BASE/login" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" $BASE/api/auth/login -o /tmp/login-A2.json
cat /tmp/login-A2.json | head -c 100; echo

echo
echo "=== [S9] 만료 세션 2건 직접 INSERT (1일+1시간 전) ==="
node $HELPER insert-expired "$ADMIN_ID"

echo
echo "=== [S10] 수동 cleanup 트리거 /api/admin/cleanup/run ==="
CLEANUP=$(curl -sS -X POST -b $COOKIES_A -H "Origin: $BASE" -H "Referer: $BASE/settings/cleanup" \
  $BASE/api/admin/cleanup/run)
echo "  resp: $CLEANUP"

echo
echo "=== [S11] SESSION_EXPIRE audit 검증 (최근 5건) ==="
node -e "const d=require('better-sqlite3')('data/dashboard.db',{readonly:true}); const r=d.prepare(\"SELECT id,action,substr(detail,1,200) AS detail FROM audit_logs WHERE action='SESSION_EXPIRE' ORDER BY id DESC LIMIT 5\").all(); console.log('SESSION_EXPIRE count:',r.length); console.log(JSON.stringify(r,null,2));"

echo
echo "=== [S12] CLEANUP_EXECUTED_MANUAL 최신 1건 — summary.sessions 가 2 이상 기대 ==="
node -e "const d=require('better-sqlite3')('data/dashboard.db',{readonly:true}); const r=d.prepare(\"SELECT id,action,substr(detail,1,300) AS detail FROM audit_logs WHERE action LIKE 'CLEANUP%' ORDER BY id DESC LIMIT 1\").all(); console.log(JSON.stringify(r,null,2));"

echo
echo "=== DONE ==="
