#!/usr/bin/env bash
# Phase 16a Vault — 회귀 가드 스크립트
# 참조: docs/superpowers/plans/2026-04-19-phase-16-plan.md §Task 48-6
#
# 드리프트 방지 3원칙 ③ — 각 sub-phase 에 curl 회귀 가드 1개 필수.
# 목표: Vault 기반 MFA_MASTER_KEY 로딩 후 로그인 + MFA status 조회가
#       기존(env 평문) 방식과 동일하게 성공함을 확증.
#
# 사용:
#   wsl -e bash -c "source ~/.nvm/nvm.sh && /mnt/e/00_develop/260406_luckystyle4u_server/scripts/phase16-vault-verify.sh"
#   또는
#   BASE=http://localhost:3000 ./scripts/phase16-vault-verify.sh
#
# 실행 전제: migrate-env-to-vault.ts 1회 실행 + PM2 restart 완료.
# 의존: node (accessToken 추출용). WSL nvm 환경 전제.

set -euo pipefail

BASE="${BASE:-https://stylelucky4u.com}"
EMAIL="${EMAIL:-kimdooo@stylelucky4u.com}"
PASSWORD="${PASSWORD:-Knp13579!yan}"

echo "=== Phase 16 Vault Verify ($BASE) ==="

echo "--- 1) 로그인 + accessToken 추출 ---"
LOGIN=$(curl -s -X POST "$BASE/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
TOKEN=$(echo "$LOGIN" | node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(j.data && j.data.accessToken || '')")
if [ -z "$TOKEN" ]; then
  echo '{"test":"login","pass":false,"response":'"$LOGIN"'}'
  exit 1
fi
echo "{\"test\":\"login\",\"pass\":true,\"accessToken_len\":${#TOKEN}}"

echo "--- 2) MFA status 조회 (Bearer) ---"
STATUS=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/auth/mfa/status")
# 성공 응답 예: {"success":true,"data":{"totp":{...},"passkeys":[...],"recoveryCodesRemaining":N}}
OK=$(echo "$STATUS" | node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(j.success===true && !!j.data && typeof j.data.totp === 'object')")
if [ "$OK" != "true" ]; then
  echo '{"test":"mfa_status","pass":false,"response":'"$STATUS"'}'
  exit 1
fi
echo '{"test":"mfa_status","pass":true,"response":'"$STATUS"'}'

echo "=== PASS ==="
