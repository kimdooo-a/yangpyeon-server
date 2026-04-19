#!/bin/bash
# Capistrano 구조 post-bootstrap 검증
set -euo pipefail

WSL_DEPLOY="$HOME/dashboard"
FAIL=0
assert_dir()  { [[ -d "$1" ]] || { echo "FAIL: dir missing: $1"; FAIL=1; }; }
assert_link() { [[ -L "$1" ]] || { echo "FAIL: symlink missing: $1"; FAIL=1; }; }
assert_file() { [[ -f "$1" ]] || { echo "FAIL: file missing: $1"; FAIL=1; }; }

# 1. 구조
assert_dir  "$WSL_DEPLOY/releases"
assert_dir  "$WSL_DEPLOY/shared"
assert_dir  "$WSL_DEPLOY/shared/data"
assert_file "$WSL_DEPLOY/shared/.env.production"
assert_link "$WSL_DEPLOY/current"

# 2. current 가 실제 release 를 가리키는지
TARGET="$(readlink "$WSL_DEPLOY/current" 2>/dev/null || echo "")"
[[ -d "$TARGET" ]] || { echo "FAIL: current target not a dir: $TARGET"; FAIL=1; }

# 3. release 내 shared symlink
REL_NAME="$(basename "$TARGET")"
REL="$WSL_DEPLOY/releases/$REL_NAME"
assert_link "$REL/data"
assert_link "$REL/.env.production"

# 4. PM2 dashboard cwd == current
source ~/.nvm/nvm.sh 2>/dev/null || true
CWD="$(pm2 describe dashboard 2>/dev/null | awk '/exec cwd/ {print $NF}' | head -1)"
[[ "$CWD" == "$WSL_DEPLOY/current" ]] || { echo "FAIL: pm2 cwd=$CWD expected=$WSL_DEPLOY/current"; FAIL=1; }

# 5. HTTP
CODE="$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000 || echo 000)"
[[ "$CODE" == "200" || "$CODE" == "307" ]] || { echo "FAIL: http=$CODE"; FAIL=1; }

if [[ $FAIL -eq 0 ]]; then
  echo '{"test":"capistrano_bootstrap","pass":true}'
else
  echo '{"test":"capistrano_bootstrap","pass":false}'; exit 1
fi
