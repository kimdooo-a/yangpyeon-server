#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# WSL 빌드 + 배포 — Linux 네이티브 모듈 정합성 보장 (L2 메인 경로)
#
# 배경:
#   Windows 에서 next build 시 NFT(Node File Trace) 가 standalone 산출물의
#   .next/node_modules/<pkg>-<hash>/ 안에 Windows .node 바이너리를 끼워 넣어,
#   Linux 런타임에서 dlopen 시 invalid ELF header 로 크래시한다.
#   빌드 자체를 WSL(Linux) 에서 수행하면 NFT 가 처음부터 Linux 바이너리만
#   트레이스하므로 문제가 원천 차단된다.
#
# 호출 (WSL bash 내부):
#   bash /mnt/e/00_develop/260406_luckystyle4u_server/scripts/wsl-build-deploy.sh
#
# 디렉토리 레이아웃:
#   /mnt/e/00_develop/260406_luckystyle4u_server/  ← Windows 워킹트리 (소스 원본)
#   ~/dev/ypserver-build/                          ← WSL 네이티브 빌드 워크트리 (ext4)
#   ~/ypserver/                                    ← 배포 대상, PM2 가 실행 중
#
# 보존되는 파일 (배포 시 절대 덮어쓰지 않음):
#   .env, data/, logs/
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_WIN_PATH="/mnt/e/00_develop/260406_luckystyle4u_server"
WSL_BUILD_DIR="$HOME/dev/ypserver-build"
DEPLOY_DIR="$HOME/ypserver"
APP_NAME="ypserver"

# nvm 환경 로드 (PM2/node 경로 확보)
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "[ERROR] 이 스크립트는 WSL/Linux 에서만 실행됩니다. (현재: $(uname -s))" >&2
  exit 1
fi

if [[ ! -d "$REPO_WIN_PATH" ]]; then
  echo "[ERROR] 소스 경로가 존재하지 않습니다: $REPO_WIN_PATH" >&2
  exit 1
fi

mkdir -p "$WSL_BUILD_DIR"

echo "[1/8] Windows 워킹트리 → WSL 네이티브 빌드 디렉토리 동기화"
# /mnt/e (NTFS) → ~/dev (ext4): npm install/빌드 I/O 가속을 위해 소스만 복사
rsync -a --delete \
  --exclude 'node_modules/' \
  --exclude '.next/' \
  --exclude 'standalone/.next/' \
  --exclude 'standalone/node_modules/' \
  --exclude '.git/' \
  --exclude 'data/' \
  --exclude 'logs/' \
  --exclude '.playwright-mcp/' \
  --exclude '.turbo/' \
  --exclude 'tsconfig.tsbuildinfo' \
  --exclude '*.log' \
  "$REPO_WIN_PATH/" "$WSL_BUILD_DIR/"

cd "$WSL_BUILD_DIR"

echo "[2/8] 의존성 설치"
if [[ -f package-lock.json ]]; then
  # CI 모드: lockfile 엄격 (재현성 우선). 실패 시 install fallback.
  npm ci || {
    echo "[WARN] npm ci 실패 — npm install 로 폴백"
    npm install
  }
else
  npm install
fi

echo "[3/8] Next.js 프로덕션 빌드 (next build)"
npm run build

echo "[4/8] standalone 패키징 (scripts/pack-standalone.sh)"
bash scripts/pack-standalone.sh

# 사후 검증: 패키지 .node 가 ELF 인지 확인
echo ""
echo "  검증: 패키지의 better_sqlite3.node 플랫폼"
for f in "$WSL_BUILD_DIR/standalone/.next/node_modules/"better-sqlite3-*/build/Release/better_sqlite3.node; do
  [[ -f "$f" ]] || continue
  if file "$f" | grep -qi "ELF.*Linux\|ELF.*GNU"; then
    echo "  ✓ ELF Linux: $f"
  else
    echo "  ✗ 비-ELF (위험): $(file "$f")"
    echo "[FATAL] standalone 산출물에 Linux 가 아닌 .node 가 포함되어 있습니다." >&2
    exit 2
  fi
done

echo ""
echo "[5/8] 배포 디렉토리 동기화 ($DEPLOY_DIR) — .env / data / logs 보존"
mkdir -p "$DEPLOY_DIR"
# exclude 는 반드시 leading `/` 로 앵커링.
#   `data/` (no anchor) 는 경로 어느 깊이의 동명 디렉토리도 보호해
#   src/app/api/v1/data/ 같은 코드 경로까지 잔재로 남긴다 — 세션 50 디버깅에서 확인된 함정.
rsync -a --delete \
  --exclude '/.env' \
  --exclude '/data/' \
  --exclude '/logs/' \
  "$WSL_BUILD_DIR/standalone/" "$DEPLOY_DIR/"

# 자가치유 안전망 (멱등) — Linux 빌드라 사실상 no-op
echo "  ↳ install-native-linux.sh (L1 안전망, 멱등)"
cd "$DEPLOY_DIR"
bash install-native-linux.sh

echo ""
echo "[6/8] Drizzle 마이그레이션 적용 (운영 DB) — ADR-021 빌드타임 게이트"
# build dir 의 better-sqlite3 (Linux .node) + 마이그레이션 SQL 사용 → deploy DB 에 적용.
SQLITE_DB_PATH="$DEPLOY_DIR/data/dashboard.db" \
DRIZZLE_MIGRATIONS_DIR="$WSL_BUILD_DIR/src/lib/db/migrations" \
  node "$WSL_BUILD_DIR/scripts/run-migrations.cjs"

echo ""
echo "[7/8] 스키마 검증 — 필수 테이블 존재 보장 (실패 시 PM2 reload 차단)"
SQLITE_DB_PATH="$DEPLOY_DIR/data/dashboard.db" \
  node "$WSL_BUILD_DIR/scripts/verify-schema.cjs"

echo ""
echo "[8/8] PM2 재시작"
if command -v pm2 >/dev/null 2>&1; then
  if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
    pm2 restart "$APP_NAME" --update-env
  else
    pm2 start ecosystem.config.cjs
  fi
  pm2 save >/dev/null 2>&1 || true
  sleep 2
  pm2 list | sed -n '1,4p;/'"$APP_NAME"'/p'
else
  echo "  ⚠️  pm2 명령을 찾을 수 없습니다 — 수동으로 'pm2 start ecosystem.config.cjs' 실행" >&2
fi

echo ""
echo "[검증] 배포된 better_sqlite3.node 플랫폼"
for f in "$DEPLOY_DIR/.next/node_modules/"better-sqlite3-*/build/Release/better_sqlite3.node \
         "$DEPLOY_DIR/node_modules/better-sqlite3/build/Release/better_sqlite3.node"; do
  [[ -f "$f" ]] && file "$f"
done

echo ""
echo "✅ WSL 빌드 + 배포 완료 — 'pm2 logs $APP_NAME --lines 30' 로 부팅 확인"
