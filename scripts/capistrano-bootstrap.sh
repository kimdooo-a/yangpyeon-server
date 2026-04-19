#!/bin/bash
# 1회성 flat -> Capistrano 구조 전환 스크립트
# 전제: PM2 dashboard 가 현재 ~/dashboard 에서 online.
# 호출: wsl -e bash -c "source ~/.nvm/nvm.sh && /mnt/e/00_develop/260406_luckystyle4u_server/scripts/capistrano-bootstrap.sh"
set -euo pipefail

WSL_DEPLOY="$HOME/dashboard"
TS="$(date +%Y%m%d-%H%M%S)"
INITIAL="$WSL_DEPLOY/releases/initial-$TS"
SHARED="$WSL_DEPLOY/shared"
CURRENT="$WSL_DEPLOY/current"
PM2_NAME="dashboard"

log() { echo "[bootstrap $(date +%H:%M:%S)] $*"; }

# 안전 가드: 이미 전환된 경우 종료
if [[ -L "$CURRENT" ]]; then
  log "ABORT: $CURRENT already a symlink (already bootstrapped)"
  exit 1
fi

# 1. releases / shared 생성
log "1. mkdir releases/ shared/"
mkdir -p "$INITIAL" "$SHARED/data"

# 2. 코드 복사 (data, node_modules, releases, shared, current 제외 — data 는 별도 이동)
log "2. rsync code -> $INITIAL"
rsync -a \
  --exclude='releases' --exclude='shared' --exclude='current' \
  --exclude='data' --exclude='node_modules' --exclude='.next' \
  --exclude='backups' --exclude='spikes' --exclude='.git' \
  "$WSL_DEPLOY/" "$INITIAL/"

# 3. PM2 stop (다운타임 시작)
log "3. pm2 stop $PM2_NAME (downtime BEGINS)"
pm2 stop "$PM2_NAME"

# 4. data/.env.production 이동
log "4. move data/ -> shared/data/ and .env.production -> shared/"
if [[ -d "$WSL_DEPLOY/data" ]]; then
  shopt -s dotglob nullglob
  mv "$WSL_DEPLOY/data"/* "$SHARED/data/" 2>/dev/null || true
  rmdir "$WSL_DEPLOY/data" 2>/dev/null || true
fi
if [[ -f "$WSL_DEPLOY/.env.production" ]]; then
  mv "$WSL_DEPLOY/.env.production" "$SHARED/.env.production"
fi

# 5. release 내 shared symlink
log "5. symlink shared -> release"
ln -s "$SHARED/data" "$INITIAL/data"
ln -s "$SHARED/.env.production" "$INITIAL/.env.production"

# 6. 새 release 독립 빌드
log "6. npm ci + prisma generate + npm run build in $INITIAL"
cd "$INITIAL"
npm ci
npx prisma generate
npm run build

# 7. 기존 flat 코드 삭제 (releases/shared/current 만 보존)
log "7. remove old flat files"
shopt -s dotglob nullglob
for f in "$WSL_DEPLOY"/*; do
  name="$(basename "$f")"
  case "$name" in
    releases|shared|current) continue ;;
    *) rm -rf "$f" ;;
  esac
done

# 8. current symlink
log "8. ln -sfn $INITIAL current"
ln -sfn "$INITIAL" "$CURRENT"

# 9. PM2 재등록 (cwd=current)
log "9. pm2 delete + start with cwd=current"
pm2 delete "$PM2_NAME"
cd "$CURRENT"
pm2 start npm --name "$PM2_NAME" -- start
pm2 save

# 10. 헬스체크 (3 retry)
for i in 1 2 3; do
  sleep $((i * 2))
  CODE="$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000 || echo 000)"
  log "10. health attempt $i -> HTTP $CODE"
  if [[ "$CODE" == "200" || "$CODE" == "307" ]]; then
    log "DONE. downtime ENDED. current -> $INITIAL"
    exit 0
  fi
done

log "FATAL: health failed after bootstrap"
exit 1
